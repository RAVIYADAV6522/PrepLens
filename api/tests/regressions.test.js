/**
 * Bugs found in the project audit of 2 Nov 2026, each pinned by a test.
 */
import { test, before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, approve, connectTestDatabase, clearTestDatabase, closeTestDatabase } from './helpers.js';
import { authService } from '../src/services/authService.js';
import { interactionService } from '../src/services/interactionService.js';
import { fingerprintOf } from '../src/services/companyGuideService.js';
import { experienceRepository } from '../src/repositories/experienceRepository.js';
import { SESSION_COOKIE } from '../src/lib/cookies.js';
import { Experience } from '../src/models/Experience.js';
import { User } from '../src/models/User.js';

before(async () => { await connectTestDatabase(); });
after(async () => { await closeTestDatabase(); });
beforeEach(async () => { await clearTestDatabase(); });

let n = 0;
async function signIn({ admin = false } = {}) {
  n += 1;
  const user = await authService.signInWithGoogle({
    googleId: `reg-${n}`,
    email: `reg${n}@nst.rishihood.edu.in`,
    name: `Person ${n}`,
  });
  await User.updateOne({ _id: user._id }, { $set: { graduationBatch: 2027, branch: 'CSE', ...(admin && { role: 'admin' }) } });
  const token = await authService.createSession({ userId: user._id, mode: admin ? 'admin' : 'student' });
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

async function livePost(who, overrides) {
  const res = await request(app).post('/api/v1/experiences').set('Cookie', who.cookie).send(body(overrides));
  await approve(res.body.data.id);
  return res.body.data.id;
}

describe('an upvote is not an edit', () => {
  test('voting leaves updatedAt alone, so it cannot throw away the AI guide', async () => {
    const author = await signIn();
    const reader = await signIn();
    const id = await livePost(author);

    const guideKey = async () => fingerprintOf(await experienceRepository.findPublishedForGuide('zuvees'));
    const keyBefore = await guideKey();
    const { updatedAt } = await Experience.findById(id).lean().exec();

    await request(app).post(`/api/v1/experiences/${id}/upvote`).set('Cookie', reader.cookie);
    await request(app).delete(`/api/v1/experiences/${id}/upvote`).set('Cookie', reader.cookie);

    const after = await Experience.findById(id).lean().exec();
    assert.equal(after.updatedAt.getTime(), updatedAt.getTime());
    assert.equal(await guideKey(), keyBefore);
  });

  test('repairing a drifted count is not an edit either', async () => {
    const id = await livePost(await signIn());
    await Experience.updateOne({ _id: id }, { $set: { upvoteCount: 9 } }, { timestamps: false });
    const { updatedAt } = await Experience.findById(id).lean().exec();

    await interactionService.reconcileVoteCounts();

    const after = await Experience.findById(id).lean().exec();
    assert.equal(after.upvoteCount, 0);
    assert.equal(after.updatedAt.getTime(), updatedAt.getTime());
  });
});

describe('result updates', () => {
  test('a post shared with no rounds can still get its result, as the page promises', async () => {
    const author = await signIn();
    const id = await livePost(author, { rounds: [] });

    const res = await request(app).post(`/api/v1/experiences/${id}/result-update`).set('Cookie', author.cookie)
      .send({ outcome: 'selected', rounds: [] });

    assert.equal(res.status, 200);
    assert.equal((await Experience.findById(id).exec()).pendingUpdate.outcome, 'selected');
  });

  test('an update still cannot wipe the rounds a post already has', async () => {
    const author = await signIn();
    const id = await livePost(author);

    const res = await request(app).post(`/api/v1/experiences/${id}/result-update`).set('Cookie', author.cookie)
      .send({ outcome: 'selected', rounds: [] });

    assert.equal(res.status, 422);
  });
});

describe('admin company actions on a company that does not exist', () => {
  test('approving answers 404, not a server error', async () => {
    const admin = await signIn({ admin: true });
    const res = await request(app).post('/api/v1/admin/companies/nobody/approve').set('Cookie', admin.cookie).send({});
    assert.equal(res.status, 404);
  });

  test('merging answers 404, not a server error', async () => {
    const admin = await signIn({ admin: true });
    const res = await request(app).post('/api/v1/admin/companies/nobody/merge').set('Cookie', admin.cookie).send({ into: 'nowhere' });
    assert.equal(res.status, 404);
  });
});
