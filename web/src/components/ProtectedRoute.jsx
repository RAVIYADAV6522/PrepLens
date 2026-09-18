import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

/**
 * Guards WRITING only — never reading.
 *
 * Wrapping the feed in this would rebuild the login wall we deliberately
 * removed: a junior opening a shared WhatsApp link would land on a sign-in
 * screen and leave.
 */
export function ProtectedRoute({ children, adminOnly = false }) {
  const { user, isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-20">
        <p className="font-mono text-[12px] text-ink-3">Checking your session…</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;

  return children;
}
