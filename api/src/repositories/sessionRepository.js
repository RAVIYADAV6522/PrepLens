/**
 * Session storage. The only file that knows sessions are hashed.
 */
import { createHash, randomBytes } from 'node:crypto';
import { Session } from '../models/Session.js';

/** 32 random bytes, base64url. Unguessable, and URL/cookie safe. */
export function generateToken() {
  return randomBytes(32).toString('base64url');
}

function hash(token) {
  return createHash('sha256').update(token).digest('hex');
}

export const sessionRepository = {
  async create({ userId, ttlMs, userAgent, ip }) {
    const token = generateToken();

    await Session.create({
      tokenHash: hash(token),
      userId,
      expiresAt: new Date(Date.now() + ttlMs),
      userAgent: userAgent?.slice(0, 400),
      ip,
    });

    // The raw token is returned once, to be put in the cookie, and then never
    // exists on the server again.
    return token;
  },

  /**
   * Look up a session by the token from a cookie.
   *
   * Checks `expiresAt` explicitly rather than relying on the TTL index: the
   * TTL sweeper runs roughly once a minute, so an expired row can still be
   * present. Trusting its existence would extend every session by up to a
   * minute — small, but it is the kind of "mostly right" that becomes a
   * security bug in a longer-lived system.
   */
  findActiveByToken(token) {
    if (!token) return Promise.resolve(null);
    return Session.findOne({ tokenHash: hash(token), expiresAt: { $gt: new Date() } }).exec();
  },

  /** Logout. A real delete, which is the entire point of server-side sessions. */
  deleteByToken(token) {
    if (!token) return Promise.resolve({ deletedCount: 0 });
    return Session.deleteOne({ tokenHash: hash(token) }).exec();
  },

  /** "Sign out everywhere" — and what an admin needs after a compromise. */
  deleteAllForUser(userId) {
    return Session.deleteMany({ userId }).exec();
  },

  countForUser(userId) {
    return Session.countDocuments({ userId, expiresAt: { $gt: new Date() } }).exec();
  },
};
