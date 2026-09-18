import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { SIGN_IN_URL } from '../api/client';

export function Navbar() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="border-b border-rule sticky top-0 z-30 bg-paper/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 py-3">
        <Link to="/" className="flex items-baseline gap-2">
          <span className="font-display text-[19px] tracking-tight">prepLens</span>
          <span className="font-mono text-[11px] font-medium tracking-[0.18em] text-ink-3">// NST</span>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <Link to="/submit" className="btn btn-primary pressable">Share experience</Link>
              {isAdmin && (
                <Link to="/admin" className="btn btn-ghost hidden sm:inline-flex">Moderate</Link>
              )}
              <Link
                to="/profile"
                className="hidden items-center gap-2 border border-rule px-2 py-1.5 sm:flex hover:bg-paper-2"
                title="Your profile"
              >
                <span className="flex h-6 w-6 items-center justify-center bg-brand text-[11px] font-semibold text-white">
                  {user.name?.[0]?.toUpperCase() ?? '?'}
                </span>
                <span className="text-[13px] font-medium">{user.name}</span>
              </Link>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={async () => { await logout(); navigate('/'); }}
              >
                Log out
              </button>
            </>
          ) : (
            /**
             * A full page navigation, not fetch(): the OAuth flow is a series
             * of cross-site redirects that an XHR cannot follow.
             */
            <a href={SIGN_IN_URL} className="btn btn-dark">Sign in</a>
          )}
        </div>
      </div>
    </header>
  );
}
