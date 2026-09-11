import { getStore } from "@netlify/blobs";

const JSON_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};
const VISITOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export default async function visits(request) {
  if (!["GET", "POST"].includes(request.method)) {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const store = getStore("payoffatlas-visitors");
    if (request.method === "POST") {
      const contentLength = Number(request.headers.get("content-length") || 0);
      if (contentLength > 1024) return json({ error: "Request too large" }, 413);
      const { visitorId } = await request.json();
      if (typeof visitorId !== "string" || !VISITOR_ID.test(visitorId)) {
        return json({ error: "Invalid anonymous visitor ID" }, 400);
      }
      // Rewriting the same anonymous browser key is idempotent and stores no IP,
      // account, financial input, or other personal information.
      await store.set(`visitor/${visitorId}`, new Date().toISOString());
    }

    const { blobs } = await store.list({ prefix: "visitor/" });
    return json({ count: blobs.length, approximate: true });
  } catch {
    return json({ error: "Visitor counter temporarily unavailable" }, 503);
  }
}

export const config = {
  path: "/api/visits",
};
