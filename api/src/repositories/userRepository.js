/**
 * All user data access.
 *
 * Note what is absent: no create(), no signup. A user exists because Google
 * said they exist and their address is on the college domain. Block 2 calls
 * upsertFromGoogle and nothing else does.
 */
import { User } from '../models/User.js';

export const userRepository = {
  findById(id) {
    return User.findById(id).exec();
  },

  findByGoogleId(googleId) {
    return User.findOne({ googleId }).exec();
  },

  /**
   * Login. Keys on googleId — the stable identity — not on email, which can
   * change. Name and avatar refresh on every login so a changed profile photo
   * follows through. Spec AUTH-01, SUB-05.
   */
  upsertFromGoogle({ googleId, email, name, avatar }) {
    return User.findOneAndUpdate(
      { googleId },
      {
        $set: { email, name, ...(avatar && { avatar }) },
        $setOnInsert: { googleId, role: 'student' },
      },
      { upsert: true, returnDocument: 'after', runValidators: true },
    ).exec();
  },

  /** The one-time profile step after first login. Spec AUTH-06. */
  setProfile(userId, { graduationBatch, branch }) {
    return User.findByIdAndUpdate(
      userId,
      { $set: { graduationBatch, branch } },
      { returnDocument: 'after', runValidators: true },
    ).exec();
  },

  /** Fetch several authors at once — the fix for the N+1 in a feed render. */
  findManyByIds(ids) {
    if (!ids?.length) return Promise.resolve([]);
    return User.find({ _id: { $in: ids } }).exec();
  },
};
