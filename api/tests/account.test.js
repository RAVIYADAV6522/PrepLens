/**
 * Deleting an account. Spec CONS-05.
 */
import { test, before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, approve, connectTestDatabase, clearTestDatabase, closeTestDatabase } from './helpers.js';
import { authService } from '../src/services/authService.js';
import { SESSION_COOKIE } from '../src/lib/cookies.js';
import { Bookmark } from '../src/models/Bookmark.js';
import { Company } from '../src/models/Company.js';
import { Experience } from '../src/models/Experience.js';
import { Report } from '../src/models/Report.js';
import { Session } from '../src/models/Session.js';
import { User } from '../src/models/User.js';
import { Vote } from '../src/models/Vote.js';

before(async () => { await connectTestDatabase(); });
after(async () => { await closeTestDatabase(); });
beforeEach(async () => { await clearTestDatabase(); });

let n = 0;
async function signIn({ admin = false, mode } = {}) {
  n += 1;
  const user = await authService.signInWithGoogle({
    googleId: `acct-${n}`,
    email: `acct${n}@nst.rishihood.edu.in`,
    name: `Person ${n}`,
  });
  await User.updateOne({ _id: user._id }, { $set: { graduationBatch: 2027, branch: 'CSE', ...(admin && { role: 'admin' }) } });
  const token = await authService.createSession({ userId: user._id, mode: mode ?? (admin ? 'admin' : 'student') });
  return { user, cookie: `${SESSION_COOKIE}=${token}` };
}

const body = (overrides = {}) => ({
  company: 'Zuvees',
  role: 'Backend Intern',
  driveType: 'on-campus',
  interviewYear: 2026,
  interviewMonth: 3,
  outcome: 'in-process',
  rounds: [{ name: 'DSA', questions: [{ text: 'Binary search' }] }],
  ...overrides,
});

const post = async (who, overrides) =>
  (await request(app).post('/api/v1/experiences').set('Cookie', who.cookie).send(body(overrides))).body.data.id;

async function livePost(who, overrides) {
  const id = await post(who, overrides);
  await approve(id);
  return id;
}

const deleteAccount = (who, posts = 'keep') => request(app).delete(`/api/v1/me?posts=${posts}`).set('Cookie', who.cookie);

describe('deleting an account', () => {
  test('needs a session, and an explicit choice about the posts', async () => {
    assert.equal((await request(app).delete('/api/v1/me?posts=keep')).status, 401);

    const who = await signIn();
    assert.equal((await request(app).delete('/api/v1/me').set('Cookie', who.cookie)).status, 422);
    assert.equal((await request(app).delete('/api/v1/me?posts=maybe').set('Cookie', who.cookie)).status, 422);
    assert.ok(await User.findById(who.user._id).exec(), 'nothing happened');
  });

  test('removes the user, every session, and the cookie stops working', async () => {
    const who = await signIn();
    await authService.createSession({ userId: who.user._id });

    const res = await deleteAccount(who);

    assert.equal(res.status, 204);
    assert.equal(await User.countDocuments({ _id: who.user._id }), 0);
    assert.equal(await Session.countDocuments({ userId: who.user._id }), 0);
    assert.equal((await request(app).get('/api/v1/auth/me').set('Cookie', who.cookie)).status, 204);
  });

  test('keep: a live post stays, with no way back to its author (CONS-05)', async () => {
    const who = await signIn();
    const id = await livePost(who);

    await deleteAccount(who, 'keep');

    const res = await request(app).get(`/api/v1/experiences/${id}`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.author, { anonymous: true, graduationBatch: 2027 });

    const stored = await Experience.findById(id).lean().exec();
    assert.equal(stored.submittedBy, null);
    assert.equal(stored.isAnonymous, true);
    assert.ok(!('authorBranch' in stored), 'the branch is gone from storage, not just hidden');
    assert.equal((await Company.findOne({ slug: 'zuvees' }).exec()).experienceCount, 1);
  });

  test('keep: does not mark the post as edited, or regenerate its AI guide', async () => {
    const who = await signIn();
    const id = await livePost(who);
    const before = await Experience.findById(id).lean().exec();

    await deleteAccount(who, 'keep');

    const after = await Experience.findById(id).lean().exec();
    assert.equal(after.updatedAt.getTime(), before.updatedAt.getTime());
  });

  test('keep: a waiting update is dropped, so approval cannot bring the branch back', async () => {
    const who = await signIn();
    const id = await livePost(who);
    await request(app).post(`/api/v1/experiences/${id}/result-update`).set('Cookie', who.cookie)
      .send({ outcome: 'selected', rounds: body().rounds });
    assert.ok((await Experience.findById(id).exec()).pendingUpdate);

    await deleteAccount(who, 'keep');

    const stored = await Experience.findById(id).lean().exec();
    assert.ok(!('pendingUpdate' in stored));
    assert.equal(stored.outcome, 'in-process');
  });

  test('keep: posts that were not public are deleted, because nobody could manage them', async () => {
    const who = await signIn();
    const pending = await post(who);
    const hidden = await livePost(who, { company: 'Hidden Co' });
    await request(app).post(`/api/v1/experiences/${hidden}/unpublish`).set('Cookie', who.cookie);

    await deleteAccount(who, 'keep');

    assert.equal(await Experience.countDocuments({ _id: { $in: [pending, hidden] } }), 0);
  });

  test('keep: a moderator-removed post stays removed and detached', async () => {
    const who = await signIn();
    const admin = await signIn({ admin: true });
    const id = await livePost(who);
    await request(app).post(`/api/v1/admin/experiences/${id}/remove`).set('Cookie', admin.cookie).send({});

    await deleteAccount(who, 'keep');

    const stored = await Experience.findById(id).exec();
    assert.equal(stored.status, 'removed');
    assert.equal(stored.submittedBy, null);
  });

  test('delete: every post goes, with its votes and bookmarks, and the counts follow', async () => {
    const who = await signIn();
    const reader = await signIn();
    const id = await livePost(who);
    await post(who);
    await request(app).post(`/api/v1/experiences/${id}/upvote`).set('Cookie', reader.cookie);
    await request(app).post(`/api/v1/experiences/${id}/bookmark`).set('Cookie', reader.cookie);

    await deleteAccount(who, 'delete');

    assert.equal(await Experience.countDocuments({}), 0);
    assert.equal(await Vote.countDocuments({ experienceId: id }), 0);
    assert.equal(await Bookmark.countDocuments({ experienceId: id }), 0);
    assert.equal((await Company.findOne({ slug: 'zuvees' }).exec()).experienceCount, 0);
  });

  test("their upvotes come off other people's posts, and their bookmarks go", async () => {
    const author = await signIn();
    const who = await signIn();
    const other = await signIn();
    const id = await livePost(author);
    await request(app).post(`/api/v1/experiences/${id}/upvote`).set('Cookie', who.cookie);
    await request(app).post(`/api/v1/experiences/${id}/upvote`).set('Cookie', other.cookie);
    await request(app).post(`/api/v1/experiences/${id}/bookmark`).set('Cookie', who.cookie);
    const before = await Experience.findById(id).lean().exec();

    await deleteAccount(who);

    const after = await Experience.findById(id).lean().exec();
    assert.equal(after.upvoteCount, 1);
    assert.equal(after.updatedAt.getTime(), before.updatedAt.getTime());
    assert.equal(await Vote.countDocuments({ userId: who.user._id }), 0);
    assert.equal(await Bookmark.countDocuments({ userId: who.user._id }), 0);
  });

  test('a report they filed stays in the queue, without their id', async () => {
    const author = await signIn();
    const who = await signIn();
    const admin = await signIn({ admin: true });
    const id = await livePost(author);
    await request(app).post(`/api/v1/experiences/${id}/report`).set('Cookie', who.cookie).send({ reason: 'false' });

    await deleteAccount(who);

    const stored = await Report.findOne({ experienceId: id }).exec();
    assert.equal(stored.status, 'open');
    assert.equal(stored.reporterId, null);

    const queue = await request(app).get('/api/v1/admin/reports').set('Cookie', admin.cookie);
    assert.equal(queue.body.data.length, 1);
  });

  test("leaves other people's posts and accounts alone", async () => {
    const who = await signIn();
    const other = await signIn();
    const theirs = await livePost(other);

    await deleteAccount(who, 'delete');

    assert.ok(await User.findById(other.user._id).exec());
    const stored = await Experience.findById(theirs).exec();
    assert.equal(stored.submittedBy.toString(), other.user._id.toString());
  });

  test('an admin account is refused, in either kind of session, so the log keeps its names', async () => {
    const asAdmin = await signIn({ admin: true });
    const asStudent = await signIn({ admin: true, mode: 'student' });

    assert.equal((await deleteAccount(asAdmin)).status, 409);
    assert.equal((await deleteAccount(asStudent)).status, 409);
    assert.ok(await User.findById(asAdmin.user._id).exec());
    assert.ok(await User.findById(asStudent.user._id).exec());
  });
});
