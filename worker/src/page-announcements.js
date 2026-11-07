// ─────────────────────────────────────────────
// PAGE ANNOUNCEMENTS — checks the SapinSapin Facebook Page every 10 minutes
// and posts each NEW Page post to the Discord #announcements channel.
//
// Why polling and not webhooks: Meta only sends Page notices to apps that
// are approved for Page access. Reading the Page's own feed works in
// Development mode for an app admin (tested 2026-11-07), so this needs no
// Meta review.
//
// Nothing is posted on the first run. The first run only records the
// existing posts, so the channel is not flooded with old announcements.
// ─────────────────────────────────────────────

const GRAPH_VERSION = "v27.0";
const DISCORD_API = "https://discord.com/api/v10";
const FIRST_RUN_KEY = "__initialized";
const MAX_POSTS_PER_RUN = 5;
// Discord allows 4096 characters in an embed description. Stay under it with a margin.
const DESCRIPTION_MAX = 4000;

export async function checkPageAndAnnounce(env, fetchImpl = fetch) {
  const missing = ["META_PAGE_TOKEN", "PAGE_ID", "DISCORD_BOT_TOKEN", "ANNOUNCE_CHANNEL_ID", "ANNOUNCED"]
    .filter((name) => !env[name]);
  if (missing.length) {
    console.log("Page announcements not configured; missing:", missing.join(", "));
    return { status: "not_configured", missing };
  }

  // Read the newest posts from the Page. The token goes in a header, not the URL.
  const feedUrl =
    `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(env.PAGE_ID)}/feed` +
    `?fields=id,created_time,message,permalink_url,full_picture&limit=${MAX_POSTS_PER_RUN}`;
  const feedRes = await fetchImpl(feedUrl, {
    headers: { Authorization: `Bearer ${env.META_PAGE_TOKEN}` },
  });
  if (!feedRes.ok) {
    // Log the status only. Never log the response body, which can echo request details.
    console.log("Page feed read failed with status", feedRes.status);
    return { status: "feed_error", httpStatus: feedRes.status };
  }
  const feed = await feedRes.json();
  const posts = Array.isArray(feed?.data) ? feed.data : [];

  // First run: record what exists, announce nothing.
  const initialized = await env.ANNOUNCED.get(FIRST_RUN_KEY);
  if (!initialized) {
    for (const post of posts) await env.ANNOUNCED.put(post.id, "1");
    await env.ANNOUNCED.put(FIRST_RUN_KEY, "1");
    console.log("Page announcements initialised; existing posts recorded:", posts.length);
    return { status: "initialised", recorded: posts.length };
  }

  // Oldest first, so announcements appear in the order they were published.
  const fresh = [];
  for (const post of [...posts].reverse()) {
    if (!(await env.ANNOUNCED.get(post.id))) fresh.push(post);
  }

  let announced = 0;
  for (const post of fresh) {
    await postToDiscord(env, post, fetchImpl);
    // Record the post only after Discord accepted it, so a failed post is retried next run.
    await env.ANNOUNCED.put(post.id, "1");
    announced++;
  }
  console.log("Page announcements checked; new posts announced:", announced);
  return { status: "ok", announced };
}

async function postToDiscord(env, post, fetchImpl) {
  // Keep the caption's line breaks; tidy only excess spaces and blank lines.
  const text = (post.message || "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const description = text.length > DESCRIPTION_MAX
    ? text.slice(0, DESCRIPTION_MAX).replace(/\s+\S*$/, "") + "…"
    : text;
  const link = post.permalink_url || `https://www.facebook.com/${post.id}`;

  // A Discord "embed" is a card: title, full caption, colour bar, photo and time.
  // Bots cannot embed a playable Facebook video, so the thumbnail and link stand in for it.
  const embed = {
    title: "New post on the SapinSapin AI Facebook Page",
    url: link,
    color: 0x6b4fbb,
    footer: { text: "SapinSapin AI · Facebook" },
  };
  if (description) embed.description = description;
  if (post.full_picture) embed.image = { url: post.full_picture };
  const when = post.created_time ? new Date(post.created_time) : null;
  if (when && !Number.isNaN(when.getTime())) embed.timestamp = when.toISOString();

  const res = await fetchImpl(`${DISCORD_API}/channels/${encodeURIComponent(env.ANNOUNCE_CHANNEL_ID)}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    // allowed_mentions stops a Page post from pinging @everyone or roles.
    body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }),
  });
  if (!res.ok) {
    console.log("Discord announcement failed with status", res.status);
    throw new Error(`Discord announcement failed: ${res.status}`);
  }
}
