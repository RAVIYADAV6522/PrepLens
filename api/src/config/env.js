/**
 * Environment configuration — validated once, at boot.
 *
 * WHY THIS FILE EXISTS
 * The alternative is `process.env.MONGODB_URI` scattered through the codebase.
 * That fails badly: a missing variable surfaces as `undefined` deep inside a
 * database call, at 2am, as a confusing error that names nothing useful.
 *
 * So we validate the whole environment at boot and refuse to start if it is
 * wrong. A server that cannot possibly work should not accept requests — this
 * is the "fail fast, fail loudly" principle, and it is the cheapest reliability
 * win in the entire project.
 *
 * Spec: OPS-01.
 */
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load api/.env regardless of the directory the process was started from.
// In production (Render) there is no .env file and the platform supplies the
// variables directly — dotenv simply finds nothing and that is correct.
dotenv.config({
  path: fileURLToPath(new URL('../../.env', import.meta.url)),
  quiet: true,
});

const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  PORT: z.coerce.number().int().positive().max(65535).default(4000),

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  // Validated now, first used in Block 1. Catching a malformed connection
  // string at boot beats catching it on the first database query.
  MONGODB_URI: z
    .string()
    .min(1)
    .refine((v) => v.startsWith('mongodb://') || v.startsWith('mongodb+srv://'), {
      message: 'must start with mongodb:// or mongodb+srv://',
    }),

  // Signs the session cookie (Block 2). Named SESSION_SECRET rather than
  // JWT_SECRET because §8 of the architecture chose opaque server sessions
  // over a stateless JWT — logout has to actually revoke something.
  SESSION_SECRET: z
    .string()
    .min(32, { message: 'must be at least 32 characters — generate one with: openssl rand -base64 32' }),

  // The only origin allowed to send credentialed requests (Block 8).
  FRONTEND_URL: z.url(),

  // The single source of truth for who may sign in. Configuration, not a
  // hardcoded string, so the rule can change without a code edit. Spec AUTH-03.
  COLLEGE_EMAIL_DOMAIN: z.string().min(3).default('nst.rishihood.edu.in'),

  // Set by the host (Render exposes RENDER_GIT_COMMIT); 'local' when absent.
  COMMIT_SHA: z.string().default('local'),
});

/**
 * Turn zod's developer-facing messages into something a human reading a
 * terminal at 2am can act on. "Invalid input: expected string, received
 * undefined" is accurate and useless; "missing (required)" is neither.
 */
function describe(issue) {
  if (issue.code === 'invalid_type' && issue.message.includes('received undefined')) {
    return 'missing (required)';
  }
  return issue.message;
}

const result = schema.safeParse(process.env);

if (!result.success) {
  const issues = result.error.issues;
  const width = Math.max(...issues.map((i) => String(i.path[0]).length));

  // Deliberately console.error and not the logger: the logger itself depends
  // on this file, so at this point in the boot sequence it does not exist yet.
  console.error('\nConfiguration error — the server did not start.\n');
  for (const issue of issues) {
    console.error(`  ${String(issue.path[0]).padEnd(width)}  ${describe(issue)}`);
  }
  console.error('\nSet these in api/.env — see api/.env.example for the expected shape.\n');

  process.exit(1);
}

export const env = Object.freeze(result.data);

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
