/**
 * The session cookie, in one place.
 *
 * Every attribute here is a security decision, so they are worth stating:
 *
 *   httpOnly  JavaScript cannot read it. An XSS bug can then deface the page
 *             but cannot steal the session, which is the difference between an
 *             incident and a catastrophe.
 *   secure    Never sent over plain HTTP in production.
 *   sameSite  chosen from the deployment — see isSameSiteDeployment() below.
 *             'lax' when the frontend and API share a registrable domain,
 *             'none' when they do not. 'lax' blocks the simple CSRF case, so
 *             a same-site deployment is genuinely safer.
 *   path      '/' so it reaches every route, including the OAuth callback.
 *
 * Note what is NOT here: the token never appears in a URL. The common tutorial
 * pattern redirects to `/?token=…`, which writes the credential into browser
 * history, the Referer header of the next outbound click, and the host's
 * access logs.
 */
import { env, isProduction } from '../config/env.js';

/**
 * Hosts that are PUBLIC SUFFIXES: their subdomains belong to different
 * parties, so `a.vercel.app` and `b.vercel.app` are different SITES, not
 * siblings. Without this list a naive "compare the last two labels" check
 * would call them same-site and pick a cookie policy that silently fails.
 */
const PUBLIC_SUFFIXES = new Set([
  'vercel.app', 'onrender.com', 'netlify.app', 'github.io', 'pages.dev', 'railway.app', 'fly.dev',
]);

function registrableDomain(hostname) {
  const labels = hostname.split('.');
  if (labels.length < 2) return hostname;

  const lastTwo = labels.slice(-2).join('.');
  // On a public suffix, the registrable unit is one label deeper — and for our
  // purposes that means each deployment is its own site.
  if (PUBLIC_SUFFIXES.has(lastTwo)) return labels.slice(-3).join('.');

  return lastTwo;
}

/**
 * Are the frontend and the API the same site?
 *
 * THIS DECIDES WHETHER SIGN-IN WORKS AT ALL IN PRODUCTION.
 *
 *   preplens.app + api.preplens.app        -> same site  -> SameSite=Lax
 *   preplens.vercel.app + x.onrender.com   -> cross site -> SameSite=None
 *
 * With Lax on a cross-site pair the browser simply does not send the session
 * cookie, every authenticated request 401s, and nothing in the network tab
 * looks wrong — the cookie is just absent. It is the classic "works locally,
 * broken in production" auth failure.
 *
 * SameSite=None is weaker (it is what CSRF protection relies on) and requires
 * Secure, so it is only ever chosen when the deployment genuinely needs it.
 * Buying one domain and using two subdomains is the better answer.
 */
export function isSameSite(frontendUrl, apiUrl) {
  try {
    return (
      registrableDomain(new URL(frontendUrl).hostname) ===
      registrableDomain(new URL(apiUrl).hostname)
    );
  } catch {
    // A malformed URL should not silently pick the weaker policy.
    return true;
  }
}

export function isSameSiteDeployment() {
  return isSameSite(env.FRONTEND_URL, env.API_URL);
}

const sameSiteMode = isSameSiteDeployment() ? 'lax' : 'none';

export const SESSION_COOKIE = 'preplens_session';

/** Seven days, matching spec AUTH-04. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    // SameSite=None is only legal on a Secure cookie, so a cross-site
    // deployment is HTTPS-only. Both Vercel and Render are HTTPS by default.
    secure: isProduction || sameSiteMode === 'none',
    sameSite: sameSiteMode,
    path: '/',
    maxAge: SESSION_TTL_MS,
  });
}

export function clearSessionCookie(res) {
  // The attributes must match those used to set it, or the browser keeps the
  // original cookie and "logout" appears to do nothing in the UI.
  // The attributes must match those used to set it, or the browser keeps the
  // original cookie and "logout" appears to do nothing.
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: isProduction || sameSiteMode === 'none',
    sameSite: sameSiteMode,
    path: '/',
  });
}
