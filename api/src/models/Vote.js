/**
 * One row per person per experience (Phase 2).
 *
 * WHY THIS IS NOT `upvotes: [ObjectId]` ON THE EXPERIENCE
 * An array in the parent document is unbounded: every vote rewrites the whole
 * document, the document grows toward MongoDB's 16MB ceiling, every reader is
 * shipped every voter's id, and "who upvoted" can never be paginated.
 *
 * And the unique compound index below is a different KIND of correctness from
 * a check in application code. "Look up whether they already voted, then
 * insert" is racy — two concurrent taps both read "no vote yet" and both
 * insert. A unique index cannot be raced, because uniqueness is enforced where
 * the write lands. Spec VOTE-02.
 */
import mongoose from 'mongoose';

const voteSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    experienceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Experience', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'votes' },
);

voteSchema.index({ userId: 1, experienceId: 1 }, { unique: true, name: 'vote_user_experience_unique' });
voteSchema.index({ experienceId: 1 }, { name: 'vote_experience' });

export const Vote = mongoose.model('Vote', voteSchema);
