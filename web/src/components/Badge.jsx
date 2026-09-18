import { OUTCOME_LABEL, OUTCOME_TONE } from '../lib/format';

/**
 * The outcome badge.
 *
 * Four states, not a boolean. The prototype had a "Were you selected?" toggle,
 * which cannot express "still in process" or "withdrew" — both of which happen
 * and both of which a junior wants to know about.
 */
export function OutcomeBadge({ outcome }) {
  return (
    <span className={`tag ${OUTCOME_TONE[outcome] ?? 'bg-paper-2 text-ink-2'}`}>
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
