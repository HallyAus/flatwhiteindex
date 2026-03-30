// Weekly price digest — run via cron: 0 8 * * 1 (Monday 8am)
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function getDigestData() {
  // Get price stats
  const { data: prices, error: pricesErr } = await supabase
    .from("price_calls")
    .select("price_small, price_large, cafes(name, suburb)")
    .eq("status", "completed")
    .not("price_small", "is", null);

  if (pricesErr) throw pricesErr;

  // Get call stats
  const { count: totalCalls } = await supabase.from("price_calls").select("*", { count: "exact", head: true });
  const { count: totalCafes } = await supabase.from("cafes").select("*", { count: "exact", head: true });

  // Calculate stats
  const allPrices = prices.map(p => p.price_small).filter(Boolean);
  const avg = allPrices.length > 0
    ? Math.round(allPrices.reduce((a, b) => a + b, 0) / allPrices.length * 100) / 100
    : 0;

  const sorted = [...allPrices].sort((a, b) => a - b);
  const cheapest = prices.filter(p => p.price_small === sorted[0])[0];
  const dearest = prices.filter(p => p.price_small === sorted[sorted.length - 1])[0];

  // Group by suburb
  const suburbMap = {};
  prices.forEach(p => {
    const suburb = p.cafes?.suburb || 'Unknown';
    if (!suburbMap[suburb]) suburbMap[suburb] = [];
    suburbMap[suburb].push(p.price_small);
  });

  const suburbs = Object.entries(suburbMap).map(([name, prices]) => ({
    name,
    avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length * 100) / 100,
    count: prices.length,
  })).sort((a, b) => a.avg - b.avg);

  return {
    totalCafes: totalCafes ?? 0,
    totalCalls: totalCalls ?? 0,
    pricesCollected: allPrices.length,
    avgPrice: avg,
    cheapest: cheapest ? { name: cheapest.cafes?.name, suburb: cheapest.cafes?.suburb, price: cheapest.price_small } : null,
    dearest: dearest ? { name: dearest.cafes?.name, suburb: dearest.cafes?.suburb, price: dearest.price_small } : null,
    cheapestSuburb: suburbs[0] || null,
    dearestSuburb: suburbs[suburbs.length - 1] || null,
    topSuburbs: suburbs.slice(0, 5),
    bottomSuburbs: suburbs.slice(-3),
  };
}

function buildEmail(data) {
  const date = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F7F3ED;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:20px;">

  <div style="background:#2C1A0E;border-radius:16px;padding:32px;text-align:center;margin-bottom:24px;">
    <div style="font-size:40px;margin-bottom:8px;">☕</div>
    <h1 style="color:#F7F3ED;font-size:24px;margin:0 0 4px;">Flat White Index</h1>
    <p style="color:#B5763A;font-size:14px;margin:0;letter-spacing:2px;">WEEKLY PRICE DIGEST</p>
    <p style="color:rgba(247,243,237,0.5);font-size:12px;margin:8px 0 0;">${date}</p>
  </div>

  <div style="background:white;border-radius:12px;padding:24px;margin-bottom:16px;border:1px solid rgba(107,58,31,0.1);">
    <div style="text-align:center;margin-bottom:20px;">
      <div style="font-size:48px;font-weight:700;color:#2C1A0E;">$${data.avgPrice.toFixed(2)}</div>
      <div style="font-size:14px;color:#8B7355;">Average Sydney flat white</div>
    </div>
    <div style="display:flex;justify-content:space-around;text-align:center;border-top:1px solid rgba(107,58,31,0.1);padding-top:16px;">
      <div>
        <div style="font-size:24px;font-weight:600;color:#2C1A0E;">${data.pricesCollected}</div>
        <div style="font-size:11px;color:#8B7355;text-transform:uppercase;letter-spacing:1px;">Prices</div>
      </div>
      <div>
        <div style="font-size:24px;font-weight:600;color:#2C1A0E;">${data.totalCalls}</div>
        <div style="font-size:11px;color:#8B7355;text-transform:uppercase;letter-spacing:1px;">Calls Made</div>
      </div>
      <div>
        <div style="font-size:24px;font-weight:600;color:#2C1A0E;">${data.totalCafes}</div>
        <div style="font-size:11px;color:#8B7355;text-transform:uppercase;letter-spacing:1px;">Cafes Found</div>
      </div>
    </div>
  </div>

  ${data.cheapest ? `
  <div style="display:flex;gap:12px;margin-bottom:16px;">
    <div style="flex:1;background:white;border-radius:12px;padding:16px;border:1px solid rgba(107,58,31,0.1);">
      <div style="font-size:11px;color:#3A7D44;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Cheapest</div>
      <div style="font-size:20px;font-weight:700;color:#3A7D44;">$${data.cheapest.price.toFixed(2)}</div>
      <div style="font-size:13px;color:#2C1A0E;margin-top:2px;">${data.cheapest.name}</div>
      <div style="font-size:11px;color:#8B7355;">${data.cheapest.suburb}</div>
    </div>
    <div style="flex:1;background:white;border-radius:12px;padding:16px;border:1px solid rgba(107,58,31,0.1);">
      <div style="font-size:11px;color:#C0392B;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Dearest</div>
      <div style="font-size:20px;font-weight:700;color:#C0392B;">$${data.dearest.price.toFixed(2)}</div>
      <div style="font-size:13px;color:#2C1A0E;margin-top:2px;">${data.dearest.name}</div>
      <div style="font-size:11px;color:#8B7355;">${data.dearest.suburb}</div>
    </div>
  </div>` : ''}

  ${data.topSuburbs.length > 0 ? `
  <div style="background:white;border-radius:12px;padding:20px;margin-bottom:16px;border:1px solid rgba(107,58,31,0.1);">
    <div style="font-size:14px;font-weight:600;color:#2C1A0E;margin-bottom:12px;">Cheapest Suburbs</div>
    ${data.topSuburbs.map((s, i) => `
    <div style="display:flex;justify-content:space-between;padding:8px 0;${i < data.topSuburbs.length - 1 ? 'border-bottom:1px solid rgba(107,58,31,0.06);' : ''}">
      <span style="font-size:13px;color:#2C1A0E;">${i + 1}. ${s.name} <span style="color:#8B7355;font-size:11px;">(${s.count} cafes)</span></span>
      <span style="font-size:13px;font-weight:600;color:#3A7D44;">$${s.avg.toFixed(2)}</span>
    </div>`).join('')}
  </div>` : ''}

  <div style="text-align:center;padding:20px 0;">
    <a href="https://flatwhiteindex.com.au" style="display:inline-block;padding:14px 32px;background:#2C1A0E;color:#F7F3ED;text-decoration:none;border-radius:10px;font-size:14px;font-weight:500;">View Full Dashboard</a>
  </div>

  <div style="text-align:center;padding:16px 0;border-top:1px solid rgba(107,58,31,0.1);">
    <p style="font-size:11px;color:#8B7355;margin:0;">
      Flat White Index — flatwhiteindex.com.au<br>
      Part of <a href="https://agenticconsciousness.com.au" style="color:#8E5A28;">Agentic Consciousness</a><br><br>
      <a href="https://flatwhiteindex.com.au/unsubscribe?email={{EMAIL}}" style="color:#8B7355;">Unsubscribe</a>
    </p>
  </div>

</div>
</body>
</html>`;
}

async function getSubscribers() {
  const { data, error } = await supabase
    .from("subscribers")
    .select("email")
    .order("subscribed_at", { ascending: false });

  if (error) throw error;
  return data.map(s => s.email);
}

async function sendDigest() {
  console.log("📧 Flat White Index — Weekly Digest\n");

  const data = await getDigestData();
  console.log(`   Avg price: $${data.avgPrice}`);
  console.log(`   Prices collected: ${data.pricesCollected}`);
  console.log(`   Total calls: ${data.totalCalls}`);

  if (data.pricesCollected === 0) {
    console.log("   ⚠️  No prices collected yet — skipping digest.");
    return;
  }

  const subscribers = await getSubscribers();
  console.log(`   Subscribers: ${subscribers.length}\n`);

  if (subscribers.length === 0) {
    console.log("   ⚠️  No subscribers — skipping.");
    return;
  }

  // Build email
  const html = buildEmail(data);

  // Set up transporter
  if (!process.env.SMTP_HOST) {
    console.log("   ⚠️  SMTP not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in .env");
    console.log("   📋 Preview (first 500 chars):\n");
    console.log(html.replace(/<[^>]+>/g, '').slice(0, 500));
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  let sent = 0;
  let failed = 0;
  for (const email of subscribers) {
    try {
      const personalised = html.replace(/\{\{EMAIL\}\}/g, encodeURIComponent(email));
      await transporter.sendMail({
        from: process.env.SMTP_FROM || '"Flat White Index" <hello@flatwhiteindex.com.au>',
        to: email,
        subject: `☕ Your weekly flat white price update — avg $${data.avgPrice.toFixed(2)}`,
        html: personalised,
      });
      sent++;
    } catch (err) {
      failed++;
      console.warn(`   ❌ Failed: ${email.slice(0, 3)}*** — ${err.message}`);
    }
  }

  console.log(`\n   ✅ Sent: ${sent}, Failed: ${failed}`);
}

sendDigest().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
