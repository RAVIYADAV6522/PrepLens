/**
 * Deleting an account. Spec CONS-05, and the promise on the privacy page.
 *
 * THE AUTHOR CHOOSES WHAT HAPPENS TO THEIR POSTS
 *   'delete'  every post goes, as if they had deleted each one themselves.
 *   'keep'    live posts stay, anonymous with batch only and no link back.
 *
 * Keeping applies to what is live, not to everything. A post the author hid or
 * never got approved was never agreed to be public, and with the account gone
 * nobody could ever manage it, so those are deleted either way. A post removed
 * by a moderator is detached and kept, because that decision may need explaining.
 *
 * THE ORDER IS DELIBERATE
 * The user row goes last. These writes are not one transaction, so if a step
 * fails the person can sign in and press the button again, and every step is
 * safe to repeat. Deleting the user first would strand everything else.
 */
import { Bookmark } from '../models/Bookmark.js';
import { Experience } from '../models/Experience.js';
import { Report } from '../models/Report.js';
import { User } from '../models/User.js';
import { Vote } from '../models/Vote.js';
import { conflict } from '../errors/AppError.js';
import { experienceRepository } from '../repositories/experienceRepository.js';
import { sessionRepository } from '../repositories/sessionRepository.js';
import { submissionService } from './submissionService.js';

const KEPT_STATUSES = new Set(['published', 'removed']);

async function removeVotes(userId) {
  const votes = await Vote.find({ userId }).select('experienceId').exec();
  const ids = votes.map((v) => v.experienceId);

  await Vote.deleteMany({ userId }).exec();

  // Counts are recomputed from vote rows by reconcileVoteCounts, so a kept
  // count with no row behind it would only drift. Not an edit, so no timestamp.
  await Experience.updateMany(
    { _id: { $in: ids }, upvoteCount: { $gt: 0 } },
    { $inc: { upvoteCount: -1 } },
    { timestamps: false },
  ).exec();
}

export const accountService = {
  async deleteAccount(user, { posts }) {
    // The moderation log names admins, and it has to keep meaning something.
    if (user.role === 'admin') {
      throw conflict('Admin accounts cannot be deleted here, because moderation records name them. Ask the project owner to remove your admin role first.');
    }

    const rows = await experienceRepository.findByAuthor(user._id);
    const toDelete = posts === 'delete' ? rows : rows.filter((r) => !KEPT_STATUSES.has(r.status));

    // One at a time, so each keeps the company counts and dependents correct.
    for (const row of toDelete) {
      await submissionService.destroy(row._id.toString(), user);
    }

    await experienceRepository.detachAuthor(user._id);
    await removeVotes(user._id);
    await Bookmark.deleteMany({ userId: user._id }).exec();

    // A complaint about a post stays open after its reporter leaves.
    await Report.updateMany({ reporterId: user._id }, { $set: { reporterId: null } }).exec();

    await sessionRepository.deleteAllForUser(user._id);
    await User.deleteOne({ _id: user._id }).exec();
  },
};
