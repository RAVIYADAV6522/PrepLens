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
├── server.js               process entry: validate env, listen, shut down cleanly
├── app.js                  builds the Express app — no port binding, so tests can import it
├── config/
│   ├── env.js              zod-validated environment; exits at boot if wrong
│   └── db.js               the connection pool, plus the /healthz database check
├── lib/
│   ├── logger.js           pino; JSON in production, pretty in development
│   └── response.js         the two success shapes
├── errors/
│   └── AppError.js         the one error type thrown on purpose
├── middleware/
│   ├── requestContext.js   requestId + a child logger on every request
│   ├── notFound.js         unmatched routes become a normal 404 envelope
│   └── errorHandler.js     the single place a failure becomes a response
├── models/                 six schemas, every index, enums in one place
├── repositories/           all database access — nothing else touches a model
├── scripts/
│   ├── indexes.js          npm run indexes
│   └── seed.js             npm run seed
└── routes/
    ├── health.js           /healthz — for monitors, not users
    └── v1.js               the /api/v1 surface; routers mount here per block
```

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

## Progress

| Block | Scope | State |
|---|---|---|
| 0 | Ground rules — env validation, logging, healthz, error envelope, `/api/v1` | ✅ done |
| 1 | Data layer — schemas, indexes, repositories, seed | ✅ done |
| 2 | Auth — Google OAuth, sessions, roles | next |
| 3 | Public read APIs | |
| 4 | Write APIs | |
