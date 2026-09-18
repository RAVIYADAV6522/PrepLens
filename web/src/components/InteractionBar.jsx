import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/** A small upward chevron — an upvote, not a heart. This is usefulness, not affection. */
function ArrowIcon({ filled }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"
         fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function BookmarkIcon({ filled }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"
         fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function InteractionBar({ experience, interactions }) {
  const navigate = useNavigate();
  const up = interactions.hasUpvoted(experience.id);
  const saved = interactions.hasBookmarked(experience.id);
  const count = interactions.countFor(experience.id, experience.upvoteCount ?? 0);

  // Pop the number only when it CHANGES, never on first render — otherwise
  // every card animates its count on page load for no reason.
  const [popping, setPopping] = useState(false);
  const previous = useRef(count);
  useEffect(() => {
    if (previous.current !== count) {
      previous.current = count;
      setPopping(true);
      const t = setTimeout(() => setPopping(false), 330);
      return () => clearTimeout(t);
    }
  }, [count]);

  function act(kind) {
    // Signed out is a normal state here, so this is a nudge, not an error.
    if (!interactions.signedIn) return navigate('/signin');
    interactions.toggle(experience.id, kind, experience.upvoteCount ?? 0);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => act('upvote')}
        disabled={interactions.isBusy(experience.id, 'upvote')}
        aria-pressed={up}
        aria-label={up ? 'Remove your upvote' : 'This was useful'}
        title={interactions.signedIn ? (up ? 'Remove your upvote' : 'This was useful') : 'Sign in to upvote'}
        className={`chip pressable ${up ? 'chip-on' : ''}`}
      >
        <ArrowIcon filled={up} />
        <span className={`tabular-nums ${popping ? 'count-pop' : ''}`}>{count}</span>
      </button>

      <button
        type="button"
        onClick={() => act('bookmark')}
        disabled={interactions.isBusy(experience.id, 'bookmark')}
        aria-pressed={saved}
        aria-label={saved ? 'Remove from saved' : 'Save for later'}
        title={interactions.signedIn ? (saved ? 'Remove from saved' : 'Save for later') : 'Sign in to save'}
        className={`chip pressable ${saved ? 'chip-on-good' : ''}`}
      >
        <BookmarkIcon filled={saved} />
        <span>{saved ? 'Saved' : 'Save'}</span>
      </button>
    </div>
  );
}
