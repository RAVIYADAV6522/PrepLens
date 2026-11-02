import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { get, patch, toFormError } from '../api/client';
import { InterviewDateFields } from '../components/InterviewDateFields';
import { DRIVE_LABEL, DRIVE_TYPES, OUTCOMES, OUTCOME_ACCENT, OUTCOME_LABEL, OUTCOME_TONE } from '../lib/format';
import { roundStyle } from '../lib/rounds';
import { emptyRound, toApiRounds } from '../lib/roundForm';

/**
 * Update an experience. A live post stays on the site as it is while an admin
 * reviews the new version; any other post is changed in place.
 */
export function EditExperience() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [experience, setExperience] = useState(null);
  const [form, setForm] = useState(null);
  const [rounds, setRounds] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    get(`/experiences/${id}`)
      .then(({ data }) => {
        setExperience(data);
        setForm({
          company: data.company.name,
          role: data.role,
          driveType: data.driveType,
          interviewYear: data.interviewYear,
          interviewMonth: data.interviewMonth ?? '',
          outcome: data.outcome,
          isAnonymous: Boolean(data.author?.anonymous),
        });
        setRounds(data.rounds.map((r) => ({
          name: r.name,
          questionText: r.questions.map((q) => q.text).join('\n'),
          tips: r.tips ?? '',
        })));
      })
      .catch(() => setLoadError('Could not load this experience.'));
  }, [id]);

  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));
  const setRound = (i, field) => (e) => setRounds((r) => r.map((x, j) => (j === i ? { ...x, [field]: e.target.value } : x)));

  function buildRounds() {
    // Questions are edited as lines of text, so an unchanged line keeps its topic.
    const topics = new Map(experience.rounds.flatMap((r) => r.questions.map((q) => [q.text, q.topic])));

    return toApiRounds(rounds, { topics });
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await patch(`/experiences/${id}`, {
        ...form,
        company: form.company.trim(),
        role: form.role.trim(),
        interviewYear: Number(form.interviewYear),
        interviewMonth: Number(form.interviewMonth),
        rounds: buildRounds(),
      });
      navigate('/profile', { replace: true });
    } catch (err) {
      setError(toFormError(err));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return <p className="mx-auto max-w-3xl px-5 py-12 text-[14px] text-bad">{loadError}</p>;
  }
  if (!form) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-12">
        <div className="skeleton h-9 w-64" />
        <div className="skeleton mt-4 h-40 w-full" />
      </div>
    );
  }

  const isLive = experience.status === 'published' || experience.status === undefined;
  const fieldError = (name) => error?.fields?.[name];

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <p className="eyebrow">Update your experience</p>
      <h1 className="display mt-2 text-[32px]">{experience.company.name}</h1>
      {isLive && (
        <p className="mt-4 rounded-lg bg-brand-soft px-4 py-3 text-[13.5px] text-ink-2">
          Your current post stays on the site exactly as it is while an admin reviews this update.
          Once approved, the new version replaces it.
        </p>
      )}

      {error && (
        <div className="mt-6 rounded-xl border border-bad/20 bg-bad-soft p-4">
          <p className="text-[14px] font-medium">{error.message}</p>
          {error.details?.map((d) => <p key={d} className="mt-1 text-[13px] text-ink-2">{d}</p>)}
        </div>
      )}

      <form onSubmit={submit} className="mt-8 space-y-8">
        <section className="panel p-6">
          <p className="eyebrow eyebrow-muted">The basics</p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="company">Company</label>
              <input id="company" className="input" required maxLength={120} value={form.company} onChange={(e) => set('company')(e.target.value)} />
              {fieldError('company') && <p className="mt-1 text-[12.5px] text-bad">{fieldError('company')}</p>}
            </div>
            <div>
              <label className="field-label" htmlFor="role">Role</label>
              <input id="role" className="input" required maxLength={80} value={form.role} onChange={(e) => set('role')(e.target.value)} />
              {fieldError('role') && <p className="mt-1 text-[12.5px] text-bad">{fieldError('role')}</p>}
            </div>
            <InterviewDateFields
              year={form.interviewYear}
              month={form.interviewMonth}
              onYear={set('interviewYear')}
              onMonth={set('interviewMonth')}
              error={fieldError('interviewMonth')}
            />
            <div>
              <label className="field-label" htmlFor="drive">How did you get the interview?</label>
              <select id="drive" className="input" value={form.driveType} onChange={(e) => set('driveType')(e.target.value)}>
                {DRIVE_TYPES.map((d) => <option key={d} value={d}>{DRIVE_LABEL[d]}</option>)}
              </select>
            </div>
          </div>

          <div className="mt-6">
            <span className="field-label">How did it end?</span>
            <div className="flex flex-wrap gap-2">
              {OUTCOMES.map((o) => (
                <button
                  key={o}
                  type="button"
                  aria-pressed={form.outcome === o}
                  className={`pressable inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[14px] font-semibold transition-colors ${
                    form.outcome === o ? `border-transparent ${OUTCOME_TONE[o]}` : 'border-rule-strong bg-paper text-ink-2 hover:bg-paper-2'
                  }`}
                  style={form.outcome === o ? { boxShadow: `0 0 0 2px ${OUTCOME_ACCENT[o]}` } : undefined}
                  onClick={() => set('outcome')(o)}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: OUTCOME_ACCENT[o] }} />
                  {OUTCOME_LABEL[o]}
                </button>
              ))}
            </div>
          </div>

          <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border border-rule bg-paper-2 p-4 hover:border-rule-strong">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]"
              checked={form.isAnonymous}
              onChange={(e) => set('isAnonymous')(e.target.checked)}
            />
            <span>
              <span className="block text-[14px] font-semibold">Post anonymously</span>
              <span className="block text-[13px] text-ink-2">
                Turning this on takes your name off straight away. Turning it off waits for review.
              </span>
            </span>
          </label>
        </section>

        <section>
          <div className="flex items-center justify-between">
            <p className="eyebrow eyebrow-muted">The rounds</p>
            <button type="button" className="btn btn-ghost" onClick={() => setRounds((r) => [...r, emptyRound()])}>
              + Add round
            </button>
          </div>
          <div className="mt-4 space-y-4">
            {rounds.map((round, i) => (
              <div key={i} className="panel p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold text-white"
                      style={{ background: roundStyle(round.name).color }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-[14px] font-semibold">Round {i + 1}</span>
                  </div>
                  <button
                    type="button"
                    className="tap text-[12.5px] text-ink-3 underline hover:text-bad"
                    onClick={() => setRounds((r) => r.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                </div>
                <label className="field-label mt-4" htmlFor={`round-name-${i}`}>Round name</label>
                <input id={`round-name-${i}`} className="input" value={round.name} onChange={setRound(i, 'name')} />
                <label className="field-label mt-4" htmlFor={`round-q-${i}`}>Questions (one per line)</label>
                <textarea id={`round-q-${i}`} className="input min-h-24" value={round.questionText} onChange={setRound(i, 'questionText')} />
                <label className="field-label mt-4" htmlFor={`round-tips-${i}`}>Tips</label>
                <textarea id={`round-tips-${i}`} className="input min-h-20" value={round.tips} onChange={setRound(i, 'tips')} />
              </div>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn btn-primary pressable" disabled={saving}>
            {saving ? 'Sending…' : isLive ? 'Send update for review' : 'Save changes'}
          </button>
          <Link to="/profile" className="btn btn-ghost">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
