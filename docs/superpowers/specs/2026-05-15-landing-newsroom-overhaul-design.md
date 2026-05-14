# Landing Page Newsroom Overhaul

> Restructure `public/index.html` into a newsroom data-piece layout while preserving the broadsheet identity, every existing widget, and all live data wiring.

## Context

The current `/` (broadsheet dashboard) buries its strongest signal — the price — behind a 5-card stats strip and a duplicated SEO aside. The audit (May 2026) flagged the hero hierarchy, the duplicated content, and a misleading mobile breakpoint that promotes "Prices Collected" over the actual headline number. The goal of this overhaul is to reorder the page so the answer leads, the data shape becomes the visual centrepiece, and every existing tool (map, leaderboards, near-me search, salary calculator, "Sydney in Coffees" metric bank, region cards, newsletter) is preserved but choreographed into a Pudding/FT-style data piece.

This is a **layout + visual restructure**. Identity (cream + bronze + Playfair Display + DM Sans), every existing widget, and all live-data injection paths stay. No new server routes, no new backend endpoints, no schema changes.

## Goals

1. Lead with the price — the H1, hero copy, and stat band all surface `$5.80` immediately.
2. Make the distribution histogram the visual centrepiece, not a buried sub-section.
3. Preserve every existing interactive widget and every contextual metric.
4. Hold the page weight down by removing the duplicated SEO aside and demoting decorative sections.
5. Improve scannability via newsroom devices (section rules, pull quotes, byline strip).

## Non-goals

- No new design system / token palette. Reuse `--canvas`, `--ink`, `--accent`, `--rule`, `--secondary`, `--tertiary` (already darkened to `#8A7F73` for AA contrast).
- No new server endpoints. Live data continues to arrive via the existing `window.__LIVE_DATA__` injection in `webhook.js`.
- No changes to `sydney-coffee-price-report-2026.html`, `admin.html`, `press.html`, or `melbourne.html`.
- No backend schema, migration, or test changes.
- No animation overhaul. Existing `prefers-reduced-motion` handling is retained; no new motion is introduced beyond CSS transitions on hover.

## Architecture

### Files modified

- `public/index.html` — single-file rewrite of the body markup and a moderate refactor of the inline `<style>` block. JSON-LD blocks at the top of `<head>` are preserved; the FAQPage and WebPage schema are unchanged.
- `webhook.js` — no functional change. The `injectLiveData()` helper continues to inject `window.__LIVE_DATA__` and `window.__REGION_CONFIG__` into `</head>` via `jsonForScript()`.

### Files unchanged

- All other `public/*.html`
- `webhook.js` route handlers, schema, JSON-LD
- `db.js`, `cafes.js`, `caller-*.js`, `auth.js`
- All tests (49 unit tests on pure functions — no markup-coupled assertions)

### Existing JS that must keep working

The bottom of `index.html` contains the runtime that hydrates the dashboard from `window.__LIVE_DATA__`. The new markup must preserve every DOM ID and class hook the JS reads or writes:

- `#statAvg`, `#statCheapestPrice`, `#statCheapestName`, `#statDearestPrice`, `#statDearestName`, `#cafesCalled`, `#cafesCalledSub`, `#statPrices`, `#statAnswerRate`
- `#findingsSection`, `#findingsGrid`, `#howItWorksSection`
- `#region-cards-1`, `#region-cards-2`
- `#tierRow` and `.tier-badge` markup
- The Leaflet map container and its sidebar (`#sidebarInfo`)
- `#salaryInput`, `#salaryResult`, `#salaryMinutes`, `#salaryPerWeek`, `#salaryPerYear`, `#salaryComparison`
- `sydney-coffees` (the metric bank container)
- Newsletter form IDs
- `heroLede`, `heroInsight`, `insightNumber`, `insightText`, `updatedBadge`

Any ID renamed must have its JS consumer updated in the same change.

## Page choreography (top to bottom)

Sections in order — each is a self-contained block with its own section-rule label:

| # | Section | Notes |
|---|---------|-------|
| 1 | Masthead | Brand + "Updated <date>" badge. Single horizontal rule below. |
| 2 | Hero | Section rule "The Sydney Coffee Report · 2026" + Playfair H1 with bronze `<em>` accent on the keyword phrase + 1-line deck + byline rule. |
| 3 | Stat band | 4-up cream band, full-bleed within wrap. Replaces the current 5-card strip. Cards: Sydney average / Cheapest suburb / Dearest suburb / Cafes called. The 5th card ("Prices Collected") is dropped. |
| 4 | Distribution histogram | Section rule "The shape of the data" + Playfair H2 + sub + bordered chart card. Mode bar rendered in `--ink` with a top label. Annotation callout in the top-right of the chart card. |
| 5 | Pull quote 1 | Italic Playfair, bronze left-rule, with cite line. |
| 6 | Cheapest 5 / Dearest 5 | Two-column leaderboard pair with sample sizes. |
| 7 | Find cheapest near me | Section rule "For you" + widget card with location button + suburb input + result line. |
| 8 | Region cards | Section rule "By region" + 4×2 grid of region cards. |
| 9 | Pull quote 2 | Methodology hook. |
| 10 | Map | Section rule "Explore" + full-width Leaflet container. Sidebar list retained. |
| 11 | Salary calculator | Section rule "In context" + widget card with annual-salary input + 3-up result grid (minutes / weekly / annual). |
| 12 | Sydney in Coffees | Section rule "Sydney in coffees" + Playfair H2 + featured stat (compound investment, full-width dark band) + 5 categorised 2-col grids. All 18 existing comparisons preserved. |
| 13 | Methodology | Section rule "How we know" + cream prose block. Inline link to `/press.html`. |
| 14 | Newsletter | Section rule "Subscribe" + dark band ("The Friday Pour") + email form. |
| 15 | Footer | Single horizontal rule with brand line + footer nav. |

## Component specifications

### Section rule (used 11×)

Visual: 18px bronze hairline + 10px uppercase bronze label, 0.12em letter-spacing, 600 weight. Top margin 30px, bottom margin 8px. Sits above every section H2.

```html
<div class="section-rule">The Sydney Coffee Report · 2026</div>
```

Single CSS class. The hairline is generated via `::before`. No JS hook.

### Hero

```html
<div class="hero">
  <div class="section-rule">The Sydney Coffee Report · 2026</div>
  <h1 class="hero-h">The cost of a coffee in Sydney, <em>suburb by suburb</em>.</h1>
  <p class="hero-deck">We rang every independent cafe in 23 Sydney suburbs and asked the same question: how much for a regular flat white? Here is what 847 of them said.</p>
  <div class="hero-byline">By Flat White Index · Live data from cafe phone calls · CC BY 4.0</div>
</div>
```

- H1 retains the keyword extension via `<span class="sr-only">` if needed for SEO; the visible H1 carries the editorial headline. The bronze `<em>` is non-italic (`font-style: normal; color: var(--accent)`).
- The 847 figure in the deck is server-injected via existing `__LIVE_DATA__.total_cafes`. Default to "hundreds of" if unset.
- Byline rule replaces the previous "Live data" badge as the freshness signal.

### Stat band

Full-bleed (negative side margins to the wrap) cream band with 4 stat columns separated by dotted vertical rules. Each stat: tiny uppercase label / Playfair value / sub-text. Two values are coloured: cheapest in `--good`, dearest in `--warn`.

Drops the existing 5th "Prices Collected" card. The "Cafes called" card now shows "847" with sub "23 suburbs" — keeps the 847 visible without needing two cards for it.

### Distribution histogram

A new component. ~13 bars; the modal bar is rendered in `--ink` with an inline label above it. Annotation callout is a small cream card pinned top-right inside the chart card with a hard-left-rule in `--ink`. X-axis labels are sparse (only `$4.00`, `$5.00`, `$5.80 avg`, `$6.00`, `$6.50`, `$7.00+`).

Hydration: a small script reads `__LIVE_DATA__.distribution` (an array of `{bucket, count}`). If the data isn't available, the section is hidden (`display:none`) — not shown with placeholders.

### Leaderboard pair

Two columns, each with H4 + 5 rows. Row layout: rank (Playfair bronze) / name + sample-size sub / right-aligned price. Cheapest column uses `--good`, dearest uses `--warn`. Rows have a 1px dotted bottom border.

Hydration: reads `__LIVE_DATA__.suburbs` (existing array), sorts ascending for cheap, descending for dear.

### Region cards

Existing component, restyled. 4-col grid at desktop, 2-col at tablet, 2-col at mobile. Each card: small uppercase region name / Playfair value / "X suburbs · Y cafes" sub.

The current `#region-cards-1` and `#region-cards-2` containers are merged into a single `.regions` grid; existing JS that populates them gets updated to write to one container.

### Map

Existing Leaflet implementation untouched. Container takes the full wrap width. Sidebar list (`#sidebarInfo`) retained, restyled to match the cream cards.

### Find cheapest near me

Widget card (cream `--paper-warm` bg, `--rule` border). Existing geolocation handler preserved verbatim. Layout is restructured from the current vertical form to a horizontal `display:flex` row with the location button + input + submit on one line, result line below.

### Salary calculator

Widget card. Single salary input, "Calculate" button. Result region is a 3-up grid: minutes-of-work-per-coffee / per-week / per-year. Existing `calcSalary()` JS untouched; only the result template HTML moves.

### Sydney in Coffees

The full metric bank, preserving all 18 comparisons and 5 categories from the existing `COFFEE_COMPARISONS` array.

- **Featured stat** — full-width dark band (`--ink` bg, `--canvas` text, bronze sub). The compound-investment metric (`📈 daily flat white invested at 7% over 30 years`) is featured by default.
- **5 categories**, each with: section header (Playfair name + DM Sans count) + 2-col card grid. Categories: Cost of Living, Getting Around, Sydney Experiences, Work & Money, Only in Australia.
- **Each metric card**: 3-col grid (icon · description + source · bold value + unit).
- The existing `renderSydneyCoffees(avgPrice)` function is reused unchanged — only the card template inside the function is rewritten to match the new visual.

### Pull quotes (2 instances)

Italic Playfair, 22px, 4px bronze left rule, 22px left padding, 36px vertical margin. Cite line below in 11px uppercase DM Sans.

Static editorial copy in the markup. Quote 1 sits between the chart and the leaderboard. Quote 2 sits between the region cards and the map.

### Methodology

Cream prose block (`--paper-warm` bg, 22px padding). Single paragraph with 1–2 inline bronze links (to `/press.html` and to the data export). Same content as the current methodology section, condensed.

### Newsletter

Dark band: `--ink` bg, `--canvas` text, bronze CTA. Two-column at desktop (copy left, form right), stacked at mobile. Existing form action and validation preserved.

### Footer

Single rule above. Two lines: brand + parent org link / footer nav (Methodology · Data export · Press · Melbourne).

## Design tokens

All preserved as-is in the existing `:root` block:

```css
--canvas: #FDFBF7;        /* page background */
--paper-warm: #ECE4D6;    /* cream bands, region cards, methodology */
--ink: #1A140F;           /* primary text */
--ink-soft: #4A3F35;      /* secondary text */
--secondary: #6B5C48;     /* labels */
--tertiary: #8A7F73;      /* tertiary text — already AA-clean */
--accent: #B5481E;        /* bronze */
--accent-soft: #FBE4D7;
--good: #2D6E3E;
--warn: #A03020;
--rule: #E5DFD3;
```

Typography: Playfair Display (700) for headlines, values, and italic pull quotes. DM Sans (400/500/600) for body, labels, and UI. Both already self-hosted via `fonts.css`.

## Mobile

Breakpoints stay at 540px and 720px (existing).

- Stat band: 4 → 2 columns at 720px; the hero stat (Sydney average) spans full-width at 540px (the existing fix from the SEO commit). Other 3 stats compress.
- Distribution chart: bars stay flexible; annotation callout repositions below the chart at <640px.
- Leaderboard pair: 2 → 1 column at 540px.
- Region cards: 4 → 2 columns at 720px, 2 columns retained at 540px (don't collapse to 1; the value is in the comparison).
- Sydney in Coffees: 2 → 1 column at 540px. Featured stat stays full-width at all breakpoints.
- Map: full-width always; height reduces to 240px at 540px.
- Newsletter: 2-col → stacked at 720px.
- Pull quotes: same layout, font reduces from 22px to 18px at 540px.

## Accessibility

- Single H1 (the hero headline). All other sections use H2/H3.
- `lang="en-AU"` retained.
- Skip link retained.
- Section rules are decorative (`aria-hidden` not strictly needed because they're non-interactive); the section H2 carries the meaningful label.
- Stat values get `aria-label` with the full sentence ("Sydney average flat white price five dollars eighty cents") for screen readers when the visual value is just `$5.80`.
- Map keeps `role="application"` and the parallel text suburb list.
- Tier badges keep their semantic meaning.
- Focus-visible outlines preserved.
- All colours used for meaning (good/warn) are paired with text labels; never colour-only.
- `prefers-reduced-motion` honoured (existing rule retained).
- Touch targets: every interactive element ≥ 36px existing minimum.

## SEO / GEO

- Existing JSON-LD blocks (Organization, Dataset, WebSite, WebPage with speakable, BreadcrumbList, SiteNavigationElement, FAQPage) all retained verbatim. `dateModified` continues to update via the existing build step.
- Canonical, OG, Twitter meta unchanged.
- The hero H1 contains the keyword "Sydney" and "coffee" for query matching; the keyword extension via `<span class="sr-only">` from the recent SEO pass is preserved.
- Speakable selectors updated to point at `.hero-deck`, `.hero-h em`, and the four `.stat-v` values inside the stat band.
- The `<aside>` → `<section>` change for the SEO answer block (already shipped) is preserved by deleting the duplicated aside entirely; the answer is now the hero deck and the stat band, which carry stronger semantic weight.

## Implementation strategy

Single PR, single commit per logical chunk:

1. **CSS extraction** — pull the rewritten `<style>` block. New CSS sits inline in the same `<style>` element to preserve the no-build-step constraint.
2. **Markup rewrite** — rewrite `<body>` from masthead to footer, preserving all required IDs.
3. **JS verification** — confirm every getElementById call in the existing script still resolves; rename JS-side any IDs that needed restructuring. Sydney in Coffees uses the existing render function; only its card template HTML changes inside the function.
4. **Visual smoke test** — open `/` locally, confirm: live data hydrates, stat band populates, chart renders, leaderboards populate, region cards render, map loads, find-near-me works, salary calc works, Sydney in Coffees renders all 18 cards, newsletter form submits.
5. **Commit and ship** — single feat commit; deploy via the existing `git pull && npm install && systemctl restart` flow (no migration, no env change, no dependency).

## Out of scope (deferred)

- Server-side rendering of the distribution chart (currently client-side).
- Per-suburb deep pages (`/sydney/<suburb>`) — separate effort, separate spec.
- Mobile redesign beyond the breakpoints listed.
- Replacing Leaflet.
- Refactoring `webhook.js` — earlier audit noted the 1490-line monolith; that's a separate spec.
- Schema changes for caching or dedupe of the histogram data.
- A/B testing infrastructure.

## Risks

- **JS coupling drift.** The existing index.html script reads ~30 IDs. A renamed ID without a JS update will silently break a widget. Mitigation: visual smoke test enumerates every dynamic widget.
- **`__LIVE_DATA__.distribution` may not exist** in the current cache shape. The dashboard cache builder in `webhook.js` (`buildDashboardCache`) needs to expose a histogram-ready shape. If not present, the chart hides itself rather than rendering placeholders. **Action item for plan**: verify cache shape before implementation; if absent, add a `distribution: { buckets: [{lo, hi, count, isMode}] }` field server-side.
- **Page weight.** The current index.html is ~3000 lines. The rewrite must come in lighter, not heavier, to justify the change. Target: ≤ 2400 lines including inline CSS and JS, achieved by removing the duplicated SEO aside, the masthead SVG animations (already done), and consolidating duplicated stat-card markup.

## Acceptance criteria

- `/` loads with the new layout and correct live data.
- Every widget present in the current dashboard renders and functions: stat band, distribution chart, leaderboards, find-near-me, region cards, map, salary calculator, Sydney in Coffees (all 5 categories, all 18 metrics, featured stat), methodology block, newsletter.
- All 49 existing tests pass without modification.
- `npm audit` reports 0 vulnerabilities.
- The hero H1 contains a single H1 element; the rest of the page uses H2/H3 in document order.
- WCAG AA contrast: every text colour over its background passes (manual verification via the existing `--tertiary` token; no new colour pairs introduced).
- Mobile (375px viewport): stat band, leaderboards, Sydney in Coffees collapse to 1-col; map and newsletter remain usable.
- Page weight ≤ 2400 lines.
- No regressions to existing JSON-LD; rich-result test passes for FAQPage, Dataset, WebPage.
