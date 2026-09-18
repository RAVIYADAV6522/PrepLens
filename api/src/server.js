/**
 * Process entry point: validate, start, and shut down cleanly.
 *
 * The import of ./config/env.js is first and deliberate — it validates the
 * environment as a side effect of being imported, so a misconfigured server
 * exits here, before a port is bound or a connection is opened. Spec OPS-01.
 */
import { env, isDevelopment } from './config/env.js';
import { logger } from './lib/logger.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { createApp } from './app.js';

/**
 * CONNECT BEFORE LISTENING, AND FAIL LOUDLY IF THAT DOES NOT WORK.
 *
 * The alternative is to start serving immediately and let requests fail one by
 * one against a database that was never reachable. That turns a single obvious
 * boot error into a stream of confusing 500s, and a deploy that should have
 * been rejected goes live looking healthy.
 *
 * Mongoose still reconnects on its own after this point — this guards the
 * initial connection only, where a wrong password or a missing IP allowlist
 * entry is overwhelmingly the cause.
 */
try {
  await connectDatabase();
} catch (err) {
  console.error(
    '\nCould not connect to MongoDB — the server did not start.\n' +
      `  ${err.message}\n\n` +
      'Check MONGODB_URI in api/.env, and that your IP is allowed in\n' +
      'Atlas under Network Access.\n',
  );
  process.exit(1);
}

const app = createApp();

/**
 * WHY THE SUCCESS LOG IS DEFERRED AND GUARDED
 *
 * On a dual-stack host, binding an in-use port can report 'listening' for one
 * address family before the conflict surfaces as an 'error' on the other. The
 * success message then goes through pino's async transport while the failure
 * goes synchronously to stderr — so a boot that actually FAILED prints
 * "listening on http://localhost:4000" after its own error message. Anyone
 * reading those logs would reasonably conclude the server started.
 *
 * The flag plus the short delay let a failure that arrives moments later win.
 * The lesson generalises: an asynchronous success message can outrun a
 * synchronous failure, and the log then tells a story that never happened.
 */
let bindFailed = false;

const server = app.listen(env.PORT);

server.once('listening', () => {
  setTimeout(() => {
    if (bindFailed) return;

    logger.info(
      { port: env.PORT, environment: env.NODE_ENV, commit: env.COMMIT_SHA },
      isDevelopment
        ? `prepLens API listening on http://localhost:${env.PORT}`
        : 'prepLens API listening',
    );
  }, 50).unref();
});

/**
 * BOOT FAILURES USE console.error, NOT THE LOGGER — and that is deliberate.
 *
 * `logger.fatal(...)` followed immediately by `process.exit(1)` loses the
 * message. pino's pretty transport runs in a worker thread, and the process
 * dies before the worker can flush, so the line is never written. A crash that
 * leaves no trace in the logs is the worst possible failure mode, and this bug
 * is invisible in development until the one time you need the message.
 *
 * console.error writes synchronously to stderr, so it always survives. The
 * same reasoning applies in config/env.js.
 */
server.on('error', (err) => {
  bindFailed = true;

  if (err.code === 'EADDRINUSE') {
    // The most common local failure, and Node's default message for it is cryptic.
    console.error(
      `\nPort ${env.PORT} is already in use.\n` +
        `Stop the process using it, or set PORT in api/.env.\n` +
        `Find it with: lsof -nP -iTCP:${env.PORT} -sTCP:LISTEN\n`,
    );
    process.exit(1);
  }
  console.error('\nThe server failed to start:\n', err);
  process.exit(1);
});

/**
 * GRACEFUL SHUTDOWN
 * A deploy sends SIGTERM and then waits. Exiting immediately would cut off
 * requests that are mid-flight — someone's experience submission lost for no
 * reason. Instead: stop accepting new connections, let the in-flight ones
 * finish, then exit. The timer is the backstop for a request that hangs.
 *
 */
let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, 'shutting down');

  const forceExit = setTimeout(() => {
    logger.error('shutdown timed out after 10s — exiting anyway');
    process.exit(1);
  }, 10_000);

  // Do not hold the event loop open just for the backstop timer.
  forceExit.unref();

  server.close(async (err) => {
    if (err) {
      logger.error({ err }, 'error while closing the server');
      process.exit(1);
    }

    // Close the pool only after the HTTP server has drained: an in-flight
    // request still needs its database connection to finish responding.
    try {
      await disconnectDatabase();
    } catch (closeErr) {
      logger.error({ err: closeErr }, 'error while closing the database connection');
    }

    /**
     * No process.exit(0) here, deliberately.
     *
     * Exiting immediately after a log call races the logger's transport and
     * can drop the last line — the same bug as the fatal handlers above. Once
     * the HTTP server is closed and the database pool is released, nothing
     * holds the event loop, so Node exits on its own with status 0 and the
     * log flushes first. The unref'd timer above is the backstop if something
     * unexpected keeps a handle open.
     */
    logger.info('shutdown complete');
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

/**
 * A promise rejected with nothing to catch it, or a synchronous throw outside
 * any handler, leaves the process in an unknown state. Logging and exiting is
 * correct: the host restarts a crashed process, and a clean restart beats a
 * server that keeps serving from corrupted state.
 */
function exitOnFatal(label) {
  return (err) => {
    // Log through pino so the error reaches the log platform with full context,
    // then give the transport a moment to drain before exiting. Without the
    // delay this line is lost for exactly the reason described above.
    logger.fatal({ err }, `${label} — exiting`);
    console.error(`\n${label}:\n`, err);
    setTimeout(() => process.exit(1), 250);
  };
}

process.on('unhandledRejection', exitOnFatal('unhandled promise rejection'));
process.on('uncaughtException', exitOnFatal('uncaught exception'));
