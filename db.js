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

// Only skip cafes that completed successfully (got a price or confirmed no flat white)
// Failed, no_answer, voicemail, and pending calls should be retried
export async function getCalledCafeIds() {
  const allIds = [];
  let from = 0;
  const pageSize = 1000;
  const doneStatuses = ["completed", "no_flat_white", "refused"];

  while (true) {
    const { data, error } = await supabase()
      .from("price_calls")
      .select("cafe_id")
      .in("status", doneStatuses)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`getCalledCafeIds: ${error.message}`);
    allIds.push(...data.map(r => r.cafe_id));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return new Set(allIds);
}

export async function getEligibleCafesFromDb() {
  const allCafes = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase()
      .from("cafes")
      .select("id, google_place_id, name, suburb, phone, lat, lng")
      .eq("status", "eligible")
      .not("phone", "is", null)
      .order("id")
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`getEligibleCafesFromDb: ${error.message}`);
    allCafes.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return allCafes;
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
  // Clean up old failed/no_answer attempts for this cafe before inserting
  const { error: delError } = await supabase()
    .from("price_calls")
    .delete()
    .eq("cafe_id", cafeId)
    .in("status", ["no_answer", "voicemail", "failed", "pending"]);

  if (delError) {
    console.warn(`⚠️ markCallDispatched cleanup failed for cafe ${cafeId}: ${delError.message}`);
  }

  const { error } = await supabase()
    .from("price_calls")
    .insert({
      cafe_id: cafeId,
      bland_call_id: blandCallId,
      status: "pending",
    });

  if (error) throw new Error(`markCallDispatched: ${error.message}`);
}

export async function getCallByBlandId(blandCallId) {
  const { data, error } = await supabase()
    .from("price_calls")
    .select("status, price_small, price_large, raw_transcript")
    .eq("bland_call_id", blandCallId)
    .single();

  if (error) return null;
  return data;
}

export async function saveCallResult(result) {
  const { data, error } = await supabase()
    .from("price_calls")
    .update({
      status: result.status,
      price_small: result.price_small,
      price_large: result.price_large,
      raw_transcript: result.raw_transcript,
      needs_review: result.needs_review,
      completed_at: result.completed_at,
    })
    .eq("bland_call_id", result.bland_call_id)
    .select("id");

  if (error) throw new Error(`saveCallResult: ${error.message}`);
  if (!data || data.length === 0) {
    console.warn(`⚠️ saveCallResult: no matching row for bland_call_id=${result.bland_call_id} — result may be lost`);
  }
}

export async function getPriceStats() {
  const allData = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase()
      .from("price_calls")
      .select(`
        cafe_id,
        price_small,
        price_large,
        status,
        cafes (
          name, suburb, lat, lng, google_rating
        )
      `)
      .eq("status", "completed")
      .not("price_small", "is", null)
      .order("cafe_id")
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`getPriceStats: ${error.message}`);
    allData.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return allData;
}

export async function getDiscoveredCafes() {
  const allCafes = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase()
      .from("cafes")
      .select("id, name, suburb, lat, lng, google_rating, phone, status, exclude_reason")
      .in("status", ["eligible", "discovered"])
      .order("id")
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`getDiscoveredCafes: ${error.message}`);
    allCafes.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return allCafes;
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
  const db = supabase();

  // Use head:true + count to avoid fetching rows
  const [cafesTotal, cafesExcluded, callsTotal, callsCompleted, callsPending] = await Promise.all([
    db.from("cafes").select("*", { count: "exact", head: true }),
    db.from("cafes").select("*", { count: "exact", head: true }).eq("status", "excluded"),
    db.from("price_calls").select("*", { count: "exact", head: true }),
    db.from("price_calls").select("*", { count: "exact", head: true }).eq("status", "completed"),
    db.from("price_calls").select("*", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  const total = cafesTotal.count || 0;
  const excluded = cafesExcluded.count || 0;
  const eligible = total - excluded;
  const calls = callsTotal.count || 0;
  const completed = callsCompleted.count || 0;
  const pending = callsPending.count || 0;
  const failed = calls - completed - pending;

  return { total: calls, completed, pending, failed, cafes_total: total, cafes_eligible: eligible, cafes_excluded: excluded };
}

// --- Subscribers ---

export async function saveSubscriberToDb(email, source) {
  const { data, error } = await supabase()
    .from("subscribers")
    .upsert({ email, source, subscribed_at: new Date().toISOString() }, { onConflict: "email", ignoreDuplicates: true })
    .select("email");

  if (error) throw new Error(`saveSubscriberToDb: ${error.message}`);
  return data?.length > 0;
}

// --- User price submissions ---

export async function saveUserPriceSubmission({ name, suburb, price_small, price_large }) {
  const { error } = await supabase()
    .from("user_price_submissions")
    .insert({ cafe_name: name, suburb, price_small, price_large, submitted_at: new Date().toISOString() });

  if (error) throw new Error(`saveUserPriceSubmission: ${error.message}`);
}

// --- Admin functions ---

export async function getRecentCalls(limit = 50, statusFilter = null) {
  let query = supabase()
    .from("price_calls")
    .select(`
      id, cafe_id, bland_call_id, status, price_small, price_large,
      raw_transcript, needs_review, called_at, completed_at,
      cafes ( name, suburb, phone, google_rating )
    `)
    .order("called_at", { ascending: false })
    .limit(limit);

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }
  const { data, error } = await query;
  if (error) throw new Error(`getRecentCalls: ${error.message}`);
  return data;
}

export async function getNeedsReviewCalls() {
  const { data, error } = await supabase()
    .from("price_calls")
    .select(`
      id, cafe_id, bland_call_id, status, price_small, price_large,
      raw_transcript, needs_review, called_at, completed_at,
      cafes ( name, suburb, phone )
    `)
    .eq("needs_review", true)
    .eq("status", "completed")
    .order("completed_at", { ascending: false });

  if (error) throw new Error(`getNeedsReviewCalls: ${error.message}`);
  return data;
}

export async function updateCallPrice(callId, priceSmall, priceLarge, approve) {
  const update = {
    price_small: priceSmall,
    price_large: priceLarge,
    needs_review: !approve,
  };
  const { error } = await supabase()
    .from("price_calls")
    .update(update)
    .eq("id", callId);

  if (error) throw new Error(`updateCallPrice: ${error.message}`);
}

export async function updateCallStatus(callId, status) {
  const { error } = await supabase()
    .from("price_calls")
    .update({ status })
    .eq("id", callId);

  if (error) throw new Error(`updateCallStatus: ${error.message}`);
}

export async function deleteCall(callId) {
  const { error } = await supabase()
    .from("price_calls")
    .delete()
    .eq("id", callId);

  if (error) throw new Error(`deleteCall: ${error.message}`);
}

export async function searchCafes(query = '', statusFilter = null, limit = 100) {
  let q = supabase()
    .from("cafes")
    .select("id, google_place_id, name, address, suburb, phone, lat, lng, google_rating, status, exclude_reason, created_at")
    .order("name")
    .limit(limit);

  if (statusFilter) {
    q = q.eq("status", statusFilter);
  }
  if (query) {
    q = q.ilike("name", `%${query}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(`searchCafes: ${error.message}`);
  return data;
}

export async function updateCafe(cafeId, updates) {
  // Only allow specific fields to be updated
  const allowed = {};
  if (updates.status !== undefined) allowed.status = updates.status;
  if (updates.exclude_reason !== undefined) allowed.exclude_reason = updates.exclude_reason;
  if (updates.name !== undefined) allowed.name = String(updates.name).slice(0, 200);
  if (updates.suburb !== undefined) allowed.suburb = String(updates.suburb).slice(0, 100);
  if (updates.phone !== undefined) allowed.phone = String(updates.phone).slice(0, 20);

  if (Object.keys(allowed).length === 0) return;

  const { error } = await supabase()
    .from("cafes")
    .update(allowed)
    .eq("id", cafeId);

  if (error) throw new Error(`updateCafe: ${error.message}`);
}

export async function deleteCafe(cafeId) {
  // Delete associated calls first (CASCADE should handle this but be explicit)
  await supabase().from("price_calls").delete().eq("cafe_id", cafeId);
  const { error } = await supabase().from("cafes").delete().eq("id", cafeId);
  if (error) throw new Error(`deleteCafe: ${error.message}`);
}

export async function getSubscribers() {
  const { data, error } = await supabase()
    .from("subscribers")
    .select("*")
    .order("subscribed_at", { ascending: false });

  if (error) throw new Error(`getSubscribers: ${error.message}`);
  return data;
}

export async function deleteSubscriber(email) {
  const { error } = await supabase()
    .from("subscribers")
    .delete()
    .eq("email", email);

  if (error) throw new Error(`deleteSubscriber: ${error.message}`);
}

export async function getUserSubmissions() {
  const { data, error } = await supabase()
    .from("user_price_submissions")
    .select("*")
    .order("submitted_at", { ascending: false });

  if (error) throw new Error(`getUserSubmissions: ${error.message}`);
  return data;
}

export async function deleteUserSubmission(id) {
  const { error } = await supabase()
    .from("user_price_submissions")
    .delete()
    .eq("id", id);

  if (error) throw new Error(`deleteUserSubmission: ${error.message}`);
}

export async function retryCall(callId) {
  // Reset call status to allow re-calling
  const { error } = await supabase()
    .from("price_calls")
    .delete()
    .eq("id", callId);

  if (error) throw new Error(`retryCall: ${error.message}`);
}

export async function bulkRetryFailed() {
  const { data, error } = await supabase()
    .from("price_calls")
    .delete()
    .in("status", ["failed", "no_answer"])
    .select("id");

  if (error) throw new Error(`bulkRetryFailed: ${error.message}`);
  return data?.length || 0;
}
