/**
 * Authentication decisions. No Express, no Passport, no HTTP — so every rule
 * in here can be tested by calling a function.
 */
import { env } from '../config/env.js';
import { userRepository } from '../repositories/userRepository.js';
import { sessionRepository } from '../repositories/sessionRepository.js';
import { SESSION_TTL_MS } from '../lib/cookies.js';
import { AppError, forbidden } from '../errors/AppError.js';

/**
 * Is this address allowed to sign in?
 *
 * Exact suffix match on "@" + domain, deliberately. A naive
 * `email.includes(domain)` would accept `attacker@nst.rishihood.edu.in.evil.com`
 * and `nst.rishihood.edu.in@gmail.com` — both contain the string. Checking the
 * part after the final "@" is the only correct test.
 *
 * Spec AUTH-02, AUTH-03.
 */
export function isCollegeEmail(email) {
  if (typeof email !== 'string') return false;

  const at = email.lastIndexOf('@');
  if (at === -1) return false;

  const domain = email.slice(at + 1).toLowerCase().trim();
  return domain === env.COLLEGE_EMAIL_DOMAIN.toLowerCase();
}

export class DomainRejectedError extends AppError {
  constructor(email) {
    super(
      403,
      'DOMAIN_NOT_ALLOWED',
      `prepLens is open to ${env.COLLEGE_EMAIL_DOMAIN} accounts only. You signed in with a different account.`,
    );
    this.email = email;
  }
}

export const authService = {
  /**
   * Called with a verified Google profile. Everything before this point is
   * Google's problem; everything after is ours.
   */
  async signInWithGoogle({ googleId, email, name, avatar }) {
    if (!isCollegeEmail(email)) throw new DomainRejectedError(email);

    // Keyed on googleId, not email: the address can change, the id cannot.
    return userRepository.upsertFromGoogle({
      googleId,
      email: email.toLowerCase(),
      name,
      avatar,
    });
  },

  createSession({ userId, userAgent, ip }) {
    return sessionRepository.create({ userId, ttlMs: SESSION_TTL_MS, userAgent, ip });
  },

  /** Returns the user for a cookie token, or null. Never throws on a bad token. */
  async resolveSession(token) {
    const session = await sessionRepository.findActiveByToken(token);
    if (!session) return null;

    const user = await userRepository.findById(session.userId);
    if (!user) {
      // The account was deleted while a session was still live. Clean up
      // rather than leaving a row pointing at nothing.
      await sessionRepository.deleteByToken(token);
      return null;
    }

    return { user, session };
  },

  signOut(token) {
    return sessionRepository.deleteByToken(token);
  },

  /** Spec AUTH-06 — collected once, after first login. */
  async completeProfile(userId, { graduationBatch, branch }) {
    return userRepository.setProfile(userId, { graduationBatch, branch });
  },

  requireAdmin(user) {
    if (user?.role !== 'admin') throw forbidden('That action is restricted to moderators.');
    return true;
  },
};
