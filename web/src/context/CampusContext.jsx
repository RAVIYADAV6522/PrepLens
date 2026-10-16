import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CAMPUSES } from '../lib/campus';

/**
 * The campus the reader is browsing, chosen in the navbar and shared by the
 * archive, its filters and its stats. Remembered in localStorage so it
 * survives a reload; it defaults to RU, the campus PrepLens was built for.
 * Reading another campus needs no account, so this never touches the API.
 */
const STORAGE_KEY = 'preplens.campus';
const VALID = [...CAMPUSES, 'all'];

function initialCampus() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return VALID.includes(saved) ? saved : 'ru';
  } catch {
    return 'ru';
  }
}

const CampusContext = createContext({ campus: 'ru', setCampus: () => {} });

export function CampusProvider({ children }) {
  const [campus, setCampusState] = useState(initialCampus);

  const setCampus = useCallback((next) => {
    if (!VALID.includes(next)) return;
    setCampusState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode: the choice just won't survive a reload.
    }
  }, []);

  const value = useMemo(() => ({ campus, setCampus }), [campus, setCampus]);
  return <CampusContext.Provider value={value}>{children}</CampusContext.Provider>;
}

export function useCampus() {
  return useContext(CampusContext);
}
