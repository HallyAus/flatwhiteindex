import { markCallDispatched } from "./db.js";
import { chunk, sleep, sanitiseForPrompt } from "./utils.js";

// ElevenLabs Conversational AI — outbound phone calls via Twilio integration
// Replaces the Twilio+OpenAI Realtime stack with a single ElevenLabs API

const AGENT_PROMPT = `You are Mia, a friendly young Aussie woman calling a café. You speak casually with natural Australian slang. Speak at a natural, relaxed pace — not rushed.

After they respond to your greeting, say "Awesome — quick one, how much is a regular flat white?"

When they say a price, confirm it: "Sweet, so [their price] yeah?"

Once confirmed, say "Legend, cheers!" and IMMEDIATELY use end_call. Do NOT say anything after "cheers".

RULES:
- If voicemail or recorded message: end_call immediately, say nothing.
- If they don't do flat whites: "No wukkas!" then end_call.
- If annoyed or refuse: "All good!" then end_call.
- NEVER guess a price. If unclear: "Sorry, how much was that again?"
- If asked who you are: "Just a quick price check for a coffee guide."
- If asked if you're AI: "Yeah I am! Just checking coffee prices for a guide."
- Be quick and breezy. Do not ramble.`;

const API_BASE = 'https://api.elevenlabs.io/v1/convai';

async function elevenLabsRequest(path, body) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set');

  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    // [SECURITY] Log full error server-side, throw generic message
    console.error(`ElevenLabs API ${res.status}: ${text}`);
    throw new Error(`ElevenLabs API error (${res.status})`);
  }

  return res.json();
}

export async function dispatchCalls(cafes, batchSize) {
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const phoneNumberId = process.env.ELEVENLABS_PHONE_NUMBER_ID;

  if (!agentId) throw new Error('ELEVENLABS_AGENT_ID not set — create an agent at elevenlabs.io/agents');
  if (!phoneNumberId) throw new Error('ELEVENLABS_PHONE_NUMBER_ID not set — add a phone number in ElevenLabs dashboard');

  const batches = chunk(cafes, batchSize);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`  Batch ${i + 1}/${batches.length} — ${batch.length} calls`);

    const results = await Promise.allSettled(
      batch.map(cafe => dispatchSingleCall(cafe, agentId, phoneNumberId))
    );

    let dispatched = 0;
    let failed = 0;
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') {
        dispatched++;
      } else {
        failed++;
        console.warn(`    ⚠️  Failed: ${batch[idx].name}: ${r.reason?.message}`);
      }
    });

    console.log(`     ✓ ${dispatched} dispatched, ${failed} failed`);

    if (i < batches.length - 1) {
      console.log(`  Waiting 30s before next batch...`);
      await sleep(30000);
    }
  }
}

async function dispatchSingleCall(cafe, agentId, phoneNumberId) {
  // [SECURITY] Validate phone number format before sending to API
  if (!cafe.phone || !/^\+\d{8,15}$/.test(cafe.phone)) {
    throw new Error(`Invalid phone number format for ${cafe.name}`);
  }
  const cafeName = sanitiseForPrompt(cafe.name);
  const prompt = AGENT_PROMPT.replace('{{cafe_name}}', cafeName);

  const result = await elevenLabsRequest('/twilio/outbound-call', {
    agent_id: agentId,
    agent_phone_number_id: phoneNumberId,
    to_number: cafe.phone,
    conversation_initiation_client_data: {
      dynamic_variables: {
        cafe_id: cafe.id,
        cafe_name: cafeName,
        suburb: cafe.suburb || 'Sydney',
      },
      conversation_config_override: {
        agent: {
          prompt: {
            prompt: prompt,
          },
        },
      },
    },
  });

  const callId = result.conversation_id || result.callSid || 'unknown';
  await markCallDispatched(cafe.id, callId);
  console.log(`    📞 ${cafe.name} — call ${callId}`);
  return callId;
}

// No WebSocket server needed — ElevenLabs handles the audio loop.
// Call results come via post-call webhook configured in ElevenLabs dashboard.
export function setupMediaStreamServer(server) {
  // No-op — ElevenLabs doesn't need a media stream server.
  // Post-call webhook is handled by /webhook/elevenlabs-call-complete in webhook.js
  console.log('ℹ️  ElevenLabs mode — no media stream server needed');
}
