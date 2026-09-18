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
    <div className="border-l-2 border-brand bg-brand-soft p-4">
      <p className="text-[13.5px] leading-relaxed text-ink">
        This will be publicly visible on the internet, including to recruiters and search engines.
        You can unpublish it at any time.
      </p>
      <p className="mt-2 text-[12.5px] text-ink-2">
        Please do not name your interviewers, paste confidential assessment material, or share
        anyone else&rsquo;s compensation.
      </p>
    </div>
  );
}
