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

  /**
   * The only origin allowed to send credentialed requests.
   *
   * The trailing slash is stripped, and that is not cosmetic. A browser's
   * `Origin` header is scheme + host + port with NO path — never a trailing
   * slash — so a value pasted from the address bar as
   * "https://example.vercel.app/" can never match a real request. CORS then
   * fails for every browser call while curl (which you test with) looks fine,
   * because curl only sends the Origin you hand it.
   *
   * Configuration should tolerate how people actually copy URLs.
   */
  FRONTEND_URL: z.url().transform((v) => v.replace(/\/+$/, '')),

  // This API's own public origin, used to build the OAuth callback URL. It
  // must match the redirect URI registered in the Google Cloud console
  // exactly — a mismatch is the single most common OAuth setup failure.
  API_URL: z.url().default('http://localhost:4000').transform((v) => v.replace(/\/+$/, '')),

  /**
   * Google OAuth credentials are OPTIONAL on purpose.
   *
   * prepLens reads are public, so the archive must be developable and
   * testable before anyone has set up a Google Cloud project. Without these
   * the server boots, serves everything public, and the /auth routes report
   * that sign-in is not configured. Making them required would block the
   * entire read side on an unrelated setup step.
   */
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  /**
   * Comma-separated addresses promoted to admin on login. Admin is a role
   * flag on a normal account — there is no shared admin login to hand over,
   * because with OAuth there is no password to share, and an audit trail has
   * to name a person.
   */
  SUPER_ADMIN_EMAILS: z.string().default(''),

  // The single source of truth for who may sign in. Configuration, not a
  // hardcoded string, so the rule can change without a code edit. Spec AUTH-03.
  COLLEGE_EMAIL_DOMAIN: z.string().min(3).default('nst.rishihood.edu.in'),

  // Render injects RENDER_GIT_COMMIT automatically; fall back to it so
  // /healthz can answer "which build is actually live?" with no extra config.
  COMMIT_SHA: z.string().default(process.env.RENDER_GIT_COMMIT ?? 'local'),
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
