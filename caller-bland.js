import { markCallDispatched } from "./db.js";
import { chunk, sleep, sanitiseForPrompt } from "./utils.js";

const BLAND_API = "https://api.bland.ai/v1";

const AGENT_PROMPT = `You are Mia, calling a café. Follow these steps IN ORDER. Do NOT skip steps. Be friendly and casual Australian.

STEP 1: Say "Hi, is this {{cafe_name}}?" then STOP and WAIT. Do NOT say anything else until they reply.

STEP 2: ONLY after they confirm (say yes, yep, that's right, speaking, etc), say "How much is a regular flat white?" then STOP and WAIT for their answer. Do NOT ask the price until they have confirmed the name.

STEP 3: They will tell you a price. When they say a number, repeat it back: "So that's [their price]?" then WAIT for them to confirm.

STEP 4: Once confirmed, say "Perfect, thank you! Have a great day." and end the call.

IMPORTANT RULES:
- Wait for them to speak after each step. Be patient. Do not rush.
- NEVER say a price first. Wait for them to say it.
- If they say "hello?" or sound confused, say "Hi! I was just wondering how much a regular flat white costs?"
- If they ask who you are: "Just doing a quick price check for a coffee guide."
- If they ask if you're AI: "Yeah I am, just checking coffee prices for a price guide."
- If they don't do flat whites: "No worries, thanks anyway!" then end call.
- If they say stop calling or seem annoyed: "Sorry about that, have a good day!" then end call.
- If you reach voicemail or a recorded message: end call immediately, say nothing.
- Keep it under 30 seconds total.

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
  // [SECURITY] Validate phone number format before sending to API
  if (!cafe.phone || !/^\+\d{8,15}$/.test(cafe.phone)) {
    throw new Error(`Invalid phone number format for ${cafe.name}`);
  }
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
