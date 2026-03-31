// Weekly price digest — run via cron: 0 8 * * 1 (Monday 8am)
// Uses Resend for email delivery
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { weeklyDigestEmail } from "./email-templates.js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function getDigestData() {
  const { data: prices, error: pricesErr } = await supabase
    .from("price_calls")
    .select("price_small, price_large, cafes(name, suburb)")
    .eq("status", "completed")
    .not("price_small", "is", null);

  if (pricesErr) throw pricesErr;

  const { count: totalCalls } = await supabase.from("price_calls").select("*", { count: "exact", head: true });
  const { count: totalCafes } = await supabase.from("cafes").select("*", { count: "exact", head: true });

  const allPrices = prices.map(p => p.price_small).filter(Boolean);
  const avg = allPrices.length > 0
    ? Math.round(allPrices.reduce((a, b) => a + b, 0) / allPrices.length * 100) / 100
    : 0;

  const sorted = [...allPrices].sort((a, b) => a - b);
  const cheapest = prices.filter(p => p.price_small === sorted[0])[0];
  const dearest = prices.filter(p => p.price_small === sorted[sorted.length - 1])[0];

  const suburbMap = {};
  prices.forEach(p => {
    const suburb = p.cafes?.suburb || 'Unknown';
    if (!suburbMap[suburb]) suburbMap[suburb] = [];
    suburbMap[suburb].push(p.price_small);
  });

  const suburbs = Object.entries(suburbMap).map(([name, sp]) => ({
    name,
    avg: Math.round(sp.reduce((a, b) => a + b, 0) / sp.length * 100) / 100,
    count: sp.length,
  })).sort((a, b) => a.avg - b.avg);

  return {
    totalCafes: totalCafes ?? 0,
    totalCalls: totalCalls ?? 0,
    pricesCollected: allPrices.length,
    avgPrice: avg,
    cheapest: cheapest ? { name: cheapest.cafes?.name, suburb: cheapest.cafes?.suburb, price: cheapest.price_small } : null,
    dearest: dearest ? { name: dearest.cafes?.name, suburb: dearest.cafes?.suburb, price: dearest.price_small } : null,
    topSuburbs: suburbs.slice(0, 5),
  };
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

  if (!process.env.RESEND_API_KEY) {
    console.log("   ⚠️  RESEND_API_KEY not set. Set it in .env");
    const { subject, html } = weeklyDigestEmail(data);
    console.log(`   Subject: ${subject}`);
    console.log(`   📋 Preview:\n`);
    console.log(html.replace(/<[^>]+>/g, '').slice(0, 500));
    return;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.EMAIL_FROM || 'Flat White Index <hello@flatwhiteindex.com.au>';

  let sent = 0;
  let failed = 0;
  for (const email of subscribers) {
    try {
      const unsubUrl = `https://flatwhiteindex.com.au/unsubscribe?email=${encodeURIComponent(email)}`;
      const { subject, html } = weeklyDigestEmail(data);
      const personalised = html.replace(/\{\{UNSUBSCRIBE_URL\}\}/g, unsubUrl);

      await resend.emails.send({
        from,
        to: email,
        subject,
        html: personalised,
      });
      sent++;
      console.log(`   ✓ ${email.slice(0, 3)}***`);
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
