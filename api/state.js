import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const STATE_KEY = "wt:state";

function checkPin(req) {
  const expected = process.env.SYNC_PIN;
  if (!expected) return false;
  const provided = req.headers["x-pin"];
  return provided === expected;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!process.env.SYNC_PIN) {
    return res.status(503).json({ error: "sync_not_configured" });
  }

  if (!checkPin(req)) {
    return res.status(401).json({ error: "invalid_pin" });
  }

  try {
    if (req.method === "GET") {
      const state = await redis.get(STATE_KEY);
      return res.status(200).json(state ?? null);
    }
    if (req.method === "POST") {
      const body = req.body;
      if (!body || typeof body !== "object") {
        return res.status(400).json({ error: "invalid_body" });
      }
      await redis.set(STATE_KEY, body);
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: "method_not_allowed" });
  } catch (e) {
    return res.status(500).json({ error: "server_error", detail: String(e) });
  }
}
