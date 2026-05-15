import { testConnection } from "../db.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const ok = await testConnection();
    res.setHeader("Cache-Control", "no-store");
    res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "degraded", ts: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: "down", error: err.message });
  }
}
