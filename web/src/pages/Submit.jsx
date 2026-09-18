import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post, toFormError } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { ConsentNotice } from '../components/ConsentNotice';
import { SubmitSuccess } from '../components/SubmitSuccess';
import { OUTCOMES, OUTCOME_LABEL, DRIVE_TYPES, DRIVE_LABEL } from '../lib/format';

const emptyRound = () => ({ name: '', questionText: '', tips: '' });

/**
 * Two ways in, on one page.
 *
 * QUICK (the default) asks four things and takes under two minutes — spec
 * SUB-02. The prototype opened straight onto a wall of round-by-round inputs,
 * and submission friction is the main reason a community archive stays empty.
 * FULL is one click away for anyone willing to write it all out.
 */
export function Submit() {
  const { user, needsProfile } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState('quick');
  const [company, setCompany] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [role, setRole] = useState('');
  const [driveType, setDriveType] = useState('on-campus');
  const [interviewYear, setInterviewYear] = useState(new Date().getFullYear());
  const [outcome, setOutcome] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [quickText, setQuickText] = useState('');
  const [rounds, setRounds] = useState([emptyRound()]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [published, setPublished] = useState(null);

  useEffect(() => { if (needsProfile) navigate('/welcome'); }, [needsProfile, navigate]);

  // Company autocomplete, debounced. Prefix-anchored server-side, which is
  // what keeps it on an index.
  const debounce = useRef();
  useEffect(() => {
    clearTimeout(debounce.current);
    if (company.trim().length < 2) { setSuggestions([]); return; }

    debounce.current = setTimeout(() => {
      get(`/companies/autocomplete?q=${encodeURIComponent(company.trim())}`)
        .then((b) => setSuggestions(b.data))
        .catch(() => setSuggestions([]));
    }, 220);

    return () => clearTimeout(debounce.current);
  }, [company]);

  function buildRounds() {
    if (mode === 'quick') {
      if (!quickText.trim()) return [];
      return [
        {
          name: 'What happened',
          // One question per line is how people actually write notes; the
          // split happens here so the API keeps its structured shape.
          questions: quickText.split('\n').map((t) => t.trim()).filter(Boolean).map((text) => ({ text })),
          tips: undefined,
        },
      ];
    }

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
      const body = await post('/experiences', {
        company: company.trim(),
        role: role.trim(),
        driveType,
        interviewYear: Number(interviewYear),
        outcome,
        isAnonymous,
        rounds: buildRounds(),
      });

      // Hold on the confirmation before navigating. Someone has just written
      // up an interview for people they may never meet; the acknowledgement is
      // worth a beat.
      setPublished({ id: body.data.id, company: body.data.company.name });
    } catch (err) {
      setError(toFormError(err));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  }

  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() + 1 - i);
  const fieldError = (name) => error?.fields?.[name];

  if (published) {
    return (
      <SubmitSuccess
        company={published.company}
        onDone={() => navigate(`/experience/${published.id}`)}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <p className="eyebrow" style={{ animation: 'rise 320ms ease both' }}>// Add to the archive</p>
      <h1 className="display mt-4 text-[clamp(1.9rem,4.5vw,2.8rem)]" style={{ animation: 'rise 320ms ease 60ms both' }}>
        Share your interview experience.
      </h1>
      <p className="mt-4 text-[15px] text-ink-2">
        Your story helps juniors prepare. Be specific — the questions, the rounds, what you would do
        differently.
      </p>

      {error && (
        <div className="mt-6 border-l-2 border-bad bg-bad-soft p-4">
          <p className="text-[14px] font-medium">{error.message}</p>
          {error.requestId && (
            <p className="mt-1 font-mono text-[11px] text-ink-3">reference: {error.requestId}</p>
          )}
        </div>
      )}

      <div className="mt-8 flex gap-2">
        <button
          type="button"
          className={`btn ${mode === 'quick' ? 'btn-dark' : 'btn-ghost'}`}
          onClick={() => setMode('quick')}
        >
          Quick — under 2 minutes
        </button>
        <button
          type="button"
          className={`btn ${mode === 'full' ? 'btn-dark' : 'btn-ghost'}`}
          onClick={() => setMode('full')}
        >
          Round by round
        </button>
      </div>

      <form onSubmit={submit} className="mt-6 space-y-8">
        <section className="panel p-6">
          <p className="eyebrow eyebrow-muted">// The basics</p>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div className="relative">
              <label className="field-label" htmlFor="company">Company</label>
              <input
                id="company"
                className="input"
                placeholder="e.g. Zuvees"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                autoComplete="off"
                required
              />
              {suggestions.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full border border-rule-strong bg-white shadow-sm">
                  {suggestions.map((s) => (
                    <li key={s.slug}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-[13.5px] hover:bg-brand-soft"
                        onClick={() => { setCompany(s.name); setSuggestions([]); }}
                      >
                        <span>{s.name}</span>
                        <span className="font-mono text-[11px] text-ink-3">{s.experienceCount}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {fieldError('company') && <p className="mt-1 text-[12.5px] text-bad">{fieldError('company')}</p>}
              <p className="mt-1.5 font-mono text-[11px] text-ink-3">
                Pick a suggestion where possible — it keeps one company from splitting in two.
              </p>
            </div>

            <div>
              <label className="field-label" htmlFor="role">Role</label>
              <input
                id="role"
                className="input"
                placeholder="e.g. Backend Intern"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                required
              />
              {fieldError('role') && <p className="mt-1 text-[12.5px] text-bad">{fieldError('role')}</p>}
            </div>

            <div>
              <label className="field-label" htmlFor="year">Year</label>
              <select id="year" className="input" value={interviewYear} onChange={(e) => setInterviewYear(e.target.value)}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            <div>
              <label className="field-label" htmlFor="drive">How did you get the interview?</label>
              <select id="drive" className="input" value={driveType} onChange={(e) => setDriveType(e.target.value)}>
                {DRIVE_TYPES.map((d) => <option key={d} value={d}>{DRIVE_LABEL[d]}</option>)}
              </select>
            </div>
          </div>

          {/**
           * Four outcomes, not a yes/no toggle. "In process" and "withdrew"
           * are real, and a boolean cannot say them.
           */}
          <div className="mt-6">
            <span className="field-label">How did it end?</span>
            <div className="flex flex-wrap gap-2">
              {OUTCOMES.map((o) => (
                <button
                  key={o}
                  type="button"
                  className={`btn ${outcome === o ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setOutcome(o)}
                >
                  {OUTCOME_LABEL[o]}
                </button>
              ))}
            </div>
            {fieldError('outcome') && <p className="mt-1 text-[12.5px] text-bad">{fieldError('outcome')}</p>}
          </div>

          {/**
           * The anonymity toggle the prototype had no equivalent for. Rejection
           * stories are the most useful content in the archive and the least
           * likely to be posted under a real name.
           */}
          <label className="mt-6 flex cursor-pointer items-start gap-3 border border-rule bg-paper-2 p-4">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
            />
            <span>
              <span className="block text-[14px] font-semibold">Post anonymously</span>
              <span className="block text-[13px] text-ink-2">
                Shown as <span className="font-mono">Anonymous · {user?.graduationBatch ?? '20XX'}</span> —
                no name, no branch, nothing else. Your batch is all that appears.
              </span>
            </span>
          </label>
        </section>

        {mode === 'quick' ? (
          <section className="panel p-6">
            <p className="eyebrow eyebrow-muted">// In your own words</p>
            <label className="field-label mt-4" htmlFor="quick">
              What happened? One question or note per line.
            </label>
            <textarea
              id="quick"
              className="input min-h-36"
              placeholder={'Binary search on the answer\nQuestions about my resume and projects\nThey cared more about trade-offs than code'}
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
            />
            <p className="mt-2 font-mono text-[11px] text-ink-3">
              You can add the round-by-round detail later by editing this post.
            </p>
          </section>
        ) : (
          <section>
            <div className="flex items-center justify-between">
              <div>
                <p className="eyebrow eyebrow-muted">// The rounds</p>
                <h2 className="display mt-1 text-[22px]">Walk us through it</h2>
              </div>
              <button type="button" className="btn btn-ghost" onClick={() => setRounds((r) => [...r, emptyRound()])}>
                + Add round
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {rounds.map((round, i) => (
                <div key={i} className="panel p-6">
                  <div className="flex items-center justify-between">
                    <p className="eyebrow">// Round {String(i + 1).padStart(2, '0')}</p>
                    {rounds.length > 1 && (
                      <button
                        type="button"
                        className="font-mono text-[11px] text-ink-3 underline hover:text-bad"
                        onClick={() => setRounds((r) => r.filter((_, j) => j !== i))}
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <label className="field-label mt-4" htmlFor={`round-name-${i}`}>Round name</label>
                  <input
                    id={`round-name-${i}`}
                    className="input"
                    placeholder="e.g. Online Assessment / DSA Interview"
                    value={round.name}
                    onChange={(e) => setRounds((r) => r.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  />

                  <label className="field-label mt-4" htmlFor={`round-q-${i}`}>Questions (one per line)</label>
                  <textarea
                    id={`round-q-${i}`}
                    className="input min-h-24"
                    placeholder={'Implement an LRU cache\nSystem design: URL shortener'}
                    value={round.questionText}
                    onChange={(e) => setRounds((r) => r.map((x, j) => (j === i ? { ...x, questionText: e.target.value } : x)))}
                  />

                  <label className="field-label mt-4" htmlFor={`round-tips-${i}`}>Tips</label>
                  <textarea
                    id={`round-tips-${i}`}
                    className="input min-h-20"
                    placeholder="What worked, what didn't, what to prepare…"
                    value={round.tips}
                    onChange={(e) => setRounds((r) => r.map((x, j) => (j === i ? { ...x, tips: e.target.value } : x)))}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        <ConsentNotice />

        <button type="submit" className="btn btn-primary pressable w-full sm:w-auto" disabled={saving || !outcome}>
          {saving ? 'Publishing…' : 'Publish to archive →'}
        </button>
      </form>
    </div>
  );
}
