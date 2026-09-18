/**
 * Assembles the Express application.
 *
 * Kept separate from server.js on purpose: this module builds an app and never
 * binds a port, so a test can import it and drive it in-process with supertest
 * (Block 8) without a real network listener. Mixing the two is the single most
 * common reason an Express codebase becomes untestable.
 *
 * ORDER IS THE DESIGN
 * Middleware is a pipeline — each layer either handles the request or passes it
 * on, and the sequence below is deliberate:
 *
 *   requestContext  identity first, so every later log line is correlated
 *   body parsing    turn bytes into objects
 *   routes          the actual work
 *   notFound        nothing matched
 *   errorHandler    last, because it is the only one that can end a failure
 *
 * (The architecture document calls this Chain of Responsibility. It is —
 * though Express designed the chain, not us.)
 */
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { configurePassport } from './config/passport.js';
import { requestContext } from './middleware/requestContext.js';
import { attachUser } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { healthRouter } from './routes/health.js';
import { v1Router } from './routes/v1.js';

export function createApp() {
  const app = express();

  // Do not advertise the framework and version to anyone scanning for
  // known-vulnerable releases.
  app.disable('x-powered-by');

  // Render terminates TLS at its proxy and forwards the real client IP in
  // X-Forwarded-For. Without this, req.ip is the proxy's address and every
  // rate limit in Block 4 would key on one value for the entire internet.
  app.set('trust proxy', 1);

  /**
   * Security headers. helmet sets a dozen of them; the two that matter most
   * here are nosniff (stop a browser guessing that JSON is HTML) and
   * frame-deny (stop the API being framed).
   *
   * Content-Security-Policy is disabled because this process serves JSON, not
   * HTML — a CSP on an API protects nothing and only complicates the frontend,
   * which ships its own on Vercel.
   */
  app.use(helmet({ contentSecurityPolicy: false }));

  /**
   * CORS, with credentials.
   *
   * `credentials: true` is what allows the browser to send the session cookie
   * on a cross-origin request. It also makes a wildcard origin illegal — the
   * browser refuses `Access-Control-Allow-Origin: *` together with
   * credentials, which is a good default: exactly one origin is named, and it
   * comes from configuration. Spec NFR-S2.
   */
  app.use(
    cors({
      origin: [env.FRONTEND_URL],
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    }),
  );

  app.use(cookieParser());
  app.use(requestContext);

  // A submitted experience with several rounds is text, and text is small.
  // An explicit cap means a malformed or malicious 50MB body is rejected by
  // the framework instead of being buffered into memory.
  app.use(express.json({ limit: '128kb' }));

  // Passport is used only to exchange an OAuth code for a profile; it holds no
  // session state of its own, hence initialize() with no session support.
  app.use(configurePassport().initialize());

  /**
   * attachUser runs on EVERY route, including public ones, and never fails.
   * A public read then knows who is looking (useful for "your own post" and
   * for skipping the cache) without making a signed-out visitor an error case.
   */
  app.use(attachUser);

  app.use('/', healthRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1', v1Router);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
