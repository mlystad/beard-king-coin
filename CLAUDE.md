# CLAUDE.md

Guidance for anyone, human or AI, changing this repository. Read it before you start.

## What this is

originalbeardking.com, the Beard King coin site: one page (`index.html`, styles and script
inline) plus `privacy.html`. The files at the root are the site as written. `scripts/build.mjs`
makes the Firebase Hosting copy in `dist/` by switching features on (signup function,
analytics). Never edit `dist/`. The signup function itself lives in the `itsthebeard`
repository. Sister site: itsthebeard.com.

## Read first

`docs/DESIGN.md` holds the design rules: palette, type, components, motion, voice, and what
may be claimed. Most rules are enforced by machine; the rule index at the end of that file
says which check enforces what. `docs/PLAN.md` is the roadmap.

## Commands

```sh
npm ci                                              # once: playwright-core and axe-core
SIGNUP_MODE=api GA_MEASUREMENT_ID=G-TEST12345 node scripts/build.mjs   # build with features on
node scripts/check-dist.mjs                         # links and anchors
npm run check:design                                # static design rules
CHROMIUM_PATH=/path/to/chrome npm run check:a11y    # browser rules (CI uses installed Chrome)
npm run test:design                                 # proves the checks fail when they should
```

Run the build, `check-dist`, `check:design` and `check:a11y` before every pull request. CI
runs them and blocks deploys on failure.

## Rules that are easy to break

1. **Do not weaken a guardrail to get green.** No raising numbers in `design-baseline.json`,
   no adding to `allowedClaims`, no widening `allowedHosts`, no skipping a check. Fix the
   code. Lowering a baseline number after a fix is welcome (`npm run design:baseline`).
2. **No claim that is not true today.** Especially nothing about the physical coin (metal,
   finish, origin, edition size), shipping, stock or price. The banned list is enforced.
3. **Tokens, not literals.** Colours come from `:root`. Text is at least 14px, in opaque
   tokens, with the contrast pairs in `design-rules.json`.
4. **Everything works at 320px wide and with the keyboard.** Grid columns are
   `minmax(0, 1fr)`, never bare `1fr`. Focus is always visible and never hidden by the
   sticky header or the analytics notice.
5. **Motion respects `prefers-reduced-motion`.** New animation needs its off switch.
6. **The concession stores nothing.** Names live in the shared link only. Any new data
   collection or third-party host means updating `privacy.html` in the same change.
7. **`analytics.js` is shared** with the store and must stay byte-identical in both
   repositories. Change both together.
8. **`scripts/check-design.mjs`, `scripts/check-a11y.mjs` and
   `scripts/design-checks.test.mjs` are also shared.** Same rule.
9. **A new page needs three things:** a line in `sitemap.xml` (a test checks it lists exactly the
   indexable pages), a place in the page list in `scripts/build.mjs`, and a link from the
   footer or nav. Never put the 404 page in the sitemap.
10. **Borders of controls use `--edge`, never `--strand`** (1.5:1; decorative only).

## Pull requests

Open them as drafts. Describe what changed, how you checked it (at 320px and with the
keyboard), and anything a reviewer should look at on a real phone.
