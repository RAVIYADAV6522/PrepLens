/**
 * Empty the archive.
 *
 *   npm run archive:reset -- --yes
 *
 * Deletes every experience and resets each company's counter to zero. The
 * companies themselves are KEPT, so autocomplete still has a vocabulary to
 * suggest from — and a company with no published experiences is already
 * excluded from the filter dropdown by FEED-08, so an empty archive looks
 * empty rather than showing options that lead nowhere.
 *
 * Users, sessions, reports, votes and bookmarks are left alone.
 *
 * WHY --yes IS REQUIRED
 * This is the one destructive command in the project. A script that wipes
 * content on a bare invocation will eventually be run by accident — by a
 * shell history arrow-up, or by someone reading the script list and trying
 * one. Requiring an explicit flag makes the destruction deliberate.
 */
import { disconnectDatabase } from '../config/db.js';
import { connectOrExit } from './connect.js';
import { Experience } from '../models/Experience.js';
import { Company } from '../models/Company.js';

const args = process.argv.slice(2);

if (!args.includes('--yes')) {
  console.error('\nThis deletes EVERY experience in the database.\n');
  console.error('If that is what you want, run:\n');
  console.error('  npm run archive:reset -- --yes\n');
  process.exit(1);
}

await connectOrExit();

try {
  const before = await Experience.countDocuments({});
  const { deletedCount } = await Experience.deleteMany({});

  // Reset rather than recompute: there is nothing left to count.
  await Company.updateMany({}, { $set: { experienceCount: 0 } });

  const companies = await Company.countDocuments({});

  console.log(`\ndeleted ${deletedCount} of ${before} experiences`);
  console.log(`${companies} companies kept, all counters reset to 0`);
  console.log('\nThe archive is empty. Add experiences through the app, or with:');
  console.log('  npm run import -- <file.json>\n');
} catch (err) {
  console.error(`\nReset failed: ${err.message}\n`);
  await disconnectDatabase();
  process.exit(1);
}

await disconnectDatabase();
