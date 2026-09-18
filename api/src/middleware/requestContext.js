/**
 * Gives every request an identity, and every log line that identity.
 *
 * THE PROBLEM IT SOLVES
 * A user reports "it failed when I hit submit". Your logs hold ten thousand
 * lines from a hundred concurrent requests, interleaved. Which lines were
 * theirs? Without a correlation id, you cannot know — you are reading tea
 * leaves. With one, the user quotes the id from the error message and you read
 * their exact request, end to end.
 *
 * `req.log` is a pino child logger: every line it writes carries the requestId
 * automatically, so no call site has to remember to include it.
 *
 * Spec: OPS-02, NFR-O1.
 */
import { randomUUID } from 'node:crypto';
import { logger } from '../lib/logger.js';

// An inbound id is accepted only if it looks like one we would have generated.
// A client can otherwise set any string here, and log correlation becomes a
// place where untrusted input lands — including forged ids that collide with
// someone else's request on purpose.
const SAFE_ID = /^[A-Za-z0-9-]{8,64}$/;

export function requestContext(req, res, next) {
  const inbound = req.get('x-request-id');
  const id = inbound && SAFE_ID.test(inbound) ? inbound : randomUUID();

  req.id = id;
  req.log = logger.child({ requestId: id });

  // Echo it back so a user (or the frontend's error reporter) can quote it.
  res.set('x-request-id', id);

  const startedAt = process.hrtime.bigint();

  // 'finish' fires once the response is fully flushed, so the duration and the
  // status code are both final. Logging before that would record neither.
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

    req.log.info(
      {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Number(durationMs.toFixed(1)),
      },
      'request',
    );
  });

  next();
}
