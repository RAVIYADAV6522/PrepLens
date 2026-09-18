import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get, post } from '../api/client';

/**
 * Moderation. Small on purpose — a report queue, remove, reinstate, and the
 * company approve/merge tools that keep the taxonomy from drifting.
 */
export function Admin() {
  const [reports, setReports] = useState([]);
  const [pending, setPending] = useState([]);
  const [busy, setBusy] = useState(null);
  const [mergeInto, setMergeInto] = useState({});

  const load = useCallback(() => {
    get('/admin/reports').then((b) => setReports(b.data)).catch(() => setReports([]));
    get('/admin/companies/pending').then((b) => setPending(b.data)).catch(() => setPending([]));
  }, []);

  useEffect(load, [load]);

  async function act(path, key) {
    setBusy(key);
    try { await post(path, {}); load(); } finally { setBusy(null); }
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-12">
      <p className="eyebrow">// Moderation</p>
      <h1 className="display mt-4 text-[34px]">Reports and taxonomy</h1>
      <p className="mt-3 text-[14.5px] text-ink-2">
        Nothing here deletes anything. Removal is a status change with your name on it.
      </p>

      <section className="mt-10">
        <p className="eyebrow eyebrow-muted">// Open reports ({reports.length})</p>

        {reports.length === 0 && (
          <p className="mt-3 text-[14px] text-ink-2">Nothing reported. Good sign.</p>
        )}

        <div className="mt-4 space-y-3">
          {reports.map((report) => (
            <div key={report.id} className="panel p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="tag bg-bad-soft text-bad">{report.reason}</span>
                {report.experience && (
                  <span className="tag bg-paper-2 text-ink-2">{report.experience.status}</span>
                )}
              </div>

              {report.experience ? (
                <p className="display mt-2 text-[20px]">
                  <Link to={`/experience/${report.experience.id}`} className="hover:text-brand">
                    {report.experience.company}
                  </Link>
                  <span className="ml-2 font-sans text-[14px] font-normal text-ink-2">
                    {report.experience.role}
                  </span>
                </p>
              ) : (
                <p className="mt-2 text-[14px] text-ink-3">The reported experience no longer exists.</p>
              )}

              {report.note && <p className="mt-2 text-[13.5px] text-ink-2">&ldquo;{report.note}&rdquo;</p>}

              <div className="mt-4 flex flex-wrap gap-2 border-t border-rule pt-3">
                {report.experience && report.experience.status !== 'removed' && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy === report.id}
                    onClick={() => act(`/admin/experiences/${report.experience.id}/remove`, report.id)}
                  >
                    Remove the experience
                  </button>
                )}
                {report.experience?.status === 'removed' && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy === report.id}
                    onClick={() => act(`/admin/experiences/${report.experience.id}/reinstate`, report.id)}
                  >
                    Reinstate it
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy === report.id}
                  onClick={() => act(`/admin/reports/${report.id}/dismiss`, report.id)}
                >
                  Dismiss the report
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <p className="eyebrow eyebrow-muted">// Companies awaiting review ({pending.length})</p>
        <p className="mt-2 max-w-xl text-[13.5px] text-ink-2">
          Submitted names that are not yet a filter option. Approve a real company, or merge a
          duplicate into the canonical one — the old name becomes an alias, so future submissions
          resolve correctly.
        </p>

        <div className="mt-4 space-y-3">
          {pending.map((company) => (
            <div key={company.slug} className="panel flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold">{company.name}</p>
                <p className="font-mono text-[11.5px] text-ink-3">
                  {company.slug} · {company.experienceCount} experiences
                </p>
              </div>

              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy === company.slug}
                onClick={() => act(`/admin/companies/${company.slug}/approve`, company.slug)}
              >
                Approve
              </button>

              <div className="flex items-center gap-2">
                <input
                  className="input w-40"
                  placeholder="merge into slug"
                  value={mergeInto[company.slug] ?? ''}
                  onChange={(e) => setMergeInto((m) => ({ ...m, [company.slug]: e.target.value }))}
                />
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy === company.slug || !mergeInto[company.slug]}
                  onClick={async () => {
                    setBusy(company.slug);
                    try {
                      await post(`/admin/companies/${company.slug}/merge`, { into: mergeInto[company.slug].trim() });
                      load();
                    } finally { setBusy(null); }
                  }}
                >
                  Merge
                </button>
              </div>
            </div>
          ))}

          {pending.length === 0 && <p className="text-[14px] text-ink-2">Nothing waiting.</p>}
        </div>
      </section>
    </div>
  );
}
