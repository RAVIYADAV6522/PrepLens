import { Link } from 'react-router-dom';
import { OutcomeBadge, StatusBadge } from './Badge';
import { authorLabel, metaLine, relativeDate } from '../lib/format';

export function ExperienceCard({ experience }) {
  return (
    <article className="panel p-5">
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

      <div className="mt-4 flex items-center justify-between border-t border-rule pt-3">
        <span className="font-mono text-[11.5px] text-ink-3">
          {experience.roundCount} {experience.roundCount === 1 ? 'round' : 'rounds'}
        </span>
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

export function ExperienceCardSkeleton() {
  return (
    <div className="panel animate-pulse p-5">
      <div className="h-3 w-40 bg-paper-2" />
      <div className="mt-3 h-6 w-48 bg-paper-2" />
      <div className="mt-3 h-3 w-56 bg-paper-2" />
      <div className="mt-5 h-3 w-full bg-paper-2" />
    </div>
  );
}
