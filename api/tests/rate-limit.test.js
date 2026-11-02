/**
 * Rate limits and a shared campus network. Spec NFR-S6.
 *
 * A batch shares one public IP, so nothing a normal page load calls may draw on
 * an allowance that network shares. Requests set their own X-Forwarded-For, so
 * each test has its own network and the limiters' counts cannot leak between them.
 */
import { test, before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, connectTestDatabase, clearTestDatabase, closeTestDatabase } from './helpers.js';
import { authService } from '../src/services/authService.js';
import { SESSION_COOKIE } from '../src/lib/cookies.js';

before(async () => { await connectTestDatabase(); });
after(async () => { await closeTestDatabase(); });
beforeEach(async () => { await clearTestDatabase(); });

async function signIn(key) {
  const user = await authService.signInWithGoogle({
    googleId: `rl-${key}`,
    email: `rl${key}@nst.rishihood.edu.in`,
    name: `Person ${key}`,
  });
  const token = await authService.createSession({ userId: user._id });
  return `${SESSION_COOKIE}=${token}`;
}

describe('a batch on one network', () => {
  test('page loads never run out: /auth/me is not limited, signed in or out', async () => {
    const ip = '203.0.113.1';
    const cookie = await signIn('a');

    for (let i = 0; i < 30; i += 1) {
      const out = await request(app).get('/api/v1/auth/me').set('X-Forwarded-For', ip);
      assert.equal(out.status, 204);
      assert.equal(out.headers.ratelimit, undefined);

      const signedIn = await request(app).get('/api/v1/auth/me').set('X-Forwarded-For', ip).set('Cookie', cookie);
      assert.equal(signedIn.status, 200);
    }
  });

  test('heavy sign-in traffic does not sign anyone out', async () => {
    const ip = '203.0.113.2';
    const cookie = await signIn('b');

    for (let i = 0; i < 601; i += 1) {
      await request(app).get('/api/v1/auth/google').set('X-Forwarded-For', ip);
    }

    const me = await request(app).get('/api/v1/auth/me').set('X-Forwarded-For', ip).set('Cookie', cookie);
    assert.equal(me.status, 200);
    assert.ok(me.body.data.user);
  });

  test('the sign-in limit still exists, and only stops the network that hit it', async () => {
    const ip = '203.0.113.3';
    let last;
    for (let i = 0; i < 601; i += 1) {
      last = await request(app).get('/api/v1/auth/google').set('X-Forwarded-For', ip);
    }
    assert.equal(last.status, 429);

    const other = await request(app).get('/api/v1/auth/google').set('X-Forwarded-For', '203.0.113.4');
    assert.notEqual(other.status, 429);
  });

  test('sign-in allows a whole batch: 300 sign-ins are 600 requests', async () => {
    const res = await request(app).get('/api/v1/auth/google').set('X-Forwarded-For', '203.0.113.5');
    assert.match(res.headers['ratelimit-policy'], /^600;w=900/);
  });

  test('logging out is not limited', async () => {
    const ip = '203.0.113.6';
    for (let i = 0; i < 30; i += 1) {
      const res = await request(app).post('/api/v1/auth/logout').set('X-Forwarded-For', ip);
      assert.equal(res.status, 204);
    }
  });

  test('AI guides: signed-out readers get a campus-sized allowance, students their own', async () => {
    const out = await request(app).get('/api/v1/companies/nobody/guide').set('X-Forwarded-For', '203.0.113.7');
    assert.match(out.headers['ratelimit-policy'], /^200;w=600/);

    const signedIn = await request(app)
      .get('/api/v1/companies/nobody/guide')
      .set('X-Forwarded-For', '203.0.113.7')
      .set('Cookie', await signIn('c'));
    assert.match(signedIn.headers['ratelimit-policy'], /^20;w=600/);
  });
});
