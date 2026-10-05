import { ROUND_TYPES, roundType } from '../lib/rounds';

/**
 * The interview at a glance: one coloured segment per round, in order.
 *
 * A junior scanning the feed can see "assessment, two technicals, HR" before
 * reading a word. The legend underneath names each type that appears, so the
 * colours are never the only carrier of meaning.
 */
export function RoundStrip({ rounds = [], showLegend = true, size = 'md' }) {
  if (!rounds.length) return null;

  const types = rounds.map((r) => roundType(r.name));
  const present = [...new Set(types)];
  const h = size === 'sm' ? 'h-1.5' : 'h-2';

  return (
    <div>
      <div
        className="flex gap-1"
        role="img"
        aria-label={`Rounds: ${rounds.map((r) => r.name).join(', ')}`}
      >
        {rounds.map((round, i) => (
          <span
            key={i}
            title={`${i + 1}. ${round.name}`}
            className={`${h} flex-1 rounded-full`}
            style={{ background: ROUND_TYPES[types[i]].color }}
          />
        ))}
      </div>

      {showLegend && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {present.map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-3">
              <span className="h-2 w-2 rounded-full" style={{ background: ROUND_TYPES[t].color }} />
              {ROUND_TYPES[t].label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
