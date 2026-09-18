/**
 * Import existing experiences.
 *
 *   npm run import -- ../content/experiences.json
 *   npm run import -- ../content/experiences.json --dry-run
 *
 * WHY EVERYTHING LANDS UNPUBLISHED
 * These are other people's words. Read access on prepLens is public, so
 * publishing a senior's WhatsApp write-up puts it on a permanent, indexed URL,
 * possibly alongside the fact that they were rejected. Consent to "share it in
 * the batch group" is not consent to that.
 *
 * So every imported row arrives with status 'unpublished' and consentedAt
 * null, and `npm run consent` publishes it once its author has actually said
 * yes. The model refuses to publish an imported row without a consent date, so
 * this is not a convention that can be forgotten. Spec IMP-01 … IMP-05.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { Experience } from '../models/Experience.js';
import { companyRepository } from '../repositories/companyRepository.js';
import { DRIVE_TYPES, OUTCOMES } from '../models/enums.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');

if (!file) {
  console.error('\nUsage: npm run import -- <file.json> [--dry-run]\n');
  console.error('See docs/import-template.json for the expected shape.\n');
  process.exit(1);
}

const rows = JSON.parse(readFileSync(resolve(process.cwd(), file), 'utf8'));
if (!Array.isArray(rows)) {
  console.error('\nThe file must contain a JSON array of experiences.\n');
  process.exit(1);
}

/**
 * A deterministic id derived from the content, so re-running the import
 * updates rather than duplicating. The natural key is author + company +
 * role + year: the same person does not interview twice for the same role at
 * the same company in the same year.
 *
 * Hashing to 24 hex characters makes it a valid ObjectId, which means
 * idempotence comes from the primary key rather than from a lookup that could
 * race. Spec IMP-04.
 */
function deterministicId(row) {
  const key = [row.authorEmail ?? row.authorName ?? 'unknown', row.company, row.role, row.interviewYear]
    .map((p) => String(p).trim().toLowerCase())
    .join('|');

  return new mongoose.Types.ObjectId(createHash('sha256').update(key).digest('hex').slice(0, 24));
}

function validate(row, i) {
  const problems = [];
  if (!row.company) problems.push('company is required');
  if (!row.role) problems.push('role is required');
  if (!row.interviewYear) problems.push('interviewYear is required');
  if (!OUTCOMES.includes(row.outcome)) problems.push(`outcome must be one of ${OUTCOMES.join(', ')}`);
  if (row.driveType && !DRIVE_TYPES.includes(row.driveType)) {
    problems.push(`driveType must be one of ${DRIVE_TYPES.join(', ')}`);
  }
  if (!row.authorBatch) problems.push('authorBatch is required — it is what an anonymous post displays');
  return problems.length ? { index: i, company: row.company, problems } : null;
}

const invalid = rows.map(validate).filter(Boolean);

if (invalid.length) {
  console.error(`\n${invalid.length} row(s) cannot be imported:\n`);
  for (const bad of invalid) {
    console.error(`  [${bad.index}] ${bad.company ?? '(no company)'}`);
    for (const p of bad.problems) console.error(`      - ${p}`);
  }
  console.error('\nNothing was imported. Fix the file and run again.\n');
  process.exit(1);
}

await connectDatabase();

let createdCount = 0;
let updatedCount = 0;
const report = [];

try {
  for (const row of rows) {
    const { company } = await (async () => {
      const existing = await companyRepository.findByNameOrAlias(row.company);
      if (existing) return { company: existing };
      return { company: await companyRepository.upsertBySlug({ name: row.company, status: 'pending' }) };
    })();

    const _id = deterministicId(row);

    const doc = {
      companyId: company._id,
      companySlug: company.slug,
      companyName: company.name,
      role: String(row.role).trim(),
      driveType: row.driveType ?? 'on-campus',
      interviewYear: Number(row.interviewYear),
      outcome: row.outcome,
      rounds: (row.rounds ?? []).map((r) => ({
        name: String(r.name ?? 'Round').trim(),
        // The template accepts questions as an array of strings, because that
        // is how people actually write them down.
        questions: (r.questions ?? []).map((q) =>
          typeof q === 'string' ? { text: q.trim() } : { text: String(q.text).trim(), topic: q.topic },
        ),
        tips: r.tips,
      })),

      // Imported rows have no user account behind them until their author
      // signs in, so they are anonymous by default and carry only the batch.
      submittedBy: null,
      isAnonymous: row.isAnonymous ?? true,
      authorBatch: Number(row.authorBatch),
      authorBranch: row.isAnonymous === false ? row.authorBranch : undefined,

      source: 'imported',
      status: 'unpublished',
      consentedAt: null,
    };

    if (dryRun) {
      report.push({ id: _id.toString(), company: company.name, role: doc.role, action: 'would import' });
      continue;
    }

    const existing = await Experience.findById(_id).exec();

    // Never clobber a row that has already been consented and published.
    if (existing?.consentedAt) {
      report.push({ id: _id.toString(), company: company.name, role: doc.role, action: 'skipped (already consented)' });
      continue;
    }

    await Experience.findOneAndUpdate({ _id }, { $set: doc }, { upsert: true, returnDocument: 'after', runValidators: true });

    if (existing) updatedCount += 1;
    else createdCount += 1;

    report.push({
      id: _id.toString(),
      company: company.name,
      role: doc.role,
      author: row.authorName ?? row.authorEmail ?? '(unknown)',
      action: existing ? 'updated' : 'imported',
    });
  }

  console.log(`\n${dryRun ? 'DRY RUN — nothing was written' : `imported ${createdCount}, updated ${updatedCount}`}\n`);
  console.log('id                        company              role                 action');
  console.log('-'.repeat(96));
  for (const r of report) {
    console.log(
      `${r.id}  ${String(r.company).slice(0, 19).padEnd(19)}  ${String(r.role).slice(0, 19).padEnd(19)}  ${r.action}`,
    );
  }

  if (!dryRun) {
    console.log(`\nAll rows are UNPUBLISHED. Nothing is visible to anyone yet.`);
    console.log(`Ask each author about PUBLIC hosting, then publish with:\n`);
    console.log(`  npm run consent -- <experience-id> --by "Their Name"\n`);
  }
} catch (err) {
  console.error(`\nImport failed: ${err.message}\n`);
  if (err.errors) for (const [k, v] of Object.entries(err.errors)) console.error(`  ${k}: ${v.message}`);
  await disconnectDatabase();
  process.exit(1);
}

await disconnectDatabase();
