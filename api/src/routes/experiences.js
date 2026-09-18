/**
 * The public read surface. No authentication required — reads are public, and
 * a login wall here would kill every shared WhatsApp link (spec FEED-01).
 */
import { Router } from 'express';
import { z } from 'zod';
import { experienceService } from '../services/experienceService.js';
import { submissionService } from '../services/submissionService.js';
import { interactionService } from '../services/interactionService.js';
import { publicCache, noStore } from '../middleware/cache.js';
import { requireAuth } from '../middleware/auth.js';
import { submitLimiter, editLimiter, reportLimiter, interactionLimiter } from '../middleware/rateLimit.js';
import { parseOrThrow } from '../lib/validation.js';
import { ok, created, noContent } from '../lib/response.js';
import { OUTCOMES, DRIVE_TYPES, REPORT_REASONS } from '../models/enums.js';

export const experiencesRouter = Router();

/**
 * Query parameters, whitelisted.
 *
 * `.optional()` everywhere and unknown keys dropped: a client cannot inject
 * `?status=removed` to read moderated content, because `status` is not in this
 * schema and the service always filters on 'published'.
 */
const feedQuerySchema = z.object({
  company: z.string().trim().toLowerCase().max(80).optional(),
  role: z.string().trim().max(80).optional(),
  outcome: z.enum(OUTCOMES).optional(),
  driveType: z.enum(DRIVE_TYPES).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  q: z.string().trim().min(2).max(120).optional(),
  cursor: z.string().max(400).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

experiencesRouter.get('/', publicCache(), async (req, res, next) => {
  try {
    const q = parseOrThrow(feedQuerySchema, req.query, 'Check the search filters.');

    const result = await experienceService.getFeed({
      companySlug: q.company,
      role: q.role,
      outcome: q.outcome,
      driveType: q.driveType,
      interviewYear: q.year,
      search: q.q,
      cursor: q.cursor,
      limit: q.limit,
    });

    return ok(res, result.experiences, { page: result.page });
  } catch (err) {
    return next(err);
  }
});

// Longer TTL: the counter moves a few times a week, so a minute of staleness
// is invisible and five minutes of it saves the database an aggregation.
experiencesRouter.get('/stats', publicCache({ sMaxAge: 300 }), async (req, res, next) => {
  try {
    return ok(res, await experienceService.getStats());
  } catch (err) {
    return next(err);
  }
});

/**
 * Mounted BEFORE /:id — otherwise "mine" is parsed as an experience id, the
 * ObjectId check fails, and the author's own page 404s. Route order is
 * program order in Express, and a literal segment must always precede the
 * parameter that could swallow it.
 */
experiencesRouter.get('/mine', async (req, res, next) => {
  try {
    if (!req.user) return ok(res, []);
    return ok(res, await experienceService.getMine(req.user._id));
  } catch (err) {
    return next(err);
  }
});

experiencesRouter.get('/:id', publicCache(), async (req, res, next) => {
  try {
    return ok(res, await experienceService.getOne(req.params.id, req.user));
  } catch (err) {
    return next(err);
  }
});

// =============================================================================
// Block 4 — writes. Everything below requires a session, and identity always
// comes from that session rather than from the request body.
// =============================================================================

const roundSchema = z.object({
  name: z.string().trim().min(1).max(120),
  // The form sends one question per line; splitting happens on the client, so
  // the API takes the structured shape and stays independent of that UI.
  questions: z
    .array(z.object({ text: z.string().trim().min(1).max(2000), topic: z.string().trim().max(60).optional() }))
    .max(40)
    .default([]),
  tips: z.string().trim().max(4000).optional(),
});

const submitSchema = z.object({
  company: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(80),
  driveType: z.enum(DRIVE_TYPES),
  interviewYear: z.coerce.number().int().min(2000).max(2100),
  outcome: z.enum(OUTCOMES),
  rounds: z.array(roundSchema).max(15).default([]),
  isAnonymous: z.boolean().default(false),
});

/**
 * Note what this schema does NOT accept: studentName, submittedBy,
 * authorBatch, authorBranch, status, source, consentedAt, upvoteCount. Unknown
 * keys are dropped by zod, so sending them has no effect at all. Spec SUB-05.
 */
experiencesRouter.post('/', noStore, requireAuth, submitLimiter, async (req, res, next) => {
  try {
    const input = parseOrThrow(submitSchema, req.body ?? {});
    const experience = await submissionService.submit(input, req.user);

    req.log.info({ experienceId: experience._id.toString(), company: experience.companySlug }, 'experience submitted');

    return created(res, await experienceService.getOne(experience._id.toString(), req.user));
  } catch (err) {
    return next(err);
  }
});

const editSchema = submitSchema.partial();

experiencesRouter.patch('/:id', noStore, requireAuth, editLimiter, async (req, res, next) => {
  try {
    const input = parseOrThrow(editSchema, req.body ?? {});
    const experience = await submissionService.edit(req.params.id, input, req.user);
    return ok(res, await experienceService.getOne(experience._id.toString(), req.user));
  } catch (err) {
    return next(err);
  }
});

/** Retraction. No body, no reason, no approval — that is the promise. */
experiencesRouter.post('/:id/unpublish', noStore, requireAuth, async (req, res, next) => {
  try {
    const experience = await submissionService.unpublish(req.params.id, req.user);
    req.log.info({ experienceId: req.params.id }, 'experience retracted by its author');
    return ok(res, { id: experience._id.toString(), status: experience.status });
  } catch (err) {
    return next(err);
  }
});

experiencesRouter.post('/:id/publish', noStore, requireAuth, async (req, res, next) => {
  try {
    const experience = await submissionService.republish(req.params.id, req.user);
    return ok(res, { id: experience._id.toString(), status: experience.status });
  } catch (err) {
    return next(err);
  }
});

const reportSchema = z.object({
  reason: z.enum(REPORT_REASONS),
  note: z.string().trim().max(1000).optional(),
});

experiencesRouter.post('/:id/report', noStore, requireAuth, reportLimiter, async (req, res, next) => {
  try {
    const input = parseOrThrow(reportSchema, req.body ?? {});
    const report = await submissionService.report(req.params.id, req.user, input);

    req.log.warn({ experienceId: req.params.id, reason: input.reason }, 'experience reported');

    return created(res, { id: report._id.toString(), status: report.status });
  } catch (err) {
    return next(err);
  }
});

// =============================================================================
// Phase 2 — upvotes, bookmarks, and author deletion.
// =============================================================================

/**
 * Upvote. Idempotent: pressing it twice leaves the count at 1, enforced by a
 * unique index rather than by checking first (see interactionService).
 */
experiencesRouter.post('/:id/upvote', noStore, requireAuth, interactionLimiter, async (req, res, next) => {
  try {
    return ok(res, await interactionService.upvote(req.params.id, req.user._id));
  } catch (err) {
    return next(err);
  }
});

experiencesRouter.delete('/:id/upvote', noStore, requireAuth, interactionLimiter, async (req, res, next) => {
  try {
    return ok(res, await interactionService.removeUpvote(req.params.id, req.user._id));
  } catch (err) {
    return next(err);
  }
});

experiencesRouter.post('/:id/bookmark', noStore, requireAuth, interactionLimiter, async (req, res, next) => {
  try {
    return ok(res, await interactionService.bookmark(req.params.id, req.user._id));
  } catch (err) {
    return next(err);
  }
});

experiencesRouter.delete('/:id/bookmark', noStore, requireAuth, interactionLimiter, async (req, res, next) => {
  try {
    return ok(res, await interactionService.removeBookmark(req.params.id, req.user._id));
  } catch (err) {
    return next(err);
  }
});

/**
 * Permanent deletion by the author. Irreversible, so the UI confirms first and
 * offers unpublish as the softer alternative.
 */
experiencesRouter.delete('/:id', noStore, requireAuth, editLimiter, async (req, res, next) => {
  try {
    await submissionService.destroy(req.params.id, req.user);
    req.log.warn({ experienceId: req.params.id }, 'experience deleted by its author');
    return noContent(res);
  } catch (err) {
    return next(err);
  }
});
