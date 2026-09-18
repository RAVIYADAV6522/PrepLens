/**
 * The one error type the application throws on purpose.
 *
 * WHY
 * Without this, every controller invents its own failure shape — some return
 * `res.status(400).json({ msg })`, some throw strings, some forget to respond
 * at all. Then the frontend has to handle four different error shapes, and the
 * fifth one crashes it.
 *
 * With it there is exactly one rule: expected failures throw an AppError, and
 * everything else is a bug that becomes a 500. The error handler is then the
 * single place that decides what the client sees.
 *
 * Spec: OPS-04.
 */
export class AppError extends Error {
  /**
   * @param {number} status  HTTP status code
   * @param {string} code    stable machine-readable code the frontend can switch on
   * @param {string} message human-readable, safe to show a user
   * @param {object} [fields] per-field validation detail, e.g. { company: 'required' }
   */
  constructor(status, code, message, fields) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    if (fields) this.fields = fields;

    // Keep the stack trace pointing at the throw site, not at this constructor.
    Error.captureStackTrace?.(this, AppError);
  }
}

// Named helpers, so a controller reads as intent rather than as status codes.
export const badRequest = (message, fields) => new AppError(400, 'BAD_REQUEST', message, fields);
export const validationFailed = (message, fields) => new AppError(422, 'VALIDATION_FAILED', message, fields);
export const unauthorized = (message = 'You need to sign in to do that.') => new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You do not have access to that.') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Not found.') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (message, fields) => new AppError(409, 'CONFLICT', message, fields);
export const tooManyRequests = (message) => new AppError(429, 'RATE_LIMITED', message);
