/**
 * All company data access. No other layer touches the Company model.
 *
 * WHY A REPOSITORY LAYER IS THE ONE STRUCTURAL PATTERN THAT EARNS ITS PLACE
 * Every query lives in one file per collection, which means: one place to run
 * .explain() when something is slow, one place to change when a query needs a
 * different index, and a service layer that can be tested with this module
 * swapped for a fake — no database process required.
 *
 * The rule that makes it work: no Model.find() outside a repository, ever.
 */
import { Company } from '../models/Company.js';
import { slugify, cleanName } from '../lib/slug.js';

export const companyRepository = {
  findBySlug(slug) {
    return Company.findOne({ slug }).exec();
  },

  /**
   * Resolve free text to an existing company.
   *
   * Tries the slug first (so "Google", "google " and "GOOGLE" all land on the
   * same row), then the alias list (so "Google India" resolves too). Returns
   * null when genuinely unknown — the caller decides whether to queue it.
   */
  async findByNameOrAlias(rawName) {
    const name = cleanName(rawName);
    const slug = slugify(name);
    if (!slug) return null;

    const bySlug = await Company.findOne({ slug }).exec();
    if (bySlug) return bySlug;

    // Case-insensitive exact alias match, anchored, so the index is usable.
    return Company.findOne({ aliases: new RegExp(`^${escapeRegex(name)}$`, 'i') }).exec();
  },

  /**
   * Autocomplete. Prefix-anchored so company_nameLower can serve it.
   *
   * PENDING COMPANIES ARE INCLUDED, deliberately.
   *
   * The first version filtered to status 'active', which broke the feature's
   * whole purpose: the first student to submit "Zuvees" creates it as pending,
   * so the SECOND student typing "Zuv" would see no suggestion and might enter
   * "Zuvees Technologies" — producing exactly the duplicate this is meant to
   * prevent. Approval gates the FILTER dropdown (listWithExperiences), not the
   * suggestion list.
   */
  searchByPrefix(prefix, limit = 8) {
    const q = cleanName(prefix).toLowerCase();
    if (!q) return Promise.resolve([]);

    return Company.find({ nameLower: new RegExp(`^${escapeRegex(q)}`) })
      .sort({ experienceCount: -1, nameLower: 1 })
      .limit(limit)
      .exec();
  },

  listWithExperiences() {
    // Spec FEED-08: a company with nothing published is not offered as a filter.
    return Company.find({ experienceCount: { $gt: 0 } })
      .sort({ nameLower: 1 })
      .exec();
  },

  /** Idempotent create-or-update by slug. The seed script relies on this. */
  upsertBySlug({ name, aliases = [], logoUrl, status = 'active' }) {
    const slug = slugify(name);
    const clean = cleanName(name);

    return Company.findOneAndUpdate(
      { slug },
      {
        $set: { name: clean, nameLower: clean.toLowerCase(), slug, status, ...(logoUrl && { logoUrl }) },
        $addToSet: { aliases: { $each: aliases.map(cleanName).filter(Boolean) } },
        $setOnInsert: { experienceCount: 0 },
      },
      { upsert: true, returnDocument: 'after', runValidators: true },
    ).exec();
  },

  /**
   * $inc rather than read-modify-write. Two concurrent publishes both reading
   * 4 and both writing 5 is a lost update; $inc is applied by the server and
   * cannot be raced.
   */
  incrementExperienceCount(companyId, by = 1) {
    return Company.updateOne({ _id: companyId }, { $inc: { experienceCount: by } }).exec();
  },
};

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
