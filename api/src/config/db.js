/**
 * The database connection.
 *
 * THE "SINGLETON PATTERN", HONESTLY LABELLED
 * The design document lists Singleton here. What is actually true: Mongoose
 * already maintains one connection pool per process, so a Singleton wrapper
 * adds no runtime guarantee that Mongoose does not already provide. What the
 * cached promise below genuinely buys is idempotence — calling connect() twice
 * (a test, a script, a retry) reuses the in-flight connection instead of
 * opening a second one.
 *
 * Being able to say that out loud is worth more than the pattern. The real
 * engineering in this file is the pool size, the timeout, and the decision
 * about index building.
 */
import mongoose from 'mongoose';
import { env, isProduction } from './env.js';
import { logger } from '../lib/logger.js';

let connectionPromise = null;

export function connectDatabase() {
  if (connectionPromise) return connectionPromise;

  // Reject a query for a field not in the schema instead of silently ignoring
  // it — a typo'd filter key should fail loudly, not return everything.
  mongoose.set('strictQuery', 'throw');

  connectionPromise = mongoose
    .connect(env.MONGODB_URI, {
      /**
       * Atlas M0 allows a small number of connections. One pool of 10 for the
       * whole process is ample for this workload — the archive is read-heavy,
       * write-rare, and every read is short. The failure this prevents is
       * connecting per request, which exhausts the tier's connection limit
       * under trivial load and returns 500s that look like a database outage.
       */
      maxPoolSize: 10,
      minPoolSize: 1,

      // Fail a query in 10s rather than hanging a request forever when the
      // cluster is unreachable. A fast, clear failure beats a stuck browser tab.
      serverSelectionTimeoutMS: 10_000,
      socketTimeoutMS: 45_000,

      /**
       * Index building is automatic in development and explicit in production.
       *
       * On an empty collection an automatic build is instant and convenient.
       * On a populated one it can block writes at an unpredictable moment —
       * during a deploy, with users on the site. In production indexes are
       * created deliberately, by `npm run indexes`, when you are watching.
       */
      autoIndex: !isProduction,
    })
    .then((m) => {
      logger.info(
        { database: m.connection.name, host: m.connection.host },
        'database connected',
      );
      return m.connection;
    })
    .catch((err) => {
      // Let a later call retry rather than caching a rejected promise forever.
      connectionPromise = null;
      throw err;
    });

  // Connection lifecycle after the initial connect. Mongoose reconnects on its
  // own and buffers commands meanwhile; these logs are so a blip is visible
  // rather than mysterious.
  mongoose.connection.on('disconnected', () => logger.warn('database disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('database reconnected'));
  mongoose.connection.on('error', (err) => logger.error({ err }, 'database error'));

  return connectionPromise;
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.connection.close();
  connectionPromise = null;
}

const READY_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

/**
 * What /healthz reports. Pings rather than trusting readyState alone: a socket
 * can be "connected" while the server behind it is unresponsive, and a health
 * check that cannot detect that is decoration. Spec OPS-03.
 */
export async function databaseHealth() {
  const state = READY_STATES[mongoose.connection.readyState] ?? 'unknown';
  if (state !== 'connected') return { status: state };

  const startedAt = process.hrtime.bigint();
  try {
    await mongoose.connection.db.admin().ping();
    const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    return { status: 'ok', latencyMs: Number(latencyMs.toFixed(1)) };
  } catch (err) {
    return { status: 'unreachable', error: err.message };
  }
}
