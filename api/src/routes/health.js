/**
 * Liveness endpoint.
 *
 * WHO CALLS THIS
 * Not users. An uptime monitor hits it every minute and alerts when it stops
 * answering; Render hits it to decide whether a deploy came up healthy. It is
 * mounted at the root rather than under /api/v1 because it describes the
 * process, not the product, and it must never be versioned away.
 *
 * It reports the commit it is running, which answers the question "is my deploy
 * actually live?" without guessing.
 *
 * Spec: OPS-03, NFR-O2.
 * Block 1 adds the database reachability check to `checks`.
 */
import { readFileSync } from 'node:fs';
import { Router } from 'express';
import { env } from '../config/env.js';
import { ok } from '../lib/response.js';

const { version } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);

export const healthRouter = Router();

healthRouter.get('/healthz', (req, res) =>
  ok(res, {
    status: 'ok',
    version,
    commit: env.COMMIT_SHA,
    environment: env.NODE_ENV,
    uptimeSeconds: Math.round(process.uptime()),
    checks: {
      // database: added in Block 1, once there is a connection to check.
    },
  }),
);
