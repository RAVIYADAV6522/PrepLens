import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get, post, toFormError } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { OutcomeBadge } from '../components/Badge';
import { CompanyMark } from '../components/ExperienceCard';
import { RoundStrip } from '../components/RoundStrip';
import { DRIVE_LABEL, OUTCOME_ACCENT, authorLabel, relativeDate } from '../lib/format';
import { roundStyle } from '../lib/rounds';

/**
 * The admin dashboard.
 *
 * Its main job is the review queue: nothing a student submits reaches the
 * archive until someone here approves it. Reports and company clean-up sit
 * behind it as tabs. Nothing here deletes anything — every decision is a
 * status change with the admin's name on it.
 */
export function Admin() {
  const { user } = useAuth();
  const [queue, setQueue] = useState(null);
  const [reports, setReports] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [stats, setStats] = useState(null);
  const [tab, setTab] = useState('review');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [mergeInto, setMergeInto] = useState({});

  const load = useCallback(() => {
    get('/admin/experiences/pending').then((b) => setQueue(b.data)).catch(() => setQueue([]));
    get('/admin/reports').then((b) => setReports(b.data)).catch(() => setReports([]));
    get('/admin/companies/pending').then((b) => setCompanies(b.data)).catch(() => setCompanies([]));
    get('/experiences/stats').then((b) => setStats(b.data)).catch(() => setStats(null));
  }, []);

  useEffect(load, [load]);

  async function act(path, key, body = {}) {
    setBusy(key);
    setError(null);
    try {
      await post(path, body);
      load();
    } catch (err) {
      setError(toFormError(err).message);
    } finally {
      setBusy(null);
    }
  }

  const tabs = [
    ['review', 'Review queue', queue?.length ?? 0],
    ['reports', 'Reports', reports.length],
    ['companies', 'New companies', companies.length],
  ];

  return (
    <div>
      <section className="night on-night">
        <div className="mx-auto max-w-5xl px-5 py-12 md:py-14">
          <p className="eyebrow">Admin dashboard</p>
          <h1 className="display mt-3 text-[clamp(2rem,4.5vw,2.8rem)] text-white">
            Welcome back, {user?.name?.split(' ')[0]}.
          </h1>
          <p className="mt-3 max-w-xl text-[15px] text-mist">
            Every experience waits here until you approve it. Approved posts appear in the archive
            straight away; rejected ones go back to their author with your note.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            <DashStat label="Waiting for review" value={queue?.length} highlight />
            <DashStat label="Open reports" value={reports.length} />
            <DashStat label="New company names" value={companies.length} />
            <DashStat label="Live in the archive" value={stats?.experiences} />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-5 py-10">
        <div className="inline-flex flex-wrap gap-1 rounded-xl bg-paper-3 p-1" role="tablist">
          {tabs.map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-[14px] font-semibold ${
                tab === key ? 'bg-paper text-ink shadow-sm' : 'text-ink-3 hover:text-ink'
              }`}
            >
              {label}
              <span className={`rounded-full px-2 py-0.5 text-[12px] ${count ? 'bg-brand text-white' : 'bg-paper-2 text-ink-3'}`}>
                {count}
              </span>
            </button>
          ))}
        </div>

        {error && <p className="mt-5 rounded-lg bg-bad-soft px-4 py-3 text-[13.5px] text-bad">{error}</p>}

        {tab === 'review' && (
          <section className="mt-6">
            {queue === null && <div className="skeleton h-40 w-full" />}

            {queue?.length === 0 && (
              <Empty title="All caught up." body="No submissions are waiting. New ones will appear here the moment a student shares one." />
            )}

            <div className="space-y-4">
              {queue?.map((exp, i) => (
                <ReviewCard
                  key={exp.id}
                  experience={exp}
                  index={i}
                  busy={busy === exp.id}
                  onApprove={() => act(`/admin/experiences/${exp.id}/approve`, exp.id)}
                  onReject={(note) => act(`/admin/experiences/${exp.id}/reject`, exp.id, note ? { note } : {})}
                />
              ))}
            </div>
          </section>
        )}

        {tab === 'reports' && (
          <section className="mt-6">
            <p className="max-w-2xl text-[14px] text-ink-2">
              Students can report a live post that names an interviewer, breaks an NDA, looks made up
              or is abusive. Remove it to hide it from the archive, or dismiss the report if the post is fine.
            </p>

            {reports.length === 0 && <Empty title="Nothing reported." body="Good sign." />}

            <div className="mt-5 space-y-3">
              {reports.map((report) => (
                <div key={report.id} className="panel p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tag bg-bad-soft text-bad">{report.reason}</span>
                    {report.experience && <span className="tag tag-quiet">{report.experience.status}</span>}
                  </div>

                  {report.experience ? (
                    <p className="display mt-2 text-[20px]">
                      <Link to={`/experience/${report.experience.id}`} className="hover:text-brand">
                        {report.experience.company}
                      </Link>
                      <span className="ml-2 font-sans text-[14px] font-normal text-ink-2">{report.experience.role}</span>
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
        )}

        {tab === 'companies' && (
          <section className="mt-6">
            <p className="max-w-2xl text-[14px] text-ink-2">
              Company names students typed that are not in the list yet. Approve a real company so it
              shows in the archive filter, or merge a typo into the right one — the old spelling is
              remembered, so future posts match automatically. Reject a name that is not a real
              company, once its posts have been rejected in the review queue.
            </p>

            {companies.length === 0 && <Empty title="Nothing waiting." body="Every company name matched one already in the list." />}

            <div className="mt-5 space-y-3">
              {companies.map((company) => (
                <div key={company.slug} className="panel flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold">{company.name}</p>
                    <p className="text-[12.5px] text-ink-3">{company.slug} · {company.experienceCount} experiences</p>
                  </div>

                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy === company.slug}
                    onClick={() => act(`/admin/companies/${company.slug}/approve`, company.slug)}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ color: 'var(--color-bad)' }}
                    disabled={busy === company.slug}
                    onClick={() => act(`/admin/companies/${company.slug}/reject`, company.slug)}
                    title="For names that are not a real company. Reject its posts in the review queue first."
                  >
                    Reject
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
                      onClick={() => act(`/admin/companies/${company.slug}/merge`, company.slug, { into: mergeInto[company.slug].trim() })}
                    >
                      Merge
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function DashStat({ label, value, highlight = false }) {
  return (
    <div className="rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10">
      <p className="text-[12.5px] font-medium text-mist">{label}</p>
      <p className={`display mt-1 text-[30px] ${highlight && value ? 'text-saffron' : 'text-white'}`}>{value ?? '—'}</p>
    </div>
  );
}

function Empty({ title, body }) {
  return (
    <div className="panel mt-5 p-10 text-center">
      <p className="display text-[22px]">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-[14px] text-ink-2">{body}</p>
    </div>
  );
}

/** One submission, readable in full, with the decision at the bottom. */
function ReviewCard({ experience, index, busy, onApprove, onReject }) {
  const [open, setOpen] = useState(index === 0);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');

  return (
    <article
      className="panel relative overflow-hidden p-6 pl-7"
      style={{ animation: `rise 320ms ease ${Math.min(index * 45, 300)}ms both` }}
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1" style={{ background: OUTCOME_ACCENT[experience.outcome] }} />

      <div className="flex flex-wrap items-start gap-4">
        <CompanyMark name={experience.company.name} size={46} />
        <div className="min-w-0 flex-1">
          <p className="display text-[22px]">{experience.company.name}</p>
          <p className="text-[14px] text-ink-2">{experience.role}</p>
          <p className="mt-1 text-[12.5px] text-ink-3">
            {authorLabel(experience.author)}
            {experience.author?.branch ? ` · ${experience.author.branch}` : ''} · submitted {relativeDate(experience.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <OutcomeBadge outcome={experience.outcome} />
          <span className="tag tag-quiet">{DRIVE_LABEL[experience.driveType]}</span>
          <span className="tag tag-quiet">{experience.interviewYear}</span>
        </div>
      </div>

      {experience.rounds.length > 0 && (
        <div className="mt-5">
          <RoundStrip rounds={experience.rounds} />
        </div>
      )}

      <button
        type="button"
        className="mt-4 text-[13.5px] font-semibold text-brand hover:underline"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? 'Hide the full post' : `Read the full post (${experience.rounds.length} ${experience.rounds.length === 1 ? 'round' : 'rounds'})`}
      </button>

      {open && (
        <ol className="mt-4 space-y-3 enter-fade">
          {experience.rounds.map((round) => {
            const style = roundStyle(round.name);
            return (
              <li key={round.order} className="rounded-xl border border-rule p-4" style={{ borderLeft: `3px solid ${style.color}` }}>
                <p className="text-[12px] font-semibold" style={{ color: style.color }}>Round {round.order} · {style.label}</p>
                <p className="mt-0.5 text-[15px] font-semibold">{round.name}</p>
                {round.questions.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] text-ink-2">
                    {round.questions.map((q, i) => <li key={i}>{q.text}</li>)}
                  </ul>
                )}
                {round.tips && <p className="mt-2 rounded-lg bg-paper-2 px-3 py-2 text-[13.5px] text-ink-2"><span className="font-semibold">Tip: </span>{round.tips}</p>}
              </li>
            );
          })}
          {experience.rounds.length === 0 && <p className="text-[14px] text-ink-3">No rounds were written up.</p>}
        </ol>
      )}

      <div className="mt-5 border-t border-rule pt-4">
        {rejecting ? (
          <div className="enter-fade">
            <label className="field-label" htmlFor={`note-${experience.id}`}>Why isn't it approved? The author will see this.</label>
            <textarea
              id={`note-${experience.id}`}
              className="input min-h-[80px]"
              maxLength={1000}
              placeholder="e.g. Please remove the interviewer's name and resubmit."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn pressable"
                style={{ background: 'var(--color-bad)', color: '#fff' }}
                disabled={busy}
                onClick={() => onReject(note.trim())}
              >
                {busy ? 'Rejecting…' : 'Reject and notify author'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setRejecting(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn pressable"
              style={{ background: 'var(--color-good)', color: '#fff' }}
              disabled={busy}
              onClick={onApprove}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
              {busy ? 'Approving…' : 'Approve and publish'}
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setRejecting(true)}>
              Reject
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
