/** All CompanyGuide access. */
import { CompanyGuide } from '../models/CompanyGuide.js';

export const companyGuideRepository = {
  findByCompany(companyId) {
    return CompanyGuide.findOne({ companyId }).lean().exec();
  },

  /** One guide per company: replace in place, create on first generation. */
  save(companyId, fields) {
    return CompanyGuide.findOneAndUpdate(
      { companyId },
      { $set: { ...fields, companyId } },
      { upsert: true, new: true, lean: true },
    ).exec();
  },
};
