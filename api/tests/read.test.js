/**
 * Block 3 — the public read surface.
 *
 * The headline test is FEED-03: a row published between page 1 and page 2 must
 * not make a row appear twice. That is the one offset pagination gets wrong,
 * and it is invisible until a user notices a duplicate.
 */
import { test, before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { app, connectTestDatabase, clearTestDatabase, closeTestDatabase } from './helpers.js';
import { Experience } from '../src/models/Experience.js';
import { Company } from '../src/models/Company.js';
import { authService } from '../src/services/authService.js';
import { SESSION_COOKIE } from '../src/lib/cookies.js';

before(async () => { await connectTestDatabase(); });
after(async () => { await closeTestDatabase(); });

let company;

/** Build N published experiences, newest first, one hour apart. */
async function seed(count, overrides = {}) {
  company = await Company.create({ name: 'Testco' });

  const docs = Array.from({ length: count }, (_, i) => ({
    companyId: company._id,
    companySlug: company.slug,
    companyName: company.name,
    role: 'SDE Intern',
    driveType: 'on-campus',
    interviewYear: 2026,
    outcome: i % 2 ? 'selected' : 'rejected',
    rounds: [{ name: 'DSA Round', questions: [{ text: `Question about dynamic programming ${i}` }], tips: 'Practise.' }],
    isAnonymous: false,
    authorBatch: 2026,
    authorBranch: 'CSE',
    status: 'published',
    createdAt: new Date(Date.now() - i * 3_600_000),
    updatedAt: new Date(Date.now() - i * 3_600_000),
    ...overrides,
  }));

  await Experience.insertMany(docs);
  await Company.updateOne({ _id: company._id }, { $set: { experienceCount: count } });
}

beforeEach(async () => { await clearTestDatabase(); });

describe('the feed is public (FEED-01, FEED-02)', () => {
  test('a signed-out visitor gets experiences, newest first', async () => {
    await seed(5);

    const res = await request(app).get('/api/v1/experiences');

    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 5);

    const dates = res.body.data.map((e) => new Date(e.createdAt).getTime());
    assert.deepEqual(dates, [...dates].sort((a, b) => b - a), 'newest first');
  });

  test('public responses are shared-cacheable with a stale-while-revalidate window (NFR-A1)', async () => {
    await seed(3);

    const res = await request(app).get('/api/v1/experiences');

    assert.match(res.headers['cache-control'], /public/);
    assert.match(res.headers['cache-control'], /s-maxage=60/);
    assert.match(res.headers['cache-control'], /stale-while-revalidate=300/);
    assert.equal(res.headers.vary, 'Cookie');
  });

  test('a signed-in request is private, so an author sees their own post at once', async () => {
    await seed(3);
    const user = await authService.signInWithGoogle({
      googleId: 'g1', email: 'a@nst.rishihood.edu.in', name: 'A',
    });
    const token = await authService.createSession({ userId: user._id });

    const res = await request(app).get('/api/v1/experiences').set('Cookie', `${SESSION_COOKIE}=${token}`);

    assert.match(res.headers['cache-control'], /private/);
    assert.match(res.headers['cache-control'], /no-store/);
  });

  test('no cacheable payload contains a per-user field (§9, the caching rule)', async () => {
    await seed(3);

    const res = await request(app).get('/api/v1/experiences');
    const body = JSON.stringify(res.body);

    for (const leak of ['hasUpvoted', 'isBookmarked', 'upvoted', 'bookmarked']) {
      assert.equal(body.includes(leak), false, `${leak} must not appear in a cached payload`);
    }
  });
});

describe('cursor pagination (FEED-03) — the headline requirement', () => {
  test('a row published between pages does not cause a repeat', async () => {
    await seed(10);

    const page1 = await request(app).get('/api/v1/experiences?limit=4');
    assert.equal(page1.body.data.length, 4);
    assert.ok(page1.body.page.nextCursor, 'a cursor is returned while more exist');

    // Someone publishes while the reader is on page 1.
    await Experience.create({
      companyId: company._id,
      companySlug: company.slug,
      companyName: company.name,
      role: 'Published Mid-Scroll',
      driveType: 'on-campus',
      interviewYear: 2026,
      outcome: 'selected',
      rounds: [],
      isAnonymous: true,
      authorBatch: 2026,
      status: 'published',
    });

    const page2 = await request(app).get(`/api/v1/experiences?limit=4&cursor=${encodeURIComponent(page1.body.page.nextCursor)}`);

    const ids1 = page1.body.data.map((e) => e.id);
    const ids2 = page2.body.data.map((e) => e.id);
    const repeated = ids1.filter((id) => ids2.includes(id));

    assert.deepEqual(repeated, [], 'no experience appears on both pages');
    assert.equal(new Set([...ids1, ...ids2]).size, ids1.length + ids2.length);
  });

  test('walking every page visits each row exactly once', async () => {
    await seed(23);

    const seen = [];
    let cursor = null;
    let guard = 0;

    do {
      const url = `/api/v1/experiences?limit=5${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const res = await request(app).get(url);
      seen.push(...res.body.data.map((e) => e.id));
      cursor = res.body.page.nextCursor;
      guard += 1;
    } while (cursor && guard < 20);

    assert.equal(seen.length, 23, 'every row returned');
    assert.equal(new Set(seen).size, 23, 'none returned twice');
  });

  test('hasMore is false on the last page', async () => {
    await seed(3);
    const res = await request(app).get('/api/v1/experiences?limit=10');

    assert.equal(res.body.page.hasMore, false);
    assert.equal(res.body.page.nextCursor, null);
  });

  test('a tampered cursor restarts the list instead of erroring', async () => {
    await seed(5);
    const res = await request(app).get('/api/v1/experiences?limit=3&cursor=not-a-real-cursor');

    assert.equal(res.status, 200, 'a bad cursor is not a 500');
    assert.equal(res.body.data.length, 3);
  });
});

describe('filters and search (FEED-04 … FEED-06)', () => {
  test('filters by company slug and reflects it in the results', async () => {
    await seed(4);
    const other = await Company.create({ name: 'Otherco' });
    await Experience.create({
      companyId: other._id, companySlug: other.slug, companyName: other.name,
      role: 'Analyst', driveType: 'off-campus', interviewYear: 2025, outcome: 'selected',
      rounds: [], isAnonymous: true, authorBatch: 2026, status: 'published',
    });

    const res = await request(app).get('/api/v1/experiences?company=otherco');

    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].company.slug, 'otherco');
  });

  test('filters by outcome', async () => {
    await seed(6);
    const res = await request(app).get('/api/v1/experiences?outcome=selected');

    assert.ok(res.body.data.length > 0);
    assert.ok(res.body.data.every((e) => e.outcome === 'selected'));
  });

  test('rejects an outcome that is not in the enum', async () => {
    await seed(2);
    const res = await request(app).get('/api/v1/experiences?outcome=maybe');

    assert.equal(res.status, 422);
    assert.ok(res.body.error.fields.outcome);
  });

  test('a client cannot request removed content by injecting a status filter', async () => {
    await seed(3);
    await Experience.updateMany({}, { $set: { status: 'removed' } });

    const res = await request(app).get('/api/v1/experiences?status=removed');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, [], 'status is not a client-controllable filter');
  });

  test('full-text search finds a question by its words', async () => {
    await seed(5);
    const res = await request(app).get('/api/v1/experiences?q=dynamic%20programming');

    assert.equal(res.status, 200);
    assert.ok(res.body.data.length > 0, 'the text index matched');
    assert.equal(res.body.page.nextCursor, null, 'relevance ranking is not cursor-paginated');
  });
});

describe('reading one experience (READ-02, READ-04)', () => {
  test('a published experience is readable by anyone', async () => {
    await seed(1);
    const list = await request(app).get('/api/v1/experiences');
    const res = await request(app).get(`/api/v1/experiences/${list.body.data[0].id}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.rounds[0].name, 'DSA Round');
    assert.equal(res.body.data.rounds[0].order, 1, 'order is derived from array position');
  });

  test('an unpublished experience is a 404 for a stranger', async () => {
    await seed(1);
    const list = await request(app).get('/api/v1/experiences');
    const id = list.body.data[0].id;
    await Experience.updateOne({ _id: id }, { $set: { status: 'unpublished' } });

    const res = await request(app).get(`/api/v1/experiences/${id}`);
    assert.equal(res.status, 404);
  });

  test('its own author can still see a retracted experience', async () => {
    const user = await authService.signInWithGoogle({
      googleId: 'g2', email: 'author@nst.rishihood.edu.in', name: 'Author',
    });
    await seed(1, { submittedBy: user._id });

    const list = await request(app).get('/api/v1/experiences');
    const id = list.body.data[0].id;
    await Experience.updateOne({ _id: id }, { $set: { status: 'unpublished' } });

    const token = await authService.createSession({ userId: user._id });
    const res = await request(app).get(`/api/v1/experiences/${id}`).set('Cookie', `${SESSION_COOKIE}=${token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'unpublished', 'and is told why it is hidden');
  });

  test('a malformed id is a 404, not a 500', async () => {
    const res = await request(app).get('/api/v1/experiences/not-an-object-id');
    assert.equal(res.status, 404);
  });
});

describe('anonymity in the payload (CONS-03, NFR-V1)', () => {
  test('an anonymous experience exposes the batch and nothing else', async () => {
    await seed(1, { isAnonymous: true });
    const res = await request(app).get('/api/v1/experiences');
    const author = res.body.data[0].author;

    assert.equal(author.anonymous, true);
    assert.equal(author.graduationBatch, 2026);
    assert.equal(author.name, undefined);
    assert.equal(author.id, undefined);
    assert.equal(author.branch, undefined, 'batch + branch + company can identify a person');
  });

  test('a named experience shows the author name, still without an email', async () => {
    const user = await authService.signInWithGoogle({
      googleId: 'g3', email: 'named@nst.rishihood.edu.in', name: 'Named Student',
    });
    await seed(1, { submittedBy: user._id, isAnonymous: false });

    const res = await request(app).get('/api/v1/experiences');

    assert.equal(res.body.data[0].author.name, 'Named Student');
    assert.equal(JSON.stringify(res.body).includes('nst.rishihood.edu.in'), false);
  });
});

describe('companies and stats (FEED-07, FEED-08)', () => {
  test('only companies with published experiences are offered as filters', async () => {
    await seed(2);
    await Company.create({ name: 'Never Visited' });

    const res = await request(app).get('/api/v1/companies');

    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].slug, 'testco');
  });

  test('autocomplete is prefix-anchored', async () => {
    await Company.create([{ name: 'Google' }, { name: 'Goldman Sachs' }, { name: 'Amazon' }]);

    const hit = await request(app).get('/api/v1/companies/autocomplete?q=go');
    assert.equal(hit.body.data.length, 2);

    const miss = await request(app).get('/api/v1/companies/autocomplete?q=oogle');
    assert.equal(miss.body.data.length, 0, 'a mid-string match is intentionally not supported');
  });

  test('stats count published experiences and distinct companies', async () => {
    await seed(4);
    const res = await request(app).get('/api/v1/experiences/stats');

    assert.equal(res.body.data.experiences, 4);
    assert.equal(res.body.data.companies, 1);
  });
});

describe('per-user state is separate and never cached (§9)', () => {
  test('/me/interactions requires a session', async () => {
    const res = await request(app).get('/api/v1/me/interactions?ids=' + new mongoose.Types.ObjectId());
    assert.equal(res.status, 401);
  });

  test('it returns empty arrays before Phase 2, and is no-store', async () => {
    const user = await authService.signInWithGoogle({
      googleId: 'g4', email: 'i@nst.rishihood.edu.in', name: 'I',
    });
    const token = await authService.createSession({ userId: user._id });

    const res = await request(app)
      .get('/api/v1/me/interactions?ids=' + new mongoose.Types.ObjectId())
      .set('Cookie', `${SESSION_COOKIE}=${token}`);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, { upvoted: [], bookmarked: [] });
    assert.match(res.headers['cache-control'], /no-store/);
  });

  test('it rejects a non-id in the list', async () => {
    const user = await authService.signInWithGoogle({
      googleId: 'g5', email: 'j@nst.rishihood.edu.in', name: 'J',
    });
    const token = await authService.createSession({ userId: user._id });

    const res = await request(app)
      .get('/api/v1/me/interactions?ids=nonsense')
      .set('Cookie', `${SESSION_COOKIE}=${token}`);

    assert.equal(res.status, 422);
  });
});
