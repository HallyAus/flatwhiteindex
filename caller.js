// Call provider router — switch between Bland.ai, Twilio+OpenAI, or ElevenLabs
// Set CALL_PROVIDER=bland or CALL_PROVIDER=twilio or CALL_PROVIDER=elevenlabs in .env

const provider = process.env.CALL_PROVIDER || "bland";

let _module;

if (provider === "elevenlabs") {
  _module = await import("./caller-elevenlabs.js");
  console.log("📞 Call provider: ElevenLabs Conversational AI");
} else if (provider === "twilio") {
  _module = await import("./caller-twilio.js");
  console.log("📞 Call provider: Twilio + OpenAI Realtime");
} else {
  _module = await import("./caller-bland.js");
  console.log("📞 Call provider: Bland.ai");
}

export const dispatchCalls = _module.dispatchCalls;
export const chunk = _module.chunk;

// Export setupMediaStreamServer only if Twilio provider
export const setupMediaStreamServer = _module.setupMediaStreamServer || null;
