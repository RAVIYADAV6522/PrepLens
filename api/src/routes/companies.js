/**
 * The company taxonomy, read-side: the filter dropdown and the submit form's
 * autocomplete. Both exist to stop free-text company names from fragmenting
 * the archive.
 */
import { Router } from 'express';
import { z } from 'zod';
import { companyRepository } from '../repositories/companyRepository.js';
import { experienceRepository } from '../repositories/experienceRepository.js';
import { campusQuery } from './experiences.js';
import { publicCache, noStore } from '../middleware/cache.js';
import { guideLimiter } from '../middleware/rateLimit.js';
import { companyGuideService } from '../services/companyGuideService.js';
import { parseOrThrow } from '../lib/validation.js';
import { ok } from '../lib/response.js';

export const companiesRouter = Router();

// Spec FEED-08: only companies that actually have published experiences are
// offered as filters, so the dropdown never advertises an empty result.
companiesRouter.get('/', publicCache({ sMaxAge: 300 }), async (req, res, next) => {
  try {
    // Counted per campus from the experiences themselves (see the repository).
    const { campus } = parseOrThrow(z.object({ campus: campusQuery }), req.query);
    return ok(res, await experienceRepository.companiesWithExperiences(campus));
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

const slugSchema = z.object({ slug: z.string().trim().toLowerCase().min(1).max(120).regex(/^[a-z0-9-]+$/) });

/**
 * The AI prep guide for one company (companyGuideService). Caching happens
 * in the database, keyed on the experiences behind it, not at the CDN:
 * publicCache would also stamp a 503 "AI busy" as cacheable.
 */
companiesRouter.get('/:slug/guide', guideLimiter, noStore, async (req, res, next) => {
  try {
    const { slug } = parseOrThrow(slugSchema, req.params, 'That is not a valid company.');
    return ok(res, await companyGuideService.getGuide(slug));
  } catch (err) {
    return next(err);
  }
});
