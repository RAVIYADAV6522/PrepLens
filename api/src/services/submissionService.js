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

      status: 'published',
      source: 'submitted',
    });

    // $inc, not read-modify-write: two concurrent publishes both reading 4 and
    // both writing 5 is a lost update.
    await companyRepository.incrementExperienceCount(company._id, 1);

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

    if (input.company) {
      const { company } = await companyService.resolveOrQueue(input.company);

      if (company._id.toString() !== experience.companyId.toString()) {
        await companyRepository.incrementExperienceCount(experience.companyId, -1);
        await companyRepository.incrementExperienceCount(company._id, 1);

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

    await experience.save();
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

    experience.status = 'unpublished';
    await experience.save();
    await companyRepository.incrementExperienceCount(experience.companyId, -1);

    return experience;
  },

  async republish(id, user) {
    const experience = await this.loadOwn(id, user);

    if (experience.status === 'removed') throw conflict('A moderator removed this experience.');
    if (experience.status === 'published') return experience;

    // The import consent gate lives in the model, so republishing an imported
    // row without recorded consent fails here too.
    experience.status = 'published';
    await experience.save();
    await companyRepository.incrementExperienceCount(experience.companyId, 1);

    return experience;
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
