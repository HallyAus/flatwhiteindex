import { saveUserPriceSubmission } from "../db.js";
import { rateLimit, clientIp } from "../lib/rate-limit.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const ip = clientIp(req);
  if (!(await rateLimit("submit-price", ip, 5))) {
    return res.status(429).json({ error: "Too many requests" });
  }

  const { name, suburb, price_small, price_large } = req.body || {};
  if (!name || typeof name !== "string" || name.length > 200) {
    return res.status(400).json({ error: "Valid cafe name required" });
  }
  if (!suburb || typeof suburb !== "string" || suburb.length > 100) {
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
    res.json({ ok: true });
  } catch (err) {
    console.error("Price submission error:", err.message);
    res.status(500).json({ error: "Failed to save submission" });
  }
}
