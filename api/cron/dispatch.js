// Vercel Cron handler — runs on the schedule defined in vercel.json
// (currently every 15 min between 23:00 UTC and 05:00 UTC weekdays,
// matching 9am-3pm AEST). Fetches the most recent dispatch_jobs queue item
// and processes a small batch.
//
// Vercel automatically signs cron requests with x-vercel-cron header set;
// we additionally check CRON_SECRET if configured for defence in depth.

import { supabase } from "../../lib/supabase.js";
import { safeCompare } from "../../lib/webhook-verify.js";

export const config = {
  runtime: "nodejs",
  maxDuration: 300,
};

export default async function handler(req, res) {
  // Vercel Cron sends GET with x-vercel-cron header. Reject anything else.
  const cronHeader = req.headers["x-vercel-cron"];
  const authHeader = req.headers.authorization;
  if (!cronHeader && process.env.CRON_SECRET) {
    const provided = (authHeader || "").replace(/^Bearer\s+/i, "");
    if (!safeCompare(provided, process.env.CRON_SECRET)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  } else if (!cronHeader && !process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Pick the next pending dispatch job (FIFO).
  const sb = supabase();
  const { data: jobs, error } = await sb
    .from("dispatch_jobs")
    .select("id, suburb, batch_size, requested_by, requested_at")
    .eq("status", "pending")
    .order("requested_at", { ascending: true })
    .limit(1);
  if (error) {
    console.error("dispatch_jobs query error:", error.message);
    return res.status(500).json({ error: "DB error" });
  }
  if (!jobs || jobs.length === 0) {
    return res.json({ ok: true, processed: 0, note: "no pending jobs" });
  }

  const job = jobs[0];
  // Claim the job atomically.
  const { error: claimErr } = await sb
    .from("dispatch_jobs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", job.id)
    .eq("status", "pending");
  if (claimErr) {
    console.error("claim error:", claimErr.message);
    return res.status(500).json({ error: "Could not claim job" });
  }

  try {
    // Lazy import to keep cold-start cost on dispatch path only.
    const { runDispatchBatch } = await import("../../lib/dispatch-runner.js");
    const result = await runDispatchBatch({
      suburb: job.suburb || null,
      batchSize: job.batch_size || 10,
    });
    await sb
      .from("dispatch_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        result,
      })
      .eq("id", job.id);
    res.json({ ok: true, job_id: job.id, ...result });
  } catch (err) {
    console.error("dispatch error:", err);
    await sb
      .from("dispatch_jobs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        result: { error: err.message },
      })
      .eq("id", job.id);
    res.status(500).json({ error: "Dispatch failed", message: err.message });
  }
}
