/**
 * Result updates on live "in process" posts: the approved version stays on
 * the site while the update waits, and approval swaps it in.
 */
import { test, before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, approve, connectTestDatabase, clearTestDatabase, closeTestDatabase } from './helpers.js';
import { authService } from '../src/services/authService.js';
import { SESSION_COOKIE } from '../src/lib/cookies.js';
import { User } from '../src/models/User.js';
import { Company } from '../src/models/Company.js';

before(async () => { await connectTestDatabase(); });
after(async () => { await closeTestDatabase(); });
beforeEach(async () => { await clearTestDatabase(); });

let n = 0;
async function signIn({ admin = false } = {}) {
  n += 1;
  const user = await authService.signInWithGoogle({
    googleId: `ru-${n}`,
    email: `ru${n}@nst.rishihood.edu.in`,
    name: `Student ${n}`,
  });
  await User.updateOne({ _id: user._id }, { $set: { graduationBatch: 2027, branch: 'CSE', ...(admin && { role: 'admin' }) } });
  const token = await authService.createSession({ userId: user._id, mode: admin ? 'admin' : 'student' });
  return { user, cookie: `${SESSION_COOKIE}=${token}` };
}

const round1 = { name: 'Online Assessment', questions: [{ text: 'Two sum variant', topic: 'Arrays' }] };
const round2 = { name: 'Technical Interview', questions: [{ text: 'Design a rate limiter' }], tips: 'Talk through trade-offs.' };

/** A live, approved, in-process post by a fresh student. */
async function livePost(outcome = 'in-process') {
  const author = await signIn();
  const res = await request(app).post('/api/v1/experiences').set('Cookie', author.cookie).send({
    company: 'Dream11', role: 'SDE Intern', driveType: 'on-campus', interviewYear: 2026,
    outcome, rounds: [round1], isAnonymous: false,
  });
  await approve(res.body.data.id);
  return { author, id: res.body.data.id };
}

const update = (cookie, id, body = { outcome: 'selected', rounds: [round1, round2] }) =>
  request(app).post(`/api/v1/experiences/${id}/result-update`).set('Cookie', cookie).send(body);

describe('requesting a result update', () => {
  test('the live version stays public, unchanged, while the update waits', async () => {
    const { author, id } = await livePost();
    const before = await request(app).get(`/api/v1/experiences/${id}`);
    const res = await update(author.cookie, id);
    assert.equal(res.status, 200);

    const pub = await request(app).get(`/api/v1/experiences/${id}`);
    assert.equal(pub.status, 200);
    assert.equal(pub.body.data.outcome, 'in-process');
    assert.equal(pub.body.data.rounds.length, 1);
    assert.equal(pub.body.data.pendingUpdate, undefined);
    assert.equal(pub.body.data.updatedAt, before.body.data.updatedAt, 'a waiting update must not mark the post as edited');
  });

  test('the author sees the waiting update on their profile', async () => {
    const { author, id } = await livePost();
    await update(author.cookie, id);
    const res = await request(app).get('/api/v1/me/profile').set('Cookie', author.cookie);
    const mine = res.body.data.experiences.find((e) => e.id === id);
    assert.equal(mine.pendingUpdate.outcome, 'selected');
    assert.equal(mine.pendingUpdate.rounds.length, 2);
  });

  test('only the author can request one', async () => {
    const { id } = await livePost();
    const other = await signIn();
    assert.equal((await update(other.cookie, id)).status, 403);
  });

  test('only for posts that are still in process', async () => {
    const { author, id } = await livePost('selected');
    assert.equal((await update(author.cookie, id)).status, 409);
  });

  test('rounds are required and validated', async () => {
    const { author, id } = await livePost();
    assert.equal((await update(author.cookie, id, { outcome: 'selected', rounds: [] })).status, 422);
    assert.equal((await update(author.cookie, id, { outcome: 'hired', rounds: [round1] })).status, 422);
  });

  test('the author can withdraw it', async () => {
    const { author, id } = await livePost();
    await update(author.cookie, id);
    const res = await request(app).delete(`/api/v1/experiences/${id}/result-update`).set('Cookie', author.cookie);
    assert.equal(res.status, 200);
    const profile = await request(app).get('/api/v1/me/profile').set('Cookie', author.cookie);
    assert.equal(profile.body.data.experiences.find((e) => e.id === id).pendingUpdate, undefined);
  });
});

describe('reviewing a result update', () => {
  test('the admin queue lists it with the proposed result', async () => {
    const { author, id } = await livePost();
    await update(author.cookie, id);
    const admin = await signIn({ admin: true });
    const res = await request(app).get('/api/v1/admin/experiences/updates').set('Cookie', admin.cookie);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].outcome, 'in-process');
    assert.equal(res.body.data[0].pendingUpdate.outcome, 'selected');
  });

  test('approval swaps the update in without unpublishing the post', async () => {
    const { author, id } = await livePost();
    await update(author.cookie, id);
    const admin = await signIn({ admin: true });
    const res = await request(app).post(`/api/v1/admin/experiences/${id}/update/approve`).set('Cookie', admin.cookie);
    assert.equal(res.status, 200);

    const pub = await request(app).get(`/api/v1/experiences/${id}`);
    assert.equal(pub.body.data.outcome, 'selected');
    assert.deepEqual(pub.body.data.rounds.map((r) => r.name), ['Online Assessment', 'Technical Interview']);
    assert.equal(pub.body.data.rounds[0].questions[0].topic, 'Arrays');

    const company = await Company.findOne({ slug: 'dream11' });
    assert.equal(company.experienceCount, 1, 'the count must not change: the post never left the site');
  });

  test('rejection leaves the live post as it was and tells the author why', async () => {
    const { author, id } = await livePost();
    await update(author.cookie, id);
    const admin = await signIn({ admin: true });
    await request(app).post(`/api/v1/admin/experiences/${id}/update/reject`).set('Cookie', admin.cookie).send({ note: 'Add the questions from round 2.' });

    const pub = await request(app).get(`/api/v1/experiences/${id}`);
    assert.equal(pub.body.data.outcome, 'in-process');
    const profile = await request(app).get('/api/v1/me/profile').set('Cookie', author.cookie);
    const mine = profile.body.data.experiences.find((e) => e.id === id);
    assert.equal(mine.pendingUpdate, undefined);
    assert.equal(mine.updateReviewNote, 'Add the questions from round 2.');
  });

  test('approving when nothing is waiting is a 409', async () => {
    const { id } = await livePost();
    const admin = await signIn({ admin: true });
    const res = await request(app).post(`/api/v1/admin/experiences/${id}/update/approve`).set('Cookie', admin.cookie);
    assert.equal(res.status, 409);
  });

  test('students cannot reach the update queue', async () => {
    const student = await signIn();
    const res = await request(app).get('/api/v1/admin/experiences/updates').set('Cookie', student.cookie);
    assert.equal(res.status, 403);
  });
});
