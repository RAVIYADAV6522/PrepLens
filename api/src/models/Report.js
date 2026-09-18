/**
 * Moderation intake — Phase 1, not Phase 2.
 *
 * prepLens hosts student-authored claims about named companies on the public
 * internet. Shipping that without a way to take one down is a liability, and
 * the first report arriving with no queue to receive it is the worst time to
 * discover that.
 *
 * `resolvedBy` is why admin is a role flag on a real account rather than a
 * shared login: the audit trail has to name a person.
 */
import mongoose from 'mongoose';
import { REPORT_REASONS, REPORT_STATUSES } from './enums.js';

const reportSchema = new mongoose.Schema(
  {
    experienceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Experience', required: true },
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    note: { type: String, trim: true, maxlength: 1000 },
    status: { type: String, enum: REPORT_STATUSES, default: 'open', required: true },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'reports' },
);

// The moderation queue: open reports, oldest first.
reportSchema.index({ status: 1, createdAt: -1 }, { name: 'report_queue' });

export const Report = mongoose.model('Report', reportSchema);
