# Flat White Index

AI voice agent that calls Sydney cafes to collect flat white prices, building a live public price index.

## Stack

Node.js 20+ (ESM) / Express / Supabase (PostgreSQL) / Static HTML frontend (no build step)
Voice: ElevenLabs Conversational AI (also supports Bland.ai, Twilio)
APIs: Google Places (cafe discovery)

## Architecture

```
webhook.js        Express server — serves frontend, receives call webhooks, admin portal
caller.js         Voice call router (dispatches to caller-elevenlabs.js or caller-bland.js)
db.js             Supabase helpers (upsert cafe, log price, update status)
index.js          Orchestrator: fetch cafes -> dispatch calls -> store results
cafes.js          Google Places API cafe fetcher
public/index.html Main dashboard (Latte Art design — three-zone layout)
public/index-v3.html Editorial redesign (light mode, terracotta accent)
suburb-regions.json  8 Sydney region mappings (inlined by server)
```

## Commands

```bash
npm test                                       # 36 tests
node webhook.js                                # start server (PORT in .env)
node index.js --suburb=sydney_cbd --dry-run    # dry run (no calls)
node index.js --suburb=sydney_cbd --batch-size=10  # live calls
```

## Deploy

```bash
# Production: Proxmox LXC 700, systemd flatwhite-webhook
cd /opt/flatwhiteindex && git pull origin master && npm install && systemctl restart flatwhite-webhook
```

## Key Rules

- **Never make live voice calls without explicit user approval** (costs money)
- Always use `--dry-run` when testing the pipeline
- Call hours: 9am-4pm AEST weekdays only
- Supabase key must be service_role (`sb_secret_*`), not anon
- `specs/` is gitignored — use `git add -f` to track spec files
- Australian English spelling (colour, organise, etc.)

## Commit Format

`type(scope): description`
Types: feat, fix, refactor, docs, test, chore

## Where to Find Things

| Need | Location |
|------|----------|
| Product spec / PRD | `strategy/flatwhiteindex-prd.md` |
| Learnings & gotchas | `strategy/learnings.md` |
| Architecture decisions | `specs/decisions.md` |
| Session handoff | `memory/HANDOFF.md` (auto-injected at session start) |
| Profile & preferences | `.claude/rules/memory-*.md` (auto-loaded) |

## Compaction Rules

When this conversation is compacted, preserve:
- Current task and its status (what we're doing, what's done, what's next)
- Any uncommitted changes and their purpose
- Decisions made this session with rationale
- Errors encountered and their resolutions
- File paths actively being edited
- User instructions given this session that affect ongoing work

Drop:
- Full file contents already written to disk (re-read if needed)
- Exploratory searches that didn't lead anywhere
- Tool output details (keep only conclusions)
- Intermediate drafts that were superseded
