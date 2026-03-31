import express from "express";
import { timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { saveCallResult, getCallByBlandId, getPriceStats, getCallStats, getDiscoveredCafes, testConnection, saveSubscriberToDb, saveUserPriceSubmission, getRecentCalls, getNeedsReviewCalls, updateCallPrice, updateCallStatus, deleteCall, searchCafes, updateCafe, deleteCafe, getSubscribers, deleteSubscriber, getUserSubmissions, deleteUserSubmission, retryCall, bulkRetryFailed, getAvgPrice, getReviewCount, getSuburbProgress } from "./db.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
let _twilioMod; // cached twilio import
let _resend; // cached Resend client

async function sendWelcomeEmail(email) {
  if (!_resend) {
    const { Resend } = await import('resend');
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  const { welcomeEmail } = await import('./scripts/email-templates.js');
  const avgPrice = dashboardCache?.avg_price || 0;
  const { subject, html } = welcomeEmail({ avgPrice, totalCafes: dashboardCache?.total_cafes, totalPrices: dashboardCache?.prices_collected });
  const unsubUrl = `https://flatwhiteindex.com.au/unsubscribe?email=${encodeURIComponent(email)}`;
  const personalised = html.replace(/\{\{UNSUBSCRIBE_URL\}\}/g, unsubUrl);
  const from = process.env.EMAIL_FROM || 'Flat White Index <hello@flatwhiteindex.com.au>';
  await _resend.emails.send({ from, to: email, subject, html: personalised });
  console.log(`📧 Welcome email sent to ${email.slice(0, 3)}***`);
}

// Hidden suburbs — won't show on public dashboard or map
const HIDDEN_SUBURBS_FILE = join(__dirname, 'hidden-suburbs.json');
let hiddenSuburbs = new Set();
try {
  if (existsSync(HIDDEN_SUBURBS_FILE)) {
    hiddenSuburbs = new Set(JSON.parse(readFileSync(HIDDEN_SUBURBS_FILE, 'utf-8')));
  }
} catch {}
function saveHiddenSuburbs() {
  writeFileSync(HIDDEN_SUBURBS_FILE, JSON.stringify([...hiddenSuburbs]), 'utf-8');
}

// [SECURITY] Trust first proxy (Cloudflare/nginx) for correct req.ip
app.set('trust proxy', 1);

// [SECURITY] Body size limit — prevent DoS via large payloads
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));

// [SECURITY] Basic security headers + CSP
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://analytics.agenticconsciousness.com.au",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: https://*.basemaps.cartocdn.com https://*.tile.openstreetmap.org",
    "connect-src 'self' https://analytics.agenticconsciousness.com.au",
    "frame-ancestors *",
  ].join('; '));
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

// Server-rendered index with live data injected (no demo data flash)
let indexHtml = null;
try { indexHtml = readFileSync(join(__dirname, 'public', 'index.html'), 'utf-8'); } catch {}

app.get("/", async (req, res) => {
  if (!indexHtml) return res.sendFile(join(__dirname, 'public', 'index.html'));
  try {
    // Reuse the dashboard cache for zero-cost injection
    const now = Date.now();
    if (!dashboardCache || (now - dashboardCacheTime) >= CACHE_TTL) {
      // Warm cache inline — same logic as /api/dashboard
      const [priceData, callStats, discoveredCafes] = await Promise.all([
        getPriceStats(), getCallStats(), getDiscoveredCafes(),
      ]);
      // Build cache (reuse from /api/dashboard handler)
      buildDashboardCache(priceData, callStats, discoveredCafes);
    }
    const inject = `<script>window.__LIVE_DATA__=${JSON.stringify(dashboardCache)};</script>`;
    const html = indexHtml.replace('</head>', inject + '</head>');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.send(html);
  } catch {
    res.sendFile(join(__dirname, 'public', 'index.html'));
  }
});

// [SECURITY] Serve ONLY the public/ directory — never the project root
app.use(express.static(join(__dirname, 'public'), { dotfiles: 'deny' }));

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

  // Pattern 1: $X.XX or $X
  const dollarMatches = [...transcript.matchAll(/\$\s*(\d+(?:\.\d{1,2})?)/g)];
  dollarMatches.forEach(m => {
    const val = parseFloat(m[1]);
    if (val >= 3 && val <= 15) prices.push(val);
  });

  // Pattern 2: "X.XX" or "X dollars XX" as bare numbers in context
  const decimalMatches = [...transcript.matchAll(/\b(\d+)\.(\d{1,2})\b/g)];
  decimalMatches.forEach(m => {
    const val = parseFloat(m[0]);
    if (val >= 3 && val <= 15) prices.push(val);
  });

  // Pattern 3: "X dollars and Y cents" or "X dollars Y"
  const dollarCentMatches = [...transcript.matchAll(/(\d+)\s*dollars?\s*(?:and\s*)?(\d{1,2})\s*(?:cents?)?/gi)];
  dollarCentMatches.forEach(m => {
    const val = parseFloat(m[1]) + parseFloat(m[2]) / 100;
    if (val >= 3 && val <= 15) prices.push(val);
  });

  // Pattern 4: Word prices — "four sixty", "five fifty"
  const wordMatches = [...transcript.matchAll(/\b(three|four|five|six|seven|eight|nine|ten)\s+(ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/gi)];
  wordMatches.forEach(m => {
    const dollars = WORD_TO_NUM[m[1].toLowerCase()];
    const cents = WORD_TO_NUM[m[2].toLowerCase()];
    if (dollars !== undefined && cents !== undefined) prices.push(dollars + cents);
  });

  // Pattern 5: "X dollars" without cents (whole dollar price) — digits
  const wholeDollarMatches = [...transcript.matchAll(/\b(\d+)\s*dollars?\b/gi)];
  wholeDollarMatches.forEach(m => {
    const val = parseFloat(m[1]);
    if (val >= 3 && val <= 15) prices.push(val);
  });

  // Pattern 6: Word dollars — "five dollars", "four dollars fifty"
  const wordDollarMatches = [...transcript.matchAll(/\b(three|four|five|six|seven|eight|nine|ten)\s+dollars?\s*(?:(?:and\s+)?(ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:\s+cents?)?)?\b/gi)];
  wordDollarMatches.forEach(m => {
    const dollars = WORD_TO_NUM[m[1].toLowerCase()];
    const cents = m[2] ? WORD_TO_NUM[m[2].toLowerCase()] : 0;
    if (dollars !== undefined) prices.push(dollars + (cents || 0));
  });

  // Pattern 7: "X AUD" or "X a u d" (spoken currency code)
  const audMatches = [...transcript.matchAll(/\b(\d+(?:\.\d{1,2})?)\s*(?:a\s*u\s*d|aud)\b/gi)];
  audMatches.forEach(m => {
    const val = parseFloat(m[1]);
    if (val >= 3 && val <= 15) prices.push(val);
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

  // Voicemail / IVR detection from transcript content
  if (/please leave (a |us a )?message|leave a detailed message|after the (tone|beep)|cannot get to the phone|isn't available right now|mailbox is full|please hold the line|your call will be answered|please continue to stay on the line|press \d|our operating hours|please call back|you may make your reservations|submit an? (email )?enquir/i.test(transcript)) return "voicemail";

  if (/don't do flat white|we don't serve|we don't have|don't sell flat white|no flat white/i.test(transcript)) return "no_flat_white";
  if (/remove|stop calling|not interested|do not call/i.test(transcript)) return "refused";

  return "completed";
}

// [SECURITY] Simple in-memory rate limiter with periodic cleanup
const rateLimits = {};
const MAX_RATE_KEYS = 10000;
function rateLimit(key, maxPerMinute) {
  if (Object.keys(rateLimits).length > MAX_RATE_KEYS && !rateLimits[key]) return false;
  const now = Date.now();
  if (!rateLimits[key]) rateLimits[key] = [];
  rateLimits[key] = rateLimits[key].filter(t => now - t < 60000);
  if (rateLimits[key].length >= maxPerMinute) return false;
  rateLimits[key].push(now);
  return true;
}
// Purge stale rate limit keys every 5 minutes (.unref so it doesn't prevent shutdown)
setInterval(() => {
  const now = Date.now();
  for (const key of Object.keys(rateLimits)) {
    rateLimits[key] = rateLimits[key].filter(t => now - t < 60000);
    if (rateLimits[key].length === 0) delete rateLimits[key];
  }
}, 300000).unref();

function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// [SECURITY] Webhook authentication — deny by default
async function verifyWebhookOrigin(req, res, next) {
  // Twilio: validate X-Twilio-Signature if auth token is configured
  if (process.env.TWILIO_AUTH_TOKEN && req.headers['x-twilio-signature']) {
    try {
      if (!_twilioMod) _twilioMod = (await import("twilio")).default;
      const url = process.env.WEBHOOK_BASE_URL + req.originalUrl;
      const valid = _twilioMod.validateRequest(
        process.env.TWILIO_AUTH_TOKEN,
        req.headers['x-twilio-signature'],
        url,
        req.body
      );
      if (valid) return next();
      return res.status(403).json({ error: "Invalid Twilio signature" });
    } catch (err) {
      console.warn("⚠️ Twilio signature validation error:", err.message);
      return res.status(403).json({ error: "Signature validation failed" });
    }
  }

  // Webhook secret (header only — never accept via query string)
  if (process.env.WEBHOOK_SECRET) {
    const provided = req.headers['x-webhook-secret'];
    if (safeCompare(provided, process.env.WEBHOOK_SECRET)) return next();
  }

  // Internal self-post: allow localhost only
  const ip = req.ip || req.connection?.remoteAddress || '';
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
    return next();
  }

  // Deny by default
  return res.status(403).json({ error: "Unauthorized" });
}

app.post("/webhook/call-complete", verifyWebhookOrigin, async (req, res) => {
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
    let { price_small, price_large, needs_review } = extractPrices(transcript);

    // Prefer Bland.ai's structured analysis if available (more reliable than regex)
    const analysis = payload.analysis || payload.variables || {};
    if (analysis.price && typeof analysis.price === 'number' && analysis.price >= 3 && analysis.price <= 15) {
      price_small = analysis.price;
      needs_review = false;
      console.log(`   📊 Using Bland.ai analysis price: $${analysis.price}`);
    }

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

    // Invalidate dashboard cache so next request gets fresh data
    dashboardCache = null;

    console.log(`✓ ${String(payload.metadata?.cafe_name || '').slice(0, 100)} (${String(payload.metadata?.suburb || '').slice(0, 50)}) — ${status} — small: $${price_small}, large: $${price_large}`);

    res.json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    // [SECURITY] Never leak internal error messages
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Live dashboard data API ---

let dashboardCache = null;
let dashboardCacheTime = 0;
const CACHE_TTL = 60000; // 60 seconds

function buildDashboardCache(priceData, callStats, discoveredCafes) {
  const suburbMap = {};
  priceData.forEach(row => {
    const suburb = row.cafes?.suburb || 'Unknown';
    if (!suburbMap[suburb]) {
      suburbMap[suburb] = { suburb, lat: null, lng: null, prices: [], cafes: [] };
    }
    if (suburbMap[suburb].lat == null && row.cafes?.lat != null) {
      suburbMap[suburb].lat = row.cafes.lat;
      suburbMap[suburb].lng = row.cafes.lng;
    }
    suburbMap[suburb].prices.push(row.price_small);
    suburbMap[suburb].cafes.push({
      name: row.cafes?.name, suburb,
      price: row.price_small, price_large: row.price_large,
      rating: row.cafes?.google_rating,
      lat: row.cafes?.lat, lng: row.cafes?.lng,
    });
  });

  const suburbs = Object.values(suburbMap).map(s => {
    const prices = s.prices.filter(p => p != null && p > 0).sort((a, b) => a - b);
    const avg = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
    return {
      suburb: s.suburb, avg_price: Math.round(avg * 100) / 100,
      sample_size: prices.length, min_price: prices[0] || null,
      max_price: prices[prices.length - 1] || null, lat: s.lat, lng: s.lng,
    };
  }).filter(s => s.sample_size > 0).sort((a, b) => a.avg_price - b.avg_price);

  const allCafes = Object.values(suburbMap).flatMap(s => s.cafes).filter(c => c.price);
  allCafes.sort((a, b) => a.price - b.price);
  const gems = allCafes.map(c => ({ name: c.name, suburb: c.suburb, price: c.price, rating: c.rating, lat: c.lat, lng: c.lng, note: '' }));

  const allPrices = priceData.map(r => r.price_small).filter(Boolean);
  const buckets = [
    { label: '$3–3.99', min: 3, max: 4 }, { label: '$4–4.49', min: 4, max: 4.5 },
    { label: '$4.50–4.99', min: 4.5, max: 5 }, { label: '$5–5.49', min: 5, max: 5.5 },
    { label: '$5.50–5.99', min: 5.5, max: 6 }, { label: '$6–6.49', min: 6, max: 6.5 },
    { label: '$6.50+', min: 6.5, max: 99 },
  ];
  const maxCount = Math.max(...buckets.map(b => allPrices.filter(p => p >= b.min && p < b.max).length), 1);
  const distribution = buckets.map(b => ({
    label: b.label, count: allPrices.filter(p => p >= b.min && p < b.max).length, max: maxCount,
  }));

  const avgPrice = allPrices.length > 0
    ? Math.round(allPrices.reduce((a, b) => a + b, 0) / allPrices.length * 100) / 100 : 0;

  const pricedCafeIds = new Set(priceData.map(r => r.cafe_id).filter(Boolean));
  const discovered = discoveredCafes
    .filter(c => c.lat && c.lng && !pricedCafeIds.has(c.id))
    .map(c => ({ name: c.name, suburb: c.suburb, lat: c.lat, lng: c.lng, rating: c.google_rating, status: 'discovered' }));

  // prices_collected = calls with an actual extracted price, not just status=completed
  const actualPrices = priceData.filter(r => r.price_small != null).length;

  // Filter out hidden suburbs from public dashboard
  const visibleSuburbs = suburbs.filter(s => !hiddenSuburbs.has(s.suburb));
  const visibleGems = gems.filter(g => !hiddenSuburbs.has(g.suburb));
  const visibleDiscovered = discovered.filter(d => !hiddenSuburbs.has(d.suburb));

  dashboardCache = {
    generated_at: new Date().toISOString(),
    total_cafes: callStats.cafes_total || discoveredCafes.length,
    total_eligible: callStats.cafes_eligible || discoveredCafes.length,
    total_excluded: callStats.cafes_excluded || 0,
    total_discovered: discoveredCafes.length,
    prices_collected: actualPrices,
    calls_total: callStats.total,
    avg_price: avgPrice, suburbs: visibleSuburbs, gems: visibleGems, distribution, discovered: visibleDiscovered,
  };
  dashboardCacheTime = Date.now();

  // Warn if cafe join is broken (all prices landing in Unknown)
  if (suburbs.length === 1 && suburbs[0]?.suburb === 'Unknown' && actualPrices > 0) {
    console.warn(`⚠️  All ${actualPrices} prices are grouped under 'Unknown' suburb — Supabase foreign-key join may be broken. Check that price_calls.cafe_id FK to cafes(id) is registered in the Supabase schema cache.`);
  }

  return dashboardCache;
}

app.get("/api/dashboard", async (req, res) => {
  if (!rateLimit('dashboard:' + (req.ip || 'unknown'), 60)) {
    return res.status(429).json({ error: "Too many requests" });
  }
  try {
    const now = Date.now();
    if (dashboardCache && (now - dashboardCacheTime) < CACHE_TTL) {
      return res.json(dashboardCache);
    }
    const [priceData, callStats, discoveredCafes] = await Promise.all([
      getPriceStats(), getCallStats(), getDiscoveredCafes(),
    ]);
    res.json(buildDashboardCache(priceData, callStats, discoveredCafes));
  } catch (err) {
    console.error("Dashboard API error:", err);
    res.status(500).json({ error: "Failed to load dashboard data" });
  }
});

// --- Newsletter subscriptions (Supabase-backed) ---

app.post("/api/subscribe", async (req, res) => {
  // [SECURITY] Rate limit: 10 subscribes per minute per IP
  const ip = req.ip || 'unknown';
  if (!rateLimit('sub:' + ip, 10)) {
    return res.status(429).json({ error: "Too many requests" });
  }

  const { email, source } = req.body;

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ error: "Valid email required" });
  }

  const sanitisedSource = typeof source === 'string' ? source.slice(0, 200) : 'website';
  const sanitised = email.toLowerCase().trim();

  try {
    const isNew = await saveSubscriberToDb(sanitised, sanitisedSource);
    console.log(`📧 ${isNew ? 'New' : 'Existing'} subscriber: ${sanitised.slice(0, 3)}*** (${sanitisedSource.slice(0, 30)})`);
    res.json({ ok: true, new: isNew });

    // Send welcome email to new subscribers (non-blocking)
    if (isNew && process.env.RESEND_API_KEY) {
      sendWelcomeEmail(sanitised).catch(err => console.warn('Welcome email failed:', err.message));
    }
  } catch (err) {
    console.error("Subscribe error:", err.message);
    res.status(500).json({ error: "Failed to save subscription" });
  }
});

// --- Unsubscribe ---

app.get("/unsubscribe", async (req, res) => {
  const email = req.query.email ? decodeURIComponent(req.query.email).toLowerCase().trim() : null;
  if (!email) return res.redirect('/');
  try {
    await deleteSubscriber(email);
    res.send(`<!DOCTYPE html><html lang="en-AU"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed</title></head><body style="font-family:-apple-system,sans-serif;background:#F7F3ED;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;"><div style="text-align:center;padding:2rem;"><div style="font-size:3rem;margin-bottom:1rem;">☕</div><h1 style="color:#2C1A0E;font-size:1.4rem;">You've been unsubscribed</h1><p style="color:#6B5840;margin:1rem 0;">No more emails from us. You can always come back.</p><a href="/" style="color:#8E5A28;">← Back to Flat White Index</a></div></body></html>`);
    console.log(`📧 Unsubscribed: ${email.slice(0, 3)}***`);
  } catch {
    res.status(500).send(`<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;"><p>Something went wrong. <a href="/">Return to Flat White Index</a></p></body></html>`);
  }
});

// --- User price submissions (separate endpoint, not piggybacking on subscribe) ---

app.post("/api/submit-price", async (req, res) => {
  const ip = req.ip || 'unknown';
  if (!rateLimit('price:' + ip, 5)) {
    return res.status(429).json({ error: "Too many requests" });
  }

  const { name, suburb, price_small, price_large } = req.body;
  if (!name || typeof name !== 'string' || name.length > 200) {
    return res.status(400).json({ error: "Valid cafe name required" });
  }
  if (!suburb || typeof suburb !== 'string' || suburb.length > 100) {
    return res.status(400).json({ error: "Valid suburb required" });
  }

  const small = price_small ? parseFloat(price_small) : null;
  const large = price_large ? parseFloat(price_large) : null;
  if (!small && !large) return res.status(400).json({ error: "At least one price required" });
  if ((small && (small < 2 || small > 20)) || (large && (large < 2 || large > 20))) {
    return res.status(400).json({ error: "Price out of range" });
  }

  try {
    await saveUserPriceSubmission({
      name: name.slice(0, 200),
      suburb: suburb.slice(0, 100),
      price_small: small,
      price_large: large,
    });
    console.log(`📋 Price submission: ${name.slice(0, 30)} (${suburb.slice(0, 20)}) — $${small || large}`);
    res.json({ ok: true });
  } catch (err) {
    console.error("Price submission error:", err.message);
    res.status(500).json({ error: "Failed to save submission" });
  }
});

// --- Admin panel (protected by ADMIN_SECRET) ---

function verifyAdmin(req, res, next) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return res.status(503).json({ error: "Admin not configured" });

  const provided = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!provided || !safeCompare(provided, secret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// Admin status — returns stats + avg price (cached 15s)
let adminStatusCache = null;
let adminStatusCacheTime = 0;

app.get("/api/admin/status", verifyAdmin, async (req, res) => {
  try {
    const now = Date.now();
    if (adminStatusCache && (now - adminStatusCacheTime) < 15000) {
      return res.json(adminStatusCache);
    }
    const [callStats, priceInfo] = await Promise.all([
      getCallStats(),
      getAvgPrice(),
    ]);
    adminStatusCache = { ...callStats, avg_price: priceInfo.avg, prices_extracted: priceInfo.count };
    adminStatusCacheTime = now;
    res.json(adminStatusCache);
  } catch (err) {
    console.error("Admin status error:", err.message);
    res.status(500).json({ error: "Failed to load stats" });
  }
});

// Admin: review count (lightweight — no transcripts)
app.get("/api/admin/review-count", verifyAdmin, async (req, res) => {
  try {
    const count = await getReviewCount();
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: reprocess all needs_review calls through updated price extraction + status inference
app.post("/api/admin/reprocess", verifyAdmin, async (req, res) => {
  try {
    const reviews = await getNeedsReviewCalls();
    let fixed = 0, voicemails = 0, unchanged = 0;

    for (const call of reviews) {
      const transcript = call.raw_transcript || '';

      // Re-check if this should be voicemail/IVR
      if (/please leave (a |us a )?message|leave a detailed message|after the (tone|beep)|cannot get to the phone|isn't available right now|please hold the line|your call will be answered|press \d|our operating hours|please call back|submit an? (email )?enquir|contact us through our website/i.test(transcript)) {
        await updateCallStatus(call.id, 'voicemail');
        voicemails++;
        continue;
      }

      // Re-extract prices with updated patterns
      const { price_small, price_large, needs_review } = extractPrices(transcript);
      if (price_small != null && !needs_review) {
        await updateCallPrice(call.id, price_small, price_large, true);
        fixed++;
      } else {
        unchanged++;
      }
    }

    console.log(`🔄 Reprocessed ${reviews.length} reviews: ${fixed} prices extracted, ${voicemails} reclassified as voicemail, ${unchanged} unchanged`);
    res.json({ ok: true, total: reviews.length, fixed, voicemails, unchanged });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to run a shell command and collect output
function runCmd(output, cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { cwd: __dirname, stdio: ['ignore', 'pipe', 'pipe'], shell: opts.shell || false });
    proc.stdout.on('data', d => d.toString().split('\n').filter(Boolean).forEach(l => output.push(l.trim())));
    proc.stderr.on('data', d => d.toString().split('\n').filter(Boolean).forEach(l => output.push(l.trim())));
    proc.on('close', code => resolve(code));
    setTimeout(() => { proc.kill(); resolve(-1); }, opts.timeout || 30000);
  });
}

// Admin deploy — git pull + npm install + syntax check (NO auto-restart)
app.post("/api/admin/deploy", verifyAdmin, async (req, res) => {
  if (!rateLimit('admin-deploy', 1)) {
    return res.status(429).json({ error: "Deploy already in progress — wait a moment" });
  }

  console.log("\n🚀 Admin deploy triggered");
  const output = [];

  try {
    output.push('$ git pull origin master');
    const pullCode = await runCmd(output, 'git', ['pull', 'origin', 'master']);
    if (pullCode !== 0) {
      return res.json({ ok: false, output: output.join('\n'), message: 'git pull failed (code ' + pullCode + ')' });
    }

    output.push('$ npm install --omit=dev');
    const installCode = await runCmd(output, 'npm', ['install', '--omit=dev'], { shell: true, timeout: 60000 });
    if (installCode !== 0) {
      output.push('⚠️ npm install failed — rolling back');
      await runCmd(output, 'git', ['checkout', '.']);
      return res.json({ ok: false, output: output.join('\n'), message: 'npm install failed — rolled back' });
    }

    output.push('$ node --check webhook.js');
    const checkCode = await runCmd(output, 'node', ['--check', 'webhook.js']);
    if (checkCode !== 0) {
      output.push('❌ Syntax error — rolling back');
      await runCmd(output, 'git', ['checkout', '.']);
      await runCmd(output, 'npm', ['install', '--omit=dev'], { shell: true, timeout: 60000 });
      return res.json({ ok: false, output: output.join('\n'), message: 'Syntax error — rolled back' });
    }

    output.push('✅ Code updated and verified. Click Restart to apply.');
    res.json({ ok: true, needsRestart: true, output: output.join('\n'), message: 'Code updated. Restart to apply.' });
  } catch (err) {
    res.status(500).json({ ok: false, output: output.join('\n'), error: err.message });
  }
});

// Admin restart — separate from deploy so the response fully flushes first
app.post("/api/admin/restart", verifyAdmin, (req, res) => {
  if (!rateLimit('admin-restart', 1)) {
    return res.status(429).json({ error: "Already restarting" });
  }
  console.log("🔄 Admin restart triggered");
  res.json({ ok: true, message: 'Restarting now...' });

  // Use res.on('finish') to ensure the response is fully sent before exiting
  res.on('finish', () => {
    setTimeout(() => {
      console.log("🔄 Exiting for systemd restart...");
      process.exit(0);
    }, 500);
  });
});

// Admin logs — fetch recent server logs from journalctl or in-memory ring buffer
const LOG_RING = [];
const LOG_RING_MAX = 500;
const _origLog = console.log;
const _origWarn = console.warn;
const _origErr = console.error;
function captureLog(level, args) {
  const line = { t: new Date().toISOString(), l: level, m: args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ') };
  LOG_RING.push(line);
  if (LOG_RING.length > LOG_RING_MAX) LOG_RING.shift();
}
console.log = (...args) => { captureLog('info', args); _origLog.apply(console, args); };
console.warn = (...args) => { captureLog('warn', args); _origWarn.apply(console, args); };
console.error = (...args) => { captureLog('error', args); _origErr.apply(console, args); };

app.get("/api/admin/logs", verifyAdmin, async (req, res) => {
  const source = req.query.source || 'ring';
  const lines = parseInt(req.query.lines) || 100;

  if (source === 'journal') {
    // Try journalctl for historical logs
    try {
      const journal = spawn('journalctl', ['-u', 'flatwhite-webhook', '-n', String(Math.min(lines, 500)), '--no-pager', '-o', 'short-iso'], { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      journal.stdout.on('data', d => { out += d.toString(); });
      journal.stderr.on('data', d => { out += d.toString(); });
      await new Promise(resolve => {
        journal.on('close', resolve);
        setTimeout(() => { journal.kill(); resolve(); }, 5000);
      });
      return res.json({ source: 'journal', lines: out.split('\n').filter(Boolean) });
    } catch {
      return res.json({ source: 'journal', lines: ['journalctl not available'], error: true });
    }
  }

  // Default: in-memory ring buffer
  res.json({ source: 'ring', lines: LOG_RING.slice(-lines) });
});

// Admin hidden suburbs — toggle visibility on public dashboard
app.get("/api/admin/hidden-suburbs", verifyAdmin, (req, res) => {
  res.json([...hiddenSuburbs]);
});

app.post("/api/admin/hidden-suburbs", verifyAdmin, (req, res) => {
  const { suburb, hidden } = req.body;
  if (!suburb || typeof suburb !== 'string') return res.status(400).json({ error: 'suburb required' });
  if (hidden) { hiddenSuburbs.add(suburb); } else { hiddenSuburbs.delete(suburb); }
  saveHiddenSuburbs();
  dashboardCache = null; // Invalidate so next request rebuilds
  console.log(`🔧 Suburb "${suburb}" ${hidden ? 'hidden' : 'shown'} on public dashboard`);
  res.json({ ok: true, hidden: [...hiddenSuburbs] });
});

// Admin suburb progress — per-suburb call stats (cached 30s)
let suburbProgressCache = null;
let suburbProgressCacheTime = 0;

app.get("/api/admin/suburb-progress", verifyAdmin, async (req, res) => {
  try {
    const now = Date.now();
    if (suburbProgressCache && (now - suburbProgressCacheTime) < 30000) {
      return res.json(suburbProgressCache);
    }
    suburbProgressCache = await getSuburbProgress();
    suburbProgressCacheTime = now;
    res.json(suburbProgressCache);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin dispatch — spawns index.js as child process
let activeJob = null;

app.post("/api/admin/dispatch", verifyAdmin, async (req, res) => {
  if (!rateLimit('admin-dispatch', 2)) {
    return res.status(429).json({ error: "Too many requests — wait a moment" });
  }

  if (activeJob) {
    return res.status(409).json({ error: "A job is already running" });
  }

  const { suburb, batchSize, dryRun } = req.body;
  const args = [];

  if (suburb && typeof suburb === 'string' && /^[a-z_]+$/.test(suburb)) {
    args.push(`--suburb=${suburb}`);
  }

  const size = Math.min(Math.max(parseInt(batchSize) || 10, 1), 50);
  args.push(`--batch-size=${size}`);

  if (dryRun !== false) {
    args.push('--dry-run');
  }

  console.log(`\n🔧 Admin dispatch: node index.js ${args.join(' ')}`);

  const output = [];
  const child = spawn('node', ['index.js', ...args], {
    cwd: __dirname,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  activeJob = { pid: child.pid, started: Date.now(), args };

  child.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    lines.forEach(l => {
      if (output.length < 1000) output.push(l);
      console.log(`  [dispatch] ${l}`);
    });
  });

  child.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    lines.forEach(l => {
      output.push(`[stderr] ${l}`);
      console.warn(`  [dispatch:err] ${l}`);
    });
  });

  child.on('close', (code) => {
    const duration = ((Date.now() - activeJob.started) / 1000).toFixed(1);
    console.log(`  [dispatch] Exited with code ${code} in ${duration}s`);
    activeJob = null;
  });

  const jobStarted = activeJob.started;

  // Wait for the process to finish (up to 5 minutes)
  const exitCode = await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.kill();
      resolve(-1);
    }, 300000);
    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });

  const elapsed = ((Date.now() - jobStarted) / 1000).toFixed(1);
  const summary = exitCode === 0
    ? `Completed in ${elapsed}s`
    : `Exited with code ${exitCode} after ${elapsed}s`;

  res.json({
    ok: exitCode === 0,
    exitCode,
    summary,
    output: output.join('\n'),
  });
});

// Admin: list recent calls
app.get("/api/admin/calls", verifyAdmin, async (req, res) => {
  try {
    const status = req.query.status || null;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const data = await getRecentCalls(limit, status);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: update a call's price
app.patch("/api/admin/calls/:id/price", verifyAdmin, async (req, res) => {
  try {
    const { price_small, price_large, approve } = req.body;
    await updateCallPrice(req.params.id, price_small ?? null, price_large ?? null, approve !== false);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: update a call's status
app.patch("/api/admin/calls/:id/status", verifyAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ["pending", "completed", "no_answer", "voicemail", "refused", "failed", "no_flat_white"];
    if (!valid.includes(status)) return res.status(400).json({ error: "Invalid status" });
    await updateCallStatus(req.params.id, status);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: delete a call
app.delete("/api/admin/calls/:id", verifyAdmin, async (req, res) => {
  try {
    await deleteCall(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: retry a failed call (removes it so it gets re-queued)
app.post("/api/admin/calls/:id/retry", verifyAdmin, async (req, res) => {
  try {
    await retryCall(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: bulk retry all failed/no_answer calls
app.post("/api/admin/calls/bulk-retry", verifyAdmin, async (req, res) => {
  try {
    const count = await bulkRetryFailed();
    res.json({ ok: true, cleared: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: needs review queue
app.get("/api/admin/review", verifyAdmin, async (req, res) => {
  try {
    const data = await getNeedsReviewCalls();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: search/list cafes
app.get("/api/admin/cafes", verifyAdmin, async (req, res) => {
  try {
    const query = req.query.q || '';
    const status = req.query.status || null;
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const data = await searchCafes(query, status, limit);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: update a cafe
app.patch("/api/admin/cafes/:id", verifyAdmin, async (req, res) => {
  try {
    await updateCafe(req.params.id, req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: delete a cafe
app.delete("/api/admin/cafes/:id", verifyAdmin, async (req, res) => {
  try {
    await deleteCafe(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: list subscribers
app.get("/api/admin/subscribers", verifyAdmin, async (req, res) => {
  try {
    const data = await getSubscribers();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: delete subscriber
app.delete("/api/admin/subscribers/:email", verifyAdmin, async (req, res) => {
  try {
    await deleteSubscriber(decodeURIComponent(req.params.email));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: list user price submissions
app.get("/api/admin/submissions", verifyAdmin, async (req, res) => {
  try {
    const data = await getUserSubmissions();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: delete user submission
app.delete("/api/admin/submissions/:id", verifyAdmin, async (req, res) => {
  try {
    await deleteUserSubmission(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: system info
app.get("/api/admin/system", verifyAdmin, async (req, res) => {
  const dbStatus = await testConnection();
  const mem = process.memoryUsage();
  const uptime = process.uptime();

  // Check call hours (9am-4pm AEST weekdays)
  const now = new Date();
  const aest = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
  const hour = aest.getHours();
  const day = aest.getDay();
  const inCallHours = day >= 1 && day <= 5 && hour >= 9 && hour < 16;

  // Check which env vars are set (never expose values)
  const envCheck = {};
  for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'BLAND_AI_API_KEY', 'GOOGLE_PLACES_API_KEY',
    'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER', 'OPENAI_API_KEY',
    'WEBHOOK_BASE_URL', 'WEBHOOK_SECRET', 'ADMIN_SECRET', 'CALL_PROVIDER']) {
    envCheck[key] = !!process.env[key];
  }

  res.json({
    database: dbStatus,
    uptime_seconds: Math.round(uptime),
    uptime_human: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024) + ' MB',
      heap_used: Math.round(mem.heapUsed / 1024 / 1024) + ' MB',
      heap_total: Math.round(mem.heapTotal / 1024 / 1024) + ' MB',
    },
    call_hours: {
      in_window: inCallHours,
      current_aest: aest.toLocaleTimeString('en-AU', { hour12: false }),
      window: '09:00–16:00 AEST, Mon–Fri',
    },
    env: envCheck,
    node_version: process.version,
    call_provider: process.env.CALL_PROVIDER || 'bland',
    active_job: activeJob ? { pid: activeJob.pid, args: activeJob.args, running_for: Math.round((Date.now() - activeJob.started) / 1000) + 's' } : null,
  });
});

// Redirect /admin to admin.html
app.get("/admin", (req, res) => {
  res.sendFile(join(__dirname, 'public', 'admin.html'));
});

// [SECURITY] Health endpoint — verifies DB connectivity
app.get("/health", async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  const dbStatus = await testConnection();
  const ok = dbStatus.ok;
  res.status(ok ? 200 : 503).json({
    ok,
    service: "flatwhiteindex-webhook",
    database: dbStatus.ok ? "connected" : "error",
  });
});

function validateEnv() {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY"];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`❌ Missing required env vars: ${missing.join(", ")}`);
    process.exit(1);
  }
}

// Twilio status callback — update DB for failed/no-answer/voicemail calls
app.post("/webhook/twilio-status", verifyWebhookOrigin, async (req, res) => {
  const { CallSid, CallStatus, AnsweredBy, Duration, ErrorCode, ErrorMessage } = req.body;
  console.log(`📱 Twilio status: ${CallSid} — ${CallStatus} (${AnsweredBy || 'unknown'}) duration=${Duration || 0}s${ErrorCode ? ' error=' + ErrorCode + ': ' + ErrorMessage : ''}`);

  // Map Twilio status to our status
  const statusMap = {
    'no-answer': 'no_answer',
    'busy': 'no_answer',
    'failed': 'failed',
    'canceled': 'failed',
  };

  const dbStatus = statusMap[CallStatus];
  const isVoicemail = AnsweredBy === 'machine_start' || AnsweredBy === 'machine_end_beep' || AnsweredBy === 'machine_end_silence';

  if (dbStatus || isVoicemail) {
    try {
      // Don't overwrite if we already saved a completed result with a price
      const existing = await getCallByBlandId(CallSid);
      if (existing && (existing.status === 'completed' && (existing.price_small || existing.price_large))) {
        console.log(`    ⏭️  Skipping ${isVoicemail ? 'voicemail' : dbStatus} — already have price for ${CallSid}`);
      } else if (existing && existing.status === 'completed') {
        // Completed but no price — voicemail detection was right
        await saveCallResult({
          bland_call_id: CallSid,
          status: isVoicemail ? 'voicemail' : dbStatus,
          price_small: null,
          price_large: null,
          raw_transcript: existing.raw_transcript || (isVoicemail ? '[voicemail detected]' : `[${CallStatus}]`),
          needs_review: false,
          completed_at: new Date().toISOString(),
        });
        console.log(`    💾 Corrected to ${isVoicemail ? 'voicemail' : dbStatus} for ${CallSid} (no price)`);
      } else {
        await saveCallResult({
          bland_call_id: CallSid,
          status: isVoicemail ? 'voicemail' : dbStatus,
          price_small: null,
          price_large: null,
          raw_transcript: isVoicemail ? '[voicemail detected]' : `[${String(CallStatus).slice(0, 20)}]${ErrorMessage ? ' ' + String(ErrorMessage).slice(0, 200) : ''}`,
          needs_review: false,
          completed_at: new Date().toISOString(),
        });
        console.log(`    💾 Saved ${isVoicemail ? 'voicemail' : dbStatus} status for ${CallSid}`);
      }
    } catch (err) {
      console.error(`    ❌ Failed to save status for ${CallSid}:`, err.message);
    }
  }

  res.sendStatus(200);
});

const isMainModule = process.argv[1]?.replace(/\\/g, "/").endsWith("webhook.js");
if (isMainModule) {
  validateEnv();
  const PORT = process.env.PORT || 3001;
  const server = app.listen(PORT, async () => {
    console.log(`\n🪝  Webhook receiver listening on port ${PORT}`);
    console.log(`   POST /webhook/call-complete`);
    console.log(`   POST /api/subscribe`);
    console.log(`   GET  /health`);
    console.log(`   Dashboard: http://localhost:${PORT}/`);

    // Warm the dashboard cache so first visitor gets instant data
    try {
      const [priceData, callStats, discoveredCafes] = await Promise.all([
        getPriceStats(), getCallStats(), getDiscoveredCafes(),
      ]);
      buildDashboardCache(priceData, callStats, discoveredCafes);
      console.log(`   📊 Dashboard cache warmed`);
    } catch {}

    // Set up Twilio media stream WebSocket if using Twilio provider
    if (process.env.CALL_PROVIDER === "twilio") {
      try {
        const { setupMediaStreamServer } = await import("./caller-twilio.js");
        if (setupMediaStreamServer) {
          setupMediaStreamServer(server);
          console.log(`   WSS /media-stream (Twilio + OpenAI Realtime)`);
        }
      } catch (err) {
        console.warn("⚠️  Twilio media stream setup failed:", err.message);
      }
    }
  });

  function shutdown(signal) {
    console.log(`${signal} received — shutting down...`);
    server.close(() => process.exit(0));
    // Force exit after 10s if connections don't close cleanly
    setTimeout(() => process.exit(1), 10000).unref();
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled rejection:", reason);
  });
}

export default app;
