import { markCallDispatched } from "./db.js";
import { chunk, sleep, sanitiseForPrompt } from "./utils.js";
import { WebSocketServer } from "ws";
import { WebSocket } from "ws";
import { createServer } from "node:http";

// Singleton Twilio client — created once, reused across calls
let _twilioClient = null;
async function getTwilioClient() {
  if (!_twilioClient) {
    const twilio = (await import("twilio")).default;
    _twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return _twilioClient;
}

const AGENT_PROMPT = `You are Mia, calling a café. Follow these steps IN ORDER. Do NOT skip steps. Be friendly and casual Australian.

STEP 1: Say "Hi, is this {{cafe_name}}?" then STOP and WAIT. Do NOT say anything else until they reply.

STEP 2: ONLY after they confirm (say yes, yep, speaking, etc), say "How much is a regular flat white?" then STOP and WAIT for their answer.

STEP 3: When they say a price, repeat it back: "So that's [their price]?" then WAIT for them to confirm.

STEP 4: Once confirmed, say "Perfect, thank you! Have a great day." then say ENDCALL.

WHEN TO SAY ENDCALL:
- Voicemail or recorded message → say ENDCALL immediately, no greeting.
- No flat whites → "No worries, thanks!" then ENDCALL
- They refuse or seem annoyed → "Sorry about that!" then ENDCALL
- Got the price confirmed → say thanks then ENDCALL

IMPORTANT:
- Do NOT say ENDCALL until you have the price OR hit a dead end.
- Do NOT hang up just because they said "hello" — that means they answered, keep going.
- Wait for them to speak after each step. Be patient. Do not rush.
- NEVER guess a price. If unclear: "Sorry, how much was that?"
- If they ask who you are: "Just doing a quick price check for a coffee guide."
- If they ask if you're AI: "Yeah I am, just checking coffee prices for a price guide."
- Keep it under 30 seconds total.`;

const MAX_CALL_DURATION_MS = 60000; // 60 seconds — force hangup if exceeded
const callTimers = new Map();

// End a Twilio call by SID
async function endTwilioCall(callSid) {
  try {
    const client = await getTwilioClient();
    await client.calls(callSid).update({ status: "completed" });
    console.log(`    ☎️  Ended call ${callSid}`);
  } catch (err) {
    console.warn(`    ⚠️  Could not end call ${callSid}: ${err.message}`);
  }
}

// Track active calls and their transcripts
const activeCalls = new Map();

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
        const err = r.reason;
        console.warn(`    ⚠️  Failed: ${batch[idx].name} (${batch[idx].phone}): ${err?.message}`);
        if (err?.code) console.warn(`       Twilio error code: ${err.code} — ${err.moreInfo || ''}`);
        if (err?.status) console.warn(`       HTTP status: ${err.status}`);
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
  const client = await getTwilioClient();

  const webhookBase = process.env.WEBHOOK_BASE_URL;
  const prompt = AGENT_PROMPT.replace("{{cafe_name}}", sanitiseForPrompt(cafe.name));

  // Store call metadata for when the media stream connects
  const callMetadata = {
    cafe_id: cafe.id,
    cafe_name: cafe.name,
    suburb: cafe.suburb,
    prompt,
  };

  // XML-escape values for TwiML
  function xmlEscape(str) {
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&apos;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  const safeName = xmlEscape(cafe.name);
  const safeSuburb = xmlEscape(cafe.suburb || "Sydney");
  const safeId = xmlEscape(cafe.id);
  const streamUrl = `wss://${new URL(webhookBase).host}/media-stream`;

  const call = await client.calls.create({
    to: cafe.phone,
    from: process.env.TWILIO_PHONE_NUMBER,
    twiml: `<Response><Connect><Stream url="${streamUrl}"><Parameter name="cafe_id" value="${safeId}" /><Parameter name="cafe_name" value="${safeName}" /><Parameter name="suburb" value="${safeSuburb}" /></Stream></Connect></Response>`,
    machineDetection: "Enable",
    machineDetectionTimeout: 5,
    statusCallback: `${webhookBase}/webhook/twilio-status`,
    statusCallbackEvent: ["completed", "no-answer", "busy", "failed"],
    statusCallbackMethod: "POST",
  });

  await markCallDispatched(cafe.id, call.sid);
  console.log(`    📞 ${cafe.name} — call ${call.sid}`);
  return call.sid;
}

// WebSocket server for Twilio Media Streams ↔ OpenAI Realtime
export function setupMediaStreamServer(server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1 * 1024 * 1024 }); // 1MB max message
  const activeCallSessions = new Set(); // Prevent duplicate sessions per call
  const MAX_CONCURRENT_SESSIONS = 20; // Limit concurrent OpenAI sessions

  // [SECURITY] Validate WebSocket upgrades — Twilio doesn't send Origin headers
  server.on("upgrade", (request, socket, head) => {
    if (!request.url.startsWith("/media-stream")) return;

    // Limit concurrent sessions to prevent abuse
    if (activeCallSessions.size >= MAX_CONCURRENT_SESSIONS) {
      console.warn("⚠️ WebSocket rejected: too many concurrent sessions");
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  // Cleanup stale activeCalls entries every 5 minutes (calls should never last >10 min)
  setInterval(() => {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [callSid, meta] of activeCalls) {
      if (meta._startedAt && meta._startedAt < cutoff) {
        console.warn(`    ⚠️ Cleaning stale call ${callSid}`);
        activeCalls.delete(callSid);
        activeCallSessions.delete(callSid);
      }
    }
  }, 300000).unref();

  wss.on("connection", (twilioWs) => {
    let openaiWs = null;
    let streamSid = null;
    let callSid = null;
    let transcript = "";
    let isSecondStream = false;

    twilioWs.on("message", (data) => {
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        console.warn("    ⚠️ Malformed WebSocket message, ignoring");
        return;
      }

      if (msg.event === "start") {
        streamSid = msg.start.streamSid;
        callSid = msg.start.callSid;

        // Skip duplicate stream for the same call
        if (activeCallSessions.has(callSid)) {
          isSecondStream = true;
          twilioWs.close();
          return;
        }
        activeCallSessions.add(callSid);

        // Read metadata from custom parameters sent via TwiML
        const customParams = msg.start.customParameters || {};
        const metadata = {
          cafe_id: customParams.cafe_id || null,
          cafe_name: customParams.cafe_name || "Unknown Café",
          suburb: customParams.suburb || "Sydney",
          prompt: AGENT_PROMPT.replace("{{cafe_name}}", sanitiseForPrompt(customParams.cafe_name || "there")),
        };
        // Store for close handler (with timestamp for TTL cleanup)
        metadata._startedAt = Date.now();
        activeCalls.set(callSid, metadata);

        // Safety net: force hangup after MAX_CALL_DURATION_MS
        const timer = setTimeout(() => {
          console.log(`    ⏰ Max duration reached for ${metadata.cafe_name} — forcing hangup`);
          endTwilioCall(callSid);
        }, MAX_CALL_DURATION_MS);
        timer.unref();
        callTimers.set(callSid, timer);

        console.log(`    🎙️  Media stream started for ${metadata.cafe_name}`);

        // Connect to OpenAI Realtime
        openaiWs = new WebSocket("wss://api.openai.com/v1/realtime?model=gpt-4o-mini-realtime-preview", {
          headers: {
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
            "OpenAI-Beta": "realtime=v1",
          },
        });

        openaiWs.on("open", () => {
          console.log(`    🧠 OpenAI Realtime connected for ${metadata?.cafe_name}`);

          // Configure session
          openaiWs.send(JSON.stringify({
            type: "session.update",
            session: {
              modalities: ["text", "audio"],
              instructions: metadata?.prompt || AGENT_PROMPT,
              voice: "sage",
              input_audio_format: "g711_ulaw",
              output_audio_format: "g711_ulaw",
              input_audio_transcription: { model: "whisper-1" },
              turn_detection: {
                type: "server_vad",
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 800,
              },
            },
          }));

          // Trigger Mia to speak first — send a conversation item
          setTimeout(() => {
            openaiWs.send(JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "message",
                role: "user",
                content: [{ type: "input_text", text: "The cafe has just picked up the phone. Start the conversation now." }],
              },
            }));
            openaiWs.send(JSON.stringify({ type: "response.create" }));
            console.log(`    🗣️  Triggered Mia to start speaking`);
          }, 1000);
        });

        openaiWs.on("message", (data) => {
          let event;
          try {
            event = JSON.parse(data);
          } catch {
            console.warn("    ⚠️ Malformed OpenAI message, ignoring");
            return;
          }

          // Forward audio back to Twilio
          if (event.type === "response.audio.delta" && event.delta) {
            twilioWs.send(JSON.stringify({
              event: "media",
              streamSid,
              media: { payload: event.delta },
            }));
          }

          // Collect transcript
          if (event.type === "response.audio_transcript.done") {
            transcript += " [Mia]: " + event.transcript;
            console.log(`    💬 Mia: ${event.transcript}`);

            // ENDCALL signal — Mia wants to hang up
            if (event.transcript.includes("ENDCALL")) {
              console.log(`    📴 Mia signalled ENDCALL — ending call`);
              endTwilioCall(callSid);
            }
          }
          if (event.type === "conversation.item.input_audio_transcription.completed") {
            transcript += " [Cafe]: " + event.transcript;
            console.log(`    💬 Cafe: ${event.transcript}`);

            // Detect voicemail/IVR from cafe side and force hangup
            const cafeText = event.transcript.toLowerCase();
            if (/leave a message|after the (tone|beep)|press [0-9]|your call is important|please hold/.test(cafeText)) {
              console.log(`    📴 Voicemail/IVR detected — ending call`);
              endTwilioCall(callSid);
            }
          }
          if (event.type === "error") {
            console.error(`    ❌ OpenAI error:`, event.error?.message || JSON.stringify(event));
          }
        });

        openaiWs.on("error", (err) => {
          console.error(`    ❌ OpenAI WebSocket error for ${metadata?.cafe_name}:`, err.message);
        });

        openaiWs.on("close", () => {
          console.log(`    📝 Call ended. Transcript length: ${transcript.length} chars`);
          activeCallSessions.delete(callSid);
          // Clear max duration timer
          const timer = callTimers.get(callSid);
          if (timer) { clearTimeout(timer); callTimers.delete(callSid); }
          // Call ended — post result to our own webhook
          const callMeta = activeCalls.get(callSid);
          if (callMeta) {
            console.log(`    📤 Posting result for ${callMeta.cafe_name}...`);
            postCallResult(callSid, callMeta, transcript);
            activeCalls.delete(callSid);
          } else {
            console.warn(`    ⚠️ No metadata found for call ${callSid}`);
          }
        });
      }

      // Forward audio from Twilio to OpenAI
      if (msg.event === "media" && openaiWs?.readyState === WebSocket.OPEN) {
        openaiWs.send(JSON.stringify({
          type: "input_audio_buffer.append",
          audio: msg.media.payload,
        }));
      }

      if (msg.event === "stop") {
        if (openaiWs?.readyState === WebSocket.OPEN) {
          openaiWs.close();
        }
      }
    });

    twilioWs.on("close", () => {
      if (openaiWs?.readyState === WebSocket.OPEN) {
        openaiWs.close();
      }
    });
  });
}

// Post the result back to our own webhook in the same format
async function postCallResult(callSid, metadata, transcript) {
  try {
    console.log(`    📤 Posting to webhook: ${metadata.cafe_name} — transcript: "${transcript.slice(0, 100)}..."`);
    // Post to localhost to bypass auth (internal self-post)
    const port = process.env.PORT || 3001;
    const webhookUrl = `http://127.0.0.1:${port}/webhook/call-complete`;
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        call_id: callSid,
        completed: true,
        transcripts: [{ text: transcript }],
        metadata: {
          cafe_id: metadata.cafe_id,
          cafe_name: metadata.cafe_name,
          suburb: metadata.suburb,
        },
      }),
    });
    console.log(`    ✅ Webhook response: ${response.status}`);
  } catch (err) {
    console.error(`    ❌ Failed to post call result for ${metadata.cafe_name}:`, err.message);
  }
}

export { chunk } from "./utils.js";
