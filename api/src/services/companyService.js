/**
 * Company resolution — the single point where free text becomes a real company.
 */
import { companyRepository } from '../repositories/companyRepository.js';
import { slugify, cleanName } from '../lib/slug.js';
import { validationFailed } from '../errors/AppError.js';

export const companyService = {
  /**
   * Resolve a typed company name to a company document, creating a PENDING
   * one when it is genuinely unknown.
   *
   * Why pending rather than active: a typo would otherwise become a permanent
   * company in the filter dropdown forever. Pending companies still carry
   * their experiences — the student is never blocked — but an admin merges or
   * approves them before they appear as a filter option. Spec SUB-04.
   */
  async resolveOrQueue(rawName) {
    const name = cleanName(rawName ?? '');

    if (!name) throw validationFailed('Which company was this for?', { company: 'required' });
    if (!slugify(name)) {
      throw validationFailed('That company name has no letters or numbers in it.', { company: 'invalid' });
    }

    const existing = await companyRepository.findByNameOrAlias(name);
    if (existing) return { company: existing, created: false };

    const company = await companyRepository.upsertBySlug({ name, status: 'pending' });
    return { company, created: true };
  },
};
