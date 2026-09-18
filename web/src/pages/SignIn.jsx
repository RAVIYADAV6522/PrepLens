import { Link, useSearchParams } from 'react-router-dom';
import { SIGN_IN_URL } from '../api/client';

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
    <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 md:grid-cols-2 md:py-24">
      <div>
        <p className="eyebrow">// Join the archive</p>
        <h1 className="display mt-4 text-[clamp(2rem,5vw,3.2rem)]">
          Sign in with your college email.
        </h1>
        <p className="mt-5 max-w-md text-[15.5px] text-ink-2">
          prepLens is open to students with an{' '}
          <span className="font-mono text-[14px] text-brand">@{domain}</span> address.
          One click via Google, no passwords.
        </p>

        {/**
         * The rejected-domain case gets a real explanation and a way out —
         * spec AUTH-02. The prototype's equivalent was a redirect loop.
         */}
        {error === 'domain' && (
          <div className="mt-6 border-l-2 border-bad bg-bad-soft p-4">
            <p className="text-[14px] font-medium">That account is not on the college domain.</p>
            <p className="mt-1 text-[13.5px] text-ink-2">
              You signed in with a Google account that is not <span className="font-mono">@{domain}</span>.
              Pick your college account and try again — you may need to sign out of Google first, or
              use a different browser profile.
            </p>
          </div>
        )}

        {error === 'failed' && (
          <div className="mt-6 border-l-2 border-bad bg-bad-soft p-4">
            <p className="text-[14px]">Google sign-in did not complete. Please try once more.</p>
          </div>
        )}

        <a href={SIGN_IN_URL} className="btn btn-dark mt-8 w-full sm:w-auto">
          <span className="font-semibold">Continue with Google</span>
        </a>

        <p className="mt-5 max-w-md font-mono text-[11.5px] leading-relaxed text-ink-3">
          Only verified college accounts can post. Reading the archive needs no account at all —
          <Link to="/" className="underline"> browse it here</Link>.
        </p>
      </div>

      <div className="hidden bg-ink p-10 md:flex md:flex-col md:justify-end">
        <p className="font-mono text-[11px] tracking-[0.18em] text-white/60">// 2026 cohort</p>
        <p className="display mt-4 text-[30px] text-white">
          &ldquo;Every interview question, archived. Every shortcut, shared.&rdquo;
        </p>
      </div>
    </div>
  );
}
