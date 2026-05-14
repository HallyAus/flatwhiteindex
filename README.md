# Flat White Index

AI voice agent that calls Sydney cafes to find out how much a flat white costs, building a live public price index at [www.flatwhiteindex.com.au](https://www.flatwhiteindex.com.au).

847 calls, 23 suburbs, $5.80 average.

## How it works

1. **Discover** — Google Places API finds independent cafes across Sydney (chains and non-cafe venues excluded).
2. **Call** — an AI voice agent ("Mia") rings each cafe via ElevenLabs Conversational AI and asks the flat white price.
3. **Extract** — a post-call webhook receives the transcript, parses the price, and writes to Supabase.
4. **Display** — the public dashboard renders the dataset suburb-by-suburb with a live map.

## Stack

- **Node.js 20+ (ESM)** — orchestrator, Express webhook server, admin portal
- **ElevenLabs Conversational AI** — primary voice provider (Twilio + Bland.ai supported as fallbacks)
- **Supabase / PostgreSQL** — datastore
- **WebAuthn (passkeys)** — admin authentication
- **Static HTML** — public dashboard + SEO content report (no build step)
- **Cloudflare** — DNS + CDN; **Proxmox LXC + systemd** — production runtime

## Quick start

```bash
# 1. Clone + install
git clone https://github.com/HallyAus/flatwhiteindex
cd flatwhiteindex
npm install

# 2. Configure
cp env.example .env
# Required: SUPABASE_URL, SUPABASE_SERVICE_KEY (sb_secret_*, NOT anon),
# GOOGLE_PLACES_API_KEY, ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID,
# ELEVENLABS_PHONE_NUMBER_ID, WEBHOOK_BASE_URL, WEBAUTHN_RP_ID, ADMIN_SECRET
# See env.example for the full matrix.

# 3. Run Supabase migrations 001-006 in the SQL editor
#    (specs/migrations/ — gitignored; commit them locally with git add -f)

# 4. Start the server (serves /, /admin, dispatches calls, receives webhooks)
node webhook.js

# 5. Dry run a suburb — no actual calls placed
node index.js --suburb=sydney_cbd --dry-run

# 6. Live calls (costs real money — usually $0.05–$0.10 per call)
node index.js --suburb=sydney_cbd --batch-size=10
```

## Key commands

```bash
npm test                                       # 49 tests
node webhook.js                                # start the Express server
node index.js --suburb=<name> --dry-run        # preview a batch
node index.js --suburb=<name> --batch-size=10  # dispatch live calls
node setup-elevenlabs.js                       # one-time agent + phone number setup
```

## Admin portal

`/admin` is protected by WebAuthn (passkeys). First-time setup:

1. Set `ADMIN_SECRET` and `WEBAUTHN_RP_ID` in `.env`.
2. Visit `/admin?bootstrap=<ADMIN_SECRET>` and register a passkey.
3. Subsequent logins use the passkey only; `ADMIN_SECRET` then works only as a localhost-only bearer for CLI/cron access.

The admin UI dispatches calls, reviews transcripts, manages cafes/suburbs/submissions, and exposes server logs.

## Cost guidance

- ElevenLabs voice + Twilio: roughly **$0.05–$0.10 per call** (45–60s average)
- A full 23-suburb sweep at current density (~847 calls): **~$60**
- Always start with a small batch — `--batch-size=10` — and watch the admin Logs panel

## Deploy

Production runs on a Proxmox LXC behind Cloudflare with a `flatwhite-webhook` systemd unit. See `deploy.sh --setup` for the one-shot installer, or for updates:

```bash
cd /opt/flatwhiteindex \
  && git pull origin master \
  && npm install \
  && systemctl restart flatwhite-webhook
```

## Project layout

```
webhook.js               Express server (serves /, /admin, webhooks, admin APIs)
index.js                 Orchestrator (fetch cafes → dispatch → store results)
caller.js                Provider router → caller-elevenlabs.js / caller-bland.js / caller-twilio.js
db.js                    Supabase helpers
cafes.js                 Google Places cafe discovery
auth.js                  WebAuthn / passkey + session handling
public/index.html        Live broadsheet dashboard (served at /)
public/sydney-coffee-price-report-2026.html  SEO content report
public/admin.html        Admin SPA
public/{press,melbourne}.html  Methodology + Melbourne teaser
specs/migrations/        Schema (001–006)
strategy/                PRD, learnings, todo (gitignored)
test/                    Node test runner suites
```

## Key rules

- **Never make live voice calls without explicit user approval** — they cost money.
- Always use `--dry-run` when testing the pipeline.
- Call hours: **9am–4pm AEST, weekdays only**.
- Supabase key must be `service_role` (`sb_secret_*`), not `anon`.
- Australian English everywhere (colour, organise, etc.).

## Where to find things

| Need | Location |
|------|----------|
| Product spec / PRD | `strategy/flatwhiteindex-prd.md` |
| Learnings & gotchas | `strategy/learnings.md` |
| Architecture decisions | `specs/decisions.md` |
| Session handoff (auto-injected) | `memory/HANDOFF.md` |
| Owner context | `.claude/rules/memory-context.md` |
| Agent instructions | `CLAUDE.md` |

## Support

- ☕ [Buy me a coffee](https://buymeacoffee.com/printforge)
- 🛰️ [Free month of Starlink](https://www.starlink.com/referral)

## Licence

MIT — code under MIT, dataset under CC BY 4.0 (attribute: "Source: Flat White Index, [www.flatwhiteindex.com.au](https://www.flatwhiteindex.com.au)").
