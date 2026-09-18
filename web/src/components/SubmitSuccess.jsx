import { useEffect, useState } from 'react';

/**
 * The moment after someone submits.
 *
 * This is the only place in the app where an animation is the point rather
 * than a side effect. Someone has just spent minutes writing up an interview
 * for strangers, and the difference between "the URL changed" and a deliberate
 * beat of acknowledgement is the difference between feeling like you filed a
 * form and feeling like you gave something to your juniors.
 *
 * The checkmark DRAWS rather than appearing: the stroke is hidden by a dash
 * offset equal to its length, and animating that offset to zero reveals it
 * like a pen stroke. Two lines of CSS, no library.
 *
 * It holds for about 1.4 seconds — long enough to register, short enough that
 * nobody waits on it twice.
 */
export function SubmitSuccess({ company, onDone }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const out = setTimeout(() => setLeaving(true), 1400);
    const done = setTimeout(onDone, 1750);
    return () => { clearTimeout(out); clearTimeout(done); };
  }, [onDone]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center bg-paper/95 backdrop-blur-sm"
      style={{ animation: leaving ? 'liftOut 320ms ease forwards' : 'fade 200ms ease both' }}
    >
      <div className="px-6 text-center">
        <div className="relative mx-auto h-24 w-24" style={{ animation: 'ring 420ms cubic-bezier(0.34,1.56,0.64,1) both' }}>
          <svg viewBox="0 0 52 52" className="h-24 w-24" aria-hidden="true">
            <circle
              cx="26" cy="26" r="24" fill="none"
              stroke="var(--color-brand)" strokeWidth="2"
              strokeDasharray="151" strokeDashoffset="151"
              style={{ animation: 'draw 520ms cubic-bezier(0.65,0,0.45,1) 120ms forwards' }}
            />
            <path
              d="M15 27l8 8 15-16" fill="none"
              stroke="var(--color-brand)" strokeWidth="3"
              strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray="36" strokeDashoffset="36"
              style={{ animation: 'draw 360ms cubic-bezier(0.65,0,0.45,1) 520ms forwards' }}
            />
          </svg>
        </div>

        <p className="eyebrow mt-6" style={{ animation: 'rise 300ms ease 640ms both' }}>
          // Added to the archive
        </p>
        <h2 className="display mt-2 text-[30px]" style={{ animation: 'rise 300ms ease 720ms both' }}>
          Published.
        </h2>
        <p className="mt-2 text-[14.5px] text-ink-2" style={{ animation: 'rise 300ms ease 800ms both' }}>
          {company
            ? `Your ${company} experience is live. A junior preparing for it can read it now.`
            : 'Your experience is live.'}
        </p>
      </div>
    </div>
  );
}
