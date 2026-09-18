import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get, post } from '../api/client';
import { OutcomeBadge, StatusBadge } from '../components/Badge';

/**
 * "My experiences" — where retraction lives.
 *
 * Unpublishing is one click, needs no reason and asks no approval. That is a
 * promise made at submit time, so it cannot acquire conditions later.
 */
export function Mine() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    get('/experiences/mine')
      .then((b) => setRows(b.data))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function toggle(row) {
    setBusy(row.id);
    try {
      await post(`/experiences/${row.id}/${row.status === 'published' ? 'unpublish' : 'publish'}`);
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <p className="eyebrow">// Yours</p>
      <h1 className="display mt-4 text-[34px]">Your experiences</h1>
      <p className="mt-3 text-[14.5px] text-ink-2">
        Unpublish any of these at any time, for any reason. Nobody is asked and nothing is deleted —
        you can put it back later.
      </p>

      {loading && <p className="mt-8 font-mono text-[12px] text-ink-3">Loading…</p>}

      {!loading && rows.length === 0 && (
        <div className="panel mt-8 p-8 text-center">
          <p className="display text-[20px]">You have not shared anything yet.</p>
          <Link to="/submit" className="btn btn-primary mt-4">Share your first experience</Link>
        </div>
      )}

      <div className="mt-8 space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="panel flex flex-wrap items-center gap-4 p-5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <OutcomeBadge outcome={row.outcome} />
                <StatusBadge status={row.status} />
                {row.isAnonymous && <span className="tag bg-brand-soft text-brand">Anonymous</span>}
              </div>
              <p className="display mt-2 text-[20px]">
                <Link to={`/experience/${row.id}`} className="hover:text-brand">{row.company.name}</Link>
              </p>
              <p className="text-[13px] text-ink-2">{row.role} · {row.interviewYear}</p>
            </div>

            {row.status !== 'removed' && (
              <button type="button" className="btn btn-ghost" onClick={() => toggle(row)} disabled={busy === row.id}>
                {row.status === 'published' ? 'Unpublish' : 'Publish again'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
