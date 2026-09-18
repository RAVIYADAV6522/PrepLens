import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { get, post } from '../api/client';

export const AuthContext = createContext(null);

/**
 * Who is signed in.
 *
 * A signed-out visitor is a NORMAL state here, not an error: reads are public,
 * so most visitors have no session and the app must render fully for them.
 * /auth/me answers 204 in that case, which is why nothing below treats a
 * missing user as a failure.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const body = await get('/auth/me');
      // 204 gives an empty body — signed out.
      setUser(body?.data?.user ?? null);
      setNeedsProfile(Boolean(body?.data?.needsProfile));
    } catch {
      // A failed /auth/me must not break the public archive.
      setUser(null);
      setNeedsProfile(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await post('/auth/logout');
    } finally {
      setUser(null);
      setNeedsProfile(false);
    }
  }, []);

  const value = useMemo(
    () => ({ user, needsProfile, setNeedsProfile, loading, refresh, logout, isAdmin: user?.role === 'admin' }),
    [user, needsProfile, loading, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
