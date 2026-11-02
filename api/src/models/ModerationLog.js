/**
 * The moderation record: one row per decision, and rows only ever get added.
 *
 * WHY THIS IS NOT JUST `resolvedBy` ON A REPORT
 * A field holds one answer, so the next action overwrites the last. Reinstating
 * a post used to erase who removed it, and a post with no report had nowhere to
 * record a removal at all. Spec MOD-04, MOD-05.
 *
 * The company and role are copied here because an author may permanently delete
 * their post, and the record of what was decided must outlive it. The author is
 * deliberately not recorded: this log survives their account too.
 */
import mongoose from 'mongoose';
import { MODERATION_ACTIONS } from './enums.js';

const moderationLogSchema = new mongoose.Schema(
  {
    action: { type: String, enum: MODERATION_ACTIONS, required: true },
    experienceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Experience', required: true },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'Report' },
    companyName: { type: String, trim: true },
    role: { type: String, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'moderation_log' },
);

moderationLogSchema.index(
  { experienceId: 1, action: 1, createdAt: -1 },
  { name: 'modlog_experience_action' },
);

/** Append-only, enforced here rather than by remembering not to. */
function refuseChange() {
  throw new Error('The moderation log is append-only.');
}

moderationLogSchema.pre('save', function refuseResave() {
  if (!this.isNew) refuseChange();
});
moderationLogSchema.pre(
  ['updateOne', 'updateMany', 'replaceOne', 'findOneAndUpdate', 'findOneAndReplace', 'findOneAndDelete', 'deleteMany'],
  refuseChange,
);
moderationLogSchema.pre('deleteOne', { document: true, query: true }, refuseChange);

export const ModerationLog = mongoose.model('ModerationLog', moderationLogSchema);
