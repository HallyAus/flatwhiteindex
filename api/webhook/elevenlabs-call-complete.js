import { saveCallResult } from "../../db.js";
import { extractPrices } from "../../lib/extract-prices.js";
import { verifyElevenLabsSignature, isWebhookProcessed, readRawBody, safeCompare } from "../../lib/webhook-verify.js";
import { rateLimit, clientIp } from "../../lib/rate-limit.js";

// Disable body parsing — we need the raw bytes for HMAC verification.
export const config = {
  runtime: "nodejs",
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!(await rateLimit("webhook", clientIp(req), 100))) {
    return res.status(429).json({ error: "Too many requests" });
  }

  // 1. Read the raw body (so HMAC can hash exactly the bytes ElevenLabs signed)
  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (err) {
    return res.status(400).json({ error: "Failed to read body" });
  }

  // 2. Verify signature. Prefer ElevenLabs HMAC; fall back to shared secret.
  const sigHeader = req.headers["elevenlabs-signature"];
  if (sigHeader) {
    const status = verifyElevenLabsSignature(rawBody, sigHeader);
    if (status !== "ok" && status !== "no-secret") {
      console.warn(`ElevenLabs signature ${status}`);
      return res.status(403).json({ error: "Invalid signature" });
    }
  } else if (process.env.WEBHOOK_SECRET) {
    const provided = req.headers["x-webhook-secret"];
    if (!safeCompare(provided || "", process.env.WEBHOOK_SECRET)) {
      return res.status(403).json({ error: "Unauthorized" });
    }
  } else {
    // Neither HMAC nor shared secret configured — deny by default
    return res.status(403).json({ error: "Webhook auth not configured" });
  }

  // 3. Parse the JSON body
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  try {
    const conversationId = payload.conversation_id;
    if (!conversationId) return res.status(400).json({ error: "Missing conversation_id" });

    // 4. Idempotency check
    if (await isWebhookProcessed("elevenlabs", conversationId)) {
      console.log(`↩  Duplicate ElevenLabs webhook ignored: ${conversationId}`);
      return res.json({ ok: true, deduped: true });
    }

    // 5. Extract transcript
    const transcriptParts = (payload.transcript || []).map((t) => {
      const role = t.role === "agent" ? "Mia" : "Cafe";
      return `[${role}]: ${String(t.message || "").slice(0, 2000)}`;
    });
    const transcript = transcriptParts.join(" ").slice(0, 50000);

    const initData = payload.conversation_initiation_client_data || {};
    const dynVars = initData.dynamic_variables || {};
    const cafeId = dynVars.cafe_id || null;
    const cafeName = dynVars.cafe_name || "Unknown";
    const suburb = dynVars.suburb || "Sydney";

    const meta = payload.metadata || {};
    const duration = meta.call_duration_secs || 0;
    const termReason = meta.termination_reason || "";
    const analysis = payload.analysis || {};

    let status = "completed";
    if (duration < 5) status = "no_answer";
    if (termReason === "no_answer" || termReason === "busy") status = "no_answer";
    if (termReason === "failed" || termReason === "error") status = "failed";
    if (transcript.toLowerCase().includes("leave a message") || transcript.toLowerCase().includes("after the beep")) status = "voicemail";
    if (transcript.toLowerCase().includes("no flat white") || transcript.toLowerCase().includes("don't do flat whites")) status = "no_flat_white";

    let { price_small, price_large, needs_review } = extractPrices(transcript);
    const collected = analysis.data_collection_results || {};
    if (collected.price && parseFloat(collected.price) >= 3 && parseFloat(collected.price) <= 15) {
      price_small = parseFloat(collected.price);
      needs_review = false;
    }

    console.log(`☎️  ${cafeName} (${suburb}) — ${status} — $${price_small || "?"} — ${duration}s`);

    await saveCallResult({
      cafe_id: cafeId,
      bland_call_id: conversationId,
      status,
      price_small: status === "completed" ? price_small : null,
      price_large: status === "completed" ? price_large : null,
      raw_transcript: transcript,
      needs_review: status === "completed" ? needs_review : false,
      completed_at: new Date().toISOString(),
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("ElevenLabs webhook error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
