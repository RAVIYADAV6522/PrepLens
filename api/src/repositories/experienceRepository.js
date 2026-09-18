/**
 * All experience data access — and the only file in the project that knows how
 * the feed query is shaped.
 */
import mongoose from 'mongoose';
import { Experience } from '../models/Experience.js';
import { decodeCursor, encodeCursor } from '../lib/cursor.js';

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

export const experienceRepository = {
  /**
   * The feed, cursor-paginated.
   *
   * The sort ({ createdAt: -1, _id: -1 }) matches the exp_feed and
   * exp_company_feed indexes exactly — same fields, same directions, same
   * order. That is what lets one index serve the filter AND the sort with no
   * in-memory sort stage. Change the sort and you silently lose the index.
   */
  async findPage({
    companySlug,
    role,
    outcome,
    interviewYear,
    search,
    cursor,
    limit = DEFAULT_LIMIT,
    status = 'published',
  } = {}) {
    const size = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);

    const filter = { status };
    if (companySlug) filter.companySlug = companySlug;
    if (role) filter.role = role;
    if (outcome) filter.outcome = outcome;
    if (interviewYear) filter.interviewYear = Number(interviewYear);

    /**
     * Text search takes a different path on purpose.
     *
     * A search wants results by RELEVANCE; the feed wants them by recency.
     * Those are different sorts, and a keyset cursor is only valid over the
     * sort it was built for. So search returns one relevance-ranked page and
     * reports that it was truncated, rather than pretending to paginate a
     * ranking it cannot resume. Atlas Search replaces this when relevance
     * genuinely needs to be paged — Architecture §12.
     */
    if (search) {
      const rows = await Experience.find(
        { ...filter, $text: { $search: search } },
        { score: { $meta: 'textScore' } },
      )
        .sort({ score: { $meta: 'textScore' } })
        .limit(size)
        .exec();

      return { rows, nextCursor: null, hasMore: false, truncated: rows.length === size };
    }

    const decoded = decodeCursor(cursor);
    if (decoded) {
      // Strictly older, OR the same instant with a smaller _id. This is the
      // whole of keyset pagination.
      filter.$or = [
        { createdAt: { $lt: decoded.createdAt } },
        { createdAt: decoded.createdAt, _id: { $lt: new mongoose.Types.ObjectId(decoded.id) } },
      ];
    }

    // Fetch one more than asked for: its existence is the answer to "is there
    // another page?", with no second count query.
    const rows = await Experience.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(size + 1)
      .exec();

    const hasMore = rows.length > size;
    const page = hasMore ? rows.slice(0, size) : rows;
    const last = page.at(-1);

    return {
      rows: page,
      hasMore,
      nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last._id }) : null,
      truncated: false,
    };
  },

  findById(id) {
    if (!mongoose.isValidObjectId(id)) return Promise.resolve(null);
    return Experience.findById(id).exec();
  },

  /** Spec READ-04: a non-published id is a 404 for everyone but author and admin. */
  findPublishedById(id) {
    if (!mongoose.isValidObjectId(id)) return Promise.resolve(null);
    return Experience.findOne({ _id: id, status: 'published' }).exec();
  },

  findByAuthor(userId) {
    return Experience.find({ submittedBy: userId }).sort({ createdAt: -1 }).exec();
  },

  insert(doc) {
    return Experience.create(doc);
  },

  updateStatus(id, status) {
    return Experience.findByIdAndUpdate(id, { $set: { status } }, { returnDocument: 'after', runValidators: true }).exec();
  },

  /** Archive size counter. Spec FEED-07. */
  async publicStats() {
    const [row] = await Experience.aggregate([
      { $match: { status: 'published' } },
      { $group: { _id: null, experiences: { $sum: 1 }, companies: { $addToSet: '$companySlug' } } },
      { $project: { _id: 0, experiences: 1, companies: { $size: '$companies' } } },
    ]);

    return row ?? { experiences: 0, companies: 0 };
  },

  /** Deterministic upsert by _id — how the seed script stays idempotent. */
  upsertById(id, doc) {
    return Experience.findOneAndUpdate(
      { _id: id },
      { $set: doc },
      { upsert: true, returnDocument: 'after', runValidators: true },
    ).exec();
  },

  /** Account deletion: detach identity, keep the content. Spec CONS-05. */
  detachAuthor(userId) {
    return Experience.updateMany(
      { submittedBy: userId },
      { $set: { submittedBy: null, isAnonymous: true, authorBranch: undefined } },
    ).exec();
  },
};
