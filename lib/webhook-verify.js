import { createHmac, timingSafeEqual } from "node:crypto";
import { supabase } from "./supabase.js";

export function safeCompare(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verify ElevenLabs webhook signature.
 * Header: ElevenLabs-Signature: t=<unix>,v0=<sha256_hex>
 * Signed payload: `${t}.${rawBody}`
 *
 * Vercel auto-parses JSON bodies but the raw bytes are still on the request
 * stream as `req.body` is the parsed object. To get the raw body we read the
 * request before parsing — see the per-route bodyParser:false config.
 *
 * @returns {'ok' | 'no-secret' | 'no-signature' | 'bad-format' | 'expired' | 'mismatch'}
 */
export function verifyElevenLabsSignature(rawBody, signatureHeader) {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret) return "no-secret";
  if (!signatureHeader || typeof signatureHeader !== "string") return "no-signature";
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => {
      const idx = p.indexOf("=");
      return idx < 0 ? [p.trim(), ""] : [p.slice(0, idx).trim(), p.slice(idx + 1).trim()];
    }),
  );
  if (!parts.t || !parts.v0) return "bad-format";
  const ts = parseInt(parts.t, 10);
  if (!Number.isFinite(ts)) return "bad-format";
  if (Math.abs(Date.now() / 1000 - ts) > 1800) return "expired";
  const expected = createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
  return safeCompare(parts.v0, expected) ? "ok" : "mismatch";
}

/** Read raw body from the request stream (when bodyParser is disabled). */
export function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

/**
 * Webhook idempotency check via Supabase. Returns true if this (provider, id)
 * has already been processed. The `processed_webhooks` table has a UNIQUE
 * constraint on (provider, external_id) so the insert serves as the
 * compare-and-set.
 *
 * Schema:
 *   CREATE TABLE processed_webhooks (
 *     provider TEXT NOT NULL,
 *     external_id TEXT NOT NULL,
 *     processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 *     PRIMARY KEY (provider, external_id)
 *   );
 */
export async function isWebhookProcessed(provider, externalId) {
  if (!externalId) return false;
  const sb = supabase();
  const { error } = await sb
    .from("processed_webhooks")
    .insert({ provider, external_id: externalId });
  if (!error) return false; // first insert succeeded — fresh webhook
  // Unique violation = already processed
  if (error.code === "23505") return true;
  console.warn("isWebhookProcessed insert error:", error.message);
  return false; // fail open on DB error so we still process
}
