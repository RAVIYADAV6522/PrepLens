/**
 * Round types — the second colour code.
 *
 * Rounds are free text ("OA on HackerRank", "Tech 2 — DSA", "HR chat"), so the
 * type is read from the name. It is a reading aid, not data: a round that
 * matches nothing is simply "Other", and nothing is stored.
 *
 * Order matters — "system design interview" must land on design, not on the
 * generic "interview" that technical rounds also match.
 */
export const ROUND_TYPES = {
  assessment: { label: 'Assessment', color: 'var(--color-r-assess)', soft: 'var(--color-r-assess-soft)' },
  technical: { label: 'Technical', color: 'var(--color-r-tech)', soft: 'var(--color-r-tech-soft)' },
  design: { label: 'Design', color: 'var(--color-r-design)', soft: 'var(--color-r-design-soft)' },
  hr: { label: 'HR & fit', color: 'var(--color-r-hr)', soft: 'var(--color-r-hr-soft)' },
  other: { label: 'Other', color: 'var(--color-r-other)', soft: 'var(--color-r-other-soft)' },
};

const RULES = [
  ['design', /\b(system design|design|lld|hld|architecture)\b/i],
  ['hr', /\b(hr|human resources?|manager(ial)?|culture|behaviou?ral|fit|founder|ceo|cto|director)\b/i],
  ['assessment', /\b(oa|online|assessment|test|aptitude|mcq|hackerrank|hackerearth|codesignal|screening|quiz|assignment)\b/i],
  ['technical', /\b(tech(nical)?|dsa|coding|code|problem|pair|machine coding|interview|live|whiteboard)\b/i],
];

export function roundType(name = '') {
  for (const [type, re] of RULES) if (re.test(name)) return type;
  return 'other';
}

export function roundStyle(name) {
  return ROUND_TYPES[roundType(name)];
}
