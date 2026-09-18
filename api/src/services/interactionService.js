/**
 * Upvotes and bookmarks.
 *
 * THE IDEA THIS FILE EXISTS TO DEMONSTRATE
 * The obvious implementation is "look up whether they already voted, and
 * insert if not". That is racy: two taps arriving together both read "no vote
 * yet" and both insert, and the count goes to 2 for one person. The window is
 * small, which is worse — it fails rarely enough that you ship it.
 *
 * Instead the unique compound index on { userId, experienceId } makes a second
 * row IMPOSSIBLE at the storage layer. We simply try to insert, and a duplicate
 * key error (11000) means "already voted" — a normal outcome, not a failure.
 * The database arbitrates, so there is no window to lose.
 *
 * The counter is only incremented when a row was ACTUALLY created, which is
 * what keeps upvoteCount honest under concurrency.
 */
import { Vote } from '../models/Vote.js';
import { Bookmark } from '../models/Bookmark.js';
import { Experience } from '../models/Experience.js';
import { experienceRepository } from '../repositories/experienceRepository.js';
import { notFound } from '../errors/AppError.js';

const DUPLICATE_KEY = 11000;

async function requirePublished(experienceId) {
  const experience = await experienceRepository.findPublishedById(experienceId);
  if (!experience) throw notFound('That experience does not exist.');
  return experience;
}

export const interactionService = {
  /** Returns the new count and whether this call created the vote. */
  async upvote(experienceId, userId) {
    const experience = await requirePublished(experienceId);

    try {
      await Vote.create({ userId, experienceId: experience._id });
    } catch (err) {
      // Already voted. Idempotent by design: the second tap is not an error,
      // it just does nothing.
      if (err?.code === DUPLICATE_KEY) {
        return { upvoted: true, upvoteCount: experience.upvoteCount, changed: false };
      }
      throw err;
    }

    // $inc, applied by the server — two concurrent votes cannot lose an update
    // the way read-modify-write would.
    const updated = await Experience.findByIdAndUpdate(
      experience._id,
      { $inc: { upvoteCount: 1 } },
      { returnDocument: 'after' },
    ).exec();

    return { upvoted: true, upvoteCount: updated.upvoteCount, changed: true };
  },

  async removeUpvote(experienceId, userId) {
    const experience = await requirePublished(experienceId);

    const { deletedCount } = await Vote.deleteOne({ userId, experienceId: experience._id }).exec();

    if (!deletedCount) {
      return { upvoted: false, upvoteCount: experience.upvoteCount, changed: false };
    }

    const updated = await Experience.findByIdAndUpdate(
      experience._id,
      // Clamped at zero: a counter that can go negative because of one stray
      // decrement is worse than one that is occasionally a little stale.
      { $inc: { upvoteCount: -1 } },
      { returnDocument: 'after' },
    ).exec();

    if (updated.upvoteCount < 0) {
      await Experience.updateOne({ _id: experience._id }, { $set: { upvoteCount: 0 } }).exec();
      return { upvoted: false, upvoteCount: 0, changed: true };
    }

    return { upvoted: false, upvoteCount: updated.upvoteCount, changed: true };
  },

  /**
   * Bookmarks are private — no count is ever exposed, because "12 people
   * bookmarked this" leaks who is preparing for which company once the number
   * is small. Spec BOOK-02.
   */
  async bookmark(experienceId, userId) {
    const experience = await requirePublished(experienceId);

    try {
      await Bookmark.create({ userId, experienceId: experience._id });
    } catch (err) {
      if (err?.code === DUPLICATE_KEY) return { bookmarked: true, changed: false };
      throw err;
    }

    return { bookmarked: true, changed: true };
  },

  async removeBookmark(experienceId, userId) {
    const { deletedCount } = await Bookmark.deleteOne({ userId, experienceId }).exec();
    return { bookmarked: false, changed: Boolean(deletedCount) };
  },

  /** The reader's saved list, newest first — served by bookmark_user_recent. */
  async listBookmarks(userId) {
    const rows = await Bookmark.find({ userId }).sort({ createdAt: -1 }).limit(100).exec();
    const ids = rows.map((r) => r.experienceId);
    if (!ids.length) return [];

    const experiences = await Experience.find({ _id: { $in: ids }, status: 'published' }).exec();
    const byId = new Map(experiences.map((e) => [e._id.toString(), e]));

    // Keep the bookmark order, and silently drop anything since unpublished.
    return rows.map((r) => byId.get(r.experienceId.toString())).filter(Boolean);
  },

  /**
   * Reconciliation — spec VOTE-05.
   *
   * A denormalized counter drifts: a failed write, a manual fix, a bug. Owning
   * that is part of choosing to denormalize, so this recomputes every count
   * from the votes that actually exist and reports what it corrected.
   */
  async reconcileVoteCounts() {
    const counts = await Vote.aggregate([{ $group: { _id: '$experienceId', n: { $sum: 1 } } }]);
    const actual = new Map(counts.map((c) => [c._id.toString(), c.n]));

    const experiences = await Experience.find({}).select('_id upvoteCount').exec();
    const drifted = [];

    for (const experience of experiences) {
      const truth = actual.get(experience._id.toString()) ?? 0;
      if (experience.upvoteCount !== truth) {
        drifted.push({ id: experience._id.toString(), stored: experience.upvoteCount, actual: truth });
        await Experience.updateOne({ _id: experience._id }, { $set: { upvoteCount: truth } }).exec();
      }
    }

    return { checked: experiences.length, corrected: drifted.length, drifted };
  },
};
