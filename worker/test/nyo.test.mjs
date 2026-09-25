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

test('a direct model question discloses the active NYO route without a model call', async () => {
  globalThis.fetch = async () => { throw new Error('model identity should not need a provider request') }
  const response = await worker.fetch(request('What model are you running?'), env(), {})
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.mode, 'self')
  assert.match(body.answer, /NYO/)
  assert.match(body.answer, /glm-5\.3-flash/)
  assert.doesNotMatch(body.answer, /Gemma/)
})

test('related phrasings of Sappy model questions identify the configured route', async () => {
  globalThis.fetch = async () => { throw new Error('identity request must not call the model') }
  for (const question of [
    'What model powers you?',
    'Which AI model do you use?',
    'Is Sappy powered by NYO or Gemma?',
    'What version of GLM runs Sappy?',
    "What's your current model?",
    'What model is powering this bot?',
  ]) {
    const response = await worker.fetch(request(question), env(), {})
    assert.equal(response.status, 200, question)
    assert.match((await response.json()).answer, /glm-5\.3-flash/, question)
  }
})

test('model questions describe Gemma after an explicit rollback', async () => {
  globalThis.fetch = async () => { throw new Error('identity request must not call NYO') }
  const response = await worker.fetch(request('What model powers you?'), env({ SAPPY_MODEL_PROVIDER: 'workers_ai', NYO_API_KEY: '' }), {})
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.match(body.answer, /@cf\/google\/gemma-4-26b-a4b-it/)
  assert.doesNotMatch(body.answer, /NYO/)
})

test('model disclosure does not claim NYO is running without its secret', async () => {
  const response = await worker.fetch(request('What model are you running?'), env({ NYO_API_KEY: '' }), {})
  assert.equal(response.status, 200)
  assert.match((await response.json()).answer, /can't verify an active answer-generation model/i)
})

test('questions about project models still follow RAG rather than Sappy identity', async () => {
  let searches = 0
  globalThis.fetch = async () => Response.json({ choices: [{ message: { content: 'The project has several model families.' } }] })
  const response = await worker.fetch(request('Can you explain SapinSapin AI models?'), env({
    SAPPY_KNOWLEDGE: { search: async () => { searches++; return { chunks: [] } } },
  }), {})
  assert.equal(response.status, 200)
  assert.equal((await response.json()).mode, 'project_rag')
  assert.equal(searches, 1)
})

test('speech and training model questions are not misidentified as the chat model', async () => {
  let searches = 0
  globalThis.fetch = async () => Response.json({ choices: [{ message: { content: 'That depends on the speech task and model.' } }] })
  for (const question of [
    'What model do you use for speech recognition?',
    'What model do you use to train SapinSapin AI?',
  ]) {
    const response = await worker.fetch(request(question), env({
      SAPPY_KNOWLEDGE: { search: async () => { searches++; return { chunks: [] } } },
    }), {})
    assert.equal(response.status, 200)
    assert.equal((await response.json()).mode, 'project_rag', question)
  }
  assert.equal(searches, 2)
})

test('Discord mention path discloses the same runtime model', async () => {
  globalThis.fetch = async () => { throw new Error('model identity should not need a provider request') }
  const response = await worker.fetch(
    new Request('https://sappy-ai.primary-bd7.workers.dev/test-message?q=What%20model%20powers%20you%3F'),
    env({ DISCORD_APPLICATION_ID: '1550091743003811842' }),
    {},
  )
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.respond, true)
  assert.match(body.answer, /NYO/)
  assert.match(body.answer, /glm-5\.3-flash/)
})

test('explicitly excluding speech still asks about Sappy answer generation', async () => {
  globalThis.fetch = async () => { throw new Error('identity request must not call the model') }
  const response = await worker.fetch(request('What model are you running, not the speech model?'), env(), {})
  assert.equal(response.status, 200)
  assert.match((await response.json()).answer, /glm-5\.3-flash/)
})

test('short provider identity questions use the active route', async () => {
  globalThis.fetch = async () => { throw new Error('identity request must not call the model') }
  const response = await worker.fetch(request('Are you GLM?'), env(), {})
  assert.equal(response.status, 200)
  assert.match((await response.json()).answer, /NYO.*glm-5\.3-flash/s)
})

test('project translation research model questions use project knowledge', async () => {
  let searches = 0
  globalThis.fetch = async () => Response.json({ choices: [{ message: { content: 'I would need a specific project artifact.' } }] })
  const response = await worker.fetch(request('What model does Sappy use for SapinSapin AI translation research?'), env({
    SAPPY_KNOWLEDGE: { search: async () => { searches++; return { chunks: [] } } },
  }), {})
  assert.equal(response.status, 200)
  assert.equal((await response.json()).mode, 'project_rag')
  assert.equal(searches, 1)
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
