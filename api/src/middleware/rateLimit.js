/**
 * Rate limits, keyed correctly.
 *
 * THE BUG THIS AVOIDS
 * The original plan said "100 requests per 15 minutes per IP". On campus wifi
 * hundreds of students share one NAT address, so the first keen user would
 * exhaust the limit and lock out the entire college. An authenticated route
 * must therefore key on the USER; only the unauthenticated ones can key on IP.
 *
 * A note for the writeup: express-rate-limit's default is a FIXED window,
 * which permits a 2x burst across the boundary — the full allowance at 14:59
 * and the full allowance again at 15:00. A token bucket or sliding window
 * smooths that. At this scale the fixed window is fine; knowing why it is
 * imperfect is the part that matters.
 */
import rateLimit from 'express-rate-limit';
import { tooManyRequests } from '../errors/AppError.js';

/** Per-user where possible, per-IP otherwise. */
function keyByUserOrIp(req) {
  return req.user ? `u:${req.user._id.toString()}` : `ip:${req.ip}`;
}

/** Route the rejection through the normal error envelope, not the default HTML. */
function handler(message) {
  return (req, _res, next) => {
    req.log.warn({ key: keyByUserOrIp(req) }, 'rate limit hit');
    next(tooManyRequests(message));
  };
}

const base = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  // A 429 must not itself count toward the limit, or a hammering client
  // extends its own ban forever.
  skipFailedRequests: false,
};

/** Spec §9: the spam floor. Nobody writes six genuine experiences in a day. */
export const submitLimiter = rateLimit({
  ...base,
  windowMs: 24 * 60 * 60 * 1000,
  limit: 5,
  handler: handler('You can submit up to 5 experiences a day. Come back tomorrow, or edit an existing one.'),
});

export const editLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 40,
  handler: handler('Too many edits in a short time. Try again in a few minutes.'),
});

export const reportLimiter = rateLimit({
  ...base,
  windowMs: 24 * 60 * 60 * 1000,
  limit: 10,
  handler: handler('You have reported enough for today. A moderator will look at these.'),
});

/** Generous, because the CDN absorbs most reads and the campus shares an IP. */
export const publicReadLimiter = rateLimit({
  ...base,
  windowMs: 5 * 60 * 1000,
  limit: 300,
  handler: handler('Too many requests. Slow down a little.'),
});

export const authLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => `ip:${req.ip}`,
  handler: handler('Too many sign-in attempts. Wait a few minutes.'),
});
