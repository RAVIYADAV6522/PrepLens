import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { SIGN_IN_URL } from '../api/client';

/**
 * The lens mark: a ring split into the four outcome colours — the app's whole
 * colour code, folded into its logo.
 */
export function LensMark({ size = 28 }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  const seg = c / 4;
  const colors = ['var(--color-good)', 'var(--color-saffron)', 'var(--color-bad)', 'var(--color-brand)'];
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="14" cy="14" r="13" fill="var(--color-night)" />
      {colors.map((col, i) => (
        <circle
          key={i}
          cx="14" cy="14" r={r} fill="none" stroke={col} strokeWidth="3.2"
          strokeDasharray={`${seg - 1.6} ${c - seg + 1.6}`}
          strokeDashoffset={-i * seg}
          transform="rotate(-90 14 14)"
        />
      ))}
      <circle cx="14" cy="14" r="3.2" fill="#fff" />
    </svg>
  );
}

export function Navbar() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  const navLink = ({ isActive }) =>
    `hidden rounded-lg px-3 py-2 text-[14px] font-medium sm:inline-flex ${
      isActive ? 'bg-paper-3 text-ink' : 'text-ink-2 hover:bg-paper-2 hover:text-ink'
    }`;

  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-5 py-3">
        <Link to="/" className="mr-3 flex items-center gap-2.5">
          <LensMark />
          <span className="text-[18px] font-bold tracking-tight text-ink">
            prep<span className="text-brand">Lens</span>
          </span>
          <span className="hidden rounded-md bg-paper-3 px-1.5 py-0.5 text-[11.5px] font-semibold text-ink-2 sm:inline">
            NST
          </span>
        </Link>

        <NavLink to="/archive" className={navLink}>Archive</NavLink>
        {user && <NavLink to="/profile" className={navLink}>My experiences</NavLink>}
        {isAdmin && <NavLink to="/admin" className={navLink}>Moderate</NavLink>}

        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <Link to="/submit" className="btn btn-primary pressable">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                <span className="hidden sm:inline">Share experience</span>
                <span className="sm:hidden">Share</span>
              </Link>
              <Link
                to="/profile"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-night text-[13px] font-semibold text-white ring-2 ring-white hover:ring-brand-soft"
                title={`${user.name} — your profile`}
              >
                {user.name?.[0]?.toUpperCase() ?? '?'}
              </Link>
              <button
                type="button"
                className="rounded-lg px-2.5 py-2 text-[14px] font-medium text-ink-3 hover:bg-paper-2 hover:text-ink"
                onClick={async () => { await logout(); navigate('/'); }}
              >
                Log out
              </button>
            </>
          ) : (
            /* A full page navigation: OAuth is a chain of redirects XHR can't follow. */
            <a href={SIGN_IN_URL} className="btn btn-dark">Sign in</a>
          )}
        </div>
      </div>
    </header>
  );
}
