/**
 * The public read surface. No authentication required — reads are public, and
 * a login wall here would kill every shared WhatsApp link (spec FEED-01).
 */
import { Router } from 'express';
import { z } from 'zod';
import { experienceService } from '../services/experienceService.js';
import { publicCache } from '../middleware/cache.js';
import { parseOrThrow } from '../lib/validation.js';
import { ok } from '../lib/response.js';
import { OUTCOMES, DRIVE_TYPES } from '../models/enums.js';

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
