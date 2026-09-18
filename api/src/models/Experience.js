/**
 * The archive itself.
 *
 * TWO MODELLING DECISIONS WORTH DEFENDING OUT LOUD
 *
 * 1. Rounds are EMBEDDED, not referenced. They are bounded (nobody sits
 *    twenty rounds), always read together with their parent, and never
 *    queried on their own. That is the exact profile embedding is for — and
 *    it means reading an experience is one document fetch with no joins.
 *
 * 2. Author batch and branch are SNAPSHOTTED here, not joined from the user.
 *    "Written by a 2027 CSE student" is a historical fact about the moment of
 *    submission; it stays true forever even if the author later edits their
 *    profile. Joining would silently rewrite history.
 */
import mongoose from 'mongoose';
import {
  OUTCOMES,
  DRIVE_TYPES,
  EXPERIENCE_STATUSES,
  SOURCES,
  BRANCHES,
} from './enums.js';

const questionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 2000 },

    // Optional now, and the reason Phase 3 is tractable later: "which topics
    // does this company ask" is a query against a field, not an AI guess.
    topic: { type: String, trim: true, maxlength: 60 },
  },
  { _id: false },
);

const roundSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },

    /**
     * NOTE: there is no `order` field, on purpose.
     *
     * The first version stored one, set from the array index by a validate
     * hook. Two problems. First, a document `pre('validate')` hook does not
     * run for `findOneAndUpdate` — query updates run *update validators*, not
     * document middleware — so `order` came back required-but-missing on every
     * upsert. Second and more important: array position ALREADY encodes the
     * order, so storing it again is two sources of truth for one fact, and
     * they can disagree.
     *
     * Order is derived on read instead. Deleting the field deleted the bug.
     */
    questions: { type: [questionSchema], default: [] },
    tips: { type: String, trim: true, maxlength: 4000 },
  },
  { _id: false },
);

const experienceSchema = new mongoose.Schema(
  {
    // --- company: normalized for truth, denormalized for reads -------------
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: false },

    // Copies, so a feed page or company page needs zero $lookup stages. The
    // cost is that a company rename must fan out; that is rare and scripted,
    // and it is the right trade for a read-heavy archive.
    companySlug: { type: String, required: true, lowercase: true },
    companyName: { type: String, required: true, trim: true },

    // --- what the interview was -------------------------------------------
    role: { type: String, required: true, trim: true, maxlength: 80 },
    driveType: { type: String, enum: DRIVE_TYPES, required: true },
    interviewYear: { type: Number, required: true, min: 2000, max: 2100 },
    outcome: { type: String, enum: OUTCOMES, required: true },

    rounds: { type: [roundSchema], default: [] },

    // --- who wrote it ------------------------------------------------------
    // Nullable: account deletion detaches identity and keeps the content.
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    isAnonymous: { type: Boolean, default: false, required: true },

    authorBatch: { type: Number, min: 2000, max: 2100 },
    authorBranch: { type: String, enum: BRANCHES },

    // --- lifecycle ---------------------------------------------------------
    status: { type: String, enum: EXPERIENCE_STATUSES, default: 'published', required: true },
    source: { type: String, enum: SOURCES, default: 'submitted', required: true },

    /**
     * An imported experience stays unpublished until its author consents to
     * PUBLIC hosting. Consent to "share it in the batch group" is not consent
     * to a permanent indexed URL. Enforced by a hook below, not by discipline.
     * Spec IMP-02, IMP-03.
     */
    consentedAt: { type: Date, default: null },

    upvoteCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, collection: 'experiences' },
);

/**
 * The consent gate, at the storage layer.
 *
 * A check in a controller can be bypassed by the next controller someone
 * writes, or by a script, or by a migration. A validator cannot: there is no
 * code path that publishes an imported experience without a consent date.
 */
experienceSchema.pre('validate', function enforceImportConsent() {
  if (this.source === 'imported' && this.status === 'published' && !this.consentedAt) {
    // invalidate() is the idiomatic way to fail a document from a hook: it
    // produces the same ValidationError shape as a failed field validator, so
    // callers handle one error type rather than two.
    this.invalidate(
      'consentedAt',
      'An imported experience cannot be published until its author has consented to public hosting.',
    );
  }
});

/**
 * The consent gate again, for the query path.
 *
 * The hook above guards `save()`. It does NOT run for `findOneAndUpdate` —
 * document middleware and query middleware are separate in Mongoose, and
 * assuming otherwise is how a rule that "cannot be bypassed" gets bypassed by
 * the next person who reaches for an update instead of a save.
 */
experienceSchema.pre('findOneAndUpdate', function guardImportConsentOnUpdate() {
  // Mongoose 9 middleware is promise-based: throw to reject. There is no
  // `next` callback any more, and calling one fails with "next is not a
  // function" — a rename that silently breaks hooks copied from older guides.
  const update = this.getUpdate() ?? {};
  const set = update.$set ?? update;

  if (set.source === 'imported' && set.status === 'published' && !set.consentedAt) {
    throw new Error(
      'An imported experience cannot be published until its author has consented to public hosting.',
    );
  }
});

// --- indexes (Architecture §5) ------------------------------------------------
// Every one of these exists for a named query. Ordering matters: equality
// fields first, then the sort fields, in sort order. That is what lets one
// index satisfy both the filter and the sort without an in-memory sort.

// The home feed, cursor-paginated. _id is in the index because the cursor
// tiebreaks on it — two imports can share a createdAt to the millisecond.
experienceSchema.index(
  { status: 1, createdAt: -1, _id: -1 },
  { name: 'exp_feed' },
);

// A company page, newest first.
experienceSchema.index(
  { status: 1, companySlug: 1, createdAt: -1, _id: -1 },
  { name: 'exp_company_feed' },
);

// "My experiences", and the fan-out when an account is deleted.
experienceSchema.index(
  { submittedBy: 1, createdAt: -1 },
  { name: 'exp_author' },
);

// Content search. MongoDB allows exactly ONE text index per collection, so
// the fields and weights are a one-time decision — chosen here deliberately:
// a question someone was actually asked matters more than a tip about it.
experienceSchema.index(
  {
    'rounds.questions.text': 'text',
    'rounds.tips': 'text',
    role: 'text',
    companyName: 'text',
  },
  {
    name: 'exp_text',
    weights: { 'rounds.questions.text': 10, companyName: 6, role: 4, 'rounds.tips': 2 },
    default_language: 'english',
  },
);

/**
 * The only shape of an experience that may reach a client.
 *
 * ANONYMITY IS ENFORCED HERE, not in a template.
 * The prototype hid the author in the UI while the API still returned them —
 * which is not anonymity, it is a CSS trick. An anonymous experience must not
 * carry a name, an avatar, an id, or a branch in the payload at all, because
 * "Anonymous · 2027 · CSE" plus a company is often enough to identify someone
 * in a batch of sixty. Batch only. Spec CONS-03, NFR-V1.
 *
 * @param {object} [author] a populated User document, when one was fetched
 */
experienceSchema.methods.toPublic = function toPublic(author) {
  const base = {
    id: this._id.toString(),
    company: { name: this.companyName, slug: this.companySlug },
    role: this.role,
    driveType: this.driveType,
    interviewYear: this.interviewYear,
    outcome: this.outcome,
    // Order is the array position, derived here — see the note on roundSchema.
    rounds: this.rounds.map((r, i) => ({
      name: r.name,
      order: i + 1,
      questions: r.questions.map((q) => ({ text: q.text, topic: q.topic })),
      tips: r.tips,
    })),
    roundCount: this.rounds.length,
    upvoteCount: this.upvoteCount,
    createdAt: this.createdAt,
    // Shown to readers only when it differs, so an edit is visible but an
    // unedited post is not cluttered. Spec SUB-07.
    updatedAt: this.updatedAt > this.createdAt ? this.updatedAt : undefined,
  };

  if (this.isAnonymous || !this.submittedBy) {
    return { ...base, author: { anonymous: true, graduationBatch: this.authorBatch } };
  }

  return {
    ...base,
    author: {
      anonymous: false,
      id: this.submittedBy.toString(),
      name: author?.name,
      avatar: author?.avatar,
      graduationBatch: this.authorBatch,
      branch: this.authorBranch,
    },
  };
};

export const Experience = mongoose.model('Experience', experienceSchema);
