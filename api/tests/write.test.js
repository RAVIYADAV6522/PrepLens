/**
 * Block 4 — writes, consent, and moderation.
 */
import { test, before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, approve, connectTestDatabase, clearTestDatabase, closeTestDatabase } from './helpers.js';
import { authService } from '../src/services/authService.js';
import { SESSION_COOKIE } from '../src/lib/cookies.js';
import { Company } from '../src/models/Company.js';
import { Experience } from '../src/models/Experience.js';
import { Report } from '../src/models/Report.js';
import { User } from '../src/models/User.js';

before(async () => { await connectTestDatabase(); });
after(async () => { await closeTestDatabase(); });
beforeEach(async () => { await clearTestDatabase(); });

let n = 0;
async function signIn({ admin = false, batch = 2027, branch = 'CSE' } = {}) {
  n += 1;
  const user = await authService.signInWithGoogle({
    googleId: `g-${n}`,
    email: `student${n}@nst.rishihood.edu.in`,
    name: `Student ${n}`,
  });

  if (batch) await User.updateOne({ _id: user._id }, { $set: { graduationBatch: batch, branch } });
  if (admin) await User.updateOne({ _id: user._id }, { $set: { role: 'admin' } });

  const token = await authService.createSession({ userId: user._id, mode: admin ? 'admin' : 'student' });
  return { user, cookie: `${SESSION_COOKIE}=${token}` };
}

const validBody = (overrides = {}) => ({
  company: 'Zuvees',
  role: 'Backend Intern',
  driveType: 'on-campus',
  interviewYear: 2026,
  outcome: 'rejected',
  rounds: [
    { name: 'DSA Round', questions: [{ text: 'Binary search on the answer' }], tips: 'Practise BS on answers.' },
  ],
  isAnonymous: false,
  ...overrides,
});

describe('submitting (SUB-01, SUB-05, SUB-08)', () => {
  test('a signed-in student can submit, and gets the stored experience back', async () => {
    const { cookie } = await signIn();

    const res = await request(app).post('/api/v1/experiences').set('Cookie', cookie).send(validBody());

    assert.equal(res.status, 201);
    assert.equal(res.body.data.company.name, 'Zuvees');
    assert.equal(res.body.data.rounds[0].order, 1);
  });

  test('a signed-out visitor cannot submit', async () => {
    const res = await request(app).post('/api/v1/experiences').send(validBody());
    assert.equal(res.status, 401);
  });

  test('IDENTITY COMES FROM THE SESSION: a forged author in the body is ignored', async () => {
    const { user, cookie } = await signIn();
    const victim = await signIn();

    const res = await request(app)
      .post('/api/v1/experiences')
      .set('Cookie', cookie)
      .send({
        ...validBody(),
        studentName: 'Somebody Else',
        submittedBy: victim.user._id.toString(),
        authorBatch: 1999,
        status: 'removed',
        upvoteCount: 9999,
      });

    assert.equal(res.status, 201);

    const stored = await Experience.findById(res.body.data.id).exec();
    assert.equal(stored.submittedBy.toString(), user._id.toString(), 'author is the session user');
    assert.equal(stored.authorBatch, 2027, 'batch is snapshotted from the profile, not the body');
    assert.equal(stored.status, 'pending', 'status is not client-controllable — every post waits for review');
    assert.equal(stored.upvoteCount, 0);
  });

  test('a student with no graduation batch is asked to complete their profile first', async () => {
    const { cookie } = await signIn({ batch: null });

    const res = await request(app).post('/api/v1/experiences').set('Cookie', cookie).send(validBody());

    assert.equal(res.status, 422);
    assert.ok(res.body.error.fields.graduationBatch);
  });

  test('validation names the offending fields', async () => {
    const { cookie } = await signIn();

    const res = await request(app)
      .post('/api/v1/experiences')
      .set('Cookie', cookie)
      .send({ company: '', role: '', driveType: 'telepathy', interviewYear: 1800, outcome: 'maybe' });

    assert.equal(res.status, 422);
    for (const field of ['company', 'role', 'driveType', 'interviewYear', 'outcome']) {
      assert.ok(res.body.error.fields[field], `${field} reported`);
    }
  });

  test('the sixth submission in a day is refused with an explanation (SUB-08)', async () => {
    const { cookie } = await signIn();

    for (let i = 0; i < 5; i += 1) {
      const res = await request(app).post('/api/v1/experiences').set('Cookie', cookie).send(validBody());
      assert.equal(res.status, 201, `submission ${i + 1} accepted`);
    }

    const sixth = await request(app).post('/api/v1/experiences').set('Cookie', cookie).send(validBody());

    assert.equal(sixth.status, 429);
    assert.equal(sixth.body.error.code, 'RATE_LIMITED');
    assert.match(sixth.body.error.message, /5 experiences a day/);
  });

  test('the limit is keyed on the user, so one student cannot lock out another (§9)', async () => {
    const a = await signIn();
    const b = await signIn();

    for (let i = 0; i < 5; i += 1) {
      await request(app).post('/api/v1/experiences').set('Cookie', a.cookie).send(validBody());
    }

    const aBlocked = await request(app).post('/api/v1/experiences').set('Cookie', a.cookie).send(validBody());
    const bFine = await request(app).post('/api/v1/experiences').set('Cookie', b.cookie).send(validBody());

    assert.equal(aBlocked.status, 429);
    assert.equal(bFine.status, 201, 'a different student is unaffected');
  });
});

describe('company normalization (SUB-03, SUB-04) — the taxonomy fix', () => {
  test('three spellings of one company resolve to a single slug', async () => {
    const { cookie } = await signIn();

    for (const company of ['Google', 'google ', 'GOOGLE']) {
      const res = await request(app).post('/api/v1/experiences').set('Cookie', cookie).send(validBody({ company }));
      assert.equal(res.status, 201);
      assert.equal(res.body.data.company.slug, 'google');
    }

    assert.equal(await Company.countDocuments({ slug: 'google' }), 1, 'one company row, not three');
  });

  test('a known alias resolves to the canonical company', async () => {
    await Company.create({ name: 'Google', aliases: ['Google India'] });
    const { cookie } = await signIn();

    const res = await request(app).post('/api/v1/experiences').set('Cookie', cookie).send(validBody({ company: 'Google India' }));

    assert.equal(res.body.data.company.slug, 'google');
    assert.equal(await Company.countDocuments({}), 1);
  });

  test('an unknown company is queued as pending, and does not block the student', async () => {
    const { cookie } = await signIn();

    const res = await request(app).post('/api/v1/experiences').set('Cookie', cookie).send(validBody({ company: 'Brand New Startup' }));

    assert.equal(res.status, 201);
    const company = await Company.findOne({ slug: 'brand-new-startup' }).exec();
    assert.equal(company.status, 'pending', 'an admin approves it before it becomes a filter option');
  });

  test('a company name with no letters or digits is rejected', async () => {
    const { cookie } = await signIn();
    const res = await request(app).post('/api/v1/experiences').set('Cookie', cookie).send(validBody({ company: '!!!' }));

    assert.equal(res.status, 422);
    assert.ok(res.body.error.fields.company);
  });

  test('publishing increments the company counter; retracting decrements it', async () => {
    const { cookie } = await signIn();
    const res = await request(app).post('/api/v1/experiences').set('Cookie', cookie).send(validBody());

    let company = await Company.findOne({ slug: 'zuvees' }).exec();
    assert.equal(company.experienceCount, 0, 'a post waiting for review is not counted');

    await approve(res.body.data.id);
    company = await Company.findOne({ slug: 'zuvees' }).exec();
    assert.equal(company.experienceCount, 1);

    await request(app).post(`/api/v1/experiences/${res.body.data.id}/unpublish`).set('Cookie', cookie);

    company = await Company.findOne({ slug: 'zuvees' }).exec();
    assert.equal(company.experienceCount, 0);
  });
});

describe('anonymity on submit (CONS-02, CONS-03)', () => {
  test('an anonymous submission stores no branch and returns no identity', async () => {
    const { cookie } = await signIn({ branch: 'CSE-AI' });

    const res = await request(app).post('/api/v1/experiences').set('Cookie', cookie).send(validBody({ isAnonymous: true }));

    assert.equal(res.body.data.author.anonymous, true);
    assert.equal(res.body.data.author.name, undefined);
    assert.equal(res.body.data.author.branch, undefined);

    const stored = await Experience.findById(res.body.data.id).exec();
    assert.equal(stored.authorBranch, undefined, 'branch is not even stored for an anonymous post');
    assert.ok(stored.submittedBy, 'but the author is still known internally, for moderation');
  });

  test('switching an existing post to anonymous drops the branch too', async () => {
    const { cookie } = await signIn({ branch: 'CSE-AI' });
    const created = await request(app).post('/api/v1/experiences').set('Cookie', cookie).send(validBody());

    await request(app).patch(`/api/v1/experiences/${created.body.data.id}`).set('Cookie', cookie).send({ isAnonymous: true });

    const stored = await Experience.findById(created.body.data.id).exec();
    assert.equal(stored.isAnonymous, true);
    assert.equal(stored.authorBranch, undefined);
  });
});

describe('editing and retraction (SUB-07, CONS-04)', () => {
  test('only the author can edit', async () => {
    const author = await signIn();
    const stranger = await signIn();

    const created = await request(app).post('/api/v1/experiences').set('Cookie', author.cookie).send(validBody());

    const res = await request(app)
      .patch(`/api/v1/experiences/${created.body.data.id}`)
      .set('Cookie', stranger.cookie)
      .send({ role: 'Hijacked' });

    assert.equal(res.status, 403);
  });

  test('an admin cannot rewrite another student\u2019s words either — removal is a status change', async () => {
    const author = await signIn();
    const admin = await signIn({ admin: true });

    const created = await request(app).post('/api/v1/experiences').set('Cookie', author.cookie).send(validBody());

    const res = await request(app)
      .patch(`/api/v1/experiences/${created.body.data.id}`)
      .set('Cookie', admin.cookie)
      .send({ role: 'Edited by a moderator' });

    assert.equal(res.status, 403);
  });

  test('retraction is instant, needs no reason, and hides the post from everyone else', async () => {
    const { cookie } = await signIn();
    const created = await request(app).post('/api/v1/experiences').set('Cookie', cookie).send(validBody());

    const res = await request(app).post(`/api/v1/experiences/${created.body.data.id}/unpublish`).set('Cookie', cookie);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'unpublished');

    const anonymous = await request(app).get(`/api/v1/experiences/${created.body.data.id}`);
    assert.equal(anonymous.status, 404);

    const feed = await request(app).get('/api/v1/experiences');
    assert.equal(feed.body.data.length, 0);
  });

  test('an author can republish what they retracted', async () => {
    const { cookie } = await signIn();
    const created = await request(app).post('/api/v1/experiences').set('Cookie', cookie).send(validBody());
    await approve(created.body.data.id);

    await request(app).post(`/api/v1/experiences/${created.body.data.id}/unpublish`).set('Cookie', cookie);
    const res = await request(app).post(`/api/v1/experiences/${created.body.data.id}/publish`).set('Cookie', cookie);

    assert.equal(res.body.data.status, 'published', 'approved and untouched, so no second review');
  });

  test('republishing something never approved sends it to review instead', async () => {
    const { cookie } = await signIn();
    const created = await request(app).post('/api/v1/experiences').set('Cookie', cookie).send(validBody());

    await request(app).post(`/api/v1/experiences/${created.body.data.id}/unpublish`).set('Cookie', cookie);
    const res = await request(app).post(`/api/v1/experiences/${created.body.data.id}/publish`).set('Cookie', cookie);

    assert.equal(res.body.data.status, 'pending');
  });

  test('retracting twice is not an error', async () => {
    const { cookie } = await signIn();
    const created = await request(app).post('/api/v1/experiences').set('Cookie', cookie).send(validBody());

    await request(app).post(`/api/v1/experiences/${created.body.data.id}/unpublish`).set('Cookie', cookie);
    const second = await request(app).post(`/api/v1/experiences/${created.body.data.id}/unpublish`).set('Cookie', cookie);

    assert.equal(second.status, 200);
  });
});

describe('the import consent gate (IMP-02, IMP-03)', () => {
  test('an imported experience cannot be published without a consent date', async () => {
    const company = await Company.create({ name: 'Imported Co' });

    await assert.rejects(
      () =>
        Experience.create({
          companyId: company._id, companySlug: company.slug, companyName: company.name,
          role: 'Analyst', driveType: 'on-campus', interviewYear: 2025, outcome: 'selected',
          rounds: [], isAnonymous: true, authorBatch: 2025,
          status: 'published', source: 'imported', consentedAt: null,
        }),
      /consented to public hosting/,
      'the model refuses it, so no code path can publish it',
    );
  });

  test('with a consent date it is allowed', async () => {
    const company = await Company.create({ name: 'Imported Co' });

    const doc = await Experience.create({
      companyId: company._id, companySlug: company.slug, companyName: company.name,
      role: 'Analyst', driveType: 'on-campus', interviewYear: 2025, outcome: 'selected',
      rounds: [], isAnonymous: true, authorBatch: 2025,
      status: 'published', source: 'imported', consentedAt: new Date(),
    });

    assert.equal(doc.status, 'published');
  });

  test('it may be stored unpublished while consent is pending', async () => {
    const company = await Company.create({ name: 'Imported Co' });

    const doc = await Experience.create({
      companyId: company._id, companySlug: company.slug, companyName: company.name,
      role: 'Analyst', driveType: 'on-campus', interviewYear: 2025, outcome: 'selected',
      rounds: [], isAnonymous: true, authorBatch: 2025,
      status: 'unpublished', source: 'imported', consentedAt: null,
    });

    assert.equal(doc.status, 'unpublished');
  });
});

describe('reporting and moderation (MOD-01 … MOD-05)', () => {
  test('a student can report, and reporting twice is idempotent', async () => {
    const author = await signIn();
    const reporter = await signIn();
    const created = await request(app).post('/api/v1/experiences').set('Cookie', author.cookie).send(validBody());
    await approve(created.body.data.id);

    const first = await request(app)
      .post(`/api/v1/experiences/${created.body.data.id}/report`)
      .set('Cookie', reporter.cookie)
      .send({ reason: 'interviewer-named', note: 'Names the interviewer.' });

    assert.equal(first.status, 201);

    await request(app)
      .post(`/api/v1/experiences/${created.body.data.id}/report`)
      .set('Cookie', reporter.cookie)
      .send({ reason: 'interviewer-named' });

    assert.equal(await Report.countDocuments({}), 1, 'one report per person per experience');
  });

  test('a reason outside the list is rejected', async () => {
    const author = await signIn();
    const reporter = await signIn();
    const created = await request(app).post('/api/v1/experiences').set('Cookie', author.cookie).send(validBody());

    const res = await request(app)
      .post(`/api/v1/experiences/${created.body.data.id}/report`)
      .set('Cookie', reporter.cookie)
      .send({ reason: 'i just do not like it' });

    assert.equal(res.status, 422);
  });

  test('the report queue is admin-only', async () => {
    const student = await signIn();

    assert.equal((await request(app).get('/api/v1/admin/reports')).status, 401);
    assert.equal((await request(app).get('/api/v1/admin/reports').set('Cookie', student.cookie)).status, 403);
    assert.equal((await request(app).get('/api/v1/admin/reports').set('Cookie', (await signIn({ admin: true })).cookie)).status, 200);
  });

  test('removal is soft, audited by person, and reversible (MOD-03, MOD-04, MOD-05)', async () => {
    const author = await signIn();
    const reporter = await signIn();
    const admin = await signIn({ admin: true });

    const created = await request(app).post('/api/v1/experiences').set('Cookie', author.cookie).send(validBody());
    const id = created.body.data.id;
    await approve(id);

    await request(app).post(`/api/v1/experiences/${id}/report`).set('Cookie', reporter.cookie).send({ reason: 'false' });

    const removed = await request(app).post(`/api/v1/admin/experiences/${id}/remove`).set('Cookie', admin.cookie).send({});
    assert.equal(removed.body.data.status, 'removed');

    // nothing was deleted
    const stored = await Experience.findById(id).exec();
    assert.ok(stored, 'the document still exists');
    assert.equal(stored.status, 'removed');

    // the audit trail names a person
    const report = await Report.findOne({ experienceId: id }).exec();
    assert.equal(report.status, 'actioned');
    assert.equal(report.resolvedBy.toString(), admin.user._id.toString());
    assert.ok(report.resolvedAt);

    // invisible to the public, including its author
    assert.equal((await request(app).get(`/api/v1/experiences/${id}`)).status, 404);

    // and reversible
    const back = await request(app).post(`/api/v1/admin/experiences/${id}/reinstate`).set('Cookie', admin.cookie).send({});
    assert.equal(back.body.data.status, 'published');
  });

  test('an author cannot edit a moderator-removed experience', async () => {
    const author = await signIn();
    const admin = await signIn({ admin: true });

    const created = await request(app).post('/api/v1/experiences').set('Cookie', author.cookie).send(validBody());
    await request(app).post(`/api/v1/admin/experiences/${created.body.data.id}/remove`).set('Cookie', admin.cookie).send({});

    const res = await request(app)
      .patch(`/api/v1/experiences/${created.body.data.id}`)
      .set('Cookie', author.cookie)
      .send({ role: 'Trying to fix it' });

    assert.equal(res.status, 409);
  });

  test('an admin can merge a duplicate company and the experiences follow', async () => {
    const author = await signIn();
    const admin = await signIn({ admin: true });

    const one = await request(app).post('/api/v1/experiences').set('Cookie', author.cookie).send(validBody({ company: 'Zuvees' }));
    const two = await request(app).post('/api/v1/experiences').set('Cookie', author.cookie).send(validBody({ company: 'Zuvees Technologies' }));
    await approve(one.body.data.id);
    await approve(two.body.data.id);

    assert.equal(await Company.countDocuments({}), 2, 'two rows, as the prototype produced');

    const res = await request(app)
      .post('/api/v1/admin/companies/zuvees-technologies/merge')
      .set('Cookie', admin.cookie)
      .send({ into: 'zuvees' });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.merged, 1);
    assert.equal(await Company.countDocuments({}), 1);

    const canonical = await Company.findOne({ slug: 'zuvees' }).exec();
    assert.equal(canonical.experienceCount, 2);
    assert.ok(canonical.aliases.includes('Zuvees Technologies'), 'the old name becomes an alias, so future submissions resolve');
  });
});

describe('review before publishing', () => {
  test('a new submission waits in the queue and is invisible to the public', async () => {
    const author = await signIn();
    const created = await request(app).post('/api/v1/experiences').set('Cookie', author.cookie).send(validBody());
    const id = created.body.data.id;

    assert.equal(created.body.data.status, 'pending', 'the author is told it is under review');
    assert.equal((await request(app).get('/api/v1/experiences')).body.data.length, 0, 'not in the feed');
    assert.equal((await request(app).get(`/api/v1/experiences/${id}`)).status, 404, 'not readable by strangers');
    assert.equal((await request(app).get(`/api/v1/experiences/${id}`).set('Cookie', author.cookie)).status, 200, 'readable by its author');
  });

  test('an admin approves it, and it reaches the archive', async () => {
    const author = await signIn();
    const admin = await signIn({ admin: true });
    const created = await request(app).post('/api/v1/experiences').set('Cookie', author.cookie).send(validBody());
    const id = created.body.data.id;

    const queue = await request(app).get('/api/v1/admin/experiences/pending').set('Cookie', admin.cookie);
    assert.equal(queue.status, 200);
    assert.deepEqual(queue.body.data.map((e) => e.id), [id]);
    assert.equal(queue.body.data[0].rounds[0].questions[0].text, 'Binary search on the answer', 'the admin reads the full post');

    const res = await request(app).post(`/api/v1/admin/experiences/${id}/approve`).set('Cookie', admin.cookie).send({});
    assert.equal(res.body.data.status, 'published');

    const stored = await Experience.findById(id).exec();
    assert.equal(stored.reviewedBy.toString(), admin.user._id.toString(), 'the decision names a person');
    assert.equal((await request(app).get('/api/v1/experiences')).body.data.length, 1);
    assert.equal((await Company.findOne({ slug: 'zuvees' }).exec()).experienceCount, 1);
  });

  test('an admin rejects it with a note the author can read', async () => {
    const author = await signIn();
    const admin = await signIn({ admin: true });
    const created = await request(app).post('/api/v1/experiences').set('Cookie', author.cookie).send(validBody());
    const id = created.body.data.id;

    const res = await request(app)
      .post(`/api/v1/admin/experiences/${id}/reject`)
      .set('Cookie', admin.cookie)
      .send({ note: 'Please remove the interviewer name.' });
    assert.equal(res.body.data.status, 'rejected');

    const mine = await request(app).get('/api/v1/experiences/mine').set('Cookie', author.cookie);
    assert.equal(mine.body.data[0].status, 'rejected');
    assert.equal(mine.body.data[0].reviewNote, 'Please remove the interviewer name.');
    assert.equal((await request(app).get('/api/v1/experiences')).body.data.length, 0);

    // fixing it sends it back for review
    const edited = await request(app).patch(`/api/v1/experiences/${id}`).set('Cookie', author.cookie).send({ role: 'SDE Intern' });
    assert.equal(edited.body.data.status, 'pending');
  });

  test('only a pending post can be approved or rejected', async () => {
    const author = await signIn();
    const admin = await signIn({ admin: true });
    const created = await request(app).post('/api/v1/experiences').set('Cookie', author.cookie).send(validBody());
    await approve(created.body.data.id);

    const again = await request(app).post(`/api/v1/admin/experiences/${created.body.data.id}/reject`).set('Cookie', admin.cookie).send({});
    assert.equal(again.status, 409);
  });

  test('editing a live post takes it down until it is reviewed again', async () => {
    const author = await signIn();
    const created = await request(app).post('/api/v1/experiences').set('Cookie', author.cookie).send(validBody());
    await approve(created.body.data.id);

    const edited = await request(app).patch(`/api/v1/experiences/${created.body.data.id}`).set('Cookie', author.cookie).send({ role: 'SDE Intern' });

    assert.equal(edited.body.data.status, 'pending');
    assert.equal((await request(app).get('/api/v1/experiences')).body.data.length, 0);
    assert.equal((await Company.findOne({ slug: 'zuvees' }).exec()).experienceCount, 0);
  });

  test('an admin account signed in as a student cannot moderate or see the queue', async () => {
    const { user } = await signIn({ admin: true });
    const author = await signIn();
    const created = await request(app).post('/api/v1/experiences').set('Cookie', author.cookie).send(validBody());

    const studentSession = `${SESSION_COOKIE}=${await authService.createSession({ userId: user._id, mode: 'student' })}`;

    assert.equal((await request(app).get('/api/v1/admin/experiences/pending').set('Cookie', studentSession)).status, 403);
    assert.equal((await request(app).get(`/api/v1/experiences/${created.body.data.id}`).set('Cookie', studentSession)).status, 404);

    const me = await request(app).get('/api/v1/auth/me').set('Cookie', studentSession);
    assert.equal(me.body.data.mode, 'student');
  });

  test('a student account cannot open an admin session, whatever the session row says', async () => {
    const student = await signIn();
    const forged = `${SESSION_COOKIE}=${await authService.createSession({ userId: student.user._id, mode: 'admin' })}`;

    assert.equal((await request(app).get('/api/v1/admin/experiences/pending').set('Cookie', forged)).status, 403);
  });

  test('a made-up company name can be rejected, but only once no post uses it', async () => {
    const author = await signIn();
    const admin = await signIn({ admin: true });
    const created = await request(app).post('/api/v1/experiences').set('Cookie', author.cookie).send(validBody({ company: 'blabla' }));
    assert.equal((await Company.findOne({ slug: 'blabla' }).exec()).status, 'pending');

    const early = await request(app).post('/api/v1/admin/companies/blabla/reject').set('Cookie', admin.cookie).send({});
    assert.equal(early.status, 409, 'the post waiting for review still uses it');

    await request(app).post(`/api/v1/admin/experiences/${created.body.data.id}/reject`).set('Cookie', admin.cookie).send({});
    const res = await request(app).post('/api/v1/admin/companies/blabla/reject').set('Cookie', admin.cookie).send({});

    assert.equal(res.status, 200);
    assert.equal(await Company.countDocuments({ slug: 'blabla' }), 0);
  });
});
