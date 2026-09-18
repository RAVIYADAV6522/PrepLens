/**
 * Authentication routes.
 *
 * The flow, end to end:
 *   1. Browser hits /auth/google           -> redirected to Google
 *   2. Google authenticates, then calls    -> /auth/google/callback?code=...
 *   3. Passport exchanges the code         -> a verified profile
 *   4. We check the email domain           -> reject, or upsert the user
 *   5. We create a session row and         -> Set-Cookie, then redirect to a
 *      clean frontend URL                     URL with no credential in it
 */
import { Router } from 'express';
import passport from 'passport';
import { z } from 'zod';
import { env } from '../config/env.js';
import { googleConfigured } from '../config/passport.js';
import { authService, DomainRejectedError } from '../services/authService.js';
import { SESSION_COOKIE, setSessionCookie, clearSessionCookie } from '../lib/cookies.js';
import { requireAuth } from '../middleware/auth.js';
import { ok, noContent } from '../lib/response.js';
import { AppError, validationFailed } from '../errors/AppError.js';
import { BRANCHES } from '../models/enums.js';

export const authRouter = Router();

/** A clear 503 beats a stack trace when the credentials simply are not set. */
function requireGoogleConfigured(_req, _res, next) {
  if (!googleConfigured) {
    return next(
      new AppError(
        503,
        'SIGN_IN_UNAVAILABLE',
        'Sign-in is not configured on this server. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
      ),
    );
  }
  return next();
}

// --- 1. start the flow --------------------------------------------------------
authRouter.get(
  '/google',
  requireGoogleConfigured,
  passport.authenticate('google', { session: false, scope: ['profile', 'email'] }),
);

// --- 2. Google comes back -----------------------------------------------------
authRouter.get('/google/callback', requireGoogleConfigured, (req, res, next) => {
  /**
   * A custom callback rather than the middleware form, because the middleware
   * form can only redirect on failure. A rejected college domain is not a
   * server error and not a generic failure — it needs its own explanation, and
   * the user needs a way to retry with a different account. Spec AUTH-02.
   */
  passport.authenticate('google', { session: false }, async (err, user) => {
    try {
      if (err instanceof DomainRejectedError) {
        req.log.info({ reason: 'domain' }, 'sign-in rejected: wrong email domain');

        // The reason travels as a query parameter so the frontend can explain
        // it. No credential is ever put in a URL — only this reason code.
        return res.redirect(
          `${env.FRONTEND_URL}/signin?error=domain&domain=${encodeURIComponent(env.COLLEGE_EMAIL_DOMAIN)}`,
        );
      }

      if (err) return next(err);
      if (!user) return res.redirect(`${env.FRONTEND_URL}/signin?error=failed`);

      // Promote configured addresses to admin on login, so there is never a
      // shared admin account to hand over.
      const superAdmins = env.SUPER_ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
      if (superAdmins.length) {
        const withEmail = await user.constructor.findById(user._id).select('+email').exec();
        if (withEmail && superAdmins.includes(withEmail.email) && withEmail.role !== 'admin') {
          withEmail.role = 'admin';
          await withEmail.save();
          req.log.info('user promoted to admin by SUPER_ADMIN_EMAILS');
        }
      }

      const token = await authService.createSession({
        userId: user._id,
        userAgent: req.get('user-agent'),
        ip: req.ip,
      });

      setSessionCookie(res, token);
      req.log.info({ userId: user._id.toString() }, 'signed in');

      // A student with no batch yet goes to the one-time profile step.
      const destination = user.graduationBatch ? '/' : '/welcome';
      return res.redirect(`${env.FRONTEND_URL}${destination}`);
    } catch (callbackErr) {
      return next(callbackErr);
    }
  })(req, res, next);
});

// --- 3. who am I --------------------------------------------------------------
/**
 * 204, not 401, when signed out.
 *
 * On prepLens reads are public, so "no session" is the normal state of most
 * visitors — not an error. Returning 401 here would fill the browser console
 * with red on every anonymous page load and push the frontend toward treating
 * a normal state as a failure.
 */
authRouter.get('/me', (req, res) => {
  if (!req.user) return noContent(res);

  return ok(res, {
    user: req.user.toPublic(),
    needsProfile: !req.user.graduationBatch,
  });
});

// --- 4. sign out --------------------------------------------------------------
authRouter.post('/logout', async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];

  // Deleting the row is what makes this real: the cookie is not merely
  // forgotten by the browser, the session no longer exists server-side.
  if (token) await authService.signOut(token);

  clearSessionCookie(res);
  return noContent(res);
});

// --- 5. the one-time profile step --------------------------------------------
const profileSchema = z.object({
  graduationBatch: z.coerce.number().int().min(2000).max(2100),
  branch: z.enum(BRANCHES),
});

authRouter.patch('/profile', requireAuth, async (req, res, next) => {
  const parsed = profileSchema.safeParse(req.body);

  if (!parsed.success) {
    // Field-level detail, so the form can mark the offending input rather than
    // showing one generic message at the top.
    const fields = Object.fromEntries(
      parsed.error.issues.map((i) => [i.path.join('.'), i.message]),
    );
    return next(validationFailed('Check the highlighted fields.', fields));
  }

  try {
    const updated = await authService.completeProfile(req.user._id, parsed.data);
    return ok(res, { user: updated.toPublic() });
  } catch (err) {
    return next(err);
  }
});
