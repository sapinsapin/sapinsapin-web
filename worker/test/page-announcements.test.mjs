import test from 'node:test'
import assert from 'node:assert/strict'
import { checkPageAndAnnounce } from '../src/page-announcements.js'

// A tiny in-memory stand-in for a Cloudflare KV namespace.
function fakeKV() {
  const m = new Map()
  return { get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, v) }, _m: m }
}

function fakeFetch({ posts, discordOk = true }) {
  const calls = []
  const impl = async (url, opts = {}) => {
    calls.push({ url: String(url), opts })
    if (String(url).includes('graph.facebook.com')) {
      return new Response(JSON.stringify({ data: posts }), { status: 200 })
    }
    if (String(url).includes('discord.com')) {
      return new Response('{}', { status: discordOk ? 200 : 500 })
    }
    throw new Error('unexpected url ' + url)
  }
  impl.calls = calls
  return impl
}

const env = (kv) => ({
  META_PAGE_TOKEN: 'page-token-test',
  PAGE_ID: '576842565842965',
  DISCORD_BOT_TOKEN: 'bot-token-test',
  ANNOUNCE_CHANNEL_ID: '1548673050046763081',
  ANNOUNCED: kv,
})

const post = (id, message = 'Hello world') => ({
  id,
  created_time: '2026-11-07T02:00:00+0000',
  message,
  permalink_url: `https://www.facebook.com/576842565842965/posts/${id}`,
})

test('first run records existing posts and announces nothing', async () => {
  const kv = fakeKV()
  const f = fakeFetch({ posts: [post('p1'), post('p2')] })
  const r = await checkPageAndAnnounce(env(kv), f)
  assert.equal(r.status, 'initialised')
  assert.equal(f.calls.filter(c => c.url.includes('discord.com')).length, 0)
  assert.ok(kv._m.has('p1') && kv._m.has('p2'))
})

test('a new post is announced once, and never again', async () => {
  const kv = fakeKV()
  await checkPageAndAnnounce(env(kv), fakeFetch({ posts: [post('p1')] }))
  const f = fakeFetch({ posts: [post('p2', 'New announcement'), post('p1')] })
  const first = await checkPageAndAnnounce(env(kv), f)
  assert.equal(first.announced, 1)
  const discordCalls = f.calls.filter(c => c.url.includes('discord.com'))
  assert.equal(discordCalls.length, 1)
  const body = JSON.parse(discordCalls[0].opts.body)
  assert.equal(body.embeds[0].title, 'New post on the SapinSapin AI Facebook Page')
  assert.equal(body.embeds[0].description, 'New announcement')
  assert.match(body.embeds[0].url, /posts\/p2/)
  assert.deepEqual(body.allowed_mentions, { parse: [] })

  const again = await checkPageAndAnnounce(env(kv), fakeFetch({ posts: [post('p2', 'New announcement'), post('p1')] }))
  assert.equal(again.announced, 0)
})

test('posts are announced oldest first', async () => {
  const kv = fakeKV()
  await checkPageAndAnnounce(env(kv), fakeFetch({ posts: [] }))
  const f = fakeFetch({ posts: [post('new2'), post('new1')] }) // API returns newest first
  await checkPageAndAnnounce(env(kv), f)
  const order = f.calls.filter(c => c.url.includes('discord.com')).map(c => JSON.parse(c.opts.body).embeds[0].url)
  assert.match(order[0], /new1/)
  assert.match(order[1], /new2/)
})

test('a failed Discord post is retried on the next run', async () => {
  const kv = fakeKV()
  await checkPageAndAnnounce(env(kv), fakeFetch({ posts: [] }))
  await assert.rejects(checkPageAndAnnounce(env(kv), fakeFetch({ posts: [post('p9')], discordOk: false })))
  assert.equal(kv._m.has('p9'), false)
  const retry = await checkPageAndAnnounce(env(kv), fakeFetch({ posts: [post('p9')] }))
  assert.equal(retry.announced, 1)
})

test('a post with a photo gets the photo as the embed image', async () => {
  const kv = fakeKV()
  await checkPageAndAnnounce(env(kv), fakeFetch({ posts: [] }))
  const withPhoto = { ...post('p7', 'Photo post'), full_picture: 'https://example.com/photo.jpg', created_time: '2026-11-07T02:27:13+0000' }
  const f = fakeFetch({ posts: [withPhoto] })
  await checkPageAndAnnounce(env(kv), f)
  const embed = JSON.parse(f.calls.find(c => c.url.includes('discord.com')).opts.body).embeds[0]
  assert.equal(embed.image.url, 'https://example.com/photo.jpg')
  assert.equal(embed.timestamp, '2026-11-07T02:27:13.000Z')
})

test('a long caption is shown in full up to the Discord limit, with a clear end', async () => {
  const kv = fakeKV()
  await checkPageAndAnnounce(env(kv), fakeFetch({ posts: [] }))
  const long = 'Line one.\n\nLine two. '.repeat(400) // about 9000 characters
  const f = fakeFetch({ posts: [post('p8', long)] })
  await checkPageAndAnnounce(env(kv), f)
  const desc = JSON.parse(f.calls.find(c => c.url.includes('discord.com')).opts.body).embeds[0].description
  assert.ok(desc.length <= 4000, 'description within Discord limit: ' + desc.length)
  assert.ok(desc.endsWith('…'))
  assert.ok(desc.includes('Line one.\n\nLine two.'), 'line breaks kept')
})

test('a normal caption is shown complete, with its line breaks', async () => {
  const kv = fakeKV()
  await checkPageAndAnnounce(env(kv), fakeFetch({ posts: [] }))
  const caption = 'Every voice belongs.\n\nSpeak Filipino, and our model writes it out.\n\n#SapinSapinAI'
  const f = fakeFetch({ posts: [post('p9', caption)] })
  await checkPageAndAnnounce(env(kv), f)
  const desc = JSON.parse(f.calls.find(c => c.url.includes('discord.com')).opts.body).embeds[0].description
  assert.equal(desc, caption)
})

test('the Page token is sent in a header, not in the URL', async () => {
  const kv = fakeKV()
  await checkPageAndAnnounce(env(kv), fakeFetch({ posts: [] }))
  const f = fakeFetch({ posts: [] })
  await checkPageAndAnnounce(env(kv), f)
  const feed = f.calls.find(c => c.url.includes('graph.facebook.com'))
  assert.equal(feed.url.includes('page-token-test'), false)
  assert.equal(feed.opts.headers.Authorization, 'Bearer page-token-test')
})

test('does nothing and says so when configuration is missing', async () => {
  const r = await checkPageAndAnnounce({ ANNOUNCED: fakeKV() }, fakeFetch({ posts: [] }))
  assert.equal(r.status, 'not_configured')
})

test('a failed feed read posts nothing', async () => {
  const kv = fakeKV()
  const failing = async () => new Response('{"error":{}}', { status: 400 })
  const r = await checkPageAndAnnounce(env(kv), failing)
  assert.equal(r.status, 'feed_error')
})
