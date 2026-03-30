import { markCallDispatched } from "./db.js";
import { chunk, sleep, sanitiseForPrompt } from "./utils.js";

const BLAND_API = "https://api.bland.ai/v1";

const AGENT_PROMPT = `You are Mia, calling a café. Follow these steps EXACTLY. Be quick, friendly, casual Australian.

STEP 1: Say "Hi, is this {{cafe_name}}?" — WAIT for reply.

STEP 2: When they confirm, say "How much is a regular flat white?" — WAIT for the price. Do NOT guess. Do NOT say a number first.

STEP 3: When they say a price, confirm it: "So that's [their price]?" — WAIT for yes.

STEP 4: Say "Perfect, thank you! Have a great day." — end call.

RULES:
- NEVER say a price unless they said it first. If unclear, ask: "Sorry, how much was that?"
- If they ask who you are: "Just doing a quick price check."
- If they ask if you're AI: "Yeah I am, just checking coffee prices."
- If they don't do flat whites: "No worries, thanks!" — hang up.
- If they say stop calling: "Sorry about that!" — hang up.
- If voicemail or recorded message: hang up immediately.
- Keep it under 30 seconds. One question, one answer, done.

GOAL: Get the price of a regular flat white in AUD.`;

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
      task: AGENT_PROMPT.replace("{{cafe_name}}", sanitiseForPrompt(cafe.name)),
      voice: "maya",
      language: "en-AU",
      max_duration: 2,
      voice_settings: { speed: 1.0, stability: 0.7 },
      volume: 1.5,
      answered_by_enabled: true,
      wait_for_greeting: true,
      analysis_schema: {
        price: {
          type: "number",
          description: "The price of a regular flat white in AUD, e.g. 4.60",
        },
        has_flat_white: {
          type: "boolean",
          description: "Whether the cafe serves flat whites",
        },
      },
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

export { chunk } from "./utils.js";
