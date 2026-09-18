/**
 * The company taxonomy — the collection that keeps the archive from rotting.
 */
import mongoose from 'mongoose';
import { COMPANY_STATUSES } from './enums.js';
import { slugify, cleanName } from '../lib/slug.js';

const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },

    // The join key and the URL segment. Unique, so duplicates are impossible
    // at the storage layer rather than merely discouraged in the code.
    slug: { type: String, required: true, lowercase: true, trim: true },

    // Maintained by a hook below. Exists so autocomplete can use a
    // prefix-anchored regex (/^goo/), which an index can serve. A contains
    // match (/goo/i) cannot use an index and scans the whole collection.
    nameLower: { type: String, required: true, lowercase: true },

    // Variant spellings that resolve to this company: "Google India", "Google LLC".
    aliases: { type: [String], default: [] },

    logoUrl: { type: String, trim: true },

    // Denormalized counter, kept by $inc when an experience is published.
    experienceCount: { type: Number, default: 0, min: 0 },

    // A student-submitted unknown company starts 'pending' for admin review,
    // so a typo never silently becomes a permanent company. Spec SUB-04.
    status: { type: String, enum: COMPANY_STATUSES, default: 'active', required: true },
  },
  { timestamps: true, collection: 'companies' },
);

// Derive slug and nameLower rather than trusting a caller to pass them. A
// hook cannot be forgotten; a convention can.
companySchema.pre('validate', function deriveFields() {
  if (this.name) {
    this.name = cleanName(this.name);
    this.nameLower = this.name.toLowerCase();
    if (!this.slug) this.slug = slugify(this.name);
  }
  if (this.aliases?.length) {
    this.aliases = [...new Set(this.aliases.map(cleanName).filter(Boolean))];
  }
});

companySchema.index({ slug: 1 }, { unique: true, name: 'company_slug_unique' });
companySchema.index({ nameLower: 1 }, { name: 'company_nameLower' });

companySchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    name: this.name,
    slug: this.slug,
    logoUrl: this.logoUrl,
    experienceCount: this.experienceCount,
  };
};

export const Company = mongoose.model('Company', companySchema);
