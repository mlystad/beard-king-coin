# originalbeardking.com (Beard King Coin) — Improvement Plan

Companion plan: `docs/PLAN.md` in `mlystad/itsthebeard`. The shared Google platform both sites run on is specified there in section 3 and summarised here in section 3.

Constraints this plan is built on:

- Both sites are hosted in the Google ecosystem.
- Coins are manufactured by a supplier and stored, shipped and returned by Amazon or another fulfillment player.
- The operation stays close to zero-staff.

---

## 1. Where the site is today

A single teaser page with a strong idea and good copy. It has one job, collecting emails for the launch, and it cannot confirm that it does that job.

| # | Finding | Where | Why it matters |
|---|---|---|---|
| 1 | The signup posts to a Google Form with `mode: 'no-cors'`. The response is unreadable, so the page prints "You are in" for any outcome short of a network failure, including a rejected submission. | `index.html` script, last 30 lines | Lost signups are invisible, and the list is the only thing this site produces. |
| 2 | No product. There is no coin spec, price, pack size, date or photo, and the coin shown is an SVG drawing. | whole page | A visitor has nothing to decide on and no reason to return. |
| 3 | The call to action is hidden for the first 1.5 seconds. Every block starts at `opacity: 0` and fades in on a stagger up to 1.7 s; there is no `prefers-reduced-motion` rule. | `.cta-section`, `footer`, `@keyframes riseIn` | Slower perceived load, and continuous motion (`float`, 6 s loop) for people who asked for none. |
| 4 | The heading is read as one word. `<h1>Beard<span>King</span></h1>` has no space; the line break is visual only. | `<h1>` | Screen readers and search snippets get "BeardKing". |
| 5 | No analytics, Search Console, Open Graph/Twitter tags, favicon, canonical link or structured data. | `<head>` | The story is built to be shared, and a shared link currently shows a bare URL. |
| 6 | No privacy notice beside an email field, and no confirmation email. | CTA section | Needed for consent, for deliverability at launch, and for any later ad or Amazon programme. |
| 7 | Canonical host is ambiguous. `CNAME` is the apex; the sister store links to `www.`. | `CNAME` | Split search signals and analytics. |
| 8 | The email placeholder is styled at 45% opacity and the footnote at 55%. | `.email-input::placeholder`, `.cta-note` | Likely below 4.5:1 contrast. The store repo already solved this with an opaque text ramp; reuse it. |
| 9 | README says "Beard Kind Coin". | `README.md` | Typo. |

Not verified: what the live domain currently serves. Outbound requests from the planning session were blocked, so the findings are from the repository source.

---

## 2. What "better" means here

1. Every signup is captured, confirmed by email, and counted.
2. The page states what the coin is, what it costs, how many come in a pack and when it ships.
3. A visitor can buy coins and receive them without the owner handling the order.
4. Receiving a coin brings the recipient back to the site. The product recruits its next customer.
5. The story shares well: correct preview image, title and description everywhere.

---

## 3. Platform (summary)

Same Firebase project as itsthebeard.com:

- **Firebase Hosting** site `originalbeardking`, deployed by GitHub Actions on merge, preview URL per pull request.
- **Signup function** (Cloud Run functions) writing to **Firestore** and to the shared ESP with double opt-in, protected by App Check. Records carry `site: "coin"` so the two lists stay distinguishable.
- **GA4** stream under the shared property with cross-domain measurement, **Tag Manager**, **Consent Mode v2**, **Search Console**.
- **Workspace** mailbox and SPF/DKIM/DMARC on the domain.

Google has no email-marketing product; one ESP serves both brands.

---

## 4. The product decision that shapes the site

The coin is something you give away. That has three consequences the plan relies on:

- **The unit of sale is a pack.** Nobody needs one coin. Sell packs (for example 5 and 10) so a buyer has coins to hand out, and repeat purchase is built in.
- **The first tenet needs one clarifying line.** "You cannot buy your way into greatness" sits beside a buy button. The resolution is already in the ritual: you buy coins to give, never to keep. Say so on the page.
- **Every coin handed over is a new visitor,** if the coin tells the recipient where to go. Put a short URL or QR code on the reverse, leading to a "You've been given a coin" page. That page is the growth engine; see Phase 4.

Fulfillment route: a challenge-coin manufacturer strikes the coins and ships cartons to **Amazon FBA**. Amazon sells them on a listing and, through **Buy with Prime / Multi-Channel Fulfillment**, also ships orders placed on this site. One pool of inventory, two storefronts, no handling.

---

## 5. Phases

Each phase ends with a site that is better than before and safe to leave as-is.

### Phase 0 — Fix the page that exists

Small edits to `index.html`, no new infrastructure.

- Signup: show a failure message on error and stop claiming a result the code cannot see. Stopgap wording: "Thanks. If you don't hear from us at launch, write to hello@…". The real fix is Phase 1.
- Motion: render content visible by default and treat the fade-in as an enhancement; add a `prefers-reduced-motion` rule that removes `riseIn` and `float`.
- Heading: add a real space or a visually hidden one so the name reads "Beard King".
- Contrast: replace the opacity-based greys with opaque values that meet 4.5:1, matching the store's `--text-2`/`--text-3` approach. Add a visible label for the email field and a focus style.
- Sharing: Open Graph and Twitter tags, a 1200×630 image of the coin, favicon, canonical link.
- Add a short privacy notice page and link it beside the form.
- Fix the README typo and point it to this plan.

Done when: the page is readable immediately, passes an automated accessibility check, previews correctly when pasted into a chat, and never reports a false success.

### Phase 1 — Move to Google and start measuring

Done jointly with the store; details in the store plan, section 5, Phase 1.

- Hosting site, deploy workflow, DNS cutover, canonical host with a 301 from the other.
- Forms pointed at the signup function; existing Google Form responses imported once.
- GA4 events: `sign_up`, `share`, scroll depth to the CTA.
- Confirmation email on signup, which also proves the sending domain works before launch day.

Done when: a test signup lands in Firestore, receives a confirmation email, and appears in GA4.

### Phase 2 — Define and source the coin

This phase is mostly off-site work. The site changes are small but they turn a teaser into a pre-order page.

1. **Clear the name first.** See section 6. Do this before paying for a die with "BEARD KING" cut into it.
2. **Specify the coin.** Diameter, thickness, metal and finish, edge, artwork for both faces, and the URL/QR on the reverse. Commission real coin art from the existing SVG concept.
3. **Get three manufacturer quotes** at two quantities, including die cost, per-unit cost, lead time, and packaging per pack. Order a physical sample before the production run.
4. **Decide packs and price** from the quotes and Amazon's FBA and referral fees for a small, light item. Model the margin per pack before ordering; do not order on a guess.
5. **Open the Amazon seller account,** buy GS1 barcodes, create the listing, send the first shipment to FBA.
6. **Update the site:** photos of the real sample, the spec, pack sizes, expected price and a real date. Change the CTA note from "Be notified" to a dated promise once the production order is placed.
7. **Email the list** with progress: the sample photo is the first real news subscribers have had.

Done when: inventory is checked in at Amazon and the page shows the real coin, pack, price and date.

### Phase 3 — Launch

- Replace the waitlist CTA with a buy button. Start with a link to the Amazon listing, tagged for analytics. Add Buy with Prime on the page once confirmed available for this site, so the purchase completes without leaving.
- Keep the signup form lower on the page for restock and new-design news.
- Launch email to the list, timed for when stock is live.
- Add Product JSON-LD, shipping and returns pages that describe Amazon's handling accurately, and terms.
- Split the single page into a small set: home (the story), the coin (spec and buy), the code (the tenets, expanded), privacy and terms. Use the same Astro setup as the store.
- Once checkout completes on this domain, add the coin to the shared Merchant Center feed for Google free listings. A page that only links to Amazon does not qualify.

Done when: a test order placed from the site arrives, and the launch email has gone to every confirmed subscriber.

### Phase 4 — The loop

- **`/received`**, the page the coin's QR points to. It congratulates the recipient, explains the code, and offers three actions: join the list, get coins of their own, share the moment.
- **A count of coins given.** Recipients can tap "I received one" (City, optional photo, stored in Firestore, moderated before display). A running total and a map or wall on the home page make the brotherhood visible. No serial numbers are needed for this; a single shared QR keeps manufacturing cheap.
- **Numbered or limited editions** later, if demand supports the extra cost of per-coin engraving.
- **Cross-sell with itsthebeard.com:** `/received` links to the store; the store's kit includes a coin.
- **Email flows:** welcome, launch, post-purchase ("who did you give the first one to?"), restock.

Done when: scans of the coin's QR are measurable in GA4 and a visible share of new signups come through `/received`.

---

## 6. Risks and items to verify before spending

| Risk | Action |
|---|---|
| **"Beard King" trademark.** Trademark aggregators list a live BEARD KING registration (Reg. No. 4695643, Class 25, grooming bibs and aprons), and a separate Beard King Corp. with filings in grooming goods. A coin is a different class of goods, but the name is in use in the beard-product market, and Amazon acts on brand complaints by removing listings. | Check status and ownership in USPTO TSDR (serial 86345238) and get an attorney's opinion before cutting the die, building the Amazon listing, or filing for the brand's own mark. Have a fallback inscription ready. |
| **Minimum order and die cost.** The first run is the only real capital outlay in this plan. | Size it from the confirmed list, not from hope: Phase 1's count of double-opted-in subscribers is the input. |
| **Thin margin on a small item.** Fulfillment fees are per unit shipped, which favours packs over singles. | Model per-pack margin from real quotes and current Amazon fees before choosing pack sizes. |
| **Buy with Prime terms** for sites not on a supported commerce platform, and its 2026 fee schedule, are reported inconsistently. | Read Amazon's current requirements before Phase 3. The fallback is a plain link to the Amazon listing, which already works. |
| **User-submitted photos** on `/received`. | Moderate before display, collect consent, and make removal easy. |

---

## 7. Measures and decision points

| Phase | Measure | Decision it drives |
|---|---|---|
| 1 | Confirmed signups, and signup rate per visit | Size of the first production run |
| 2 | Open and click rate on the sample-photo email | Whether the price and pack feel right before committing |
| 3 | Sell-through of the first run; share of orders from the site versus Amazon search | Reorder quantity; whether Buy with Prime is worth its fee |
| 4 | QR scans per coin shipped; signups via `/received` | Whether the loop works, and whether numbered editions are worth doing |

Decisions the owner needs to make:

1. Is the name cleared, or is a fallback inscription needed?
2. Pack sizes and price, once quotes are in.
3. Canonical host: apex or `www`?
4. Whether the copy stays addressed to men ("sir", "his beard") or is loosened. It is a brand-voice choice; it also sets who feels invited to buy.

---

## Sources for the items marked "verify"

- BEARD KING registrations (aggregators, not USPTO): [markinton.com/trademark/beard-king-86345238](https://markinton.com/trademark/beard-king-86345238), [trademarks.justia.com — Beard King Corp.](https://trademarks.justia.com/owners/beard-king-corp-3152392/)
- Buy with Prime: [buywithprime.amazon.com/requirements](https://buywithprime.amazon.com/requirements), [ppc.land/buy-with-prime](https://ppc.land/buy-with-prime/)
- Merchant Center landing pages: [support.google.com/merchants/answer/4752265](https://support.google.com/merchants/answer/4752265?hl=en)
