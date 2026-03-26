import { markCallDispatched } from "./db.js";

const BLAND_API = "https://api.bland.ai/v1";

const AGENT_PROMPT = `You are Mia. You're calling cafés in Sydney to ask one question: the price of a regular flat white.

When they pick up, wait a moment, then say: "Hi there, is this {{cafe_name}}?"

If yes: "Great, I'm calling from the Flat White Index. We're a free coffee price guide for Sydney. Quick question — how much is a regular flat white?"

When they answer, confirm the exact amount: "So that's [dollars] dollars [cents]? Perfect, thanks so much! Have a great day."

If they ask who you are: "The Flat White Index — it's at flatwhiteindex.com.au."
If they ask if you're AI: "Yes I am — just collecting prices for a public guide."
If they don't do flat whites: "No worries, thanks anyway!"
If they want you to stop: "Sorry to bother you, won't call again."
If voicemail: hang up immediately.

Keep it short and friendly. Under 45 seconds.

GOAL: Extract price_small (regular flat white price in AUD).`;

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
      task: AGENT_PROMPT.replace("{{cafe_name}}", cafe.name),
      voice: "maya",
      language: "en-AU",
      max_duration: 2,
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

function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

export { chunk };

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
