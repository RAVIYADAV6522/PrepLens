import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get, post, toFormError } from '../api/client';
import { OutcomeBadge, StatusBadge } from '../components/Badge';
import { InteractionBar } from '../components/InteractionBar';
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
        <p className="eyebrow eyebrow-muted">// {error.status === 404 ? 'Not found' : 'Error'}</p>
        <h1 className="display mt-3 text-[32px]">
          {error.status === 404 ? 'That experience is not here.' : 'Something went wrong.'}
        </h1>
        <p className="mt-3 text-[14px] text-ink-2">
          {error.status === 404
            ? 'It may have been unpublished by its author, or the link is wrong.'
            : error.message}
        </p>
        <Link to="/" className="btn btn-dark mt-6">Back to the archive</Link>
      </div>
    );
  }

  if (!experience) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-16">
        <div className="skeleton h-10 w-64" />
        <div className="skeleton mt-4 h-4 w-40" />
        <div className="skeleton mt-10 h-3 w-full max-w-xl" />
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
    <div className="mx-auto max-w-6xl px-5">
      <div className="border-b border-rule py-10">
        <div className="flex flex-wrap items-center gap-2">
          <OutcomeBadge outcome={experience.outcome} />
          <StatusBadge status={experience.status} />
          <span className="tag bg-paper-2 text-ink-2">{DRIVE_LABEL[experience.driveType]}</span>
          <span className="tag bg-paper-2 text-ink-2">{experience.interviewYear}</span>
        </div>

        <h1 className="display mt-4 text-[clamp(2rem,5vw,3rem)]" style={{ animation: 'rise 340ms ease both' }}>
          {experience.company.name}
        </h1>
        <p className="mt-1 text-[17px] text-ink-2">{experience.role}</p>

        <div className="mt-5" style={{ animation: 'rise 340ms ease 100ms both' }}>
          <InteractionBar experience={experience} interactions={interactions} />
        </div>
      </div>

      <div className="grid gap-10 py-8 md:grid-cols-[210px_1fr]">
        <aside className="space-y-7 md:sticky md:top-20 md:self-start">
          <div>
            <p className="eyebrow eyebrow-muted">// Author</p>
            <p className="mt-2 text-[14px] font-medium">{authorLabel(experience.author)}</p>
            {/* No email address. Ever. */}
            <p className="text-[12.5px] text-ink-3">
              Batch of {experience.author.graduationBatch}
              {experience.author.branch ? ` · ${experience.author.branch}` : ''}
            </p>
            <p className="mt-1 font-mono text-[11.5px] text-ink-3">
              shared {relativeDate(experience.createdAt)}
            </p>
          </div>

          {experience.rounds.length > 0 && (
            <div className="border-t border-rule pt-6">
              <p className="eyebrow eyebrow-muted">// Rounds</p>
              <ol className="mt-2 space-y-1.5">
                {experience.rounds.map((round) => (
                  <li key={round.order} className="flex gap-2 text-[13.5px]">
                    <span className="font-mono text-[12px] text-brand">
                      {String(round.order).padStart(2, '0')}
                    </span>
                    <a href={`#round-${round.order}`} className="hover:text-brand">{round.name}</a>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {user && (
            <div className="border-t border-rule pt-6">
              {reported ? (
                <p className="text-[12.5px] text-ink-3">
                  Reported. A moderator will look at it.
                </p>
              ) : reporting ? (
                <div className="space-y-2">
                  <p className="field-label">Why report this?</p>
                  {REPORT_REASONS.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      className="block w-full border border-rule px-2 py-1.5 text-left text-[12.5px] hover:bg-paper-2"
                      onClick={() => submitReport(r.value)}
                    >
                      {r.label}
                    </button>
                  ))}
                  <button type="button" className="text-[12px] text-ink-3 underline" onClick={() => setReporting(false)}>
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

        <main className="space-y-10">
          {experience.rounds.length === 0 && (
            <p className="text-[14.5px] text-ink-2">
              This experience was shared without a round-by-round breakdown.
            </p>
          )}

          {experience.rounds.map((round, i) => (
            <section
              key={round.order}
              id={`round-${round.order}`}
              className="border-l-2 border-brand pl-5"
              style={{ animation: `rise 340ms ease ${Math.min(i * 70, 280)}ms both` }}
            >
              <p className="eyebrow">// Round {String(round.order).padStart(2, '0')}</p>
              <h2 className="display mt-2 text-[24px]">{round.name}</h2>

              {round.questions.length > 0 && (
                <>
                  <p className="field-label mt-5">Questions asked</p>
                  <ol className="space-y-2.5">
                    {round.questions.map((q, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="font-mono text-[12.5px] text-ink-3">Q{i + 1}.</span>
                        <span className="text-[14.5px]">
                          {q.text}
                          {q.topic && (
                            <span className="ml-2 font-mono text-[11px] text-ink-3">[{q.topic}]</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ol>
                </>
              )}

              {round.tips && (
                <div className="mt-5 border-l-2 border-good bg-paper-2 p-4">
                  <p className="eyebrow eyebrow-muted" style={{ color: 'var(--color-good)' }}>// Tips</p>
                  <p className="mt-1.5 text-[14.5px]">{round.tips}</p>
                </div>
              )}
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
