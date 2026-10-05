import { Link, Navigate, useLocation } from 'react-router-dom';
import { ADMIN_SIGN_IN_URL, SIGN_IN_URL } from '../api/client';
import { RoundStrip } from '../components/RoundStrip';
import { useAuth } from '../hooks/useAuth';
import { ROUND_TYPES } from '../lib/rounds';

/**
 * The front door.
 *
 * It explains the archive and offers sign-in, but it is never a wall: "Browse
 * the archive" is always one click away, and a shared /experience link skips
 * this page entirely. A signed-in visitor has no use for the pitch, so a
 * student goes straight to /archive and an admin to the review dashboard.
 */

// An illustration of a card, not a real experience — no company is named.
const SAMPLE_ROUNDS = [
  { name: 'Online assessment' },
  { name: 'Technical — DSA' },
  { name: 'Technical — projects' },
  { name: 'System design' },
  { name: 'HR & culture fit' },
];

const PILLARS = [
  {
    title: 'Every round, in order',
    body: 'From the online assessment to the final HR call, see the whole pipeline before you step into it — how many rounds, what kind, and how long it took.',
    color: ROUND_TYPES.assessment.color,
  },
  {
    title: 'The questions they actually asked',
    body: 'Not "some DSA and HR". The exact problem, the follow-up that caught someone off guard, and what they would do differently.',
    color: ROUND_TYPES.technical.color,
  },
  {
    title: 'Honest outcomes',
    body: 'Selected, not selected, still waiting. The rejections are here too — and they are often the most useful read in the archive.',
    color: 'var(--color-good)',
  },
];

const STEPS = [
  ['Search the company', 'Got a shortlist mail? Look the company up before you do anything else.'],
  ['Read what seniors faced', 'Rounds, questions, tips and outcomes — written by people who sat in that same chair.'],
  ['Pay it forward', 'After your interview, share yours. Anonymously, if you prefer.'],
];

export function Landing() {
  const { user, isAdmin } = useAuth();
  const { search } = useLocation();

  // Feed filters used to live at "/?company=…" — keep those shared links working.
  const params = new URLSearchParams(search);
  if (['company', 'outcome', 'q'].some((k) => params.has(k))) {
    return <Navigate to={`/archive${search}`} replace />;
  }
  if (user) return <Navigate to={isAdmin ? '/admin' : '/archive'} replace />;

  return (
    <div className="-mb-20">
      {/* Hero */}
      <section className="night on-night overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-20 md:grid-cols-[1.15fr_1fr] md:py-28">
          <div className="enter">
            <p className="eyebrow">The NST placement archive</p>
            <h1 className="display mt-5 text-[clamp(2.4rem,6vw,4.1rem)] text-white">
              Walk into your interview like you've been there before.
            </h1>
            <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-mist">
              Real placement experiences from NST seniors — every round, every question, every
              outcome — so no junior ever has to prepare blind.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              {/* Full page navigations: OAuth is a chain of redirects XHR can't follow. */}
              <a href={SIGN_IN_URL} className="btn btn-primary pressable px-6 py-3.5 text-[15px]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 10 12 5 2 10l10 5 10-5Z" /><path d="M6 12v5c3 2 9 2 12 0v-5" /></svg>
                Login as student
              </a>
              <a href={ADMIN_SIGN_IN_URL} className="btn pressable border-white/20 bg-white/10 px-6 py-3.5 text-[15px] text-white hover:bg-white/15">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" /></svg>
                Login as admin
              </a>
            </div>
            <p className="mt-5 text-[13px] text-mist">
              Just want to read?{' '}
              <Link to="/archive" className="font-semibold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white">
                Browse the archive
              </Link>{' '}
              — no account needed. Sharing needs an @nst.rishihood.edu.in account.
            </p>
          </div>

          {/* The product, in one card. */}
          <div className="enter relative hidden md:block" style={{ animationDelay: '120ms' }} aria-hidden="true">
            <div className="absolute -inset-6 rounded-[28px] bg-white/[0.04] ring-1 ring-white/10" />
            <div className="panel relative border-l-4 p-6 text-ink" style={{ borderLeftColor: 'var(--color-good)' }}>
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-[16px] font-bold text-white">PC</span>
                <div className="min-w-0 flex-1">
                  <p className="display text-[22px]">A product company</p>
                  <p className="text-[14px] text-ink-2">Software Engineer Intern</p>
                </div>
                <span className="tag tag-dot" style={{ background: 'var(--color-good-soft)', color: 'var(--color-good)' }}>Selected</span>
              </div>
              <div className="mt-5">
                <RoundStrip rounds={SAMPLE_ROUNDS} />
              </div>
              <div className="mt-5 rounded-xl bg-paper-2 p-4">
                <p className="text-[12px] font-semibold text-ink-3">Round 2 · Technical — DSA</p>
                <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">
                  "Asked me to find the longest substring without repeats, then to do it in one pass.
                  Talk through your approach out loud — they cared more about that than the code."
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why */}
      <section className="mx-auto max-w-6xl px-5 py-20 md:py-24">
        <p className="eyebrow">Why prepLens</p>
        <h2 className="display mt-4 max-w-2xl text-[clamp(1.8rem,4vw,2.6rem)]">
          The senior who's been through it, available at 2 a.m. the night before.
        </h2>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {PILLARS.map((p) => (
            <div key={p.title} className="panel p-7">
              <span className="block h-1.5 w-10 rounded-full" style={{ background: p.color }} />
              <h3 className="mt-5 text-[17px] font-semibold text-ink">{p.title}</h3>
              <p className="mt-2.5 text-[14.5px] leading-relaxed text-ink-2">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How */}
      <section className="border-y border-rule bg-paper">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-24">
          <p className="eyebrow">How it works</p>
          <h2 className="display mt-4 text-[clamp(1.8rem,4vw,2.6rem)]">Three steps. No guesswork.</h2>
          <ol className="mt-12 grid gap-10 md:grid-cols-3">
            {STEPS.map(([title, body], i) => (
              <li key={title}>
                <span className="display text-[44px] text-brand">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="mt-2 text-[17px] font-semibold text-ink">{title}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Closing call */}
      <section className="mx-auto max-w-6xl px-5 py-20 md:py-24">
        <div className="night on-night overflow-hidden rounded-3xl px-8 py-14 text-center md:px-16 md:py-20">
          <p className="eyebrow">Already interviewed?</p>
          <h2 className="display mx-auto mt-4 max-w-3xl text-[clamp(1.9rem,4.5vw,3rem)] text-white">
            Your interview is the guide a junior is searching for tonight.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-[16px] text-mist">
            Ten minutes of writing can save someone weeks of guessing. Share what you were asked —
            with your name, or without it.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <a href={SIGN_IN_URL} className="btn btn-light pressable px-6 py-3.5 text-[15px]">
              Login as student to share yours
            </a>
            <Link to="/archive" className="btn pressable border-white/20 bg-white/10 px-6 py-3.5 text-[15px] text-white hover:bg-white/15">
              Start reading
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
