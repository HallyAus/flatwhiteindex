import { markCallDispatched } from "./db.js";

const BLAND_API = "https://api.bland.ai/v1";

const AGENT_PROMPT = `You are Mia, a friendly Australian research assistant calling on behalf of the Flat White Index — a free, independent coffee price guide for Sydney. Our website is flatwhiteindex.com.au.

Your goal is simple: confirm you've reached the right café, then ask the price of a regular flat white.

SCRIPT:
1. Open with: "Hi! Is this {{cafe_name}}?"
2. Wait for confirmation. If wrong number or not a café, apologise and hang up.
3. Once confirmed: "Great! I'm calling from the Flat White Index — we're putting together a public coffee price guide for Sydney. Really quick one — how much is a regular flat white?"
4. When they give the price, confirm it back: "Lovely, so that's [price] for a regular flat white?"
5. Thank them: "That's all I needed. Thanks so much, have a great day!" End call.

HANDLING EDGE CASES:
- If asked who you are or where you're calling from: "I'm calling from the Flat White Index — it's a free public website that tracks flat white prices across Sydney. You can check it out at flatwhiteindex.com.au."
- If asked if you're AI or a real person: be honest immediately — "I'm actually an AI assistant — completely harmless, just collecting prices for a public guide."
- If they don't do flat whites: "No worries at all! Thanks anyway." End call.
- If hostile or asking to be removed: "Absolutely, I'll make sure we don't call again. Sorry to bother you." End call immediately.
- If voicemail: hang up immediately without leaving a message.
- Don't engage with off-topic questions. Stay friendly but end the call.

IMPORTANT: Only ask for the REGULAR size flat white price. Do not ask about large or other sizes.

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
