import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get, post, toFormError } from '../api/client';
import { OutcomeBadge, StatusBadge } from '../components/Badge';
import { InteractionBar } from '../components/InteractionBar';
import { CompanyMark } from '../components/ExperienceCard';
import { RoundStrip } from '../components/RoundStrip';
import { roundStyle } from '../lib/rounds';
import { useInteractions } from '../hooks/useInteractions';
import { useAuth } from '../hooks/useAuth';
import { authorLabel, DRIVE_LABEL, relativeDate } from '../lib/format';
import { REPORT_REASONS } from '../lib/reportReasons';

export function ExperienceDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [experience, setExperience] = useState(null);
  const [error, setError] = useState(null);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const interactions = useInteractions(experience ? [experience.id] : []);

  useEffect(() => {
    let cancelled = false;
    get(`/experiences/${id}`)
      .then((b) => { if (!cancelled) setExperience(b.data); })
      .catch((err) => { if (!cancelled) setError(toFormError(err)); });
    return () => { cancelled = true; };
  }, [id]);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-20 text-center">
        <p className="eyebrow eyebrow-muted">{error.status === 404 ? 'Not found' : 'Error'}</p>
        <h1 className="display mt-3 text-[32px]">
          {error.status === 404 ? 'That experience is not here.' : 'Something went wrong.'}
        </h1>
        <p className="mt-3 text-[14px] text-ink-2">
          {error.status === 404
            ? 'It may have been unpublished by its author, or the link is wrong.'
            : error.message}
        </p>
        <Link to="/archive" className="btn btn-dark mt-6">Back to the archive</Link>
      </div>
    );
  }

  if (!experience) {
    return (
      <div>
        <div className="night">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <div className="h-10 w-64 rounded-lg bg-white/10" />
            <div className="mt-4 h-4 w-40 rounded bg-white/10" />
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-5 py-10">
          <div className="skeleton h-40 w-full max-w-3xl" />
        </div>
      </div>
    );
  }

  async function submitReport(reason) {
    setReporting(false);
    try {
      await post(`/experiences/${id}/report`, { reason });
      setReported(true);
    } catch {
      setReported(true); // reporting twice is idempotent server-side
    }
  }

  return (
    <div>
      <section className="night on-night">
        <div className="mx-auto max-w-6xl px-5 pb-10 pt-8 md:pb-12">
          <Link to="/archive" className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-mist hover:text-white">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
            Back to the archive
          </Link>

          <div className="mt-7 flex items-start gap-5" style={{ animation: 'rise 340ms ease both' }}>
            <CompanyMark name={experience.company.name} size={60} />
            <div className="min-w-0">
              <h1 className="display text-[clamp(2rem,5vw,3.1rem)] text-white">{experience.company.name}</h1>
              <p className="mt-1 text-[17px] text-mist">{experience.role}</p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2" style={{ animation: 'rise 340ms ease 60ms both' }}>
            <OutcomeBadge outcome={experience.outcome} />
            <StatusBadge status={experience.status} />
            <span className="tag tag-quiet">{DRIVE_LABEL[experience.driveType]}</span>
            <span className="tag tag-quiet">{experience.interviewYear}</span>
            <span className="tag tag-quiet">
              {experience.roundCount ?? experience.rounds.length} {(experience.roundCount ?? experience.rounds.length) === 1 ? 'round' : 'rounds'}
            </span>
          </div>

          {experience.rounds.length > 0 && (
            <div className="mt-7 max-w-xl rounded-xl bg-white/[0.06] p-4 ring-1 ring-white/10" style={{ animation: 'rise 340ms ease 120ms both' }}>
              <RoundStripOnNight rounds={experience.rounds} />
            </div>
          )}

          <div className="mt-6" style={{ animation: 'rise 340ms ease 160ms both' }}>
            <InteractionBar experience={experience} interactions={interactions} />
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-10 px-5 py-10 md:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="space-y-5 md:sticky md:top-24 md:self-start">
          <div className="panel p-5">
            <p className="field-label">Shared by</p>
            <p className="text-[15px] font-semibold">{authorLabel(experience.author)}</p>
            {/* No email address. Ever. */}
            <p className="mt-0.5 text-[13px] text-ink-2">
              Batch of {experience.author.graduationBatch}
              {experience.author.branch ? `, ${experience.author.branch}` : ''}
            </p>
            <p className="mt-1 text-[12.5px] text-ink-3">Shared {relativeDate(experience.createdAt)}</p>
          </div>

          {experience.rounds.length > 0 && (
            <nav className="panel p-5" aria-label="Rounds">
              <p className="field-label">Jump to a round</p>
              <ol className="mt-1 space-y-1">
                {experience.rounds.map((round) => {
                  const t = roundStyle(round.name);
                  return (
                    <li key={round.order}>
                      <a
                        href={`#round-${round.order}`}
                        className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13.5px] text-ink-2 hover:bg-paper-2 hover:text-ink"
                      >
                        <span
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                          style={{ background: t.color }}
                        >
                          {round.order}
                        </span>
                        <span className="truncate">{round.name}</span>
                      </a>
                    </li>
                  );
                })}
              </ol>
            </nav>
          )}

          {user && (
            <div className="px-1">
              {reported ? (
                <p className="text-[12.5px] text-ink-3">Reported. A moderator will look at it.</p>
              ) : reporting ? (
                <div className="panel space-y-2 p-4">
                  <p className="field-label">Why report this?</p>
                  {REPORT_REASONS.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      className="block w-full rounded-lg border border-rule px-3 py-2 text-left text-[13px] hover:border-rule-strong hover:bg-paper-2"
                      onClick={() => submitReport(r.value)}
                    >
                      {r.label}
                    </button>
                  ))}
                  <button type="button" className="pt-1 text-[12.5px] text-ink-3 underline" onClick={() => setReporting(false)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button type="button" className="text-[12.5px] text-ink-3 underline hover:text-ink" onClick={() => setReporting(true)}>
                  Report this experience
                </button>
              )}
            </div>
          )}
        </aside>

        <main>
          {experience.rounds.length === 0 && (
            <div className="panel p-6 text-[14.5px] text-ink-2">
              This experience was shared without a round-by-round breakdown.
            </div>
          )}

          {/* The interview as a timeline: each node wears its round-type colour. */}
          <ol className="relative space-y-6">
            {experience.rounds.length > 1 && (
              <span aria-hidden="true" className="absolute bottom-6 left-[17px] top-6 w-px bg-rule-strong" />
            )}
            {experience.rounds.map((round, i) => {
              const t = roundStyle(round.name);
              return (
                <li
                  key={round.order}
                  id={`round-${round.order}`}
                  className="relative scroll-mt-24 pl-12"
                  style={{ animation: `rise 340ms ease ${Math.min(i * 70, 280)}ms both` }}
                >
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-5 flex h-9 w-9 items-center justify-center rounded-full text-[14px] font-bold text-white ring-4 ring-paper-2"
                    style={{ background: t.color }}
                  >
                    {round.order}
                  </span>

                  <section className="panel overflow-hidden">
                    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-6 py-4" style={{ background: t.soft }}>
                      <h2 className="display text-[22px]">
                        <span className="sr-only">Round {round.order}: </span>{round.name}
                      </h2>
                      <span className="tag bg-white" style={{ color: t.color }}>{t.label}</span>
                    </header>

                    <div className="px-6 py-5">
                      {round.questions.length > 0 && (
                        <>
                          <p className="field-label">Questions asked</p>
                          <ol className="mt-2 space-y-3">
                            {round.questions.map((q, qi) => (
                              <li key={qi} className="flex gap-3">
                                <span className="mt-0.5 flex h-6 min-w-6 items-center justify-center rounded-md bg-paper-3 px-1.5 text-[12px] font-semibold tabular-nums text-ink-2">
                                  {qi + 1}
                                </span>
                                <div className="text-[15px] leading-relaxed">
                                  {q.text}
                                  {q.topic && (
                                    <span className="ml-2 inline-block rounded-md px-1.5 py-0.5 align-middle text-[11.5px] font-semibold" style={{ background: t.soft, color: t.color }}>
                                      {q.topic}
                                    </span>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ol>
                        </>
                      )}

                      {round.tips && (
                        <div className={`${round.questions.length ? 'mt-5' : ''} flex gap-3 rounded-xl bg-good-soft p-4`}>
                          <svg className="mt-0.5 shrink-0 text-good" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
                          </svg>
                          <div>
                            <p className="text-[13px] font-semibold text-good">Tip from the author</p>
                            <p className="mt-1 text-[14.5px] leading-relaxed text-ink">{round.tips}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
                </li>
              );
            })}
          </ol>
        </main>
      </div>
    </div>
  );
}

/** The round strip, re-skinned for the navy header. */
function RoundStripOnNight({ rounds }) {
  return (
    <div>
      <p className="mb-2.5 text-[13px] font-medium text-mist">How the interview ran</p>
      <RoundStrip rounds={rounds} showLegend={false} />
      <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {rounds.map((r) => (
          <li key={r.order} className="flex items-center gap-1.5 text-[12.5px] text-[#d9ddf2]">
            <span className="h-2 w-2 rounded-full" style={{ background: roundStyle(r.name).color }} />
            {r.name}
          </li>
        ))}
      </ol>
    </div>
  );
}
