# Session Handoff

> Bridge between Claude Code sessions. Updated at the end of every session.
> The SessionStart hook auto-injects this into context.

## Last Updated

- **Date:** 2026-04-27
- **Branch:** master
- **Focus:** Audit + new SEO/GEO landing page (v5), strike-distance keyword targeting

## Accomplished (this session — uncommitted)

- **New v5 landing page** — `public/index-v5.html` (35KB, content-first, FAQ-rich) served at `/v5`. Distinct visual language from broadsheet (`/`) and teal (`/v4`). Schema: Article + FAQPage (7 Q&As) + BreadcrumbList + Dataset (CC BY 4.0) + speakable selectors. `noindex,follow` + robots Disallow during preview.
- **Live `index.html` SEO rewrite** — title now `Sydney Flat White Price: $5.80 Average — Live Cost by Suburb 2026` (number-in-title for CTR); meta description leads with the answer; OG/Twitter synced.
- **Strike-distance keyword targeting** — added SEO answer block after hero (H3 "What is the average coffee price in Sydney?" + answer paragraph + "also searched as" line including misspelling `average coffe price`). Hero copy + JS branches now lead with `$5.80` and use `coffee prices Sydney`.
- **FAQPage schema extended** — 3 new Q&As exact-matching `average coffee price sydney`, `coffee prices sydney 2026`, `coffee price in sydney`.
- **Wiring** — `webhook.js` loads + serves `/v5`; `robots.txt` blocks `/v5`; `sitemap.xml` lastmod refreshed to 2026-04-27 with home `changefreq` lifted to weekly.
- **All 49 tests pass.**

## In Progress

- Cloudflare redirect rule needed: non-www → www (301) — *unchanged from prior session, still the real fix for GSC "/" cannibalisation warnings*
- **v5 needs user review** before promoting to `index.html` (or deciding to keep current broadsheet + just absorb the SEO edits). v4 likely deletable.
- Admin dashboard conversation history (ElevenLabs logs in admin UI)
- **Deploy pending** — uncommitted local changes; prior 2 commits also still not yet deployed to production LXC 700

## Blocked

- Resend domain verification (need DNS records in Cloudflare)

## Next Steps

1. **Commit current changes** — title/meta/SEO block on index.html, new index-v5.html, /v5 route, robots.txt, sitemap, HANDOFF
2. **Deploy to production** — `cd /opt/flatwhiteindex && git pull origin master && npm install && systemctl restart flatwhite-webhook`
3. **Set Cloudflare redirect** — non-www → www 301 redirect rule (unblocks GSC false-positive cannibalisation)
4. **Resubmit sitemap** — in Google Search Console after deploy
5. **Review /v5** — preview at /v5; if approved, copy contents into index.html and delete v2/v3/v4/v5 files + their routes
5. **Update .env on server** — `ELEVENLABS_PHONE_NUMBER_ID=phnum_8201knnhpqv3evh89y0h9c8vxhcf`
6. **Run live batch** — Chippendale failed due to old phone ID, retry after .env fix
7. **Admin conversation history** — show ElevenLabs call transcripts in admin dashboard
8. **Call more suburbs** — 80+ suburbs available
9. **Scheduled auto-dispatch** — cron job for business hours calling
10. **Price history tracking** — re-call cafes monthly, show trends
11. **Set up Resend** — DNS records in Cloudflare
12. **Monitor SEO** — check Search Console in 2 weeks for cannibalisation resolution and CTR improvement

## Gotchas

- Supabase key must be service_role (sb_secret_*), not anon
- specs/ is gitignored — use `git add -f`
- Migrations 001-006 all run in Supabase
- Hidden suburbs: right-click in admin, persists to hidden-suburbs.json
- ElevenLabs phone number IDs expire/disappear — `ensurePhoneNumber()` in setup script handles reimport
- Old phone ID `phnum_5501*` is dead — must use `phnum_8201knnhpqv3evh89y0h9c8vxhcf`
- WebAuthn RP_ID must be set in .env: `WEBAUTHN_RP_ID=flatwhiteindex.com.au`
- `cookie-parser` npm package required — run `npm install` after pull
- npm overrides in package.json for axios (^1.15.0) and follow-redirects (>=1.15.12) — transitive deps of twilio
