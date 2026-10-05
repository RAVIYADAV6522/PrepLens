/**
 * Send never-approved live posts back to the review queue.
 *
 *   npm run review:requeue            lists what would move, changes nothing
 *   npm run review:requeue -- --apply moves them
 *
 * Review arrived after the archive already had posts. Those went live without
 * anyone approving them — their `approvedAt` is empty — so this puts each one
 * in front of an admin like any new submission. Posts an admin has approved
 * are left alone, which makes running it twice harmless.
 */
import { disconnectDatabase } from '../config/db.js';
import { connectOrExit } from './connect.js';
import { Experience } from '../models/Experience.js';
import { Company } from '../models/Company.js';

const apply = process.argv.slice(2).includes('--apply');

await connectOrExit();

try {
  const rows = await Experience.find({ status: 'published', approvedAt: null }).sort({ createdAt: 1 }).exec();

  console.log(`\n${rows.length} live post(s) were never approved:\n`);
  for (const r of rows) {
    console.log(`  ${r._id}  ${r.companyName.padEnd(22)} ${r.role.padEnd(24)} ${r.createdAt.toISOString().slice(0, 10)}`);
  }

  if (!apply) {
    console.log('\nNothing changed. To send them to the review queue, run:');
    console.log('  npm run review:requeue -- --apply\n');
  } else if (rows.length) {
    await Experience.updateMany({ _id: { $in: rows.map((r) => r._id) } }, { $set: { status: 'pending' } });

    // Recount rather than decrement: recomputation cannot drift.
    const companyIds = [...new Set(rows.map((r) => r.companyId.toString()))];
    for (const id of companyIds) {
      const count = await Experience.countDocuments({ companyId: id, status: 'published' });
      await Company.updateOne({ _id: id }, { $set: { experienceCount: count } });
    }

    console.log(`\nMoved ${rows.length} post(s) to the review queue; ${companyIds.length} company counter(s) recounted.\n`);
  }
} catch (err) {
  console.error(`\nRequeue failed: ${err.message}\n`);
  await disconnectDatabase();
  process.exit(1);
}

await disconnectDatabase();
