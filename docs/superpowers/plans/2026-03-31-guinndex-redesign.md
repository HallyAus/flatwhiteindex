# Guinndex-Inspired Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the Flat White Index public dashboard with a Latte Art three-zone layout (dark hero → gradient bridge → light content), add 8 regional groupings with percentile tiers, and a 20-card "Sydney in Coffees" comparison section.

**Architecture:** Single-file reskin of `public/index.html` (~2800 lines). CSS variables renamed to coffee-process names, HTML restructured from single `<main>` to three zone wrappers, JavaScript extended with tier calculation, region aggregation, and dynamic coffee comparison rendering. New `suburb-regions.json` config file. No backend changes.

**Tech Stack:** Static HTML/CSS/JS (no build step), Leaflet.js for maps, server-side `__LIVE_DATA__` injection via Express.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `public/index.html` | Modify | Full CSS+HTML+JS reskin |
| `suburb-regions.json` | Create | Suburb→region mapping config |
| `webhook.js` | Modify | Serve `suburb-regions.json` as static, invalidate `indexHtml` cache |

---

### Task 1: Create suburb-regions.json

**Files:**
- Create: `suburb-regions.json`

- [ ] **Step 1: Create the region mapping file**

```json
{
  "regions": {
    "inner_west": { "label": "Inner West", "suburbs": ["newtown", "marrickville", "leichhardt", "dulwich_hill", "enmore", "stanmore", "petersham", "ashfield"] },
    "cbd": { "label": "CBD", "suburbs": ["sydney_cbd", "surry_hills", "darlinghurst", "pyrmont"] },
    "eastern": { "label": "Eastern", "suburbs": ["bondi", "double_bay", "paddington", "randwick", "coogee", "bronte"] },
    "north_shore": { "label": "North Shore", "suburbs": ["mosman", "neutral_bay", "chatswood", "crows_nest", "lane_cove", "north_sydney", "willoughby", "artarmon", "roseville", "st_leonards"] },
    "beaches": { "label": "Beaches", "suburbs": ["manly", "dee_why", "freshwater", "curl_curl", "avalon"] },
    "south": { "label": "South", "suburbs": ["hurstville", "kogarah", "miranda", "cronulla", "sutherland", "rockdale", "canterbury"] },
    "west": { "label": "West", "suburbs": ["parramatta", "liverpool", "bankstown", "blacktown", "penrith", "fairfield", "auburn", "granville", "strathfield", "burwood", "homebush", "lidcombe"] },
    "hills": { "label": "Hills", "suburbs": ["castle_hill", "baulkham_hills", "rouse_hill", "kellyville"] }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add suburb-regions.json
git commit -m "feat: add suburb-regions.json for 8 Sydney region groupings"
```

---

### Task 2: Replace CSS variables and reset colour system

**Files:**
- Modify: `public/index.html` (lines 41-58 — CSS `:root` block, then find-replace all variable references)

- [ ] **Step 1: Replace the `:root` CSS variables block**

Replace the existing `:root` (lines 41-58) with the new Single Origin palette:

```css
:root {
  /* The cup — top to bottom */
  --shot: #1B120D;
  --crema: #2E1E14;
  --pour: #6B3F20;
  --art: #C4813A;
  --milk: #E8D5B8;
  --ceramic: #F5F0E8;
  --rim: #FFFCF7;

  /* Tier colours */
  --budget: #4AA058;
  --budget-bg: #E8F3EA;
  --midrange: #C4813A;
  --midrange-bg: #FDF6EE;
  --premium: #B44134;
  --premium-bg: #FDEDEB;

  /* UI */
  --text-muted: #8B7355;
  --border: rgba(107, 63, 32, 0.12);
}
```

- [ ] **Step 2: Find-replace old variable names throughout the CSS**

Apply these replacements across the entire `<style>` block:

| Find | Replace |
|------|---------|
| `var(--cream)` | `var(--ceramic)` |
| `var(--espresso)` | `var(--shot)` |
| `var(--roast)` | `var(--pour)` |
| `var(--foam)` | `var(--rim)` |
| `var(--bronze-light)` | `var(--art)` |
| `var(--bronze)` | `var(--art)` |
| `var(--mid)` | `var(--pour)` |
| `var(--ocean)` | `var(--art)` |
| `var(--ocean-light)` | `var(--midrange-bg)` |
| `var(--green)` | `var(--budget)` |
| `var(--green-light)` | `var(--budget-bg)` |
| `var(--red-price)` | `var(--premium)` |
| `var(--red-light)` | `var(--premium-bg)` |

Also replace any remaining hardcoded hex values from the old palette (e.g. `#2C1A0E` → `var(--shot)`, `#6B3A1F` → `var(--pour)`, `#F7F3ED` → `var(--ceramic)`).

- [ ] **Step 3: Update body and base styles**

```css
body {
  font-family: 'DM Sans', sans-serif;
  font-size: 15px;
  background: var(--ceramic);
  color: var(--shot);
  min-height: 100vh;
}
```

- [ ] **Step 4: Verify page renders without errors**

Open `http://localhost:3001` — the page should look similar to before but with warmer browns/golds instead of the old palette. Some things may look off (dark sections not yet restructured) — that's expected.

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "feat: migrate CSS to Single Origin colour palette"
```

---

### Task 3: Restructure HTML into three zones

**Files:**
- Modify: `public/index.html` (HTML body structure, lines ~1366-1960)

This is the biggest structural change. The current single `<main>` wrapper is replaced with three zone `<div>`s.

- [ ] **Step 1: Add dark zone wrapper around header + hero + stats**

Wrap the existing `<header>`, `.hero`, `.stats-row` in:

```html
<div class="dark-zone">
  <div class="container">
    <!-- existing header -->
    <!-- existing hero -->
    <!-- existing stats-row -->
    <!-- NEW: tier badges row -->
    <div class="tier-row">
      <span class="tier-badge tier-budget">Budget ≤ P25</span>
      <span class="tier-badge tier-mid">Mid-range</span>
      <span class="tier-badge tier-premium">Premium ≥ P75</span>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add pour-art divider and bridge zone with region card placeholders**

After the dark zone, insert:

```html
<div class="pour-art"></div>
<div class="bridge-zone">
  <div class="region-grid" id="region-cards-1"></div>
  <div class="region-grid" id="region-cards-2"></div>
</div>
```

- [ ] **Step 3: Wrap remaining content in light zone**

Replace `<main>` with:

```html
<div class="light-zone">
  <div class="content">
    <!-- ALL existing sections: findings, map+sidebar, distribution, cheapest, salary calc, compare, near me, about, contribute, footer -->
  </div>
</div>
```

- [ ] **Step 4: Remove the old `<main>` tag and its CSS**

Delete `main { ... }` from CSS. Add new zone + container CSS:

```css
.container { max-width: 1100px; margin: 0 auto; padding: 0 1.5rem; }
.content { max-width: 1100px; margin: 0 auto; padding: 0 1.5rem; }
```

- [ ] **Step 5: Verify structure renders (broken styling expected, structure correct)**

- [ ] **Step 6: Commit**

```bash
git add public/index.html
git commit -m "refactor: restructure HTML into dark/bridge/light zones"
```

---

### Task 4: Style the dark zone

**Files:**
- Modify: `public/index.html` (CSS section)

- [ ] **Step 1: Add dark zone CSS**

```css
/* DARK ZONE */
.dark-zone {
  background: linear-gradient(135deg, var(--shot) 0%, var(--crema) 100%);
  color: var(--ceramic);
  position: relative;
  overflow: hidden;
}

/* Latte art rosetta hint */
.dark-zone::before {
  content: '';
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -40%);
  width: 600px; height: 600px;
  background:
    radial-gradient(ellipse 120px 120px at 50% 50%, rgba(196,129,58,0.06) 0%, transparent 100%),
    radial-gradient(ellipse 200px 200px at 50% 50%, rgba(196,129,58,0.04) 0%, transparent 100%),
    radial-gradient(ellipse 300px 300px at 50% 50%, rgba(196,129,58,0.02) 0%, transparent 100%);
  border-radius: 50%;
  pointer-events: none;
}
```

- [ ] **Step 2: Update header styles for dark background**

Update the header CSS to work on dark:
- Logo text: `color: var(--ceramic)`
- Tagline: `color: var(--art)`
- Updated badge: `background: rgba(196,129,58,0.1); border: 1px solid rgba(196,129,58,0.25); color: var(--art);`
- Add live pulse dot animation

- [ ] **Step 3: Update hero styles for dark background**

- Hero label: `color: rgba(245,240,232,0.4);`
- Hero price: `font-size: 4.5rem; color: var(--art); text-shadow: 0 0 60px rgba(196,129,58,0.2);`
- Hero sub: `color: rgba(245,240,232,0.45);`

- [ ] **Step 4: Update stats row for dark background**

- Center-align stats with `display: flex; justify-content: center; gap: 2.5rem;`
- Stat values: `color: var(--ceramic);` (with `.good` and `.warn` classes staying green/red)
- Stat labels: `color: rgba(245,240,232,0.3);`
- Remove card backgrounds/borders (dark zone stats are just text, no cards)

- [ ] **Step 5: Add tier badge CSS**

```css
.tier-row { display: flex; justify-content: center; gap: 8px; padding-bottom: 2rem; position: relative; z-index: 1; }
.tier-badge { padding: 4px 12px; border-radius: 5px; font-size: 0.62rem; font-weight: 500; letter-spacing: 0.04em; }
.tier-budget { background: rgba(74,160,88,0.1); border: 1px solid rgba(74,160,88,0.25); color: #6BCB77; }
.tier-mid { background: rgba(196,129,58,0.1); border: 1px solid rgba(196,129,58,0.25); color: var(--art); }
.tier-premium { background: rgba(180,65,52,0.1); border: 1px solid rgba(180,65,52,0.25); color: #E8665A; }
```

- [ ] **Step 6: Add focus-visible for dark zone**

```css
.dark-zone :focus-visible { outline: 2px solid var(--art); outline-offset: 2px; }
```

- [ ] **Step 7: Verify dark zone looks correct**

Header, hero price, stats, and tier badges should all be visible and readable on the dark background. Check WCAG contrast for all text.

- [ ] **Step 8: Commit**

```bash
git add public/index.html
git commit -m "feat: style dark zone — header, hero, stats on espresso background"
```

---

### Task 5: Style bridge zone + region cards

**Files:**
- Modify: `public/index.html` (CSS + JS)

- [ ] **Step 1: Add bridge zone + pour art CSS**

```css
.pour-art {
  height: 40px;
  background: var(--shot);
  position: relative;
  overflow: hidden;
}
.pour-art::after {
  content: '';
  position: absolute;
  bottom: -20px; left: 50%;
  transform: translateX(-50%);
  width: 200px; height: 40px;
  background: var(--shot);
  border-radius: 0 0 50% 50%;
}

.bridge-zone {
  background: linear-gradient(180deg, var(--crema) 0%, var(--ceramic) 100%);
  padding: 0 0 1.5rem;
}

.region-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 1.5rem;
}
.region-grid + .region-grid { margin-top: 10px; }
```

- [ ] **Step 2: Add region card CSS**

```css
.region-card {
  background: var(--rim);
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 4px 20px rgba(27,18,13,0.1);
  text-align: center;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
  position: relative;
  overflow: hidden;
}
.region-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 28px rgba(27,18,13,0.16);
}
.region-card::before {
  content: '';
  position: absolute; top: 0; left: 50%;
  transform: translateX(-50%);
  width: 60px; height: 3px;
  border-radius: 0 0 6px 6px;
}
.region-card.rc-budget::before { background: var(--budget); }
.region-card.rc-mid::before { background: var(--midrange); }
.region-card.rc-premium::before { background: var(--premium); }
.region-name { font-size: 0.7rem; font-weight: 600; color: var(--pour); text-transform: uppercase; letter-spacing: 0.06em; }
.region-price { font-family: 'Playfair Display', serif; font-size: 1.5rem; font-weight: 700; margin: 4px 0 2px; }
.region-meta { font-size: 0.6rem; color: var(--text-muted); }
.region-tier { display: inline-block; font-size: 0.52rem; font-weight: 600; padding: 2px 8px; border-radius: 4px; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.06em; }
.region-tier.rt-b { background: var(--budget-bg); color: var(--budget); }
.region-tier.rt-m { background: var(--midrange-bg); color: var(--midrange); }
.region-tier.rt-p { background: var(--premium-bg); color: var(--premium); }

@media (max-width: 900px) { .region-grid { grid-template-columns: repeat(2, 1fr); } }
```

- [ ] **Step 3: Add region rendering JavaScript**

In the `<script>` section, add the tier calculation and region rendering functions. Place these before `renderAll()`:

```javascript
// --- Tier calculation (percentile-based) ---
function calculateTiers(prices) {
  const sorted = [...prices].sort((a, b) => a - b);
  const p25 = sorted[Math.floor(sorted.length * 0.25)];
  const p75 = sorted[Math.floor(sorted.length * 0.75)];
  return { budget: p25, premium: p75 };
}

function getTier(price, thresholds) {
  if (price <= thresholds.budget) return 'budget';
  if (price >= thresholds.premium) return 'premium';
  return 'midrange';
}

const TIER_CSS = { budget: 'rc-budget', midrange: 'rc-mid', premium: 'rc-premium' };
const TIER_LABEL = { budget: 'Budget', midrange: 'Mid-range', premium: 'Premium' };
const TIER_BADGE = { budget: 'rt-b', midrange: 'rt-m', premium: 'rt-p' };
const TIER_COLOR = { budget: 'var(--budget)', midrange: 'var(--midrange)', premium: 'var(--premium)' };

// --- Region aggregation ---
const REGION_CONFIG = /* will be inlined by server or fetched */;

function aggregateRegions(suburbs, regionConfig) {
  const regionMap = {};
  // Build suburb→region lookup (normalise: lowercase, replace spaces with _)
  const suburbToRegion = {};
  for (const [regionId, info] of Object.entries(regionConfig.regions)) {
    for (const s of info.suburbs) suburbToRegion[s] = regionId;
  }

  for (const sub of suburbs) {
    const key = sub.suburb_name.toLowerCase().replace(/\s+/g, '_').replace(/['']/g, '');
    const regionId = suburbToRegion[key] || 'other';
    if (!regionMap[regionId]) regionMap[regionId] = { suburbs: [], prices: [], cafeCount: 0 };
    regionMap[regionId].suburbs.push(sub);
    if (sub.avg_price) {
      regionMap[regionId].prices.push(sub.avg_price);
      regionMap[regionId].cafeCount += (sub.cafe_count || 0);
    }
  }

  const allPrices = suburbs.filter(s => s.avg_price).map(s => s.avg_price);
  const tiers = calculateTiers(allPrices);

  const results = [];
  for (const [regionId, data] of Object.entries(regionMap)) {
    if (data.prices.length === 0) continue;
    const avg = data.prices.reduce((a, b) => a + b, 0) / data.prices.length;
    const label = regionConfig.regions[regionId]?.label || 'Other';
    results.push({
      id: regionId,
      label,
      avgPrice: avg,
      cafeCount: data.cafeCount,
      suburbCount: data.suburbs.length,
      tier: getTier(avg, tiers),
    });
  }

  // Sort: premium first, then by price descending
  results.sort((a, b) => b.avgPrice - a.avgPrice);
  return { regions: results, tiers };
}

function renderRegionCards(regions) {
  const grid1 = document.getElementById('region-cards-1');
  const grid2 = document.getElementById('region-cards-2');
  if (!grid1 || !grid2) return;

  const first4 = regions.slice(0, 4);
  const rest = regions.slice(4);

  grid1.innerHTML = first4.map(r => regionCardHTML(r)).join('');
  grid2.innerHTML = rest.map(r => regionCardHTML(r)).join('');
}

function regionCardHTML(r) {
  return `<div class="region-card ${TIER_CSS[r.tier]}">
    <div class="region-name">${esc(r.label)}</div>
    <div class="region-price" style="color:${TIER_COLOR[r.tier]};">$${r.avgPrice.toFixed(2)}</div>
    <div class="region-meta">${r.cafeCount} cafés · ${r.suburbCount} suburbs</div>
    <div class="region-tier ${TIER_BADGE[r.tier]}">${TIER_LABEL[r.tier]}</div>
  </div>`;
}
```

- [ ] **Step 4: Wire region rendering into `renderAll()`**

In the existing `renderAll()` function (around line 2381), add after the stats update:

```javascript
// Region cards
const { regions, tiers } = aggregateRegions(suburbs, REGION_CONFIG);
renderRegionCards(regions);

// Update tier badge thresholds in the UI
const tierRow = document.querySelector('.tier-row');
if (tierRow && tiers) {
  tierRow.innerHTML = `
    <span class="tier-badge tier-budget">Budget ≤ $${tiers.budget.toFixed(2)}</span>
    <span class="tier-badge tier-mid">Mid-range</span>
    <span class="tier-badge tier-premium">Premium ≥ $${tiers.premium.toFixed(2)}</span>
  `;
}
```

- [ ] **Step 5: Inline the region config**

In `webhook.js`, modify the data injection (line ~96) to also inline `suburb-regions.json`:

```javascript
const regionConfig = JSON.parse(readFileSync(join(__dirname, 'suburb-regions.json'), 'utf-8'));
const inject = `<script>window.__LIVE_DATA__=${JSON.stringify(dashboardCache)};window.__REGION_CONFIG__=${JSON.stringify(regionConfig)};</script>`;
```

Then in the JS, replace `const REGION_CONFIG = ...` with:

```javascript
const REGION_CONFIG = window.__REGION_CONFIG__ || { regions: {} };
```

- [ ] **Step 6: Verify region cards appear in the bridge zone**

8 cards should appear, sorted by price, with tier colours and labels.

- [ ] **Step 7: Commit**

```bash
git add public/index.html webhook.js suburb-regions.json
git commit -m "feat: bridge zone with 8 region cards + percentile tier system"
```

---

### Task 6: Update light zone existing sections

**Files:**
- Modify: `public/index.html` (CSS for light zone sections)

- [ ] **Step 1: Update light zone wrapper**

```css
.light-zone { background: var(--ceramic); }
```

- [ ] **Step 2: Update panel/card styles to use new variables**

Ensure all `.panel`, `.finding`, `.stat-card`, `.suburb-row`, etc. use:
- Background: `var(--rim)` instead of old `var(--foam)`
- Borders: `var(--border)` (already updated)
- Border-radius: bump to 12-14px for panels, 10px for smaller cards
- Add subtle coffee ring watermark to panels:

```css
.panel { position: relative; overflow: hidden; }
.panel::after {
  content: ''; position: absolute;
  bottom: -15px; right: -15px;
  width: 50px; height: 50px;
  border: 2px solid rgba(196,129,58,0.05);
  border-radius: 50%;
  pointer-events: none;
}
```

- [ ] **Step 3: Update suburb list to show tier dots**

Add a coloured tier dot before each suburb name in `renderSuburbList()`. Use `getTier()` with the calculated thresholds to assign `budget`/`midrange`/`premium` class.

- [ ] **Step 4: Update map marker colours**

In `markerColour()`, replace the colour values:
- Budget (≤P25): `#4AA058`
- Mid-range: `#C4813A`
- Premium (≥P75): `#B44134`

Update the map legend to show "Budget / Mid-range / Premium" with the new colours.

- [ ] **Step 5: Update winner card / cheapest finds styling**

Winner card gradient: `linear-gradient(135deg, var(--shot), var(--crema))`
Add concentric circle decoration:
```css
.winner-card::after {
  content: ''; position: absolute;
  right: -20px; top: 50%; transform: translateY(-50%);
  width: 80px; height: 80px;
  border: 1px solid rgba(196,129,58,0.1);
  border-radius: 50%;
}
```

- [ ] **Step 6: Update CTA strip and contribute section**

Same dark gradient treatment as winner card. Add latte art circle decoration.

- [ ] **Step 7: Verify all light zone sections render correctly**

Check: findings, map, suburb list, distribution, cheapest, salary calc, compare, near me, about, footer.

- [ ] **Step 8: Commit**

```bash
git add public/index.html
git commit -m "feat: update light zone sections with Single Origin palette + latte art details"
```

---

### Task 7: Add "Sydney in Coffees" section

**Files:**
- Modify: `public/index.html` (HTML + CSS + JS)

- [ ] **Step 1: Add Sydney in Coffees CSS**

```css
/* SYDNEY IN COFFEES */
.coffees-section { padding: 1.5rem 0; border-top: 1px solid var(--border); }
.coffees-intro { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem; }
.coffees-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }

.coffee-card {
  background: var(--rim); border: 1px solid var(--border);
  border-radius: 12px; padding: 1rem;
  position: relative; overflow: hidden;
}
.coffee-card::after {
  content: ''; position: absolute;
  bottom: -15px; right: -15px;
  width: 50px; height: 50px;
  border: 2px solid rgba(196,129,58,0.06);
  border-radius: 50%; pointer-events: none;
}
.coffee-icon { font-size: 1.4rem; margin-bottom: 0.3rem; }
.coffee-number { font-family: 'Playfair Display', serif; font-size: 1.7rem; font-weight: 700; color: var(--pour); line-height: 1; }
.coffee-unit { font-size: 0.68rem; color: var(--text-muted); margin-top: 2px; }
.coffee-desc { font-size: 0.76rem; color: var(--pour); margin-top: 0.3rem; line-height: 1.4; }
.coffee-source { font-size: 0.56rem; color: var(--text-muted); font-style: italic; margin-top: 0.4rem; }

/* Featured house card */
.coffee-featured {
  grid-column: 1 / -1;
  background: linear-gradient(135deg, var(--shot), var(--crema));
  border: none; color: var(--ceramic);
  display: flex; align-items: center; gap: 1.5rem;
  padding: 1.5rem; border-radius: 14px;
  position: relative; overflow: hidden;
}
.coffee-featured::before {
  content: ''; position: absolute;
  right: 40px; top: 50%; transform: translateY(-50%);
  width: 150px; height: 150px;
  border: 1px solid rgba(196,129,58,0.06);
  border-radius: 50%; pointer-events: none;
}
.coffee-featured .coffee-number { font-size: 2.8rem; color: var(--art); }
.coffee-featured .coffee-desc { color: rgba(245,240,232,0.5); }
.coffee-featured .coffee-source { color: rgba(245,240,232,0.3); }

/* Pun card */
.coffee-pun { border: 2px solid var(--art); }
.coffee-pun .coffee-number { color: var(--premium); }
.pun-tag { display: inline-block; font-size: 0.55rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; background: var(--premium-bg); color: var(--premium); padding: 2px 8px; border-radius: 4px; margin-bottom: 0.4rem; }

/* Highlight card */
.coffee-highlight {
  background: linear-gradient(135deg, var(--pour), var(--crema));
  border: none; color: var(--ceramic);
}
.coffee-highlight .coffee-number { color: var(--art); }
.coffee-highlight .coffee-desc { color: rgba(245,240,232,0.6); }

/* Category dividers */
.coffees-divider {
  grid-column: 1 / -1; text-align: center;
  padding: 0.5rem 0; font-size: 0.62rem;
  text-transform: uppercase; letter-spacing: 0.15em;
  color: var(--text-muted); position: relative;
}
.coffees-divider::before, .coffees-divider::after {
  content: ''; position: absolute; top: 50%;
  width: calc(50% - 80px); height: 1px;
  background: var(--border);
}
.coffees-divider::before { left: 0; }
.coffees-divider::after { right: 0; }

@media (max-width: 540px) {
  .coffees-grid { grid-template-columns: 1fr; }
  .coffee-featured { flex-direction: column; gap: 0.75rem; }
  .coffee-featured .coffee-number { font-size: 2rem; }
}
```

- [ ] **Step 2: Add HTML placeholder for the section**

Insert between the cheapest finds / distribution section and the salary calculator:

```html
<div class="coffees-section" id="sydney-coffees"></div>
```

- [ ] **Step 3: Add the COFFEE_COMPARISONS data array and render function**

Add to the `<script>` section (the full array from the spec, plus render logic):

```javascript
const COFFEE_COMPARISONS = [
  // ... (full array from spec — all 21 items)
];

const CATEGORY_LABELS = {
  cost: 'Cost of Living',
  transport: 'Getting Around',
  experiences: 'Sydney Experiences',
  money: 'Work & Money',
  aussie: 'Only in Australia',
};

function computeCoffeeValue(item, avgPrice) {
  if (item.compute === 'minutes') return ((avgPrice / 23.23) * 60).toFixed(0) + 'min';
  if (item.compute === 'annual') return '$' + (avgPrice * 5 * 48).toLocaleString('en-AU', { maximumFractionDigits: 0 });
  if (item.compute === 'compound') {
    const daily = avgPrice;
    const annual = daily * 240; // workdays
    let total = 0;
    for (let y = 0; y < 30; y++) total = (total + annual) * 1.07;
    return '$' + Math.round(total).toLocaleString('en-AU');
  }
  if (item.compute === 'pct_wage') return ((avgPrice / 475) * 100).toFixed(1) + '%';
  if (item.invert) return (avgPrice / item.raw).toFixed(1);
  if (item.raw === 0) return '0';
  return (item.raw / avgPrice).toFixed(1);
}

function renderSydneyCoffees(avgPrice) {
  const el = document.getElementById('sydney-coffees');
  if (!el) return;

  const featured = COFFEE_COMPARISONS.find(c => c.featured);
  const grouped = {};
  COFFEE_COMPARISONS.filter(c => !c.featured).forEach(c => {
    const cat = c.category || 'other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(c);
  });

  let html = `<h2 class="section-heading">Sydney in Coffees ☕</h2>
    <p class="coffees-intro">How far does a flat white go in Sydney? We did the maths.</p>`;

  // Featured card
  if (featured) {
    const val = computeCoffeeValue(featured, avgPrice);
    html += `<div class="coffee-card coffee-featured" style="margin-bottom:10px;">
      <div><div class="coffee-icon" style="font-size:2rem;">${featured.icon}</div></div>
      <div style="flex:1;position:relative;z-index:1;">
        <div class="coffee-number">${Number(val).toLocaleString('en-AU')}</div>
        <div class="coffee-unit">${esc(featured.unit)}</div>
        <div class="coffee-desc">${esc(featured.desc)} — $${(featured.raw).toLocaleString('en-AU')} at $${avgPrice.toFixed(2)} per cup</div>
        <div class="coffee-source">${esc(featured.source)}</div>
      </div>
    </div>`;
  }

  html += '<div class="coffees-grid">';
  for (const [cat, items] of Object.entries(grouped)) {
    html += `<div class="coffees-divider">${CATEGORY_LABELS[cat] || cat}</div>`;
    for (const item of items) {
      const val = computeCoffeeValue(item, avgPrice);
      const extra = item.pun ? ' coffee-pun' : item.compute === 'minutes' ? ' coffee-highlight' : '';
      html += `<div class="coffee-card${extra}">`;
      if (item.pun) html += '<div class="pun-tag">Price check</div>';
      html += `<div class="coffee-icon">${item.icon}</div>
        <div class="coffee-number">${val}</div>
        <div class="coffee-unit">${esc(item.unit)}</div>
        <div class="coffee-desc">${esc(item.desc)}</div>
        <div class="coffee-source">${esc(item.source)}</div>
      </div>`;
    }
  }
  html += '</div>';

  el.innerHTML = html;
}
```

- [ ] **Step 4: Wire into `renderAll()`**

```javascript
renderSydneyCoffees(avgPrice);
```

- [ ] **Step 5: Verify section renders with dynamic values**

The numbers should change based on the actual average price. The house price card should show ~246K flat whites if avg is ~$5.12.

- [ ] **Step 6: Commit**

```bash
git add public/index.html
git commit -m "feat: add Sydney in Coffees section — 20 dynamic comparison cards"
```

---

### Task 8: Responsive polish + accessibility pass

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add/verify all responsive breakpoints**

Ensure these rules exist:

```css
@media (max-width: 900px) {
  .region-grid { grid-template-columns: repeat(2, 1fr); }
  .stats-dark { gap: 1.25rem; flex-wrap: wrap; }
  .hero-price { font-size: 3.5rem; }
}
@media (max-width: 780px) {
  .main-grid { grid-template-columns: 1fr; }
  .bottom-grid { grid-template-columns: 1fr; }
}
@media (max-width: 540px) {
  .hero-price { font-size: 2.8rem; }
  .coffees-grid { grid-template-columns: 1fr; }
  .coffee-featured { flex-direction: column; gap: 0.75rem; }
}
```

- [ ] **Step 2: Update skip-link for new zone structure**

Ensure the skip-link targets `#main-content` which should be an `id` on the light zone's content div.

- [ ] **Step 3: Update ARIA landmarks**

```html
<div class="dark-zone" role="banner">
<div class="bridge-zone" role="region" aria-label="Regional price comparison">
<div class="light-zone" role="main">
```

- [ ] **Step 4: Verify focus-visible outlines in both zones**

Dark zone: `outline: 2px solid var(--art);`
Light zone: `outline: 2px solid var(--pour);`

- [ ] **Step 5: Run tests**

```bash
npm test
```

All 36 tests should still pass (they test backend logic, not frontend).

- [ ] **Step 6: Commit**

```bash
git add public/index.html
git commit -m "feat: responsive polish + accessibility updates for three-zone layout"
```

---

### Task 9: Final integration test + webhook cache fix

**Files:**
- Modify: `webhook.js` (line ~81 — invalidate cached `indexHtml` on file change, or re-read on startup)

- [ ] **Step 1: Update indexHtml reading to include region config**

Ensure `webhook.js` reads both files at startup:

```javascript
let indexHtml = null;
let regionConfig = null;
try { indexHtml = readFileSync(join(__dirname, 'public', 'index.html'), 'utf-8'); } catch {}
try { regionConfig = readFileSync(join(__dirname, 'suburb-regions.json'), 'utf-8'); } catch {}
```

And the injection line becomes:

```javascript
const inject = `<script>window.__LIVE_DATA__=${JSON.stringify(dashboardCache)};window.__REGION_CONFIG__=${regionConfig || '{}'};</script>`;
```

- [ ] **Step 2: Full page test**

1. Start server: `node webhook.js`
2. Open `http://localhost:3001`
3. Verify: dark zone renders with hero price, stats, tier badges
4. Verify: bridge zone shows 8 region cards with correct tier colours
5. Verify: light zone has all existing sections intact
6. Verify: Sydney in Coffees section renders with dynamic values
7. Verify: map markers use tier colours
8. Verify: suburb list has tier dots
9. Resize to mobile — check all breakpoints
10. Check all interactive features still work (salary calc, compare, near me, modals)

- [ ] **Step 3: Run tests**

```bash
npm test
```

- [ ] **Step 4: Commit**

```bash
git add webhook.js public/index.html
git commit -m "feat: complete Guinndex-inspired redesign — Latte Art theme"
```
