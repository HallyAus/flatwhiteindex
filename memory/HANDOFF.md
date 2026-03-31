# Session Handoff

> Bridge between Claude Code sessions. Updated at the end of every session.
> The SessionStart hook auto-injects this into context.

## Last Updated

- **Date:** 2026-03-31
- **Branch:** master
- **Focus:** Admin portal, voice calling, map overhaul, email system, marketing, UX

## Accomplished (this session — 54 commits)

- **Admin portal** — 7 tabs (Dashboard, Calls, Cafes, Review, Submissions, Subscribers, System), 15+ API endpoints, deploy/restart with syntax check + rollback, server log viewer, suburb progress bars with right-click hide/show
- **Voice calling** — prompt iterated 3x (more patient, no Flat White Index mention), price extraction expanded (word dollars, AUD, reprocess), volume 1.5x, better voicemail/IVR detection
- **Map** — individual cafe markers with permanent price labels, fitBounds, lazy init via IntersectionObserver, reset button, suburb click zooms to all cafes in that suburb
- **Dashboard features** — suburb comparison tool, cheapest near me (geolocation), Sydney leaderboard with rating tiebreaker, salary calculator, price insights grid, methodology cards
- **Email** — Resend SDK (replaced nodemailer), welcome email on signup, weekly digest, 3 branded HTML templates (welcome, digest, milestone)
- **80 suburbs** across all Greater Sydney (was 46)
- **Embed fixed** — CSP frame-ancestors, unsubscribe route, subscribers tab with CSV export
- **UX density** — 25-30% less scroll, tighter spacing, larger text, merged methodology into distribution panel
- **Marketing** — logo (friendly bean with eyes), Facebook cover PNG, 10 launch posts
- **Performance** — server-side data injection, lazy map, admin caching, lightweight queries
- **Security** — timing-safe auth, trust proxy, prompt injection protection, rate limiter hardening

## In Progress

- Guinndex-inspired redesign (dark theme, regional grouping, premium vs budget framing)

## Blocked

- Resend domain verification (need DNS records in Cloudflare for flatwhiteindex.com.au)
- Supabase FK schema cache (NOTIFY pgrst, 'reload schema' — user has run it)

## Next Steps

1. **Guinndex-inspired redesign** — dark theme option, regional suburb grouping, premium vs budget hero framing
2. **Run migrations 004 + 005** in Supabase SQL editor
3. **Set up Resend** — add API key + verify domain DNS records
4. **Call more suburbs** — 80 suburbs available, many uncalled
5. **Scheduled auto-dispatch** — cron job for business hours calling
6. **Price history tracking** — re-call cafes monthly, show trends
7. **WhatsApp price submission** — text-based crowdsourcing

## Active Beads Issues

- None (beads not installed)

## Context

> - Production: Proxmox LXC 700 via systemd `flatwhite-webhook`
> - Deploy: admin portal Deploy button (git pull + syntax check + restart) OR terminal `cd /opt/flatwhiteindex && git pull origin master && npm install && systemctl restart flatwhite-webhook`
> - Admin: https://flatwhiteindex.com.au/admin (ADMIN_SECRET in .env)
> - Umami: analytics.agenticconsciousness.com.au, website ID d35f6ff1-35d8-4c68-890d-5aa312d6039c
> - Email: Resend SDK (RESEND_API_KEY in .env), welcome auto-sends on signup
> - Voice: Twilio + OpenAI Realtime (CALL_PROVIDER=twilio), prompt in caller-twilio.js
> - Hidden suburbs: right-click suburb buttons in admin, persists to hidden-suburbs.json
> - Embed: works via iframe (frame-ancestors * in CSP)
> - Logo: friendly coffee bean with big eyes, gradient body, steam wisps (72px in header)
> - Test runner: `npm test` — 36/36 passing throughout
> - specs/ is gitignored — use `git add -f`

## Files Modified

```
webhook.js, db.js, utils.js (new), index.js, cafes.js
caller-bland.js, caller-twilio.js
public/index.html, public/admin.html, public/press.html, public/melbourne.html
public/robots.txt, public/sitemap.xml, public/llms.txt
public/og-image-1200x630.png (new), public/logo.svg (new), public/leaflet.css
env.example, package.json, package-lock.json
scripts/email-templates.js (new), scripts/send-weekly-digest.js, scripts/generate-og-image.js (new)
specs/migrations/004_constraints_and_rls.sql (new), specs/migrations/005_performance.sql (new)
marketing/ (new) — logo.svg, logo.png, logo-512.png, logo-192.png, facebook-cover.svg, facebook-cover.png, launch-posts.md
```
