/**
 * The versioned API surface.
 *
 * WHY /api/v1 FROM THE FIRST COMMIT
 * Versioning costs one path segment today. Adding it later, after juniors have
 * bookmarked URLs and the frontend is deployed, means either breaking them or
 * maintaining two surfaces. It is the cheapest reversible decision in the
 * project, so it gets made now.
 *
 * Routers mount here as they are built:
 *   Block 2  /auth          authentication
 *   Block 3  /experiences   public reads, /companies, /stats
 *   Block 4  /experiences   writes, /reports
 *   Block 4  /admin         moderation
 */
import { Router } from 'express';
import { experiencesRouter } from './experiences.js';
import { companiesRouter } from './companies.js';
import { meRouter } from './me.js';

export const v1Router = Router();

v1Router.use('/experiences', experiencesRouter);
v1Router.use('/companies', companiesRouter);
v1Router.use('/me', meRouter);
