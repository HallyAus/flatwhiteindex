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

// Timeline:
// 0s   — call connects
// 1-2s — pause (first_message starts with "..." to add natural delay)
// 2-3s — Mia: "Hey! Is this [cafe]?"
// 3-5s — cafe responds
// 5-7s — Mia: "Awesome — quick one, how much is a regular flat white?"
// 7-12s — cafe gives price
// 12-14s — Mia: "Sweet, so [price] yeah?"
// 14-16s — cafe confirms
// 16-17s — Mia: "Legend, cheers!" → end_call
// Total: ~17 seconds

const FIRST_MESSAGE = '';

const AGENT_PROMPT = `You are Mia, a friendly young Aussie woman calling a café. You speak casually with natural Australian slang. Speak at a natural, relaxed pace — not rushed.

IMPORTANT: You are the CALLER. Wait for the café to pick up and say hello first. Once they greet you, respond with "Hey! Is this {{cafe_name}}?"

After they confirm, say "Awesome — quick one, how much is a regular flat white?"

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

const WEBHOOK_URL = (process.env.WEBHOOK_BASE_URL || 'https://flatwhiteindex.com.au')
  + '/webhook/elevenlabs-call-complete';

const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '56bWURjYFHyYyVf490Dp';

const AGENT_CONFIG = {
  conversation_config: {
    agent: {
      first_message: FIRST_MESSAGE,
      language: 'en',
      prompt: { prompt: AGENT_PROMPT, temperature: 0.4, max_tokens: 300 },
    },
    tts: { voice_id: VOICE_ID, model_id: 'eleven_multilingual_v2', speed: 0.8 },
    conversation: { max_duration_seconds: 60 },
    tools: [
      { type: 'end_call', description: 'Hang up the phone call. Use after saying goodbye or when reaching voicemail.' },
    ],
  },
  platform_settings: {
    data_collection: {
      price: { type: 'string', description: 'The price of a regular flat white in AUD as quoted by the cafe, e.g. "5.50"' },
      serves_flat_white: { type: 'string', description: 'Whether the cafe serves flat whites — "yes", "no", or "unknown"' },
    },
    webhook: { url: WEBHOOK_URL },
  },
};

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

  const config = structuredClone(AGENT_CONFIG);
  config.conversation_config.tts = { voice_id: voiceId };

  const res = await elApi('POST', '/v1/convai/agents/create', {
    name: 'Mia — Flat White Index',
    ...config,
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

// --- Step 3b: Update existing agent ---

async function updateAgent(agentId) {
  console.log(`\n🔄 Updating agent ${agentId}...`);
  await elApi('PATCH', `/v1/convai/agents/${agentId}`, AGENT_CONFIG);
  console.log('  ✓ Agent updated');
}

// --- Step 3c: Verify or re-import phone number ---

async function ensurePhoneNumber(agentId) {
  const phoneNumberId = process.env.ELEVENLABS_PHONE_NUMBER_ID;
  if (phoneNumberId) {
    // Check if it still exists
    try {
      await elApi('GET', `/v1/convai/phone-numbers/${phoneNumberId}`);
      return phoneNumberId;
    } catch {
      console.log('  ⚠ Phone number ID no longer valid, re-importing...');
    }
  }
  // Re-import
  const newId = await importPhoneNumber(agentId);
  if (newId) {
    console.log(`\n  ⚠ Update your .env: ELEVENLABS_PHONE_NUMBER_ID=${newId}`);
  }
  return newId;
}

// --- Step 4: Fetch recent conversation logs ---

async function fetchLogs(agentId) {
  console.log(`\n📋 Recent conversations for agent ${agentId}:\n`);

  const res = await elApi('GET', `/v1/convai/conversations?agent_id=${agentId}&page_size=10`);
  const convos = res.conversations || [];

  if (convos.length === 0) {
    console.log('  No conversations yet.');
    return;
  }

  for (const c of convos) {
    const duration = c.call_duration_secs || c.metadata?.call_duration_secs || '?';
    const status = c.status || 'unknown';
    const startTime = c.start_time || c.created_at || '';
    console.log(`  ${c.conversation_id} — ${status} — ${duration}s — ${startTime}`);

    // Fetch transcript if available
    try {
      const detail = await elApi('GET', `/v1/convai/conversations/${c.conversation_id}`);
      const transcript = (detail.transcript || []).map(t => {
        const role = t.role === 'agent' ? 'Mia' : 'Caller';
        return `    [${role}]: ${t.message}`;
      }).join('\n');
      if (transcript) console.log(transcript);
    } catch {}
    console.log('');
  }
}

// --- Step 5: Test call ---

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
  const updateMode = args.includes('--update');
  const logsMode = args.includes('--logs');

  console.log('═══════════════════════════════════════');
  console.log('  ElevenLabs Setup — Flat White Index  ');
  console.log('═══════════════════════════════════════');

  let agentId, phoneNumberId;

  // Quick modes that use existing env vars
  agentId = process.env.ELEVENLABS_AGENT_ID;
  phoneNumberId = process.env.ELEVENLABS_PHONE_NUMBER_ID;

  if (logsMode) {
    if (!agentId) { console.error('❌ ELEVENLABS_AGENT_ID not set'); process.exit(1); }
    await fetchLogs(agentId);
    return;
  }

  if (updateMode) {
    if (!agentId) { console.error('❌ ELEVENLABS_AGENT_ID not set'); process.exit(1); }
    await updateAgent(agentId);
    if (testMode) {
      phoneNumberId = await ensurePhoneNumber(agentId);
      if (phoneNumberId) await testCall(agentId, phoneNumberId);
      else console.error('❌ No phone number available for test call');
    }
    return;
  }

  if (testOnly) {
    if (!agentId) { console.error('❌ ELEVENLABS_AGENT_ID not set'); process.exit(1); }
    phoneNumberId = await ensurePhoneNumber(agentId);
    if (!phoneNumberId) { console.error('❌ No phone number available'); process.exit(1); }
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
