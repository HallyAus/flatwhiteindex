# Session Handoff

> Bridge between Claude Code sessions. Updated at the end of every session.
> The SessionStart hook auto-injects this into context.

## Last Updated

- **Date:** 2026-03-30
- **Branch:** master
- **Focus:** 10-audit super sweep — security, a11y, SEO, mobile hardening

## Accomplished

- **10 parallel audits** across security, code quality, test coverage, database schema, structured data, GEO/SEO, responsive design, WCAG 2.1, mobile performance, mobile UX
- **60+ findings fixed** in a single commit (21ec7c8, +468/-125 lines)
- Security: timing-safe webhook secret, Twilio catch→403, trust proxy, validateEnv ordering, email regex, rate limiter cap 10k keys, prompt injection sanitisation, unhandledRejection handler
- Code quality: shared utils.js, variable shadowing fix, JSON.parse safety on OpenAI WS, robust isMainModule, Set-based filtering, DB pagination on 3 functions, saveCallResult row verification
- Database: migration 004 — NOT NULL, CHECK constraints, CASCADE, RLS view for transcript privacy
- SEO: 7 JSON-LD schemas (Organization enhanced, WebPage+speakable, BreadcrumbList, FAQPage), og:locale, twitter:description, font preloads, enriched llms.txt, noscript data
- Accessibility: WCAG contrast fix (--mid, --bronze, --text-muted darkened), skip-link, focus-visible, ARIA on map/modals/progress/emojis, sr-only class, landmarks, autocomplete/inputmode, prefers-reduced-motion, hover media queries
- Mobile: 44-48px touch targets, font size floors, grain hidden on mobile, embed stacking, salary card wrapping, Leaflet zoom enlarged
- Pushed to origin, deployed to production LXC (VM 700)
- 36/36 tests passing throughout

## In Progress

- Nothing — all audit fixes applied and deployed

## Blocked

- No API keys yet (Bland.ai, Google Places, Supabase) — all code scaffold only

## Next Steps

1. Run migration 004 in Supabase SQL editor (constraints, RLS view)
2. Set up Supabase project and run all migrations (001-004)
3. Get API keys (Bland.ai, Google Places) and add to .env
4. Test dry-run: `node index.js --suburb=sydney_cbd --dry-run`
5. Set up ngrok, test webhook locally
6. Run first 10-call test batch to real cafes
7. Convert OG image from SVG to PNG (social sharing compatibility)
8. Write integration tests for webhook routes (supertest)
9. Add PWA manifest.json for mobile Add to Homescreen

## Active Beads Issues

- None (beads not installed on this machine)

## Context

> - Production runs on Proxmox LXC 700 (flatwhite) via systemd service `flatwhite-webhook`
> - Deploy: `cd /opt/flatwhiteindex && git pull origin master && systemctl restart flatwhite-webhook`
> - Docker also available: `docker compose up -d --build` (Dockerfile + docker-compose.yml exist)
> - Permission settings block writing dotfiles (.env.example) — use env.example instead
> - main() in index.js uses import.meta.url comparison for isMainModule (updated this session)
> - Dashboard loads from mock-data.json by default — change DATA_SOURCE to "supabase" for live
> - Bland.ai voice = "maya", language = "en-AU", persona = "Mia"
> - Test runner: `npm test` (node --test test/**/*.test.js)
> - WCAG contrast colours darkened: --mid=#6B5840, --bronze=#8E5A28, --text-muted=#6A5238
> - Migration 004 NOT YET RUN in Supabase — run it when Supabase project exists
> - specs/ directory is gitignored — use `git add -f` for files in specs/

## Files Modified

```
webhook.js, utils.js (new), caller-bland.js, caller-twilio.js, cafes.js, db.js, index.js
specs/migrations/004_constraints_and_rls.sql (new)
public/index.html, public/press.html, public/melbourne.html
public/sitemap.xml, public/llms.txt
```
