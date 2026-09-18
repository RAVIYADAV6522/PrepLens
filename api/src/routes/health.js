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
 */
import { readFileSync } from 'node:fs';
import { Router } from 'express';
import { env } from '../config/env.js';
import { databaseHealth } from '../config/db.js';
import { ok } from '../lib/response.js';

const { version } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);

export const healthRouter = Router();

healthRouter.get('/healthz', async (req, res) => {
  const database = await databaseHealth();

  // 503 when a dependency is down, so an uptime monitor actually alerts. A
  // health check that returns 200 while the database is unreachable is
  // decoration — it reports that the process is alive, which nobody asked.
  const healthy = database.status === 'ok';

  res.status(healthy ? 200 : 503).json({
    data: {
      status: healthy ? 'ok' : 'degraded',
      version,
      commit: env.COMMIT_SHA,
      environment: env.NODE_ENV,
      uptimeSeconds: Math.round(process.uptime()),
      checks: { database },
    },
  });
});
