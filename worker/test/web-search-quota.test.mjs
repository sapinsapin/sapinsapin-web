import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../src/index.js'

test('a burst of Discord searches has a bounded per-isolate search budget', async () => {
  let searches = 0
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = async (url) => {
      if (String(url).includes('api.tavily.com/search')) {
        searches++
        return Response.json({ results: [{ title: 'PSA population', url: 'https://psa.gov.ph', content: 'The Philippine Statistics Authority publishes population census data.' }] })
      }
      return Response.json({ choices: [{ message: { content: 'The PSA publishes census data.' } }] })
    }
    const env = { SAPPY_MODEL_PROVIDER: 'nyo', SAPPY_NYO_MODEL: 'glm-5.3-flash', NYO_API_KEY: 'test_model_only', TAVILY_API_KEY: 'test_search_only' }
    let throttled = false
    for (let i = 0; i < 25; i++) {
      const request = new Request('https://sappy-ai.primary-bd7.workers.dev/?q=Which%20agency%20publishes%20Philippine%20population%20data%3F', { headers: { 'CF-Connecting-IP': `192.0.2.${i + 1}` } })
      const response = await worker.fetch(request, env, {})
      const body = await response.json()
      if (body.mode === 'web_search_unavailable') throttled = true
    }
    assert.equal(throttled, true)
    assert.ok(searches <= 20, `Searches exceeded bound: ${searches}`)
  } finally {
    globalThis.fetch = originalFetch
  }
})
