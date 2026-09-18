/**
 * The company taxonomy, read-side: the filter dropdown and the submit form's
 * autocomplete. Both exist to stop free-text company names from fragmenting
 * the archive.
 */
import { Router } from 'express';
import { z } from 'zod';
import { companyRepository } from '../repositories/companyRepository.js';
import { publicCache } from '../middleware/cache.js';
import { parseOrThrow } from '../lib/validation.js';
import { ok } from '../lib/response.js';

export const companiesRouter = Router();

// Spec FEED-08: only companies that actually have published experiences are
// offered as filters, so the dropdown never advertises an empty result.
companiesRouter.get('/', publicCache({ sMaxAge: 300 }), async (req, res, next) => {
  try {
    const companies = await companyRepository.listWithExperiences();
    return ok(res, companies.map((c) => c.toPublic()));
  } catch (err) {
    return next(err);
  }
});

const autocompleteSchema = z.object({ q: z.string().trim().min(1).max(80) });

/**
 * Autocomplete on the submit form.
 *
 * Prefix-anchored, which is what lets the company_nameLower index serve it.
 * A "contains" search (/goo/i) cannot use an index at all — Block 1's
 * .explain() measured that exact case examining 7.8× the documents it
 * returned.
 */
companiesRouter.get('/autocomplete', publicCache({ sMaxAge: 300 }), async (req, res, next) => {
  try {
    const { q } = parseOrThrow(autocompleteSchema, req.query);
    const matches = await companyRepository.searchByPrefix(q);
    return ok(res, matches.map((c) => ({ name: c.name, slug: c.slug, experienceCount: c.experienceCount })));
  } catch (err) {
    return next(err);
  }
});
