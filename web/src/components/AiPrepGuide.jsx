import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get, toFormError } from '../api/client';
import { OUTCOME_LABEL } from '../lib/format';

/**
 * The AI prep guide for one company, shown above the feed when it is
 * filtered to that company. Generated on request (the button), because a
 * fresh guide takes a few seconds and spends AI quota; afterwards the API
 * serves it from its cache until the company's experiences change.
 */
export function AiPrepGuide({ slug, name }) {
  const [state, setState] = useState({ status: 'idle' });

  // A different company starts over at the button.
  useEffect(() => setState({ status: 'idle' }), [slug]);

  async function load() {
    setState({ status: 'loading' });
    try {
      // Generation can take longer than the client's default 20s timeout.
      const body = await get(`/companies/${encodeURIComponent(slug)}/guide`, { timeout: 60_000 });
      setState({ status: 'ready', guide: body.data });
    } catch (err) {
      setState({ status: 'error', message: toFormError(err).message });
    }
  }

  if (state.status !== 'ready') {
    return (
      <section className="panel enter flex flex-wrap items-center justify-between gap-3 border-l-4 border-l-brand p-5">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-ink">✦ AI prep guide{name ? ` for ${name}` : ''}</p>
          <p className="mt-0.5 text-[13.5px] text-ink-2">
            {state.status === 'error'
              ? state.message
              : state.status === 'loading'
                ? 'Reading every experience for this company…'
                : 'One summary of the rounds, focus areas and tips from every experience here.'}
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={load} disabled={state.status === 'loading'}>
          {state.status === 'loading' ? 'Generating…' : state.status === 'error' ? 'Try again' : 'Generate guide'}
        </button>
      </section>
    );
  }

  const { guide } = state;
  const cite = (sources) =>
    sources.map((n) => {
      const source = guide.sources[n - 1];
      return (
        <Link
          key={n}
          to={`/experience/${source.id}`}
          title={`${source.role}, ${source.interviewYear}`}
          className="ml-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-md bg-brand-soft px-1 align-[2px] text-[11px] font-semibold text-brand hover:bg-brand hover:text-white"
        >
          {n}
        </Link>
      );
    });

  return (
    <section className="panel enter border-l-4 border-l-brand p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[15px] font-semibold text-brand">✦ AI prep guide: {guide.company.name}</p>
        <p className="text-[12px] text-ink-3">
          From {guide.stats.experienceCount} experience{guide.stats.experienceCount === 1 ? '' : 's'} · {guide.model}
        </p>
      </div>

      <p className="mt-2 text-[15px] leading-relaxed text-ink">{guide.overview}</p>

      {guide.rounds.length > 0 && (
        <>
          <p className="field-label mt-5">Rounds</p>
          <ol className="space-y-2">
            {guide.rounds.map((r, i) => (
              <li key={i} className="flex gap-3 text-[14px] text-ink-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-paper-3 text-[11.5px] font-semibold text-ink">{i + 1}</span>
                <span>
                  <strong className="font-semibold text-ink">{r.name}</strong>: {r.focus}
                  {cite(r.sources)}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}

      {guide.stats.topTopics.length > 0 && (
        <>
          <p className="field-label mt-5">Most asked topics</p>
          <div className="flex flex-wrap gap-1.5">
            {guide.stats.topTopics.map((t) => (
              <span key={t.name} className="tag tag-quiet">{t.name} · {t.count}</span>
            ))}
          </div>
        </>
      )}

      {guide.tips.length > 0 && (
        <>
          <p className="field-label mt-5">Tips from seniors</p>
          <ul className="list-disc space-y-1.5 pl-5 text-[14px] text-ink-2">
            {guide.tips.map((t, i) => (
              <li key={i}>{t.text}{cite(t.sources)}</li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-5 border-t border-rule pt-3 text-[12px] text-ink-3">
        Written by AI only from the experiences listed: {guide.sources
          .map((s) => `${s.n}. ${s.role} (${s.interviewYear}, ${OUTCOME_LABEL[s.outcome] ?? s.outcome})`)
          .join(' · ')}. Numbers link to the experience each point came from.
      </p>
    </section>
  );
}
