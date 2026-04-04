# Task Tracking

> Quick reference for current work priorities.

## In Progress

- [ ] Set up ElevenLabs agent — create at elevenlabs.io/agents, add phone number, configure webhook, update .env
- [ ] Decide on v3 editorial design — swap to main page if approved
- [ ] Set up Resend — add API key + verify domain DNS in Cloudflare

## Up Next

- [ ] Test ElevenLabs calling — end-to-end test call
- [ ] Call remaining suburbs (80 available, ~40 uncalled)
- [ ] Scheduled auto-dispatch — cron job for 9am-4pm AEST weekdays
- [ ] Price history tracking — re-call cafes monthly, show trends
- [ ] WhatsApp price submission — crowdsourced data
- [ ] PWA manifest for Add to Homescreen

## Done (Recent)

- [x] ElevenLabs Conversational AI integration — caller-elevenlabs.js, webhook, router — 2026-04-04
- [x] Supabase migrations 003-005 run — subscribers, submissions, constraints, RLS, indexes — 2026-04-01
- [x] Subscriber fix — switched from anon key to service_role key — 2026-04-01
- [x] Editorial v3 redesign — light mode, terracotta, Source Serif 4, Tailwind — 2026-04-01
- [x] Editorial v2 redesign — dark FT style (rejected by user) — 2026-03-31
- [x] Full 5-agent security/code audit — fixed 16 issues (XSS, field names, CSS, a11y) — 2026-03-31
- [x] Guinndex redesign (Latte Art) — three-zone layout, regions, tiers, Sydney in Coffees — 2026-03-31
- [x] Admin portal — 7 tabs, deploy/restart, log viewer, suburb progress, price editing — 2026-03-31
- [x] Voice prompt — 3 iterations, more patient, better voicemail detection — 2026-03-31
- [x] Map overhaul — per-cafe markers, price labels, fitBounds, reset, suburb zoom — 2026-03-31
- [x] Email system — Resend SDK, welcome email, weekly digest, 3 templates — 2026-03-31
- [x] 80 suburbs — expanded from 46 across all Greater Sydney — 2026-03-31
- [x] Suburb comparison, near me, leaderboard, salary calculator — 2026-03-31
- [x] UX density pass — 25-30% less scroll, larger text, tighter spacing — 2026-03-31
- [x] Marketing — logo, Facebook cover, 10 launch posts — 2026-03-31
- [x] 10-audit super sweep — security, a11y, SEO, mobile hardening — 2026-03-29
- [x] Full implementation — 36 tests, mock data, dashboard wiring — 2026-03-25
- [x] Project scaffolding — CLAUDE.md, PRD, package.json — 2026-03-25
