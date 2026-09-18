/**
 * The single place this API decides what a failure looks like to a client.
 *
 * Express recognises a middleware with four parameters as an error handler and
 * routes anything passed to `next(err)` here — plus, in Express 5, any rejected
 * promise from an async route handler. That is why no `asyncHandler` wrapper
 * appears anywhere in this codebase: Express 5 forwards async errors itself.
 *
 * TWO CLASSES OF FAILURE, TREATED DIFFERENTLY
 *   AppError  — expected. We chose the status, code and message, so it is safe
 *               to show the user verbatim.
 *   Anything  — a bug. The message may contain a connection string, a file
 *   else        path, or a stack trace, so in production the client gets a
 *               generic sentence and the detail goes to the logs only.
 *
 * Spec: OPS-04, NFR-S3.
 */
import { AppError } from '../errors/AppError.js';
import { isProduction } from '../config/env.js';

export function errorHandler(err, req, res, _next) {
  const expected = err instanceof AppError;
  const status = expected ? err.status : 500;

  if (status >= 500) {
    // Full error object including the stack — this is the one that wakes you up.
    req.log.error({ err }, 'unhandled error');
  } else {
    req.log.warn({ code: err.code, message: err.message, status }, 'request failed');
  }

  // A response may already be streaming; sending headers twice crashes the
  // process, so hand it back to Express to close the connection.
  if (res.headersSent) return _next(err);

  const body = {
    error: {
      code: expected ? err.code : 'INTERNAL_ERROR',
      message: expected
        ? err.message
        : 'Something went wrong on our side. Quote the requestId if you report this.',
    },
    requestId: req.id,
  };

  if (expected && err.fields) body.error.fields = err.fields;

  // Never in production. Invaluable in development.
  if (!expected && !isProduction) body.error.debug = { message: err.message, stack: err.stack };

  res.status(status).json(body);
}
