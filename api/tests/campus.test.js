/**
 * Campuses and posting on a student's behalf. Students only post to RU;
 * admins post for any campus; everyone reads any campus.
 */
import { test, before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, approve, connectTestDatabase, clearTestDatabase, closeTestDatabase } from './helpers.js';
import { authService } from '../src/services/authService.js';
import { SESSION_COOKIE } from '../src/lib/cookies.js';
import { User } from '../src/models/User.js';

before(async () => { await connectTestDatabase(); });
after(async () => { await closeTestDatabase(); });
beforeEach(async () => { await clearTestDatabase(); });

let n = 0;
async function signIn({ admin = false } = {}) {
  n += 1;
  const user = await authService.signInWithGoogle({ googleId: `c-${n}`, email: `c${n}@nst.rishihood.edu.in`, name: `Student ${n}` });
  await User.updateOne({ _id: user._id }, { $set: { graduationBatch: 2027, branch: 'CSE', ...(admin && { role: 'admin' }) } });
  const token = await authService.createSession({ userId: user._id, mode: admin ? 'admin' : 'student' });
  return { user, cookie: `${SESSION_COOKIE}=${token}` };
}

const body = (overrides = {}) => ({
  campus: 'bangalore',
  company: 'Dream11',
  role: 'SDE Intern',
  driveType: 'on-campus',
  interviewYear: 2026,
  outcome: 'selected',
  rounds: [{ name: 'DSA', questions: [{ text: 'Merge intervals' }] }],
  isAnonymous: true,
  authorBatch: 2026,
  ...overrides,
});

const adminPost = (cookie, b) => request(app).post('/api/v1/admin/experiences').set('Cookie', cookie).send(b);

describe('admin posting on behalf of a student', () => {
  test('an anonymous post goes live straight away on the chosen campus', async () => {
    const admin = await signIn({ admin: true });
    const res = await adminPost(admin.cookie, body());
    assert.equal(res.status, 201);

    const feed = await request(app).get('/api/v1/experiences?campus=bangalore');
    assert.equal(feed.body.data.length, 1);
    assert.equal(feed.body.data[0].campus, 'bangalore');
    assert.equal(feed.body.data[0].author.anonymous, true);
    assert.equal(feed.body.data[0].author.graduationBatch, 2026);
  });

  test('a named post shows the student name, but only with consent', async () => {
    const admin = await signIn({ admin: true });
    const refused = await adminPost(admin.cookie, body({ isAnonymous: false, authorName: 'Aditi Sharma' }));
    assert.equal(refused.status, 422);

    const ok = await adminPost(admin.cookie, body({ isAnonymous: false, authorName: 'Aditi Sharma', authorBranch: 'CSE', consent: true }));
    assert.equal(ok.status, 201);
    const detail = await request(app).get(`/api/v1/experiences/${ok.body.data.id}`);
    assert.equal(detail.body.data.author.name, 'Aditi Sharma');
    assert.equal(detail.body.data.author.branch, 'CSE');
  });

  test('a named post needs a name', async () => {
    const admin = await signIn({ admin: true });
    const res = await adminPost(admin.cookie, body({ isAnonymous: false, consent: true }));
    assert.equal(res.status, 422);
  });

  test('students cannot post on behalf of others', async () => {
    const student = await signIn();
    assert.equal((await adminPost(student.cookie, body())).status, 403);
  });
});

describe('reading by campus', () => {
  async function seedTwoCampuses() {
    const admin = await signIn({ admin: true });
    await adminPost(admin.cookie, body({ campus: 'pune', company: 'Zomato' }));
    const student = await signIn();
    const res = await request(app).post('/api/v1/experiences').set('Cookie', student.cookie).send({
      company: 'Dream11', role: 'SDE Intern', driveType: 'on-campus', interviewYear: 2026, outcome: 'rejected', rounds: [], campus: 'pune',
    });
    await approve(res.body.data.id);
  }

  test('a student post is always RU, whatever campus it claims', async () => {
    await seedTwoCampuses();
    const ru = await request(app).get('/api/v1/experiences?campus=ru');
    assert.equal(ru.body.data.length, 1);
    assert.equal(ru.body.data[0].company.name, 'Dream11');
  });

  test('campus=all and no campus both read every campus', async () => {
    await seedTwoCampuses();
    assert.equal((await request(app).get('/api/v1/experiences?campus=all')).body.data.length, 2);
    assert.equal((await request(app).get('/api/v1/experiences')).body.data.length, 2);
  });

  test('stats and the company filter follow the campus', async () => {
    await seedTwoCampuses();
    const stats = await request(app).get('/api/v1/experiences/stats?campus=pune');
    assert.deepEqual(stats.body.data, { experiences: 1, companies: 1 });

    const companies = await request(app).get('/api/v1/companies?campus=pune');
    assert.deepEqual(companies.body.data.map((c) => c.slug), ['zomato']);
    const all = await request(app).get('/api/v1/companies');
    assert.equal(all.body.data.length, 2);
  });

  test('an unknown campus is rejected', async () => {
    assert.equal((await request(app).get('/api/v1/experiences?campus=mars')).status, 422);
  });
});
