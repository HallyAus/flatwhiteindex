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
