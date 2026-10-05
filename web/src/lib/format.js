/** Display helpers — the vocabulary the UI speaks. */

export const OUTCOME_LABEL = {
  selected: 'Selected',
  rejected: 'Not selected',
  'in-process': 'In process',
  withdrew: 'Withdrew',
};

/** Pill colours for each outcome — one hue per state, always paired with its word. */
export const OUTCOME_TONE = {
  selected: 'bg-good-soft text-good',
  rejected: 'bg-bad-soft text-bad',
  'in-process': 'bg-warn-soft text-warn',
  withdrew: 'bg-idle-soft text-idle',
};

/** The solid colour of each outcome, for the stripe down a card's edge. */
export const OUTCOME_ACCENT = {
  selected: 'var(--color-good)',
  rejected: 'var(--color-bad)',
  'in-process': 'var(--color-warn)',
  withdrew: 'var(--color-idle)',
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
  if (!author || author.anonymous) return `Anonymous, ${author?.graduationBatch ?? '—'} batch`;
  return author.name ?? 'A student';
}

/** Extra author detail for a card — the branch, never for anonymous posts. */
export function metaParts(experience) {
  return [experience.author?.anonymous ? null : experience.author?.branch].filter(Boolean);
}

/**
 * A stable colour for a company's monogram, so the same company always wears
 * the same tile across the feed. Hues are kept dark enough for white text.
 */
const MONOGRAM_HUES = ['#3a36c9', '#1f63c9', '#0b7576', '#6d3fd9', '#a62d8a', '#9a4a12', '#2f6b3a', '#334072'];
export function monogramColor(name = '') {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return MONOGRAM_HUES[h % MONOGRAM_HUES.length];
}

export function monogram(name = '') {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
}

export function relativeDate(iso) {
  if (!iso) return '';
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const plural = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
  if (days < 365) return plural(Math.max(1, Math.round(days / 30)), 'month');
  return plural(Math.round(days / 365), 'year');
}
