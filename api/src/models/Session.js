/**
 * Server-side sessions.
 *
 * WHY NOT A 7-DAY JWT
 * A signed JWT is valid until it expires and nothing on the server can take
 * that back. "Log out" would clear the browser's copy while the token itself
 * stayed valid for a week — anyone who captured it keeps a working session.
 * The original plan said both "JWT expires in 7 days" and "session persists
 * until logout", and those cannot both be true.
 *
 * An opaque id in a cookie, backed by a row here, makes logout a real delete.
 *
 * WHY THE TOKEN IS STORED HASHED
 * The cookie carries a random token; this collection stores only its SHA-256.
 * If the database is ever dumped, the attacker holds hashes and cannot forge a
 * cookie from them — the same reasoning as never storing a password in plain
 * text. A session token is a credential, so it gets credential treatment.
 */
import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema(
  {
    // SHA-256 of the token in the cookie. The raw token is never stored.
    // No `unique: true` here — see the note in User.js. Indexes are declared
    // once, below, with names we chose.
    tokenHash: { type: String, required: true },

    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    expiresAt: { type: Date, required: true },

    // Useful when a user asks "where am I signed in?" and for spotting abuse.
    userAgent: { type: String, maxlength: 400 },
    ip: { type: String, maxlength: 64 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'sessions' },
);

sessionSchema.index({ tokenHash: 1 }, { unique: true, name: 'session_token_unique' });

/**
 * A TTL index: MongoDB deletes rows once `expiresAt` passes, with no cron job
 * and no cleanup script to forget. `expireAfterSeconds: 0` means "expire at
 * the time in this field" rather than "this many seconds after it".
 *
 * The background task runs about once a minute, so expiry is approximate at
 * the storage layer — which is why every lookup ALSO checks expiresAt rather
 * than trusting the row's existence.
 */
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'session_ttl' });

sessionSchema.index({ userId: 1 }, { name: 'session_user' });

export const Session = mongoose.model('Session', sessionSchema);
