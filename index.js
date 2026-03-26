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
  "starbucks", "mccafe", "mcdonald", "gloria jean", "hudsons", "zarraffa",
  "the coffee club", "boost juice", "donut king", "michel's patisserie",
  "jamaica blue", "coffee guru", "muzz buzz", "soul origin",
];

// Non-cafe venues that Google Places incorrectly tags as "cafe"
const EXCLUDED_VENUES = [
  // Retail / supermarkets
  "woolworths", "coles", "aldi", "iga", "metro haymarket",
  // Bookstores
  "dymocks", "bookstore", "bookshop", "kinokuniya",
  // Entertainment / nightlife
  "museum", "gallery", "library", "cinema", "theater", "theatre",
  "nightclub", "club", "bar & grill", "ivy sydney", "casino",
  // Accommodation
  "hotel", "hostel", "motel", "resort", "airbnb",
  // Institutions
  "university", "hospital", "airport", "station",
  // Fast food / not coffee-focused
  "subway", "hungry jack", "kfc", "pizza", "sushi", "nando",
  "grill'd", "oporto", "red rooster", "kebab",
  // Department stores
  "david jones", "myer", "target", "kmart",
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
  const excluded = cafes.filter(c => !filtered.includes(c));

  console.log(`   Found ${cafes.length} cafés → ${filtered.length} eligible, ${excluded.length} excluded\n`);

  console.log("💾 Upserting cafés to Supabase...");
  await upsertCafes(filtered);

  if (DRY_RUN) {
    console.log("✅ ELIGIBLE — would be called:");
    filtered.forEach((c, i) => {
      console.log(`   ${i + 1}. ${c.name} | ${c.suburb || '—'} | ${c.phone}`);
    });

    if (excluded.length > 0) {
      console.log(`\n❌ EXCLUDED (${excluded.length}):`);
      excluded.forEach(c => {
        const reason = !c.phone ? 'no phone' : 'filtered name';
        console.log(`   ✗ ${c.name} | ${c.suburb || '—'} | ${c.phone || 'no phone'} [${reason}]`);
      });
    }

    console.log(`\n📊 Summary: ${filtered.length} eligible, ${excluded.length} excluded, ${cafes.length} total`);
    console.log("✅ Dry run complete. Remove --dry-run to make live calls.");
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
