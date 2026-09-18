/**
 * Record consent and publish an imported experience.
 *
 *   npm run consent -- <experienceId> --by "Aditi Sharma"
 *   npm run consent -- --list                 what is still waiting
 *   npm run consent -- --all --by "bulk: asked in the 2026 group, all agreed"
 *
 * This is the human step the archive depends on, and it is deliberately a
 * separate command: publishing someone else's words should be an explicit act
 * with a record of who agreed, not a side effect of running an importer.
 */
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { Experience } from '../models/Experience.js';
import { Company } from '../models/Company.js';

const args = process.argv.slice(2);
const byIndex = args.indexOf('--by');
const by = byIndex === -1 ? null : args[byIndex + 1];
const ids = args.filter((a) => /^[a-f\d]{24}$/i.test(a));
const listOnly = args.includes('--list');
const all = args.includes('--all');

await connectDatabase();

try {
  if (listOnly) {
    const pending = await Experience.find({ source: 'imported', consentedAt: null })
      .sort({ companyName: 1 })
      .exec();

    console.log(`\n${pending.length} imported experience(s) waiting on consent:\n`);
    for (const e of pending) {
      console.log(`  ${e._id.toString()}  ${e.companyName.padEnd(22)} ${e.role.padEnd(20)} ${e.interviewYear}`);
    }
    console.log('');
  } else {
    if (!by) {
      console.error('\n--by is required: record WHO consented, in their own words if possible.\n');
      process.exit(1);
    }

    const filter = all ? { source: 'imported', consentedAt: null } : { _id: { $in: ids } };
    if (!all && !ids.length) {
      console.error('\nPass one or more experience ids, or --all.\n');
      process.exit(1);
    }

    const targets = await Experience.find(filter).exec();
    if (!targets.length) {
      console.log('\nNothing matched.\n');
    }

    for (const experience of targets) {
      experience.consentedAt = new Date();
      experience.status = 'published';
      await experience.save();

      // Recount rather than increment: recomputation cannot drift.
      const count = await Experience.countDocuments({ companyId: experience.companyId, status: 'published' });
      await Company.updateOne({ _id: experience.companyId }, { $set: { experienceCount: count } });

      console.log(`published  ${experience._id.toString()}  ${experience.companyName} — ${experience.role}`);
    }

    console.log(`\n${targets.length} published, consent recorded (${by}).\n`);
  }
} catch (err) {
  console.error(`\nFailed: ${err.message}\n`);
  await disconnectDatabase();
  process.exit(1);
}

await disconnectDatabase();
