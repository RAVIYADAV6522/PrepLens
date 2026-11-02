import { useCallback, useEffect, useRef, useState } from 'react';
import { get, post, del } from '../api/client';
import { useAuth } from './useAuth';

/**
 * My upvotes and bookmarks for the experiences currently on screen.
 *
 * WHY THIS IS A SEPARATE REQUEST
 * The feed is public and cached by the CDN, which means it must be identical
 * for every reader — so it cannot contain "have *you* upvoted this". That
 * state comes from here instead, on an uncached call, and the UI fills it in
 * once it arrives. One request for the whole page, not one per row.
 *
 * Toggles are OPTIMISTIC: the button flips immediately and reverts if the
 * server disagrees. A vote is trivial and reversible, so making someone wait
 * 300ms to see their own tap register is the wrong trade.
 */
export function useInteractions(ids) {
  const { user } = useAuth();
  // The id, not the object: re-reading the session makes a new object, and that
  // must not cancel a request in flight for the same person.
  const userId = user?.id;
  const [upvoted, setUpvoted] = useState(new Set());
  const [bookmarked, setBookmarked] = useState(new Set());
  const [counts, setCounts] = useState({});
  const [busy, setBusy] = useState(new Set());
  const fetchedFor = useRef('');

  const key = ids.join(',');

  useEffect(() => {
    if (!userId || !key) return;
    // Only refetch when the set of ids actually changes, not on every render.
    if (fetchedFor.current === key) return;
    fetchedFor.current = key;

    // The API takes 50 ids a request, and "load more" can pass that.
    const batches = [];
    for (let i = 0; i < ids.length; i += 50) batches.push(ids.slice(i, i + 50).join(','));

    let cancelled = false;
    Promise.all(batches.map((batch) => get(`/me/interactions?ids=${batch}`)))
      .then((pages) => {
        if (cancelled) return;
        setUpvoted(new Set(pages.flatMap((p) => p.data.upvoted)));
        setBookmarked(new Set(pages.flatMap((p) => p.data.bookmarked)));
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [userId, key]);

  const toggle = useCallback(
    async (id, kind, currentCount) => {
      if (!user || busy.has(id + kind)) return;

      const set = kind === 'upvote' ? upvoted : bookmarked;
      const apply = kind === 'upvote' ? setUpvoted : setBookmarked;
      const on = set.has(id);

      // Optimistic flip.
      apply((prev) => {
        const next = new Set(prev);
        if (on) next.delete(id); else next.add(id);
        return next;
      });

      if (kind === 'upvote') {
        setCounts((prev) => ({ ...prev, [id]: Math.max(0, (prev[id] ?? currentCount ?? 0) + (on ? -1 : 1)) }));
      }

      setBusy((prev) => new Set(prev).add(id + kind));

      try {
        const path = `/experiences/${id}/${kind}`;
        const body = on ? await del(path) : await post(path);

        // Trust the server's count over the optimistic guess.
        if (kind === 'upvote' && typeof body?.data?.upvoteCount === 'number') {
          setCounts((prev) => ({ ...prev, [id]: body.data.upvoteCount }));
        }
      } catch {
        // Put it back exactly as it was.
        apply((prev) => {
          const next = new Set(prev);
          if (on) next.add(id); else next.delete(id);
          return next;
        });
        if (kind === 'upvote') {
          setCounts((prev) => ({ ...prev, [id]: currentCount ?? 0 }));
        }
      } finally {
        setBusy((prev) => {
          const next = new Set(prev);
          next.delete(id + kind);
          return next;
        });
      }
    },
    [user, upvoted, bookmarked, busy],
  );

  return {
    hasUpvoted: (id) => upvoted.has(id),
    hasBookmarked: (id) => bookmarked.has(id),
    countFor: (id, fallback) => counts[id] ?? fallback,
    isBusy: (id, kind) => busy.has(id + kind),
    toggle,
    signedIn: Boolean(user),
  };
}
