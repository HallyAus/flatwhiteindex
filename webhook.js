import express from "express";
import { saveCallResult } from "./db.js";

const app = express();
app.use(express.json());

const PRICE_PATTERNS = [
  /\$\s*(\d+(?:\.\d{1,2})?)/g,
  /(\d+)\s*dollars?\s*(?:and\s*)?(\d+)?\s*cents?/gi,
  /\b(four|five|six|seven|eight|nine|ten)\s*(fifty|eighty|twenty|seventy|thirty|forty|sixty|ninety|dollars?)\b/gi,
  /(\d+(?:\.\d{1,2})?)\s*(?:bucks?|dollars?|AUD)/gi,
];

const WORD_TO_NUM = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  fifty: 0.50, eighty: 0.80, twenty: 0.20, thirty: 0.30,
  forty: 0.40, sixty: 0.60, seventy: 0.70, ninety: 0.90,
  "twenty-five": 0.25, "seventy-five": 0.75,
};

export function extractPrices(transcript) {
  if (!transcript) return { price_small: null, price_large: null, needs_review: false };

  const prices = [];

  const dollarMatches = [...transcript.matchAll(/\$\s*(\d+(?:\.\d{1,2})?)/g)];
  dollarMatches.forEach(m => {
    const val = parseFloat(m[1]);
    if (val >= 3 && val <= 15) prices.push(val);
  });

  const wordMatches = [...transcript.matchAll(/\b(four|five|six|seven|eight|nine|ten)\s+(fifty|eighty|twenty|thirty|forty|sixty|seventy|ninety)\b/gi)];
  wordMatches.forEach(m => {
    const dollars = WORD_TO_NUM[m[1].toLowerCase()];
    const cents = WORD_TO_NUM[m[2].toLowerCase()];
    if (dollars !== undefined && cents !== undefined) prices.push(dollars + cents);
  });

  const uniquePrices = [...new Set(prices)].sort((a, b) => a - b);

  const hasSmall = /small|regular|standard/i.test(transcript);
  const hasLarge = /large|big/i.test(transcript);

  if (uniquePrices.length === 0) {
    return { price_small: null, price_large: null, needs_review: true };
  }

  if (uniquePrices.length === 1) {
    return {
      price_small: hasLarge ? null : uniquePrices[0],
      price_large: hasLarge ? uniquePrices[0] : null,
      needs_review: false,
    };
  }

  return {
    price_small: uniquePrices[0],
    price_large: uniquePrices[uniquePrices.length - 1],
    needs_review: false,
  };
}

function inferStatus(payload) {
  if (payload.answered_by === "voicemail") return "voicemail";
  if (!payload.completed) return "no_answer";

  const transcript = (payload.transcripts || [])
    .map(t => t.text)
    .join(" ")
    .toLowerCase();

  if (/don't do flat white|we don't serve|we don't have/i.test(transcript)) return "no_flat_white";
  if (/remove|stop calling|not interested|do not call/i.test(transcript)) return "refused";

  return "completed";
}

app.post("/webhook/call-complete", async (req, res) => {
  try {
    const payload = req.body;
    const cafeId = payload.metadata?.cafe_id;
    const blandCallId = payload.call_id;

    if (!cafeId || !blandCallId) {
      return res.status(400).json({ error: "Missing cafe_id or call_id" });
    }

    const transcript = (payload.transcripts || []).map(t => t.text).join(" ");
    const status = inferStatus(payload);
    const { price_small, price_large, needs_review } = extractPrices(transcript);

    await saveCallResult({
      cafe_id: cafeId,
      bland_call_id: blandCallId,
      status,
      price_small: status === "completed" ? price_small : null,
      price_large: status === "completed" ? price_large : null,
      raw_transcript: transcript,
      needs_review: needs_review && status === "completed",
      completed_at: new Date().toISOString(),
    });

    console.log(`✓ ${payload.metadata?.cafe_name} (${payload.metadata?.suburb}) — ${status} — small: $${price_small}, large: $${price_large}`);

    res.json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/health", (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🪝  Webhook receiver listening on port ${PORT}`);
  console.log(`   POST ${process.env.WEBHOOK_BASE_URL}/webhook/call-complete`);
});

export default app;
