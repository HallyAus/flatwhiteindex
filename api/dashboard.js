import { getPriceStats, getCallStats, getDiscoveredCafes } from "../db.js";
import { rateLimit, clientIp } from "../lib/rate-limit.js";
import { supabase } from "../lib/supabase.js";

export const config = { runtime: "nodejs" };

let _cachedHiddenSuburbs = null;
let _cachedHiddenAt = 0;
const HIDDEN_TTL_MS = 30_000;

async function getHiddenSuburbs() {
  const now = Date.now();
  if (_cachedHiddenSuburbs && now - _cachedHiddenAt < HIDDEN_TTL_MS) return _cachedHiddenSuburbs;
  try {
    const { data, error } = await supabase()
      .from("hidden_suburbs")
      .select("suburb")
      .eq("hidden", true);
    if (error) throw error;
    _cachedHiddenSuburbs = new Set((data || []).map((r) => r.suburb));
    _cachedHiddenAt = now;
    return _cachedHiddenSuburbs;
  } catch (err) {
    console.warn("getHiddenSuburbs error:", err.message);
    return new Set();
  }
}

function buildDashboard(priceData, callStats, discoveredCafes, hidden) {
  const suburbMap = {};
  priceData.forEach((row) => {
    const suburb = row.cafes?.suburb || "Unknown";
    if (!suburbMap[suburb]) {
      suburbMap[suburb] = { suburb, lat: null, lng: null, prices: [], cafes: [] };
    }
    if (suburbMap[suburb].lat == null && row.cafes?.lat != null) {
      suburbMap[suburb].lat = row.cafes.lat;
      suburbMap[suburb].lng = row.cafes.lng;
    }
    suburbMap[suburb].prices.push(row.price_small);
    suburbMap[suburb].cafes.push({
      name: row.cafes?.name,
      suburb,
      price: row.price_small,
      price_large: row.price_large,
      rating: row.cafes?.google_rating,
      lat: row.cafes?.lat,
      lng: row.cafes?.lng,
    });
  });

  const suburbs = Object.values(suburbMap)
    .map((s) => {
      const prices = s.prices.filter((p) => p != null && p > 0).sort((a, b) => a - b);
      const avg = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
      return {
        suburb: s.suburb,
        avg_price: Math.round(avg * 100) / 100,
        sample_size: prices.length,
        min_price: prices[0] || null,
        max_price: prices[prices.length - 1] || null,
        lat: s.lat,
        lng: s.lng,
      };
    })
    .filter((s) => s.sample_size > 0)
    .sort((a, b) => a.avg_price - b.avg_price);

  const allCafes = Object.values(suburbMap).flatMap((s) => s.cafes).filter((c) => c.price);
  allCafes.sort((a, b) => a.price - b.price);
  const gems = allCafes.map((c) => ({
    name: c.name, suburb: c.suburb, price: c.price, rating: c.rating, lat: c.lat, lng: c.lng, note: "",
  }));

  const allPrices = priceData.map((r) => r.price_small).filter(Boolean);
  const buckets = [
    { label: "$3–3.99", min: 3, max: 4 },
    { label: "$4–4.49", min: 4, max: 4.5 },
    { label: "$4.50–4.99", min: 4.5, max: 5 },
    { label: "$5–5.49", min: 5, max: 5.5 },
    { label: "$5.50–5.99", min: 5.5, max: 6 },
    { label: "$6–6.49", min: 6, max: 6.5 },
    { label: "$6.50+", min: 6.5, max: 99 },
  ];
  const maxCount = Math.max(...buckets.map((b) => allPrices.filter((p) => p >= b.min && p < b.max).length), 1);
  const distribution = buckets.map((b) => ({
    label: b.label,
    count: allPrices.filter((p) => p >= b.min && p < b.max).length,
    max: maxCount,
  }));

  const avgPrice =
    allPrices.length > 0
      ? Math.round((allPrices.reduce((a, b) => a + b, 0) / allPrices.length) * 100) / 100
      : 0;

  const pricedCafeIds = new Set(priceData.map((r) => r.cafe_id).filter(Boolean));
  const discovered = discoveredCafes
    .filter((c) => c.lat && c.lng && !pricedCafeIds.has(c.id))
    .map((c) => ({
      name: c.name, suburb: c.suburb, lat: c.lat, lng: c.lng, rating: c.google_rating, status: "discovered",
    }));

  const actualPrices = priceData.filter((r) => r.price_small != null).length;

  const visibleSuburbs = suburbs.filter((s) => !hidden.has(s.suburb));
  const visibleGems = gems.filter((g) => !hidden.has(g.suburb));
  const visibleDiscovered = discovered.filter((d) => !hidden.has(d.suburb));

  return {
    generated_at: new Date().toISOString(),
    total_cafes: callStats.cafes_total || discoveredCafes.length,
    total_eligible: callStats.cafes_eligible || discoveredCafes.length,
    total_excluded: callStats.cafes_excluded || 0,
    total_discovered: discoveredCafes.length,
    prices_collected: actualPrices,
    calls_total: callStats.total,
    avg_price: avgPrice,
    suburbs: visibleSuburbs,
    gems: visibleGems,
    distribution,
    discovered: visibleDiscovered,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const ip = clientIp(req);
  if (!(await rateLimit("dashboard", ip, 60))) {
    return res.status(429).json({ error: "Too many requests" });
  }
  try {
    const [priceData, callStats, discoveredCafes, hidden] = await Promise.all([
      getPriceStats(),
      getCallStats(),
      getDiscoveredCafes(),
      getHiddenSuburbs(),
    ]);
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    res.json(buildDashboard(priceData, callStats, discoveredCafes, hidden));
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ error: "Failed to load dashboard data" });
  }
}
