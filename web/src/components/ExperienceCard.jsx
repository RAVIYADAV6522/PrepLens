import { Link } from 'react-router-dom';
import { OutcomeBadge, StatusBadge } from './Badge';
import { InteractionBar } from './InteractionBar';
import { authorLabel, metaLine, relativeDate } from '../lib/format';

export function ExperienceCard({ experience, interactions, index = 0 }) {
  return (
    <article
      className="panel card-hover p-5"
      // Cards arrive in sequence so the list reads as loading rather than
      // flashing. Capped, because a twentieth card waiting two seconds is slow.
      style={{ animation: `rise 340ms cubic-bezier(0.22,0.61,0.36,1) ${Math.min(index * 55, 330)}ms both` }}
    >
      <div className="flex items-start justify-between gap-4">
        <p className="font-mono text-[11px] font-medium tracking-[0.14em] text-ink-3">
          {metaLine(experience)}
        </p>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <OutcomeBadge outcome={experience.outcome} />
          <StatusBadge status={experience.status} />
        </div>
      </div>

      <h2 className="display mt-2 text-[26px]">
        <Link to={`/experience/${experience.id}`} className="hover:text-brand">
          {experience.company.name}
        </Link>
      </h2>

      {/**
       * Author credit carries a NAME at most — never an email address. The
       * prototype printed the author's full college address on every card,
       * which is harvestable by any scraper and makes anonymity impossible.
       */}
      <p className="mt-1 text-[13.5px] text-ink-2">
        Shared by <span className="font-medium text-ink">{authorLabel(experience.author)}</span>
        <span className="text-ink-3"> · {relativeDate(experience.createdAt)}</span>
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-3">
        <div className="flex items-center gap-3">
          {interactions && <InteractionBar experience={experience} interactions={interactions} />}
          <span className="font-mono text-[11.5px] text-ink-3">
            {experience.roundCount} {experience.roundCount === 1 ? 'round' : 'rounds'}
          </span>
        </div>
        <Link
          to={`/experience/${experience.id}`}
          className="font-mono text-[11.5px] font-medium tracking-[0.12em] text-brand uppercase hover:underline"
        >
          Read →
        </Link>
      </div>
    </article>
  );
}

export function ExperienceCardSkeleton({ index = 0 }) {
  return (
    <div className="panel p-5" style={{ animation: `fade 240ms ease ${index * 80}ms both` }}>
      <div className="skeleton h-3 w-40" />
      <div className="skeleton mt-3 h-7 w-48" />
      <div className="skeleton mt-3 h-3 w-56" />
      <div className="skeleton mt-6 h-3 w-full" />
    </div>
  );
}
