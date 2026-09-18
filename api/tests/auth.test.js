/**
 * Block 2 — authentication.
 *
 * The Google round trip itself is not tested here: it would mean mocking
 * Google's servers, which tests the mock rather than the code. What IS tested
 * is everything we own — the domain rule, session creation, the cookie, and
 * the claim that logout actually revokes.
 */
import { test, before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, connectTestDatabase, clearTestDatabase, closeTestDatabase, cookieFrom } from './helpers.js';
import { authService, isCollegeEmail } from '../src/services/authService.js';
import { sessionRepository } from '../src/repositories/sessionRepository.js';
import { Session } from '../src/models/Session.js';
import { SESSION_COOKIE, isSameSite } from '../src/lib/cookies.js';

before(async () => { await connectTestDatabase(); });
beforeEach(async () => { await clearTestDatabase(); });
after(async () => { await closeTestDatabase(); });

/** Stands in for a verified Google profile. */
const googleProfile = (overrides = {}) => ({
  googleId: 'google-test-1',
  email: 'test.student@nst.rishihood.edu.in',
  name: 'Test Student',
  avatar: 'https://example.com/a.png',
  ...overrides,
});

describe('the college domain rule (AUTH-02, AUTH-03)', () => {
  test('accepts an address on the college domain', () => {
    assert.equal(isCollegeEmail('a@nst.rishihood.edu.in'), true);
  });

  test('rejects a personal account', () => {
    assert.equal(isCollegeEmail('a@gmail.com'), false);
  });

  test('rejects the domain used as a prefix of a hostile one', () => {
    assert.equal(isCollegeEmail('a@nst.rishihood.edu.in.evil.com'), false);
  });

  test('signInWithGoogle refuses a non-college address', async () => {
    await assert.rejects(
      () => authService.signInWithGoogle(googleProfile({ email: 'outsider@gmail.com' })),
      (err) => err.code === 'DOMAIN_NOT_ALLOWED' && err.status === 403,
    );
  });
});

describe('sign-in creates exactly one user per Google id (AUTH-01, SUB-05)', () => {
  test('a second sign-in updates rather than duplicates', async () => {
    const first = await authService.signInWithGoogle(googleProfile());
    const second = await authService.signInWithGoogle(googleProfile({ name: 'Renamed Student' }));

    assert.equal(first._id.toString(), second._id.toString());
    assert.equal(second.name, 'Renamed Student', 'profile refreshes on each login');
  });

  test('a new user is a student, never an admin', async () => {
    const user = await authService.signInWithGoogle(googleProfile());
    assert.equal(user.role, 'student');
  });
});

describe('sessions (AUTH-04, AUTH-05)', () => {
  test('the stored row holds a hash, never the token itself', async () => {
    const user = await authService.signInWithGoogle(googleProfile());
    const token = await authService.createSession({ userId: user._id });

    const row = await Session.findOne({}).exec();
    assert.ok(row, 'a session row exists');
    assert.notEqual(row.tokenHash, token, 'the raw token is not stored');
    assert.match(row.tokenHash, /^[a-f0-9]{64}$/, 'stored as a sha-256 hex digest');
  });

  test('an expired session does not resolve, even before the TTL sweeper runs', async () => {
    const user = await authService.signInWithGoogle(googleProfile());
    const token = await sessionRepository.create({ userId: user._id, ttlMs: -1000 });

    assert.equal(await authService.resolveSession(token), null);
  });

  test('a tampered token resolves to nothing', async () => {
    const user = await authService.signInWithGoogle(googleProfile());
    await authService.createSession({ userId: user._id });

    assert.equal(await authService.resolveSession('not-a-real-token'), null);
  });
});

describe('/auth/me reports the signed-in user', () => {
  test('204 when signed out — a normal state, not an error (FEED-01)', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    assert.equal(res.status, 204);
  });

  test('200 with the user when a valid cookie is sent', async () => {
    const user = await authService.signInWithGoogle(googleProfile());
    const token = await authService.createSession({ userId: user._id });

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.name, 'Test Student');
    assert.equal(res.body.data.needsProfile, true, 'batch not collected yet');
  });

  test('the payload never contains the email address (NFR-V1)', async () => {
    const user = await authService.signInWithGoogle(googleProfile());
    const token = await authService.createSession({ userId: user._id });

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${token}`);

    assert.equal(
      JSON.stringify(res.body).includes('nst.rishihood.edu.in'),
      false,
      'the email must not reach the client',
    );
  });
});

describe('logout genuinely revokes (AUTH-05) — the claim a JWT could not make', () => {
  test('a cookie replayed after logout is dead', async () => {
    const user = await authService.signInWithGoogle(googleProfile());
    const token = await authService.createSession({ userId: user._id });
    const cookie = `${SESSION_COOKIE}=${token}`;

    const before = await request(app).get('/api/v1/auth/me').set('Cookie', cookie);
    assert.equal(before.status, 200, 'signed in to begin with');

    const out = await request(app).post('/api/v1/auth/logout').set('Cookie', cookie);
    assert.equal(out.status, 204);

    const replayed = await request(app).get('/api/v1/auth/me').set('Cookie', cookie);
    assert.equal(replayed.status, 204, 'the SAME cookie no longer authenticates anything');

    assert.equal(await Session.countDocuments({}), 0, 'the row was deleted, not merely ignored');
  });

  test('logout clears the cookie with matching attributes', async () => {
    const user = await authService.signInWithGoogle(googleProfile());
    const token = await authService.createSession({ userId: user._id });

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', `${SESSION_COOKIE}=${token}`);

    const header = (res.headers['set-cookie'] ?? []).join(';');
    assert.match(header, /preplens_session=;/, 'the cookie is emptied');
    assert.match(header, /HttpOnly/i, 'and stays httpOnly while being cleared');
  });
});

describe('authorization is enforced server-side (NFR-S4)', () => {
  test('the profile route 401s without a session', async () => {
    const res = await request(app).patch('/api/v1/auth/profile').send({ graduationBatch: 2027, branch: 'CSE' });

    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
    assert.ok(res.body.requestId, 'every error carries a requestId');
  });

  test('the profile route validates its input and names the bad field', async () => {
    const user = await authService.signInWithGoogle(googleProfile());
    const token = await authService.createSession({ userId: user._id });

    const res = await request(app)
      .patch('/api/v1/auth/profile')
      .set('Cookie', `${SESSION_COOKIE}=${token}`)
      .send({ graduationBatch: 1900, branch: 'Hogwarts' });

    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'VALIDATION_FAILED');
    assert.ok(res.body.error.fields.graduationBatch);
    assert.ok(res.body.error.fields.branch);
  });

  test('a valid profile is saved and returned', async () => {
    const user = await authService.signInWithGoogle(googleProfile());
    const token = await authService.createSession({ userId: user._id });

    const res = await request(app)
      .patch('/api/v1/auth/profile')
      .set('Cookie', `${SESSION_COOKIE}=${token}`)
      .send({ graduationBatch: 2027, branch: 'CSE-AI' });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.graduationBatch, 2027);
    assert.equal(res.body.data.user.branch, 'CSE-AI');
  });
});

describe('the SameSite decision — what makes sign-in work in production', () => {
  test('same registrable domain means Lax, which is the safer policy', () => {
    assert.equal(isSameSite('http://localhost:5173', 'http://localhost:4000'), true, 'local dev');
    assert.equal(isSameSite('https://preplens.app', 'https://api.preplens.app'), true, 'domain + subdomain');
    assert.equal(isSameSite('https://www.preplens.app', 'https://api.preplens.app'), true, 'www + api');
  });

  test('free hosting puts the two halves on different sites, so Lax would break auth', () => {
    assert.equal(
      isSameSite('https://preplens.vercel.app', 'https://preplens-api.onrender.com'),
      false,
      'vercel.app and onrender.com are different sites',
    );
  });

  test('two subdomains of a PUBLIC SUFFIX are still different sites', () => {
    // The trap a naive "compare the last two labels" check falls into:
    // vercel.app is a public suffix, so these belong to different parties.
    assert.equal(isSameSite('https://preplens.vercel.app', 'https://preplens-api.vercel.app'), false);
    assert.equal(isSameSite('https://a.onrender.com', 'https://b.onrender.com'), false);
    assert.equal(isSameSite('https://a.pages.dev', 'https://b.pages.dev'), false);
  });

  test('a domain for the web app but a free host for the API is cross-site', () => {
    assert.equal(isSameSite('https://preplens.app', 'https://preplens-api.onrender.com'), false);
  });

  test('a malformed URL does not silently choose the weaker policy', () => {
    assert.equal(isSameSite('not a url', 'https://api.preplens.app'), true);
  });
});
