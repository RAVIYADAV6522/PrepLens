/**
 * The session cookie, in one place.
 *
 * Every attribute here is a security decision, so they are worth stating:
 *
 *   httpOnly  JavaScript cannot read it. An XSS bug can then deface the page
 *             but cannot steal the session, which is the difference between an
 *             incident and a catastrophe.
 *   secure    Never sent over plain HTTP in production.
 *   sameSite  'lax' — the cookie is sent on top-level navigations but not on
 *             cross-site POSTs, which blocks the simple CSRF case. This works
 *             because the frontend and API are same-site: localhost:5173 and
 *             localhost:4000 in development (SameSite ignores the port), and
 *             preplens.app / api.preplens.app in production. Splitting them
 *             across vercel.app and onrender.com would force SameSite=None and
 *             a genuinely weaker posture.
 *   path      '/' so it reaches every route, including the OAuth callback.
 *
 * Note what is NOT here: the token never appears in a URL. The common tutorial
 * pattern redirects to `/?token=…`, which writes the credential into browser
 * history, the Referer header of the next outbound click, and the host's
 * access logs.
 */
import { isProduction } from '../config/env.js';

export const SESSION_COOKIE = 'preplens_session';

/** Seven days, matching spec AUTH-04. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS,
  });
}

export function clearSessionCookie(res) {
  // The attributes must match those used to set it, or the browser keeps the
  // original cookie and "logout" appears to do nothing in the UI.
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  });
}
