/**
 * The Google OAuth strategy.
 *
 * `session: false` everywhere: Passport's own session support would store the
 * user in an in-memory express-session, which does not survive a restart and
 * does not scale past one process. Passport is used here for exactly one job —
 * exchanging the authorization code for a verified profile — and our own
 * session collection does the rest.
 */
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { env } from './env.js';
import { authService } from '../services/authService.js';
import { logger } from '../lib/logger.js';

/**
 * Credentials are optional in the environment schema on purpose: the whole API
 * should boot and serve the public archive without them, so the read side can
 * be developed and tested before anyone sets up a Google project. The /auth
 * routes report their absence clearly instead of the server refusing to start.
 */
export const googleConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

export function configurePassport() {
  if (!googleConfigured) {
    logger.warn(
      'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set — sign-in is disabled, the public archive still works',
    );
    return passport;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${env.API_URL}/api/v1/auth/google/callback`,
        scope: ['profile', 'email'],
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;

          const user = await authService.signInWithGoogle({
            googleId: profile.id,
            email,
            name: profile.displayName || email?.split('@')[0] || 'Student',
            avatar: profile.photos?.[0]?.value,
          });

          return done(null, user);
        } catch (err) {
          // A rejected domain is not a server error — it is a normal outcome
          // that the callback route turns into a readable page.
          return done(err);
        }
      },
    ),
  );

  return passport;
}
