/**
 * The privacy policy. Google requires one before sign-in can be opened beyond
 * the college workspace, and it should say plainly what the code actually does.
 */
const CONTACT = 'ravi.y23csai@nst.rishihood.edu.in';

const SECTIONS = [
  {
    title: 'What we collect when you sign in',
    body: [
      'prepLens uses Google sign-in. From Google we receive your name, email address and profile photo, and nothing else — no contacts, no Drive, no Gmail.',
      'After your first sign-in we ask for your graduation batch and branch once. They appear on the experiences you share.',
    ],
  },
  {
    title: 'What you create',
    body: [
      'The interview experiences you submit, the upvotes and bookmarks you make, and any reports you file about a post.',
      'Upvotes are counted, but nobody else can see who upvoted what. Bookmarks are visible only to you.',
    ],
  },
  {
    title: 'Anonymous posts',
    body: [
      'If you post anonymously, the post is shown as "Anonymous" with your batch only. Your name, photo and branch are not sent to readers at all — not hidden in the page, simply not included.',
    ],
  },
  {
    title: 'Sign-in sessions',
    body: [
      'To keep you signed in, we store a session record with your browser type and IP address. It is deleted when you log out, or after seven days.',
      'We use one cookie for your session and one short-lived cookie during sign-in. There are no advertising or tracking cookies, and no analytics.',
    ],
  },
  {
    title: 'Who can see what',
    body: [
      'Anyone can read approved experiences. Your email address is never shown publicly.',
      'Admins review every post before it is published, and can see posts that are waiting for review or have been removed.',
      'We do not sell or share your information with anyone.',
    ],
  },
  {
    title: 'Your choices',
    body: [
      'You can unpublish or permanently delete any experience you shared, from your profile, at any time.',
      `To have your account deleted, email ${CONTACT}. Your posts can either be deleted or kept as anonymous.`,
    ],
  },
];

export function Privacy() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-14 md:py-20">
      <p className="eyebrow">Privacy policy</p>
      <h1 className="display mt-4 text-[clamp(2rem,5vw,3rem)]">What prepLens knows about you.</h1>
      <p className="mt-4 text-[15.5px] text-ink-2">
        prepLens is a student-run archive of placement interview experiences at NST, Rishihood
        University. This page explains what it stores and why. Last updated 5 October 2026.
      </p>

      <div className="mt-10 space-y-5">
        {SECTIONS.map((s) => (
          <section key={s.title} className="panel p-6">
            <h2 className="text-[17px] font-semibold text-ink">{s.title}</h2>
            <div className="mt-2.5 space-y-2.5">
              {s.body.map((p) => <p key={p} className="text-[14.5px] leading-relaxed text-ink-2">{p}</p>)}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-10 text-[14px] text-ink-3">
        Questions? Email <a href={`mailto:${CONTACT}`} className="font-medium text-brand underline">{CONTACT}</a>.
      </p>
    </div>
  );
}
