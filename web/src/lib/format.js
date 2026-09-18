/** Display helpers — the vocabulary the UI speaks. */

export const OUTCOME_LABEL = {
  selected: 'Selected',
  rejected: 'Not selected',
  'in-process': 'In process',
  withdrew: 'Withdrew',
};

export const OUTCOME_TONE = {
  selected: 'bg-good-soft text-good',
  rejected: 'bg-paper-2 text-ink-2',
  'in-process': 'bg-warn-soft text-warn',
  withdrew: 'bg-paper-2 text-ink-3',
};

export const DRIVE_LABEL = {
  'on-campus': 'On campus',
  'off-campus': 'Off campus',
  referral: 'Referral',
};

export const BRANCHES = ['CSE', 'CSE-AI', 'CSE-DS', 'ECE', 'Other'];
export const OUTCOMES = ['selected', 'rejected', 'in-process', 'withdrew'];
export const DRIVE_TYPES = ['on-campus', 'off-campus', 'referral'];

/**
 * How an author is credited.
 *
 * An anonymous experience shows the BATCH ONLY. Never batch plus branch plus
 * company — in a cohort of sixty that combination often identifies one person,
 * which is the k-anonymity problem the whole anonymity feature exists to solve.
 */
export function authorLabel(author) {
  if (!author || author.anonymous) return `Anonymous · ${author?.graduationBatch ?? '—'}`;
  return author.name ?? 'A student';
}

/** The card's metadata line: 2026 · CSE · BACKEND INTERN */
export function metaLine(experience) {
  return [
    experience.interviewYear,
    experience.author?.anonymous ? null : experience.author?.branch,
    experience.role,
  ]
    .filter(Boolean)
    .join(' · ')
    .toUpperCase();
}

export function relativeDate(iso) {
  if (!iso) return '';
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}
