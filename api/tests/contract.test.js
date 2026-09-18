/**
 * The frontend/backend contract.
 *
 * These tests assert the exact SHAPE each component reads. A rename like
 * `page` -> `pagination` would pass every other test in this suite and break
 * the feed silently in the browser — this file is what catches that.
 */
import { test, before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, connectTestDatabase, clearTestDatabase, closeTestDatabase } from './helpers.js';
import { authService } from '../src/services/authService.js';
import { SESSION_COOKIE } from '../src/lib/cookies.js';
import { User } from '../src/models/User.js';

before(async () => { await connectTestDatabase(); });
after(async () => { await closeTestDatabase(); });
beforeEach(async () => { await clearTestDatabase(); });

async function studentWithPost() {
  const user = await authService.signInWithGoogle({
    googleId: 'contract-1', email: 'c@nst.rishihood.edu.in', name: 'Contract Student',
  });
  await User.updateOne({ _id: user._id }, { $set: { graduationBatch: 2027, branch: 'CSE' } });
  const token = await authService.createSession({ userId: user._id });
  const cookie = `${SESSION_COOKIE}=${token}`;

  const created = await request(app).post('/api/v1/experiences').set('Cookie', cookie).send({
    company: 'Zuvees',
    role: 'Backend Intern',
    driveType: 'on-campus',
    interviewYear: 2026,
    outcome: 'rejected',
    isAnonymous: false,
    rounds: [{ name: 'DSA Round', questions: [{ text: 'Binary search on the answer' }], tips: 'Practise.' }],
  });

  assert.equal(created.status, 201, 'setup: the experience was created');
  return { cookie, id: created.body.data.id };
}

describe('GET /experiences — what Feed.jsx reads', () => {
  test('body.data is an array and body.page carries the cursor fields', async () => {
    await studentWithPost();
    const res = await request(app).get('/api/v1/experiences?limit=10');

    assert.ok(Array.isArray(res.body.data), 'body.data');
    assert.ok(res.body.page, 'body.page');
    assert.ok('nextCursor' in res.body.page, 'body.page.nextCursor');
    assert.ok('hasMore' in res.body.page, 'body.page.hasMore');
    assert.ok('truncated' in res.body.page, 'body.page.truncated');
  });

  test('every card field the component renders is present', async () => {
    await studentWithPost();
    const [card] = (await request(app).get('/api/v1/experiences')).body.data;

    // ExperienceCard.jsx + lib/format.js read exactly these.
    assert.equal(typeof card.id, 'string');
    assert.equal(typeof card.company.name, 'string');
    assert.equal(typeof card.company.slug, 'string');
    assert.equal(typeof card.role, 'string');
    assert.equal(typeof card.outcome, 'string');
    assert.equal(typeof card.interviewYear, 'number');
    assert.equal(typeof card.roundCount, 'number');
    assert.equal(typeof card.createdAt, 'string');
    assert.equal(typeof card.author, 'object');
    assert.equal(typeof card.author.anonymous, 'boolean');
  });
});

describe('GET /experiences/:id — what ExperienceDetail.jsx reads', () => {
  test('rounds carry order, questions and tips', async () => {
    const { id } = await studentWithPost();
    const res = await request(app).get(`/api/v1/experiences/${id}`);
    const round = res.body.data.rounds[0];

    assert.equal(typeof round.order, 'number', 'the sidebar numbers rounds by this');
    assert.equal(typeof round.name, 'string');
    assert.ok(Array.isArray(round.questions));
    assert.equal(typeof round.questions[0].text, 'string');
    assert.equal(typeof round.tips, 'string');
    assert.equal(typeof res.body.data.driveType, 'string', 'rendered as a tag');
  });

  test('a 404 carries the error envelope the page branches on', async () => {
    const res = await request(app).get('/api/v1/experiences/000000000000000000000000');

    assert.equal(res.status, 404);
    assert.equal(typeof res.body.error.message, 'string');
    assert.equal(typeof res.body.requestId, 'string');
  });
});

describe('GET /auth/me — what AuthContext.jsx reads', () => {
  test('204 with an empty body when signed out', async () => {
    const res = await request(app).get('/api/v1/auth/me');

    assert.equal(res.status, 204);
    assert.deepEqual(res.body, {}, 'no body, so `body?.data?.user` is undefined and user becomes null');
  });

  test('200 carries data.user and data.needsProfile', async () => {
    const { cookie } = await studentWithPost();
    const res = await request(app).get('/api/v1/auth/me').set('Cookie', cookie);

    assert.equal(typeof res.body.data.user.name, 'string');
    assert.equal(typeof res.body.data.user.role, 'string');
    assert.equal(typeof res.body.data.needsProfile, 'boolean');
    assert.equal(res.body.data.user.graduationBatch, 2027, 'Submit.jsx shows this in the anonymity hint');
  });
});

describe('the supporting endpoints', () => {
  test('GET /companies returns name, slug and experienceCount for the dropdown', async () => {
    await studentWithPost();
    const [company] = (await request(app).get('/api/v1/companies')).body.data;

    assert.equal(typeof company.name, 'string');
    assert.equal(typeof company.slug, 'string');
    assert.equal(typeof company.experienceCount, 'number');
  });

  test('GET /companies/autocomplete returns what the suggestion list renders', async () => {
    await studentWithPost();
    const res = await request(app).get('/api/v1/companies/autocomplete?q=zu');

    assert.ok(res.body.data.length > 0);
    assert.equal(typeof res.body.data[0].name, 'string');
    assert.equal(typeof res.body.data[0].experienceCount, 'number');
  });

  test('GET /experiences/stats returns the two counters the sidebar shows', async () => {
    await studentWithPost();
    const res = await request(app).get('/api/v1/experiences/stats');

    assert.equal(typeof res.body.data.experiences, 'number');
    assert.equal(typeof res.body.data.companies, 'number');
  });

  test('GET /experiences/mine includes status and isAnonymous, which Mine.jsx needs', async () => {
    const { cookie } = await studentWithPost();
    const res = await request(app).get('/api/v1/experiences/mine').set('Cookie', cookie);

    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].status, 'published');
    assert.equal(typeof res.body.data[0].isAnonymous, 'boolean');
  });

  test('GET /admin/reports shape matches Admin.jsx', async () => {
    const admin = await authService.signInWithGoogle({
      googleId: 'contract-admin', email: 'admin@nst.rishihood.edu.in', name: 'Admin',
    });
    await User.updateOne({ _id: admin._id }, { $set: { role: 'admin', graduationBatch: 2026, branch: 'CSE' } });
    const adminCookie = `${SESSION_COOKIE}=${await authService.createSession({ userId: admin._id })}`;

    const { id, cookie } = await studentWithPost();
    await request(app).post(`/api/v1/experiences/${id}/report`).set('Cookie', cookie).send({ reason: 'false', note: 'test' });

    const res = await request(app).get('/api/v1/admin/reports').set('Cookie', adminCookie);
    const [report] = res.body.data;

    assert.equal(typeof report.id, 'string');
    assert.equal(typeof report.reason, 'string');
    assert.equal(typeof report.experience.id, 'string');
    assert.equal(typeof report.experience.company, 'string');
    assert.equal(typeof report.experience.status, 'string');
  });
});

describe('no endpoint anywhere leaks an email address (NFR-V1)', () => {
  test('sweeping every public and authenticated route', async () => {
    const { cookie, id } = await studentWithPost();

    const routes = [
      ['/api/v1/experiences', null],
      [`/api/v1/experiences/${id}`, null],
      ['/api/v1/experiences/stats', null],
      ['/api/v1/companies', null],
      ['/api/v1/companies/autocomplete?q=zu', null],
      ['/api/v1/auth/me', cookie],
      ['/api/v1/experiences/mine', cookie],
    ];

    for (const [path, jar] of routes) {
      const req = request(app).get(path);
      if (jar) req.set('Cookie', jar);
      const res = await req;

      assert.equal(
        JSON.stringify(res.body ?? {}).includes('@nst.rishihood.edu.in'),
        false,
        `${path} must not contain an email address`,
      );
    }
  });
});
