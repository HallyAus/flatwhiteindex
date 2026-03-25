import { markCallDispatched } from "./db.js";

const BLAND_API = "https://api.bland.ai/v1";

const AGENT_PROMPT = `You are Mia, a friendly Australian research assistant calling on behalf of the Flat White Index — a free public guide to coffee prices across Sydney.

Your ONLY goal is to find out how much a flat white costs at this café. Keep the call under 60 seconds.

SCRIPT:
1. Open with: "Hi there! Quick one — I'm calling from the Flat White Index, we're putting together a public coffee price guide for Sydney. How much is a flat white?"
2. If they give a price, ask: "Is that small or large? Do you have both sizes?"
3. Thank them warmly and end the call.

HANDLING EDGE CASES:
- If asked if you're AI or a real person: be honest immediately — "Yes, I'm an automated AI assistant, completely harmless — just collecting prices for a public index."
- If they don't do flat whites: "No worries at all — do you do lattes? What size and price?"
- If hostile or asking to be removed: "Absolutely, I'll remove you right away, sorry to bother you." Then end call immediately.
- If voicemail: hang up after 5 seconds without leaving a message.
- Don't engage with off-topic questions. Politely redirect or end the call.

GOAL: Extract price_small (small flat white price in AUD) and price_large (large flat white price in AUD). If only one size, record it as price_small.`;

export async function dispatchCalls(cafes, batchSize) {
  const batches = chunk(cafes, batchSize);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`  Batch ${i + 1}/${batches.length} — ${batch.length} calls`);

    const results = await Promise.allSettled(
      batch.map(cafe => dispatchSingleCall(cafe))
    );

    let dispatched = 0;
    let failed = 0;
    results.forEach((r, idx) => {
      if (r.status === "fulfilled") {
        dispatched++;
      } else {
        failed++;
        console.warn(`    ⚠️  Failed to dispatch call to ${batch[idx].name}: ${r.reason?.message}`);
      }
    });

    console.log(`     ✓ ${dispatched} dispatched, ${failed} failed`);

    if (i < batches.length - 1) {
      console.log(`  Waiting 30s before next batch...`);
      await sleep(30000);
    }
  }
}

async function dispatchSingleCall(cafe) {
  const res = await fetch(`${BLAND_API}/calls`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization: process.env.BLAND_AI_API_KEY,
    },
    body: JSON.stringify({
      phone_number: cafe.phone,
      task: AGENT_PROMPT,
      voice: "maya",
      language: "en-AU",
      max_duration: 2,
      answered_by_enabled: true,
      webhook: `${process.env.WEBHOOK_BASE_URL}/webhook/call-complete`,
      metadata: {
        cafe_id: cafe.id,
        cafe_name: cafe.name,
        suburb: cafe.suburb,
      },
      request_data: {
        cafe_name: cafe.name,
        suburb: cafe.suburb || "Sydney",
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Bland.ai API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  await markCallDispatched(cafe.id, data.call_id);
  return data.call_id;
}

function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
