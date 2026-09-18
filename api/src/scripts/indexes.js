/**
 * Create the indexes declared in the schemas, deliberately.
 *
 *   npm run indexes
 *
 * WHY THIS IS A SCRIPT AND NOT AUTOMATIC IN PRODUCTION
 * Building an index on a populated collection can block writes. Automatic
 * index creation means that happens during a deploy, at whatever moment the
 * first request arrives, while users are on the site. Running it as a command
 * means it happens when you are watching, and you see what changed.
 *
 * syncIndexes() also DROPS indexes that are no longer declared in the schema,
 * which keeps the database honest: the schema is the single source of truth,
 * and an index nobody declared any more stops slowing every write.
 */
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { User } from '../models/User.js';
import { Company } from '../models/Company.js';
import { Experience } from '../models/Experience.js';
import { Vote } from '../models/Vote.js';
import { Bookmark } from '../models/Bookmark.js';
import { Report } from '../models/Report.js';
import { Session } from '../models/Session.js';

const models = [User, Company, Experience, Vote, Bookmark, Report, Session];

await connectDatabase();

try {
for (const Model of models) {
  const dropped = await Model.syncIndexes();
  const indexes = await Model.collection.indexes();

  console.log(`\n${Model.collection.collectionName}`);
  for (const index of indexes) {
    const keys = Object.entries(index.key)
      .map(([k, v]) => `${k}:${v}`)
      .join(', ');
    const flags = [index.unique && 'unique', index.weights && 'text'].filter(Boolean);
    console.log(`  ${index.name.padEnd(34)} { ${keys} }${flags.length ? `  [${flags.join(', ')}]` : ''}`);
  }
  if (dropped.length) console.log(`  dropped: ${dropped.join(', ')}`);
}

console.log('\nindexes in sync\n');
} catch (err) {
  // The common failure is declaring one index twice — once as `unique: true`
  // on the field and once via schema.index() with a name. Say so, rather than
  // printing 60 lines of driver internals.
  console.error(`\nIndex sync failed: ${err.message}`);
  if (err.codeName === 'IndexOptionsConflict') {
    console.error(
      'That means the same keys are declared twice with different names.\n' +
        'Check for `unique: true` on a field that also has a schema.index() call.',
    );
  }
  await disconnectDatabase();
  process.exit(1);
}

await disconnectDatabase();
