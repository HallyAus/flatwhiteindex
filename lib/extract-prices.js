// Price extraction from voice-call transcripts. Lifted from webhook.js so the
// Vercel Functions can import it. Pure functions — no Express, no DB.

const WORD_TO_NUM = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  fifty: 0.50, eighty: 0.80, twenty: 0.20, thirty: 0.30,
  forty: 0.40, sixty: 0.60, seventy: 0.70, ninety: 0.90,
  "twenty-five": 0.25, "seventy-five": 0.75,
};

const SIZE_LARGE_RE = /\b(large|big|takeaway-large|sixteen|sixteen-ounce)\b/i;
const SIZE_SMALL_RE = /\b(small|regular|standard|eight|eight-ounce|takeaway)\b/i;

/**
 * Extract small / large prices from a call transcript.
 * @returns {{ price_small: number|null, price_large: number|null, needs_review: boolean }}
 */
export function extractPrices(transcript) {
  if (!transcript) return { price_small: null, price_large: null, needs_review: false };
  const text = String(transcript).slice(0, 50000);
  const candidates = new Set();

  // $4.50, $5, etc.
  for (const m of text.matchAll(/\$(\d+(?:\.\d{1,2})?)/g)) {
    candidates.add(parseFloat(m[1]));
  }
  // four fifty, five eighty, six twenty
  for (const m of text.matchAll(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten)[ -](fifty|eighty|twenty|thirty|forty|sixty|seventy|ninety|twenty-five|seventy-five)\b/gi)) {
    const dollars = WORD_TO_NUM[m[1].toLowerCase()];
    const cents = WORD_TO_NUM[m[2].toLowerCase()];
    if (dollars != null && cents != null) candidates.add(dollars + cents);
  }

  const valid = [...candidates].filter((p) => p >= 3 && p <= 15);
  if (valid.length === 0) {
    return { price_small: null, price_large: null, needs_review: text.length > 50 };
  }

  let price_small = null;
  let price_large = null;
  if (SIZE_LARGE_RE.test(text) && SIZE_SMALL_RE.test(text) && valid.length >= 2) {
    valid.sort((a, b) => a - b);
    price_small = valid[0];
    price_large = valid[valid.length - 1];
  } else if (SIZE_LARGE_RE.test(text) && !SIZE_SMALL_RE.test(text)) {
    price_large = Math.max(...valid);
  } else {
    price_small = Math.min(...valid);
  }

  return { price_small, price_large, needs_review: false };
}

/** Infer call status from a Bland.ai-style payload. */
export function inferStatus(payload) {
  const transcript = (payload.transcripts || []).map((t) => t.text || "").join(" ").toLowerCase();
  if (transcript.includes("leave a message") || transcript.includes("after the beep")) return "voicemail";
  if (transcript.includes("no flat white") || transcript.includes("don't do flat whites")) return "no_flat_white";
  if (payload.completed === false || payload.error) return "failed";
  if (transcript.length < 50) return "no_answer";
  return "completed";
}
