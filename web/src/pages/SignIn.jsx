import { Link, useSearchParams } from 'react-router-dom';
import { ADMIN_SIGN_IN_URL, SIGN_IN_URL } from '../api/client';

/**
 * Sign-in is a PAGE YOU CHOOSE TO VISIT, not a wall.
 *
 * The prototype made this the landing page, which meant every shared WhatsApp
 * link dropped a junior on a login screen. Here the archive is open and this
 * page only exists for people who want to contribute.
 */
export function SignIn() {
  const [params] = useSearchParams();
  const error = params.get('error');
  const domain = params.get('domain') ?? 'nst.rishihood.edu.in';

  return (
    <div className="mx-auto grid max-w-6xl items-stretch gap-12 px-5 py-16 md:grid-cols-2 md:py-20">
      <div className="flex flex-col justify-center">
        <p className="eyebrow">Join the archive</p>
        <h1 className="display mt-4 text-[clamp(2rem,5vw,3.2rem)]">
          Sign in with your college email.
        </h1>
        <p className="mt-5 max-w-md text-[15.5px] text-ink-2">
          prepLens is open to students with an{' '}
          <span className="rounded-md bg-brand-soft px-1.5 py-0.5 text-[14px] font-semibold text-brand">@{domain}</span> address.
          One click via Google, no passwords.
        </p>

        {/**
         * The rejected-domain case gets a real explanation and a way out —
         * spec AUTH-02. The prototype's equivalent was a redirect loop.
         */}
        {error === 'domain' && (
          <div className="mt-6 rounded-xl border border-bad/20 bg-bad-soft p-4">
            <p className="text-[14px] font-medium">That account is not on the college domain.</p>
            <p className="mt-1 text-[13.5px] text-ink-2">
              You signed in with a Google account that is not <span className="font-semibold">@{domain}</span>.
              Pick your college account and try again — you may need to sign out of Google first, or
              use a different browser profile.
            </p>
          </div>
        )}

        {error === 'not-admin' && (
          <div className="mt-6 rounded-xl border border-bad/20 bg-bad-soft p-4">
            <p className="text-[14px] font-medium">That account is not an admin.</p>
            <p className="mt-1 text-[13.5px] text-ink-2">
              Admin sign-in is only for moderators. If you are a student, use{' '}
              <span className="font-semibold">Login as student</span> below.
            </p>
          </div>
        )}

        {error === 'failed' && (
          <div className="mt-6 rounded-xl border border-bad/20 bg-bad-soft p-4">
            <p className="text-[14px]">Google sign-in did not complete. Please try once more.</p>
          </div>
        )}

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {/* Full page navigations: OAuth is a chain of redirects XHR can't follow. */}
          <a href={SIGN_IN_URL} className="panel card-hover group flex flex-col gap-1 p-5">
            <span className="flex items-center gap-2 text-[15px] font-semibold text-ink">
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
          </svg>
              Login as student
            </span>
            <span className="text-[13px] text-ink-3">Share your experiences, upvote and bookmark.</span>
          </a>
          <a href={ADMIN_SIGN_IN_URL} className="panel card-hover group flex flex-col gap-1 p-5">
            <span className="flex items-center gap-2 text-[15px] font-semibold text-ink">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-brand)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" /></svg>
              Login as admin
            </span>
            <span className="text-[13px] text-ink-3">Review submissions before they go live.</span>
          </a>
        </div>

        <p className="mt-5 max-w-md text-[13px] leading-relaxed text-ink-3">
          Only verified college accounts can post. Reading the archive needs no account at all —
          {' '}<Link to="/archive" className="font-medium text-brand underline">browse it here</Link>.
        </p>
      </div>

      <div className="night on-night hidden min-h-[440px] overflow-hidden rounded-3xl p-10 md:flex md:flex-col md:justify-between">
        <div className="space-y-2.5">
          {[['Selected', 'var(--color-good)', 'w-[78%]'], ['In process', 'var(--color-saffron)', 'w-[56%]'], ['Not selected', 'var(--color-bad)', 'w-[66%]']].map(([label, col, w]) => (
            <div key={label} className={`${w} flex items-center gap-3 rounded-xl bg-white/[0.07] px-4 py-3 ring-1 ring-white/10`}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: col }} />
              <span className="h-2 flex-1 rounded-full bg-white/15" />
              <span className="text-[12.5px] font-medium text-[#d9ddf2]">{label}</span>
            </div>
          ))}
        </div>
        <div>
          <p className="display text-[30px] text-white">
            Your interview is the guide a junior is searching for tonight.
          </p>
        </div>
      </div>
    </div>
  );
}
