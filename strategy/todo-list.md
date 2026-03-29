# Task Tracking

> Quick reference for current work priorities. For detailed issue tracking use Beads (`bd list`).
> This file is for high-level planning; Beads handles granular task management.

## In Progress

- [ ] Set up Supabase project and run all migrations (001-004)
- [ ] Get API keys (Bland.ai, Google Places, Supabase)

## Up Next

- [ ] Test dry-run pipeline: `node index.js --suburb=sydney_cbd --dry-run`
- [ ] Test webhook server locally with mock Bland.ai payload
- [ ] Set up ngrok and test webhook end-to-end
- [ ] Run 10-call test batch (CBD cafes)
- [ ] Switch dashboard to Supabase data source
- [ ] Convert OG image from SVG to PNG (social sharing compatibility)
- [ ] Write integration tests for webhook routes (supertest + mocked db.js)
- [ ] Add PWA manifest.json for mobile Add to Homescreen

## Blocked

- [ ] Live voice calls — blocked by: need Bland.ai API key and funding
- [ ] Dashboard live data — blocked by: need Supabase project with data

## Done (Recent)

- [x] 10-audit super sweep — security, a11y, SEO, mobile hardening (60+ fixes) — 2026-03-29
- [x] Full implementation — 30 tests, mock data, dashboard wiring, webhook hardening — 2026-03-25
- [x] Project scaffolding — merged template, wrote CLAUDE.md, PRD, package.json — 2026-03-25
