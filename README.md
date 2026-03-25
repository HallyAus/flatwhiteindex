# Flat White Index ☕

AI voice agent that calls Sydney cafes to find out how much a flat white costs — building Australia's first live coffee price index.

## How It Works

1. **Discover** — Google Places API finds cafes across Sydney suburbs
2. **Call** — AI voice agent "Mia" (via Bland.ai) calls each cafe and asks the flat white price
3. **Extract** — Webhook receives call results, parses prices from transcripts
4. **Display** — Public dashboard shows prices by suburb with an interactive map

## Stack

- **Node.js** — Orchestrator and webhook server
- **Bland.ai** — AI voice calling
- **Google Places API** — Cafe discovery
- **Supabase** — PostgreSQL database
- **Static HTML** — Dashboard (no build step)

## Quick Start

```bash
# Install dependencies
npm install

# Copy env template and fill in your API keys
cp env.example .env

# Set up Supabase — run specs/migrations/001_initial_schema.sql in SQL editor

# Start webhook receiver
node webhook.js

# In another terminal, expose webhook via ngrok
ngrok http 3001

# Update WEBHOOK_BASE_URL in .env with ngrok URL

# Dry run (no actual calls)
node index.js --suburb=sydney_cbd --dry-run

# Live calls (costs money!)
node index.js --suburb=sydney_cbd --batch-size=10
```

## Cost

- Bland.ai: ~$0.07/call (avg 45 seconds at $0.09/min)
- Full Sydney (~2000 cafes): ~$140
- Start with a 50-call test batch

## Project Structure

```
index.js              Orchestrator: fetch → call → store
cafes.js              Google Places API cafe discovery
caller.js             Bland.ai voice call dispatcher
webhook.js            Express webhook receiver + price extraction
db.js                 Supabase database helpers
flatwhiteindex.html   Public dashboard
specs/migrations/     Database schema
```

## Support

- ☕ [Buy me a coffee](https://buymeacoffee.com/printforge)
- 🛰️ [Free month of Starlink](https://www.starlink.com/referral) — Starlink high-speed internet is great for streaming
