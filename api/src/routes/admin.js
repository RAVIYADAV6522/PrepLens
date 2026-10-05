/**
 * Moderation. Every route behind requireAdmin, every action audited.
 */
import { Router } from 'express';
import { z } from 'zod';
import { moderationService } from '../services/submissionService.js';
import { experienceService } from '../services/experienceService.js';
import { requireAdmin } from '../middleware/auth.js';
import { noStore } from '../middleware/cache.js';
import { parseOrThrow } from '../lib/validation.js';
import { companyRepository } from '../repositories/companyRepository.js';
import { Company } from '../models/Company.js';
import { ok } from '../lib/response.js';
import { conflict, notFound } from '../errors/AppError.js';

export const adminRouter = Router();

adminRouter.use(noStore, requireAdmin);

// --- the review queue ---------------------------------------------------------

adminRouter.get('/experiences/pending', async (req, res, next) => {
  try {
    const rows = await moderationService.pending();
    return ok(res, await experienceService.getPending(rows));
  } catch (err) {
    return next(err);
  }
});

adminRouter.post('/experiences/:id/approve', async (req, res, next) => {
  try {
    const experience = await moderationService.approve(req.params.id, req.user);
    req.log.info({ experienceId: req.params.id }, 'experience approved by admin');
    return ok(res, { id: experience._id.toString(), status: experience.status });
  } catch (err) {
    return next(err);
  }
});

const rejectSchema = z.object({ note: z.string().trim().max(1000).optional() });

adminRouter.post('/experiences/:id/reject', async (req, res, next) => {
  try {
    const { note } = parseOrThrow(rejectSchema, req.body ?? {});
    const experience = await moderationService.reject(req.params.id, req.user, { note });
    req.log.info({ experienceId: req.params.id }, 'experience rejected by admin');
    return ok(res, { id: experience._id.toString(), status: experience.status });
  } catch (err) {
    return next(err);
  }
});

// --- reports ------------------------------------------------------------------

adminRouter.get('/reports', async (req, res, next) => {
  try {
    return ok(res, await moderationService.queue());
  } catch (err) {
    return next(err);
  }
});

const removeSchema = z.object({ reportId: z.string().length(24).optional() });

adminRouter.post('/experiences/:id/remove', async (req, res, next) => {
  try {
    const { reportId } = parseOrThrow(removeSchema, req.body ?? {});
    const experience = await moderationService.remove(req.params.id, req.user, { reportId });

    // The log line names the admin because req.log carries userId — which is
    // how "who removed this" is answerable from the logs as well as the data.
    req.log.warn({ experienceId: req.params.id }, 'experience removed by moderator');

    return ok(res, { id: experience._id.toString(), status: experience.status });
  } catch (err) {
    return next(err);
  }
});

adminRouter.post('/experiences/:id/reinstate', async (req, res, next) => {
  try {
    const experience = await moderationService.reinstate(req.params.id, req.user);
    req.log.warn({ experienceId: req.params.id }, 'experience reinstated by moderator');
    return ok(res, { id: experience._id.toString(), status: experience.status });
  } catch (err) {
    return next(err);
  }
});

adminRouter.post('/reports/:id/dismiss', async (req, res, next) => {
  try {
    const report = await moderationService.dismiss(req.params.id, req.user);
    return ok(res, { id: report._id.toString(), status: report.status });
  } catch (err) {
    return next(err);
  }
});

/** Pending companies — student-submitted names awaiting approval or a merge. */
adminRouter.get('/companies/pending', async (req, res, next) => {
  try {
    const pending = await Company.find({ status: 'pending' }).sort({ createdAt: 1 }).exec();
    return ok(res, pending.map((c) => c.toPublic()));
  } catch (err) {
    return next(err);
  }
});

adminRouter.post('/companies/:slug/approve', async (req, res, next) => {
  try {
    const company = await Company.findOneAndUpdate(
      { slug: req.params.slug },
      { $set: { status: 'active' } },
      { returnDocument: 'after' },
    ).exec();

    if (!company) return next(new Error('company not found'));
    return ok(res, company.toPublic());
  } catch (err) {
    return next(err);
  }
});

/**
 * Reject a submitted company name — "blabla", a test, a joke.
 *
 * Only once nothing live or waiting for review uses it, so no post is left
 * pointing at a company that no longer exists. Reject the post first, then
 * the name. A real company with a misspelling should be merged instead.
 */
adminRouter.post('/companies/:slug/reject', async (req, res, next) => {
  try {
    const company = await companyRepository.findBySlug(req.params.slug);
    if (!company) return next(notFound('That company does not exist.'));
    if (company.status !== 'pending') return next(conflict('Only a company awaiting review can be rejected.'));

    const { Experience } = await import('../models/Experience.js');
    const inUse = await Experience.countDocuments({ companyId: company._id, status: { $in: ['published', 'pending'] } });
    if (inUse) {
      return next(conflict(
        `${inUse} post${inUse === 1 ? ' still uses' : 's still use'} this name. Reject or approve ${inUse === 1 ? 'it' : 'them'} in the review queue first.`,
      ));
    }

    await Company.deleteOne({ _id: company._id });
    req.log.warn({ slug: company.slug }, 'company name rejected');

    return ok(res, { slug: company.slug, rejected: true });
  } catch (err) {
    return next(err);
  }
});

const mergeSchema = z.object({ into: z.string().trim().min(1).max(80) });

/**
 * Merge a duplicate company into the canonical one.
 *
 * This is the manual repair tool for taxonomy drift — the thing the prototype
 * had no answer for when it accumulated "Zuvees" and "algocept" as separate
 * rows. It moves the experiences, folds the old name in as an alias so future
 * submissions resolve correctly, and deletes the duplicate.
 */
adminRouter.post('/companies/:slug/merge', async (req, res, next) => {
  try {
    const { into } = parseOrThrow(mergeSchema, req.body ?? {});

    const source = await companyRepository.findBySlug(req.params.slug);
    const target = await companyRepository.findBySlug(into);
    if (!source || !target) return next(new Error('both companies must exist'));

    const { Experience } = await import('../models/Experience.js');

    const moved = await Experience.updateMany(
      { companyId: source._id },
      { $set: { companyId: target._id, companySlug: target.slug, companyName: target.name } },
    ).exec();

    await companyRepository.upsertBySlug({ name: target.name, aliases: [source.name, ...source.aliases] });

    // Recount both rather than adjusting by the moved count: recomputation
    // cannot drift, arithmetic on a denormalized counter can.
    const counts = await Experience.countDocuments({ companyId: target._id, status: 'published' });
    await Company.updateOne({ _id: target._id }, { $set: { experienceCount: counts } });
    await Company.deleteOne({ _id: source._id });

    req.log.warn({ from: source.slug, into: target.slug, moved: moved.modifiedCount }, 'companies merged');

    return ok(res, { merged: moved.modifiedCount, into: target.slug });
  } catch (err) {
    return next(err);
  }
});
