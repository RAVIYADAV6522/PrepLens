/**
 * Who is making this request?
 *
 * THREE LAYERS, AND THE DISTINCTION MATTERS
 *   attachUser   resolves a session if there is one, and never fails. Used on
 *                public routes, because on prepLens being signed out is a
 *                normal state, not an error.
 *   requireAuth  401 when there is no valid session. Used on writes.
 *   requireAdmin 403 unless role is admin. Used on moderation.
 *
 * Authorization is checked here, server-side, on every request. Hiding a
 * button in the UI is not a control — it is a hint. Spec NFR-S4.
 */
import { authService } from '../services/authService.js';
import { SESSION_COOKIE, clearSessionCookie } from '../lib/cookies.js';
import { unauthorized } from '../errors/AppError.js';

export async function attachUser(req, res, next) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return next();

    const resolved = await authService.resolveSession(token);

    if (!resolved) {
      // The cookie is present but dead — expired, revoked, or the account is
      // gone. Clearing it stops the browser from sending it on every
      // subsequent request forever.
      clearSessionCookie(res);
      return next();
    }

    req.user = resolved.user;
    req.sessionToken = token;

    // Every log line for this request now names the user, which is what makes
    // an audit trail possible.
    req.log = req.log.child({ userId: resolved.user._id.toString() });

    return next();
  } catch (err) {
    return next(err);
  }
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized('Sign in with your college account to do that.'));
  return next();
}

export function requireAdmin(req, _res, next) {
  try {
    if (!req.user) return next(unauthorized('Sign in with your college account to do that.'));
    authService.requireAdmin(req.user);
    return next();
  } catch (err) {
    return next(err);
  }
}
