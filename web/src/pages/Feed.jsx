import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { get } from '../api/client';
import { ExperienceCard, ExperienceCardSkeleton } from '../components/ExperienceCard';
import { useInteractions } from '../hooks/useInteractions';
import { OUTCOMES, OUTCOME_LABEL } from '../lib/format';

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
    <div className="mx-auto max-w-6xl px-5">
      <section className="border-b border-rule py-12 md:py-16">
        <p className="eyebrow">// The campus archive</p>
        <h1 className="display mt-4 text-[clamp(2.1rem,6vw,3.6rem)]">
          Every interview,<br />
          every round, <span className="text-brand">every question.</span>
        </h1>
        <p className="mt-5 max-w-xl text-[15.5px] text-ink-2">
          A community-curated archive of campus placement experiences — written by seniors, for
          juniors. No more scattered WhatsApp screenshots.
        </p>
      </section>

      <div className="grid gap-8 py-8 md:grid-cols-[230px_1fr] md:gap-10">
        <aside className="space-y-7">
          <div>
            <label className="field-label" htmlFor="search">Search</label>
            <form
              onSubmit={(e) => { e.preventDefault(); updateParam('q', searchDraft.trim()); }}
            >
              <input
                id="search"
                className="input"
                placeholder="Company, question, topic…"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
              />
            </form>
          </div>

          <div>
            <label className="field-label" htmlFor="company">Filter by company</label>
            <select id="company" className="input" value={company} onChange={(e) => updateParam('company', e.target.value)}>
              <option value="">All companies</option>
              {companies.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name} ({c.experienceCount})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label" htmlFor="outcome">Filter by outcome</label>
            <select id="outcome" className="input" value={outcome} onChange={(e) => updateParam('outcome', e.target.value)}>
              <option value="">Any outcome</option>
              {OUTCOMES.map((o) => (
                <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>
              ))}
            </select>
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

          <div className="border-t border-rule pt-6">
            <p className="eyebrow eyebrow-muted">// Archive size</p>
            <p className="display mt-2 text-[34px] tabular-nums">{stats?.experiences ?? '—'}</p>
            <p className="text-[13px] text-ink-2">
              experiences across {stats?.companies ?? '—'} companies
            </p>
          </div>
        </aside>

        <main className="space-y-4">
          {loading && [0, 1, 2].map((i) => <ExperienceCardSkeleton key={i} index={i} />)}

          {!loading && error && (
            <div className="panel border-l-2 border-bad p-5">
              <p className="text-[14px] text-ink">{error}</p>
            </div>
          )}

          {!loading && !error && experiences.length === 0 && (
            <div className="panel enter p-10 text-center">
              <p className="display text-[20px]">Nothing here yet</p>
              <p className="mx-auto mt-2 max-w-sm text-[14px] text-ink-2">
                {filtered
                  ? 'No experience matches those filters. Try clearing them.'
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
            <p className="font-mono text-[12px] text-ink-3">
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
