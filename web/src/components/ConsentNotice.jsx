/**
 * The consent line — spec CONS-01, these exact words.
 *
 * It sits directly above the submit button, never behind a link and never in a
 * terms page. People consent to "NST seeing it" and are genuinely shocked when
 * Google does; this sentence is the whole difference. The prototype had no
 * equivalent, so students published to the open internet without being told.
 */
export function ConsentNotice() {
  return (
    <div className="flex gap-3 rounded-xl border border-brand/15 bg-brand-soft p-4">
      <svg className="mt-0.5 shrink-0 text-brand" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
      </svg>
      <div>
      <p className="text-[13.5px] leading-relaxed text-ink">
        This will be publicly visible on the internet, including to recruiters and search engines.
        You can unpublish it at any time.
      </p>
      <p className="mt-2 text-[12.5px] text-ink-2">
        Please do not name your interviewers, paste confidential assessment material, or share
        anyone else&rsquo;s compensation.
      </p>
      </div>
    </div>
  );
}
