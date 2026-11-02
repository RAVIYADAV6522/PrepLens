# prepLens API

Express backend for prepLens. Design record: [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) · requirements: [`../docs/SPEC.md`](../docs/SPEC.md).

## Running it

```bash
cd api
npm install
cp .env.example .env     # then fill in the values
npm run dev              # http://localhost:4000
```

`npm run dev` uses Node's built-in `--watch`, so there is no nodemon.

Generate the session secret with:

```bash
openssl rand -base64 32
```

If a required variable is missing the server **refuses to start** and names it. That is deliberate — see `src/config/env.js`.

## Checking it works

```bash
npm run indexes                # create the declared indexes, and print what exists
npm run seed                   # 8 companies, 3 experiences — safe to run repeatedly
npm run seed -- --bulk 300     # plus 300 synthetic rows, so .explain() is meaningful

curl -s localhost:4000/healthz | python3 -m json.tool       # 200, or 503 if the database is unreachable
curl -s localhost:4000/api/v1/nope | python3 -m json.tool   # 404 in the standard envelope
```

`npm run seed` refuses to run against `NODE_ENV=production`.

## Layout

```
src/
├── server.js        process entry: validate env, listen, shut down cleanly
├── app.js           builds the Express app, with no port binding, so tests can import it
├── config/          zod-validated environment, database connection, Passport
├── errors/          AppError, the one error type thrown on purpose
├── lib/             cookies, cursors, Gemini client, logging, slugs, validation
├── middleware/      auth, caching headers, rate limits, request context, errors
├── models/          every schema and index, with shared enums in one file
├── repositories/    database queries, one file per main collection
├── routes/          HTTP: parse the request, call a service, shape the response
├── scripts/         the npm run commands below
└── services/        the rules: submission, moderation, accounts, interactions, AI guides
```

## Routes

All under `/api/v1`, apart from `/healthz`. Limits are per user when signed in and per IP otherwise.

| Route | Who | Purpose |
|---|---|---|
| `GET /experiences`, `/experiences/stats`, `/experiences/:id` | Public | Feed, counts, one post. Unpublished posts are 404 except to their author and admins |
| `GET /experiences/mine` | Signed in | Your own posts, with status |
| `POST /experiences` | Student, 5 a day | Submit a post for review |
| `PATCH`, `DELETE /experiences/:id` | Author | Edit (a live post waits for review) or delete permanently |
| `POST /experiences/:id/unpublish`, `/publish` | Author | Hide at once, or send back for review |
| `POST`, `DELETE /experiences/:id/result-update` | Author | Propose or withdraw a result for a post still in process |
| `POST /experiences/:id/report` | Signed in | Report a post |
| `POST`, `DELETE /experiences/:id/upvote`, `/bookmark` | Signed in | Idempotent toggles |
| `GET /companies`, `/companies/autocomplete` | Public | Filter list and submit-form suggestions |
| `GET /companies/:slug/guide` | Public | AI prep guide, cached until the company's posts change |
| `GET /auth/google`, `/auth/google/callback` | Public, 600 per 15 min per IP | Sign in; `?as=admin` is the admin door |
| `GET /auth/me`, `POST /auth/logout`, `PATCH /auth/profile` | Public / session | Who am I, sign out, one-time batch and branch |
| `GET /me/interactions`, `/me/bookmarks`, `/me/profile` | Signed in | Per-user state, never cached |
| `DELETE /me?posts=keep\|delete` | Student | Delete your account; admin accounts are refused |
| `GET /admin/experiences/pending`, `/updates`, `/removed`; `GET /admin/reports`; `GET /admin/companies/pending` | Admin session | The dashboard's queues |
| `POST /admin/experiences` | Admin session | Post on a student's behalf |
| `POST /admin/experiences/:id/approve`, `/reject`, `/update/approve`, `/update/reject`, `/remove`, `/reinstate` | Admin session | Decisions, each written to the moderation log |
| `POST /admin/reports/:id/dismiss` | Admin session | Dismiss an open report |
| `POST /admin/companies/:slug/approve`, `/reject`, `/merge` | Admin session | Company clean-up |
| `GET /healthz` | Monitors | Status, database check and deployed commit |

## Response shapes

Success:

```json
{ "data": { } }
```

Failure — every 4xx and 5xx, without exception:

```json
{
  "error": { "code": "VALIDATION_FAILED", "message": "Company is required.", "fields": { "company": "required" } },
  "requestId": "01JB7Q2K9X"
}
```

`requestId` also comes back as the `x-request-id` header and is stamped on every log line for that request. When something breaks, that id is how you find it.

## Conventions

- **ESM only** (`"type": "module"`), `.js` extensions required in imports.
- **No `asyncHandler` wrapper.** Express 5 forwards rejected promises to the error handler itself.
- **Expected failures throw an `AppError`**; anything else is a bug and becomes a 500 with no internal detail leaked to the client.
- **No `Model.find` outside a repository** (from Block 1 onward).
- **Never log a cookie or a token.** The logger redacts them, but do not rely on that alone.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Watch mode on port 4000 |
| `npm test` | Runs the tests against a separate `preplens_test` database |
| `npm run indexes` | Sync the declared indexes and print what exists |
| `npm run seed` | 8 companies, 3 experiences; `-- --bulk 300` adds synthetic rows |
| `npm run import -- <file.json>` | Import existing experiences, all unpublished |
| `npm run consent -- --list` | What is still waiting on consent |
| `npm run consent -- <id> --by "Name"` | Record consent and publish |
| `npm run review:requeue` | List live posts no admin ever approved; `-- --apply` sends them to the review queue |
| `npm run backfill:campus` | Set the campus on older rows |
| `npm run archive:reset -- --yes` | Delete every experience. Keeps companies and users |
