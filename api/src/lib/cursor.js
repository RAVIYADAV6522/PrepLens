/**
 * Keyset (cursor) pagination.
 *
 * WHY NOT ?page=2 WITH .skip()
 * Two reasons, and the second is the one that actually bites users.
 *
 * 1. skip(1000) makes the server walk and discard 1000 index entries. Cost
 *    grows with page number, so the deepest pages are the slowest.
 * 2. It is WRONG on a moving list. If an experience is published while the
 *    reader is on page 1, everything shifts down by one and the first row of
 *    page 2 is a row they already saw. Offset pagination cannot fix this,
 *    because a position in a list is not a stable identity.
 *
 * A cursor encodes WHERE the last row was, not how many rows to throw away:
 * "give me rows older than this createdAt, breaking ties by _id". New rows
 * arriving above the cursor cannot shift it.
 *
 * The _id tiebreak is not optional — two experiences imported in the same
 * batch can share a createdAt to the millisecond, and without it the page
 * boundary is undefined and rows can be skipped.
 */

/** Opaque to clients on purpose: an opaque token can change shape later. */
export function encodeCursor({ createdAt, id }) {
  const payload = JSON.stringify({ c: new Date(createdAt).toISOString(), i: String(id) });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

/**
 * Returns null for anything malformed rather than throwing. A tampered or
 * truncated cursor should restart the list, not 500 the request.
 */
export function decodeCursor(cursor) {
  if (!cursor || typeof cursor !== 'string') return null;

  try {
    const { c, i } = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const createdAt = new Date(c);

    if (Number.isNaN(createdAt.getTime())) return null;
    if (!/^[a-f\d]{24}$/i.test(i)) return null;

    return { createdAt, id: i };
  } catch {
    return null;
  }
}
