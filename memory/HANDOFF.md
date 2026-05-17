# Session Handoff

> Bridge between Claude Code sessions. Updated at the end of every session.
> The SessionStart hook auto-injects this into context.

## Last Updated

- **Date:** 2026-05-17
- **Branch:** master
- **Focus:** Vercel migration scaffold (everything-on-Vercel + retire LXC). Earlier in the session: full audit + P0 fixes + newsroom landing overhaul.

## Accomplished (this session — all committed + pushed)

**Audit + P0 fixes:** Repaired ElevenLabs transcript persistence (field name mismatch dropped every transcript), WebAuthn login wiring (broke all passkey logins), axios CVE pin (override was ineffective). Strengthened SEO: H1 keyword extension, `<aside>` → `<section>`, llms.txt numbers, sitemap dates, masthead animations stripped, contrast token darkened to AA-pass, PostHog `maskAllInputs:true`. Hardened: jsonForScript XSS escape, ADMIN_SECRET bearer restricted to localhost, ElevenLabs HMAC verification + 24h webhook idempotency, CSP `frame-ancestors 'self'`. Deleted v2/v3/v4 landing files, reference/ dir, Dockerfile/compose, root mock-data.json. v5 renamed to `public/sydney-coffee-price-report-2026.html` and promoted to a real keyword URL with FAQ wording differentiated from `/`. README rewritten.

**Newsroom landing overhaul:** Full restructure of `public/index.html` into a Pudding/FT-style data piece. 15-section choreography: masthead → hero → 4-up stat band → distribution histogram (7 bars from `__LIVE_DATA__.distribution`, modal bar in --ink) → pull quote → cheapest/dearest leaderboard pair → for-you widget (find-near-me + compare suburbs in one card) → merged region cards → pull quote → map → salary calculator → Sydney in Coffees (22 cards: 1 featured median-house + 4 cost + 4 transport + 5 experiences + 4 money + 4 aussie) → methodology → dark newsletter band → footer. Identity preserved (cream + bronze + Playfair + DM Sans). All interactive widgets working; ~320 lines of dead CSS removed.

**Vercel migration scaffold:** New project `danieljhall-mecoms-projects/flatwhiteindex` linked + GitHub auto-deploy connected. `api/` directory with serverless functions for dashboard, subscribe/unsubscribe/submit-price, ElevenLabs webhook (HMAC + idempotency + raw-body), cron dispatch (300s timeout, every 15min during AEST business hours), health. `lib/` with Supabase client, jsonForScript, rate-limit (Supabase-backed), webhook-verify, extract-prices, dispatch-runner (replaces the old `child_process spawn node index.js`). Supabase migration 007 applied: rate_limit_hits, processed_webhooks, hidden_suburbs, dispatch_jobs, webauthn_challenges. vercel.json with syd1 region, cron schedule, security headers, /v2-/v5 → / redirects.

## In Progress

- **Vercel deploy blocked on env vars.** 6 of 11 env vars pushed (SUPABASE_URL, WEBHOOK_BASE_URL, WEBHOOK_SECRET, ADMIN_SECRET, CALL_PROVIDER, WEBAUTHN_RP_ID — last two are freshly generated for Vercel, not the LXC values). Still missing: **SUPABASE_SERVICE_KEY, ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, ELEVENLABS_PHONE_NUMBER_ID, GOOGLE_PLACES_API_KEY**. Optional: RESEND_API_KEY, ELEVENLABS_WEBHOOK_SECRET.
- **Admin endpoints not yet ported.** Phase 2 of the Vercel migration. Need to translate ~25 admin endpoints (auth/me, status, calls, cafes, review, submissions, subscribers, system, hidden-suburbs, suburb-progress, reprocess, calls/:id/retry, bulk-retry, dispatch). Auth flow needs the WebAuthn challenge store moved from in-memory Map to the new `webauthn_challenges` Supabase table.

## Blocked

- Vercel deploy waiting on 5 secrets from user (see In Progress).
- Resend domain verification (pre-existing, needs DNS records in Cloudflare).

## Next Steps

1. **Get secrets from user**, push to Vercel: `vercel env add KEY production` for each. Then `vercel --prod` for first deploy (or push any commit — auto-deploy from GitHub is wired up).
2. **Smoke-test preview URL** — verify `/` static, `/api/dashboard` returns JSON, `/api/health` returns ok, the existing dashboard JS hydrates correctly from `/api/dashboard`.
3. **DNS swap** — once preview verified: add `www.flatwhiteindex.com.au` as a custom domain in Vercel, update Cloudflare DNS CNAME to point at Vercel, add Cloudflare apex → www 301 redirect rule.
4. **Port admin endpoints** (Phase 2). Highest priority: auth flow (`/api/admin/auth/*`) so admin login works on Vercel.
5. **Configure ELEVENLABS_WEBHOOK_SECRET** in ElevenLabs dashboard webhook config, also in Vercel env → enables HMAC verification (currently falls back to shared-secret).
6. **Retire LXC 700** once Vercel is verified live and stable for ~48h.
7. **Resubmit sitemap** in Google Search Console after DNS swap.

## Gotchas

- Supabase key must be `service_role` (sb_secret_*), not anon.
- `specs/` is gitignored — use `git add -f`. Also `docs/superpowers/` is gitignored.
- Migrations 001-007 all applied (007 added rate_limit_hits, processed_webhooks, hidden_suburbs, dispatch_jobs, webauthn_challenges).
- Old phone ID `phnum_5501*` is dead — must use `phnum_8201knnhpqv3evh89y0h9c8vxhcf`.
- WebAuthn RP_ID is `flatwhiteindex.com.au` (not www).
- npm overrides for axios (`^1.15.2`) + follow-redirects (`>=1.15.12`) — must stay; transitive deps of twilio.
- **Vercel CLI quirk:** `vercel env add KEY production preview development` fails with "Invalid number of arguments" — must add one env at a time.
- **Twilio caller dropped on Vercel** — caller-twilio.js exists in repo but is unreachable from serverless (needs WebSocket). ElevenLabs is webhook-based and ports cleanly. CALL_PROVIDER is hard-set to `elevenlabs` in Vercel env.
- **In-memory state replaced on Vercel:** rate limit Map → `rate_limit_hits` table, webhook idempotency Map → UNIQUE constraint on `processed_webhooks`, hidden-suburbs.json file → `hidden_suburbs` table, WebAuthn challenges Map → `webauthn_challenges` table (TODO: not yet wired, auth.js still uses Map).
- **Vercel Cron schedule:** `*/15 23-5 * * 1-5` = every 15 min between 23:00 and 05:00 UTC weekdays = 9am-3pm AEST. Lives in vercel.json. Pro plan required.
- Cloudflare apex → www 301 redirect still not set — pre-existing GSC cannibalisation issue.
- The LXC's SSH was not reachable from this session (`Permission denied (publickey)` on 192.168.1.99/80; 192.168.1.23 timed out) — secrets can't be pulled automatically.
