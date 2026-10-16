import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { get, post, toFormError } from '../api/client';
import { OUTCOMES, OUTCOME_ACCENT, OUTCOME_LABEL } from '../lib/format';
import { roundStyle } from '../lib/rounds';

const emptyRound = () => ({ name: '', questionText: '', tips: '' });

/**
 * Result update for a live "in process" experience: the final outcome, plus
 * any rounds that happened since. The rounds already published are kept as
 * they are (questions, topics and all) and the new ones are appended.
 *
 * The live post stays on the site, unchanged, until an admin approves this.
 */
export function UpdateResult() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [experience, setExperience] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [outcome, setOutcome] = useState('');
  const [rounds, setRounds] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    get(`/experiences/${id}`)
      .then((b) => setExperience(b.data))
      .catch(() => setLoadError('Could not load this experience.'));
  }, [id]);

  function newRounds() {
    return rounds
      .filter((r) => r.name.trim())
      .map((r) => ({
        name: r.name.trim(),
        questions: r.questionText.split('\n').map((t) => t.trim()).filter(Boolean).map((text) => ({ text })),
        tips: r.tips.trim() || undefined,
      }));
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const existing = experience.rounds.map((r) => ({
        name: r.name,
        questions: r.questions.map((q) => ({ text: q.text, ...(q.topic && { topic: q.topic }) })),
        ...(r.tips && { tips: r.tips }),
      }));
      await post(`/experiences/${id}/result-update`, { outcome, rounds: [...existing, ...newRounds()] });
      navigate('/profile', { replace: true });
    } catch (err) {
      setError(toFormError(err).message);
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return <p className="mx-auto max-w-3xl px-5 py-12 text-[14px] text-bad">{loadError}</p>;
  }
  if (!experience) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-12">
        <div className="skeleton h-9 w-64" />
        <div className="skeleton mt-4 h-40 w-full" />
      </div>
    );
  }

  const changed = outcome && (outcome !== 'in-process' || newRounds().length > 0);

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <p className="eyebrow">Update your result</p>
      <h1 className="display mt-2 text-[32px]">{experience.company.name}</h1>
      <p className="mt-1 text-[14px] text-ink-2">{experience.role}, {experience.interviewYear}</p>
      <p className="mt-4 rounded-lg bg-brand-soft px-4 py-3 text-[13.5px] text-ink-2">
        Your current post stays on the site exactly as it is while an admin reviews this update.
        Once approved, the new result and rounds replace it.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-8">
        <section>
          <p className="field-label">What happened?</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {OUTCOMES.map((o) => (
              <button
                key={o}
                type="button"
                aria-pressed={outcome === o}
                onClick={() => setOutcome(o)}
                className={`pressable flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-[14px] font-medium ${
                  outcome === o ? 'border-brand bg-brand-soft text-ink' : 'border-rule bg-paper text-ink-2 hover:border-rule-strong'
                }`}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: OUTCOME_ACCENT[o] }} />
                {o === 'in-process' ? 'Cleared a round, still in process' : OUTCOME_LABEL[o]}
              </button>
            ))}
          </div>
        </section>

        <section>
          <p className="field-label">Rounds already on your post</p>
          <ol className="space-y-2">
            {experience.rounds.map((r, i) => (
              <li key={i} className="panel flex items-center gap-3 p-3 text-[14px]">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
                  style={{ background: roundStyle(r.name).color }}
                >
                  {i + 1}
                </span>
                <span className="font-medium text-ink">{r.name}</span>
                <span className="text-ink-3">· {r.questions.length} question{r.questions.length === 1 ? '' : 's'}</span>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <div className="flex items-center justify-between">
            <p className="field-label">New rounds since then</p>
            <button type="button" className="btn btn-ghost" onClick={() => setRounds((r) => [...r, emptyRound()])}>
              + Add round
            </button>
          </div>
          {rounds.length === 0 && (
            <p className="text-[13.5px] text-ink-3">No new rounds? Just pick the result above and submit.</p>
          )}
          <div className="space-y-4">
            {rounds.map((round, i) => {
              const n = experience.rounds.length + i + 1;
              const set = (field) => (e) => setRounds((r) => r.map((x, j) => (j === i ? { ...x, [field]: e.target.value } : x)));
              return (
                <div key={i} className="panel p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-semibold">Round {n}</span>
                    <button
                      type="button"
                      className="text-[12.5px] text-ink-3 underline hover:text-bad"
                      onClick={() => setRounds((r) => r.filter((_, j) => j !== i))}
                    >
                      Remove
                    </button>
                  </div>
                  <label className="field-label mt-3" htmlFor={`new-round-name-${i}`}>Round name</label>
                  <input id={`new-round-name-${i}`} className="input" placeholder="e.g. Technical Interview" value={round.name} onChange={set('name')} />
                  <label className="field-label mt-3" htmlFor={`new-round-q-${i}`}>Questions (one per line)</label>
                  <textarea id={`new-round-q-${i}`} className="input min-h-24" value={round.questionText} onChange={set('questionText')} />
                  <label className="field-label mt-3" htmlFor={`new-round-tips-${i}`}>Tips</label>
                  <textarea id={`new-round-tips-${i}`} className="input min-h-20" value={round.tips} onChange={set('tips')} />
                </div>
              );
            })}
          </div>
        </section>

        {error && <p className="rounded-lg bg-bad-soft px-4 py-3 text-[13.5px] text-bad">{error}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn btn-primary pressable" disabled={saving || !changed}>
            {saving ? 'Sending…' : 'Send update for review'}
          </button>
          <Link to="/profile" className="btn btn-ghost">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
