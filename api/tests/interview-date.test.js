/**
 * Interview month and year: required from students, never in the future, and
 * usable to filter and sort the feed.
 */
import { test, before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, connectTestDatabase, clearTestDatabase, closeTestDatabase } from './helpers.js';
import { authService } from '../src/services/authService.js';
import { SESSION_COOKIE } from '../src/lib/cookies.js';
import { Company } from '../src/models/Company.js';
import { Experience } from '../src/models/Experience.js';
import { User } from '../src/models/User.js';
import { currentYearMonth, isFutureInterview } from '../src/lib/interviewDate.js';

before(async () => { await connectTestDatabase(); });
after(async () => { await closeTestDatabase(); });
beforeEach(async () => { await clearTestDatabase(); });

let n = 0;
async function signIn({ admin = false } = {}) {
  n += 1;
  const user = await authService.signInWithGoogle({ googleId: `d-${n}`, email: `d${n}@nst.rishihood.edu.in`, name: `Student ${n}` });
  await User.updateOne({ _id: user._id }, { $set: { graduationBatch: 2027, branch: 'CSE', ...(admin && { role: 'admin' }) } });
  const token = await authService.createSession({ userId: user._id, mode: admin ? 'admin' : 'student' });
  return { user, cookie: `${SESSION_COOKIE}=${token}` };
}

const body = (overrides = {}) => ({
  company: 'Zuvees',
  role: 'Backend Intern',
  driveType: 'on-campus',
  interviewYear: 2025,
  interviewMonth: 8,
  outcome: 'rejected',
  rounds: [],
  ...overrides,
});

const submit = (cookie, b) => request(app).post('/api/v1/experiences').set('Cookie', cookie).send(b);

function nextMonth() {
  const { year, month } = currentYearMonth();
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/** Published posts from [year, month] pairs; month may be undefined. */
async function seed(dates) {
  const company = await Company.create({ name: 'Testco' });
  await Experience.insertMany(dates.map(([interviewYear, interviewMonth]) => ({
    companyId: company._id,
    companySlug: company.slug,
    companyName: company.name,
    role: `${interviewYear}-${interviewMonth ?? 'none'}`,
    driveType: 'on-campus',
    interviewYear,
    interviewMonth,
    outcome: 'selected',
    rounds: [],
    isAnonymous: true,
    authorBatch: 2026,
    status: 'published',
  })));
}

const roles = (res) => res.body.data.map((e) => e.role);

describe('the future check uses India time', () => {
  test('just after midnight on the 1st in India, the new month already counts as now', () => {
    // 1 Sep 2026, 00:30 IST is still 31 Aug on a UTC server.
    const now = new Date('2026-08-31T19:00:00Z');
    assert.equal(isFutureInterview(2026, 9, now), false);
    assert.equal(isFutureInterview(2026, 10, now), true);
  });

  test('with no month, only a later year is in the future', () => {
    const now = new Date('2026-03-15T12:00:00Z');
    assert.equal(isFutureInterview(2026, undefined, now), false);
    assert.equal(isFutureInterview(2027, undefined, now), true);
  });
});

describe('submitting a date', () => {
  test('a student must give the month', async () => {
    const { cookie } = await signIn();
    const { interviewMonth, ...noMonth } = body();
    const res = await submit(cookie, noMonth);
    assert.equal(res.status, 422);
    assert.ok(res.body.error.fields.interviewMonth);
  });

  test('a month outside 1-12 is refused', async () => {
    const { cookie } = await signIn();
    assert.equal((await submit(cookie, body({ interviewMonth: 13 }))).status, 422);
  });

  test('next month is refused, this month is accepted', async () => {
    const { cookie } = await signIn();
    const future = nextMonth();
    const refused = await submit(cookie, body({ interviewYear: future.year, interviewMonth: future.month }));
    assert.equal(refused.status, 422);
    assert.ok(refused.body.error.fields.interviewMonth);

    const { year, month } = currentYearMonth();
    assert.equal((await submit(cookie, body({ interviewYear: year, interviewMonth: month }))).status, 201);
  });

  test('the month and the share date come back, and the share date is the day it was submitted', async () => {
    const { cookie } = await signIn();
    const res = await submit(cookie, body());
    assert.equal(res.body.data.interviewMonth, 8);
    assert.equal(res.body.data.sharedAt, res.body.data.createdAt);
    assert.ok(Date.now() - new Date(res.body.data.sharedAt).getTime() < 60_000);
  });

  test('an edit sending only the year is checked against the saved month', async () => {
    const { cookie } = await signIn();
    const { year, month } = currentYearMonth();
    if (month === 12) return; // December cannot be in the future within its own year.

    const created = await submit(cookie, body({ interviewMonth: 12 }));
    const res = await request(app)
      .patch(`/api/v1/experiences/${created.body.data.id}`)
      .set('Cookie', cookie)
      .send({ interviewYear: year });
    assert.equal(res.status, 422);
    assert.ok(res.body.error.fields.interviewMonth);
  });

  test('the model refuses a future date even without the route', async () => {
    const future = nextMonth();
    const company = await Company.create({ name: 'Testco' });
    await assert.rejects(
      Experience.create({
        companyId: company._id, companySlug: company.slug, companyName: company.name, role: 'R', driveType: 'on-campus',
        interviewYear: future.year, interviewMonth: future.month, outcome: 'selected', authorBatch: 2026,
      }),
      /future/,
    );
  });
});

describe('admin posts', () => {
  const adminBody = (overrides = {}) => body({ campus: 'pune', isAnonymous: true, authorBatch: 2024, ...overrides });

  test('the month is optional, and no share date is shown', async () => {
    const admin = await signIn({ admin: true });
    const { interviewMonth, ...noMonth } = adminBody();
    const res = await request(app).post('/api/v1/admin/experiences').set('Cookie', admin.cookie).send(noMonth);
    assert.equal(res.status, 201);
    assert.equal(res.body.data.interviewMonth, undefined);
    assert.equal(res.body.data.sharedAt, undefined);
  });

  test('a future date is refused', async () => {
    const admin = await signIn({ admin: true });
    const future = nextMonth();
    const res = await request(app).post('/api/v1/admin/experiences').set('Cookie', admin.cookie)
      .send(adminBody({ interviewYear: future.year, interviewMonth: future.month }));
    assert.equal(res.status, 422);
  });
});

describe('filtering by interview date', () => {
  beforeEach(async () => {
    await seed([[2024, 12], [2025, 7], [2025, 8], [2025, undefined], [2026, 1], [2026, 5], [2026, 6], [2026, undefined]]);
  });

  test('a range crosses the year boundary, and keeps year-only posts at its edges', async () => {
    const res = await request(app).get('/api/v1/experiences?from=2025-08&to=2026-05');
    assert.deepEqual(roles(res).sort(), ['2025-8', '2025-none', '2026-1', '2026-5', '2026-none'].sort());
  });

  test('from alone is open-ended', async () => {
    const res = await request(app).get('/api/v1/experiences?from=2026-05');
    assert.deepEqual(roles(res).sort(), ['2026-5', '2026-6', '2026-none'].sort());
  });

  test('a malformed month is refused', async () => {
    assert.equal((await request(app).get('/api/v1/experiences?from=2025-13')).status, 422);
  });
});

describe('sorting by latest interview', () => {
  const dates = [[2024, 12], [2026, 1], [2025, undefined], [2025, 7], [2025, 8], [2026, undefined], [2026, 6], [2025, 8], [2026, 1]];
  const expected = ['2026-6', '2026-1', '2026-1', '2026-none', '2025-8', '2025-8', '2025-7', '2025-none', '2024-12'];

  test('newest interview first, year-only posts last within their year', async () => {
    await seed(dates);
    const res = await request(app).get('/api/v1/experiences?sort=interview');
    assert.deepEqual(roles(res), expected);
  });

  test('walking every page visits each row exactly once, in order', async () => {
    await seed(dates);
    for (const limit of [1, 2, 4]) {
      const seen = [];
      const ids = new Set();
      let cursor = null;
      do {
        const q = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
        const res = await request(app).get(`/api/v1/experiences?sort=interview&limit=${limit}${q}`);
        seen.push(...roles(res));
        res.body.data.forEach((e) => ids.add(e.id));
        cursor = res.body.page.nextCursor;
      } while (cursor);
      assert.deepEqual(seen, expected, `limit ${limit}`);
      assert.equal(ids.size, dates.length, `limit ${limit}`);
    }
  });

  test('the default order is still by share date, and works with a date filter and cursor', async () => {
    await seed(dates);
    const first = await request(app).get('/api/v1/experiences?from=2026-01&limit=2');
    assert.equal(first.body.page.hasMore, true);
    const second = await request(app).get(`/api/v1/experiences?from=2026-01&limit=2&cursor=${encodeURIComponent(first.body.page.nextCursor)}`);
    assert.equal(first.body.data.length + second.body.data.length, 4);
    assert.equal(new Set([...roles(first), ...roles(second)].filter((r) => r.startsWith('2026'))).size, 3);
  });
});
