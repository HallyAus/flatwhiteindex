# Session Handoff

> Bridge between Claude Code sessions. Updated at the end of every session.
> The SessionStart hook auto-injects this into context.

## Last Updated

- **Date:** 2026-04-04
- **Branch:** master
- **Focus:** Guinndex redesign, editorial v3, full audit, ElevenLabs voice integration, Supabase migrations

## Accomplished (this session — 13 commits)

- **Guinndex redesign (Latte Art v1)** — Dark-to-light three-zone layout on main index.html: espresso hero, gradient bridge with 8 region cards, light milk content zone. Single Origin colour palette with coffee-process CSS variables.
- **Percentile tier system** — Budget (≤P25), Mid-range, Premium (≥P75) auto-calculated from live data. Tier badges, region card colours, map marker colours all tied to percentiles.
- **Sydney in Coffees** — 20 dynamic comparison cards (house price, rent, avo toast, diesel, SCG, Opera House, pokies, etc.) calculated from live average price.
- **Full 5-agent audit** — HTML structure, CSS, JS, webhook, admin. Fixed 16 issues: XSS in regionConfigJson, field name mismatch (suburb/sample_size), 6 duplicate font-sizes, 3 broken hovers, hardcoded hex, WCAG contrast, duplicate ID, missing label for=, division-by-zero guards.
- **Editorial v2 (rejected)** — Dark FT-meets-specialty-coffee design. User rejected ("very bad").
- **Editorial v3** — Light mode, terracotta accent (#C4654A), Source Serif 4 + Inter. Tailwind CDN. Paper texture, card depth, hover lifts, editorial typography. Served at /v3.
- **ElevenLabs Conversational AI** — New caller-elevenlabs.js replaces Twilio+OpenAI. Single API call per café, no WebSocket bridge needed. Post-call webhook at /webhook/elevenlabs-call-complete. Half the cost per call.
- **Supabase migrations 003-005** — subscribers table, user_price_submissions, constraints, RLS policies, performance indexes, get_call_stats() function. Subscribe form now working.
- **Subscriber fix** — RLS was blocking because anon key was being used. Fixed by switching to service_role key (sb_secret_*).

## In Progress

- ElevenLabs agent setup (user needs to create agent in dashboard, get API key + agent ID + phone number ID)
- Decide whether v3 replaces main index.html

## Blocked

- Resend domain verification (need DNS records in Cloudflare for flatwhiteindex.com.au)

## Next Steps

1. **Set up ElevenLabs agent** — create at elevenlabs.io/agents, add phone number, configure post-call webhook to /webhook/elevenlabs-call-complete, update .env with ELEVENLABS_* vars
2. **Test ElevenLabs calling** — make a test call to verify the full pipeline works
3. **Call more suburbs** — 80 suburbs available, many uncalled
4. **Decide on v3** — if user likes v3, swap it to be the main page
5. **Scheduled auto-dispatch** — cron job for business hours calling
6. **Price history tracking** — re-call cafes monthly, show trends
7. **Set up Resend** — DNS records in Cloudflare
8. **WhatsApp price submission** — text-based crowdsourcing

## Active Beads Issues

- None (beads not installed)

## Context

> - Production: Proxmox LXC 700 via systemd `flatwhite-webhook`
> - Deploy: `cd /opt/flatwhiteindex && git pull origin master && npm install && systemctl restart flatwhite-webhook`
> - Admin: https://flatwhiteindex.com.au/admin (ADMIN_SECRET in .env)
> - Umami: analytics.agenticconsciousness.com.au, website ID d35f6ff1-35d8-4c68-890d-5aa312d6039c
> - Email: Resend SDK (RESEND_API_KEY in .env), welcome auto-sends on signup
> - Voice: ElevenLabs Conversational AI (CALL_PROVIDER=elevenlabs), also supports twilio and bland
> - Hidden suburbs: right-click suburb buttons in admin, persists to hidden-suburbs.json
> - Embed: works via iframe (frame-ancestors * in CSP)
> - Logo: friendly coffee bean with big eyes, gradient body, steam wisps (72px in header)
> - Test runner: `npm test` — 36/36 passing throughout
> - specs/ is gitignored — use `git add -f`
> - Region config: suburb-regions.json (8 regions, inlined by server)
> - Migrations: 001-005 all run in Supabase
> - Supabase key: must be service_role (sb_secret_*), not anon (sb_publishable_*)

## Files Modified

```
public/index.html — Latte Art reskin (CSS variables, three zones, regions, tiers, coffees section)
public/index-v2.html (new) — dark editorial design (rejected)
public/index-v3.html (new) — light editorial design with terracotta accent
webhook.js — regionConfigJson injection, XSS fix, /v2 + /v3 routes, ElevenLabs webhook
caller-elevenlabs.js (new) — ElevenLabs Conversational AI outbound calls
caller.js — updated router for elevenlabs provider
suburb-regions.json (new) — 8 Sydney region mappings
env.example — added ELEVENLABS_* variables, updated CALL_PROVIDER options
docs/superpowers/specs/2026-03-31-guinndex-redesign-design.md (new)
docs/superpowers/plans/2026-03-31-guinndex-redesign.md (new)
```
