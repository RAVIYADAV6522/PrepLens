/**
 * AI prep guides. The model is replaced by a fake that records its prompts,
 * so these run offline, free and deterministically against preplens_test.
 */
import { test, before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, connectTestDatabase, clearTestDatabase, closeTestDatabase } from './helpers.js';
import { Experience } from '../src/models/Experience.js';
import { Company } from '../src/models/Company.js';
import {
  createCompanyGuideService,
  computeStats,
  buildPrompt,
} from '../src/services/companyGuideService.js';

before(async () => { await connectTestDatabase(); });
after(async () => { await closeTestDatabase(); });
beforeEach(async () => { await clearTestDatabase(); });

let company;

async function seed(count = 2) {
  company = await Company.create({ name: 'Dream11' });
  const docs = Array.from({ length: count }, (_, i) => ({
    companyId: company._id,
    companySlug: company.slug,
    companyName: company.name,
    role: 'SDE Intern',
    driveType: 'on-campus',
    interviewYear: 2026,
    outcome: i === 0 ? 'selected' : 'rejected',
    rounds: [
      { name: 'Online Assessment', questions: [{ text: 'Longest increasing subsequence', topic: 'DP' }] },
      { name: 'Technical', questions: [{ text: 'Detect a cycle in a graph', topic: 'Graphs' }, { text: 'Coin change', topic: 'dp' }], tips: 'Explain your approach first.' },
    ],
    isAnonymous: true,
    authorBatch: 2026,
    status: 'published',
    createdAt: new Date(Date.now() - i * 3_600_000),
    updatedAt: new Date(Date.now() - i * 3_600_000),
  }));
  return Experience.insertMany(docs);
}

function fakeLlm() {
  const calls = [];
  return {
    calls,
    async generateJson(req) {
      calls.push(req);
      return {
        model: 'fake-model',
        data: {
          overview: 'Two rounds focused on DSA.',
          rounds: [{ name: 'Online Assessment', focus: 'DP problems.', sources: [1, 2, 2, 99] }],
          tips: [{ text: 'Practise DP.', sources: [1] }],
        },
      };
    },
  };
}

describe('the guide service', () => {
  test('summarizes the published experiences and keeps only real citations', async () => {
    await seed(2);
    const llm = fakeLlm();
    const guide = await createCompanyGuideService({ llm }).getGuide('dream11');

    assert.equal(guide.overview, 'Two rounds focused on DSA.');
    assert.deepEqual(guide.rounds[0].sources, [1, 2]);
    assert.equal(guide.sources.length, 2);
    assert.equal(guide.model, 'fake-model');
    assert.equal(guide.cached, false);
    assert.match(llm.calls[0].prompt, /\[1\] SDE Intern/);
    assert.match(llm.calls[0].prompt, /Detect a cycle in a graph \(topic: Graphs\)/);
  });

  test('a second request is served from the cache without calling the model', async () => {
    await seed(2);
    const llm = fakeLlm();
    const service = createCompanyGuideService({ llm });
    await service.getGuide('dream11');
    const again = await service.getGuide('dream11');

    assert.equal(llm.calls.length, 1);
    assert.equal(again.cached, true);
  });

  test('a new experience makes the cached guide stale', async () => {
    const [first] = await seed(1);
    const llm = fakeLlm();
    const service = createCompanyGuideService({ llm });
    await service.getGuide('dream11');

    await Experience.create({ ...first.toObject(), _id: undefined, createdAt: new Date(), updatedAt: new Date() });
    const fresh = await service.getGuide('dream11');

    assert.equal(llm.calls.length, 2);
    assert.equal(fresh.sources.length, 2);
  });

  test('unpublished experiences never reach the model', async () => {
    await seed(1);
    await Experience.create({
      companyId: company._id, companySlug: company.slug, companyName: company.name,
      role: 'Secret Role', driveType: 'on-campus', interviewYear: 2026, outcome: 'selected',
      rounds: [{ name: 'R1', questions: [{ text: 'q' }] }], isAnonymous: true, authorBatch: 2026, status: 'pending',
    });
    const llm = fakeLlm();
    await createCompanyGuideService({ llm }).getGuide('dream11');

    assert.doesNotMatch(llm.calls[0].prompt, /Secret Role/);
  });

  test('topic counts are computed, case-insensitively, not generated', () => {
    const stats = computeStats([
      { outcome: 'selected', rounds: [{ questions: [{ topic: 'DP' }, { topic: 'dp' }, { topic: 'Graphs' }, { text: 'x' }] }] },
    ]);
    assert.deepEqual(stats.topTopics, [{ name: 'DP', count: 2 }, { name: 'Graphs', count: 1 }]);
    assert.deepEqual(stats.outcomes, { selected: 1 });
  });

  test('the prompt carries no author identity', () => {
    const prompt = buildPrompt('X', [{ role: 'SDE', driveType: 'on-campus', interviewYear: 2026, outcome: 'selected', rounds: [], submittedBy: 'u1', authorBranch: 'CSE' }]);
    assert.doesNotMatch(prompt, /u1|CSE/);
  });

  test('without a model the service reports AI_UNAVAILABLE', async () => {
    await seed(1);
    await assert.rejects(createCompanyGuideService({ llm: null }).getGuide('dream11'), { code: 'AI_UNAVAILABLE', status: 503 });
  });

  test('a model failure becomes AI_UNAVAILABLE, not a 500', async () => {
    await seed(1);
    const llm = { generateJson: async () => { throw new Error('quota exceeded for project 123'); } };
    await assert.rejects(createCompanyGuideService({ llm }).getGuide('dream11'), { code: 'AI_UNAVAILABLE' });
  });
});

describe('GET /companies/:slug/guide', () => {
  test('an unknown company is a 404', async () => {
    const res = await request(app).get('/api/v1/companies/nope/guide');
    assert.equal(res.status, 404);
  });

  test('a company with no published experiences is a 404', async () => {
    await Company.create({ name: 'Emptyco' });
    const res = await request(app).get('/api/v1/companies/emptyco/guide');
    assert.equal(res.status, 404);
  });

  test('a malformed slug is rejected', async () => {
    const res = await request(app).get('/api/v1/companies/bad%20slug!/guide');
    assert.equal(res.status, 422);
  });

  test('responses are never cached publicly', async () => {
    const res = await request(app).get('/api/v1/companies/nope/guide');
    assert.match(res.headers['cache-control'], /no-store/);
  });
});
