import express from "express";
import { saveCallResult } from "./db.js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// [SECURITY] Body size limit — prevent DoS via large payloads
app.use(express.json({ limit: '64kb' }));

// [SECURITY] Basic security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Cache static assets aggressively, HTML briefly
app.use((req, res, next) => {
  if (req.path.match(/\.(css|svg|png|jpg|woff2?)$/)) {
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
  } else if (req.path.endsWith('.json')) {
    res.setHeader('Cache-Control', 'public, max-age=300');
  } else if (req.path.endsWith('.html') || req.path === '/') {
    res.setHeader('Cache-Control', 'public, max-age=300');
  }
  next();
});

// [SECURITY] Serve ONLY the public/ directory — never the project root
app.use(express.static(join(__dirname, 'public'), { dotfiles: 'deny' }));

const PRICE_PATTERNS = [
  /\$\s*(\d+(?:\.\d{1,2})?)/g,
  /(\d+)\s*dollars?\s*(?:and\s*)?(\d+)?\s*cents?/gi,
  /\b(four|five|six|seven|eight|nine|ten)\s*(fifty|eighty|twenty|seventy|thirty|forty|sixty|ninety|dollars?)\b/gi,
  /(\d+(?:\.\d{1,2})?)\s*(?:bucks?|dollars?|AUD)/gi,
];

const WORD_TO_NUM = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  fifty: 0.50, eighty: 0.80, twenty: 0.20, thirty: 0.30,
  forty: 0.40, sixty: 0.60, seventy: 0.70, ninety: 0.90,
  "twenty-five": 0.25, "seventy-five": 0.75,
};

export function extractPrices(transcript) {
  if (!transcript) return { price_small: null, price_large: null, needs_review: false };

  const prices = [];

  const dollarMatches = [...transcript.matchAll(/\$\s*(\d+(?:\.\d{1,2})?)/g)];
  dollarMatches.forEach(m => {
    const val = parseFloat(m[1]);
    if (val >= 3 && val <= 15) prices.push(val);
  });

  const wordMatches = [...transcript.matchAll(/\b(four|five|six|seven|eight|nine|ten)\s+(fifty|eighty|twenty|thirty|forty|sixty|seventy|ninety)\b/gi)];
  wordMatches.forEach(m => {
    const dollars = WORD_TO_NUM[m[1].toLowerCase()];
    const cents = WORD_TO_NUM[m[2].toLowerCase()];
    if (dollars !== undefined && cents !== undefined) prices.push(dollars + cents);
  });

  const uniquePrices = [...new Set(prices)].sort((a, b) => a - b);

  const hasSmall = /small|regular|standard/i.test(transcript);
  const hasLarge = /large|big/i.test(transcript);

  if (uniquePrices.length === 0) {
    return { price_small: null, price_large: null, needs_review: true };
  }

  if (uniquePrices.length === 1) {
    return {
      price_small: hasLarge ? null : uniquePrices[0],
      price_large: hasLarge ? uniquePrices[0] : null,
      needs_review: false,
    };
  }

  return {
    price_small: uniquePrices[0],
    price_large: uniquePrices[uniquePrices.length - 1],
    needs_review: false,
  };
}

// [SECURITY] Validate payload structure and field lengths
function validatePayload(payload) {
  if (!payload || typeof payload !== "object") return false;
  if (!payload.call_id || typeof payload.call_id !== "string") return false;
  if (payload.call_id.length > 128) return false;
  if (!payload.metadata?.cafe_id) return false;
  if (typeof payload.metadata.cafe_id !== "string" || payload.metadata.cafe_id.length > 128) return false;
  return true;
}

function inferStatus(payload) {
  if (payload.answered_by === "voicemail") return "voicemail";
  if (!payload.completed) return "no_answer";

  const transcript = (payload.transcripts || [])
    .map(t => t.text)
    .join(" ")
    .toLowerCase();

  if (/don't do flat white|we don't serve|we don't have/i.test(transcript)) return "no_flat_white";
  if (/remove|stop calling|not interested|do not call/i.test(transcript)) return "refused";

  return "completed";
}

// [SECURITY] Simple in-memory rate limiter
const rateLimits = {};
function rateLimit(key, maxPerMinute) {
  const now = Date.now();
  if (!rateLimits[key]) rateLimits[key] = [];
  rateLimits[key] = rateLimits[key].filter(t => now - t < 60000);
  if (rateLimits[key].length >= maxPerMinute) return false;
  rateLimits[key].push(now);
  return true;
}

app.post("/webhook/call-complete", async (req, res) => {
  // [SECURITY] Rate limit: 100 webhook calls per minute
  if (!rateLimit('webhook', 100)) {
    return res.status(429).json({ error: "Too many requests" });
  }

  try {
    const payload = req.body;

    if (!validatePayload(payload)) {
      return res.status(400).json({ error: "Invalid payload structure" });
    }

    const cafeId = payload.metadata?.cafe_id;
    const blandCallId = payload.call_id;

    // [SECURITY] Cap transcript length
    const transcript = (payload.transcripts || [])
      .slice(0, 100)
      .map(t => String(t.text || '').slice(0, 2000))
      .join(" ")
      .slice(0, 50000);

    const status = inferStatus(payload);
    const { price_small, price_large, needs_review } = extractPrices(transcript);

    await saveCallResult({
      cafe_id: cafeId,
      bland_call_id: blandCallId,
      status,
      price_small: status === "completed" ? price_small : null,
      price_large: status === "completed" ? price_large : null,
      raw_transcript: transcript,
      needs_review: needs_review && status === "completed",
      completed_at: new Date().toISOString(),
    });

    console.log(`✓ ${String(payload.metadata?.cafe_name || '').slice(0, 100)} (${String(payload.metadata?.suburb || '').slice(0, 50)}) — ${status} — small: $${price_small}, large: $${price_large}`);

    res.json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    // [SECURITY] Never leak internal error messages
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Newsletter / price submissions ---

const SUBSCRIBERS_FILE = join(__dirname, 'subscribers.json');
const MAX_SUBSCRIBERS = 10000;

function loadSubscribers() {
  if (!existsSync(SUBSCRIBERS_FILE)) return [];
  try {
    return JSON.parse(readFileSync(SUBSCRIBERS_FILE, 'utf-8'));
  } catch { return []; }
}

function saveSubscriber(email, source) {
  const subscribers = loadSubscribers();
  if (subscribers.length >= MAX_SUBSCRIBERS) return false;
  if (subscribers.some(s => s.email === email)) return false;
  subscribers.push({ email, source, subscribed_at: new Date().toISOString() });
  writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(subscribers, null, 2));
  return true;
}

app.post("/api/subscribe", (req, res) => {
  // [SECURITY] Rate limit: 10 subscribes per minute per IP
  const ip = req.ip || 'unknown';
  if (!rateLimit('sub:' + ip, 10)) {
    return res.status(429).json({ error: "Too many requests" });
  }

  const { email, source } = req.body;

  if (!email || typeof email !== 'string' || !email.includes('@') || email.length > 254) {
    return res.status(400).json({ error: "Valid email required" });
  }

  // [SECURITY] Sanitise source field
  const sanitisedSource = typeof source === 'string'
    ? source.slice(0, 200)
    : 'website';
  const sanitised = email.toLowerCase().trim();
  const isNew = saveSubscriber(sanitised, sanitisedSource);

  console.log(`📧 ${isNew ? 'New' : 'Existing'} subscriber: ${sanitised} (${sanitisedSource.slice(0, 30)})`);
  res.json({ ok: true, new: isNew });
});

// [SECURITY] Health endpoint — no sensitive values exposed
app.get("/health", (_, res) => {
  res.json({
    ok: true,
    service: "flatwhiteindex-webhook",
    uptime: Math.round(process.uptime()),
    env: {
      supabase: !!process.env.SUPABASE_URL,
      webhook_url: !!process.env.WEBHOOK_BASE_URL,
    },
  });
});

function validateEnv() {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY"];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.warn(`⚠️  Missing env vars: ${missing.join(", ")} — webhook will start but DB writes will fail`);
  }
}

const isMainModule = process.argv[1]?.replace(/\\/g, "/").endsWith("webhook.js");
if (isMainModule) {
  const PORT = process.env.PORT || 3001;
  const server = app.listen(PORT, () => {
    validateEnv();
    console.log(`\n🪝  Webhook receiver listening on port ${PORT}`);
    console.log(`   POST /webhook/call-complete`);
    console.log(`   POST /api/subscribe`);
    console.log(`   GET  /health`);
    console.log(`   Dashboard: http://localhost:${PORT}/`);
  });

  process.on("SIGTERM", () => {
    console.log("Shutting down webhook server...");
    server.close(() => process.exit(0));
  });
}

export default app;
