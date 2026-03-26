import { createClient } from "@supabase/supabase-js";

let _supabase;

function supabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
  }
  return _supabase;
}

export async function upsertCafes(cafes) {
  const { error } = await supabase()
    .from("cafes")
    .upsert(cafes, { onConflict: "google_place_id", ignoreDuplicates: false });

  if (error) throw new Error(`upsertCafes: ${error.message}`);
}

export async function markCafeStatus(googlePlaceId, status, reason = null) {
  const update = { status };
  if (reason) update.exclude_reason = reason;
  const { error } = await supabase()
    .from("cafes")
    .update(update)
    .eq("google_place_id", googlePlaceId);

  if (error) throw new Error(`markCafeStatus: ${error.message}`);
}

export async function markCafesBulkStatus(googlePlaceIds, status, reason = null) {
  const update = { status };
  if (reason) update.exclude_reason = reason;
  const { error } = await supabase()
    .from("cafes")
    .update(update)
    .in("google_place_id", googlePlaceIds);

  if (error) throw new Error(`markCafesBulkStatus: ${error.message}`);
}

export async function getCalledCafeIds() {
  const { data, error } = await supabase()
    .from("price_calls")
    .select("cafe_id");

  if (error) throw new Error(`getCalledCafeIds: ${error.message}`);
  return new Set(data.map(r => r.cafe_id));
}

export async function getEligibleCafesFromDb() {
  const { data, error } = await supabase()
    .from("cafes")
    .select("id, google_place_id, name, suburb, phone, lat, lng")
    .eq("status", "eligible")
    .not("phone", "is", null);

  if (error) throw new Error(`getEligibleCafesFromDb: ${error.message}`);
  return data;
}

export async function getCafeByPlaceId(googlePlaceId) {
  const { data, error } = await supabase()
    .from("cafes")
    .select("id, name, suburb")
    .eq("google_place_id", googlePlaceId)
    .single();

  if (error) return null;
  return data;
}

export async function markCallDispatched(cafeId, blandCallId) {
  const { error } = await supabase()
    .from("price_calls")
    .insert({
      cafe_id: cafeId,
      bland_call_id: blandCallId,
      status: "pending",
    });

  if (error) throw new Error(`markCallDispatched: ${error.message}`);
}

export async function saveCallResult(result) {
  const { error } = await supabase()
    .from("price_calls")
    .update({
      status: result.status,
      price_small: result.price_small,
      price_large: result.price_large,
      raw_transcript: result.raw_transcript,
      needs_review: result.needs_review,
      completed_at: result.completed_at,
    })
    .eq("bland_call_id", result.bland_call_id);

  if (error) throw new Error(`saveCallResult: ${error.message}`);
}

export async function getPriceStats() {
  const { data, error } = await supabase()
    .from("price_calls")
    .select(`
      price_small,
      price_large,
      status,
      cafes (
        name, suburb, lat, lng, google_rating
      )
    `)
    .eq("status", "completed")
    .not("price_small", "is", null);

  if (error) throw new Error(`getPriceStats: ${error.message}`);
  return data;
}

export async function getDiscoveredCafes() {
  const { data, error } = await supabase()
    .from("cafes")
    .select("id, name, suburb, lat, lng, google_rating, phone, status, exclude_reason")
    .in("status", ["eligible", "discovered"]);

  if (error) throw new Error(`getDiscoveredCafes: ${error.message}`);
  return data;
}

export async function testConnection() {
  try {
    const { data, error } = await supabase().from("cafes").select("id").limit(1);
    if (error) throw error;
    return { ok: true, message: "Connected to Supabase" };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

export async function getCallStats() {
  // Count all cafes by status
  const { data: cafes, error: cafeErr } = await supabase()
    .from("cafes")
    .select("status");

  if (cafeErr) throw new Error(`getCallStats: ${cafeErr.message}`);

  const { data: calls, error: callErr } = await supabase()
    .from("price_calls")
    .select("status");

  if (callErr) throw new Error(`getCallStats: ${callErr.message}`);

  const cafeStats = { total: cafes.length, eligible: 0, excluded: 0 };
  cafes.forEach(c => {
    if (c.status === 'excluded') cafeStats.excluded++;
    else cafeStats.eligible++;
  });

  const callStats = { total: calls.length, completed: 0, pending: 0, failed: 0 };
  calls.forEach(row => {
    if (row.status === "completed") callStats.completed++;
    else if (row.status === "pending") callStats.pending++;
    else callStats.failed++;
  });

  return { ...callStats, cafes_total: cafeStats.total, cafes_eligible: cafeStats.eligible, cafes_excluded: cafeStats.excluded };
}
