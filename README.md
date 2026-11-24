# beard-king-coin

Beard King Coin site, served at originalbeardking.com from this repository.

- `index.html`: the whole page (styles and script inline).
- `privacy.html`: privacy notice for the pledge form and the online concession.
- `favicon.svg`, `og.png`: the mark and the 1200 × 630 link preview image.
- `analytics.js`: GA4 with a consent notice. Shared with itsthebeard.com; keep the copies identical.
- `scripts/build.mjs`: builds the Firebase Hosting copy into `dist/` (see below).
- `docs/DESIGN.md`: design rules and what CI enforces. Start here before changing anything visual or any wording. `CLAUDE.md` is the contributor guide.
- `design-rules.json`, `design-baseline.json`, `scripts/check-design.mjs`, `scripts/check-a11y.mjs`, `scripts/design-checks.test.mjs`: the design guardrails (shared with the store).
- `docs/PLAN.md`: the improvement plan. Setup steps are in `docs/SETUP.md` in the itsthebeard repository.

A coin can be conceded online. The form builds a link of the form
`/?to=Name&from=Name&at=Place`; opening it shows the recipient their own
"Superior beard" page. Nothing is stored on a server. The tally lives in the
sender's browser.

## Two ways the site is served

The files at the root are the site as written, and the current host serves them
directly: the pledge form posts to Google Forms.

For Firebase Hosting, `node scripts/build.mjs` writes `dist/`, switching on what
needs Firebase. It is driven by environment variables:

| Variable | Effect |
|---|---|
| `SIGNUP_MODE=api` | The pledge form posts to `/api/signup`, the signup function deployed from the itsthebeard repository. |
| `EMAIL_PROVIDER=mailchimp` | The privacy notice describes the confirmation email. |
| `GA_MEASUREMENT_ID` | Adds Google Analytics with the consent notice. |
| `CONTACT_EMAIL` | Shown in the privacy notice. |

Text that depends on these settings sits in HTML comments
(`<!--unless:api-->…<!--/unless:api-->`, `<!--when:api … -->`), so the root files
stay correct as they are served today.

```sh
node scripts/build.mjs && node scripts/check-dist.mjs
```

```sh
npm ci
npm run check:design                              # static design rules (needs a build)
CHROMIUM_PATH=/path/to/chrome npm run check:a11y        # browser accessibility rules
npm run test:design                                     # proves the checks catch violations
```

`.github/workflows/firebase.yml` runs that check on every push, and deploys once
the repository variable `FIREBASE_PROJECT_ID` is set.
