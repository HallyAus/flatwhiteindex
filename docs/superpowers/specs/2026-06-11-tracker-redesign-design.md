# Tracker Redesign — public/index.html

**Date:** 2026-06-11
**Status:** Approved by Daniel (via remote control)
**Scope:** Full ground-up redesign of the public dashboard. Modern data-product look replaces the newsroom/editorial concept.

## Problem

The newsroom-style page (shipped 2026-05-15) fails in two ways:

1. **Hard-coded editorial copy contradicts live data.** Live average is $4.63 but the page claims "Most Sydney cafes price between $5 and $6", a pull quote says "the Sydney middle is around $5.50 … $7 cafes now appear", the `<title>` says "$5.80 Average", and a histogram annotation says "83 cafes (83%)" while the hero claims "494 cafes answered" (83/100 — `prices_collected` is ~100). Static narrative numbers drift as live data changes.
2. **Doesn't flow for scanning stats.** 15 sections, the same cheapest/dearest data repeated four times (stat band, leaderboards, compare dropdowns, map sidebar), a 22-card "Sydney in Coffees" wall, enormous mobile scroll. "1 cafes" grammar bugs.

## Decisions (made by Daniel)

- Full ground-up redesign, not a restructure of the existing page.
- Modern data-product look; light, data-forward theme.
- Survives: interactive map + cafe pins (+ transcripts), salary calculator, Sydney in Coffees trimmed to 6 cards.
- Dropped: find-near-me geolocation widget, suburb-compare widget, region cards, pull quotes, leaderboard pair (subsumed by league table).

## Design — "The Tracker"

Mobile-first single column; desktop widens to comfortable measure with the map and table going larger.

1. **Slim header** — bean logo + wordmark, live updated-date chip. Sticky mini-header appears on scroll showing the live average.
2. **Hero** — one giant live number: "A Sydney flat white costs $X.XX." Three chips beneath: cheapest suburb, dearest suburb, prices collected. One-line method sentence, all values computed.
3. **Histogram strip** — 7 price bands from `distribution`, bars coloured on the price scale, annotation computed ("N% of prices sit in the $A–B band").
4. **Interactive map** — high on the page. Leaflet, local vendor files. Pins coloured by price on the same scale; tap → cafe card (name, suburb, price, rating, transcript link). Suburb filter via the league table.
5. **Suburb league table** — the single source for per-suburb stats: rank, suburb, avg (tabular numerals + inline bar), range, sample size. Sortable, searchable. Click row → map filters/zooms.
6. **Coffee-time calculator** — compact card: salary input → minutes of work per flat white.
7. **Sydney in Coffees** — 6 cards, swipeable row on mobile.
8. **Methodology** — collapsible `<details>`, FAQ JSON-LD schema preserved/updated.
9. **Newsletter band + slim footer.**

### Visual language

- Canvas near-white `#FAFAF7`, ink `#141414`, hairline borders.
- DM Sans only (tabular numerals for all prices). Playfair Display dropped.
- All accent colour comes from one 5-step price ramp, green (cheap) → amber → red (dear), used identically in histogram, pins, table bars, chips.

### Data honesty rules

- Every numeric claim on the page is computed from `__LIVE_DATA__` (fallback: fetch `/api/dashboard`). No static prose containing numbers.
- `<title>`/meta description get the live average injected server-side (webhook.js HTML injection; mirror in the Vercel serving path).
- Counts use correct fields: `prices_collected` for prices, `total_cafes`/`calls_total` labelled accurately. Pluralisation helper kills "1 cafes".

### Carried-over plumbing

SEO meta + JSON-LD (updated), PostHog snippet, newsletter form endpoint, Leaflet local vendor, fonts.css (DM Sans subset), robots/sitemap untouched. `/sydney-coffee-price-report-2026` content page untouched.

## Out of scope

Admin portal, melbourne/press pages, Vercel migration phase 2, DNS swap.
