// Shared utilities

export function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Sanitise a string for safe interpolation into LLM prompts
// Strips control characters, limits length, removes potential injection patterns
export function sanitiseForPrompt(str, maxLen = 80) {
  if (!str || typeof str !== 'string') return 'Unknown';
  return str.replace(/[^\w\s&'.\-,()\/]/g, '').slice(0, maxLen).trim() || 'Unknown';
}
