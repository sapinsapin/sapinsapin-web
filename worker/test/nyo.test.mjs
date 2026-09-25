import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../src/index.js'

const originalFetch = globalThis.fetch

function env(overrides = {}) {
  return {
    SAPPY_MODEL_PROVIDER: 'nyo',
    SAPPY_NYO_MODEL: 'glm-5.3-flash',
    NYO_API_KEY: 'rk_live_test_only',
    SAPPY_KNOWLEDGE: { search: async () => ({ chunks: [{ content: 'SapinSapin AI works on Philippine-language AI.' }] }) },
    AI: { run: async () => { throw new Error('Workers AI must not be called') } },
    ...overrides,
  }
}

function request(question = 'What does SapinSapin AI work on?') {
  return new Request(`https://sappy-ai.primary-bd7.workers.dev/?q=${encodeURIComponent(question)}`)
}

test.afterEach(() => { globalThis.fetch = originalFetch })

test('project questions use the NYO Chat Completions endpoint and preserve the web contract', async () => {
  let outbound
  globalThis.fetch = async (url, options) => {
    outbound = { url, options }
    return Response.json({ choices: [{ message: { content: 'It works on Philippine-language AI.' } }] })
  }
  const response = await worker.fetch(request(), env(), {})
  assert.equal(response.status, 200)
  assert.equal((await response.json()).answer, 'It works on Philippine-language AI.')
  assert.equal(outbound.url, 'https://llm.nyolab.ai/api/public/v1/chat/completions')
  assert.equal(outbound.options.method, 'POST')
  assert.equal(outbound.options.headers.Authorization, 'Bearer rk_live_test_only')
  const body = JSON.parse(outbound.options.body)
  assert.equal(body.model, 'glm-5.3-flash')
  assert.equal(body.messages.at(-1).role, 'user')
  assert.match(body.messages.at(-1).content, /SapinSapin AI/)
  assert.equal(body.stream, false)
  assert.ok(body.max_tokens >= 2048)
})

test('missing credential fails closed without exposing configuration details', async () => {
  const response = await worker.fetch(request(), env({ NYO_API_KEY: '' }), {})
  assert.equal(response.status, 503)
  const body = await response.json()
  assert.equal(body.error, 'Sappy is temporarily unavailable. Please try again later.')
  assert.equal(body.details, undefined)
})

test('out of credits is not silently retried on Workers AI', async () => {
  let calls = 0
  globalThis.fetch = async () => { calls++; return Response.json({ error: { message: 'Out of credits' } }, { status: 402 }) }
  const response = await worker.fetch(request(), env(), {})
  assert.equal(response.status, 503)
  assert.equal(calls, 1)
  assert.equal((await response.json()).details, undefined)
})

test('NYO rate limit preserves Retry-After for web callers', async () => {
  globalThis.fetch = async () => new Response('{}', { status: 429, headers: { 'Retry-After': '13' } })
  const response = await worker.fetch(request(), env(), {})
  assert.equal(response.status, 429)
  assert.equal(response.headers.get('Retry-After'), '13')
})

test('guardrail refusals become user-visible answers without leaking internals', async () => {
  globalThis.fetch = async () => Response.json({ error: { type: 'guardrail_rejected', message: 'I can only discuss SapinSapin AI.' } }, { status: 422 })
  const response = await worker.fetch(request(), env(), {})
  assert.equal(response.status, 200)
  assert.equal((await response.json()).answer, 'I can only discuss SapinSapin AI.')
})

test('Workers AI remains an explicit rollback mode', async () => {
  let calledModel
  const response = await worker.fetch(request(), env({
    SAPPY_MODEL_PROVIDER: 'workers_ai', NYO_API_KEY: '',
    AI: { run: async (model) => { calledModel = model; return { response: 'Gemma answered.' } } },
  }), {})
  assert.equal(response.status, 200)
  assert.equal((await response.json()).answer, 'Gemma answered.')
  assert.equal(calledModel, '@cf/google/gemma-4-26b-a4b-it')
})
