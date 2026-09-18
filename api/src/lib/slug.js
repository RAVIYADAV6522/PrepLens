/**
 * Company name normalization.
 *
 * THE PROBLEM, OBSERVED
 * The prototype accepted company names as free text. Two experiences in, the
 * archive already held "Zuvees" and "algocept" — inconsistent casing — and
 * nothing stopped "Google", "google " and "Googel" from becoming three
 * separate companies. At fifty experiences the company filter is unusable, and
 * there is no clean grouping key for anything downstream.
 *
 * A slug is the join key: one canonical, URL-safe form per company.
 */

/**
 * "Google India Pvt. Ltd." -> "google-india-pvt-ltd"
 * "  Zuvees  "             -> "zuvees"
 * "Ernst & Young"          -> "ernst-young"
 */
export function slugify(name) {
  return String(name)
    .normalize('NFKD')                 // é -> e + combining accent
    .replace(/[̀-ͯ]/g, '')   // drop the combining accents
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')       // anything else becomes a separator
    .replace(/^-+|-+$/g, '')           // no leading or trailing separators
    .slice(0, 80);
}

/** Collapses whitespace for display, without changing the words. */
export function cleanName(name) {
  return String(name).replace(/\s+/g, ' ').trim();
}
