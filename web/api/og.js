/**
 * Link previews for /experience/:id — spec READ-03.
 *
 * THE PROBLEM
 * A Vite SPA serves an empty <div id="root">. WhatsApp's unfurler and Google's
 * crawler do not run JavaScript, so a shared experience link previews as the
 * bare site title with no company, no role, nothing. Since discovery on
 * prepLens happens by people pasting links into batch groups, that is the
 * difference between a link someone taps and a link they scroll past.
 *
 * THE FIX
 * This function serves the same index.html, with real Open Graph tags injected
 * for that specific experience. Crawlers get meaningful metadata; a human gets
 * the identical page and React boots as normal. One file, no framework change.
 *
 * (If organic search ever becomes a top-3 traffic source, this is the point at
 * which the Next.js migration in ARCHITECTURE §12 earns its cost.)
 */

const API_URL = process.env.VITE_API_URL ?? process.env.API_URL ?? 'http://localhost:4000';

const OUTCOME_LABEL = {
  selected: 'Selected',
  rejected: 'Not selected',
  'in-process': 'In process',
  withdrew: 'Withdrew',
};

/** Anything interpolated into HTML gets escaped. A company name is untrusted input. */
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export default async function handler(req, res) {
  const id = new URL(req.url, `https://${req.headers.host}`).searchParams.get('id');
  const origin = `https://${req.headers.host}`;

  // The built shell, fetched from this same deployment so the hashed asset
  // names always match the current build.
  let html;
  try {
    html = await (await fetch(`${origin}/index.html`)).text();
  } catch {
    res.statusCode = 500;
    return res.end('Could not load the page shell.');
  }

  let meta = {
    title: 'prepLens — every interview, every round, every question',
    description: 'A community-curated archive of campus placement interview experiences at NST.',
  };

  try {
    const response = await fetch(`${API_URL}/api/v1/experiences/${id}`, {
      headers: { accept: 'application/json' },
    });

    if (response.ok) {
      const { data } = await response.json();

      const author = data.author?.anonymous
        ? `Anonymous · ${data.author.graduationBatch}`
        : (data.author?.name ?? 'an NST student');

      meta = {
        title: `${data.company.name} — ${data.role} · prepLens`,
        description:
          `${OUTCOME_LABEL[data.outcome] ?? data.outcome} · ${data.interviewYear} · ` +
          `${data.rounds.length} ${data.rounds.length === 1 ? 'round' : 'rounds'}. ` +
          `Shared by ${author}.`,
      };
    }
  } catch {
    // A slow or failed API must still serve the page. The preview falls back
    // to the generic copy rather than the request failing.
  }

  const tags = `
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="prepLens" />
    <meta property="og:title" content="${escapeHtml(meta.title)}" />
    <meta property="og:description" content="${escapeHtml(meta.description)}" />
    <meta property="og:url" content="${escapeHtml(`${origin}/experience/${id}`)}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${escapeHtml(meta.title)}" />
    <meta name="twitter:description" content="${escapeHtml(meta.description)}" />
  `;

  const withMeta = html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(meta.title)}</title>`)
    .replace('</head>', `${tags}</head>`);

  res.setHeader('content-type', 'text/html; charset=utf-8');
  // Cached at the edge like every other public read, with the same
  // stale-while-revalidate safety net.
  res.setHeader('cache-control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');

  return res.end(withMeta);
}
