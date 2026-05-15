import { saveSubscriberToDb } from "../db.js";
import { rateLimit, clientIp } from "../lib/rate-limit.js";

export const config = { runtime: "nodejs" };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function sendWelcomeEmail(email) {
  if (!process.env.RESEND_API_KEY) return;
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { welcomeEmail } = await import("../scripts/email-templates.js");
    const { subject, html } = welcomeEmail({ avgPrice: 5.8, totalCafes: 847, totalPrices: 847 });
    const unsubUrl = `https://www.flatwhiteindex.com.au/unsubscribe?email=${encodeURIComponent(email)}`;
    const personalised = html.replace(/\{\{UNSUBSCRIBE_URL\}\}/g, unsubUrl);
    const from = process.env.EMAIL_FROM || "Flat White Index <hello@flatwhiteindex.com.au>";
    await resend.emails.send({ from, to: email, subject, html: personalised });
  } catch (err) {
    console.warn("Welcome email failed:", err.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const ip = clientIp(req);
  if (!(await rateLimit("subscribe", ip, 10))) {
    return res.status(429).json({ error: "Too many requests" });
  }

  const { email, source } = req.body || {};
  if (!email || typeof email !== "string" || !EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ error: "Valid email required" });
  }

  const sanitisedSource = typeof source === "string" ? source.slice(0, 200) : "website";
  const sanitised = email.toLowerCase().trim();

  try {
    const isNew = await saveSubscriberToDb(sanitised, sanitisedSource);
    res.json({ ok: true, new: isNew });
    if (isNew) {
      // Fire-and-forget on a Function is risky (the runtime may freeze on response).
      // Await it to make sure the email actually sends before the function exits.
      await sendWelcomeEmail(sanitised);
    }
  } catch (err) {
    console.error("Subscribe error:", err.message);
    res.status(500).json({ error: "Failed to save subscription" });
  }
}
