// Inline dispatch runner — replaces the `node index.js` child_process spawn
// from the Express version. Fetches eligible cafes from Supabase, dispatches
// a batch via ElevenLabs, returns a summary.

import { supabase } from "./supabase.js";

const CALL_PROVIDER = process.env.CALL_PROVIDER || "elevenlabs";

async function getEligibleCafes(suburb, limit) {
  const sb = supabase();
  let q = sb
    .from("cafes")
    .select("id, name, suburb, phone, status")
    .eq("status", "eligible")
    .not("phone", "is", null)
    .limit(limit);
  if (suburb) q = q.eq("suburb", suburb);
  const { data, error } = await q;
  if (error) throw new Error(`getEligibleCafes: ${error.message}`);
  return data || [];
}

async function markCallDispatched(cafeId, externalCallId) {
  const sb = supabase();
  // Insert the new dispatch record; leave history (no destructive delete here).
  const { error } = await sb.from("price_calls").insert({
    cafe_id: cafeId,
    bland_call_id: externalCallId,
    status: "pending",
    called_at: new Date().toISOString(),
  });
  if (error) throw new Error(`markCallDispatched: ${error.message}`);
}

async function dispatchElevenLabs(cafe) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const phoneNumberId = process.env.ELEVENLABS_PHONE_NUMBER_ID;
  if (!apiKey || !agentId || !phoneNumberId) {
    throw new Error("Missing ELEVENLABS_API_KEY / AGENT_ID / PHONE_NUMBER_ID");
  }
  const res = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      agent_id: agentId,
      agent_phone_number_id: phoneNumberId,
      to_number: cafe.phone,
      conversation_initiation_client_data: {
        dynamic_variables: { cafe_id: cafe.id, cafe_name: cafe.name, suburb: cafe.suburb || "Sydney" },
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ElevenLabs ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  return json.conversation_id || json.callSid || `unknown-${Date.now()}`;
}

/**
 * Run a single dispatch batch. Caller is the cron job; result is stored on
 * the dispatch_jobs row.
 */
export async function runDispatchBatch({ suburb, batchSize = 10 }) {
  if (CALL_PROVIDER !== "elevenlabs") {
    throw new Error(`CALL_PROVIDER=${CALL_PROVIDER} not supported on Vercel; only elevenlabs is`);
  }
  const cafes = await getEligibleCafes(suburb, batchSize);
  if (cafes.length === 0) return { dispatched: 0, failed: 0, note: "no eligible cafes" };

  let dispatched = 0;
  let failed = 0;
  const errors = [];

  await Promise.allSettled(
    cafes.map(async (cafe) => {
      try {
        if (!cafe.phone || !/^\+\d{8,15}$/.test(cafe.phone)) {
          throw new Error(`bad phone: ${cafe.phone}`);
        }
        const callId = await dispatchElevenLabs(cafe);
        await markCallDispatched(cafe.id, callId);
        dispatched++;
      } catch (err) {
        failed++;
        errors.push(`${cafe.name}: ${err.message}`);
      }
    }),
  );

  return { dispatched, failed, errors: errors.slice(0, 10), suburb: suburb || "all" };
}
