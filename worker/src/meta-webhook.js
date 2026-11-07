// ─────────────────────────────────────────────
// META PAGE WEBHOOK — step 1 of the announcements plan
//
// Meta (Facebook) calls /meta-webhook in two ways:
//   GET  — once, to check that this address is ours (the "handshake").
//   POST — each time a Page event happens. The body is signed with the
//          app secret, so we refuse anything whose signature does not match.
//
// This step only verifies and logs. It does NOT post to Discord yet.
// If META_VERIFY_TOKEN or META_APP_SECRET is missing, the route refuses
// every request (fail closed).
// ─────────────────────────────────────────────

export async function handleMetaWebhook(request, env) {
  const url = new URL(request.url);

  if (request.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (!env.META_VERIFY_TOKEN) {
      return new Response("Not configured", { status: 503 });
    }
    if (mode === "subscribe" && token && token === env.META_VERIFY_TOKEN && challenge) {
      return new Response(challenge, {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (request.method === "POST") {
    if (!env.META_APP_SECRET) {
      return new Response("Not configured", { status: 503 });
    }

    const body = await request.text();
    const signature = request.headers.get("x-hub-signature-256") || "";
    if (!(await hasValidMetaSignature(body, signature, env.META_APP_SECRET))) {
      return new Response("Invalid signature", { status: 401 });
    }

    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return new Response("Bad JSON", { status: 400 });
    }

    // Count new Page posts only. Likes, comments and other events are ignored.
    let newPosts = 0;
    for (const entry of payload?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        if (change?.field === "feed" && change?.value?.item === "post" && change?.value?.verb === "add") {
          newPosts++;
        }
      }
    }
    // Log counts only, never post text or personal details.
    console.log("Meta Page notice received; new posts:", newPosts);
    return new Response("OK", { status: 200 });
  }

  return new Response("Method not allowed", { status: 405 });
}

// Meta sends "sha256=<hex>" where the hex is HMAC-SHA256(app secret, raw body).
export async function hasValidMetaSignature(body, header, secret) {
  if (!header.startsWith("sha256=")) return false;
  const expected = header.slice("sha256=".length).toLowerCase();

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const actual = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");

  if (actual.length !== expected.length) return false;
  // Compare every character, so timing does not reveal how much matched.
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
