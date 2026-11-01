/**
 * Editing an approved post: the approved version stays live until an admin
 * approves the new one.
 */
import { test, before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, approve, connectTestDatabase, clearTestDatabase, closeTestDatabase } from './helpers.js';
import { authService } from '../src/services/authService.js';
import { SESSION_COOKIE } from '../src/lib/cookies.js';
import { Company } from '../src/models/Company.js';
import { Experience } from '../src/models/Experience.js';
import { User } from '../src/models/User.js';

before(async () => { await connectTestDatabase(); });
after(async () => { await closeTestDatabase(); });
beforeEach(async () => { await clearTestDatabase(); });

let n = 0;
async function signIn({ admin = false } = {}) {
  n += 1;
  const user = await authService.signInWithGoogle({ googleId: `le-${n}`, email: `le${n}@nst.rishihood.edu.in`, name: `Student ${n}` });
  await User.updateOne({ _id: user._id }, { $set: { graduationBatch: 2027, branch: 'CSE', ...(admin && { role: 'admin' }) } });
  const token = await authService.createSession({ userId: user._id, mode: admin ? 'admin' : 'student' });
  return { user, cookie: `${SESSION_COOKIE}=${token}` };
}

const round = { name: 'DSA Round', questions: [{ text: 'Merge intervals', topic: 'Arrays' }], tips: 'Practise.' };

async function livePost(overrides = {}) {
  const author = await signIn();
  const res = await request(app).post('/api/v1/experiences').set('Cookie', author.cookie).send({
    company: 'Zuvees', role: 'Backend Intern', driveType: 'on-campus', interviewYear: 2025, interviewMonth: 8,
    outcome: 'rejected', rounds: [round], isAnonymous: false, ...overrides,
  });
  await approve(res.body.data.id);
  return { author, id: res.body.data.id };
}

const edit = (cookie, id, body) => request(app).patch(`/api/v1/experiences/${id}`).set('Cookie', cookie).send(body);
const live = (id) => request(app).get(`/api/v1/experiences/${id}`);
const count = async (slug) => (await Company.findOne({ slug }).exec())?.experienceCount;

describe('editing a live post', () => {
  test('the post stays live and unchanged, and the count does not move, until approval', async () => {
    const { author, id } = await livePost();
    const before = await live(id);

    const res = await edit(author.cookie, id, { role: 'SDE Intern' });
    assert.equal(res.status, 200);

    const after = await live(id);
    assert.equal(after.status, 200);
    assert.equal(after.body.data.role, 'Backend Intern');
    assert.equal(after.body.data.pendingUpdate, undefined, 'unreviewed words must not reach readers');
    assert.equal(after.body.data.updatedAt, before.body.data.updatedAt);
    assert.equal(await count('zuvees'), 1);

    const mine = await request(app).get('/api/v1/experiences/mine').set('Cookie', author.cookie);
    assert.equal(mine.body.data[0].pendingUpdate.role, 'SDE Intern');
  });

  test('sending one field keeps the rest, including the rounds', async () => {
    const { author, id } = await livePost();
    await edit(author.cookie, id, { role: 'SDE Intern' });

    const stored = await Experience.findById(id).exec();
    assert.equal(stored.pendingUpdate.rounds.length, 1);
    assert.equal(stored.pendingUpdate.rounds[0].questions[0].topic, 'Arrays');
    assert.equal(stored.pendingUpdate.interviewMonth, 8);
    assert.equal(stored.pendingUpdate.outcome, 'rejected');
  });

  test('approval swaps every edited field in and marks the post as updated', async () => {
    const { author, id } = await livePost();
    const admin = await signIn({ admin: true });

    await edit(author.cookie, id, {
      role: 'SDE Intern', driveType: 'referral', interviewYear: 2024, interviewMonth: 2, outcome: 'selected',
      rounds: [round, { name: 'HR', questions: [] }],
    });

    const queue = await request(app).get('/api/v1/admin/experiences/updates').set('Cookie', admin.cookie);
    assert.equal(queue.body.data.length, 1);
    assert.equal(queue.body.data[0].pendingUpdate.role, 'SDE Intern');

    const res = await request(app).post(`/api/v1/admin/experiences/${id}/update/approve`).set('Cookie', admin.cookie);
    assert.equal(res.status, 200);

    const { data } = (await live(id)).body;
    assert.equal(data.role, 'SDE Intern');
    assert.equal(data.driveType, 'referral');
    assert.equal(data.interviewYear, 2024);
    assert.equal(data.interviewMonth, 2);
    assert.equal(data.outcome, 'selected');
    assert.equal(data.rounds.length, 2);
    assert.ok(data.updatedAt, 'readers can see it was updated');
    assert.equal((await Experience.findById(id).exec()).pendingUpdate, undefined);
    assert.equal(await count('zuvees'), 1);
  });

  test('a rejected edit leaves the live post alone and tells the author why', async () => {
    const { author, id } = await livePost();
    const admin = await signIn({ admin: true });
    await edit(author.cookie, id, { role: 'SDE Intern' });

    await request(app).post(`/api/v1/admin/experiences/${id}/update/reject`).set('Cookie', admin.cookie).send({ note: 'Names the interviewer.' });

    assert.equal((await live(id)).body.data.role, 'Backend Intern');
    const mine = await request(app).get('/api/v1/experiences/mine').set('Cookie', author.cookie);
    assert.equal(mine.body.data[0].pendingUpdate, undefined);
    assert.equal(mine.body.data[0].updateReviewNote, 'Names the interviewer.');
  });

  test('changing the company moves the count on approval, not before', async () => {
    const { author, id } = await livePost();
    const admin = await signIn({ admin: true });

    await edit(author.cookie, id, { company: 'Dream11' });
    assert.equal(await count('dream11'), undefined, 'no company is created for an edit nobody approved');

    await request(app).post(`/api/v1/admin/experiences/${id}/update/approve`).set('Cookie', admin.cookie);
    assert.equal((await live(id)).body.data.company.slug, 'dream11');
    assert.equal(await count('zuvees'), 0);
    assert.equal(await count('dream11'), 1);
  });

  test('going anonymous applies at once; going back to a name waits for review', async () => {
    const { author, id } = await livePost();
    const admin = await signIn({ admin: true });

    await edit(author.cookie, id, { isAnonymous: true, role: 'SDE Intern' });
    const hidden = (await live(id)).body.data;
    assert.equal(hidden.author.anonymous, true);
    assert.equal(hidden.author.name, undefined);
    assert.equal(hidden.role, 'Backend Intern', 'the rest of the edit still waits');

    await request(app).post(`/api/v1/admin/experiences/${id}/update/approve`).set('Cookie', admin.cookie);
    assert.equal((await Experience.findById(id).exec()).authorBranch, undefined);

    await edit(author.cookie, id, { isAnonymous: false });
    assert.equal((await live(id)).body.data.author.anonymous, true);

    await request(app).post(`/api/v1/admin/experiences/${id}/update/approve`).set('Cookie', admin.cookie);
    const named = (await live(id)).body.data;
    assert.equal(named.author.anonymous, false);
    assert.equal(named.author.branch, 'CSE');
  });

  test('a future date is refused against the saved month', async () => {
    const { author, id } = await livePost();
    const res = await edit(author.cookie, id, { interviewYear: 2100 });
    assert.equal(res.status, 422);
    assert.equal((await Experience.findById(id).exec()).pendingUpdate, undefined);
  });

  test('an older post with no month can gain one through an edit', async () => {
    const { author, id } = await livePost();
    const admin = await signIn({ admin: true });
    await Experience.updateOne({ _id: id }, { $unset: { interviewMonth: 1 } });

    await edit(author.cookie, id, { interviewMonth: 5 });
    await request(app).post(`/api/v1/admin/experiences/${id}/update/approve`).set('Cookie', admin.cookie);
    assert.equal((await live(id)).body.data.interviewMonth, 5);
  });

  test('a result update still changes only the outcome and rounds', async () => {
    const { author, id } = await livePost({ outcome: 'in-process' });
    const admin = await signIn({ admin: true });

    await request(app).post(`/api/v1/experiences/${id}/result-update`).set('Cookie', author.cookie).send({ outcome: 'selected', rounds: [round] });
    await request(app).post(`/api/v1/admin/experiences/${id}/update/approve`).set('Cookie', admin.cookie);

    const { data } = (await live(id)).body;
    assert.equal(data.outcome, 'selected');
    assert.equal(data.role, 'Backend Intern');
    assert.equal(data.company.slug, 'zuvees');
    assert.equal(data.author.anonymous, false);
  });

  test('a stranger cannot edit a live post', async () => {
    const { id } = await livePost();
    const stranger = await signIn();
    assert.equal((await edit(stranger.cookie, id, { role: 'Hijacked' })).status, 403);
  });
});

describe('editing a post that is not live', () => {
  test('an edit to a hidden post keeps it hidden, and fields not sent are kept', async () => {
    const { author, id } = await livePost();
    await request(app).post(`/api/v1/experiences/${id}/unpublish`).set('Cookie', author.cookie);

    const res = await edit(author.cookie, id, { role: 'SDE Intern' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'unpublished');
    assert.equal(res.body.data.role, 'SDE Intern');
    assert.equal(res.body.data.rounds.length, 1);
    assert.equal(res.body.data.author.anonymous, false);
  });
});
