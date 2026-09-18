/**
 * Read-side experience logic: what a caller is allowed to see, and how the
 * payload is assembled.
 */
import { experienceRepository } from '../repositories/experienceRepository.js';
import { userRepository } from '../repositories/userRepository.js';
import { notFound } from '../errors/AppError.js';

/**
 * Attach author details to a page of experiences.
 *
 * THE N+1 THIS AVOIDS
 * The obvious implementation calls userRepository.findById() inside the map —
 * one query per row, so a 20-row feed makes 21 round trips. At 30ms each that
 * is 600ms of latency for data that could have been fetched in one query.
 *
 * Instead: collect the ids that are actually needed, fetch them in ONE query,
 * and look them up from a Map. Anonymous rows are skipped entirely, because
 * their author is never rendered — so an anonymous-only page makes no author
 * query at all.
 */
async function hydrateAuthors(rows) {
  const ids = [
    ...new Set(
      rows
        .filter((r) => !r.isAnonymous && r.submittedBy)
        .map((r) => r.submittedBy.toString()),
    ),
  ];

  if (!ids.length) return rows.map((r) => r.toPublic());

  const authors = await userRepository.findManyByIds(ids);
  const byId = new Map(authors.map((a) => [a._id.toString(), a]));

  return rows.map((r) => r.toPublic(r.submittedBy ? byId.get(r.submittedBy.toString()) : undefined));
}

export const experienceService = {
  async getFeed(query) {
    const page = await experienceRepository.findPage(query);

    return {
      experiences: await hydrateAuthors(page.rows),
      page: {
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
        // True only for a text search, where relevance ranking cannot be
        // resumed by a keyset cursor. The client shows "refine your search"
        // rather than a "load more" button that would silently repeat rows.
        truncated: page.truncated,
      },
    };
  },

  /**
   * One experience.
   *
   * READ-04: anything not published is a 404 — for everyone except its own
   * author and an admin, who need to see a retracted or removed post to act
   * on it. The check is here rather than in the route so no future route can
   * forget it.
   */
  async getOne(id, viewer) {
    const experience = await experienceRepository.findById(id);
    if (!experience) throw notFound('That experience does not exist.');

    if (experience.status !== 'published') {
      const isAuthor =
        viewer && experience.submittedBy && experience.submittedBy.toString() === viewer._id.toString();
      const isAdmin = viewer?.role === 'admin';

      // Deliberately the same 404 as "does not exist": a different response
      // would confirm to a stranger that a given id is a real, hidden post.
      if (!isAuthor && !isAdmin) throw notFound('That experience does not exist.');
    }

    const author =
      !experience.isAnonymous && experience.submittedBy
        ? await userRepository.findById(experience.submittedBy)
        : undefined;

    return {
      ...experience.toPublic(author),
      // Only the people who can act on it are told it is not public.
      ...(experience.status !== 'published' && { status: experience.status }),
    };
  },

  getStats() {
    return experienceRepository.publicStats();
  },

  async getMine(userId) {
    const rows = await experienceRepository.findByAuthor(userId);

    // An author sees their own posts with real status, including retracted
    // ones, because that page is where they un-retract.
    return rows.map((r) => ({ ...r.toPublic(), status: r.status, isAnonymous: r.isAnonymous }));
  },
};
