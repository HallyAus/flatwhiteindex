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

The bottom of `index.html` contains the runtime that hydrates the dashboard from `window.__LIVE_DATA__`. The new markup must preserve every DOM ID and class hook the JS reads or writes. The audit table below classifies each into **keep**, **rename + JS update**, or **delete** (with the JS that targets it deleted).

| ID / hook | Disposition | Notes |
|---|---|---|
| `#statAvg`, `#statCheapestPrice`, `#statCheapestName`, `#statDearestPrice`, `#statDearestName`, `#cafesCalled`, `#cafesCalledSub` | **Keep** | Stat band consumers. |
| `#statPrices`, `#statAnswerRate` | **Delete** | The 5th "Prices Collected" card is removed; corresponding JS lines deleted. |
| `#findingsSection`, `#findingsGrid` | **Delete** | Replaced editorially by hero deck + pull quotes + methodology. JS that populates `#findingsGrid` is deleted. |
| `#howItWorksSection` | **Delete** | Replaced by the inline methodology block at section 13. |
| `#tierRow`, `.tier-badge` | **Delete** | Tier semantics now live in the leaderboard colour pairs. Associated JS removed. |
| `#region-cards-1`, `#region-cards-2` | **Rename + JS update** | Merged into a single `#region-cards` container; `renderRegionCards()` updated to write to the single container. |
| Leaflet map container + `#sidebarInfo` | **Keep** | Untouched. |
| `#salaryInput`, `#salaryResult`, `#salaryMinutes`, `#salaryPerWeek`, `#salaryPerYear`, `#salaryComparison` | **Keep** | All preserved; only the card template HTML around them is restyled. |
| `#sydney-coffees` | **Keep** | Container ID preserved. The card template inside `renderSydneyCoffees()` is rewritten; everything else (data array, category map, compute function, render function) untouched. |
| Newsletter form IDs | **Keep** | Form action and validation preserved. |
| `#heroLede` | **Keep** | Selector for live-data injection of the lede sentence. The new hero deck takes its content. |
| `#heroInsight`, `#insightNumber`, `#insightText` | **Delete** | Hidden-until-JS-runs insight strip removed; the byline rule + stat band carry that role now. |
| `#updatedBadge` | **Rename + JS update** | Becomes the masthead `.nr-meta` element with the same "Updated <date>" text. JS selector updated. |

Any ID kept or renamed must round-trip through the smoke test in §Implementation strategy.

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
| 12 | Sydney in Coffees | Section rule "Sydney in coffees" + Playfair H2 + featured stat (median Sydney house, full-width dark band) + 5 categorised 2-col grids. All 22 existing entries preserved (1 featured + 21 categorised). |
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
- The 847 figure in the deck is server-injected via existing `__LIVE_DATA__.total_cafes`. Default to "hundreds of" if unset. The "23 suburbs" figure is also injected, computed client-side as `__LIVE_DATA__.suburbs.length`. If either is unavailable, the deck falls back to a non-numeric form ("every independent cafe in Sydney's suburbs").
- Byline rule replaces the previous "Live data" badge as the freshness signal.

### Stat band

Full-bleed (negative side margins to the wrap) cream band with 4 stat columns separated by dotted vertical rules. Each stat: tiny uppercase label / Playfair value / sub-text. Two values are coloured: cheapest in `--good`, dearest in `--warn`.

Drops the existing 5th "Prices Collected" card. The "Cafes called" card now shows "847" with sub "23 suburbs" — keeps the 847 visible without needing two cards for it.

### Distribution histogram

A new component. **7 bars** matching the existing 7-bucket cache shape (`$3–3.99`, `$4–4.49`, `$4.50–4.99`, `$5–5.49`, `$5.50–5.99`, `$6–6.49`, `$6.50+`). The modal bar — the bucket with the largest `count`, computed client-side — is rendered in `--ink` with an inline label above it ("$5.50 · mode" or whichever bucket wins). Annotation callout is a small cream card pinned top-right inside the chart card with a hard-left-rule in `--ink`.

X-axis labels render under each bar using the bucket's existing `label` field. To avoid crowding, every bar gets its label but visually compressed: 9px DM Sans, vertical-aligned to top, with the modal bucket's label bolded. The Sydney average ($5.80) is overlaid as a thin vertical bronze marker line crossing the bars at the interpolated x-position, with a small "avg $5.80" floating label above the chart.

Hydration: reads `__LIVE_DATA__.distribution` directly — `Array<{label: string, count: number, max: number}>`, 7 entries. The mode is computed client-side as the entry with the highest `count`. If the array is empty or undefined, the entire section is hidden (`display:none`) rather than rendering placeholders.

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

The full metric bank, preserving all 22 entries (1 featured + 21 categorised across 5 categories) from the existing `COFFEE_COMPARISONS` array in `public/index.html:1952`.

- **Featured stat** — full-width dark band (`--ink` bg, `--canvas` text, bronze sub). The featured entry is the one already flagged `featured: true` in the array — the median Sydney house comparison (`🏠 Median Sydney house price ÷ avg coffee price`). No re-featuring; consume what's there.
- **5 categories**, each with: section header (Playfair name + DM Sans count) + 2-col card grid. Categories from the existing `CATEGORY_LABELS` map: `cost` → Cost of Living (4 entries), `transport` → Getting Around (4), `experiences` → Sydney Experiences (5), `money` → Work & Money (4), `aussie` → Only in Australia (4).
- **Each metric card**: 3-col grid (icon · description + source · bold value + unit). The `compute` field (`minutes`, `annual`, `compound`, `pct_wage`) and `invert` flag continue to drive value formatting via the existing `computeCoffeeValue()` function.
- The existing `renderSydneyCoffees(avgPrice)` function (`public/index.html:1994`) is reused unchanged — only the card template HTML literal inside the function is rewritten to match the new visual. The function still groups by `category`, picks the `featured: true` entry first, and walks each category in `CATEGORY_LABELS` order.

### Pull quotes (2 instances)

Italic Playfair, 22px, 4px bronze left rule, 22px left padding, 36px vertical margin. Cite line below in 11px uppercase DM Sans.

Static editorial copy in the markup. Quote 1 sits between the chart and the leaderboard. Quote 2 sits between the region cards and the map.

### Methodology

Cream prose block (`--paper-warm` bg, 22px padding). Single paragraph with 2 inline bronze links: `/press.html` (full methodology) and `/api/dashboard` (data export — the existing JSON endpoint). Same content as the current methodology section, condensed.

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

Existing breakpoints (`public/index.html:1153-1202`) are 480px, 540px, 640px, 780px, 900px. The new layout reuses these — no new breakpoints introduced.

- **Stat band**: 4 cols at 780px+. 2 cols at 540–779px. At ≤540px, hero stat (Sydney average) spans full-width via the existing `.stat-card.hero-stat { grid-column: 1 / -1 }` fix; the 5th card (already removed) is no longer the dominant card.
- **Distribution chart**: bars stay flexible at all sizes. Annotation callout repositions to a row below the chart at ≤640px (use the 640px breakpoint).
- **Leaderboard pair**: 2 → 1 column at ≤640px.
- **Region cards**: 4 cols at 900px+. 2 cols at 540–899px. 2 cols retained at ≤540px (don't collapse to 1 — comparison value matters more than card width).
- **Sydney in Coffees**: 2 → 1 column at ≤540px. Featured stat stays full-width at all breakpoints.
- **Map**: full-width always; height reduces to 240px at ≤540px.
- **Newsletter**: 2-col → stacked at ≤780px.
- **Pull quotes**: same layout, font reduces from 22px to 18px at ≤540px.

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
4. **Visual smoke test** — open `/` locally, confirm: live data hydrates, stat band populates, distribution chart renders 7 bars with the modal bar in `--ink`, leaderboards populate, region cards render, map loads, find-near-me works, salary calc works, Sydney in Coffees renders all 22 cards (1 featured + 21 categorised across 5 categories), newsletter form submits.
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

- **JS coupling drift.** The existing index.html script reads ~30 IDs. A renamed ID without a JS update will silently break a widget. Mitigation: visual smoke test enumerates every dynamic widget; the implementation plan must explicitly map every removed ID to "kept", "renamed (with JS update)", or "deleted (with JS removal)".
- **`#findingsSection` / `#findingsGrid` and `#howItWorksSection`** are listed in the JS-must-keep-working set but the new choreography (sections 1–15) does not include them. Both currently render between the stats strip and the region cards: `findingsSection` is hidden until live data arrives and shows computed insights; `howItWorksSection` is shown when no data yet. **Decision for the plan**: drop both. The hero deck + the new pull quotes carry the editorial role that "findings" used to play, and the methodology block at section 13 replaces "how it works". The associated JS that writes to `#findingsGrid` is also deleted.
- **Tier badges (`#tierRow`, `.tier-badge`)** are listed in the JS-keep set but no choreography section mentions them. **Decision for the plan**: drop them. Tier semantics are visually encoded in the leaderboard (good/warn colour pairs on cheapest/dearest) and are no longer needed as a separate explainer row.
- **`__LIVE_DATA__.distribution` already exists** in the current cache shape. `buildDashboardCache()` (`webhook.js:502-511`) emits `distribution` as `Array<{label: string, count: number, max: number}>` keyed across **7 fixed buckets** ($3–3.99, $4–4.49, $4.50–4.99, $5–5.49, $5.50–5.99, $6–6.49, $6.50+). The new chart consumes this shape as-is. No server change required. The "mode" highlight is computed client-side as the bucket with the largest `count`.
- **Page weight.** The current index.html is ~2915 lines. The rewrite targets **≤ 2400 lines** including inline CSS and JS. The 500-line cut accounts for: duplicated SEO aside (~12 lines), masthead SVG animations (~8 lines, already done), removed `#findingsSection` + `#howItWorksSection` blocks (~110 lines markup + ~80 lines JS), removed `#tierRow` (~10 lines), removed 5th stat card and merged stat-card markup (~40 lines), consolidated region grids from two to one container (~20 lines), and CSS deduplication of duplicated style rules between the dashboard and tools sections (~250 lines). If the budget cannot be hit without compromising the design, the implementation plan must surface the overage rather than silently expanding scope.

## Acceptance criteria

- `/` loads with the new layout and correct live data.
- Every widget present in the current dashboard renders and functions: stat band, distribution chart (7 bars, modal bar highlighted), leaderboards, find-near-me, region cards, map, salary calculator, Sydney in Coffees (all 5 categories, all 22 entries — 1 featured median-house + 4 cost + 4 transport + 5 experiences + 4 money + 4 aussie), methodology block, newsletter.
- All 49 existing tests pass without modification.
- `npm audit` reports 0 vulnerabilities.
- The hero H1 contains a single H1 element; the rest of the page uses H2/H3 in document order.
- WCAG AA contrast: every text colour over its background passes (manual verification via the existing `--tertiary` token; no new colour pairs introduced).
- Mobile (375px viewport): stat band, leaderboards, Sydney in Coffees collapse to 1-col; map and newsletter remain usable.
- Page weight ≤ 2400 lines.
- No regressions to existing JSON-LD; rich-result test passes for FAQPage, Dataset, WebPage.
