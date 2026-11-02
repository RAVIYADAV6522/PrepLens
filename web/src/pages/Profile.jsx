import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get, post, del, toFormError } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { OutcomeBadge, StatusBadge } from '../components/Badge';
import { CompanyMark } from '../components/ExperienceCard';
import { interviewLabel, OUTCOME_ACCENT, OUTCOME_LABEL } from '../lib/format';

function Stat({ label, value, delay }) {
  return (
    <div className="panel p-4" style={{ animation: `rise 320ms ease ${delay}ms both` }}>
      <p className="text-[13px] font-medium text-ink-3">{label}</p>
      <p className="display mt-1 text-[30px] tabular-nums">{value}</p>
    </div>
  );
}

/**
 * Deleting the account. Nothing is preselected: what happens to someone's posts
 * is always their decision, and the API refuses a request without one.
 */
function DeleteAccount({ isAdminAccount }) {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [posts, setPosts] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await del(`/me?posts=${posts}`);
      navigate('/', { replace: true });
      await refresh();
    } catch (err) {
      setError(toFormError(err).message);
      setBusy(false);
    }
  }

  const choices = [
    ['keep', 'Keep my live posts, anonymously', 'They stay in the archive showing only your batch, with no link back to you. You will not be able to edit or remove them afterwards.'],
    ['delete', 'Delete all my posts', 'Every post you shared goes permanently, along with its upvotes and saves.'],
  ];

  return (
    <section className="panel mt-12 p-5">
      <h2 className="text-[16px] font-semibold text-ink">Delete your account</h2>

      {isAdminAccount ? (
        <p className="mt-1.5 text-[13.5px] text-ink-2">
          Admin accounts cannot be deleted here, because moderation records name them. Ask the project owner to remove your admin role first.
        </p>
      ) : (
        <>
          <p className="mt-1.5 max-w-xl text-[13.5px] text-ink-2">
            This removes your sign-in details, your upvotes and your saved list. It cannot be undone.
          </p>

          {!open && (
            <button type="button" className="chip pressable mt-3" onClick={() => setOpen(true)}>
              Delete my account
            </button>
          )}

          {open && (
            <div className="enter-fade mt-4">
              <fieldset className="space-y-2">
                <legend className="text-[13.5px] font-medium text-ink">What should happen to your posts?</legend>
                {choices.map(([value, label, help]) => (
                  <label key={value} className="flex cursor-pointer gap-2.5 rounded-lg border border-rule p-3">
                    <input
                      type="radio"
                      name="account-posts"
                      className="mt-1"
                      checked={posts === value}
                      onChange={() => setPosts(value)}
                    />
                    <span>
                      <span className="block text-[13.5px] font-medium text-ink">{label}</span>
                      <span className="block text-[12.5px] text-ink-2">{help}</span>
                    </span>
                  </label>
                ))}
              </fieldset>

              <p className="mt-3 text-[12.5px] text-ink-3">
                Either way, posts that are not live (waiting for review, declined or unpublished) are deleted.
              </p>

              {error && <p role="alert" className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-[13px] text-bad">{error}</p>}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="chip pressable"
                  style={{ borderColor: 'var(--color-bad)', color: 'var(--color-bad)' }}
                  disabled={!posts || busy}
                  onClick={confirm}
                >
                  {busy ? 'Deleting…' : 'Yes, delete my account'}
                </button>
                <button type="button" className="chip pressable" disabled={busy} onClick={() => setOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function Profile() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [saved, setSaved] = useState([]);
  const [tab, setTab] = useState('shared');
  const [busy, setBusy] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [actionError, setActionError] = useState(null);

  const load = useCallback(() => {
    get('/me/profile')
      .then((b) => { setData(b.data); setLoadFailed(false); })
      .catch(() => setLoadFailed(true));
    get('/me/bookmarks').then((b) => setSaved(b.data)).catch(() => setSaved([]));
  }, []);

  useEffect(load, [load]);

  async function toggleStatus(row) {
    setBusy(row.id);
    try {
      const live = row.status === 'published' || row.status === 'pending';
      await post(`/experiences/${row.id}/${live ? 'unpublish' : 'publish'}`);
      setActionError(null);
      load();
    } catch (err) {
      setActionError(toFormError(err).message);
    } finally { setBusy(null); }
  }

  async function withdrawUpdate(row) {
    setBusy(row.id);
    try {
      await del(`/experiences/${row.id}/result-update`);
      setActionError(null);
      load();
    } catch (err) {
      setActionError(toFormError(err).message);
    } finally { setBusy(null); }
  }

  async function destroy(row) {
    setBusy(row.id);
    try {
      await del(`/experiences/${row.id}`);
      setConfirming(null);
      setActionError(null);
      load();
    } catch (err) {
      setActionError(toFormError(err).message);
    } finally { setBusy(null); }
  }

  if (!data && loadFailed) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-12">
        <p className="text-[14px] text-ink">Could not load your profile. It may be waking up.</p>
        <button type="button" className="btn btn-ghost mt-4" onClick={load}>Try again</button>
      </div>
    );
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
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-night text-[24px] font-semibold text-white ring-4 ring-brand-soft">
          {user?.name?.[0]?.toUpperCase() ?? '?'}
        </span>
        <div>
          <p className="eyebrow">Your profile</p>
          <h1 className="display mt-1 text-[32px]">{user?.name}</h1>
          <p className="text-[13.5px] text-ink-2">
            Batch of {user?.graduationBatch ?? '—'}
            {user?.branch ? `, ${user.branch}` : ''}
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

      {actionError && <p role="alert" className="mt-6 rounded-lg bg-bad-soft px-4 py-3 text-[13.5px] text-bad">{actionError}</p>}

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
          <Link to={tab === 'shared' ? '/submit' : '/archive'} className="btn btn-primary mt-5">
            {tab === 'shared' ? 'Share an experience' : 'Browse the archive'}
          </Link>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {rows.map((row, i) => (
          <div
            key={row.id}
            className="panel card-hover relative overflow-hidden p-5 pl-6"
            style={{ animation: `rise 320ms ease ${Math.min(i * 45, 300)}ms both` }}
          >
            <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1" style={{ background: OUTCOME_ACCENT[row.outcome] }} />
            <div className="flex flex-wrap items-center gap-2">
              <OutcomeBadge outcome={row.outcome} />
              {tab === 'shared' && <StatusBadge status={row.status} />}
              {row.isAnonymous && <span className="tag bg-brand-soft text-brand">Anonymous</span>}
              {row.upvoteCount > 0 && (
                <span className="tag tag-quiet">{row.upvoteCount} upvote{row.upvoteCount === 1 ? '' : 's'}</span>
              )}
            </div>

            <div className="mt-3 flex items-center gap-3">
              <CompanyMark name={row.company.name} size={38} />
              <div className="min-w-0">
                <p className="display text-[20px]">
                  <Link to={`/experience/${row.id}`} className="hover:text-brand">{row.company.name}</Link>
                </p>
                <p className="text-[13px] text-ink-2">{row.role}, {interviewLabel(row)}</p>
              </div>
            </div>

            {tab === 'shared' && row.pendingUpdate && (
              <p className="mt-3 rounded-lg bg-brand-soft px-3 py-2 text-[13px] text-ink-2">
                <span className="font-semibold text-brand">Update in review: </span>
                {OUTCOME_LABEL[row.pendingUpdate.outcome]}, {row.pendingUpdate.rounds.length} round{row.pendingUpdate.rounds.length === 1 ? '' : 's'}.
                {row.status === 'published' && ' Your post stays live as it is until an admin approves it.'}
              </p>
            )}

            {tab === 'shared' && !row.pendingUpdate && row.updateReviewNote && (
              <p className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-[13px] text-ink-2">
                <span className="font-semibold text-bad">Update not approved: </span>{row.updateReviewNote}
              </p>
            )}

            {tab === 'shared' && row.status === 'rejected' && row.reviewNote && (
              <p className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-[13px] text-ink-2">
                <span className="font-semibold text-bad">Admin's note: </span>{row.reviewNote}
              </p>
            )}

            {tab === 'shared' && (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-rule pt-3">
                {row.pendingUpdate && (
                  <button type="button" className="chip pressable" disabled={busy === row.id} onClick={() => withdrawUpdate(row)}>
                    Withdraw update
                  </button>
                )}
                {!row.pendingUpdate && row.status === 'published' && row.outcome === 'in-process' && (
                  <Link to={`/experience/${row.id}/update`} className="chip pressable" style={{ borderColor: 'var(--color-brand)', color: 'var(--color-brand)' }}>
                    Update result
                  </Link>
                )}
                {!row.pendingUpdate && row.status !== 'removed' && (
                  <Link to={`/experience/${row.id}/edit`} className="chip pressable" style={{ borderColor: 'var(--color-brand)', color: 'var(--color-brand)' }}>
                    Update
                  </Link>
                )}
                {row.status !== 'removed' && (
                  <button type="button" className="chip pressable" disabled={busy === row.id} onClick={() => toggleStatus(row)}>
                    {{ published: 'Unpublish', pending: 'Withdraw from review' }[row.status] ?? 'Resubmit for review'}
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
        <p className="mt-6 max-w-lg text-[12.5px] leading-relaxed text-ink-3">
          Unpublishing hides an experience and keeps it — you can put it back at any time.
          Deleting removes it permanently, along with its upvotes and saves.
        </p>
      )}

      <DeleteAccount isAdminAccount={user?.role === 'admin'} />
    </div>
  );
}
