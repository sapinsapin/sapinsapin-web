// Contract test for the live demo.
//
// The demo talks to a Space nobody here controls, so the ways it can break are
// mostly changes on the other end. This asserts the handful of facts the code
// actually relies on, and says which one moved when it fails. Run it in CI, or
// before a deploy, alongside `npm run sync`.
//
// It is deliberately read-only and sequential: the Space deadlocks on parallel
// requests, so a checker that hammered it would be the outage it is meant to
// catch.

import { languages, spaceId, spaceOrigin, targetVoices } from '../src/data/spaceManifest.js'

const checks = []
const check = (name, run) => checks.push({ name, run })

const values = (choices) => (choices ?? []).map((choice) => (Array.isArray(choice) ? choice[1] : choice))
const sessionHash = `check-space-${Math.random().toString(36).slice(2, 10)}`

async function call(endpoint, data) {
  const posted = await fetch(`${spaceOrigin}/gradio_api/call/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data, session_hash: sessionHash }),
  })
  if (!posted.ok) throw new Error(`HTTP ${posted.status}`)
  const { event_id: eventId } = await posted.json()
  if (!eventId) throw new Error('no event_id')
  const stream = await fetch(`${spaceOrigin}/gradio_api/call/${endpoint}/${eventId}`, {
    signal: AbortSignal.timeout(60_000),
  })
  const body = await stream.text()
  const frame = body.split('\n\n').filter(Boolean).reverse().find((f) => /^event: (complete|error)/m.test(f))
  if (!frame) throw new Error('stream ended without a result')
  const payload = JSON.parse(frame.slice(frame.indexOf('data:') + 5).trim())
  if (/^event: error/m.test(frame)) throw new Error(payload?.error ?? 'endpoint returned an error')
  return payload
}

let config
let info

check('the Space is reachable and serving a Gradio config', async () => {
  const response = await fetch(`${spaceOrigin}/config`, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  config = await response.json()
  if (!config.version) throw new Error('no version in config')
  return `gradio ${config.version}`
})

// The demo calls the Space straight from the browser. If this ever stops being
// true the whole feature needs a proxy, so it is worth failing loudly over.
check('CORS still reflects an arbitrary origin', async () => {
  const response = await fetch(`${spaceOrigin}/config`, {
    headers: { origin: 'https://sapinsapin.ai' },
    signal: AbortSignal.timeout(30_000),
  })
  const allowed = response.headers.get('access-control-allow-origin')
  if (allowed !== 'https://sapinsapin.ai' && allowed !== '*') {
    throw new Error(`access-control-allow-origin is ${allowed ?? 'absent'}`)
  }
  return allowed
})

check('every endpoint the demo calls still exists', async () => {
  const response = await fetch(`${spaceOrigin}/gradio_api/info`, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  info = await response.json()
  const named = Object.keys(info.named_endpoints ?? {})
  const needed = ['/lambda', '/_on_lang', '/load_sample', '/transcribe', '/synthesize', '/convert']
  const missing = needed.filter((name) => !named.includes(name))
  if (missing.length) throw new Error(`missing: ${missing.join(', ')}`)
  return `${needed.length} present`
})

// Argument order is positional in the payload, so a renamed or reordered
// parameter is a silent wrong-argument bug rather than an error.
check('endpoint parameters are unchanged', async () => {
  const expected = {
    '/lambda': ['l'],
    '/_on_lang': ['lang_name'],
    '/load_sample': ['lang_name', 'label'],
    '/transcribe': ['lang_name', 'model_label', 'audio', 'reference'],
    '/synthesize': ['lang_name', 'text', 'voice_label'],
    '/convert': ['audio', 'voice_label'],
  }
  const wrong = []
  for (const [endpoint, names] of Object.entries(expected)) {
    const actual = (info.named_endpoints[endpoint].parameters ?? []).map((p) => p.parameter_name)
    if (actual.join(',') !== names.join(',')) wrong.push(`${endpoint}: [${actual}] ≠ [${names}]`)
  }
  if (wrong.length) throw new Error(wrong.join(' · '))
  return `${Object.keys(expected).length} signatures match`
})

check('the manifest still matches the Space', async () => {
  const components = config.components ?? []
  const byLabel = (label) => components.find((c) => c?.props?.label === label)?.props
  const live = values(byLabel('Language')?.choices)
  const baked = languages.map((entry) => entry.name)
  if (live.join('|') !== baked.join('|')) {
    throw new Error(`languages drifted — run npm run sync:space (live: ${live.length}, baked: ${baked.length})`)
  }
  const liveTargets = values(byLabel('Target voice')?.choices)
  if (liveTargets.join('|') !== targetVoices.join('|')) {
    throw new Error('target voices drifted — run npm run sync:space')
  }
  return `${baked.length} languages, ${targetVoices.length} target voices`
})

// The trap the whole client is built around. If Gradio ever stops scoping
// choices per session this can be simplified away — until then, prove it holds.
check('dropdown choices are still session-scoped (prep is required)', async () => {
  const other = languages.find((entry) => entry.name !== 'Cebuano')
  await call('_on_lang', ['Cebuano'])
  let rejected = false
  try {
    await call('load_sample', [other.name, other.clips[0]])
  } catch (error) {
    rejected = /not in the list of choices/.test(error.message)
    if (!rejected) throw error
  }
  if (!rejected) throw new Error('the Space accepted an unprepared value — spaceClient.js can be simplified')
  return 'still required'
})

check('preparing then calling in one session works', async () => {
  const target = languages.find((entry) => entry.name !== 'Cebuano')
  await call('_on_lang', [target.name])
  const result = await call('load_sample', [target.name, target.clips[0]])
  if (!result?.[0]?.url && !result?.[0]?.path) throw new Error('no audio returned')
  return `${target.name} clip loaded`
})

// The Model dropdown only accepts labels the session's _on_lang has filled in,
// and the page's first paint ships baked labels — so drift there means the picker
// shows sizes that would all be rejected. Assert the two stay in step.
check('per-language model lists still match the manifest', async () => {
  const wrong = []
  for (const entry of languages) {
    const prep = await call('_on_lang', [entry.name])
    const live = values(prep?.[1]?.choices)
    if (live.join('|') !== entry.models.join('|')) {
      wrong.push(`${entry.name}: manifest ${entry.models.length} ≠ live ${live.length} (run npm run sync:space)`)
    }
  }
  if (wrong.length) throw new Error(wrong.join(' · '))
  return `${languages.length} model lists in sync`
})

let failures = 0
for (const { name, run } of checks) {
  try {
    const detail = await run()
    console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`)
  } catch (error) {
    failures += 1
    console.error(`  FAIL ${name}\n         ${error.message}`)
  }
}

console.log(
  failures
    ? `\n${failures} of ${checks.length} checks failed against ${spaceId}`
    : `\nall ${checks.length} checks passed against ${spaceId}`,
)
process.exit(failures ? 1 : 0)
