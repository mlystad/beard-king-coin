# Design rules: originalbeardking.com (Beard King)

These rules keep the coin site distinctive, accessible and honest as it grows. Most are
checked by machine: a pull request that breaks one fails CI, and the check says which.
The few that need a person's judgement are marked **review**.

Companion document: `docs/DESIGN.md` in `mlystad/itsthebeard`. The two sites share
principles and the analytics notice (`analytics.js`, identical copies); each has its own
palette and voice.

## How the rules are enforced

| Command | What it does |
|---|---|
| `SIGNUP_MODE=api GA_MEASUREMENT_ID=G-TEST12345 node scripts/build.mjs` | Builds `dist/` with the features that need checking switched on. |
| `npm run check:design` | Static rules on the built site (`design-rules.json`). |
| `npm run check:a11y` | Browser rules: axe, 320px reflow, focus, tap size, reduced motion. Needs `CHROMIUM_PATH` or Chrome. |
| `npm run test:design` | Proves each check fails when it should (seeded violations), and covers `robots.txt`, `sitemap.xml`, the 404 page and the pledge form's error state. |

Two kinds of rule:

- **Hard**: any violation fails. They pass today and must keep passing.
- **Ratchet**: legacy problems are held at a count in `design-baseline.json`. The count may
  fall, never rise. When you fix some, run `npm run design:baseline` and commit the lower
  numbers.

**Never make a check pass by raising a baseline number, editing `design-rules.json` to allow
something, or skipping a check.** Fix the code. If a rule is wrong, change it in its own pull
request with the reason (see "Changing a rule").

## 1. Principles

1. **The coin is the only warm, round thing on the page.** Everything else is dark, flat and
   straight-edged: raven black, hair-fine lines, a lot of room.
2. **Dry, dignified, a little absurd.** The joke only works if it is played completely
   straight.
3. **True before polished.** Nothing on the page promises a coin that does not exist. There
   is no spec, price or date until there is a sample and a quote.
4. **Readable by everyone.** WCAG 2.2 AA is the floor, including over the hair background.
5. **Nothing leaves the page that the visitor did not send.** A concession is a link, not a
   record; the site stores no one's names.

## 2. Colour

The palette is a beard shade card, defined as `--raven`, `--soot` and so on in `:root`. Use
`var(--token)`; do not write a hex or `rgb()` value in a component rule.

| Token | Value | Role |
|---|---|---|
| `--raven` | `#0A0B0D` | Page background |
| `--soot` | `#121418` | Bands |
| `--sable` | `#1B1E24` | Raised surfaces |
| `--strand` | `#2E323A` | Hairlines and dividers (decorative only) |
| `--edge` | `#666C77` | Borders of controls such as text inputs: 3:1 or better |
| `--ash` | `#9BA0AA` | Quiet text, labels, hints |
| `--salt` | `#CDD1D7` | Body text |
| `--bone` | `#F3EEE4` | Headings |
| `--ginger` | `#DD7A35` | Accent, primary button fill |
| `--ember` | `#F4AE6C` | Light accent, status text, focus ring |

- **Contrast** (checked: `token-contrast`): the text tokens reach 4.5:1 on `--raven` and
  `--soot`; `--ember` also reaches 3:1 as the focus ring. The exact pairs are in
  `design-rules.json`.
- **Borders of controls use `--edge`** (3.7:1 on `--raven`, 3.5:1 on `--soot`; WCAG 1.4.11 needs
  3:1). `--strand` is only 1.5:1, so it is for decorative hairlines and must never be the only
  border of a control.
- **No opacity on text.** Use an opaque token so contrast stays measurable.
- **Colour never carries meaning alone** (WCAG 1.4.1).

## 3. Type

| Role | Family | Used for |
|---|---|---|
| Display | Bricolage Grotesque 200-800, width 75-100 | `.display` headings: uppercase, tight, condensed |
| Body | Instrument Sans 400/500/600 | Paragraphs, forms, buttons |
| Voice | Instrument Serif, italic | The spoken line: "Superior beard, sir." (`.voice`) |

- **Minimum 14px** for any text (`font-size-floor`, ratchet); body 17px.
- Uppercase belongs to display headings and short labels, not sentences. The voice line is
  never uppercase.
- **Letter-spacing 0.12em or less** on text under 16px (`letter-spacing-cap`, ratchet).
- One `<h1>`; levels never skipped (`h1-count`, `heading-skip`).
- **The hero word must fit a 320px screen.** `.hero h1` scales with the viewport below 520px;
  keep the longest word under about 250px at 320 (`reflow`, hard).

## 4. Layout and responsive

- `.wrap` is 1180px with a gutter of 20-64px (`clamp`). Sections have generous vertical room.
- Breakpoints in use: 900, 520, 400. Prefer fewer.
- **Grid columns written `1fr` can grow past the screen when a word will not break.** Use
  `minmax(0, 1fr)`. This was the cause of the 320px overflow.
- **Everything works at 320px with no sideways scroll** (`reflow`, hard), and pinch zoom is
  never blocked (`zoom-locked`).
- The header is sticky. It must never hide a focused control (`focus-obscured`).

## 5. Components

**Buttons (`.btn`).** Pill shaped, ginger fill, `--raven` text; `.ghost` is the quiet
variant; `.small` is for the header. One main action per view. Labels say what happens.
Tap targets 44 by 44px; 24px is the enforced floor (`target-24`, ratchet).
The header button reads "Concede" on very narrow screens; keep its short form meaningful.

**Forms.** Every field has a visible `<label for>` (`input-label`). Errors are in words,
beside the field, announced (`role="status"`), and keep what was typed. The honeypot stays
hidden from people (`.hp`). An invalid address also marks the field `aria-invalid`, the field
points at the message with `aria-describedby`, and both clear as soon as the visitor edits
(`scripts/pledge.test.mjs`).

**Focus.** Visible on every control (`focus-indicator`), never removed without an equal
replacement (`focus-indicator-removed`).

**The coin (`.coin`).** A real button that flips; it has an accessible name, a visible focus
state and respects reduced motion. The artwork is decorative SVG (`aria-hidden`).

**The concession.** The form builds a link (`/?to=Name&from=Name&at=Place`); the recipient's
page is rendered in their browser. **Nothing is sent to or stored on a server**, and the
privacy notice says so. Do not add a backend call, a counter or a share service without
changing the notice first.

**Hero over the hair canvas.** Text sits on a drawn background of strands. Any text that sits
on it must keep 4.5:1 against the brightest strand under it (**review**). The small text (the
12px label and the "tap the coin" hint) carries a soft raven halo (`text-shadow`) for this.
Measured on 24 November 2026 by sampling the rendered pixels behind the text, with the real
fonts: at the 99th percentile of background brightness the label is 5.5:1 and the hint 4.7:1
or better at 1280 and 375px, and the single worst pixel is 3.5:1 or better. Measure any new
text over the canvas the same way.

**Analytics notice.** `analytics.js`, shared. It follows the skip link or comes first in the
page, reserves its own height and is reopened from "Cookie choice". Do not turn it into an
overlay that covers focused controls.

**Images.** Meaningful images have `alt`; decorative ones `alt=""` or `aria-hidden` (`img-alt`).
`og.png` is 1200 by 630 and shows the coin.

## 6. Motion

- Animations and smooth scrolling need a `prefers-reduced-motion: reduce` block that stops
  them (`reduced-motion-missing`, `reduced-motion-scroll`, `reduced-motion-animation`). The
  coin's float and the intro fade are the current examples.
- Content is visible without waiting for an animation to finish.
- Nothing flashes more than three times a second.

## 7. Voice and claims

Tone: formal, deadpan, brief. The ritual is serious; the page is not. Second person,
present tense. No exclamation marks. Never explain the joke.

The four tenets are the brand's spine. Tenet I, "you cannot buy your way into greatness",
sits next to a pledge form. Keep the resolution explicit wherever a buy action appears:
**you buy coins to give, never to keep.**

**Claims are banned until they are true**, and the list is enforced (`banned-claim`) on page
text and on the description and share tags: shipping speed and cost, returns, stock and
scarcity, "limited edition" and numbering, Prime, and **every physical fact about the coin**
(metal, plating, enamel, finish, origin, "handmade") until a sample and a quote exist.
To use one, add it to `allowedClaims` in `design-rules.json` with its evidence.

- **The name.** Trademark aggregator sites list a live BEARD KING registration for
  clothing-class goods and other filings in grooming goods (`docs/PLAN.md`, section 6).
  Do not strike the name on a die or build a marketplace listing around it until it is
  cleared.
- **Amazon will ship coins, not us.** Say who ships, never how fast.

## 8. Third parties and privacy

- Only the hosts in `design-rules.json` `allowedHosts` (`third-party-host`). The share
  buttons use `wa.me` and `twitter.com` links; nothing loads from them.
- No third-party `<script src>` (`external-script-tag`). Analytics loads only from
  `analytics.js`, and sets nothing until the visitor chooses Allow.
- Collected: an email address (pledge). Names typed into the concession live only in the
  link the visitor shares.
- No inline event handlers in new markup (`inline-handler`).

## 9. Build and content

- The root files are the site as written and stay valid for the current host. The build
  (`scripts/build.mjs`) only switches features on, using HTML comments:
  `<!--unless:api-->…<!--/unless:api-->` and `<!--when:api … -->`. Edit the root files, not
  `dist/`.
- Wording that depends on the setup (Google Forms or the function, Mailchimp, analytics,
  contact address) lives inside those switches, so it is never wrong for either mode.
- `robots.txt`, `sitemap.xml` and `404.html` are real files at the root, because the site is
  served from there. The build copies them. `sitemap.xml` must list exactly the pages that can
  be indexed (everything except the 404 page); a test fails otherwise, and a new page also
  needs adding to the page list in `scripts/build.mjs`. The 404 page is `noindex`.

## 10. Pull request checklist

- [ ] The build and `npm run check` pass.
- [ ] `npm run check:design` and `npm run check:a11y` pass (CI runs both).
- [ ] No new baseline numbers; lowered ones are committed (`npm run design:baseline`).
- [ ] Looked at the change at 320px wide and with the keyboard only.
- [ ] No claim added that is not true today (especially about the coin itself).
- [ ] If a host, cookie or data field changed: the privacy notice changed with it.

## 11. Changing a rule

1. Open a pull request that changes only the rule (`design-rules.json`, this document and
   the check if needed) so it is reviewed on its own.
2. Say what the rule protected, why it no longer fits, and who is affected.
3. Never loosen a WCAG rule for convenience.
4. Add or adjust the matching case in `scripts/design-checks.test.mjs`.

## 12. Rule index

| Rule id | Kind | Protects | Todo while it is a ratchet |
|---|---|---|---|
| `token-contrast`, `token-missing` | hard | Text and boundary contrast (including `--edge`) | |
| `font-size-floor`, `rendered-font-floor`, `letter-spacing-cap` | ratchet | Readable text | A11y #4 |
| `color-literal`, `inline-style` | ratchet | Colours and styles from tokens and classes | |
| `focus-indicator-removed`, `focus-indicator`, `focus-obscured`, `keyboard-trap`, `keyboard-unreachable` | hard | Keyboard users | |
| `reflow`, `zoom-locked`, `viewport-meta` | hard | Zoom and small screens | |
| `reduced-motion-*` | hard | Motion sensitivity | |
| `target-24` | ratchet | Tap and click targets | A11y #6 |
| `axe-*` | ratchet at 0 | WCAG 2.2 A/AA and best practice | |
| `html-lang`, `h1-count`, `heading-skip`, `img-alt`, `input-label`, `empty-control`, `duplicate-id`, `tabindex-positive` | hard | Structure and names | |
| `blank-no-noopener`, `affiliate-no-sponsored`, `inline-handler` | hard | Link safety | |
| `third-party-host`, `external-script-tag` | hard | Privacy promise | |
| `banned-claim` | hard | Honest copy | |

## 13. Open design debt

Known gaps from the accessibility audit of 24 November 2026 (numbers follow the audit
report). Fixing one means lowering its baseline number (`npm run design:baseline`) in the
same pull request.

| # | What to do | Rules that hold it | Notes |
|---|---|---|---|
| A11y #4 | Raise small text: nothing under 14px; the 12px form labels, hint and header links; uppercase only for short labels; tracking 0.12em or less. | `font-size-floor`, `rendered-font-floor`, `letter-spacing-cap` | Needs a design check. |
| A11y #6 | Enlarge tap targets to 44 by 44px: top nav links (20px), "Cookie choice", privacy page links; "Copy link" and share buttons are 42px. | `target-24` | 24px is enforced; 44px is the goal. |

Items for the store are in its own `docs/DESIGN.md`.
