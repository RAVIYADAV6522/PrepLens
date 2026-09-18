/**
 * Test harness.
 *
 * WHY NOT mongodb-memory-server
 * It downloads a ~100MB mongod binary on first run, which makes `npm test`
 * unreliable on a slow connection and in CI. Instead these tests point at the
 * SAME cluster as development but a DIFFERENT database — the URI's path is
 * rewritten to `preplens_test` — and each suite clears what it touched.
 *
 * The safety rail is in switchToTestDatabase(): if the resulting database name
 * is not `preplens_test`, the run aborts. A test suite that can reach
 * production data is one typo away from deleting it.
 */
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { createApp } from '../src/app.js';

export const TEST_DB = 'preplens_test';

export function testUri() {
  const uri = new URL(env.MONGODB_URI.replace('mongodb+srv://', 'https://'));
  uri.pathname = `/${TEST_DB}`;
  return uri.toString().replace('https://', 'mongodb+srv://');
}

export async function connectTestDatabase() {
  process.env.MONGODB_URI = testUri();

  // env is frozen at import, so connect directly with the rewritten URI.
  await mongoose.connect(testUri(), { maxPoolSize: 5, serverSelectionTimeoutMS: 10_000 });

  if (mongoose.connection.name !== TEST_DB) {
    throw new Error(
      `Refusing to run tests against database "${mongoose.connection.name}" — expected "${TEST_DB}".`,
    );
  }

  return mongoose.connection;
}

export async function clearTestDatabase() {
  if (mongoose.connection.name !== TEST_DB) throw new Error('refusing to clear a non-test database');

  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

export async function closeTestDatabase() {
  await mongoose.connection.close();
}

/** The app under test — no port is bound; supertest drives it in-process. */
export const app = createApp();

/** Pull a named cookie out of a supertest response. */
export function cookieFrom(res, name) {
  const header = res.headers['set-cookie'] ?? [];
  const found = header.find((c) => c.startsWith(`${name}=`));
  return found ? found.split(';')[0] : null;
}

export { connectDatabase, disconnectDatabase };
