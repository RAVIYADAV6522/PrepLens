import { useState } from 'react';
import { Link } from 'react-router-dom';
import { post, toFormError } from '../api/client';
import { BRANCHES, DRIVE_LABEL, DRIVE_TYPES, OUTCOMES, OUTCOME_LABEL } from '../lib/format';
import { CAMPUSES, CAMPUS_LABEL } from '../lib/campus';

const emptyRound = () => ({ name: '', questionText: '', tips: '' });

const blank = () => ({
  campus: 'ru',
  company: '',
  role: '',
  driveType: 'on-campus',
  interviewYear: new Date().getFullYear(),
  outcome: '',
  isAnonymous: true,
  authorName: '',
  authorBatch: new Date().getFullYear(),
  authorBranch: '',
  consent: false,
});

/**
 * An admin posts an experience on a student's behalf: a shy RU student, or a
 * student from another campus (only RU students have accounts). It goes live
 * immediately. A named post needs the admin to confirm the student agreed;
 * an anonymous one shows only the campus and batch.
 */
export function AdminPostForm() {
  const [form, setForm] = useState(blank);
  const [rounds, setRounds] = useState([emptyRound()]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [posted, setPosted] = useState(null);

  const set = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const setRound = (i, field) => (e) =>
    setRounds((r) => r.map((x, j) => (j === i ? { ...x, [field]: e.target.value } : x)));

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = await post('/admin/experiences', {
        ...form,
        interviewYear: Number(form.interviewYear),
        authorBatch: Number(form.authorBatch),
        authorName: form.isAnonymous ? undefined : form.authorName.trim(),
        authorBranch: form.isAnonymous || !form.authorBranch ? undefined : form.authorBranch,
        rounds: rounds
          .filter((r) => r.name.trim())
          .map((r) => ({
            name: r.name.trim(),
            questions: r.questionText.split('\n').map((t) => t.trim()).filter(Boolean).map((text) => ({ text })),
            tips: r.tips.trim() || undefined,
          })),
      });
      setPosted(body.data);
      setForm((f) => ({ ...blank(), campus: f.campus }));
      setRounds([emptyRound()]);
    } catch (err) {
      const { message, fields } = toFormError(err);
      const detail = Object.entries(fields ?? {}).map(([k, v]) => `${k}: ${v}`).join(', ');
      setError(detail ? `${message} (${detail})` : message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-6">
      <p className="max-w-2xl text-[14px] text-ink-2">
        Post an experience for a student who shared it with the placement team but not here, or for
        a student from another NST campus. It goes live straight away.
      </p>

      {posted && (
        <p className="rounded-lg bg-good-soft px-4 py-3 text-[13.5px] text-ink-2">
          Posted to {CAMPUS_LABEL[posted.campus]}: <Link className="font-semibold text-brand hover:underline" to={`/experience/${posted.id}`}>{posted.company.name}, {posted.role}</Link>
        </p>
      )}

      <section className="panel grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="ap-campus">Campus</label>
          <select id="ap-campus" className="input" value={form.campus} onChange={set('campus')}>
            {CAMPUSES.map((c) => <option key={c} value={c}>{CAMPUS_LABEL[c]}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="ap-company">Company</label>
          <input id="ap-company" className="input" required maxLength={120} value={form.company} onChange={set('company')} placeholder="e.g. Dream11" />
        </div>
        <div>
          <label className="field-label" htmlFor="ap-role">Role</label>
          <input id="ap-role" className="input" required maxLength={80} value={form.role} onChange={set('role')} placeholder="e.g. SDE Intern" />
        </div>
        <div>
          <label className="field-label" htmlFor="ap-drive">Drive</label>
          <select id="ap-drive" className="input" value={form.driveType} onChange={set('driveType')}>
            {DRIVE_TYPES.map((d) => <option key={d} value={d}>{DRIVE_LABEL[d]}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="ap-year">Interview year</label>
          <input id="ap-year" type="number" className="input" required min={2000} max={2100} value={form.interviewYear} onChange={set('interviewYear')} />
        </div>
        <div>
          <label className="field-label" htmlFor="ap-outcome">Outcome</label>
          <select id="ap-outcome" className="input" required value={form.outcome} onChange={set('outcome')}>
            <option value="" disabled>Choose…</option>
            {OUTCOMES.map((o) => <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>)}
          </select>
        </div>
      </section>

      <section className="panel space-y-4 p-5">
        <p className="field-label">The student</p>
        <div className="flex flex-wrap gap-2">
          {[[true, 'Anonymous'], [false, 'Under their name']].map(([anon, label]) => (
            <button
              key={label}
              type="button"
              aria-pressed={form.isAnonymous === anon}
              onClick={() => setForm((f) => ({ ...f, isAnonymous: anon }))}
              className={`pressable rounded-lg border px-3 py-2 text-[14px] font-medium ${
                form.isAnonymous === anon ? 'border-brand bg-brand-soft text-ink' : 'border-rule bg-paper text-ink-2'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {!form.isAnonymous && (
            <div>
              <label className="field-label" htmlFor="ap-name">Student name</label>
              <input id="ap-name" className="input" required maxLength={120} value={form.authorName} onChange={set('authorName')} />
            </div>
          )}
          <div>
            <label className="field-label" htmlFor="ap-batch">Graduation batch</label>
            <input id="ap-batch" type="number" className="input" required min={2000} max={2100} value={form.authorBatch} onChange={set('authorBatch')} />
          </div>
          {!form.isAnonymous && (
            <div>
              <label className="field-label" htmlFor="ap-branch">Branch</label>
              <select id="ap-branch" className="input" value={form.authorBranch} onChange={set('authorBranch')}>
                <option value="">Not shown</option>
                {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          )}
        </div>
        {!form.isAnonymous && (
          <label className="flex items-start gap-2.5 text-[14px] text-ink-2">
            <input type="checkbox" className="mt-1" checked={form.consent} onChange={set('consent')} />
            The student agreed to have this posted publicly under their name.
          </label>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="field-label">Rounds</p>
          <button type="button" className="btn btn-ghost" onClick={() => setRounds((r) => [...r, emptyRound()])}>+ Add round</button>
        </div>
        {rounds.map((round, i) => (
          <div key={i} className="panel p-5">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-semibold">Round {i + 1}</span>
              {rounds.length > 1 && (
                <button type="button" className="text-[12.5px] text-ink-3 underline hover:text-bad" onClick={() => setRounds((r) => r.filter((_, j) => j !== i))}>
                  Remove
                </button>
              )}
            </div>
            <label className="field-label mt-3" htmlFor={`ap-round-${i}`}>Round name</label>
            <input id={`ap-round-${i}`} className="input" value={round.name} onChange={setRound(i, 'name')} placeholder="e.g. Online Assessment" />
            <label className="field-label mt-3" htmlFor={`ap-q-${i}`}>Questions (one per line)</label>
            <textarea id={`ap-q-${i}`} className="input min-h-24" value={round.questionText} onChange={setRound(i, 'questionText')} />
            <label className="field-label mt-3" htmlFor={`ap-tips-${i}`}>Tips</label>
            <textarea id={`ap-tips-${i}`} className="input min-h-20" value={round.tips} onChange={setRound(i, 'tips')} />
          </div>
        ))}
      </section>

      {error && <p className="rounded-lg bg-bad-soft px-4 py-3 text-[13.5px] text-bad">{error}</p>}

      <button
        type="submit"
        className="btn btn-primary pressable"
        disabled={saving || !form.outcome || (!form.isAnonymous && !form.consent)}
      >
        {saving ? 'Posting…' : `Post to ${CAMPUS_LABEL[form.campus]}`}
      </button>
    </form>
  );
}
