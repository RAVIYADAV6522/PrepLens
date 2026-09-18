/**
 * Request validation at the boundary.
 *
 * Everything from a client is untrusted — query strings included. Parsing with
 * a schema means unknown keys are dropped rather than flowing into a database
 * filter, and a bad value produces a named field error instead of a 500 three
 * layers down.
 */
import { validationFailed } from '../errors/AppError.js';

/** Turn a zod failure into the API's `fields` map. */
export function fieldErrors(error) {
  return Object.fromEntries(error.issues.map((i) => [i.path.join('.') || '_', i.message]));
}

/** Parse, or throw the standard 422. */
export function parseOrThrow(schema, value, message = 'Check the highlighted fields.') {
  const result = schema.safeParse(value);
  if (!result.success) throw validationFailed(message, fieldErrors(result.error));
  return result.data;
}
