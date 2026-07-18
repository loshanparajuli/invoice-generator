# fromSilicon Tools — Development Context

> Living document. Tracks current state, decisions, and roadmap so any session
> (human or AI) can pick up where we left off. Update as milestones land.

Last updated: 2026-07-18

---

## 1. What this is

An internal "super app" for running the content agency — one Next.js project hosting
multiple small tools. Tool #1 is the **Invoice Maker** (Internal/External invoice
generator). Tool #2 is the **Timesheet & Client Sign-off** tool for videographers.
More tools are expected to be added over time as separate routes under the same shell.

**Stack:**
- **Next.js (App Router), plain JavaScript** (no TypeScript, no Tailwind) — deployed on
  Vercel (project `invoice.maker` née "Invoice Maker", linked in `.vercel/`).
- Design system is fully bespoke, hand-written CSS in `app/globals.css`: `--ink`
  (near-black), `--paper` (cream), EB Garamond serif + IBM Plex Mono, loaded via
  `next/font/google` in `app/layout.js`. Dark `.panel` sidebar + cream `.page` paper
  preview is the Invoice Maker's look; lighter single-column `.ts-page`/`.review-*`
  layouts (same palette, `.light-form` field overrides) are the Timesheet's look.
- PDFs are rendered **client-side** via `html2pdf.js` (npm dependency now, not a CDN
  script tag), always **dynamically imported** inside `lib/pdf.js` — it references
  `self`/`window` at module scope and will throw during Next's server render pass if
  imported statically at the top of a client component.
- Two Vercel serverless functions (Next Route Handlers): `app/api/send-invoice/route.js`
  and `app/api/send-timesheet/route.js`, both via **Resend**. Both lazily construct the
  `Resend` client only inside the request handler (constructing it at module scope
  throws immediately if `RESEND_API_KEY` is unset, which broke `next build` locally —
  fixed by deferring construction and returning a clean 500 if the key is absent).
- No database, no auth/login anywhere in the app (deliberate — see decisions below).

**Project layout:**
```
app/
  layout.js, globals.css        – root shell, fonts, full design system
  page.js                        – home: tool picker (Invoice Maker / Timesheet / more soon)
  invoice/page.js, InvoiceApp.jsx – Invoice Maker (client component)
  timesheet/page.js, TimesheetApp.jsx – Timesheet & Client Sign-off (client component)
  api/send-invoice/route.js      – emails invoice PDF (password-gated)
  api/send-timesheet/route.js    – emails signed timesheet PDF (no password)
lib/
  team.js    – TEAM roster ({name, pan, sub?}), used by Invoice Maker's From-dropdown only
               (Timesheet's filmmaker field is now plain text, defaulting to "Subash Thokar")
  format.js  – fmtMoney, fmtDate, uid, randomGenNumber, nextWednesdayISO, addDaysISO,
               and Pacific-timezone helpers (pacificWallTimeToInstant, formatPacificDateTime,
               formatDurationMs) — DST-aware via a two-pass Intl.DateTimeFormat offset calc
  pdf.js     – renderPdfBase64() / downloadPdf(), the only place html2pdf.js is imported
public/logo.png
jsconfig.json  – `@/*` path alias to repo root
```

Old static-site files (`index.html`, `app.js`, `style.css`, `assets/`, root `api/`) have
been **deleted** — fully superseded by the Next.js app above. Git history has them if
ever needed.

---

## 2. Decisions on record

- **No auth** on the tool suite (same as the original static site) — anyone with the
  URL can use any tool. Revisit if it becomes a concern.
- **Timesheet uses a same-device handoff model, not async links** — the filmmaker fills
  the shift, hands the phone to the client in the same sitting, client reviews + signs
  right there. No database; nothing is persisted server-side except the final emailed
  PDF. A failed send can be retried from the same screen (state stays in memory).
- **All Timesheet times are Pacific (`America/Los_Angeles`)**, regardless of where either
  party physically is — explicit "Times are in Pacific — PDT/PST, San Francisco" label
  on the form. Overnight shifts/breaks (end time earlier than start time) are handled by
  rolling to the next calendar day.
- **Invoice Maker's 90/10 internal split, team roster dropdown, "Payment Note" label,
  and Send-Email-with-password-and-confirmation flow** all carried forward unchanged
  from the static-site version — this was a re-platform, not a redesign.
- Signature capture uses **`react-signature-canvas`** (wraps the mature `signature_pad`
  lib) rather than a hand-rolled canvas — mobile touch smoothing is exactly the hard
  part of "make this easy on a phone," and this is a small, well-tested, purpose-built
  library. Pinned to the stable `^1.0.7` (not the `1.1.0-alpha.x` line). `clearOnResize`
  is set to `false` — the library defaults to wiping the canvas on any window resize
  event, which risks losing a client's signature to a mobile keyboard opening/closing.
- The captured signature is rasterized **live from the on-screen `<canvas>`** at send
  time (html2canvas can snapshot a live canvas's current bitmap directly) — no need to
  swap it for a static `<img>` first. The "Clear" button is hidden via a `capturing`
  state flag during the snapshot so it doesn't appear in the emailed PDF.
- The Timesheet's on-screen Client Review card **is** the thing captured to PDF (same
  pattern as Invoice Maker reusing `#invoice-page` for both preview and export) — a
  `recordRef` wraps everything except the action buttons/error text, so those don't
  appear in the emailed document. The "Signed [Pacific timestamp]" line is set via
  `flushSync` immediately before capture so it's guaranteed to be in the DOM when
  `html2canvas` reads it.

## 3. Email delivery — RESOLVED via domain verification

A real `RESEND_API_KEY` is configured locally in `.env.local` (gitignored, never
committed — Losh pasted it in chat; **not** written into any tracked file).

Resend's sandbox mode (no verified sending domain) only allows delivery to the
account's own registered email — this initially blocked `losh@fromsilicon.com`. Losh
verified **`updates.fromsilicon.com`** in Resend (via Cloudflare DNS), which lifts that
restriction entirely once the `from` address uses that domain. `.env.local` now has:
```
SEND_TO=losh@fromsilicon.com
SEND_FROM=fromSilicon <notifications@updates.fromsilicon.com>
```
Confirmed working with real end-to-end sends from both routes to `losh@fromsilicon.com`
(not just the account owner's own address). **The same `SEND_FROM`/`SEND_TO` need to be
set in Vercel's env vars** for production — see §5.

## 4. Invoice Send Email password: day-name, not a secret

`app/api/send-invoice/route.js` no longer uses `INVOICE_SEND_PASSWORD` at all — there is
**no env var for this anymore**. The password is computed server-side as **today's
weekday name in Nepal time** (`Intl.DateTimeFormat` with `timeZone: "Asia/Kathmandu"`,
e.g. "Wednesday"), case-insensitive, rolling over automatically every day at NPT
midnight. The client never sees or can derive the expected value — it only submits a
guess and gets a yes/no.

**Rate limiting**: 5 wrong attempts per IP per 24h, tracked entirely in server memory
(a `Map` in the route module) — the client has zero visibility into or control over
this counter, so it cannot be reset or bypassed via devtools/inspect-element the way a
client-side counter or cookie could be. **Honest limitation**: this is per warm
serverless instance, not a shared/distributed store — there's no database or Vercel
KV/Upstash wired up yet, so a determined attacker forcing cold starts across regions
could exceed 5 tries in theory. For a low-traffic internal tool this is a reasonable
tradeoff; if it ever needs to be airtight, add a persistent store and key the limiter
there instead.

**Security-honesty note**: a day name is a 7-value guess space — the "password" itself
has almost no entropy. The real protection is (a) it's never exposed to the client and
(b) the 5-try/day limit. This is intentionally simple per what was asked (something the
whole team can just know, no secret to distribute) — if actual secrecy matters more than
convenience, swap this for a real random secret in an env var instead.

## 5. Open items

- [ ] **Resend domain verification or account-email change** (see §3) — blocks real
  delivery to losh@fromsilicon.com today.
- [ ] **Real roster data** — `lib/team.js`'s `TEAM` array still has placeholder names/PANs
  (including a placeholder email/PAN for Loshan). Replace with the real team + PAN + email.
  (Timesheet no longer uses this roster — see changelog. Invoice Maker's "Your Name" field
  now autocompletes against it live as you type, case-insensitively.)
- [ ] **Env vars not yet set in Vercel**: `RESEND_API_KEY`,
  `SEND_TO=losh@fromsilicon.com`,
  `SEND_FROM=fromSilicon <notifications@updates.fromsilicon.com>`.
  (`INVOICE_SEND_PASSWORD` is gone — see §4.)
- [ ] Real mobile-touch signature capture hasn't been tested on an actual phone against
  the deployed Vercel URL — verified so far via `npm run build`, a Playwright-driven
  headless-Chromium pass (screenshots, zero console errors, real end-to-end sends to
  `losh@fromsilicon.com` reaching the "Signed and sent" screen), and direct `curl`
  checks of both API routes' error handling, including the 5-attempt rate limit and
  the day-name password.

## 5. Changelog
- 2026-07-18 — Static Invoice Maker built (Internal/External modes, PDF export via
  html2pdf.js, localStorage persistence).
- 2026-07-18 — M1: internal team dropdown w/ PAN autofill; "Remittance" → "Payment Note".
- 2026-07-18 — M2: Send Email (password + ownership-transfer confirmation modal) via a
  Vercel serverless function + Resend. M3: 90/10 service/ownership split in the black
  Total Due box.
- 2026-07-18 — **Migrated the whole app to Next.js** as a multi-tool "super app" (plan:
  same-device handoff for signing, no auth suite-wide). Invoice Maker ported 1:1 into
  `app/invoice/InvoiceApp.jsx`; the send-invoice function became a Route Handler. Built
  the new **Timesheet & Client Sign-off** tool from scratch (`app/timesheet/`): shift +
  repeatable breaks with live Pacific-time billable-hours calculation, a "Ready for
  Client" handoff into a mobile-first review + `react-signature-canvas` signing step,
  auto-emailed via a new `/api/send-timesheet` route. Added a home page tool picker.
  Old static files deleted. Verified with `npm run build` and a headless-browser pass.
- 2026-07-18 — Follow-up polish round:
  - **Invoice Maker** now defaults straight into Internal mode on load (no upfront
    Internal/External picker — that modal + its CSS were removed entirely). "Switch
    mode" now toggles directly between modes (no modal), and a colored pill next to
    the "generator" subtitle always shows the current active mode.
    Added an "Official Email" field (`state.fromEmail`) used as the `replyTo` on the
    invoice-send email.
  - **Timesheet**: filmmaker is now a plain text field defaulting to "Subash Thokar"
    (dropdown/roster removed for this tool); added an "Official Email" field
    (`filmmakerEmail`, used as `replyTo`). The Billable Hours box (both the live
    fill-step preview and the client-facing review/record) now itemizes the shift and
    every break with its own duration, not just the final total. Renamed the two CTAs:
    "Ready for Client" → "Validate with Signature", "Approve & Sign" →
    "Approve & Send for Invoice".
  - **Home page**: outer background changed from gray to pure white; card given a
    stronger drop shadow, a border-radius, and symmetric padding (was leaving an odd
    gap at the bottom after the "More tools coming soon" card was removed entirely);
    tagline's em dash replaced with a colon.
  - Both email routes: simplified subject lines ("Invoice from {name}" /
    "Timesheet from {name}"), no em dashes; added `replyTo` from the newly collected
    email fields.
  - Wired in a real `RESEND_API_KEY` (in gitignored `.env.local`) and discovered the
    sandbox recipient restriction documented in §3 above.
- 2026-07-18 — Second polish round:
  - **Invoice Maker "Your Name"**: dropdown replaced with a plain autocomplete text
    field (backed by a `<datalist>`) — typing a few characters of a roster member's
    name, any case, uniquely matches and fills in PAN + Official Email. `lib/team.js`
    gained an `email` per person; `isRosterMember`/`findMember`/`OTHER` were removed
    (unused once the dropdown/lock model went away — nothing is read-only anymore).
  - **NPR only in the black box**: line-item Rate/Amount now show a plain formatted
    number (new `fmtNumber` in `lib/format.js`) for internal invoices — the currency
    code only appears inside the black Total Due box, not repeated on every row.
    External ($ USD) rows are unchanged.
  - **"Payment Note" → "Remarks"** everywhere (sidebar field label + both invoice
    preview columns). Internal invoices' auto-generated remarks text now reads:
    "fromSilicon does not withhold, remit, or otherwise facilitate any tax on this
    payment. Any applicable tax burden is the sole responsibility of the contractor."
    (replacing the old "inclusive of tax" framing, which said the opposite).
  - **Qty/Rate/Tax Rate inputs switched from `type="number"` to `type="text"
    inputMode="numeric|decimal"`** — `type="number"` inputs don't support
    `selectionStart`/`.select()` in browsers (confirmed via testing), so the intended
    "select-all on focus" fix silently did nothing on the old input type. Text +
    inputMode keeps the mobile numeric keyboard, supports select-on-focus properly
    (verified: focusing a field showing the default "0" and typing now replaces it,
    doesn't prepend to it), and drops the number-input spin-button clutter.
  - **Reddish send/cancel styling**: `.btn-send` (the sidebar "Send Email" button and
    the send-modal's "Send" button, which now shares this class) recolored from green
    to a muted brick red. The send-modal's `.btn-ghost` "Cancel" — previously
    near-invisible (light `.btn` text color on the modal's light paper background,
    a leftover from those button styles being designed for the dark `.panel` context)
    — now has a visible reddish outline/text.
  - **Invoice Send Email password rewritten** from a static `INVOICE_SEND_PASSWORD` env
    var to a server-computed Nepal-day-name password (changes daily) with a 5-attempt/
    24h/IP server-side rate limit. Full rationale, and honest limitations, in §4 above.
- 2026-07-18 — Third polish round:
  - **Resend domain verified** (`updates.fromsilicon.com`) — real end-to-end sends to
    `losh@fromsilicon.com` now confirmed working from both routes. See §3.
  - **Timesheet**: added a **Shoot** section with a "Shoot Title" field (e.g. "Interview
    in Salt Lake") ahead of Filmmaker; Client/Project is now a two-column row with a new
    **Nature of Shoot** dropdown (Interview/Podcast/Launch Video/Product Demo/Event
    Coverage/Behind the Scenes/Testimonial/Documentary/Music Video/Corporate/Other) —
    both flow into the emailed record and the review screen. Added a footer line to the
    captured record: "Adheres to the Independent Contractor Agreement."
  - **Timesheet boxes made "boxy and sharp"**: `.review-summary`, `.review-hours`,
    `.sig-block`, `.break-card` lost their border-radius and gained a 2px `--ink` border
    (matching Invoice Maker's black Total Due box language) instead of the previous
    soft-rounded 1px `--rule` cards.
  - **Fixed an invisible button**: the review screen's "Approve & Send for Invoice" used
    `.btn-primary`, whose cream background is identical to the page's `--paper`
    background in this light-page context (unlike Invoice Maker, where it sits on a dark
    sidebar) — it visually disappeared, showing only text. Switched it to `.btn-send`
    (reddish), fixing the bug and matching the app's "send" action color everywhere.
  - **24-hour time inputs**: discovered that `lang="en-GB"` on `<input type="time">`
    does **not** force 24-hour display in Chromium (confirmed by testing) — browsers
    render time pickers per OS/browser locale, not page/element `lang`. Replaced all
    four time fields (shift start/end, break start/end) with plain
    `type="text" inputMode="numeric"` fields (placeholder "14:30") — guarantees 24-hour
    format for every visitor regardless of their locale, at the cost of the native
    picker widget. The underlying value format ("HH:MM") was already 24-hour internally
    either way, so no Pacific-time math changed.
  - **Favicon wired up** from the `public/favicon_io/` pack (already present) via
    `app/layout.js`'s `metadata.icons` + a new `public/site.webmanifest`.
  - Removed stray `.DS_Store` files and added `.DS_Store` to `.gitignore`.
- 2026-07-18 — Fourth polish round (Invoice Maker):
  - Mode indicator simplified: removed the colored "Internal/External" pill and the
    dynamic "Switch to X" button label — back to a plain "Switch mode" button (still
    toggles directly, no modal). The mode is now shown as a small, low-opacity (0.25),
    rotated `.mode-side-label` sitting at the left edge of the preview stage instead.
  - **Backdrop image**: `.stage` (the area around the paper invoice) now shows
    `public/invoice-backdrop.jpg` (a Golden Gate Bridge photo, downloaded and
    self-hosted rather than hotlinked to Unsplash) at 20% opacity via a `::before`
    pseudo-element, replacing the flat gray. Doesn't affect the exported PDF — that
    only ever captures `#invoice-page`, a sibling of the backdrop layer, not a
    descendant of it.
  - Internal invoice's black-box split rows now read "Service Charge · 90% of Invoiced
    Value" / "Ownership Transfer · 10% of Invoiced Value" (previously just "90%"/"10%").
- 2026-07-18 — Fifth polish round:
  - **Found and fixed a real CSS bug**: `.section:first-of-type` never actually matched
    anything, in either Invoice Maker's `.panel` or Timesheet's `.ts-page` — the
    `.sub-row`/`.letterhead` div (also a `<div>`) always structurally precedes the first
    `.section`, so it — not the section — was `:first-of-type`. Every "first" section
    has always rendered its `border-top` (barely visible on the dark panel, glaringly
    visible as a stray line under Timesheet's black letterhead once the "Shoot" section
    became first). Replaced with adjacent-sibling selectors
    (`.sub-row + .section, .letterhead + .section`) that reliably target the actual
    first section regardless of DOM sibling composition.
  - Timesheet: added explicit "(24hr, HH:MM)" to the Start/End Time and break
    Start/End labels (on top of the existing hint text) for clarity.
  - Timesheet review screen: `.review-actions` had no `margin-top`, so the "Approve &
    Send for Invoice" button sat flush against the footer line above it with zero
    breathing room — added `margin-top: 24px`.
  - **Commit policy**: user asked that Claude never be added as a co-author on commits
    in this repo — saved as a standing memory; this and all future commits omit any
    Co-Authored-By trailer.
- 2026-07-18 — Sixth polish round:
  - **Removed the Unsplash backdrop entirely** (user reported not seeing it — rather
    than debug why, just cut it per their "if we're not using this, delete it" call).
    Deleted `public/invoice-backdrop.jpg`, the `.stage::before` rule, and the
    now-unnecessary `position/z-index` on `.page-wrap` that existed only to stack
    above it. The small rotated `.mode-side-label` (Internal/External) is unrelated
    and stays.
  - **Home page made boxy**: `.home-page` lost its `border-radius: 10px`, gained a
    2px `--ink` border, matching Invoice/Timesheet's black-box language.
  - **Added a "Powered by fromSilicon" link** below the home page card (same pattern
    as Invoice Maker's, but with a `.home-wrap .powered-by` color override since the
    original pale color was tuned for the dark `--desk` backdrop, not this page's
    white background).
- 2026-07-18 — Seventh polish round: **fixed real mobile overflow on Timesheet**
  (flagged as critical — this is the tool meant to be handed to someone on a phone).
  Root cause, confirmed by emulating an iPhone 13 viewport and measuring
  `document.documentElement.scrollWidth` vs `clientWidth` (404px content in a 390px
  viewport before the fix): `.letterhead`'s desktop layout (brand block left, big
  40px `.doc-title` right, side by side) was designed for Invoice Maker's 816px paper
  and simply doesn't fit next to "Timesheet" at phone widths — it was pushing the
  page wider than the viewport. Added a `@media (max-width: 480px)` block scoped to
  `.ts-page`/`.ts-wrap`/`.review-wrap` only (Invoice Maker's desktop-oriented layout
  is untouched, confirmed by re-testing it after this change):
  - `.ts-page .letterhead` stacks (brand block above, title below, left-aligned)
    instead of side-by-side; `.doc-title` drops to 26px in this context.
  - `.light-form .row-2` and `.break-card .row-2` (Client Name/Nature of Shoot,
    Start/End Time, break Start/End) collapse from 2 columns to 1.
  - Tightened `.ts-wrap`/`.ts-page`/`.review-wrap` padding to reclaim width.
  Verified zero horizontal overflow at both 390px and 360px viewport widths, and
  confirmed the signature pad correctly captures a real dispatched `TouchEvent`
  sequence (not just mouse events) and properly enables "Approve & Send for Invoice".
- 2026-07-18 — Eighth round: **found and fixed a real PDF page-break bug** by
  actually generating and reading real output PDFs (not just eyeballing the live
  page) — extracted the exact base64 PDF from a live signed-timesheet send by
  intercepting the `/api/send-timesheet` request in Playwright, and separately
  downloaded a real Invoice PDF. The Timesheet PDF was spilling onto an unwanted
  second page, and the footer line ("Timesheet · Confidential ... Independent
  Contractor Agreement") was being **sliced in half exactly at the page boundary**
  — this is what the user saw as "signature flowing outside the text area" /
  "things not in line" (same root cause, would slice through whatever element
  happens to sit at that boundary for a given document's content length).
  - **Root cause**: `lib/pdf.js`'s `pdfOptions()` sizes the PDF page to exactly
    `pageEl.offsetWidth`/`offsetHeight` (measured on the live DOM), but html2pdf's
    internal clone-and-render pass measures a few px taller — with zero buffer, that
    was enough to trigger html2pdf's default pagination (`pagebreak.mode:
    ['css','legacy']`, which doesn't prevent mid-element slicing on its own).
  - **Fix**: added a height buffer (`+24px`) so the declared page is reliably taller
    than the actual rendered content, and set `pagebreak: { mode: ['avoid-all'] }`
    as a second line of defense — if a page break is ever still needed for a much
    longer future document, whole elements get pushed to the next page instead of
    being cut through.
  - This is shared code (`lib/pdf.js` is used by both Invoice Maker and Timesheet),
    so the fix covers both. Verified by regenerating the Timesheet PDF (now single
    page, footer fully intact) and stress-testing Invoice Maker with 6 line items
    (also single clean page).
  - Also removed the leftover rounded corners on the home page's tool cards
    (`.tool-card`), matching the "boxy and sharp" direction applied everywhere else.
