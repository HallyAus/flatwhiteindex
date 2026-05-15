import { deleteSubscriber } from "../db.js";
import { rateLimit, clientIp } from "../lib/rate-limit.js";

export const config = { runtime: "nodejs" };

const SUCCESS_HTML = `<!DOCTYPE html><html lang="en-AU"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed</title></head><body style="font-family:-apple-system,sans-serif;background:#F7F3ED;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;"><div style="text-align:center;padding:2rem;"><div style="font-size:3rem;margin-bottom:1rem;">☕</div><h1 style="color:#2C1A0E;font-size:1.4rem;">You've been unsubscribed</h1><p style="color:#6B5840;margin:1rem 0;">No more emails from us. You can always come back.</p><a href="/" style="color:#8E5A28;">← Back to Flat White Index</a></div></body></html>`;

const ERROR_HTML = `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;"><p>Something went wrong. <a href="/">Return to Flat White Index</a></p></body></html>`;

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method not allowed");
  const ip = clientIp(req);
  if (!(await rateLimit("unsubscribe", ip, 5))) {
    res.setHeader("Content-Type", "text/plain");
    return res.status(429).send("Too many requests");
  }
  let email = null;
  try {
    email = req.query.email ? decodeURIComponent(req.query.email).toLowerCase().trim() : null;
  } catch {
    /* malformed URI */
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.writeHead(302, { Location: "/" });
    return res.end();
  }
  try {
    await deleteSubscriber(email);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(SUCCESS_HTML);
  } catch (err) {
    console.error("Unsubscribe error:", err.message);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(500).send(ERROR_HTML);
  }
}
