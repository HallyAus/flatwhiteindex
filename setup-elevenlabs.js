#!/usr/bin/env node
// Setup script for ElevenLabs Conversational AI agent
// Run on the server where .env lives: node setup-elevenlabs.js
//
// Creates:
//   1. Searches for an Australian female voice
//   2. Creates the Mia agent with prompt + data collection
//   3. Imports your Twilio phone number
//   4. Prints env vars to add to .env

import 'dotenv/config';

const API_BASE = 'https://api.elevenlabs.io';
const API_KEY = process.env.ELEVENLABS_API_KEY;

if (!API_KEY) {
  console.error('❌ ELEVENLABS_API_KEY not set in .env');
  process.exit(1);
}

// --- Helpers ---

async function elApi(method, path, body) {
  const opts = {
    method,
    headers: {
      'xi-api-key': API_KEY,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, opts);
  const text = await res.text();
  if (!res.ok) {
    console.error(`API ${res.status} ${method} ${path}:`, text);
    throw new Error(`ElevenLabs API error (${res.status})`);
  }
  return text ? JSON.parse(text) : {};
}

// --- Step 1: Find an Australian female voice ---

async function findVoice() {
  console.log('\n🔍 Searching for Australian female voices...');

  // Search shared voice library for Australian accents
  const params = new URLSearchParams({
    gender: 'female',
    language: 'en',
    page_size: '20',
    sort: 'trending',
  });
  const res = await elApi('GET', `/v1/shared-voices?${params}`);
  const voices = res.voices || [];

  // Prefer voices with "australian" in accent/description
  const auVoices = voices.filter(v => {
    const desc = `${v.name} ${v.description || ''} ${v.accent || ''} ${v.labels?.accent || ''}`.toLowerCase();
    return desc.includes('australian') || desc.includes('aussie');
  });

  if (auVoices.length > 0) {
    const pick = auVoices[0];
    console.log(`  ✓ Found Australian voice: "${pick.name}" (${pick.voice_id})`);
    return pick.voice_id;
  }

  // Fallback: also check user's own voices
  const myVoices = await elApi('GET', '/v1/voices');
  const myAu = (myVoices.voices || []).filter(v => {
    const labels = v.labels || {};
    return labels.accent?.toLowerCase().includes('australian') ||
           labels.gender?.toLowerCase() === 'female';
  });

  if (myAu.length > 0) {
    const pick = myAu[0];
    console.log(`  ✓ Found voice in library: "${pick.name}" (${pick.voice_id})`);
    return pick.voice_id;
  }

  // Last resort: use first female voice available
  const fallback = (myVoices.voices || []).find(v =>
    v.labels?.gender?.toLowerCase() === 'female'
  ) || myVoices.voices?.[0];

  if (fallback) {
    console.log(`  ⚠ No Australian voice found, using: "${fallback.name}" (${fallback.voice_id})`);
    return fallback.voice_id;
  }

  throw new Error('No voices available — check your ElevenLabs account');
}

// --- Step 2: Create the agent ---

async function createAgent(voiceId) {
  console.log('\n🤖 Creating Mia agent...');

  const agentPrompt = `You are Mia, a friendly young Aussie woman calling a café. You speak casually with natural Australian slang. Follow these steps IN ORDER. Do NOT skip steps.

STEP 1: Say "Hey! Is this {{cafe_name}}?" then STOP and WAIT for their reply.

STEP 2: ONLY after they confirm, say "Awesome — quick one, how much is a regular flat white?" then STOP and WAIT.

STEP 3: When they say a price, confirm it: "Sweet, so [their price] yeah?" then WAIT for confirmation.

STEP 4: Once confirmed, say "Legend, cheers for that! Have a good one." then IMMEDIATELY use the end_call tool to hang up.

CRITICAL RULES:
- After Step 4, you MUST call the end_call tool. Do NOT keep talking.
- If you reach voicemail or a recorded message, use end_call immediately.
- If they don't do flat whites: "No wukkas, cheers!" then end_call.
- If they seem annoyed or refuse: "All good, sorry to bug ya!" then end_call.
- NEVER guess a price. If unclear: "Sorry, how much was that again?"
- If asked who you are: "Just doing a quick price check for a coffee guide."
- If asked if you're AI: "Yeah I am! Just checking coffee prices around Sydney for a price guide."
- Be patient — wait for them to finish speaking before responding.
- Keep the whole call under 30 seconds. Be quick and breezy.`;

  const webhookUrl = process.env.WEBHOOK_BASE_URL
    ? `${process.env.WEBHOOK_BASE_URL}/webhook/elevenlabs-call-complete`
    : 'https://flatwhiteindex.com.au/webhook/elevenlabs-call-complete';

  const res = await elApi('POST', '/v1/convai/agents/create', {
    name: 'Mia — Flat White Index',
    conversation_config: {
      agent: {
        first_message: '',
        language: 'en',
        prompt: {
          prompt: agentPrompt,
          temperature: 0.4,
          max_tokens: 300,
        },
      },
      tts: {
        voice_id: voiceId,
      },
      conversation: {
        max_duration_seconds: 60,
      },
      tools: [
        {
          type: 'end_call',
          description: 'Hang up the phone call. Use this after saying goodbye, or when reaching voicemail.',
        },
      ],
    },
    platform_settings: {
      data_collection: {
        price: {
          type: 'string',
          description: 'The price of a regular flat white in AUD as quoted by the cafe, e.g. "5.50"',
        },
        serves_flat_white: {
          type: 'string',
          description: 'Whether the cafe serves flat whites — "yes", "no", or "unknown"',
        },
      },
      webhook: {
        url: webhookUrl,
      },
    },
  });

  const agentId = res.agent_id;
  console.log(`  ✓ Agent created: ${agentId}`);
  return agentId;
}

// --- Step 3: Import Twilio phone number ---

async function importPhoneNumber(agentId) {
  console.log('\n📞 Importing Twilio phone number...');

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!sid || !token || !phoneNumber) {
    console.warn('  ⚠ TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_PHONE_NUMBER not set');
    console.warn('  → Skip phone import. Add number manually in ElevenLabs dashboard.');
    return null;
  }

  const res = await elApi('POST', '/v1/convai/phone-numbers/create', {
    provider: 'twilio',
    phone_number: phoneNumber,
    label: 'Flat White Index — Sydney outbound',
    sid: sid,
    token: token,
    agent_id: agentId,
  });

  const phoneNumberId = res.phone_number_id;
  console.log(`  ✓ Phone imported: ${phoneNumberId} (${phoneNumber})`);
  return phoneNumberId;
}

// --- Step 4: Test call ---

async function testCall(agentId, phoneNumberId) {
  const testNumber = '+61468808706';
  console.log(`\n📱 Placing test call to ${testNumber}...`);
  console.log('  Mia will call you and ask for a flat white price.');
  console.log('  Just play along — say "yes" then give a price like "$5.50".\n');

  const res = await elApi('POST', '/v1/convai/twilio/outbound-call', {
    agent_id: agentId,
    agent_phone_number_id: phoneNumberId,
    to_number: testNumber,
    conversation_initiation_client_data: {
      dynamic_variables: {
        cafe_id: 'test-000',
        cafe_name: 'Test Cafe',
        suburb: 'Sydney CBD',
      },
    },
  });

  console.log(`  ✓ Test call dispatched: ${res.conversation_id || res.callSid || 'ok'}`);
  console.log('  📞 Your phone should ring shortly!');
  return res;
}

// --- Main ---

async function main() {
  const args = process.argv.slice(2);
  const testMode = args.includes('--test');
  const testOnly = args.includes('--test-only');

  console.log('═══════════════════════════════════════');
  console.log('  ElevenLabs Setup — Flat White Index  ');
  console.log('═══════════════════════════════════════');

  let agentId, phoneNumberId;

  if (testOnly) {
    // Use existing env vars for a quick test call
    agentId = process.env.ELEVENLABS_AGENT_ID;
    phoneNumberId = process.env.ELEVENLABS_PHONE_NUMBER_ID;
    if (!agentId || !phoneNumberId) {
      console.error('❌ --test-only requires ELEVENLABS_AGENT_ID and ELEVENLABS_PHONE_NUMBER_ID in .env');
      process.exit(1);
    }
    await testCall(agentId, phoneNumberId);
    return;
  }

  const voiceId = await findVoice();
  agentId = await createAgent(voiceId);
  phoneNumberId = await importPhoneNumber(agentId);

  console.log('\n═══════════════════════════════════════');
  console.log('  Add these to your .env:');
  console.log('═══════════════════════════════════════');
  console.log(`CALL_PROVIDER=elevenlabs`);
  console.log(`ELEVENLABS_AGENT_ID=${agentId}`);
  if (phoneNumberId) {
    console.log(`ELEVENLABS_PHONE_NUMBER_ID=${phoneNumberId}`);
  }
  console.log('\nThen restart: systemctl restart flatwhite-webhook');
  console.log('═══════════════════════════════════════\n');

  if (testMode && phoneNumberId) {
    await testCall(agentId, phoneNumberId);
  } else if (testMode && !phoneNumberId) {
    console.log('⚠ Skipping test call — no phone number imported');
  }
}

main().catch(err => {
  console.error('\n❌ Setup failed:', err.message);
  process.exit(1);
});
