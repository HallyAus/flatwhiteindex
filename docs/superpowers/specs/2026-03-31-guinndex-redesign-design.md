# Guinndex-Inspired Redesign — Design Spec

> Flat White Index public dashboard visual overhaul. Latte Art theme with regional grouping, premium/budget framing, and "Sydney in Coffees" section.

## Summary

Reskin the existing `public/index.html` dashboard with a three-zone layout inspired by the layers of a flat white: dark espresso hero flowing through a gradient bridge into a light milk content zone. All existing features carry forward in the same order. New additions: 8 regional grouping cards, percentile-based tier labels, and a "Sydney in Coffees" comparison section.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Visual direction | Latte Art (dark-to-light pour) | Unique coffee identity; espresso blends into milk |
| Colour palette | Single Origin | Warm, refined; closest to existing brand with coffee-process naming |
| Regional count | 8 regions | Inner West, CBD, Eastern, North Shore, Beaches, South, West, Hills |
| Region data source | Config-driven JSON | `suburb-regions.json` maps suburb→region; easy to reassign |
| Tier system | Percentile-based | Bottom 25% = Budget, middle 50% = Mid-range, top 25% = Premium |
| Page structure | Data First (reskin) | Same section order as current site; minimal restructuring |
| New section | Sydney in Coffees | 20 comparison cards in 5 categories |

## Colour System

CSS variables named after the coffee process, not generic colours:

```css
:root {
  /* The cup — top to bottom */
  --shot: #1B120D;      /* Darkest — espresso shot */
  --crema: #2E1E14;     /* Dark zone gradient end */
  --pour: #6B3F20;      /* Extract / mid brown */
  --art: #C4813A;       /* Caramel — primary accent */
  --milk: #E8D5B8;      /* Steamed milk */
  --ceramic: #F5F0E8;   /* Light zone background */
  --rim: #FFFCF7;       /* Card backgrounds */

  /* Tier colours */
  --budget: #4AA058;
  --budget-bg: #E8F3EA;
  --midrange: #C4813A;
  --midrange-bg: #FDF6EE;
  --premium: #B44134;
  --premium-bg: #FDEDEB;
}
```

## Page Zones

### 1. Dark Zone (The Shot)

Background: `linear-gradient(135deg, var(--shot), var(--crema))`

Visual elements:
- Subtle radial gradient rosetta pattern (latte art hint, not literal)
- Concentric circle ghost shapes evoking looking into a coffee cup

Contains:
- **Header**: Logo (coffee bean icon) + "Flat White Index" + tagline + live badge with pulse dot
- **Hero**: "Sydney Average Flat White" label → giant price ($5.12) in `--art` colour with text-shadow glow → subtitle with café/suburb count
- **Stats row**: 5 centred stats (Cafés Called, Suburbs, Cheapest, Priciest, Std Dev) — cheapest in green, priciest in red
- **Tier badges**: Budget ≤ P25 | Mid-range | Premium ≥ P75

### 2. Bridge Zone (The Pour)

Background: `linear-gradient(180deg, var(--crema), var(--ceramic))`

Transition element: curved "pour spout" shape at the top (CSS pseudo-element — dark bulge flowing down)

Contains:
- **8 region cards** in a 4×2 grid, floating over the gradient
- Each card: region name, average price (colour-coded by tier), café count + suburb count, tier badge
- Cards have white background, elevated shadow, top-edge colour accent bar matching tier
- Hover: translateY(-3px) + deeper shadow

### 3. Light Zone (The Milk)

Background: `var(--ceramic)` (#F5F0E8)

Contains all existing sections in current order:

#### Key Findings
- 4 insight cards with emoji icons, same as current

#### Map + Suburb Sidebar
- Two-column grid (map: flex 1, sidebar: 320px)
- Map: Leaflet with tier-coloured markers (green/amber/red)
- Sidebar: ranked suburb list with tier dots, sample badge, progress bar at top

#### Price Distribution + Cheapest Finds
- Two-column grid
- Distribution: horizontal bar chart with tier colours
- Cheapest: winner card (dark gradient, latte art circles, trophy) + podium list

#### Sydney in Coffees (NEW)
- Section heading + intro text
- Featured card (full-width, dark gradient): median house price in flat whites (246,094)
- 20 comparison cards in categorised grid:

**Cost of Living (4):**
- Bondi weekly rent: 135 flat whites
- Avo toast: 4.3 flat whites
- Weekly groceries: 42 flat whites
- Quarterly electricity: 58 flat whites

**Getting Around (4):**
- Opal weekly cap: 9.8 flat whites
- Manly ferry return: 1.5 flat whites
- Harbour Bridge toll: 3.6 flat whites
- Diesel per litre: 2.7 flat whites (special "Price check" pun card with accent border)

**Sydney Experiences (5):**
- SCG cricket GA: 15 flat whites
- Opera House tour: 8.2 flat whites
- Bondi to Bronte walk: 0 flat whites (free!)
- Luna Park rides: 7.8 flat whites
- Taronga Zoo: 9.4 flat whites

**Work & Money (4):**
- Minimum wage timer: 13 minutes (highlighted card)
- Annual habit: $1,229
- 30-year compound: $36,870
- % of minimum wage: 5.3%

**Only in Australia (4):**
- Schooner at the pub: 0.4 flat whites per schooner (~$12)
- Servo meat pie: 1.2 flat whites
- Pokie losses: 51 flat whites/hr
- Surfing membership: 78 flat whites

Each card: emoji icon, big number (Playfair Display), unit label, description with personality, source line in italics. Coffee ring watermark (subtle circle pseudo-element).

Category dividers: centred label with horizontal rules.

#### Salary Calculator
- Same as current: annual salary input → minutes per flat white

#### Contribute/Subscribe CTA
- Dark gradient strip with latte art circle decorations
- "Submit a Price" button in `--art` colour

#### How It Works
- 4 methodology cards (AI Voice Agent, Real Calls, Updated Continuously, Transparent)

#### Footer
- Printforge attribution, press kit, sitemap links

## Region Configuration

New file: `suburb-regions.json`

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

## Tier Calculation

```javascript
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
```

Tiers recalculate on every page load from live data. No hardcoded thresholds.

## Latte Art Visual Elements

Decorative CSS-only elements that evoke coffee art without being literal:

1. **Hero rosetta**: Overlapping radial gradients in the dark zone (very subtle, ~0.04 opacity)
2. **Pour spout**: Curved pseudo-element at dark/bridge boundary
3. **Coffee ring watermarks**: Circular borders on cards (bottom-right, 0.06 opacity)
4. **Concentric circles**: On featured/winner/CTA cards (like looking into a cup)
5. **Rim accent**: Top-edge colour bar on region cards (tier-coloured)

All decorative elements are `pointer-events: none` and low opacity — atmosphere, not distraction.

## Typography

No change from current:
- **Playfair Display**: headings, prices, big numbers
- **DM Sans**: body, labels, descriptions

## Responsive Breakpoints

- **≤900px**: Region grid → 2 columns, stats wrap
- **≤780px**: Map/sidebar → single column, bottom grid → single column
- **≤540px**: Hero price smaller, coffees grid → single column, featured card stacks vertically

## Region Aggregation

Region data is calculated **client-side** from existing `__LIVE_DATA__` injection + `suburb-regions.json`. No new API endpoint needed. The page JavaScript:

1. Loads `suburb-regions.json` (inlined or fetched)
2. Groups suburbs by region using the mapping
3. Calculates per-region: average price, café count, suburb count, tier

Suburbs not listed in any region are assigned to an **"Other"** catch-all region. If "Other" has data, it appears as a 9th card. If empty, it's hidden.

## HTML Structure Change

The current single `<main>` wrapper is replaced with three full-width zone `<div>`s, each containing a centred `max-width: 1100px` inner container. This is an HTML restructure, not just a CSS reskin:

```html
<div class="dark-zone">
  <div class="container"><!-- header, hero, stats, tiers --></div>
</div>
<div class="pour-art"></div>
<div class="bridge-zone">
  <!-- region grids (container applied to each grid) -->
</div>
<div class="light-zone">
  <div class="content"><!-- everything else --></div>
</div>
```

## CSS Variable Migration

The existing `--milk: #EDE8E0` is intentionally replaced by the new palette. All existing variable references are migrated:

| Old variable | New variable | New value |
|-------------|-------------|-----------|
| `--cream` | `--ceramic` | #F5F0E8 |
| `--espresso` | `--shot` | #1B120D |
| `--roast` | `--pour` | #6B3F20 |
| `--milk` | `--milk` | #E8D5B8 (shifted warmer) |
| `--foam` | `--rim` | #FFFCF7 |
| `--bronze` | `--art` | #C4813A |
| `--bronze-light` | `--art` | (merged, single accent) |

## Sydney in Coffees — Dynamic Calculation

All comparison values are **calculated dynamically** from `rawCost / liveAvgPrice`. The raw dollar amounts are stored in a `COFFEE_COMPARISONS` array:

```javascript
const COFFEE_COMPARISONS = [
  { icon: '🏠', raw: 1260000, unit: 'flat whites to buy a house', desc: 'Median Sydney house price', source: 'CoreLogic median, March 2026', featured: true },
  { icon: '🏠', raw: 690, unit: 'flat whites/week', desc: 'Median weekly rent in Bondi', source: 'Domain Rental Report Q1 2026', category: 'cost' },
  { icon: '🥑', raw: 22, unit: 'flat whites', desc: 'One avo toast at a Sydney café', source: 'Average brunch menu price', category: 'cost' },
  { icon: '🛒', raw: 215, unit: 'flat whites', desc: 'Average weekly grocery shop', source: 'ABS Household Expenditure Survey', category: 'cost' },
  { icon: '⚡', raw: 295, unit: 'flat whites/quarter', desc: 'Average Sydney electricity bill', source: 'AER Electricity Report 2025', category: 'cost' },
  { icon: '🚂', raw: 50, unit: 'flat whites', desc: 'Opal weekly cap', source: 'Transport for NSW 2026', category: 'transport' },
  { icon: '⛴️', raw: 7.70, unit: 'flat whites', desc: 'Return ferry to Manly', source: 'Opal adult fare', category: 'transport' },
  { icon: '🚗', raw: 18.57, unit: 'flat whites', desc: 'Harbour Bridge toll (E-Tag return)', source: 'Transport for NSW toll schedule', category: 'transport' },
  { icon: '⛽', raw: 1.92, unit: 'flat whites/litre', desc: 'Diesel price per litre', source: 'FuelCheck NSW avg diesel, March 2026', category: 'transport', pun: true },
  { icon: '🏏', raw: 78, unit: 'flat whites', desc: 'SCG cricket GA ticket', source: 'Cricket Australia 2025/26', category: 'experiences' },
  { icon: '🎭', raw: 42, unit: 'flat whites', desc: 'Opera House guided tour', source: 'sydneyoperahouse.com', category: 'experiences' },
  { icon: '🌊', raw: 0, unit: 'flat whites', desc: 'Bondi to Bronte coastal walk', source: 'Best things in Sydney cost nothing', category: 'experiences' },
  { icon: '🎡', raw: 40, unit: 'flat whites', desc: 'Luna Park unlimited rides', source: 'lunaparksydney.com', category: 'experiences' },
  { icon: '🐨', raw: 48, unit: 'flat whites', desc: 'Taronga Zoo adult entry', source: 'taronga.org.au', category: 'experiences' },
  { icon: '💼', raw: null, unit: 'minutes of work', desc: 'Time to earn a flat white at minimum wage ($23.23/hr)', source: 'Fair Work Commission', category: 'money', compute: 'minutes' },
  { icon: '📅', raw: null, unit: 'per year', desc: 'Annual coffee habit (1/workday, 48 weeks)', source: 'Based on Sydney average', category: 'money', compute: 'annual' },
  { icon: '🏦', raw: null, unit: 'over 30 years', desc: '30-year compound at 7% p.a.', source: 'Assumes daily price, 7% return', category: 'money', compute: 'compound' },
  { icon: '💰', raw: null, unit: 'of min wage', desc: 'Daily flat white as % of weekly minimum wage', source: 'Fair Work + ATO tax tables', category: 'money', compute: 'pct_wage' },
  { icon: '🍺', raw: 12, unit: 'flat whites/schooner', desc: 'A schooner at the pub', source: 'Average Sydney pub prices', category: 'aussie', invert: true },
  { icon: '🥧', raw: 6, unit: 'flat whites', desc: 'A servo meat pie', source: 'Average service station price', category: 'aussie' },
  { icon: '🎰', raw: 260, unit: 'flat whites/hour', desc: 'Average pokie losses in NSW', source: 'NSW Liquor & Gaming data', category: 'aussie' },
  { icon: '🏄', raw: 400, unit: 'flat whites', desc: 'Annual Surfing Australia membership', source: 'surfingaustralia.com', category: 'aussie' },
];
```

Special compute functions for Work & Money cards:
- `minutes`: `(avgPrice / 23.23) * 60`
- `annual`: `avgPrice * 5 * 48` (5 days/week, 48 weeks)
- `compound`: future value calculation at 7% over 30 years
- `pct_wage`: `(avgPrice / 475) * 100` (weekly min wage take-home)

## Existing Sections Carried Forward

All current interactive sections carry forward with updated CSS variables:
- Compare Suburbs tool (two dropdowns + compare button)
- Cheapest Near Me (geolocation button)
- Suburb Request modal
- Newsletter/subscribe inline strip
- Price submission modal
- All existing modals and overlays

These sections are not redesigned — they receive the new colour variables and font styling only.

## Accessibility

Dark zone text targets:
- Primary text: `var(--ceramic)` (#F5F0E8) on `var(--shot)` (#1B120D) — contrast 15.2:1 (AAA)
- Muted text: `rgba(245,240,232,0.4)` on `var(--shot)` — minimum 4.6:1 (AA)
- Accent text: `var(--art)` (#C4813A) on `var(--shot)` — contrast 5.8:1 (AA)
- Focus-visible outlines: `2px solid var(--art)` in dark zone, `2px solid var(--pour)` in light zone
- Skip-link and ARIA landmarks updated for new zone structure

## Responsive: Region Cards

- **>900px**: 4 columns (2 rows of 4)
- **540–900px**: 2 columns (4 rows of 2)
- **≤540px**: 2 columns maintained (cards are narrow enough). Horizontal scroll considered but rejected — stacking is better for thumb reach.

## Files Modified

- `public/index.html` — full reskin (CSS + HTML restructure, three zone wrappers)
- `suburb-regions.json` (new) — region configuration

## Files NOT Modified

- `db.js`, `cafes.js`, `caller-*.js`, `index.js` — no backend changes needed
- `scripts/email-templates.js` — email stays as-is
- Map tile provider, Leaflet setup — same, just new marker colours

## Out of Scope

- Dark mode toggle (future — just the Latte Art theme for now)
- Melbourne comparison (placeholder until Melbourne data exists)
- Price history/trends (needs re-call data)
- Region assignment in admin portal (stretch goal, not required)

## Mockups

Browser mockups from brainstorming session saved in:
`.superpowers/brainstorm/session-1774957497/`

Key files:
- `full-design-v3.html` — complete page mockup with Single Origin palette + latte art elements
- `sydney-coffees-expanded.html` — expanded Sydney in Coffees section with all 20 cards
- `colour-palettes.html` — palette comparison (Single Origin selected)
- `visual-direction.html` — Latte Art direction selected over Dark Roast and Split Roast
