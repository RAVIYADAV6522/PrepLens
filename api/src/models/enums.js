/**
 * Shared vocabularies.
 *
 * WHY THESE LIVE IN ONE FILE
 * An enum defined inline in a schema gets copied — into a validator, into a
 * filter whitelist, into a frontend dropdown — and the copies drift. Then a
 * value is valid in one place and rejected in another, and the bug looks like
 * magic. One export, imported everywhere, cannot drift.
 */

/** Spec §4 — a boolean is an enum that hasn't met reality yet. */
export const OUTCOMES = ['selected', 'rejected', 'in-process', 'withdrew'];

/** How the student reached the interview. Changes a junior's preparation entirely. */
export const DRIVE_TYPES = ['on-campus', 'off-campus', 'referral'];

/** Publication state. Nothing is ever hard-deleted — 'removed' is a status. */
export const EXPERIENCE_STATUSES = ['published', 'unpublished', 'removed'];

/** Where the row came from. Imported rows need recorded consent before publishing. */
export const SOURCES = ['submitted', 'imported'];

export const USER_ROLES = ['student', 'admin'];

export const COMPANY_STATUSES = ['active', 'pending'];

export const REPORT_REASONS = [
  'interviewer-named',
  'confidential',
  'false',
  'abusive',
  'other',
];

export const REPORT_STATUSES = ['open', 'actioned', 'dismissed'];

/**
 * Controlled branch vocabulary. The Emergent prototype used a free-text branch
 * field and produced "CSE AND AI" and "CSE" as two different branches at n=2.
 * A controlled list is the whole fix.
 */
export const BRANCHES = ['CSE', 'CSE-AI', 'CSE-DS', 'ECE', 'Other'];
