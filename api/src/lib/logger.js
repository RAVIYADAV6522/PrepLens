/**
 * Structured logging.
 *
 * WHY NOT console.log
 * `console.log('user ' + id + ' submitted')` produces a string. A string can be
 * read by a human and by nothing else. Structured logs are JSON objects, so a
 * log platform can filter by field — every line for one requestId, every error
 * above warn, every request slower than 500ms. You cannot query prose.
 *
 * In development a pretty-printer makes it readable; in production the raw JSON
 * goes to stdout, which is exactly what hosting platforms collect.
 *
 * Spec: OPS-02, NFR-O1.
 */
import pino from 'pino';
import { env, isProduction } from '../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,

  // pid and hostname are noise on a single-instance deployment.
  base: undefined,

  // Never log these, even accidentally, even in development. A session cookie
  // in a log file is a session cookie anyone with log access can replay.
  redact: {
    paths: ['req.headers.cookie', 'req.headers.authorization', 'password', 'token'],
    censor: '[redacted]',
  },

  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        // Do NOT add `ignore: 'requestId'` here — hiding the correlation id
        // in development defeats the entire purpose of having one.
        options: { colorize: true, translateTime: 'HH:MM:ss', singleLine: false },
      },
});
