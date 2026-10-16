/**
 * One-off: mark every experience written before campuses existed as 'ru'.
 * Until then PrepLens was RU-only, so that is what they all are. Without
 * this, the default RU view would not match them (a missing field is not
 * equal to 'ru'). Safe to re-run: it only touches rows with no campus.
 *
 *   npm run backfill:campus
 */
import { disconnectDatabase } from '../config/db.js';
import { connectOrExit } from './connect.js';
import { Experience } from '../models/Experience.js';

await connectOrExit();
try {
  const { modifiedCount } = await Experience.updateMany(
    { campus: { $exists: false } },
    { $set: { campus: 'ru' } },
  );
  console.log(`marked ${modifiedCount} experience(s) as campus 'ru'`);
} finally {
  await disconnectDatabase();
}
