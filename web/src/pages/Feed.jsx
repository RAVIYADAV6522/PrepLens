import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { get } from '../api/client';
import { ExperienceCard, ExperienceCardSkeleton } from '../components/ExperienceCard';
import { useInteractions } from '../hooks/useInteractions';
import { OUTCOMES, OUTCOME_ACCENT, OUTCOME_LABEL, OUTCOME_TONE } from '../lib/format';
import { ROUND_TYPES } from '../lib/rounds';

export function Feed() {
  // Filters live in the URL so a filtered view is shareable — spec FEED-04.
  const [params, setParams] = useSearchParams();
  const company = params.get('company') ?? '';
  const outcome = params.get('outcome') ?? '';
  const query = params.get('q') ?? '';

  const [experiences, setExperiences] = useState([]);
  const [page, setPage] = useState({ nextCursor: null, hasMore: false, truncated: false });
  const [companies, setCompanies] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [searchDraft, setSearchDraft] = useState(query);

  // One request for the whole page's upvote/bookmark state — the cached feed
  // cannot carry it, because a shared cache must serve everyone the same bytes.
  const interactions = useInteractions(experiences.map((e) => e.id));

  const buildQuery = useCallback(
    (cursor) => {
      const qs = new URLSearchParams();
      if (company) qs.set('company', company);
      if (outcome) qs.set('outcome', outcome);
      if (query) qs.set('q', query);
      if (cursor) qs.set('cursor', cursor);
      qs.set('limit', '10');
      return qs.toString();
    },
    [company, outcome, query],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    get(`/experiences?${buildQuery()}`)
      .then((body) => {
        if (cancelled) return;
        setExperiences(body.data);
        setPage(body.page);
      })
      .catch(() => { if (!cancelled) setError('Could not load the archive. It may be waking up — try again in a moment.'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [buildQuery]);

  useEffect(() => {
    get('/companies').then((b) => setCompanies(b.data)).catch(() => setCompanies([]));
    get('/experiences/stats').then((b) => setStats(b.data)).catch(() => setStats(null));
  }, []);

  /**
   * "Load more" sends the CURSOR, not a page number. A row published while
   * the reader is on page 1 therefore cannot make a row appear twice.
   */
  async function loadMore() {
    if (!page.nextCursor) return;
    setLoadingMore(true);
    try {
      const body = await get(`/experiences?${buildQuery(page.nextCursor)}`);
      setExperiences((current) => [...current, ...body.data]);
      setPage(body.page);
    } finally {
      setLoadingMore(false);
    }
  }

  function updateParam(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  }

  const filtered = Boolean(company || outcome || query);

  return (
    <div>
      {/* The lens band: what this is, and the search that is its first job. */}
      <section className="night on-night">
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-10 px-5 pb-14 pt-14 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:pb-16 md:pt-20">
          <div className="max-w-3xl">
            <p className="eyebrow">The NST placement archive</p>
            <h1 className="display mt-4 text-[clamp(2.3rem,6vw,4rem)] text-white">
              Every interview, every round, every question.
            </h1>
            <p className="mt-5 max-w-xl text-[16.5px] leading-relaxed text-mist">
              Placement experiences written by seniors, for juniors. Search a company before your
              interview and see exactly what they asked.
            </p>

          <form
            role="search"
            className="mt-9 flex max-w-2xl items-center gap-2 rounded-2xl bg-white p-2 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.6)]"
            onSubmit={(e) => { e.preventDefault(); updateParam('q', searchDraft.trim()); }}
          >
            <svg className="ml-3 shrink-0 text-ink-3" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
            </svg>
            <label htmlFor="search" className="sr-only">Search the archive</label>
            <input
              id="search"
              className="min-w-0 flex-1 bg-transparent px-1 py-2.5 text-[15.5px] text-ink placeholder:text-ink-3 focus:outline-none"
              placeholder="Search a company, question or topic"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
            />
            <button type="submit" className="btn btn-primary pressable">Search</button>
          </form>

          </div>

          <dl className="flex flex-wrap gap-x-12 gap-y-5 md:mb-1 md:flex-col md:gap-0 md:divide-y md:divide-white/10 md:rounded-2xl md:bg-white/[0.06] md:px-7 md:py-2 md:ring-1 md:ring-white/10">
            <div className="md:py-5">
              <dt className="text-[13px] text-mist">Experiences shared</dt>
              <dd className="display mt-1 text-[40px] tabular-nums text-saffron">{stats?.experiences ?? '—'}</dd>
            </div>
            <div className="md:py-5">
              <dt className="text-[13px] text-mist">Companies covered</dt>
              <dd className="display mt-1 text-[40px] tabular-nums text-white">{stats?.companies ?? '—'}</dd>
            </div>
          </dl>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-8 px-5 py-10 md:grid-cols-[250px_minmax(0,1fr)] md:gap-10">
        <aside className="md:sticky md:top-24 md:self-start">
          <div className="panel space-y-6 p-5">
            <div>
              <label className="field-label" htmlFor="company">Company</label>
              <select id="company" className="input" value={company} onChange={(e) => updateParam('company', e.target.value)}>
                <option value="">All companies</option>
                {companies.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name} ({c.experienceCount})
                  </option>
                ))}
              </select>
            </div>

            {/* Outcome filters double as the legend for the colours on every card. */}
            <fieldset>
              <legend className="field-label">Outcome</legend>
              <div className="flex flex-wrap gap-2 md:flex-col md:items-stretch">
                {OUTCOMES.map((o) => {
                  const on = outcome === o;
                  return (
                    <button
                      key={o}
                      type="button"
                      aria-pressed={on}
                      onClick={() => updateParam('outcome', on ? '' : o)}
                      className={`pressable flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-[13.5px] font-medium transition-colors ${
                        on ? 'border-transparent ' + OUTCOME_TONE[o] : 'border-rule bg-paper text-ink-2 hover:border-rule-strong hover:bg-paper-2'
                      }`}
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: OUTCOME_ACCENT[o] }} />
                      {OUTCOME_LABEL[o]}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div>
              <p className="field-label">Round colours</p>
              <ul className="space-y-1.5">
                {Object.values(ROUND_TYPES).map((t) => (
                  <li key={t.label} className="flex items-center gap-2.5 text-[13px] text-ink-2">
                    <span className="h-1.5 w-5 rounded-full" style={{ background: t.color }} />
                    {t.label}
                  </li>
                ))}
              </ul>
            </div>

            {filtered && (
              <button
                type="button"
                className="btn btn-ghost w-full"
                onClick={() => { setSearchDraft(''); setParams(new URLSearchParams(), { replace: true }); }}
              >
                Clear filters
              </button>
            )}
          </div>
        </aside>

        <main className="space-y-4">
          {!loading && !error && (
            <div className="flex items-baseline justify-between pb-1">
              <h2 className="text-[15px] font-semibold text-ink">
                {query ? `Results for \u201c${query}\u201d` : filtered ? 'Filtered experiences' : 'Latest experiences'}
              </h2>
            </div>
          )}

          {loading && [0, 1, 2].map((i) => <ExperienceCardSkeleton key={i} index={i} />)}

          {!loading && error && (
            <div className="panel border-l-4 border-l-bad p-5">
              <p className="text-[14px] text-ink">{error}</p>
            </div>
          )}

          {!loading && !error && experiences.length === 0 && (
            <div className="panel enter p-10 text-center">
              <p className="display text-[22px]">Nothing here yet</p>
              <p className="mx-auto mt-2 max-w-sm text-[14px] text-ink-2">
                {filtered
                  ? 'No experience matches those filters. Clear them to see the whole archive.'
                  : 'The archive is empty. If you have interviewed, yours would be the first.'}
              </p>
            </div>
          )}

          {!loading &&
            experiences.map((experience, i) => (
              <ExperienceCard
                key={experience.id}
                experience={experience}
                interactions={interactions}
                index={i}
              />
            ))}

          {page.truncated && (
            <p className="text-[13px] text-ink-3">
              Showing the closest matches. Narrow the search to see different ones.
            </p>
          )}

          {page.hasMore && (
            <button type="button" className="btn btn-ghost w-full" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </main>
      </div>
    </div>
  );
}
