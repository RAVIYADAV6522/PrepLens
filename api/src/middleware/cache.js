/**
 * HTTP caching for the public read surface.
 *
 * THE RULE THAT MAKES SHARED CACHING SAFE
 * A response a CDN may store must be IDENTICAL for every caller. The moment a
 * payload contains "did *you* upvote this", a shared cache can serve one
 * reader's answer to everybody — a real data leak caused entirely by a header.
 *
 * Two consequences, both implemented here:
 *   1. Public payloads carry no per-user field. Per-user state comes from
 *      /me/interactions, which is never cached.
 *   2. A request that arrives WITH a session cookie is marked private. It
 *      would be safe to cache (the payload is the same), but bypassing the
 *      cache means an author sees their own new post immediately instead of
 *      waiting out the TTL — which is the difference between "it worked" and
 *      "my submission vanished".
 */

/**
 * @param {number} sMaxAge      seconds a shared cache may serve it
 * @param {number} staleWhileRevalidate  seconds it may keep serving a stale
 *        copy while fetching a fresh one — this is also what keeps the archive
 *        readable for five minutes after the API falls over (spec NFR-A1).
 */
export function publicCache({ sMaxAge = 60, staleWhileRevalidate = 300 } = {}) {
  return (req, res, next) => {
    if (req.user) {
      res.set('Cache-Control', 'private, no-store');
    } else {
      res.set('Cache-Control', `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`);

      // Tell any shared cache that the response differs by cookie presence,
      // so it never hands a cached anonymous copy to a signed-in request or
      // the reverse.
      res.set('Vary', 'Cookie');
    }

    next();
  };
}

/** For anything per-user. Explicit, so it is never cached by accident. */
export function noStore(_req, res, next) {
  res.set('Cache-Control', 'private, no-store');
  next();
}
