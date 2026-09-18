/**
 * Development seed data.
 *
 *   npm run seed                 8 companies, 3 experiences
 *   npm run seed -- --bulk 200   plus 200 synthetic rows, for measurement
 *
 * IDEMPOTENCE, AND HOW IT IS ACHIEVED
 * Running this twice must not duplicate anything — otherwise every run makes
 * the archive dirtier and nobody trusts the script. The technique: every
 * seeded document has a HARD-CODED _id, so each write is an upsert by primary
 * key. Deterministic keys, not "check whether something similar exists".
 *
 * Note the ids all begin 5eed — recognisable in the database as seeded rows.
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { disconnectDatabase } from '../config/db.js';
import { connectOrExit } from './connect.js';
import { User } from '../models/User.js';
import { Company } from '../models/Company.js';
import { Experience } from '../models/Experience.js';
import { companyRepository } from '../repositories/companyRepository.js';
import { experienceRepository } from '../repositories/experienceRepository.js';

const args = process.argv.slice(2);
const bulkIndex = args.indexOf('--bulk');
const bulkCount = bulkIndex === -1 ? 0 : Number(args[bulkIndex + 1] ?? 0);

// A seed script pointed at production overwrites real content with examples.
// Refusing outright is cheaper than the incident.
if (env.NODE_ENV === 'production' && !args.includes('--i-know-what-i-am-doing')) {
  console.error('\nRefusing to seed a production database.\n');
  process.exit(1);
}

const oid = (hex) => new mongoose.Types.ObjectId(hex);

const SEED_USER_ID = oid('5eed00000000000000000001');

/**
 * The seed author is a FICTIONAL student, deliberately.
 *
 * Using a real person's address here would commit it to a public repository —
 * exactly the leak flagged in the prototype review. Seed data is example data.
 */
const seedUser = {
  _id: SEED_USER_ID,
  googleId: 'seed-google-id-0001',
  email: 'seed.student@nst.rishihood.edu.in',
  name: 'Seed Student',
  graduationBatch: 2026,
  branch: 'CSE',
  role: 'student',
};

/**
 * Zuvees and Algocept are real companies that interviewed at NST. The rest are
 * placeholders — replace them with the actual list of companies that visit,
 * which is also what makes the filter dropdown useful on day one.
 */
const companies = [
  { name: 'Zuvees' },
  { name: 'Algocept', aliases: ['algocept'] },
  { name: 'Deloitte', aliases: ['Deloitte India', 'Deloitte USI'] },
  { name: 'TCS', aliases: ['Tata Consultancy Services'] },
  { name: 'Infosys' },
  { name: 'Accenture' },
  { name: 'Google', aliases: ['Google India', 'Google LLC'] },
  { name: 'Amazon', aliases: ['Amazon India', 'AWS'] },
];

await connectOrExit();

try {
// --- author -------------------------------------------------------------------
await User.findOneAndUpdate(
  { _id: SEED_USER_ID },
  { $set: seedUser },
  { upsert: true, returnDocument: 'after', runValidators: true },
);

// --- companies ----------------------------------------------------------------
const bySlug = {};
for (const company of companies) {
  const saved = await companyRepository.upsertBySlug(company);
  bySlug[saved.slug] = saved;
}

// --- experiences --------------------------------------------------------------
/**
 * The first one is a real experience, transcribed from the prototype: a Zuvees
 * backend intern interview, not selected. Rejection experiences are the most
 * useful content in the archive, which is why the seed includes one.
 */
const experiences = [
  {
    _id: oid('5eed00000000000000000101'),
    company: 'zuvees',
    role: 'Backend Intern',
    driveType: 'on-campus',
    interviewYear: 2026,
    outcome: 'rejected',
    isAnonymous: false,
    rounds: [
      {
        name: 'DSA Round',
        questions: [{ text: 'Binary search on the answer — find the minimum feasible value', topic: 'binary-search' }],
        tips: 'Practise binary-search-on-answer problems specifically, not just plain binary search.',
      },
      {
        name: 'Technical Round',
        questions: [{ text: 'Walk through your resume and the projects on it', topic: 'projects' }],
        tips: 'Know every line of your own resume. They go deep on whatever you claim.',
      },
    ],
  },
  {
    _id: oid('5eed00000000000000000102'),
    company: 'algocept',
    role: 'SDE Intern',
    driveType: 'on-campus',
    interviewYear: 2026,
    outcome: 'selected',
    isAnonymous: false,
    rounds: [
      {
        name: 'Online Assessment',
        questions: [
          { text: 'Two coding problems — arrays and strings, medium difficulty', topic: 'arrays' },
          { text: 'Fifteen MCQs on DBMS and operating systems', topic: 'core-cs' },
        ],
        tips: 'The MCQ section is where people lose time. Revise OS scheduling and normalization.',
      },
      {
        name: 'Technical Interview',
        questions: [{ text: 'Design a URL shortener and discuss the database schema', topic: 'system-design' }],
        tips: 'They cared more about the schema and trade-offs than the code.',
      },
    ],
  },
  {
    // An anonymous rejection — the case the anonymity rules exist for. Renders
    // as "Anonymous · 2026", with no branch and no name in the API response.
    _id: oid('5eed00000000000000000103'),
    company: 'deloitte',
    role: 'Analyst',
    driveType: 'off-campus',
    interviewYear: 2025,
    outcome: 'rejected',
    isAnonymous: true,
    rounds: [
      {
        name: 'Group Discussion',
        questions: [{ text: 'Should AI-generated work be disclosed to clients?', topic: 'communication' }],
        tips: 'Speak early. Panels remember who opened the discussion.',
      },
    ],
  },
];

for (const { company, ...rest } of experiences) {
  const doc = bySlug[company];
  await experienceRepository.upsertById(rest._id, {
    ...rest,
    companyId: doc._id,
    companySlug: doc.slug,
    companyName: doc.name,
    submittedBy: SEED_USER_ID,
    authorBatch: seedUser.graduationBatch,
    authorBranch: rest.isAnonymous ? undefined : seedUser.branch,
    status: 'published',
    source: 'submitted',
  });
}

// --- optional bulk rows, purely for measurement -------------------------------
/**
 * An .explain() over three documents proves nothing — MongoDB will happily
 * collection-scan a tiny collection and be fast. Index behaviour only becomes
 * visible at volume, so this generates enough rows to measure honestly.
 *
 * Ids are derived from the loop counter, so re-running does not duplicate.
 */
if (bulkCount > 0) {
  const slugs = Object.keys(bySlug);
  const roles = ['SDE Intern', 'Backend Intern', 'Analyst', 'Data Analyst', 'SDE'];
  const outcomes = ['selected', 'rejected', 'in-process', 'withdrew'];
  const drives = ['on-campus', 'off-campus', 'referral'];

  /**
   * SYNTHETIC ROWS GET THEIR OWN ID NAMESPACE.
   *
   * The first version derived ids as `5eed0000000000000` + a 7-digit counter,
   * which meant i=101 produced 5eed…0101 — the same _id as the curated Zuvees
   * experience. The bulk rows silently OVERWROTE all three real seed rows, and
   * the only visible symptom was a total of 300 where 303 was expected.
   *
   * Deterministic ids are worth having, but only if two generators cannot
   * collide. Curated rows live under 5eed0000…, synthetic ones under 5eedbb….
   */
  const ops = [];
  for (let i = 0; i < bulkCount; i += 1) {
    const company = bySlug[slugs[i % slugs.length]];
    // Spread createdAt across days so a date-ordered feed is meaningful.
    const createdAt = new Date(Date.now() - i * 3_600_000);

    ops.push({
      updateOne: {
        filter: { _id: oid(`5eedbb0000000000000${String(i).padStart(5, '0')}`) },
        update: {
          $set: {
            companyId: company._id,
            companySlug: company.slug,
            companyName: company.name,
            role: roles[i % roles.length],
            driveType: drives[i % drives.length],
            interviewYear: 2024 + (i % 3),
            outcome: outcomes[i % outcomes.length],
            rounds: [
              {
                name: 'Online Assessment',
                questions: [{ text: `Synthetic seed question ${i} — dynamic programming on subsequences`, topic: 'dp' }],
                tips: 'Synthetic seed row, generated for measurement only.',
              },
            ],
            submittedBy: SEED_USER_ID,
            isAnonymous: i % 3 === 0,
            authorBatch: 2026,
            status: 'published',
            source: 'submitted',
            createdAt,
            updatedAt: createdAt,
          },
        },
        upsert: true,
      },
    });
  }

  // One round trip instead of `bulkCount` of them.
  const result = await Experience.bulkWrite(ops, { ordered: false });
  console.log(`bulk: ${result.upsertedCount} inserted, ${result.modifiedCount} updated`);
}

/**
 * RECOMPUTE the denormalized counters rather than incrementing them.
 *
 * $inc on every seed run would double the counts on the second run, and the
 * script would not be idempotent after all. Deriving each count from the
 * experiences that actually exist is the same reconciliation job Phase 2 needs
 * for upvoteCount — denormalized counters drift, and owning that is part of
 * choosing to denormalize.
 */
const counts = await Experience.aggregate([
  { $match: { status: 'published' } },
  { $group: { _id: '$companyId', n: { $sum: 1 } } },
]);

await Company.updateMany({}, { $set: { experienceCount: 0 } });
for (const { _id, n } of counts) {
  await Company.updateOne({ _id }, { $set: { experienceCount: n } });
}

const stats = await experienceRepository.publicStats();
console.log(`\nseeded: ${stats.experiences} published experiences across ${stats.companies} companies`);
console.log('run it again — nothing should duplicate.\n');
} catch (err) {
  // A seed failure is a developer failure: say what broke in one line rather
  // than printing the driver's full validation object graph.
  console.error(`\nSeed failed: ${err.message}\n`);
  if (err.errors) {
    for (const [path, detail] of Object.entries(err.errors)) {
      console.error(`  ${path}: ${detail.message}`);
    }
    console.error('');
  }
  await disconnectDatabase();
  process.exit(1);
}

await disconnectDatabase();
