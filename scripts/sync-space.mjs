// Reads the halohalo Space's own Gradio config and writes the choice lists the
// in-page demo needs to src/data/spaceManifest.js.
//
// Unlike sync-catalog.mjs, this is NOT a CORS workaround — the Space reflects
// any Origin, so the browser calls it directly at runtime. The reason to bake
// these lists is different: Gradio validates dropdown values server-side against
// the choices that dropdown *currently* holds for the session, and the config
// only ships the default language's voices, clips and models. Without a
// manifest the first paint would have nothing to draw, and every language
// switch would need a round trip before the controls could appear.
//
// The manifest is scaffolding, not truth. spaceClient.js refreshes each list
// from the Space before it submits, so drift here degrades to a stale first
// render rather than a failed call. This script failing is the signal that the
// Space's shape changed.
//
// Talks to the Space over plain fetch rather than @gradio/client: the client
// package holds an open heartbeat connection that keeps Node alive after the
// work is done, and the four REST calls below are the whole protocol anyway.
// The per-language lists come from the language-change handlers the Space
// exposes under their internal names — /lambda fills the Synthesize voice
// dropdown, /_on_lang fills the Transcribe clip and model dropdowns in one call.

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const spaceId = 'sapinsapin/halohalo-dashboard'
const origin = `https://${spaceId.replace('/', '-')}.hf.space`
const outputPath = resolve('src/data/spaceManifest.js')

// The Space labels Philippine English "English (PH)". The page has called it
// "Philippine English" since the first build, so the API string stays canonical
// and the display name follows the page.
const displayNames = { 'English (PH)': 'Philippine English' }

// Gradio choices are [label, value] pairs; the value is what the API validates.
const values = (choices) => (choices ?? []).map((choice) => (Array.isArray(choice) ? choice[1] : choice))

// Every call in this run shares one session so the dropdown state the Space
// keeps per session stays coherent, exactly as the browser client does.
const sessionHash = `sync-space-${Math.random().toString(36).slice(2, 10)}`

async function call(endpoint, data) {
  const posted = await fetch(`${origin}/gradio_api/call/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data, session_hash: sessionHash }),
  })
  if (!posted.ok) throw new Error(`${endpoint}: HTTP ${posted.status}`)
  const { event_id: eventId } = await posted.json()
  if (!eventId) throw new Error(`${endpoint}: no event_id returned`)

  const stream = await fetch(`${origin}/gradio_api/call/${endpoint}/${eventId}`, {
    signal: AbortSignal.timeout(60_000),
  })
  if (!stream.ok) throw new Error(`${endpoint}: stream HTTP ${stream.status}`)
  const body = await stream.text()

  // The stream is a short SSE transcript: heartbeats, then one terminal frame.
  const frames = body.split('\n\n').filter(Boolean)
  const terminal = frames.reverse().find((frame) => /^event: (complete|error)/m.test(frame))
  if (!terminal) throw new Error(`${endpoint}: stream ended without a result`)
  const payload = JSON.parse(terminal.slice(terminal.indexOf('data:') + 5).trim())
  if (/^event: error/m.test(terminal)) throw new Error(`${endpoint}: ${payload?.error ?? 'failed'}`)
  return payload
}

// Component ids are renumbered whenever the Space is rebuilt, so find by label.
// Several labels appear more than once (both speech tabs carry a "Language"
// dropdown); they hold the same choices, so the first match is enough.
function findByLabel(components, label) {
  const match = components.find((component) => component?.props?.label === label)
  if (!match) throw new Error(`no component labelled ${JSON.stringify(label)} — the Space's layout changed`)
  return match.props
}

const config = await fetch(`${origin}/config`, { headers: { accept: 'application/json' } }).then((response) => {
  if (!response.ok) throw new Error(`config: HTTP ${response.status}`)
  return response.json()
})

const components = config.components ?? []
const languages = values(findByLabel(components, 'Language').choices)
// /convert takes voices prefixed with their language ("Cebuano · CEB_0200
// (male)"); /synthesize takes them bare. This dropdown is the only place all
// twenty are listed at once, so it doubles as the cross-check below.
const targetVoices = values(findByLabel(components, 'Target voice').choices)

if (!languages.length) throw new Error('the Language dropdown listed no choices')

const perLanguage = []
let modelTotal = 0
for (const language of languages) {
  // Strictly one request at a time. Two calls issued together — even on
  // different dropdowns — leave the Space waiting on a session it never
  // finishes, and enough of those make it stop answering for about a minute.
  const voices = await call('lambda', [language])
  const prep = await call('_on_lang', [language])
  const voiceChoices = values(voices?.[0]?.choices)
  const clipChoices = values(prep?.[0]?.choices)
  const modelChoices = values(prep?.[1]?.choices)
  if (!voiceChoices.length) throw new Error(`${language}: no voices returned by /lambda`)
  if (!clipChoices.length) throw new Error(`${language}: no clips returned by /_on_lang`)
  if (!modelChoices.length) throw new Error(`${language}: no models returned by /_on_lang`)
  // The Space's own dropdown sorts the whisper-small baseline first, and the
  // demo defaults to the first option — so this is the contract that the
  // "default model" the page promises still is the baseline.
  if (!modelChoices[0].startsWith('whisper-small-pld-')) {
    throw new Error(`${language}: first model ${modelChoices[0]} is not the whisper-small baseline`)
  }
  modelTotal += modelChoices.length
  perLanguage.push({
    name: language,
    label: displayNames[language] ?? language,
    voices: voiceChoices,
    clips: clipChoices,
    models: modelChoices,
  })
  process.stdout.write(`  ${language}: ${voiceChoices.length} voices, ${clipChoices.length} clips, ${modelChoices.length} models\n`)
}

// Every bare voice should appear exactly once in the prefixed list. A mismatch
// means the two dropdowns have drifted apart, and /convert would reject a voice
// the page had just offered for /synthesize.
const missing = perLanguage.flatMap(({ name, voices }) =>
  voices.filter((voice) => !targetVoices.includes(`${name} · ${voice}`)).map((voice) => `${name} · ${voice}`),
)
if (missing.length) throw new Error(`voices absent from the Target voice list: ${missing.join(', ')}`)

const totals = {
  languages: perLanguage.length,
  voices: perLanguage.reduce((sum, entry) => sum + entry.voices.length, 0),
  clips: perLanguage.reduce((sum, entry) => sum + entry.clips.length, 0),
  models: modelTotal,
}

const file = `// Generated by scripts/sync-space.mjs — do not edit by hand.
// Choice lists for https://huggingface.co/spaces/${spaceId}, read from its Gradio
// config and its own language-change handlers (/lambda for voices, /_on_lang for
// clips and models). Scaffolding for the first paint: spaceClient.js refreshes
// each list from the Space before it submits anything.
export const spaceId = ${JSON.stringify(spaceId)}
export const spaceOrigin = ${JSON.stringify(origin)}
export const gradioVersion = ${JSON.stringify(config.version ?? null)}
export const syncedAt = ${JSON.stringify(new Date().toISOString().slice(0, 10))}
export const languages = ${JSON.stringify(perLanguage, null, 2)}
export const targetVoices = ${JSON.stringify(targetVoices, null, 2)}
`

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, file)
console.log(
  `synced ${totals.languages} languages · ${totals.voices} voices · ${totals.clips} clips · ${totals.models} models ` +
  `(gradio ${config.version ?? 'unknown'})`,
)
