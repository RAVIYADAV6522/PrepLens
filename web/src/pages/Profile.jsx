import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get, post, del } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { OutcomeBadge, StatusBadge } from '../components/Badge';

function Stat({ label, value, delay }) {
  return (
    <div className="panel p-4" style={{ animation: `rise 320ms ease ${delay}ms both` }}>
      <p className="display text-[30px] tabular-nums">{value}</p>
      <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-3">{label}</p>
    </div>
  );
}

export function Profile() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [saved, setSaved] = useState([]);
  const [tab, setTab] = useState('shared');
  const [busy, setBusy] = useState(null);
  const [confirming, setConfirming] = useState(null);

  const load = useCallback(() => {
    get('/me/profile').then((b) => setData(b.data)).catch(() => setData(null));
    get('/me/bookmarks').then((b) => setSaved(b.data)).catch(() => setSaved([]));
  }, []);

  useEffect(load, [load]);

  async function toggleStatus(row) {
    setBusy(row.id);
    try {
      await post(`/experiences/${row.id}/${row.status === 'published' ? 'unpublish' : 'publish'}`);
      load();
    } finally { setBusy(null); }
  }

  async function destroy(row) {
    setBusy(row.id);
    try {
      await del(`/experiences/${row.id}`);
      setConfirming(null);
      load();
    } finally { setBusy(null); }
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-12">
        <div className="skeleton h-9 w-56" />
        <div className="skeleton mt-4 h-4 w-72" />
      </div>
    );
  }

  const rows = tab === 'shared' ? data.experiences : saved;

  return (
    <div className="mx-auto max-w-4xl px-5 py-12">
      <div className="flex flex-wrap items-center gap-4" style={{ animation: 'rise 320ms ease both' }}>
        <span className="flex h-14 w-14 items-center justify-center bg-brand text-[22px] font-semibold text-white">
          {user?.name?.[0]?.toUpperCase() ?? '?'}
        </span>
        <div>
          <p className="eyebrow">// Your profile</p>
          <h1 className="display mt-1 text-[32px]">{user?.name}</h1>
          <p className="text-[13.5px] text-ink-2">
            Batch of {user?.graduationBatch ?? '—'}
            {user?.branch ? ` · ${user.branch}` : ''}
            {user?.role === 'admin' ? ' · moderator' : ''}
          </p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Shared" value={data.stats.published} delay={60} />
        <Stat label="Companies" value={data.stats.companies} delay={120} />
        <Stat label="Upvotes received" value={data.stats.upvotesReceived} delay={180} />
        <Stat label="Saved" value={data.stats.bookmarks} delay={240} />
      </div>

      <div className="mt-10 flex gap-2 border-b border-rule">
        {[['shared', `Your experiences (${data.experiences.length})`], ['saved', `Saved (${saved.length})`]].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-3 py-2 text-[13.5px] font-medium transition-colors ${
              tab === id ? 'border-brand text-brand' : 'border-transparent text-ink-3 hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {rows.length === 0 && (
        <div className="panel enter mt-6 p-10 text-center">
          <p className="display text-[20px]">
            {tab === 'shared' ? 'You have not shared anything yet.' : 'Nothing saved yet.'}
          </p>
          <p className="mx-auto mt-2 max-w-sm text-[14px] text-ink-2">
            {tab === 'shared'
              ? 'The interview you remember best is the one a junior needs most.'
              : 'Save an experience while browsing and it will wait for you here.'}
          </p>
          <Link to={tab === 'shared' ? '/submit' : '/'} className="btn btn-primary mt-5">
            {tab === 'shared' ? 'Share an experience' : 'Browse the archive'}
          </Link>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {rows.map((row, i) => (
          <div
            key={row.id}
            className="panel card-hover p-5"
            style={{ animation: `rise 320ms ease ${Math.min(i * 45, 300)}ms both` }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <OutcomeBadge outcome={row.outcome} />
              {tab === 'shared' && <StatusBadge status={row.status} />}
              {row.isAnonymous && <span className="tag bg-brand-soft text-brand">Anonymous</span>}
              {row.upvoteCount > 0 && (
                <span className="tag bg-paper-2 text-ink-2">{row.upvoteCount} upvote{row.upvoteCount === 1 ? '' : 's'}</span>
              )}
            </div>

            <p className="display mt-2 text-[21px]">
              <Link to={`/experience/${row.id}`} className="hover:text-brand">{row.company.name}</Link>
            </p>
            <p className="text-[13px] text-ink-2">{row.role} · {row.interviewYear}</p>

            {tab === 'shared' && (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-rule pt-3">
                {row.status !== 'removed' && (
                  <button type="button" className="chip pressable" disabled={busy === row.id} onClick={() => toggleStatus(row)}>
                    {row.status === 'published' ? 'Unpublish' : 'Publish again'}
                  </button>
                )}

                {confirming === row.id ? (
                  <span className="flex flex-wrap items-center gap-2 enter-fade">
                    <span className="text-[12.5px] text-bad">Delete permanently? This cannot be undone.</span>
                    <button
                      type="button"
                      className="chip pressable"
                      style={{ borderColor: 'var(--color-bad)', color: 'var(--color-bad)' }}
                      disabled={busy === row.id}
                      onClick={() => destroy(row)}
                    >
                      {busy === row.id ? 'Deleting…' : 'Yes, delete'}
                    </button>
                    <button type="button" className="chip pressable" onClick={() => setConfirming(null)}>Cancel</button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="chip pressable"
                    onClick={() => setConfirming(row.id)}
                    title="Unpublishing hides it and keeps it. Deleting is permanent."
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {tab === 'shared' && rows.length > 0 && (
        <p className="mt-6 max-w-lg font-mono text-[11.5px] leading-relaxed text-ink-3">
          Unpublishing hides an experience and keeps it — you can put it back at any time.
          Deleting removes it permanently, along with its upvotes and saves.
        </p>
      )}
    </div>
  );
}
