import "dotenv/config";
import { fetchSydneyCafes } from "./cafes.js";
import { dispatchCalls } from "./caller.js";
import { upsertCafes } from "./db.js";

const BATCH_SIZE = parseInt(process.argv.find(a => a.startsWith("--batch-size="))?.split("=")[1] || "10");
const DRY_RUN = process.argv.includes("--dry-run");
const SUBURB_FILTER = process.argv.find(a => a.startsWith("--suburb="))?.split("=")[1];
const TEST_NUMBER = process.argv.find(a => a.startsWith("--test-call="))?.split("=")[1];

const SYDNEY_BOUNDS = {
  northeast: { lat: -33.578, lng: 151.343 },
  southwest: { lat: -34.118, lng: 150.502 },
};

const EXCLUDED_CHAINS = [
  "starbucks", "mccafe", "gloria jean", "hudsons", "zarraffa",
  "the coffee club", "boost juice", "donut king", "michel's",
];

// Non-cafe venues that Google Places tags as "cafe"
const EXCLUDED_VENUES = [
  "museum", "gallery", "library", "cinema", "theater", "theatre",
  "nightclub", "club", "bar & grill", "hotel", "hostel", "motel",
  "dymocks", "bookstore", "bookshop", "ivy sydney",
  "university", "hospital", "airport",
];

export function isExcludedChain(name) {
  const nameLower = name.toLowerCase();
  return EXCLUDED_CHAINS.some(chain => nameLower.includes(chain))
    || EXCLUDED_VENUES.some(venue => nameLower.includes(venue));
}

export function filterEligibleCafes(cafes) {
  return cafes.filter(c => c.phone && !isExcludedChain(c.name));
}

export { EXCLUDED_CHAINS };

async function main() {
  console.log(`\n☕  Flat White Index — Sydney Caller`);
  console.log(`   Mode: ${DRY_RUN ? "DRY RUN (no calls)" : "LIVE"}`);
  console.log(`   Batch size: ${BATCH_SIZE}`);
  console.log(`   Suburb filter: ${SUBURB_FILTER || "all Sydney"}\n`);

  console.log("📍 Fetching Sydney cafés from Google Places...");
  const cafes = await fetchSydneyCafes(SYDNEY_BOUNDS, SUBURB_FILTER);

  const filtered = filterEligibleCafes(cafes);

  console.log(`   Found ${cafes.length} cafés → ${filtered.length} eligible (have phone, not a chain)\n`);

  console.log("💾 Upserting cafés to Supabase...");
  await upsertCafes(filtered);

  if (DRY_RUN) {
    console.log("\n🔍 Dry run — first 5 cafés that would be called:");
    filtered.slice(0, 5).forEach(c => {
      console.log(`   ${c.name} | ${c.suburb} | ${c.phone}`);
    });
    console.log("\n✅ Dry run complete. Remove --dry-run to make live calls.");
    return;
  }

  if (TEST_NUMBER) {
    console.log(`\n🧪 TEST CALL — calling ${TEST_NUMBER} as "Test Café"`);
    console.log(`   Mia will call you, confirm the café name, and ask for a flat white price.`);
    console.log(`   Pretend you're a barista and give her a price!\n`);
    const testCafe = {
      id: filtered[0]?.id || "test",
      name: "Test Café",
      phone: TEST_NUMBER,
      suburb: "Sydney",
    };
    await dispatchCalls([testCafe], 1);
    console.log("\n✅ Test call dispatched. Check webhook logs for the result.");
    console.log("   journalctl -u flatwhite-webhook -f");
    return;
  }

  const callableCafes = filtered.filter(c => !c.alreadyCalled);
  console.log(`📞 Dispatching calls to ${callableCafes.length} cafés in batches of ${BATCH_SIZE}...\n`);

  await dispatchCalls(callableCafes, BATCH_SIZE);

  console.log("\n✅ All batches dispatched. Results will arrive via webhook.");
  console.log("   Monitor: supabase dashboard → price_calls table");
}

const isMainModule = process.argv[1]?.replace(/\\/g, "/").endsWith("index.js");
if (isMainModule) {
  main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
