/**
 * Per-user state, deliberately separated from the cached public payloads.
 *
 * This is the other half of the caching rule in middleware/cache.js: the feed
 * is public and shared-cacheable precisely BECAUSE "have I upvoted this" lives
 * here instead. The frontend renders the feed from cache and fills in the
 * highlighted buttons from this call.
 *
 * Votes and bookmarks arrive in Phase 2; the endpoint exists now so the
 * caching architecture is correct from the start rather than retrofitted —
 * retrofitting it would mean discovering the leak in production.
 */
import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { Vote } from '../models/Vote.js';
import { Bookmark } from '../models/Bookmark.js';
import { noStore } from '../middleware/cache.js';
import { requireAuth } from '../middleware/auth.js';
import { parseOrThrow } from '../lib/validation.js';
import { ok } from '../lib/response.js';

export const meRouter = Router();

const idsSchema = z.object({
  ids: z
    .string()
    .max(2000)
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
    .refine((arr) => arr.length <= 50, { message: 'at most 50 ids per request' })
    .refine((arr) => arr.every((id) => mongoose.isValidObjectId(id)), { message: 'contains an invalid id' }),
});

meRouter.get('/interactions', noStore, requireAuth, async (req, res, next) => {
  try {
    const { ids } = parseOrThrow(idsSchema, req.query);

    // Two indexed queries for the whole page, not two per row.
    const [votes, bookmarks] = await Promise.all([
      Vote.find({ userId: req.user._id, experienceId: { $in: ids } }).select('experienceId').exec(),
      Bookmark.find({ userId: req.user._id, experienceId: { $in: ids } }).select('experienceId').exec(),
    ]);

    return ok(res, {
      upvoted: votes.map((v) => v.experienceId.toString()),
      bookmarked: bookmarks.map((b) => b.experienceId.toString()),
    });
  } catch (err) {
    return next(err);
  }
});
