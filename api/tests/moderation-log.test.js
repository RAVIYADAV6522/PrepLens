/**
 * The moderation record: every decision is attributable, and none erases another.
 * Spec MOD-04, MOD-05.
 */
import { test, before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, approve, connectTestDatabase, clearTestDatabase, closeTestDatabase } from './helpers.js';
import { authService } from '../src/services/authService.js';
import { SESSION_COOKIE } from '../src/lib/cookies.js';
import { Company } from '../src/models/Company.js';
import { ModerationLog } from '../src/models/ModerationLog.js';
import { Report } from '../src/models/Report.js';
import { User } from '../src/models/User.js';

before(async () => { await connectTestDatabase(); });
after(async () => { await closeTestDatabase(); });
beforeEach(async () => { await clearTestDatabase(); });

let n = 0;
async function signIn({ admin = false } = {}) {
  n += 1;
  const user = await authService.signInWithGoogle({
    googleId: `log-${n}`,
    email: `log${n}@nst.rishihood.edu.in`,
    name: `Person ${n}`,
  });
  await User.updateOne({ _id: user._id }, { $set: { graduationBatch: 2027, branch: 'CSE', ...(admin && { role: 'admin' }) } });
  const token = await authService.createSession({ userId: user._id, mode: admin ? 'admin' : 'student' });
  return { user, cookie: `${SESSION_COOKIE}=${token}` };
}

const body = {
  company: 'Zuvees',
  role: 'Backend Intern',
  driveType: 'on-campus',
  interviewYear: 2026,
  interviewMonth: 3,
  outcome: 'rejected',
  rounds: [{ name: 'DSA', questions: [{ text: 'Binary search' }] }],
};

async function livePost() {
  const author = await signIn();
  const created = await request(app).post('/api/v1/experiences').set('Cookie', author.cookie).send(body);
  await approve(created.body.data.id);
  return { author, id: created.body.data.id };
}

const report = (id, who) => request(app).post(`/api/v1/experiences/${id}/report`).set('Cookie', who.cookie).send({ reason: 'false' });
const remove = (id, who) => request(app).post(`/api/v1/admin/experiences/${id}/remove`).set('Cookie', who.cookie).send({});
const reinstate = (id, who) => request(app).post(`/api/v1/admin/experiences/${id}/reinstate`).set('Cookie', who.cookie).send({});

describe('the moderation log', () => {
  test('reinstating keeps the record of who removed the post (MOD-05)', async () => {
    const { id } = await livePost();
    const remover = await signIn({ admin: true });
    const restorer = await signIn({ admin: true });
    await report(id, await signIn());

    assert.equal((await remove(id, remover)).status, 200);
    assert.equal((await reinstate(id, restorer)).status, 200);

    const entries = await ModerationLog.find({ experienceId: id, action: { $in: ['remove', 'reinstate'] } }).sort({ createdAt: 1, _id: 1 }).exec();
    assert.deepEqual(entries.map((e) => e.action), ['remove', 'reinstate']);
    assert.equal(entries[0].adminId.toString(), remover.user._id.toString());
    assert.equal(entries[1].adminId.toString(), restorer.user._id.toString());

    // The report still names the person who acted on it.
    const stored = await Report.findOne({ experienceId: id }).exec();
    assert.equal(stored.status, 'actioned');
    assert.equal(stored.resolvedBy.toString(), remover.user._id.toString());
  });

  test('a removal with no report behind it is still attributable (MOD-04)', async () => {
    const { id } = await livePost();
    const admin = await signIn({ admin: true });

    await remove(id, admin);

    const entry = await ModerationLog.findOne({ experienceId: id, action: 'remove' }).exec();
    assert.equal(entry.adminId.toString(), admin.user._id.toString());
    assert.equal(entry.companyName, 'Zuvees');
    assert.equal(entry.role, 'Backend Intern');
  });

  test('removing a post settles every open report on it, and only those', async () => {
    const { id } = await livePost();
    const other = await livePost();
    const admin = await signIn({ admin: true });
    await report(id, await signIn());
    await report(id, await signIn());
    await report(other.id, await signIn());

    await remove(id, admin);

    assert.equal(await Report.countDocuments({ experienceId: id, status: 'actioned' }), 2);
    assert.equal(await Report.countDocuments({ experienceId: other.id, status: 'open' }), 1);
  });

  test('a post cannot be removed twice, which would blur who removed it', async () => {
    const { id } = await livePost();
    const admin = await signIn({ admin: true });

    await remove(id, admin);
    assert.equal((await remove(id, admin)).status, 409);
    assert.equal(await ModerationLog.countDocuments({ experienceId: id, action: 'remove' }), 1);
  });

  test('review decisions and dismissals are logged with the admin who made them', async () => {
    const author = await signIn();
    const admin = await signIn({ admin: true });
    const created = await request(app).post('/api/v1/experiences').set('Cookie', author.cookie).send(body);
    const { id } = created.body.data;

    await request(app).post(`/api/v1/admin/experiences/${id}/approve`).set('Cookie', admin.cookie).send({});
    await report(id, await signIn());
    const { _id: reportId } = await Report.findOne({ experienceId: id }).exec();
    assert.equal((await request(app).post(`/api/v1/admin/reports/${reportId}/dismiss`).set('Cookie', admin.cookie).send({})).status, 200);

    const entries = await ModerationLog.find({ experienceId: id, adminId: admin.user._id }).sort({ createdAt: 1, _id: 1 }).exec();
    assert.deepEqual(entries.map((e) => e.action), ['approve', 'dismiss-report']);
    assert.equal(entries[1].reportId.toString(), reportId.toString());
  });

  test('a settled report cannot be dismissed, which would overwrite who settled it', async () => {
    const { id } = await livePost();
    const remover = await signIn({ admin: true });
    const other = await signIn({ admin: true });
    await report(id, await signIn());
    await remove(id, remover);
    const { _id: reportId } = await Report.findOne({ experienceId: id }).exec();

    assert.equal((await request(app).post(`/api/v1/admin/reports/${reportId}/dismiss`).set('Cookie', other.cookie).send({})).status, 409);

    const stored = await Report.findById(reportId).exec();
    assert.equal(stored.resolvedBy.toString(), remover.user._id.toString());
  });

  test('the record outlives a post its author permanently deletes', async () => {
    const { author, id } = await livePost();
    await remove(id, await signIn({ admin: true }));

    assert.equal((await request(app).delete(`/api/v1/experiences/${id}`).set('Cookie', author.cookie)).status, 204);

    const entry = await ModerationLog.findOne({ experienceId: id, action: 'remove' }).exec();
    assert.equal(entry.companyName, 'Zuvees');
  });

  test('rows cannot be changed or deleted through the model', async () => {
    const { id } = await livePost();
    await remove(id, await signIn({ admin: true }));
    const entry = await ModerationLog.findOne({ experienceId: id, action: 'remove' }).exec();

    await assert.rejects(ModerationLog.updateOne({ _id: entry._id }, { $set: { action: 'approve' } }).exec(), /append-only/);
    await assert.rejects(ModerationLog.findOneAndUpdate({ _id: entry._id }, { $set: { action: 'approve' } }).exec(), /append-only/);
    await assert.rejects(ModerationLog.deleteOne({ _id: entry._id }).exec(), /append-only/);
    await assert.rejects(ModerationLog.deleteMany({}).exec(), /append-only/);
    await assert.rejects(entry.deleteOne(), /append-only/);
    entry.action = 'approve';
    await assert.rejects(entry.save(), /append-only/);

    assert.equal((await ModerationLog.findById(entry._id).exec()).action, 'remove');
  });
});

describe('the removed list', () => {
  test('shows admins who removed each post, so it can be reinstated', async () => {
    const { id } = await livePost();
    const admin = await signIn({ admin: true });
    await remove(id, admin);

    const res = await request(app).get('/api/v1/admin/experiences/removed').set('Cookie', admin.cookie);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].id, id);
    assert.equal(res.body.data[0].removedBy, admin.user.name);
    assert.ok(res.body.data[0].removedAt);

    await reinstate(id, admin);
    const after = await request(app).get('/api/v1/admin/experiences/removed').set('Cookie', admin.cookie);
    assert.equal(after.body.data.length, 0);
    assert.equal((await Company.findOne({ slug: 'zuvees' }).exec()).experienceCount, 1);
  });

  test('is admin-only', async () => {
    assert.equal((await request(app).get('/api/v1/admin/experiences/removed')).status, 401);
    const student = await signIn();
    assert.equal((await request(app).get('/api/v1/admin/experiences/removed').set('Cookie', student.cookie)).status, 403);
  });
});
