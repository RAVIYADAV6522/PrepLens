/**
 * The two response shapes this API can produce.
 *
 * The architecture document calls this the "Factory pattern". Honestly: it is
 * two helper functions, and naming it after a GoF pattern would be dressing up
 * something simple. What it genuinely buys is a contract — every success looks
 * the same and every failure looks the same, so the frontend needs exactly one
 * success path and one error path, forever.
 *
 * Spec: OPS-04.
 */

/**
 * Success. Payload always under `data`, never at the top level, so adding
 * pagination metadata later (Block 3) does not break any existing client.
 */
export function ok(res, data, extra) {
  return res.json({ data, ...extra });
}

export function created(res, data, extra) {
  return res.status(201).json({ data, ...extra });
}

export function noContent(res) {
  return res.status(204).end();
}
