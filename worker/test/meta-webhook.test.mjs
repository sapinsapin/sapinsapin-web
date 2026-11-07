import test from 'node:test'
import assert from 'node:assert/strict'
import { handleMetaWebhook, hasValidMetaSignature } from '../src/meta-webhook.js'

const SECRET = 'test-app-secret'
const VERIFY = 'test-verify-word'
const env = { META_APP_SECRET: SECRET, META_VERIFY_TOKEN: VERIFY }

async function sign(body, secret = SECRET) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return 'sha256=' + [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('')
}

const feedPost = JSON.stringify({ object: 'page', entry: [{ id: '1', changes: [{ field: 'feed', value: { item: 'post', verb: 'add', post_id: '1_2' } }] }] })
const feedLike = JSON.stringify({ object: 'page', entry: [{ id: '1', changes: [{ field: 'feed', value: { item: 'reaction', verb: 'add' } }] }] })

test('handshake returns the challenge only with the right verify word', async () => {
  const ok = await handleMetaWebhook(new Request(`https://x/meta-webhook?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=12345`, { method: 'GET' }), env)
  assert.equal(ok.status, 200)
  assert.equal(await ok.text(), '12345')

  const wrong = await handleMetaWebhook(new Request('https://x/meta-webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1', { method: 'GET' }), env)
  assert.equal(wrong.status, 403)
})

test('handshake fails closed when the verify word is not configured', async () => {
  const res = await handleMetaWebhook(new Request(`https://x/meta-webhook?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=1`, { method: 'GET' }), {})
  assert.equal(res.status, 503)
})

test('a correctly signed Page post notice is accepted', async () => {
  const res = await handleMetaWebhook(new Request('https://x/meta-webhook', { method: 'POST', body: feedPost, headers: { 'x-hub-signature-256': await sign(feedPost) } }), env)
  assert.equal(res.status, 200)
})

test('an unsigned or wrongly signed notice is refused', async () => {
  const none = await handleMetaWebhook(new Request('https://x/meta-webhook', { method: 'POST', body: feedPost }), env)
  assert.equal(none.status, 401)
  const bad = await handleMetaWebhook(new Request('https://x/meta-webhook', { method: 'POST', body: feedPost, headers: { 'x-hub-signature-256': await sign(feedPost, 'other-secret') } }), env)
  assert.equal(bad.status, 401)
})

test('a signed body changed after signing is refused', async () => {
  const tampered = feedPost.replace('1_2', '9_9')
  const res = await handleMetaWebhook(new Request('https://x/meta-webhook', { method: 'POST', body: tampered, headers: { 'x-hub-signature-256': await sign(feedPost) } }), env)
  assert.equal(res.status, 401)
})

test('POST fails closed when the app secret is not configured', async () => {
  const res = await handleMetaWebhook(new Request('https://x/meta-webhook', { method: 'POST', body: feedPost, headers: { 'x-hub-signature-256': await sign(feedPost) } }), { META_VERIFY_TOKEN: VERIFY })
  assert.equal(res.status, 503)
})

test('likes and other non-post events are accepted but not counted as posts', async () => {
  const logs = []
  const original = console.log
  console.log = (...args) => logs.push(args.join(' '))
  try {
    const res = await handleMetaWebhook(new Request('https://x/meta-webhook', { method: 'POST', body: feedLike, headers: { 'x-hub-signature-256': await sign(feedLike) } }), env)
    assert.equal(res.status, 200)
  } finally {
    console.log = original
  }
  assert.ok(logs.some(l => l.includes('new posts: 0')))
})

test('signature helper rejects a malformed header', async () => {
  assert.equal(await hasValidMetaSignature('x', 'md5=abc', SECRET), false)
  assert.equal(await hasValidMetaSignature('x', '', SECRET), false)
})
