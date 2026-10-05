import { Link } from 'react-router-dom';
import { OutcomeBadge, StatusBadge } from './Badge';
import { InteractionBar } from './InteractionBar';
import { RoundStrip } from './RoundStrip';
import {
  authorLabel, metaParts, monogram, monogramColor, OUTCOME_ACCENT, relativeDate,
} from '../lib/format';

export function CompanyMark({ name, size = 44 }) {
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-xl font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: monogramColor(name),
        boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.18)',
      }}
    >
      {monogram(name)}
    </span>
  );
}

export function ExperienceCard({ experience, interactions, index = 0 }) {
  const rounds = experience.rounds ?? [];

  return (
    <article
      className="panel card-hover relative overflow-hidden p-5 pl-6 sm:p-6 sm:pl-7"
      style={{ animation: `rise 340ms cubic-bezier(0.22,0.61,0.36,1) ${Math.min(index * 55, 330)}ms both` }}
    >
      {/* The outcome, as the card's left edge — readable from across the feed. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: OUTCOME_ACCENT[experience.outcome] ?? 'var(--color-rule-strong)' }}
      />

      <div className="flex items-start gap-4">
        <CompanyMark name={experience.company.name} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <h2 className="display text-[22px] sm:text-[24px]">
                <Link
                  to={`/experience/${experience.id}`}
                  className="after:absolute after:inset-0 after:content-[''] hover:text-brand"
                >
                  {experience.company.name}
                </Link>
              </h2>
              <p className="mt-0.5 truncate text-[14px] font-medium text-ink-2">{experience.role}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              <span className="tag tag-quiet">{experience.interviewYear}</span>
              <OutcomeBadge outcome={experience.outcome} />
              <StatusBadge status={experience.status} />
            </div>
          </div>

          {rounds.length > 0 && (
            <div className="mt-4">
              <RoundStrip rounds={rounds} />
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-4">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-3">
              <span>
                <span className="font-medium text-ink-2">{authorLabel(experience.author)}</span>
                {metaParts(experience).map((p) => <span key={p}>, {p}</span>)}
              </span>
              <span className="h-3 w-px bg-rule-strong" aria-hidden="true" />
              <span className="whitespace-nowrap">{relativeDate(experience.createdAt)}</span>
              <span className="h-3 w-px bg-rule-strong" aria-hidden="true" />
              <span className="whitespace-nowrap">
                {experience.roundCount} {experience.roundCount === 1 ? 'round' : 'rounds'}
              </span>
            </p>
            {/* Above the stretched link, so these stay clickable. */}
            <div className="relative z-10">
              {interactions && <InteractionBar experience={experience} interactions={interactions} />}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export function ExperienceCardSkeleton({ index = 0 }) {
  return (
    <div className="panel p-6" style={{ animation: `fade 240ms ease ${index * 80}ms both` }}>
      <div className="flex gap-4">
        <div className="skeleton h-11 w-11 rounded-xl" />
        <div className="flex-1">
          <div className="skeleton h-6 w-48" />
          <div className="skeleton mt-2 h-3.5 w-36" />
          <div className="skeleton mt-5 h-2 w-full" />
          <div className="skeleton mt-5 h-3 w-64" />
        </div>
      </div>
    </div>
  );
}
