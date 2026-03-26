import { markCallDispatched } from "./db.js";
import { WebSocketServer } from "ws";
import { WebSocket } from "ws";
import { createServer } from "node:http";

const AGENT_PROMPT = `You are Mia. You're calling cafés in Sydney to ask one question: the price of a regular flat white.

When they pick up, wait a moment, then say: "Hi there, is this {{cafe_name}}?"

If yes: "Great, I'm calling from the Flat White Index. We're a free coffee price guide for Sydney. Quick question — how much is a regular flat white?"

When they answer, confirm the exact amount: "So that's [dollars] dollars [cents]? Perfect, thanks so much! Have a great day."

If they ask who you are: "The Flat White Index — it's at flatwhiteindex.com.au."
If they ask if you're AI: "Yes I am — just collecting prices for a public guide."
If they don't do flat whites: "No worries, thanks anyway!"
If they want you to stop: "Sorry to bother you, won't call again."
If voicemail: hang up immediately.

Keep it short and friendly. Under 45 seconds.`;

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
  // Dynamic import twilio (only needed when using this provider)
  const twilio = (await import("twilio")).default;
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  const webhookBase = process.env.WEBHOOK_BASE_URL;
  const prompt = AGENT_PROMPT.replace("{{cafe_name}}", cafe.name);

  // Store call metadata for when the media stream connects
  const callMetadata = {
    cafe_id: cafe.id,
    cafe_name: cafe.name,
    suburb: cafe.suburb,
    prompt,
  };

  const call = await client.calls.create({
    to: cafe.phone,
    from: process.env.TWILIO_PHONE_NUMBER,
    twiml: `<Response><Connect><Stream url="wss://${new URL(webhookBase).host}/media-stream" /></Connect></Response>`,
    machineDetection: "Enable",
    machineDetectionTimeout: 5,
    statusCallback: `${webhookBase}/webhook/twilio-status`,
    statusCallbackEvent: ["completed", "no-answer", "busy", "failed"],
    statusCallbackMethod: "POST",
  });

  // Store metadata keyed by call SID
  activeCalls.set(call.sid, callMetadata);

  await markCallDispatched(cafe.id, call.sid);
  console.log(`    📞 ${cafe.name} — call ${call.sid}`);
  return call.sid;
}

// WebSocket server for Twilio Media Streams ↔ OpenAI Realtime
export function setupMediaStreamServer(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    if (request.url === "/media-stream") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });

  wss.on("connection", (twilioWs) => {
    let openaiWs = null;
    let streamSid = null;
    let callSid = null;
    let transcript = "";

    twilioWs.on("message", (data) => {
      const msg = JSON.parse(data);

      if (msg.event === "start") {
        streamSid = msg.start.streamSid;
        callSid = msg.start.callSid;
        const metadata = activeCalls.get(callSid);

        console.log(`    🎙️  Media stream started for ${metadata?.cafe_name || callSid}`);

        // Connect to OpenAI Realtime
        openaiWs = new WebSocket("wss://api.openai.com/v1/realtime?model=gpt-4o-mini-realtime-preview", {
          headers: {
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
            "OpenAI-Beta": "realtime=v1",
          },
        });

        openaiWs.on("open", () => {
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
        });

        openaiWs.on("message", (data) => {
          const event = JSON.parse(data);

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
          }
          if (event.type === "conversation.item.input_audio_transcription.completed") {
            transcript += " [Cafe]: " + event.transcript;
          }
        });

        openaiWs.on("error", (err) => {
          console.error("OpenAI WebSocket error:", err.message);
        });

        openaiWs.on("close", () => {
          // Call ended — post result to our own webhook
          const metadata = activeCalls.get(callSid);
          if (metadata) {
            postCallResult(callSid, metadata, transcript);
            activeCalls.delete(callSid);
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
    const webhookUrl = `${process.env.WEBHOOK_BASE_URL}/webhook/call-complete`;
    await fetch(webhookUrl, {
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
  } catch (err) {
    console.error(`Failed to post call result for ${metadata.cafe_name}:`, err.message);
  }
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
