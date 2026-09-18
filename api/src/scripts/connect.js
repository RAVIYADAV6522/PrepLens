/**
 * Connect, or fail in one readable line.
 *
 * Scripts call connectDatabase() before their own try/catch can help, so a
 * wrong password produced a twenty-line MongoServerError stack trace whose
 * useful content was three words: "bad auth". The cause is almost always
 * mundane — a stale password in .env after a rotation — and the message
 * should say so rather than making you read a driver stack.
 *
 * The same principle as config/env.js: a failure you cannot act on is not an
 * error message, it is noise.
 */
import { connectDatabase } from '../config/db.js';

export async function connectOrExit() {
  try {
    return await connectDatabase();
  } catch (err) {
    const message = String(err?.message ?? err);

    console.error('\nCould not connect to MongoDB.\n');

    if (message.includes('bad auth') || message.includes('authentication failed')) {
      console.error('  The username or password in MONGODB_URI is wrong.\n');
      console.error('  This usually means the Atlas password was rotated and api/.env still');
      console.error('  has the old one. The reliable fix is to copy the whole MONGODB_URI');
      console.error('  from a place where it already works — Render -> Environment -> the');
      console.error('  eye icon — rather than retyping the password.\n');
    } else if (message.includes('ENOTFOUND') || message.includes('querySrv')) {
      console.error('  The cluster hostname could not be resolved. Check the host in');
      console.error('  MONGODB_URI, and that you are online.\n');
    } else if (message.includes('timed out') || message.includes('ETIMEDOUT')) {
      console.error('  The cluster did not answer. Your IP is probably not on the Atlas');
      console.error('  access list: Atlas -> Network Access.\n');
    } else {
      console.error(`  ${message}\n`);
    }

    process.exit(1);
  }
}
