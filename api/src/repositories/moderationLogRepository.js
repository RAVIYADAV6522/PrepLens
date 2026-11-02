/**
 * All moderation log access. It adds and reads; nothing here changes a row.
 */
import { ModerationLog } from '../models/ModerationLog.js';

export const moderationLogRepository = {
  record(action, experience, admin, { reportId } = {}) {
    return ModerationLog.create({
      action,
      experienceId: experience?._id,
      adminId: admin._id,
      reportId,
      companyName: experience?.companyName,
      role: experience?.role,
    });
  },

  /** The most recent removal of each post, keyed by experience id. */
  async latestRemovals(experienceIds) {
    if (!experienceIds.length) return new Map();

    const rows = await ModerationLog.find({ experienceId: { $in: experienceIds }, action: 'remove' })
      .sort({ createdAt: 1, _id: 1 })
      .exec();

    // Oldest first, so a later removal of the same post replaces an earlier one.
    return new Map(rows.map((r) => [r.experienceId.toString(), r]));
  },
};
