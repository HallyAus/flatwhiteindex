# Session Handoff

> Bridge between Claude Code sessions. Updated at the end of every session.
> The SessionStart hook auto-injects this into context.

## Last Updated

- **Date:** 2026-04-04
- **Branch:** master
- **Focus:** CLAUDE.md rewrite (lean + compaction rules)

## Accomplished (this session — 1 commit expected)

- **Lean CLAUDE.md** — Rewrote from ~130 lines to ~70. Removed beads section (not installed), auto-update memory table (redundant with system auto-memory), progressive disclosure, workflow ritual (hooks handle it), template placeholders. Added compaction rules.
- **Session-start hook verified** — Already existed in `.claude/settings.json`, injects date/branch/commits/HANDOFF.md. No changes needed.

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
CLAUDE.md — rewritten lean (~70 lines) with compaction rules
```
