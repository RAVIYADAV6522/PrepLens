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

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Aug 2025", or just "2025" for an older post with no month. */
export function interviewLabel({ interviewYear, interviewMonth }) {
  return interviewMonth ? `${MONTHS[interviewMonth - 1]} ${interviewYear}` : String(interviewYear);
}

/** The college's first batch, so no interview here is earlier. */
export const FIRST_INTERVIEW_YEAR = 2023;

/** Every month so far as { value: '2025-08', label: 'Aug 2025' }, newest first. */
export function interviewMonthOptions(now = new Date()) {
  const options = [];
  for (let y = now.getFullYear(); y >= FIRST_INTERVIEW_YEAR; y -= 1) {
    const lastMonth = y === now.getFullYear() ? now.getMonth() + 1 : 12;
    for (let m = lastMonth; m >= 1; m -= 1) {
      options.push({ value: `${y}-${String(m).padStart(2, '0')}`, label: `${MONTHS[m - 1]} ${y}` });
    }
  }
  return options;
}

/** Placement season starts in August, so it runs across two calendar years. */
export function seasonStart(now = new Date()) {
  const year = now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-08`;
}

/** The exact day, e.g. "12 Sep 2025", in the reader's own timezone. */
export function shortDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
