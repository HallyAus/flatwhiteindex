# Landing Page Newsroom Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure `public/index.html` into a Pudding/FT-style newsroom data piece, preserving every existing widget, every JS hydration path, and the broadsheet identity.

**Architecture:** Single-file rewrite of `public/index.html` body markup + a moderate refactor of its inline `<style>` block. No server changes, no new endpoints, no new dependencies. Live data continues to arrive via `window.__LIVE_DATA__` injected by `webhook.js`. The 22-entry `COFFEE_COMPARISONS` array, the `renderSydneyCoffees()` function, the Leaflet map, the salary calculator, and the find-cheapest-near-me widget are all preserved.

**Tech Stack:** Vanilla HTML/CSS/JS in a single file. No build step. Self-hosted Playfair Display + DM Sans (`fonts.css`). Leaflet for the map. Node 20+ test runner for the existing 49 unit tests (regression gate only — no UI tests).

**Spec:** `docs/superpowers/specs/2026-05-15-landing-newsroom-overhaul-design.md`

---

## Pre-flight

Read the spec end-to-end. The ID disposition table (§Architecture) is the contract — every existing JS hook is classified **Keep**, **Rename + JS update**, or **Delete**. Deviating from that table is the most likely source of silent regressions.

The page-weight target is **≤ 2400 lines** (current is 2915). The Risks section in the spec accounts for the 500-line cut line by line. Track the line count after every task.

The 49 existing tests are unit tests on pure JS modules; they don't exercise the markup. Run them after every commit as a regression gate, not as a feature test. Visual smoke testing is via `node webhook.js` + `curl -s http://localhost:3001/ | grep -c '<id-or-class>'` and a manual browser pass.

---

## Task 1: Foundation — CSS scaffold + masthead + hero + stat band

**Files:**
- Modify: `public/index.html` (head `<style>`, body masthead/hero/stat-band markup, bottom `<script>` for `#updatedBadge` rename)

**Goal:** New CSS tokens-of-art (section-rule, hero-h, hero-deck, hero-byline, stat-band variants) added; masthead, hero, and stat band sections rewritten; `#updatedBadge` renamed to `.nr-meta` with JS updated; `#statPrices` and `#statAnswerRate` deleted along with their JS lines; `#heroInsight*` deleted along with its JS; `#heroLede` retained.

- [ ] **Step 1.1: Snapshot baseline metrics**

Run:
```bash
wc -l public/index.html
grep -c "^.*$" public/index.html
git rev-parse HEAD
```
Record both numbers in your scratch notes — they're the "before" of the page-weight check at the end. Should be ~2915 lines.

- [ ] **Step 1.2: Verify the live-data injection contract still holds**

Run:
```bash
grep -n "window\.__LIVE_DATA__" public/index.html webhook.js
grep -n "buildDashboardCache" webhook.js | head
```
Confirm the script reads `__LIVE_DATA__.suburbs`, `__LIVE_DATA__.avg_price`, `__LIVE_DATA__.distribution`, `__LIVE_DATA__.total_cafes`. If any are missing from the cache shape at `webhook.js:529-538`, stop and surface to the user.

- [ ] **Step 1.3: Add new CSS classes** (additive — does not break existing rules)

Locate the `<style>` block in `public/index.html` (begins around line 30 inside `<head>`). After the existing `:root` block but before any media queries, append the new CSS for the section-rule + hero + stat-band-v2 + a few utility classes. Keep all class names prefixed `.nr-` to avoid colliding with existing rules during the transition.

```css
/* ===== Newsroom overhaul — additive scaffold ===== */
.nr-rule {
  font-size: 10px;
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: 600;
  margin: 30px 0 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.nr-rule::before {
  content: '';
  display: inline-block;
  width: 18px;
  height: 1px;
  background: var(--accent);
}
.nr-hero { padding: 28px 0 16px; }
.nr-hero-h {
  font-family: 'Playfair Display', Georgia, serif;
  font-weight: 700;
  font-size: clamp(28px, 5vw, 42px);
  line-height: 1.08;
  letter-spacing: -0.015em;
  color: var(--ink);
}
.nr-hero-h em { font-style: normal; color: var(--accent); }
.nr-hero-deck {
  font-size: clamp(15px, 2vw, 17px);
  color: var(--ink-soft);
  margin-top: 12px;
  line-height: 1.5;
  max-width: 580px;
}
.nr-hero-byline {
  font-size: 11px;
  color: var(--secondary);
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--rule);
}
.nr-band {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  margin: 18px calc(50% - 50vw) 0;
  padding: 14px clamp(16px, 5vw, 36px);
  background: var(--paper-warm);
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
  max-width: 100vw;
}
.nr-band-stat { padding: 0 14px; border-right: 1px dotted #C9BFAD; }
.nr-band-stat:last-child { border-right: none; }
.nr-band-l {
  font-size: 9px;
  color: var(--secondary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
}
.nr-band-v {
  font-family: 'Playfair Display', Georgia, serif;
  font-weight: 700;
  font-size: clamp(20px, 3vw, 24px);
  line-height: 1.1;
  margin-top: 2px;
  color: var(--ink);
}
.nr-band-v.good { color: var(--good); }
.nr-band-v.warn { color: var(--warn); }
.nr-band-s { font-size: 10px; color: var(--secondary); margin-top: 2px; }
.nr-meta {
  font-size: 11px;
  color: var(--secondary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
@media (max-width: 780px) {
  .nr-band { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 540px) {
  .nr-band-stat:first-child { grid-column: 1 / -1; border-right: none; padding-bottom: 8px; border-bottom: 1px dotted #C9BFAD; margin-bottom: 8px; }
  .nr-band-stat { border-right: none; }
}
```

- [ ] **Step 1.4: Verify the page still serves**

Run:
```bash
node --check webhook.js
node webhook.js &
SERVER_PID=$!
sleep 2
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:${PORT:-3001}/
kill $SERVER_PID
```
Expected: `200`. The CSS additions are inert until referenced — page must still render.

- [ ] **Step 1.5: Replace masthead markup**

Locate the existing masthead (search for `<header class="masthead">`, currently around line 1457). Replace the whole `<header>…</header>` block with:

```html
<header class="masthead">
  <div class="masthead-brand">
    <svg class="masthead-icon" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <!-- KEEP THE EXISTING SVG INTERIOR — animations already stripped — paste the full <ellipse>/<path>/<circle> children here verbatim from the prior masthead -->
    </svg>
    <div>
      <h1>Flat White Index<span class="sr-only"> — Sydney coffee prices by suburb, updated 2026</span></h1>
      <div class="masthead-tagline">Sydney Coffee Price Guide &middot; 2026</div>
    </div>
  </div>
  <div class="nr-meta" id="updatedBadge">Live data</div>
</header>
```

The `<svg>` interior must be copied verbatim from the existing markup — do not retype it. The `id="updatedBadge"` is preserved on a new element with class `nr-meta` so the existing JS that writes "Updated <date>" into it keeps working.

- [ ] **Step 1.6: Replace hero + stat band + delete the duplicated SEO aside**

Locate the existing `<section class="hero">` and the `<section class="stats-row">` blocks (currently lines ~1513–1563), and the `<section class="seo-answer">` between them (~1526–1532). Replace all three (and the tier-row / how-it-works section if they sit in between) with:

```html
<!-- ================================================================
     HERO — answer-led editorial
     ================================================================ -->
<div class="nr-hero">
  <div class="nr-rule">The Sydney Coffee Report &middot; 2026</div>
  <h2 class="nr-hero-h">The cost of a coffee in Sydney, <em>suburb by suburb</em>.</h2>
  <p class="nr-hero-deck" id="heroLede">We rang every independent cafe in Sydney's suburbs and asked the same question: how much for a regular flat white? Here is what they said.</p>
  <div class="nr-hero-byline">By Flat White Index &middot; Live data from cafe phone calls &middot; CC&nbsp;BY&nbsp;4.0</div>
</div>

<!-- ================================================================
     STAT BAND — 4-up cream band, full-bleed
     ================================================================ -->
<section class="nr-band" aria-label="Key statistics">
  <div class="nr-band-stat">
    <div class="nr-band-l">Sydney average</div>
    <div class="nr-band-v" id="statAvg" aria-label="Sydney average flat white price">&mdash;</div>
    <div class="nr-band-s">flat white, regular</div>
  </div>
  <div class="nr-band-stat">
    <div class="nr-band-l">Cheapest suburb</div>
    <div class="nr-band-v good" id="statCheapestPrice">&mdash;</div>
    <div class="nr-band-s" id="statCheapestName">awaiting calls</div>
  </div>
  <div class="nr-band-stat">
    <div class="nr-band-l">Most expensive</div>
    <div class="nr-band-v warn" id="statDearestPrice">&mdash;</div>
    <div class="nr-band-s" id="statDearestName">awaiting calls</div>
  </div>
  <div class="nr-band-stat">
    <div class="nr-band-l">Cafes called</div>
    <div class="nr-band-v" id="cafesCalled">0</div>
    <div class="nr-band-s" id="cafesCalledSub">independent cafes</div>
  </div>
</section>
```

Note: `<h2>` not `<h1>` for the hero headline — the masthead `<h1>` (`Flat White Index`) is the one and only H1 on the page, per a11y. `id="heroLede"` is kept so the existing JS that overwrites it on data load still works. The `aria-label` on `#statAvg` is updated dynamically by the JS once the price loads (deferred to step 1.9).

- [ ] **Step 1.7: Update the JS to inject the deck text with live counts**

Find the JS that writes the hero copy (search for `heroLede` in the script block near the bottom). Replace the existing assignment with:

```js
const lede = document.getElementById('heroLede');
if (lede) {
  const total = window.__LIVE_DATA__?.total_cafes;
  const subs = window.__LIVE_DATA__?.suburbs?.length;
  if (total && subs) {
    lede.textContent = `We rang every independent cafe in ${subs} Sydney suburbs and asked the same question: how much for a regular flat white? Here is what ${total} of them said.`;
  }
  // else leave the static fallback already in markup
}
```

- [ ] **Step 1.8: Update the JS for `#updatedBadge`**

Search for `updatedBadge` in the script. The existing handler writes "Updated <date>" into a `.updated-badge` element; the element now has class `nr-meta` but the same ID. Confirm the JS uses `getElementById('updatedBadge')` (most likely already does) — if it uses a class selector like `.updated-badge`, change it to `getElementById('updatedBadge')`.

- [ ] **Step 1.9: Update the JS that writes `#statAvg` to also set its aria-label**

Find the assignment to `statAvg.textContent`. Add an aria-label set:

```js
const avg = window.__LIVE_DATA__?.avg_price;
if (statAvg && avg) {
  statAvg.textContent = `$${avg.toFixed(2)}`;
  statAvg.setAttribute('aria-label', `Sydney average flat white price ${avg.toFixed(2)} dollars`);
}
```

- [ ] **Step 1.10: Delete `#statPrices`, `#statAnswerRate`, `#heroInsight*`, `#tierRow` JS**

Grep for each ID in the JS:
```bash
grep -n "statPrices\|statAnswerRate\|heroInsight\|insightNumber\|insightText\|tierRow" public/index.html
```
Delete every line of JS that reads or writes them. Markup for these IDs has already been removed in step 1.6 (any `<div id="tierRow">` block, the `.tier-row`, and the `<div class="hero-insight">` block).

- [ ] **Step 1.11: Verify the page still serves and stat band populates**

Run:
```bash
node --check webhook.js
node webhook.js &
SERVER_PID=$!
sleep 2
curl -s http://localhost:${PORT:-3001}/ | grep -E 'id="(statAvg|statCheapestPrice|statDearestPrice|cafesCalled|heroLede|updatedBadge)"' | wc -l
kill $SERVER_PID
```
Expected: `6` (one match per required ID). Then open the page in a browser, confirm: masthead loads, hero headline reads "The cost of a coffee in Sydney…", stat band shows 4 columns, "Updated …" badge populates.

- [ ] **Step 1.12: Run the regression test suite**

Run: `npm test`
Expected: `49 pass, 0 fail`. (Tests are JS-only; markup changes shouldn't affect them, but run as a sanity check.)

- [ ] **Step 1.13: Commit**

```bash
git add public/index.html
git commit -m "feat(landing): newsroom hero + stat band + masthead

Phase 1 of the landing-page overhaul. New CSS scaffold (.nr-rule, .nr-hero,
.nr-band) added additively. Masthead, hero, and stat band rewritten in
newsroom format: section rule + Playfair H2 with bronze em + 1-line deck +
byline rule. Stat band collapses 5 cards to 4 (Prices Collected dropped) and
goes full-bleed with a cream background.

Removed:
- The duplicated SEO answer aside (now redundant with the new hero deck)
- #statPrices / #statAnswerRate (the 5th stat card)
- #heroInsight / #insightNumber / #insightText (display:none until JS — replaced by static deck + byline)
- #tierRow markup and JS (tier semantics now visual via leaderboard colour pairs)

JS updates:
- #updatedBadge selector preserved on the new .nr-meta element
- #heroLede now hydrates with total_cafes + suburbs.length from __LIVE_DATA__
- #statAvg gains an aria-label with the spelled-out price"
```

---

## Task 2: Distribution histogram + leaderboard pair + pull quote 1

**Files:**
- Modify: `public/index.html` (CSS for chart + leaderboard + pull-quote, markup between stat band and the tools section, hydration JS for the chart and leaderboards)

**Goal:** New distribution histogram component (7 bars from `__LIVE_DATA__.distribution`, modal bar in `--ink`) added below the stat band. Cheapest 5 / Dearest 5 leaderboard pair sourced from `__LIVE_DATA__.suburbs`. Pull quote 1 between them.

- [ ] **Step 2.1: Add the chart + leaderboard + pull-quote CSS**

Append to the same `<style>` block:

```css
.nr-chart-h {
  font-family: 'Playfair Display', Georgia, serif;
  font-weight: 700;
  font-size: clamp(20px, 3vw, 24px);
  line-height: 1.2;
  margin-top: 4px;
}
.nr-chart-sub {
  font-size: 13px;
  color: var(--ink-soft);
  margin: 4px 0 18px;
}
.nr-chart {
  background: #FFFCF6;
  border: 1px solid var(--rule);
  border-radius: 4px;
  padding: 18px 16px 32px;
  position: relative;
}
.nr-chart-bars {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 130px;
}
.nr-chart-bar {
  flex: 1;
  background: var(--accent);
  opacity: 0.85;
  border-radius: 2px 2px 0 0;
  position: relative;
  min-height: 2px;
}
.nr-chart-bar.mode { background: var(--ink); opacity: 1; }
.nr-chart-bar .lbl {
  position: absolute;
  top: -16px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 9px;
  color: var(--ink);
  font-weight: 700;
  white-space: nowrap;
}
.nr-chart-axis { display: flex; gap: 4px; margin-top: 8px; }
.nr-chart-axis .t {
  flex: 1;
  text-align: center;
  font-size: 9px;
  color: var(--secondary);
  line-height: 1.3;
}
.nr-chart-axis .t.mode { color: var(--ink); font-weight: 700; }
.nr-chart-callout {
  position: absolute;
  top: 18px;
  right: 16px;
  max-width: 180px;
  font-size: 11px;
  color: var(--ink-soft);
  line-height: 1.4;
  padding: 10px 12px;
  background: var(--paper-warm);
  border-left: 3px solid var(--ink);
  border-radius: 0 3px 3px 0;
}
@media (max-width: 640px) {
  .nr-chart-callout {
    position: static;
    max-width: none;
    margin-top: 14px;
  }
}
.nr-pull {
  font-family: 'Playfair Display', Georgia, serif;
  font-style: italic;
  font-size: clamp(18px, 2.5vw, 22px);
  line-height: 1.35;
  color: var(--ink);
  padding: 20px 0 20px 22px;
  border-left: 4px solid var(--accent);
  margin: 36px 0;
  max-width: 600px;
}
.nr-pull cite {
  display: block;
  font-family: 'DM Sans', sans-serif;
  font-style: normal;
  font-size: 11px;
  color: var(--secondary);
  margin-top: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.nr-pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
  margin-top: 16px;
}
@media (max-width: 640px) {
  .nr-pair { grid-template-columns: 1fr; gap: 16px; }
}
.nr-col h4 {
  font-family: 'Playfair Display', Georgia, serif;
  font-weight: 700;
  font-size: 16px;
  margin-bottom: 10px;
}
.nr-row {
  display: grid;
  grid-template-columns: 22px 1fr 70px;
  align-items: center;
  gap: 10px;
  padding: 9px 0;
  border-bottom: 1px dotted #D8CCB8;
  font-size: 13px;
}
.nr-row .rank {
  font-family: 'Playfair Display', Georgia, serif;
  font-weight: 700;
  color: var(--accent);
  font-size: 14px;
}
.nr-row .price { text-align: right; font-weight: 700; font-size: 15px; }
.nr-row .price.good { color: var(--good); }
.nr-row .price.warn { color: var(--warn); }
.nr-row .name small {
  color: var(--secondary);
  font-size: 11px;
  display: block;
  margin-top: 1px;
}
```

- [ ] **Step 2.2: Add markup for chart + pull quote 1 + leaderboard pair**

Insert immediately after the closing `</section>` of the stat band, before the existing region cards block:

```html
<!-- ================================================================
     DISTRIBUTION HISTOGRAM
     ================================================================ -->
<section class="nr-section" id="distributionSection" style="display:none;">
  <div class="nr-rule">The shape of the data</div>
  <h2 class="nr-chart-h">Most Sydney cafes price between $5 and $6.</h2>
  <p class="nr-chart-sub">Histogram of every flat white price collected. The mode is highlighted.</p>
  <div class="nr-chart">
    <div class="nr-chart-bars" id="distBars"></div>
    <div class="nr-chart-axis" id="distAxis"></div>
    <div class="nr-chart-callout" id="distCallout"></div>
  </div>
</section>

<!-- ================================================================
     PULL QUOTE 1
     ================================================================ -->
<blockquote class="nr-pull">
  The Sydney middle is $5.50. But $7 cafes now appear in six suburbs &mdash; none more than 15 minutes from the harbour.
  <cite>Finding</cite>
</blockquote>

<!-- ================================================================
     LEADERBOARD PAIR — cheapest / dearest 5
     ================================================================ -->
<section class="nr-section">
  <div class="nr-rule">The extremes</div>
  <h2 class="nr-chart-h">Where it's cheap, and where it's not.</h2>
  <div class="nr-pair">
    <div class="nr-col">
      <h4>Cheapest five suburbs</h4>
      <div id="leaderCheap"></div>
    </div>
    <div class="nr-col">
      <h4>Dearest five suburbs</h4>
      <div id="leaderDear"></div>
    </div>
  </div>
</section>
```

- [ ] **Step 2.3: Add the JS hydration for the chart**

Inside the existing JS block (after `__LIVE_DATA__` is read, alongside the other render functions), add:

```js
function renderDistribution(distribution) {
  const section = document.getElementById('distributionSection');
  if (!section || !Array.isArray(distribution) || distribution.length === 0) return;
  const totalCount = distribution.reduce((sum, b) => sum + b.count, 0);
  if (totalCount === 0) return;
  const modeIdx = distribution.reduce((best, b, i, arr) => b.count > arr[best].count ? i : best, 0);
  const max = Math.max(...distribution.map(b => b.count), 1);
  const bars = distribution.map((b, i) => {
    const h = (b.count / max) * 100;
    const isMode = i === modeIdx;
    return `<div class="nr-chart-bar${isMode ? ' mode' : ''}" style="height:${h.toFixed(1)}%" title="${b.label}: ${b.count} cafes">${isMode ? `<span class="lbl">${b.label} &middot; mode</span>` : ''}</div>`;
  }).join('');
  const axis = distribution.map((b, i) => `<div class="t${i === modeIdx ? ' mode' : ''}">${b.label}</div>`).join('');
  document.getElementById('distBars').innerHTML = bars;
  document.getElementById('distAxis').innerHTML = axis;
  const modePct = ((distribution[modeIdx].count / totalCount) * 100).toFixed(0);
  document.getElementById('distCallout').innerHTML = `<strong>${distribution[modeIdx].count}</strong> cafes (${modePct}%) price in the <strong>${distribution[modeIdx].label}</strong> band — the most common bracket.`;
  section.style.display = '';
}
```

Then, in the existing init/hydrate sequence (search for where other render functions are called after `__LIVE_DATA__` is read), add:

```js
renderDistribution(window.__LIVE_DATA__?.distribution);
```

- [ ] **Step 2.4: Add the JS hydration for the leaderboards**

Add to the same JS block:

```js
function renderLeaderboards(suburbs) {
  if (!Array.isArray(suburbs) || suburbs.length === 0) return;
  const withPrice = suburbs.filter(s => s.avg != null && s.suburb !== 'Unknown');
  const cheap = [...withPrice].sort((a, b) => a.avg - b.avg).slice(0, 5);
  const dear = [...withPrice].sort((a, b) => b.avg - a.avg).slice(0, 5);
  const row = (s, i, kind) => `
    <div class="nr-row">
      <span class="rank">${i + 1}</span>
      <span class="name">${s.suburb}<small>${s.count || s.cafes_called || 0} cafes</small></span>
      <span class="price ${kind}">$${s.avg.toFixed(2)}</span>
    </div>`;
  document.getElementById('leaderCheap').innerHTML = cheap.map((s, i) => row(s, i, 'good')).join('');
  document.getElementById('leaderDear').innerHTML = dear.map((s, i) => row(s, i, 'warn')).join('');
}
```

And call it during init:
```js
renderLeaderboards(window.__LIVE_DATA__?.suburbs);
```

Note: the `count` field name on the suburbs entries may be `count` or `cafes_called` — the row template handles both. Confirm by inspecting the live JSON at `/api/dashboard` if unsure.

- [ ] **Step 2.5: Smoke test**

Run:
```bash
node webhook.js &
SERVER_PID=$!
sleep 2
HTML=$(curl -s http://localhost:${PORT:-3001}/)
echo "$HTML" | grep -c 'id="distributionSection"'
echo "$HTML" | grep -c 'id="leaderCheap"'
echo "$HTML" | grep -c 'id="leaderDear"'
echo "$HTML" | grep -c 'class="nr-pull"'
kill $SERVER_PID
```
Expected: `1 1 1 1`. Then open the page in a browser. Confirm: 7 bars render with one in dark ink, axis labels appear under each bar, leaderboards populate with 5 rows each, pull quote sits between them in italic Playfair.

- [ ] **Step 2.6: Run regression suite**

Run: `npm test`
Expected: `49 pass, 0 fail`.

- [ ] **Step 2.7: Commit**

```bash
git add public/index.html
git commit -m "feat(landing): distribution histogram + leaderboard pair + pull quote

Phase 2: data-shape centerpiece + cheapest/dearest leaderboards. Histogram
consumes the existing __LIVE_DATA__.distribution shape (7 buckets, no server
change), computes the mode client-side, renders the modal bar in --ink with
an inline label, and emits a callout with the bracket share. Leaderboards
sort __LIVE_DATA__.suburbs ascending/descending and show top 5 each with
sample sizes. Pull quote 1 sits between."
```

---

## Task 3: Find-near-me + region cards + pull quote 2 + map

**Files:**
- Modify: `public/index.html` (CSS for `.nr-widget` and `.nr-regions`, restructure of the find-near-me + region-cards + map markup, JS update to merge `#region-cards-1` + `#region-cards-2` into `#region-cards`)

**Goal:** Restyle the find-cheapest-near-me widget into a horizontal `.nr-widget` card. Merge the two region-card containers into one. Add pull quote 2 between regions and map. Restyle map's surrounding shell.

- [ ] **Step 3.1: Add the widget + region-card CSS**

Append:

```css
.nr-widget {
  background: #FFFCF6;
  border: 1px solid var(--rule);
  border-radius: 4px;
  padding: 22px 24px;
  margin-top: 14px;
}
.nr-widget h4 {
  font-family: 'Playfair Display', Georgia, serif;
  font-weight: 700;
  font-size: 17px;
}
.nr-widget p {
  font-size: 13px;
  color: var(--ink-soft);
  margin-top: 4px;
}
.nr-widget .ctl {
  display: flex;
  gap: 10px;
  margin-top: 14px;
  align-items: center;
  flex-wrap: wrap;
}
.nr-widget .ctl input,
.nr-widget .ctl select {
  padding: 8px 12px;
  border: 1px solid #D8CCB8;
  border-radius: 4px;
  font-size: 13px;
  background: var(--canvas);
  font-family: inherit;
}
.nr-widget .ctl button {
  padding: 8px 18px;
  background: var(--ink);
  color: var(--canvas);
  border: none;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.nr-widget .ctl button:hover { background: #2A2018; }
.nr-widget .result {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dotted #D8CCB8;
  font-size: 13px;
}
.nr-widget .result strong {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 17px;
  color: var(--accent);
}
.nr-regions {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-top: 16px;
}
.nr-rcard {
  background: #FFFCF6;
  border: 1px solid var(--rule);
  border-radius: 4px;
  padding: 12px;
}
.nr-rcard .rn {
  font-size: 11px;
  color: var(--secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
}
.nr-rcard .rv {
  font-family: 'Playfair Display', Georgia, serif;
  font-weight: 700;
  font-size: 18px;
  margin-top: 4px;
}
.nr-rcard .rs { font-size: 10px; color: var(--secondary); margin-top: 2px; }
@media (max-width: 900px) {
  .nr-regions { grid-template-columns: repeat(2, 1fr); }
}
```

- [ ] **Step 3.2: Replace find-near-me, region cards, and map markup**

Locate the existing `find-suburb` widget, the two `region-grid` containers (`#region-cards-1` and `#region-cards-2`), and the map block. Replace with:

```html
<!-- ================================================================
     FIND CHEAPEST NEAR ME
     ================================================================ -->
<section class="nr-section">
  <div class="nr-rule">For you</div>
  <h2 class="nr-chart-h">Find the cheapest flat white near you.</h2>
  <div class="nr-widget" id="findNearMe">
    <p>Use your location and we'll surface the cheapest cafes within walking distance.</p>
    <div class="ctl">
      <button id="findNearMeBtn" type="button">Use my location</button>
      <span style="font-size:12px;color:var(--secondary)">&mdash; or &mdash;</span>
      <input id="findSuburbInput" placeholder="Postcode or suburb" style="flex:1;min-width:160px;">
      <button id="findSuburbBtn" type="button">Find</button>
    </div>
    <div class="result" id="findResult" style="display:none;"></div>
  </div>
</section>

<!-- ================================================================
     REGION CARDS — single merged container
     ================================================================ -->
<section class="nr-section">
  <div class="nr-rule">By region</div>
  <h2 class="nr-chart-h">Eight Sydney regions, one number each.</h2>
  <div class="nr-regions" id="region-cards" role="region" aria-label="Regional price comparison"></div>
</section>

<!-- ================================================================
     PULL QUOTE 2
     ================================================================ -->
<blockquote class="nr-pull">
  Inner-west cafes pay less rent and source from specialty roasters who price the bean lower than chain wholesalers. That's why a $5 flat white still exists in 2026.
  <cite>Why prices vary &middot; methodology</cite>
</blockquote>

<!-- ================================================================
     MAP
     ================================================================ -->
<section class="nr-section" id="mapSection">
  <div class="nr-rule">Explore</div>
  <h2 class="nr-chart-h">Tap a cafe. Compare a street.</h2>
  <p class="nr-chart-sub">Every cafe surveyed is pinned. Click any pin for the price and the call transcript.</p>
  <!-- KEEP THE EXISTING LEAFLET CONTAINER + SIDEBAR MARKUP — paste verbatim from the prior map block, retaining role="application" and #sidebarInfo -->
</section>
```

The map's Leaflet container and its sidebar (`#sidebarInfo`, `aria-label`, `role="application"`) must be pasted verbatim from the prior block — do not retype.

- [ ] **Step 3.3: Update the renderRegionCards JS**

Search for `renderRegionCards` (or whatever function populates `#region-cards-1`/`#region-cards-2`). Replace the two-container split with a single one:

```js
function renderRegionCards(regions) {
  const el = document.getElementById('region-cards');
  if (!el || !Array.isArray(regions)) return;
  el.innerHTML = regions.map(r => `
    <div class="nr-rcard">
      <div class="rn">${r.name}</div>
      <div class="rv">${r.avg != null ? '$' + r.avg.toFixed(2) : '&mdash;'}</div>
      <div class="rs">${r.suburb_count || 0} suburbs &middot; ${r.cafe_count || 0} cafes</div>
    </div>
  `).join('');
}
```

Confirm the data shape used here matches what the existing function consumed — if the existing code groups suburbs into regions client-side via `__REGION_CONFIG__`, that grouping logic stays; only the output template changes.

- [ ] **Step 3.4: Wire up find-near-me handlers**

The existing JS contains a `findNearMe()` or similar handler that uses `navigator.geolocation`. The IDs in the new markup (`findNearMeBtn`, `findSuburbInput`, `findSuburbBtn`, `findResult`) match the conventional pattern but verify against the prior code. If the IDs differed, either rename in the JS to match or rename in the new markup. Wire up:

```js
document.getElementById('findNearMeBtn')?.addEventListener('click', findCheapestNearMe);
document.getElementById('findSuburbBtn')?.addEventListener('click', findBySuburb);
```

Result writes go to `#findResult` (with `style.display = ''` to reveal).

- [ ] **Step 3.5: Smoke test**

```bash
node webhook.js &
SERVER_PID=$!
sleep 2
HTML=$(curl -s http://localhost:${PORT:-3001}/)
echo "$HTML" | grep -c 'id="region-cards"'
echo "$HTML" | grep -c 'id="region-cards-1\|region-cards-2"'
echo "$HTML" | grep -c 'id="findNearMe"'
echo "$HTML" | grep -c 'id="mapSection"'
kill $SERVER_PID
```
Expected: `1 0 1 1`. The 0 confirms the old container IDs are gone. Then in browser: confirm region cards render in 4-col grid with all 8 regions, find-near-me widget renders horizontally, pull quote 2 sits between regions and map, map loads.

- [ ] **Step 3.6: Run regression suite**

Run: `npm test`
Expected: `49 pass, 0 fail`.

- [ ] **Step 3.7: Commit**

```bash
git add public/index.html
git commit -m "feat(landing): find-near-me + merged regions + pull quote 2 + map shell

Phase 3. Find-near-me widget restyled as horizontal .nr-widget card.
#region-cards-1 + #region-cards-2 merged into a single #region-cards
container; renderRegionCards() updated to write to one element. Pull quote 2
between regions and map. Map section gets the newsroom shell (section rule +
Playfair H2 + sub) but the Leaflet container, sidebar, role=application, and
all map JS are untouched."
```

---

## Task 4: Salary calc + Sydney in Coffees + methodology + newsletter + footer

**Files:**
- Modify: `public/index.html` (CSS for `.nr-coffees` + `.nr-cf` + `.nr-method` + `.nr-nl` + `.nr-foot`, restyled salary calculator, rewritten Sydney in Coffees card template inside `renderSydneyCoffees()`, methodology + newsletter + footer markup)

**Goal:** Restyle salary calculator. Rewrite the Sydney in Coffees card template to the newsroom card design while preserving all 22 entries and the existing render function. Add methodology block, dark newsletter band, and footer.

- [ ] **Step 4.1: Add CSS for Sydney in Coffees + methodology + newsletter + footer**

Append:

```css
.nr-cat {
  font-family: 'Playfair Display', Georgia, serif;
  font-weight: 700;
  font-size: 14px;
  margin: 22px 0 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--rule);
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.nr-cat-count {
  font-family: 'DM Sans', sans-serif;
  font-weight: 400;
  font-size: 11px;
  color: var(--secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.nr-coffees {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px 14px;
}
@media (max-width: 540px) {
  .nr-coffees { grid-template-columns: 1fr; }
}
.nr-cf {
  display: grid;
  grid-template-columns: 28px 1fr auto;
  gap: 10px;
  padding: 10px 12px;
  background: #FFFCF6;
  border: 1px solid var(--rule);
  border-radius: 4px;
  align-items: center;
}
.nr-cf .icon { font-size: 18px; line-height: 1; }
.nr-cf .desc { font-size: 12px; line-height: 1.35; color: var(--ink-soft); }
.nr-cf .desc small {
  color: var(--tertiary);
  font-size: 10px;
  display: block;
  margin-top: 1px;
}
.nr-cf .val {
  font-family: 'Playfair Display', Georgia, serif;
  font-weight: 700;
  font-size: 17px;
  color: var(--ink);
  text-align: right;
  line-height: 1;
}
.nr-cf .val small {
  font-family: 'DM Sans', sans-serif;
  font-weight: 400;
  font-size: 9px;
  color: var(--secondary);
  display: block;
  margin-top: 2px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.nr-cf-feat {
  grid-column: 1 / -1;
  background: var(--ink);
  color: var(--canvas);
  border-color: var(--ink);
  padding: 16px 18px;
}
.nr-cf-feat .desc { color: var(--rule); font-size: 13px; }
.nr-cf-feat .val { color: var(--canvas); font-size: 24px; }
.nr-cf-feat .val small { color: var(--accent); }
.nr-method {
  background: var(--paper-warm);
  padding: 22px 26px;
  border-radius: 4px;
  margin-top: 14px;
  font-size: 13px;
  line-height: 1.65;
  color: var(--ink-soft);
}
.nr-method strong { color: var(--ink); }
.nr-nl {
  background: var(--ink);
  color: var(--paper-warm);
  padding: 26px 28px;
  border-radius: 4px;
  margin-top: 14px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 16px;
  align-items: center;
}
.nr-nl h4 {
  font-family: 'Playfair Display', Georgia, serif;
  font-weight: 700;
  font-size: 18px;
  color: var(--canvas);
}
.nr-nl p { font-size: 12px; opacity: 0.7; margin-top: 4px; }
.nr-nl form { display: flex; gap: 8px; }
.nr-nl input {
  padding: 9px 12px;
  border: 1px solid var(--ink-soft);
  background: #2A2018;
  color: var(--canvas);
  border-radius: 4px;
  font-size: 13px;
  min-width: 200px;
  font-family: inherit;
}
.nr-nl button {
  padding: 9px 16px;
  background: var(--accent);
  color: var(--canvas);
  border: none;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
@media (max-width: 780px) {
  .nr-nl { grid-template-columns: 1fr; }
  .nr-nl form { flex-direction: column; }
  .nr-nl input { min-width: 0; }
}
.nr-foot {
  padding: 24px 0 30px;
  margin-top: 32px;
  border-top: 1px solid var(--rule);
  font-size: 11px;
  color: var(--secondary);
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}
.nr-foot a { color: var(--accent); text-decoration: none; }
.nr-foot a:hover { text-decoration: underline; }
```

- [ ] **Step 4.2: Restyle the salary calculator markup**

Locate the existing salary calculator block (search for `salary-calc` or `salaryInput`). Replace the surrounding shell with the newsroom widget — keeping all the inner IDs (`salaryInput`, `salaryResult`, `salaryMinutes`, `salaryPerWeek`, `salaryPerYear`, `salaryComparison`):

```html
<section class="nr-section">
  <div class="nr-rule">In context</div>
  <h2 class="nr-chart-h">How much of your day does one flat white cost?</h2>
  <div class="nr-widget">
    <p>Enter your annual salary; we'll tell you the minutes-of-work-per-coffee, the weekly cost of a daily habit, and the annual total.</p>
    <div class="ctl">
      <span style="font-size:13px;color:var(--ink-soft)">Annual salary (AUD)</span>
      <input type="number" id="salaryInput" placeholder="85000" step="1000" min="20000" max="500000" inputmode="numeric" style="width:140px;">
      <button onclick="calcSalary()" type="button">Calculate</button>
    </div>
    <div class="result" id="salaryResult" style="display:none;">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;">
        <div>
          <div style="font-family:'Playfair Display',serif;font-size:24px;font-weight:700;color:var(--ink);" id="salaryMinutes">&mdash;</div>
          <div style="font-size:11px;color:var(--secondary);">minutes of work<br>per flat white</div>
        </div>
        <div>
          <div style="font-family:'Playfair Display',serif;font-size:24px;font-weight:700;color:var(--accent);" id="salaryPerWeek">&mdash;</div>
          <div style="font-size:11px;color:var(--secondary);">per week<br>(1/day)</div>
        </div>
        <div>
          <div style="font-family:'Playfair Display',serif;font-size:24px;font-weight:700;color:var(--accent);" id="salaryPerYear">&mdash;</div>
          <div style="font-size:11px;color:var(--secondary);">per year<br>(5 days/week)</div>
        </div>
      </div>
      <div style="font-size:12px;color:var(--secondary);margin-top:12px;" id="salaryComparison"></div>
    </div>
  </div>
</section>
```

The existing `calcSalary()` function (search for `function calcSalary`) is kept verbatim — only the IDs it writes to are repositioned.

- [ ] **Step 4.3: Rewrite the Sydney in Coffees card template**

Locate `function renderSydneyCoffees(avgPrice)` (~line 1994 in the original). The function structure is preserved — only the template literal that builds each card is rewritten. Find the `let html = ` and the per-card render inside the function, replacing the card template with:

For the **featured** entry (`featured: true`):
```js
html += `
  <div class="nr-coffees" style="grid-template-columns:1fr">
    <div class="nr-cf nr-cf-feat">
      <div class="icon" style="font-size:24px">${featured.icon}</div>
      <div class="desc">${featured.desc}<small>${featured.source}</small></div>
      <div class="val">${computeCoffeeValue(featured, avgPrice)}<small>${featured.unit}</small></div>
    </div>
  </div>`;
```

For each **category**:
```js
const items = grouped[catKey] || [];
if (items.length === 0) return;
html += `<div class="nr-cat">${CATEGORY_LABELS[catKey]}<span class="nr-cat-count">${items.length} metrics</span></div>`;
html += `<div class="nr-coffees">`;
for (const item of items) {
  html += `
    <div class="nr-cf">
      <div class="icon">${item.icon}</div>
      <div class="desc">${item.desc}<small>${item.source}</small></div>
      <div class="val">${computeCoffeeValue(item, avgPrice)}<small>${item.unit}</small></div>
    </div>`;
}
html += `</div>`;
```

Preserve the section header at the top of the function:
```js
let html = `
  <div class="nr-rule">Sydney in coffees</div>
  <h2 class="nr-chart-h">What else does $${avgPrice.toFixed(2)} buy?</h2>
  <p class="nr-chart-sub">Every Sydney expense, expressed in flat whites. Live numbers, real sources.</p>
`;
```

The function continues to walk `CATEGORY_LABELS` in declared order (cost, transport, experiences, money, aussie). Do not reorder.

- [ ] **Step 4.4: Add methodology + newsletter + footer markup**

After the Sydney in Coffees container, before the closing `</body>`:

```html
<!-- ================================================================
     METHODOLOGY
     ================================================================ -->
<section class="nr-section">
  <div class="nr-rule">How we know</div>
  <div class="nr-method">
    Every price on this page was collected by direct phone call. An AI voice agent named Mia rings each independent cafe and asks: <strong>"How much is a regular flat white?"</strong> Prices are extracted from the call transcript and stored in our open dataset (<a href="/api/dashboard">JSON export</a>, CC&nbsp;BY&nbsp;4.0). Chain cafes are excluded &mdash; only independents are surveyed. Calls run 9am&ndash;4pm AEST, weekdays only. Sample size for every suburb is shown next to each row. <a href="/press.html">Read the full methodology &rarr;</a>
  </div>
</section>

<!-- ================================================================
     NEWSLETTER
     ================================================================ -->
<section class="nr-section">
  <div class="nr-rule">Subscribe</div>
  <div class="nr-nl">
    <div>
      <h4>The Friday Pour</h4>
      <p>Weekly digest: which suburb went up, which went down, and the new cafes we surveyed.</p>
    </div>
    <!-- KEEP THE EXISTING NEWSLETTER FORM — preserve action/method, all input names, the existing onsubmit handler, and any honeypot fields. Wrap inside the .nr-nl markup above. -->
  </div>
</section>

<!-- ================================================================
     FOOTER
     ================================================================ -->
<footer class="nr-foot">
  <span>Flat White Index &middot; Part of <a href="https://agenticconsciousness.com.au">Agentic Consciousness</a></span>
  <span>
    <a href="/press.html">Methodology</a> &middot;
    <a href="/api/dashboard">Data</a> &middot;
    <a href="/melbourne.html">Melbourne</a>
  </span>
</footer>
```

The newsletter form must be pasted verbatim from the prior markup — preserve `onsubmit`, action, method, all input names, any honeypot field, and the existing success/error handler IDs.

- [ ] **Step 4.5: Smoke test**

```bash
node webhook.js &
SERVER_PID=$!
sleep 2
HTML=$(curl -s http://localhost:${PORT:-3001}/)
echo "$HTML" | grep -c 'id="salaryInput"'
echo "$HTML" | grep -c 'id="sydney-coffees"'
echo "$HTML" | grep -c 'class="nr-method"'
echo "$HTML" | grep -c 'class="nr-nl"'
echo "$HTML" | grep -c 'class="nr-foot"'
kill $SERVER_PID
```
Expected: `1 1 1 1 1`. Then in browser: confirm salary calc renders + works with a test salary, Sydney in Coffees renders the featured dark card + 5 categories with all 22 entries, methodology block sits in cream prose, newsletter band is dark with bronze CTA, footer renders below.

Manual count for Sydney in Coffees: open the page, count the cards. Should be 1 featured + 21 categorised = 22 total.

- [ ] **Step 4.6: Run regression suite**

Run: `npm test`
Expected: `49 pass, 0 fail`.

- [ ] **Step 4.7: Commit**

```bash
git add public/index.html
git commit -m "feat(landing): salary calc + Sydney in Coffees + methodology + newsletter + footer

Phase 4. Salary calculator restyled into .nr-widget shell with a 3-up
result grid; calcSalary() and all input/output IDs preserved verbatim.
Sydney in Coffees card template inside renderSydneyCoffees() rewritten to
the newsroom card design (icon · desc + source · value + unit) with the
featured entry promoted into a full-width dark band. The 22-entry
COFFEE_COMPARISONS array, the CATEGORY_LABELS map, computeCoffeeValue(),
and the render function structure are unchanged. Methodology in cream
prose with inline links to /press.html and /api/dashboard. Newsletter in
a dark .nr-nl band with the existing form preserved. Footer with brand
line + nav."
```

---

## Task 5: Cleanup, page-weight check, acceptance walkthrough

**Files:**
- Modify: `public/index.html` (delete orphaned CSS rules, retired markup blocks)

**Goal:** Remove every orphaned CSS rule and JS line whose target ID was deleted. Verify the page-weight target. Walk through the full acceptance criteria.

- [ ] **Step 5.1: Hunt for orphan CSS**

Run:
```bash
# IDs that should no longer be referenced anywhere
for id in statPrices statAnswerRate findingsSection findingsGrid howItWorksSection tierRow region-cards-1 region-cards-2 heroInsight insightNumber insightText; do
  count=$(grep -c "$id" public/index.html)
  echo "$id: $count occurrences"
done
```
Expected: every id reports `0`. If any is `>0`, locate and delete.

- [ ] **Step 5.2: Delete orphaned CSS class rules**

Search the `<style>` block for class selectors no longer present in the markup: `.tier-row`, `.tier-badge`, `.findings`, `.finding`, `.finding-icon`, `.finding-text`, `.findings-grid`, `.findings-title`, `.section-label` (only if no consumers), `.hero-insight`, `.insight-number`, `.insight-text`, `.stats-row` (replaced by `.nr-band`), `.stat-card` (replaced by `.nr-band-stat`), `.seo-answer`, `.region-grid` (replaced by `.nr-regions`), `.find-suburb`, `.salary-calc-desc`, `.salary-input-row`, `.salary-result`, `.salary-result-card`, `.salary-minutes`, `.salary-minutes-label`, `.salary-comparison`.

For each, verify with `grep -c "class=\"$class\"\\|class='$class'" public/index.html` that no markup still uses it. Delete only if 0 markup users.

- [ ] **Step 5.3: Delete orphaned JS**

Grep the JS block for any function that wrote to a deleted ID:
```bash
grep -n "renderFindings\|renderTiers\|renderHowItWorks\|calculateTiers\|renderInsight" public/index.html
```
Delete each such function and its call sites. Be careful: `calculateTiers` may be referenced by code that builds the leaderboards — if so, leave it alone or inline only the parts the leaderboards need.

- [ ] **Step 5.4: Page-weight check**

Run:
```bash
wc -l public/index.html
```
Expected: ≤ 2400 lines. If over, investigate which deletions were missed; check the deleted-CSS-rules list and grep for any remaining `.salary-` / `.region-grid` / `.findings` rules.

If you cannot get under 2400 without compromising the design, **stop and surface to the user** — do not silently expand scope.

- [ ] **Step 5.5: Run the regression suite + audit**

```bash
npm test
npm audit
```
Expected: `49 pass, 0 fail` and `0 vulnerabilities`.

- [ ] **Step 5.6: Acceptance walkthrough**

Start the server, open the page in a browser. Walk the spec's Acceptance Criteria one by one:

1. **`/` loads with the new layout and correct live data** — visual confirmation; no demo-data flash.
2. **Every widget renders and functions** — tick each:
   - Stat band: 4 cards, $5.80 / Ashfield / Darling Harbour / 847.
   - Distribution chart: 7 bars, modal bar in `--ink`, axis labels under each bar, callout with bracket share.
   - Leaderboards: 5 rows each, sample sizes shown, prices coloured.
   - Find-near-me: clicking "Use my location" prompts for permission; entering a suburb returns results.
   - Region cards: 8 cards in 4-col grid (2-col at <900px).
   - Map: Leaflet loads, pins appear, sidebar list populates.
   - Salary calc: entering 85000 returns minutes/week/year values.
   - Sydney in Coffees: featured house card at top in dark band, then 5 category headers, 22 cards total. Verify by counting in DevTools: `document.querySelectorAll('.nr-cf').length === 22`.
   - Methodology: cream block with two bronze inline links.
   - Newsletter: form submits successfully (test with a real email or check the network tab).
3. **Single H1** — confirm `document.querySelectorAll('h1').length === 1` in DevTools.
4. **Mobile (375px)** — DevTools responsive mode: stat band collapses (hero stat full-width), leaderboards stack, Sydney in Coffees becomes 1-col, map remains usable.
5. **JSON-LD intact** — view source, confirm all schema blocks (Organization, Dataset, WebSite, WebPage, BreadcrumbList, SiteNavigationElement, FAQPage) still present.

- [ ] **Step 5.7: Commit cleanup + final**

```bash
git add public/index.html
git commit -m "chore(landing): drop orphaned CSS + JS, hit page-weight target

Removed CSS rules and JS for IDs deleted earlier in this branch:
findingsSection/Grid, howItWorksSection, tierRow/.tier-badge, statPrices,
heroInsight*, region-cards-1/2 (merged), and the legacy .stats-row /
.region-grid / .find-suburb / .salary-* / .seo-answer rules whose markup
was rewritten under .nr-* classes.

Page weight: ≤ 2400 lines (down from 2915). 49 tests pass; npm audit 0
vulnerabilities."
```

- [ ] **Step 5.8: Update HANDOFF + push**

Append a one-liner to `memory/HANDOFF.md` under Accomplished:

```
- **Landing page newsroom overhaul** — full restructure of public/index.html into a Pudding-style data piece. Stat band → distribution → leaderboards → near-me → regions → map → salary → Sydney in Coffees (22 cards) → methodology → newsletter. Identity preserved (Playfair + DM Sans + cream/bronze). Page weight ~2400 lines (down from 2915). All 49 tests pass.
```

Then push:
```bash
git push origin master
```

Optionally deploy:
```bash
ssh root@<lxc-host> 'cd /opt/flatwhiteindex && git pull origin master && npm install && systemctl restart flatwhite-webhook'
```

---

## Verification checklist (ship gate)

Run before declaring complete:

- [ ] `wc -l public/index.html` ≤ 2400
- [ ] `npm test` → 49/49 pass
- [ ] `npm audit` → 0 vulnerabilities
- [ ] `node --check webhook.js` → no syntax error
- [ ] `curl -s http://localhost:3001/` → 200, contains `id="statAvg"`, `id="distributionSection"`, `id="leaderCheap"`, `id="region-cards"`, `id="sydney-coffees"`, `class="nr-pull"` (×2), `class="nr-method"`, `class="nr-nl"`, `class="nr-foot"`
- [ ] Browser: 22 `.nr-cf` cards in Sydney in Coffees
- [ ] Browser: 1 `<h1>` total (the masthead brand)
- [ ] Browser: 7 bars in the distribution chart, one with `.mode` class
- [ ] Mobile (375px): stat hero spans full-width, leaderboards stack, Sydney in Coffees is 1-col

---

## Risks recap (carry over from spec)

- **JS coupling drift** — every removed ID needs a JS removal. Step 5.1 enumerates the targets.
- **`renderRegionCards` data shape mismatch** — if the existing function expected `r.cafes_total` rather than `r.cafe_count`, the new template needs to match. Check before deploying.
- **Find-near-me handler IDs** — verify the existing handler attaches to the new button IDs (`findNearMeBtn`, `findSuburbBtn`) or rename the markup IDs to match the existing handler.
- **Page weight** — if Step 5.4 reports >2400 lines after a thorough cleanup pass, surface to user before continuing.
- **Newsletter form preservation** — the form HTML must be pasted verbatim from the existing markup, not retyped. Honeypot fields, action URL, success/error message IDs must all match what the existing JS expects.
