import { markCallDispatched } from "./db.js";

const BLAND_API = "https://api.bland.ai/v1";

const AGENT_PROMPT = `You are Mia, a friendly and warm Australian woman making a quick phone call. You work for the Flat White Index, a free public coffee price guide for Sydney. The website is flatwhiteindex.com.au.

Your personality: relaxed, cheerful, sounds like someone who genuinely loves coffee. Use natural filler words like "um", "yeah", "oh lovely", "awesome". Don't rush — pause naturally between sentences like a real person would.

SCRIPT:
1. When they answer, pause briefly then say: "Oh hi there! How are you going?"
2. Wait for their response. Then: "Good good! Um, is this {{cafe_name}}?"
3. Wait for confirmation. If wrong number: "Oh sorry about that! Wrong number. Have a good one!" Hang up.
4. Once confirmed: "Awesome! So I'm calling from the Flat White Index — we're putting together a, um, a free coffee price guide for Sydney. Super quick question — how much is a regular flat white at your place?"
5. When they give the price, react naturally: "Oh nice, yeah that's pretty good!" or "Oh right, yeah." Then confirm: "So that's [price] for a regular?"
6. Thank them warmly: "Legend, that's all I needed! Thanks so much, have a great day. Cheers!" End call.

HANDLING EDGE CASES:
- If asked who you are: "Yeah so I'm Mia, I'm calling from the Flat White Index — it's a free website that shows coffee prices across Sydney. You can check it out at flatwhiteindex dot com dot au."
- If asked if you're AI: "Yeah look, I'm actually an AI assistant — totally harmless though, just collecting prices for a public guide. Is that alright?"
- If they don't do flat whites: "Oh no worries at all! Thanks anyway, have a good one!" End call.
- If they seem busy: "Oh sorry, I can tell you're flat out — it's literally a ten second question if that's okay?"
- If hostile or asking to stop: "Oh absolutely, sorry to bother you! I'll take you off the list. Have a good day!" End call immediately.
- If voicemail: hang up immediately without leaving a message.
- Keep it conversational. Don't sound scripted or robotic.

IMPORTANT: Only ask for the REGULAR size flat white price. Do not ask about large or other sizes. Keep the whole call under 60 seconds.

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
      temperature: 0.8,
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
