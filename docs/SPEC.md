# prepLens — Product Specification

**Version 1.0 · 18 September 2026 · Ravi Yadav, NST Rishihood**

Companion to [`ARCHITECTURE.md`](ARCHITECTURE.md) (how it is built) and [`PLAN.md`](PLAN.md) (when it is built). This document is *what* it does and *how you know it works*.

Every requirement has an ID and acceptance criteria. A requirement without acceptance criteria is a wish, and a phase is finished when its requirements pass — not when the code is written.

---

## Contents

- [Scope and phases](#scope-and-phases)
- [Glossary](#glossary)
- [Actors](#actors)
- [Phase 1 — Launch the archive](#phase-1--launch-the-archive)
- [Phase 2 — Engagement and signal](#phase-2--engagement-and-signal)
- [Phase 3 — Intelligence](#phase-3--intelligence)
- [Non-functional requirements](#non-functional-requirements)
- [Out of scope](#out-of-scope)
- [Traceability](#traceability)

---

## Scope and phases

| Phase | Name | Goal in one sentence | Ships when |
|---|---|---|---|
| **1** | Launch the archive | A junior can find and read real interview experiences, and a senior can add one in under two minutes. | A junior finds a relevant experience without asking for the link. |
| **2** | Engagement and signal | The archive tells you which experiences are worth reading and which companies people need. | Submissions continue without being individually chased. |
| **3** | Intelligence | The archive answers "how do I prepare for X" rather than only storing the raw material. | A generated prep guide is grounded in cited experiences, with no unsupported claims. |

**Phases are gated, not parallel.** Phase 2 does not start until Phase 1's exit criteria pass with real users, because every Phase 2 feature is worthless on an archive nobody reads. Phase 3 does not start below 50 experiences across 20 companies — an AI summary of four experiences is worse than the four experiences.

---

## Glossary

| Term | Meaning |
|---|---|
| **Experience** | One person's account of one company's interview process, from one placement attempt. The unit of content. |
| **Round** | One stage within an experience — online assessment, technical round 1, HR. Embedded in the experience; never stands alone. |
| **Drive** | A placement cycle. `on-campus`, `off-campus` or `referral` — a junior's preparation differs materially between them. |
| **Batch** | Graduation year, e.g. `2027`. The unit of anonymity (see `CONS-03`). |
| **Verified student** | Someone signed in with an `@nst.rishihood.edu.in` Google account. |
| **Archive** | The set of experiences with `status: 'published'`. |
| **Retraction** | An author hiding their own experience. Reversible, instant, no approval. |
| **Soft removal** | An admin hiding an experience. Reversible, audited, never a hard delete. |

---

## Actors

| Actor | Identified by | Can |
|---|---|---|
| **Visitor** | Nothing — anyone on the internet | Read everything published |
| **Student** | NST Google account | Everything a visitor can, plus write, retract and report |
| **Admin** | `users.role === 'admin'` | Everything a student can, plus moderate and promote |

Admin is a **role flag on a normal account**, never a shared login. Promotion and demotion are database operations, and every moderation action records which person performed it.

---

## Phase 1 — Launch the archive

### Authentication

| ID | Requirement | Acceptance criteria |
|---|---|---|
| **AUTH-01** | A visitor can sign in with a Google account. | Given a signed-out visitor, when they choose "Continue with Google" and complete consent, then they return to the page they started on, signed in. |
| **AUTH-02** | Only `@nst.rishihood.edu.in` accounts may sign in. | Given a personal Gmail account, when OAuth completes, then a page explains that prepLens is limited to NST accounts and offers to retry with a different account. No redirect loop, no blank page, no raw error. |
| **AUTH-03** | The domain is configuration, not a hardcoded string. | `COLLEGE_EMAIL_DOMAIN` in env; changing it changes the accepted domain with no code edit. |
| **AUTH-04** | A session survives a browser restart for 7 days. | Given a signed-in user, when they close and reopen the browser within 7 days, then they are still signed in. After 7 days they are not. |
| **AUTH-05** | Signing out ends the session server-side. | Given a captured session cookie, when the user signs out and the captured cookie is replayed, then the request is unauthenticated. |
| **AUTH-06** | A new user supplies batch and branch once. | Given a first-ever login, when the user reaches the app, then they are asked for graduation batch and branch before they can submit. They may skip and browse. |

### Browse and search

| ID | Requirement | Acceptance criteria |
|---|---|---|
| **FEED-01** | Anyone can read the archive without signing in. | Given a signed-out visitor, when they open the site, then they see published experiences. No login wall, no modal. |
| **FEED-02** | The feed lists experiences newest first. | The first item's `createdAt` is the maximum across published experiences. |
| **FEED-03** | The feed loads more without pages duplicating. | Given the reader has loaded page 1, when a new experience is published and they load more, then no experience appears twice and none is skipped. |
| **FEED-04** | The reader can filter by company. | Given a company filter, when it is applied, then only that company's published experiences appear, and the URL reflects the filter so it can be shared. |
| **FEED-05** | The reader can filter by role, outcome and year. | Filters combine (AND); an empty result set shows an explanatory empty state, not a blank page. |
| **FEED-06** | The reader can search question and tip text. | Given the query `dynamic programming`, when submitted, then experiences whose rounds mention it are returned, ranked by relevance. |
| **FEED-07** | The archive shows its own size. | A visible count of published experiences and distinct companies, accurate within 5 minutes. |
| **FEED-08** | A company with no experiences is not offered as a filter. | The filter list is derived from companies that actually have published experiences. |

### Reading an experience

| ID | Requirement | Acceptance criteria |
|---|---|---|
| **READ-01** | An experience shows company, role, drive type, year, outcome and every round in order. | All fields present render; absent optional fields are omitted rather than shown empty. |
| **READ-02** | Each experience has a stable shareable URL. | `/experience/:id` opens that experience directly for a signed-out visitor. |
| **READ-03** | A shared link shows a meaningful preview. | Given the URL pasted into WhatsApp or LinkedIn, when the preview renders, then it names the company, role and outcome — not "prepLens" alone. |
| **READ-04** | Unpublished, retracted and removed experiences are not readable. | A non-published id returns 404 for everyone except its author and admins. |

### Submitting

| ID | Requirement | Acceptance criteria |
|---|---|---|
| **SUB-01** | A student can submit a complete experience round by round. | Rounds can be added, reordered and removed; each holds a name, questions and tips. |
| **SUB-02** | A student can submit a minimal experience in under two minutes. | A quick path requires only company, role, outcome and one free-text box. Measured on a real student, not estimated. |
| **SUB-03** | Company names are normalized. | Given `Google`, `google ` and `Google India`, when each is submitted, then all three resolve to `companySlug: 'google'`. |
| **SUB-04** | An unrecognized company can still be submitted. | The company is created with `status: 'pending'`; the experience is not blocked; the pending company appears in the admin queue. |
| **SUB-05** | Author identity comes from the session. | Given a request body containing someone else's name or id, when it is submitted, then those fields are ignored and the session user is recorded. |
| **SUB-06** | Batch and branch are snapshotted at submit time. | Given the author later changes their profile, when the experience is re-read, then it still shows the batch and branch that were true at submission. |
| **SUB-07** | An author can edit their own experience. | Non-author edits return 403. `updatedAt` is shown to readers when it differs from `createdAt`. |
| **SUB-08** | Submission is rate-limited per user. | The sixth submission in 24 hours by one user is rejected with an explanation, not a generic 429. |

### Consent, anonymity and privacy

| ID | Requirement | Acceptance criteria |
|---|---|---|
| **CONS-01** | Consent to public visibility is explicit and unavoidable. | The exact sentence — *"This will be publicly visible on the internet, including to recruiters and search engines. You can unpublish it at any time."* — renders directly above the submit control, not behind a link. |
| **CONS-02** | A student can publish anonymously. | An anonymity toggle is present at submit time and changeable afterwards by the author. |
| **CONS-03** | Anonymous means batch only. | An anonymous experience displays `Anonymous · <batch>`. Branch, name and avatar are absent from the rendered page **and from the API response** — not merely hidden by CSS. |
| **CONS-04** | Retraction is instant and unconditional. | Given a published experience, when its author retracts it, then it 404s for everyone else within one request. No reason is collected, no approval sought. |
| **CONS-05** | Account deletion detaches identity and keeps content. | `submittedBy` becomes `null`, the experience is forced anonymous, and the archive keeps the content. The policy is stated before submission, not after. |

### Moderation

| ID | Requirement | Acceptance criteria |
|---|---|---|
| **MOD-01** | Any signed-in student can report an experience. | A reason must be chosen from the defined list; a free-text note is optional. |
| **MOD-02** | Reports reach an admin queue, oldest open first. | The queue shows the reported experience, reason, reporter and age. |
| **MOD-03** | An admin can soft-remove an experience. | `status` becomes `'removed'`; the document is never deleted; the experience 404s for non-admins. |
| **MOD-04** | Every moderation action is attributable. | `resolvedBy` and `resolvedAt` are recorded, and the database alone can answer who removed what, and when. |
| **MOD-05** | Removal is reversible. | An admin can reinstate a removed experience; the audit trail keeps both actions. |
| **MOD-06** | Content rules are visible at the moment of writing. | No interviewer names, no confidential material, no third-party compensation — shown inline on the submit form, not only in a policy page. |

### Importing the existing archive

| ID | Requirement | Acceptance criteria |
|---|---|---|
| **IMP-01** | Existing experiences can be imported in bulk. | An import script reads a structured file and creates experiences with `source: 'imported'`. |
| **IMP-02** | Imports are never published automatically. | Every imported experience lands with `status: 'unpublished'` and `consentedAt: null`. |
| **IMP-03** | Publication requires recorded consent. | An imported experience cannot move to `published` while `consentedAt` is null — enforced in the service layer, not by discipline. |
| **IMP-04** | The import is idempotent. | Running it twice over the same source produces no duplicates. |
| **IMP-05** | Imported companies are normalized and merged. | Variant spellings found during import become `aliases` on one company, not separate companies. |

### Operations

| ID | Requirement | Acceptance criteria |
|---|---|---|
| **OPS-01** | Missing configuration fails loudly at boot. | Given `SESSION_SECRET` is absent, when the server starts, then it exits with one readable line naming the missing variable. It does not start and fail later. (Named `SESSION_SECRET`, not `JWT_SECRET`: §8 chose opaque server sessions over a stateless JWT.) |
| **OPS-02** | Every request is traceable. | Each request carries a `requestId`, stamped on every log line for that request and returned in every error response. |
| **OPS-03** | The service reports its own health. | `GET /healthz` returns build identifier and database reachability. Build identifier shipped in Block 0; database reachability in Block 1. |
| **OPS-04** | All errors share one response shape. | Every 4xx and 5xx uses the `{ error: { code, message, fields? }, requestId }` envelope. |
| **OPS-05** | Errors are reported off-box. | Unhandled exceptions on both frontend and backend reach an error tracker with the `requestId` attached. |

### Screens — Phase 1

| Screen | Purpose | Signed in required |
|---|---|---|
| Feed | Browse, filter, search the archive | No |
| Experience detail | Read one experience in full | No |
| Sign in | Google OAuth entry, with the NST-only rule stated up front | No |
| Profile setup | Batch and branch, once | Yes |
| Submit — quick | Four fields, under two minutes | Yes |
| Submit — full | Round-by-round | Yes |
| My experiences | Own posts, edit and retract | Yes |
| Admin queue | Reports, pending companies, removals | Admin |
| Not found / error | Readable failure states, including the non-NST sign-in message | No |

### Phase 1 exit criteria

All must hold simultaneously:

1. ≥ 25 published experiences across ≥ 12 companies, each with a recorded consent date.
2. Every Phase 1 requirement above passes its acceptance criteria.
3. A junior who was not involved in building it finds a relevant experience without being given the link.
4. A shared link renders a correct preview in WhatsApp.
5. Median time to submit via the quick path, measured on a real student, is under two minutes.

---

## Phase 2 — Engagement and signal

**Precondition:** Phase 1 has been live for at least one placement cycle month, with ≥ 10 organic submissions.

### Voting

| ID | Requirement | Acceptance criteria |
|---|---|---|
| **VOTE-01** | A signed-in student can upvote an experience. | The count increases by exactly 1 and the control reflects their own vote. |
| **VOTE-02** | Voting is idempotent. | Given the same vote request sent twice concurrently, when both are processed, then the count is 1 — enforced by a unique compound index, not an application check. |
| **VOTE-03** | A vote can be withdrawn. | The count returns to its prior value; the row is deleted. |
| **VOTE-04** | Vote counts never leak voter identity. | The public payload carries a count only. No user id of any voter reaches a reader. |
| **VOTE-05** | Counts are reconcilable. | A scheduled job recomputes `upvoteCount` from the `votes` collection and reports drift. Drift is expected and owned, not assumed away. |

### Bookmarks

| ID | Requirement | Acceptance criteria |
|---|---|---|
| **BOOK-01** | A student can bookmark an experience. | It appears in their bookmarks list immediately. |
| **BOOK-02** | Bookmarks are private. | No API response exposes who bookmarked what, to anyone, including admins in the normal UI. |
| **BOOK-03** | Per-user state is fetched separately from cached content. | The cached public payload contains no per-user field; vote and bookmark state arrive from an uncached endpoint. |

### Company pages and stats

| ID | Requirement | Acceptance criteria |
|---|---|---|
| **STAT-01** | Each company has a page at a readable URL. | `/company/:slug` lists that company's published experiences. |
| **STAT-02** | The page summarizes what to expect. | Experience count, outcome distribution, most common round names and typical number of rounds. |
| **STAT-03** | Small samples are labelled as such. | Below 5 experiences, the page says the sample is too small to generalize rather than presenting percentages as fact. |

### Profiles and demand signal

| ID | Requirement | Acceptance criteria |
|---|---|---|
| **PROF-01** | A student has a profile page listing their contributions. | Anonymous posts are excluded from the public view of that profile. |
| **REQ-01** | A student can request an experience for a company. | The request is recorded against the company. |
| **REQ-02** | Demand is visible to potential authors. | A company page shows how many juniors are waiting on it, and the submit flow surfaces the most-requested companies. |
| **REQ-03** | Fulfilling a request is acknowledged. | When an experience is published for a requested company, requesters can see that it was answered. |

### Phase 2 exit criteria

1. A double-tapped vote leaves the count at exactly 1, demonstrated under concurrency.
2. Reconciliation reports zero drift over a week.
3. At least one experience is submitted in response to a request.
4. No per-user field appears in any cacheable response.

---

## Phase 3 — Intelligence

**Precondition:** ≥ 50 published experiences across ≥ 20 companies. Below that, generated guidance is thinner than reading the source material and damages trust in the archive.

**Implementation surface:** the Anthropic TypeScript SDK (`@anthropic-ai/sdk`) from the existing Express backend. Default model `claude-opus-5`; bulk regeneration through the Message Batches API at 50% cost.

### Generated prep guides

| ID | Requirement | Acceptance criteria |
|---|---|---|
| **AI-01** | Each eligible company has a generated prep guide. | Covers likely rounds, recurring topics, and preparation advice, derived only from that company's published experiences. |
| **AI-02** | Every claim is grounded in a cited experience. | Guides are generated with document citations enabled; each section links to the experiences it came from. A claim with no citation is not rendered. |
| **AI-03** | Guides are precomputed, never generated per request. | A reader loads a stored guide. No page load triggers a model call. |
| **AI-04** | Regeneration is triggered by content change, not by a clock. | A guide regenerates when its company gains ≥ 5 new experiences or after 90 days, whichever comes first. |
| **AI-05** | Guides are visibly labelled as generated. | The page states that the guide is AI-generated from the cited experiences and links to them. Readers can always reach the primary sources. |
| **AI-06** | Retracted source material invalidates the guide. | When a cited experience is retracted or removed, its citations disappear from the guide and the guide is queued for regeneration. |
| **AI-07** | A guide below the evidence threshold is not published. | Fewer than 5 published experiences for a company means no guide, not a thin one. |

### Query understanding

| ID | Requirement | Acceptance criteria |
|---|---|---|
| **AI-08** | Natural-language queries are translated into filters plus keywords. | *"Which companies asked DP questions on campus last year"* resolves to structured filters (`driveType`, `interviewYear`) plus search terms, using structured outputs so the result is schema-valid. |
| **AI-09** | Search degrades to the existing text index. | When the model call fails, times out, or is disabled, the query runs as a plain text search. Search never returns an error page because of an AI failure. |
| **AI-10** | Interpretation is visible and correctable. | The reader sees how their query was interpreted and can clear any applied filter. |

### AI operations

| ID | Requirement | Acceptance criteria |
|---|---|---|
| **AI-11** | Model spend is bounded and observed. | Every call's token usage is logged; a monthly ceiling is configured; crossing it disables generation rather than silently spending. |
| **AI-12** | The system prompt and archive context are cached. | Repeated generation runs show non-zero `cache_read_input_tokens`. |
| **AI-13** | Generation failures are invisible to readers. | A failed regeneration leaves the previous guide in place and alerts the operator. A reader never sees a half-generated guide. |
| **AI-14** | Prompts and outputs are versioned. | Each stored guide records the model id and prompt version that produced it, so a regression can be traced to a change. |
| **AI-15** | Output is evaluated before rollout. | A held-out set of companies is generated and manually checked for unsupported claims before guides go live. An unsupported claim is a release blocker. |

### Cost model — Phase 3

Working estimate for a full regeneration of every company guide, at `claude-opus-5` rates ($5 per million input tokens, $25 per million output):

| Item | Estimate |
|---|---|
| Input per company | ~15 experiences × ~800 tokens + system prompt ≈ 13K tokens |
| Output per company | ~2K tokens |
| Cost per company | ≈ $0.115 |
| 20 companies, full regeneration | ≈ $2.30 |
| Same run through the Batch API | ≈ $1.15 |

Regenerating every company monthly is therefore a low-single-digit dollar line item. **The cost risk in Phase 3 is not the model — it is generating on demand instead of precomputing**, which `AI-03` exists to prevent.

### Phase 3 exit criteria

1. Generated guides exist for every company above the evidence threshold, each with working citations.
2. Manual review of a held-out set finds no claim unsupported by a cited experience.
3. Disabling the model integration entirely leaves browse, search and submit fully working.
4. A month of generation costs less than the hosting bill.

---

## Non-functional requirements

### Performance

| ID | Requirement | Measure |
|---|---|---|
| **NFR-P1** | The feed renders quickly for a first-time visitor. | First contentful paint under 2.5 s on a mid-range Android over 4G. |
| **NFR-P2** | Cached reads do not touch the database. | A CDN cache hit performs zero database queries. |
| **NFR-P3** | Every list query uses an index. | `.explain()` shows `IXSCAN`; `totalDocsExamined` is within 2× of `nReturned`. |
| **NFR-P4** | API p95 latency stays under 800 ms at Phase 1 scale. | Measured on cache misses, excluding cold starts. |

### Availability and resilience

| ID | Requirement | Measure |
|---|---|---|
| **NFR-A1** | A backend outage does not take the archive offline immediately. | With the API stopped, cached pages keep serving for the stale-while-revalidate window. |
| **NFR-A2** | Cold starts are not user-visible as breakage. | A loading state appears within 300 ms and survives a 60 s backend start. |
| **NFR-A3** | A failed dependency degrades one feature, not the site. | Error tracking, AI generation or email being down never blocks reading or submitting. |

### Security

| ID | Requirement | Measure |
|---|---|---|
| **NFR-S1** | Session tokens are unreadable by JavaScript. | Cookies are `httpOnly` and `Secure`; no token appears in any URL, ever. |
| **NFR-S2** | CORS is restricted to the known frontend origin. | Wildcard origins are rejected in production configuration. |
| **NFR-S3** | All input is validated at the boundary. | Unknown fields are stripped; no request body field is trusted for identity or authorization. |
| **NFR-S4** | Authorization is checked server-side per request. | Hiding a control in the UI is never the only thing preventing an action. |
| **NFR-S5** | Secrets exist only in environment variables. | No credential is committed; `.env` is git-ignored and `.env.example` carries names only. |
| **NFR-S6** | Rate limits are keyed so that shared campus IPs are not collectively punished. | Authenticated limits key on user id; a single user exhausting a limit does not affect others. |

### Privacy

| ID | Requirement | Measure |
|---|---|---|
| **NFR-V1** | Anonymity is enforced in the API, not the UI. | No anonymous experience's API response contains author name, avatar, branch or id. |
| **NFR-V2** | No third party is given user data by default. | No analytics or tracking script that identifies individuals ships in Phase 1. |
| **NFR-V3** | Content is never hard-deleted by moderation. | Every removal is a reversible status change with an audit row. |

### Accessibility and reach

| ID | Requirement | Measure |
|---|---|---|
| **NFR-X1** | The site is usable on a phone. | Every screen works at 360 px wide with no horizontal scrolling. |
| **NFR-X2** | Interactive controls are keyboard reachable with visible focus. | Tab order is sensible; focus is never invisible. |
| **NFR-X3** | Text meets contrast requirements. | WCAG AA (4.5:1) for body text. |
| **NFR-X4** | Core content does not require JavaScript to be discoverable. | Crawlers and link unfurlers receive real metadata for every experience URL. |

### Observability and cost

| ID | Requirement | Measure |
|---|---|---|
| **NFR-O1** | Logs are structured and correlated. | One request is traceable end to end by its `requestId`. |
| **NFR-O2** | Uptime is monitored externally. | An external check hits `/healthz` and alerts on failure. |
| **NFR-O3** | Running cost stays under a stated monthly ceiling. | Hosting plus model spend is reviewed monthly against the budget. |

---

## Out of scope

Permanently, unless the premise of the product changes:

- Job postings, application tracking, or anything that implies prepLens knows who is hiring.
- Threaded discussion, replies or direct messaging.
- Résumé review, referral brokering, or mock interview scheduling.
- Company ratings, employee reviews, or salary comparison tables.
- Accounts for anyone outside NST.

Deferred with triggers, in [`ARCHITECTURE.md` §12](ARCHITECTURE.md#12--deferred-with-triggers): server-side rendering, Redis, Atlas Search, notifications.

---

## Traceability

Requirement areas mapped to the build blocks that implement them.

| Area | Requirements | Phase | Build blocks |
|---|---|---|---|
| Operations | OPS-01 … OPS-05 | 1 | Block 0, Block 8 |
| Data layer | Supports all | 1 | Block 1 |
| Authentication | AUTH-01 … AUTH-06 | 1 | Block 2 |
| Browse and search | FEED-01 … FEED-08 | 1 | Block 3, Block 6 |
| Reading | READ-01 … READ-04 | 1 | Block 3, Block 6 |
| Submitting | SUB-01 … SUB-08 | 1 | Block 4, Block 7 |
| Consent and privacy | CONS-01 … CONS-05 | 1 | Block 4, Block 7 |
| Moderation | MOD-01 … MOD-06 | 1 | Block 4, Block 7 |
| Import | IMP-01 … IMP-05 | 1 | Block 5 |
| Voting | VOTE-01 … VOTE-05 | 2 | Block 9 |
| Bookmarks | BOOK-01 … BOOK-03 | 2 | Block 9 |
| Company stats | STAT-01 … STAT-03 | 2 | Block 9 |
| Profiles and demand | PROF-01, REQ-01 … REQ-03 | 2 | Block 9 |
| Prep guides | AI-01 … AI-07 | 3 | Block 10 |
| Query understanding | AI-08 … AI-10 | 3 | Block 11 |
| AI operations | AI-11 … AI-15 | 3 | Block 10, Block 11 |

---

*prepLens · product specification, v1.0 · 18 September 2026 · Ravi Yadav, NST Rishihood.*
