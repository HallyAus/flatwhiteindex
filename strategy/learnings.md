# Project Learnings

> Things discovered during development. Gotchas, workarounds, and non-obvious knowledge.
> Claude updates this when discoveries are made (see CLAUDE.md mandatory memory rules).

## Format

Each entry: `[YYYY-MM-DD] Learning — Context`

## Learnings

<!-- Claude: add new entries at the top -->

- [2026-03-29] specs/ directory is gitignored — must use `git add -f` to add files in specs/migrations/
- [2026-03-29] Supabase silently truncates results at 1000 rows without pagination — always use .range() loop for any query that could exceed 1000
- [2026-03-29] String `===` comparison for secrets is vulnerable to timing attacks — use crypto.timingSafeEqual
- [2026-03-29] Express req.ip returns the proxy IP unless `app.set('trust proxy', 1)` is configured — breaks per-IP rate limiting behind Cloudflare/nginx
- [2026-03-29] SVG og:image not supported by Facebook, LinkedIn, WhatsApp, Slack — need PNG fallback for social sharing
- [2026-03-29] WCAG contrast: original --bronze (#B5763A) only 3.3:1 on cream, --mid (#8B7355) only 3.9:1 — darkened to #8E5A28 and #6B5840 for 5:1+
- [2026-03-29] Production runs on Proxmox LXC 700 via systemd (not Docker) — deploy: git pull + systemctl restart flatwhite-webhook
- [2026-03-25] Google Places API pagination requires 2s delay before using next_page_token — immediate requests fail
- [2026-03-25] Bland.ai max_duration is in minutes (not seconds) — set to 2 for 90-second target calls
- [2026-03-25] Price extraction from transcripts needs both regex ($4.50) and word patterns ("four fifty") — Bland.ai transcripts inconsistent
- [2026-03-25] Permission settings on this machine block writing dotfiles like .env.example — use env.example instead
