import "dotenv/config";
import { fetchSydneyCafes } from "./cafes.js";
import { dispatchCalls } from "./caller.js";
import { upsertCafes, markCafesBulkStatus, getCafeByPlaceId, getCalledCafeIds, getEligibleCafesFromDb } from "./db.js";

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

  console.log("💾 Upserting ALL cafés to Supabase...");
  await upsertCafes(cafes);

  // Mark eligible/excluded status in DB
  if (filtered.length > 0) {
    const eligibleIds = filtered.map(c => c.google_place_id);
    await markCafesBulkStatus(eligibleIds, "eligible");
  }
  if (excluded.length > 0) {
    const excludedIds = excluded.filter(c => c.google_place_id).map(c => c.google_place_id);
    if (excludedIds.length > 0) {
      await markCafesBulkStatus(excludedIds, "excluded", "filtered");
    }
  }
  console.log(`   ✓ ${filtered.length} marked eligible, ${excluded.length} marked excluded`);

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
    // Use the first eligible cafe's DB record so the UUID is valid
    const firstCafe = filtered[0];
    if (!firstCafe) {
      console.log("❌ No eligible cafes found to use as test. Run without --test-call first.");
      return;
    }
    const dbCafe = await getCafeByPlaceId(firstCafe.google_place_id);
    if (!dbCafe) {
      console.log("❌ Cafe not found in DB. Run without --test-call first to upsert.");
      return;
    }

    console.log(`\n🧪 TEST CALL — calling ${TEST_NUMBER} as "${firstCafe.name}"`);
    console.log(`   Mia will call you, confirm the café name, and ask for a flat white price.`);
    console.log(`   Pretend you're a barista and give her a price!\n`);
    const testCafe = {
      id: dbCafe.id,
      name: firstCafe.name,
      phone: TEST_NUMBER,
      suburb: firstCafe.suburb || "Sydney",
    };
    await dispatchCalls([testCafe], 1);
    console.log("\n✅ Test call dispatched. Check webhook logs for the result.");
    console.log("   journalctl -u flatwhite-webhook -f");
    return;
  }

  // Get eligible cafes from DB (they have real UUIDs) and exclude already-called ones
  console.log("🔍 Checking which cafés have already been called...");
  const [dbCafes, calledIds] = await Promise.all([
    getEligibleCafesFromDb(),
    getCalledCafeIds(),
  ]);

  const uncalled = dbCafes.filter(c => !calledIds.has(c.id));
  const alreadyCalled = dbCafes.length - uncalled.length;

  console.log(`   ${dbCafes.length} eligible in DB, ${alreadyCalled} already called, ${uncalled.length} remaining\n`);

  if (uncalled.length === 0) {
    console.log("✅ All eligible cafés have been called! Nothing to do.");
    return;
  }

  // Take only BATCH_SIZE from the uncalled list
  const batch = uncalled.slice(0, BATCH_SIZE);
  console.log(`📞 Dispatching ${batch.length} calls (batch of ${BATCH_SIZE})...\n`);

  await dispatchCalls(batch, BATCH_SIZE);

  const remaining = uncalled.length - batch.length;
  console.log(`\n✅ Batch dispatched. Results will arrive via webhook.`);
  console.log(`   ${remaining} cafés remaining — run again for the next batch.`);
  console.log("   Monitor: journalctl -u flatwhite-webhook -f");
}

const isMainModule = process.argv[1]?.replace(/\\/g, "/").endsWith("index.js");
if (isMainModule) {
  main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
