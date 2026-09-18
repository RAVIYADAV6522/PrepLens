/**
 * Anything that reached the end of the stack without matching a route.
 *
 * Registered with `app.use(notFound)` and no path: in Express 5 the wildcard
 * `app.all('*', ...)` throws, because path-to-regexp v8 requires named
 * wildcards. A pathless `use` is both simpler and version-proof.
 *
 * It throws rather than responding, so an unknown route produces exactly the
 * same envelope as every other failure. Spec: OPS-04.
 */
import { notFound as notFoundError } from '../errors/AppError.js';

export function notFound(req, _res, next) {
  next(notFoundError(`No route for ${req.method} ${req.originalUrl}`));
}
