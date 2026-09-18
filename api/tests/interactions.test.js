/**
 * Phase 2 — upvotes, bookmarks, deletion, profile.
 *
 * The headline test is concurrency: ten simultaneous upvotes from one user
 * must leave the count at exactly 1. A "check then insert" implementation
 * passes every sequential test and fails this one.
 */
import { test, before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, connectTestDatabase, clearTestDatabase, closeTestDatabase } from './helpers.js';
import { authService } from '../src/services/authService.js';
import { interactionService } from '../src/services/interactionService.js';
import { SESSION_COOKIE } from '../src/lib/cookies.js';
import { User } from '../src/models/User.js';
import { Vote } from '../src/models/Vote.js';
import { Bookmark } from '../src/models/Bookmark.js';
import { Experience } from '../src/models/Experience.js';
import { Report } from '../src/models/Report.js';
import { Company } from '../src/models/Company.js';

before(async () => { await connectTestDatabase(); });
after(async () => { await closeTestDatabase(); });
beforeEach(async () => { await clearTestDatabase(); });

let n = 0;
async function signIn({ admin = false } = {}) {
  n += 1;
  const user = await authService.signInWithGoogle({
    googleId: `i-${n}`, email: `s${n}@nst.rishihood.edu.in`, name: `Student ${n}`,
  });
  await User.updateOne({ _id: user._id }, { $set: { graduationBatch: 2027, branch: 'CSE', ...(admin && { role: 'admin' }) } });
  return { user, cookie: `${SESSION_COOKIE}=${await authService.createSession({ userId: user._id })}` };
}

async function post(cookie, company = 'Zuvees') {
  const res = await request(app).post('/api/v1/experiences').set('Cookie', cookie).send({
    company, role: 'Backend Intern', driveType: 'on-campus', interviewYear: 2026,
    outcome: 'rejected', isAnonymous: false,
    rounds: [{ name: 'DSA Round', questions: [{ text: 'Binary search' }], tips: 'Practise.' }],
  });
  assert.equal(res.status, 201);
  return res.body.data.id;
}

describe('upvoting (VOTE-01 … VOTE-04)', () => {
  test('an upvote increments the count and reports the new value', async () => {
    const author = await signIn();
    const reader = await signIn();
    const id = await post(author.cookie);

    const res = await request(app).post(`/api/v1/experiences/${id}/upvote`).set('Cookie', reader.cookie);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.upvoted, true);
    assert.equal(res.body.data.upvoteCount, 1);
  });

  test('TEN CONCURRENT upvotes from one person leave the count at exactly 1 (VOTE-02)', async () => {
    const author = await signIn();
    const reader = await signIn();
    const id = await post(author.cookie);

    // A check-then-insert implementation fails here: several requests all read
    // "no vote yet" before any of them writes.
    await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app).post(`/api/v1/experiences/${id}/upvote`).set('Cookie', reader.cookie),
      ),
    );

    assert.equal(await Vote.countDocuments({ experienceId: id }), 1, 'the unique index allowed one row');

    const experience = await Experience.findById(id).exec();
    assert.equal(experience.upvoteCount, 1, 'and the counter matches');
  });

  test('two different people both count', async () => {
    const author = await signIn();
    const a = await signIn();
    const b = await signIn();
    const id = await post(author.cookie);

    await request(app).post(`/api/v1/experiences/${id}/upvote`).set('Cookie', a.cookie);
    const res = await request(app).post(`/api/v1/experiences/${id}/upvote`).set('Cookie', b.cookie);

    assert.equal(res.body.data.upvoteCount, 2);
  });

  test('an upvote can be withdrawn, and withdrawing twice is harmless', async () => {
    const author = await signIn();
    const reader = await signIn();
    const id = await post(author.cookie);

    await request(app).post(`/api/v1/experiences/${id}/upvote`).set('Cookie', reader.cookie);
    const first = await request(app).delete(`/api/v1/experiences/${id}/upvote`).set('Cookie', reader.cookie);
    const second = await request(app).delete(`/api/v1/experiences/${id}/upvote`).set('Cookie', reader.cookie);

    assert.equal(first.body.data.upvoteCount, 0);
    assert.equal(second.body.data.upvoteCount, 0, 'never goes negative');
  });

  test('a signed-out visitor cannot upvote', async () => {
    const author = await signIn();
    const id = await post(author.cookie);

    assert.equal((await request(app).post(`/api/v1/experiences/${id}/upvote`)).status, 401);
  });

  test('no public payload reveals WHO upvoted (VOTE-04)', async () => {
    const author = await signIn();
    const reader = await signIn();
    const id = await post(author.cookie);
    await request(app).post(`/api/v1/experiences/${id}/upvote`).set('Cookie', reader.cookie);

    const feed = await request(app).get('/api/v1/experiences');
    const body = JSON.stringify(feed.body);

    assert.equal(feed.body.data[0].upvoteCount, 1, 'the count is public');
    assert.equal(body.includes(reader.user._id.toString()), false, 'the voter is not');
  });

  test('reconciliation detects and repairs a drifted counter (VOTE-05)', async () => {
    const author = await signIn();
    const reader = await signIn();
    const id = await post(author.cookie);
    await request(app).post(`/api/v1/experiences/${id}/upvote`).set('Cookie', reader.cookie);

    // Simulate drift — a failed write, a manual fix, a bug.
    await Experience.updateOne({ _id: id }, { $set: { upvoteCount: 99 } });

    const result = await interactionService.reconcileVoteCounts();

    assert.equal(result.corrected, 1);
    assert.equal((await Experience.findById(id)).upvoteCount, 1);
  });
});

describe('bookmarks (BOOK-01 … BOOK-03)', () => {
  test('a bookmark is saved and appears in the private list', async () => {
    const author = await signIn();
    const reader = await signIn();
    const id = await post(author.cookie);

    await request(app).post(`/api/v1/experiences/${id}/bookmark`).set('Cookie', reader.cookie);
    const list = await request(app).get('/api/v1/me/bookmarks').set('Cookie', reader.cookie);

    assert.equal(list.body.data.length, 1);
    assert.equal(list.body.data[0].id, id);
  });

  test('bookmarking twice creates one row', async () => {
    const author = await signIn();
    const reader = await signIn();
    const id = await post(author.cookie);

    await request(app).post(`/api/v1/experiences/${id}/bookmark`).set('Cookie', reader.cookie);
    await request(app).post(`/api/v1/experiences/${id}/bookmark`).set('Cookie', reader.cookie);

    assert.equal(await Bookmark.countDocuments({}), 1);
  });

  test('nobody else can see what you bookmarked (BOOK-02)', async () => {
    const author = await signIn();
    const reader = await signIn();
    const stranger = await signIn();
    const id = await post(author.cookie);
    await request(app).post(`/api/v1/experiences/${id}/bookmark`).set('Cookie', reader.cookie);

    const theirList = await request(app).get('/api/v1/me/bookmarks').set('Cookie', stranger.cookie);
    assert.deepEqual(theirList.body.data, []);

    const feed = await request(app).get('/api/v1/experiences');
    assert.equal(JSON.stringify(feed.body).includes('bookmark'), false, 'no bookmark data in a cached payload');
  });

  test('an unpublished experience drops out of the saved list', async () => {
    const author = await signIn();
    const reader = await signIn();
    const id = await post(author.cookie);
    await request(app).post(`/api/v1/experiences/${id}/bookmark`).set('Cookie', reader.cookie);
    await request(app).post(`/api/v1/experiences/${id}/unpublish`).set('Cookie', author.cookie);

    const list = await request(app).get('/api/v1/me/bookmarks').set('Cookie', reader.cookie);
    assert.deepEqual(list.body.data, []);
  });

  test('/me/interactions reports my own state for a page of ids', async () => {
    const author = await signIn();
    const reader = await signIn();
    const id = await post(author.cookie);

    await request(app).post(`/api/v1/experiences/${id}/upvote`).set('Cookie', reader.cookie);
    await request(app).post(`/api/v1/experiences/${id}/bookmark`).set('Cookie', reader.cookie);

    const res = await request(app).get(`/api/v1/me/interactions?ids=${id}`).set('Cookie', reader.cookie);

    assert.deepEqual(res.body.data.upvoted, [id]);
    assert.deepEqual(res.body.data.bookmarked, [id]);
  });
});

describe('deleting your own experience', () => {
  test('the author can delete it permanently, and its votes go with it', async () => {
    const author = await signIn();
    const reader = await signIn();
    const id = await post(author.cookie);

    await request(app).post(`/api/v1/experiences/${id}/upvote`).set('Cookie', reader.cookie);
    await request(app).post(`/api/v1/experiences/${id}/bookmark`).set('Cookie', reader.cookie);
    await request(app).post(`/api/v1/experiences/${id}/report`).set('Cookie', reader.cookie).send({ reason: 'false' });

    const res = await request(app).delete(`/api/v1/experiences/${id}`).set('Cookie', author.cookie);
    assert.equal(res.status, 204);

    assert.equal(await Experience.countDocuments({ _id: id }), 0, 'the experience is gone');
    assert.equal(await Vote.countDocuments({ experienceId: id }), 0, 'and its votes');
    assert.equal(await Bookmark.countDocuments({ experienceId: id }), 0, 'and its bookmarks');
    assert.equal(await Report.countDocuments({ experienceId: id }), 0, 'and its reports');
  });

  test('deleting decrements the company counter', async () => {
    const author = await signIn();
    const id = await post(author.cookie);

    assert.equal((await Company.findOne({ slug: 'zuvees' })).experienceCount, 1);
    await request(app).delete(`/api/v1/experiences/${id}`).set('Cookie', author.cookie);
    assert.equal((await Company.findOne({ slug: 'zuvees' })).experienceCount, 0);
  });

  test('a stranger cannot delete it', async () => {
    const author = await signIn();
    const stranger = await signIn();
    const id = await post(author.cookie);

    assert.equal((await request(app).delete(`/api/v1/experiences/${id}`).set('Cookie', stranger.cookie)).status, 403);
    assert.equal(await Experience.countDocuments({ _id: id }), 1);
  });

  test('an ADMIN cannot delete someone else’s experience either — only change its status', async () => {
    const author = await signIn();
    const admin = await signIn({ admin: true });
    const id = await post(author.cookie);

    assert.equal((await request(app).delete(`/api/v1/experiences/${id}`).set('Cookie', admin.cookie)).status, 403);
    assert.equal(await Experience.countDocuments({ _id: id }), 1, 'moderation stays auditable and reversible');
  });
});

describe('the profile page (PROF-01)', () => {
  test('returns the user, their stats and their posts in one request', async () => {
    const author = await signIn();
    const reader = await signIn();
    const a = await post(author.cookie, 'Zuvees');
    await post(author.cookie, 'Algocept');

    await request(app).post(`/api/v1/experiences/${a}/upvote`).set('Cookie', reader.cookie);
    await request(app).post(`/api/v1/experiences/${a}/bookmark`).set('Cookie', author.cookie);

    const res = await request(app).get('/api/v1/me/profile').set('Cookie', author.cookie);

    assert.equal(res.body.data.user.name, author.user.name);
    assert.equal(res.body.data.stats.shared, 2);
    assert.equal(res.body.data.stats.published, 2);
    assert.equal(res.body.data.stats.companies, 2);
    assert.equal(res.body.data.stats.upvotesReceived, 1);
    assert.equal(res.body.data.stats.bookmarks, 1);
    assert.equal(res.body.data.experiences.length, 2);
  });

  test('it never contains an email address', async () => {
    const author = await signIn();
    await post(author.cookie);

    const res = await request(app).get('/api/v1/me/profile').set('Cookie', author.cookie);
    assert.equal(JSON.stringify(res.body).includes('@nst.rishihood.edu.in'), false);
  });

  test('it requires a session', async () => {
    assert.equal((await request(app).get('/api/v1/me/profile')).status, 401);
  });
});
