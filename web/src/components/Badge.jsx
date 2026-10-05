import { OUTCOME_LABEL, OUTCOME_TONE } from '../lib/format';

/**
 * The outcome badge.
 *
 * Four states, not a boolean — "still in process" and "withdrew" both happen
 * and a junior wants to know about both. Each state has its own hue AND its
 * word, so the badge still reads for anyone who can't tell the colours apart.
 */
export function OutcomeBadge({ outcome }) {
  return (
    <span className={`tag tag-dot ${OUTCOME_TONE[outcome] ?? 'tag-quiet'}`}>
      {OUTCOME_LABEL[outcome] ?? outcome}
    </span>
  );
}

export function StatusBadge({ status }) {
  if (status === 'published' || !status) return null;

  const tone = status === 'removed' ? 'bg-bad-soft text-bad' : 'bg-warn-soft text-warn';
  const label = status === 'removed' ? 'Removed by a moderator' : 'Hidden — only you can see this';

  return <span className={`tag ${tone}`}>{label}</span>;
}
