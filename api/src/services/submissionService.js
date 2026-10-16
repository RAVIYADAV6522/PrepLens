/**
 * Writing to the archive: submit, edit, retract, republish, report, moderate.
 */
import { experienceRepository } from '../repositories/experienceRepository.js';
import { companyRepository } from '../repositories/companyRepository.js';
import { companyService } from './companyService.js';
import { Report } from '../models/Report.js';
import { forbidden, notFound, validationFailed, conflict } from '../errors/AppError.js';

export const submissionService = {
  /**
   * Create an experience.
   *
   * IDENTITY COMES FROM THE SESSION, NEVER FROM THE BODY.
   * The prototype had an editable "YOUR NAME" field, which means anyone could
   * publish under someone else's name. Note that `author` below is the
   * authenticated user object — nothing from `input` touches submittedBy,
   * authorBatch or authorBranch. Spec SUB-05.
   */
  async submit(input, author) {
    if (!author.graduationBatch) {
      // Batch is snapshotted onto the experience, so it must exist first.
      throw validationFailed('Add your graduation batch to your profile before posting.', {
        graduationBatch: 'required',
      });
    }

    const { company } = await companyService.resolveOrQueue(input.company);

    const experience = await experienceRepository.insert({
      companyId: company._id,
      companySlug: company.slug,
      companyName: company.name,

      role: input.role,
      driveType: input.driveType,
      interviewYear: input.interviewYear,
      outcome: input.outcome,
      rounds: input.rounds ?? [],

      submittedBy: author._id,
      isAnonymous: Boolean(input.isAnonymous),

      // Snapshotted, not joined: "written by a 2027 CSE student" is a fact
      // about the moment of submission and must not change later.
      authorBatch: author.graduationBatch,
      authorBranch: input.isAnonymous ? undefined : author.branch,

      // Nothing reaches the archive unreviewed. The company counter moves on
      // approval, not here.
      status: 'pending',
      source: 'submitted',
    });

    return experience;
  },

  /** Fetch an experience the caller is allowed to modify, or throw. */
  async loadOwn(id, user) {
    const experience = await experienceRepository.findById(id);
    if (!experience) throw notFound('That experience does not exist.');

    const isAuthor = experience.submittedBy && experience.submittedBy.toString() === user._id.toString();

    // An admin can moderate but is deliberately NOT allowed to edit someone
    // else's words — removal is a status change, never a rewrite.
    if (!isAuthor) throw forbidden('You can only change your own experiences.');

    return experience;
  },

  /**
   * Edit. A whitelist, not a merge of the request body: without one, a client
   * could send `status: 'published'` on a removed post, or overwrite
   * submittedBy. Spec SUB-07.
   */
  async edit(id, input, user) {
    const experience = await this.loadOwn(id, user);

    if (experience.status === 'removed') {
      throw conflict('This experience was removed by a moderator and cannot be edited.');
    }

    const wasPublished = experience.status === 'published';

    if (input.company) {
      const { company } = await companyService.resolveOrQueue(input.company);

      if (company._id.toString() !== experience.companyId.toString()) {

        experience.companyId = company._id;
        experience.companySlug = company.slug;
        experience.companyName = company.name;
      }
    }

    for (const field of ['role', 'driveType', 'interviewYear', 'outcome', 'rounds']) {
      if (input[field] !== undefined) experience[field] = input[field];
    }

    if (input.isAnonymous !== undefined) {
      experience.isAnonymous = Boolean(input.isAnonymous);
      // Going anonymous must also drop the branch, or batch + branch + company
      // still identifies the author.
      experience.authorBranch = experience.isAnonymous ? undefined : user.branch;
    }

    /**
     * Changed words are unreviewed words. A live or declined post goes back to
     * the queue; a hidden one stays hidden but will need review to come back.
     */
    experience.approvedAt = null;
    if (['published', 'rejected'].includes(experience.status)) experience.status = 'pending';
    // A full edit supersedes any result update still waiting.
    experience.pendingUpdate = undefined;

    await experience.save();
    if (wasPublished) await companyRepository.incrementExperienceCount(experience.companyId, -1);

    return experience;
  },

  /**
   * Result update for a live "in process" post: the outcome, and the rounds
   * including any new ones. Stored beside the post (see pendingUpdate in the
   * model), so the approved version stays on the site until an admin
   * approves this. Asking again replaces the request; it never stacks.
   *
   * Saved without touching updatedAt: nothing readers see has changed yet.
   */
  async requestResultUpdate(id, { outcome, rounds }, user) {
    const experience = await this.loadOwn(id, user);

    if (experience.status !== 'published') {
      throw conflict('Only a live experience can get a result update. Edit it from your profile instead.');
    }
    if (experience.outcome !== 'in-process') {
      throw conflict('Result updates are for experiences that are still in process.');
    }

    experience.pendingUpdate = { outcome, rounds, submittedAt: new Date() };
    experience.updateReviewNote = undefined;
    await experience.save({ timestamps: false });
    return experience;
  },

  async withdrawResultUpdate(id, user) {
    const experience = await this.loadOwn(id, user);
    experience.pendingUpdate = undefined;
    await experience.save({ timestamps: false });
    return experience;
  },

  /**
   * Retraction: instant, unconditional, no reason collected, no approval.
   * Spec CONS-04 — this is a promise made at submit time, so it cannot have
   * conditions attached later.
   */
  async unpublish(id, user) {
    const experience = await this.loadOwn(id, user);

    if (experience.status === 'removed') throw conflict('A moderator has already removed this experience.');
    if (experience.status === 'unpublished') return experience;

    // Withdrawing works from any state, including from the review queue.
    const wasPublished = experience.status === 'published';

    experience.status = 'unpublished';
    await experience.save();
    if (wasPublished) await companyRepository.incrementExperienceCount(experience.companyId, -1);

    return experience;
  },

  async republish(id, user) {
    const experience = await this.loadOwn(id, user);

    if (experience.status === 'removed') throw conflict('A moderator removed this experience.');
    if (experience.status === 'published' || experience.status === 'pending') return experience;

    /**
     * Content an admin already approved, untouched since, goes straight back
     * up. Anything else — never reviewed, edited, or declined — is resubmitted
     * to the queue.
     */
    if (!experience.approvedAt) {
      experience.status = 'pending';
      await experience.save();
      return experience;
    }

    // The import consent gate lives in the model, so republishing an imported
    // row without recorded consent fails here too.
    experience.status = 'published';
    await experience.save();
    await companyRepository.incrementExperienceCount(experience.companyId, 1);

    return experience;
  },

  /**
   * Permanent deletion, by the author only.
   *
   * DELETE AND UNPUBLISH ARE DIFFERENT PROMISES, and both should exist.
   * Unpublish is reversible — it hides the post and keeps it, which is what
   * most people actually want when they get nervous about something they
   * wrote. Delete is final: the row goes, along with its votes, bookmarks and
   * reports, and nothing can bring it back.
   *
   * Moderation still cannot do this. An admin may only change status, so a
   * removal stays auditable and reversible. Erasing content outright is a
   * right the AUTHOR has over their own words, not a power moderators hold
   * over someone else's.
   */
  async destroy(id, user) {
    const experience = await this.loadOwn(id, user);
    const wasPublished = experience.status === 'published';

    const { Vote } = await import('../models/Vote.js');
    const { Bookmark } = await import('../models/Bookmark.js');

    // Remove the dependents first. Deleting the parent first would leave votes
    // and bookmarks pointing at nothing if the second delete failed.
    await Promise.all([
      Vote.deleteMany({ experienceId: experience._id }).exec(),
      Bookmark.deleteMany({ experienceId: experience._id }).exec(),
      Report.deleteMany({ experienceId: experience._id }).exec(),
    ]);

    await experience.deleteOne();

    if (wasPublished) await companyRepository.incrementExperienceCount(experience.companyId, -1);

    return { id: experience._id.toString(), deleted: true };
  },

  async report(experienceId, reporter, { reason, note }) {
    const experience = await experienceRepository.findPublishedById(experienceId);
    if (!experience) throw notFound('That experience does not exist.');

    const existing = await Report.findOne({ experienceId, reporterId: reporter._id }).exec();
    if (existing) return existing; // idempotent: reporting twice is not an error

    return Report.create({ experienceId, reporterId: reporter._id, reason, note });
  },
};

export const moderationService = {
  /** Submissions waiting for a decision, oldest first — first come, first reviewed. */
  pending() {
    return experienceRepository.findByStatus('pending', { oldestFirst: true });
  },

  async approve(experienceId, admin) {
    const experience = await experienceRepository.findById(experienceId);
    if (!experience) throw notFound('That experience does not exist.');
    if (experience.status !== 'pending') throw conflict('That experience is not waiting for review.');

    const now = new Date();
    experience.status = 'published';
    experience.approvedAt = now;
    experience.reviewedBy = admin._id;
    experience.reviewedAt = now;
    experience.reviewNote = undefined;
    await experience.save();

    await companyRepository.incrementExperienceCount(experience.companyId, 1);
    return experience;
  },

  /** The note is shown to the author, so they know what to fix and resubmit. */
  async reject(experienceId, admin, { note } = {}) {
    const experience = await experienceRepository.findById(experienceId);
    if (!experience) throw notFound('That experience does not exist.');
    if (experience.status !== 'pending') throw conflict('That experience is not waiting for review.');

    experience.status = 'rejected';
    experience.reviewedBy = admin._id;
    experience.reviewedAt = new Date();
    experience.reviewNote = note || undefined;
    await experience.save();

    return experience;
  },

  /**
   * An admin posts an experience for a student who did not post it
   * themselves: a shy RU student, or anyone from another campus (only RU
   * students have accounts here). The placement team already holds these
   * accounts, so the post skips the review queue: an admin IS the review.
   *
   * CONSENT. A post under the student's name is only accepted with the
   * admin's confirmation that the student agreed — the same rule imported
   * rows follow. An anonymous post shows only campus and batch, so it does
   * not need it.
   */
  async postOnBehalf(input, admin) {
    if (!input.isAnonymous && !input.consent) {
      throw validationFailed('Confirm the student agreed to be named, or post it anonymously.', {
        consent: 'required for a named post',
      });
    }

    // An admin is vouching for the company name, so it is created active
    // rather than queued for the clean-up an unknown student entry gets.
    const company =
      (await companyRepository.findByNameOrAlias(input.company)) ??
      (await companyRepository.upsertBySlug({ name: input.company, status: 'active' }));

    const now = new Date();
    const experience = await experienceRepository.insert({
      companyId: company._id,
      companySlug: company.slug,
      companyName: company.name,
      campus: input.campus,
      role: input.role,
      driveType: input.driveType,
      interviewYear: input.interviewYear,
      outcome: input.outcome,
      rounds: input.rounds ?? [],
      submittedBy: null,
      isAnonymous: Boolean(input.isAnonymous),
      authorName: input.isAnonymous ? undefined : input.authorName,
      authorBatch: input.authorBatch,
      authorBranch: input.isAnonymous ? undefined : input.authorBranch,
      source: 'admin',
      consentedAt: input.consent ? now : null,
      status: 'published',
      approvedAt: now,
      reviewedBy: admin._id,
      reviewedAt: now,
    });

    await companyRepository.incrementExperienceCount(company._id, 1);
    return experience;
  },

  /** Result updates waiting on live posts, oldest first. */
  pendingUpdates() {
    return experienceRepository.findWithPendingUpdate();
  },

  /**
   * Swap the reviewed result in. The post stays published throughout, so
   * the company's experience count does not move. updatedAt does, which is
   * what tells readers it was updated (and refreshes the company's AI guide).
   */
  async approveUpdate(experienceId, admin) {
    const experience = await experienceRepository.findById(experienceId);
    if (!experience) throw notFound('That experience does not exist.');
    if (!experience.pendingUpdate) throw conflict('That experience has no result update waiting.');

    const now = new Date();
    experience.outcome = experience.pendingUpdate.outcome;
    experience.rounds = experience.pendingUpdate.rounds;
    experience.pendingUpdate = undefined;
    experience.updateReviewNote = undefined;
    experience.approvedAt = now;
    experience.reviewedBy = admin._id;
    experience.reviewedAt = now;
    await experience.save();
    return experience;
  },

  /** The live post is untouched; the author sees the note on their profile. */
  async rejectUpdate(experienceId, admin, { note } = {}) {
    const experience = await experienceRepository.findById(experienceId);
    if (!experience) throw notFound('That experience does not exist.');
    if (!experience.pendingUpdate) throw conflict('That experience has no result update waiting.');

    experience.pendingUpdate = undefined;
    experience.updateReviewNote = note || 'The update was not approved.';
    experience.reviewedBy = admin._id;
    experience.reviewedAt = new Date();
    await experience.save({ timestamps: false });
    return experience;
  },

  async queue() {
    const reports = await Report.find({ status: 'open' }).sort({ createdAt: 1 }).limit(100).exec();

    const experiences = await Promise.all(
      reports.map((r) => experienceRepository.findById(r.experienceId)),
    );

    return reports.map((r, i) => ({
      id: r._id.toString(),
      reason: r.reason,
      note: r.note,
      createdAt: r.createdAt,
      experience: experiences[i]
        ? { id: experiences[i]._id.toString(), company: experiences[i].companyName, role: experiences[i].role, status: experiences[i].status }
        : null,
    }));
  },

  /**
   * Soft removal, audited.
   *
   * Never a delete: content may need to be reviewed, restored, or explained
   * later. `resolvedBy` records WHICH PERSON acted — which is the whole reason
   * admin is a role flag on a real account rather than a shared login.
   * Spec MOD-03, MOD-04.
   */
  async remove(experienceId, admin, { reportId } = {}) {
    const experience = await experienceRepository.findById(experienceId);
    if (!experience) throw notFound('That experience does not exist.');

    const wasPublished = experience.status === 'published';

    experience.status = 'removed';
    await experience.save();

    if (wasPublished) await companyRepository.incrementExperienceCount(experience.companyId, -1);

    await Report.updateMany(
      reportId ? { _id: reportId } : { experienceId, status: 'open' },
      { $set: { status: 'actioned', resolvedBy: admin._id, resolvedAt: new Date() } },
    );

    return experience;
  },

  /** Reversible, and the reversal is audited too. Spec MOD-05. */
  async reinstate(experienceId, admin) {
    const experience = await experienceRepository.findById(experienceId);
    if (!experience) throw notFound('That experience does not exist.');
    if (experience.status !== 'removed') throw conflict('That experience is not removed.');

    experience.status = 'published';
    experience.approvedAt = experience.approvedAt ?? new Date();
    await experience.save();
    await companyRepository.incrementExperienceCount(experience.companyId, 1);

    await Report.updateMany(
      { experienceId, status: 'actioned' },
      { $set: { status: 'dismissed', resolvedBy: admin._id, resolvedAt: new Date() } },
    );

    return experience;
  },

  async dismiss(reportId, admin) {
    const report = await Report.findByIdAndUpdate(
      reportId,
      { $set: { status: 'dismissed', resolvedBy: admin._id, resolvedAt: new Date() } },
      { returnDocument: 'after' },
    ).exec();

    if (!report) throw notFound('That report does not exist.');
    return report;
  },
};
