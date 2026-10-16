import mongoose from 'mongoose';

/**
 * A cached AI prep guide, one per company.
 *
 * WHY CACHE AT ALL
 * The guide is the same for every reader, so generating it per page view
 * would spend the free AI quota on identical answers and make every reader
 * wait several seconds. It is generated once and served from here until the
 * experiences behind it change.
 *
 * `fingerprint` is a hash of the source experiences' ids and update times.
 * Publishing, editing or removing an experience changes it, which is what
 * marks the stored guide stale — no hook in the write path has to remember
 * to invalidate anything.
 */
const companyGuideSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    fingerprint: { type: String, required: true },
    guide: { type: mongoose.Schema.Types.Mixed, required: true },
    sourceIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    model: { type: String },
    generatedAt: { type: Date, required: true },
  },
  { collection: 'company_guides' },
);

companyGuideSchema.index({ companyId: 1 }, { unique: true, name: 'guide_company_unique' });

export const CompanyGuide = mongoose.model('CompanyGuide', companyGuideSchema);
