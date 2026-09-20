// Talks to the halohalo Gradio Space from the browser.
//
// This is the one place in the app that fetches at runtime. It is allowed to,
// where the Hub catalog is not, because the Space answers with
// `access-control-allow-origin: <whatever asked>` while the Hub API pins that
// header to huggingface.co. See CLAUDE.md.
//
// Three properties of the Space shape everything below. All three were measured
// against the live Space, not inferred from the docs:
//
// 1. It runs on free cpu-basic. Synthesis takes ~14s warm, and the first use of
//    a language pulls a ~1GB model first, so a minute is normal, not a fault.
//
// 2. It cannot do concurrency. Two requests in flight at once leave it waiting
//    on a session it never finishes, and a few of those make it stop answering
//    entirely for about a minute. Everything here goes through one FIFO queue
//    with exactly one request in flight — see `schedule`.
//
// 3. Gradio validates dropdown values against the choices that dropdown
//    currently holds *for this session*, and there is one live choice list per
//    dropdown per session. A fresh session only knows the default language's
//    choices, so a Bikol model label fails with "is not in the list of choices"
//    until the Space's language-change handler has run for Bikol in this
//    session. Those handlers are exposed to the API under their internal names:
//    /_on_lang fills the Transcribe tab's clip and model dropdowns in one call,
//    /lambda fills the Synthesize tab's voice dropdown. Preparation is a
//    cursor, not a cache: switching Bikol -> Waray -> Bikol refills the lists
//    each time the cursor moves. See `withTranscriptInputs` and `withPrepared`.

import { spaceOrigin, languages as manifestLanguages } from '../data/spaceManifest.js'

const api = `${spaceOrigin}/gradio_api`

// A Gradio session is just an id the client makes up; the server hangs the
// dropdown state off it. One per page load, replaced only if the Space restarts
// underneath us and forgets what we told it.
let sessionHash = newSessionHash()
function newSessionHash() {
  return `sapinsapin-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

// Which language each prep-driven dropdown is currently showing, server-side.
// null means "unknown" — after a reset we cannot assume anything. clips and
// models move together: the Space's own language-change handler fills both from
// the same call, so they share one cursor.
let prepared = { clips: null, models: null, voices: null }

export class SpaceError extends Error {
  constructor(message, { kind = 'failed', retryable = false, cause } = {}) {
    super(message)
    this.name = 'SpaceError'
    this.kind = kind
    this.retryable = retryable
    this.cause = cause
  }
}

const isAbort = (error) => error?.name === 'AbortError' || error?.name === 'TimeoutError'

// The platform's own timeout signal is throttled savagely once a tab is hidden
// — measured at 22x late on a backgrounded page, where a plain setTimeout stayed
// accurate. Left as-is, someone who started a request and switched tabs would
// hold a budget that never fired, and with it the cross-tab lock.
function deadline(ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new DOMException('The request timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, done: () => clearTimeout(timer) }
}

/* ---------------------------------------------------------------- scheduler */

// One request at a time, in the order asked for. Jobs waiting their turn report
// how many are ahead so the UI can say so rather than showing a stalled bar.
const waiting = []
let running = false

function notifyPositions() {
  waiting.forEach((entry, index) => entry.onPosition?.(index + 1))
}

function schedule(task, { signal, onPosition, ceiling } = {}) {
  return new Promise((resolve, reject) => {
    const entry = { task, resolve, reject, signal, onPosition, ceiling }
    waiting.push(entry)
    notifyPositions()

    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          const index = waiting.indexOf(entry)
          // Only drop it here if it has not started; a running job is cancelled
          // by its own fetch seeing the same signal.
          if (index === -1) return
          waiting.splice(index, 1)
          notifyPositions()
          reject(new SpaceError('Cancelled.', { kind: 'cancelled' }))
        },
        { once: true },
      )
    }
    pump()
  })
}

// The queue above is per page, but the Space's one-at-a-time limit is not: two
// tabs of this site would each think they were alone and deadlock it exactly as
// two parallel requests do. Web Locks are held per origin across tabs, so this
// makes the whole browser take turns, not just the page.
//
// It cannot reach other people's browsers. Two visitors at once still collide —
// that is what the timeout and the retryable network errors are for, and why
// fixing it properly means paying for a Space that can serve more than one
// request at a time.
const SPACE_LOCK = 'sapinsapin-space-request'

// How long a slot with no declared ceiling may live: above the shared heavy
// budget of 180s so it never pre-empts a legitimately slow model load, but low
// enough that a genuinely stuck request cannot hold the queue — and the
// cross-tab lock — closed for the life of the page. Jobs whose budgets outrun
// this (the large ASR models do) declare their own, larger ceiling when they
// schedule.
const SLOT_CEILING_MS = 210_000

function watchdog(task, ceiling) {
  return new Promise((resolve, reject) => {
    const bell = setTimeout(
      () => reject(new SpaceError('The Space did not answer in time.', { kind: 'timeout', retryable: true })),
      ceiling ?? SLOT_CEILING_MS,
    )
    task().then(resolve, reject).finally(() => clearTimeout(bell))
  })
}

async function runExclusive(task, onBlocked) {
  const locks = globalThis.navigator?.locks
  if (!locks) return task()

  // Probe first so a tab that has to wait can say so, instead of sitting on
  // "Connecting…" for however long the other tab's request takes.
  try {
    const free = await locks.request(SPACE_LOCK, { ifAvailable: true }, (lock) => Boolean(lock))
    if (!free) onBlocked?.()
  } catch {
    /* probing is optional; fall through to the real acquisition */
  }
  return locks.request(SPACE_LOCK, task)
}

async function pump() {
  if (running) return
  const entry = waiting.shift()
  if (!entry) return
  running = true
  notifyPositions()
  entry.onPosition?.(0)
  try {
    // Position 1 reads as "waiting for the Space to free up", which is exactly
    // what a lock held by another tab means.
    entry.resolve(await runExclusive(() => watchdog(entry.task, entry.ceiling), () => entry.onPosition?.(1)))
  } catch (error) {
    entry.reject(error)
  } finally {
    running = false
    pump()
  }
}

/* ------------------------------------------------------------- raw requests */

// The stream stays open for the life of the job, dripping heartbeats until the
// terminal frame. Reading it incrementally rather than awaiting .text() is what
// lets the UI distinguish "the Space is still working" from "the connection
// died" during a 60s model load.
async function readEvents(response, { onHeartbeat } = {}) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let split
      while ((split = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, split)
        buffer = buffer.slice(split + 2)

        const event = frame.match(/^event:\s*(.+)$/m)?.[1]?.trim()
        const raw = frame.match(/^data:\s*([\s\S]*)$/m)?.[1]
        if (!event) continue
        if (event === 'heartbeat') {
          onHeartbeat?.()
          continue
        }
        if (event !== 'complete' && event !== 'error') continue

        let payload = null
        try {
          payload = raw ? JSON.parse(raw) : null
        } catch {
          payload = null
        }
        if (event === 'error') {
          const message = typeof payload?.error === 'string' ? payload.error : 'The Space rejected the request.'
          throw new SpaceError(message, { kind: /not in the list of choices/.test(message) ? 'stale-session' : 'failed' })
        }
        return payload
      }
    }
  } finally {
    reader.cancel().catch(() => {})
  }

  throw new SpaceError('The Space closed the connection before answering.', { kind: 'dropped', retryable: true })
}

async function request(endpoint, data, { signal, timeoutMs = 30_000, onHeartbeat } = {}) {
  // One timeout covering both legs, so a job cannot outlive its budget by
  // spending it twice.
  const budget = deadline(timeoutMs)
  const timeout = budget.signal
  const composed = signal ? AbortSignal.any([signal, timeout]) : timeout

  let posted
  try {
    posted = await fetch(`${api}/call/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data, session_hash: sessionHash }),
      signal: composed,
    })
  } catch (error) {
    throw translate(error, signal, timeout)
  }

  if (posted.status === 503 || posted.status === 504) {
    throw new SpaceError('The Space is waking up.', { kind: 'waking', retryable: true })
  }
  if (!posted.ok) {
    throw new SpaceError(`The Space answered ${posted.status}.`, { kind: 'failed', retryable: posted.status >= 500 })
  }

  const { event_id: eventId } = await posted.json().catch(() => ({}))
  if (!eventId) throw new SpaceError('The Space accepted the request but gave no job id.', { kind: 'failed' })

  try {
    const stream = await fetch(`${api}/call/${endpoint}/${eventId}`, { signal: composed })
    if (!stream.ok || !stream.body) {
      throw new SpaceError(`The Space answered ${stream.status} on the result stream.`, { kind: 'failed' })
    }
    return await readEvents(stream, { onHeartbeat })
  } catch (error) {
    throw translate(error, signal, timeout)
  } finally {
    budget.done()
  }
}

function translate(error, signal, timeout) {
  if (error instanceof SpaceError) return error
  if (signal?.aborted) return new SpaceError('Cancelled.', { kind: 'cancelled' })
  if (timeout?.aborted || isAbort(error)) {
    return new SpaceError('The Space did not answer in time.', { kind: 'timeout', retryable: true })
  }
  return new SpaceError('Could not reach the Space.', { kind: 'network', retryable: true, cause: error })
}

/* ------------------------------------------------------------- preparation */

// The Dropdown inputs are per-session, so each one has to be told which
// language it is pointed at. On the live Space these are the language-change
// handlers; the API names match the internal fn names.
const prepEndpoint = { voices: 'lambda' }
// The Transcribe tab's clip and model dropdowns are filled by one handler
// (_on_lang) whose response carries both lists, so they are prepared together.
const transcribePrep = '_on_lang'

// Gradio hands back {choices: [[label, value], …]}; the value is what it will
// validate against later.
const choiceValues = (value) =>
  (value?.choices ?? []).map((choice) => (Array.isArray(choice) ? choice[1] : choice))

// Runs `task` with a single dropdown pointed at `language`, refreshing it
// whenever the cursor is somewhere else. Both calls happen inside a single
// queue slot, so nothing can move the cursor in between.
async function withPrepared(kind, language, task, options = {}) {
  let choices = null
  if (prepared[kind] !== language) {
    const payload = await request(prepEndpoint[kind], [language], { ...options, timeoutMs: 30_000 })
    choices = choiceValues(payload?.[0])
    prepared[kind] = language
  }
  return { choices, value: await task() }
}

// Same idea for the Transcribe tab, where one _on_lang call fills both the clip
// and the model dropdown for the session. The task receives the fresh lists so
// callers can fall back to a valid value instead of submitting a stale one.
async function withTranscriptInputs(language, task, options = {}) {
  let clips = null
  let models = null
  if (prepared.clips !== language || prepared.models !== language) {
    const payload = await request(transcribePrep, [language], { ...options, timeoutMs: 30_000 })
    clips = choiceValues(payload?.[0])
    models = choiceValues(payload?.[1])
    prepared.clips = language
    prepared.models = language
  }
  return { clips, models, value: await task({ clips, models }) }
}

export function resetSession(reason) {
  sessionHash = newSessionHash()
  prepared = { clips: null, models: null, voices: null }
  if (reason && import.meta.env?.DEV) console.warn(`[spaceClient] new session: ${reason}`)
}

/* ------------------------------------------------------------ warm tracking */

// The Space loads a model per language on first use, and the ASR models differ
// hugely in size, so warmth is tracked per language *and* model there. Voice
// conversion is a single language-independent model — one successful convert
// warms it for every language. Tracking that wrong shows a bogus "first run".
const warm = new Set()
export const warmKey = (capability, language, model) => {
  if (capability === 'vc') return 'vc'
  if (capability === 'asr') return `asr:${language}:${model ?? ''}`
  return `${capability}:${language}`
}
export const isWarm = (capability, language, model) => warm.has(warmKey(capability, language, model))
const markWarm = (capability, language, model) => warm.add(warmKey(capability, language, model))

/* -------------------------------------------------------------------- files */

export async function uploadBlob(blob, filename, { signal, timeoutMs = 60_000 } = {}) {
  const form = new FormData()
  form.append('files', blob, filename)
  const budget = deadline(timeoutMs)
  const timeout = budget.signal
  const composed = signal ? AbortSignal.any([signal, timeout]) : timeout
  try {
    let response
    try {
      response = await fetch(`${api}/upload`, { method: 'POST', body: form, signal: composed })
    } catch (error) {
      throw translate(error, signal, timeout)
    }
    if (!response.ok) throw new SpaceError(`Upload failed (${response.status}).`, { kind: 'failed', retryable: true })
    const [path] = await response.json()
    if (!path) throw new SpaceError('Upload returned no path.', { kind: 'failed' })
    return { path, meta: { _type: 'gradio.FileData' } }
  } finally {
    budget.done()
  }
}

// Generated audio is served as application/octet-stream, which Safari refuses to
// decode from a bare <audio src>. Pulling the bytes and re-typing them as WAV
// makes it play everywhere, and gives us a stable object URL to revoke.
export async function fetchAudioBlob(fileData, { signal, timeoutMs = 60_000 } = {}) {
  const url = fileData?.url ?? (fileData?.path ? `${api}/file=${fileData.path}` : null)
  if (!url) throw new SpaceError('The Space returned no audio.', { kind: 'failed' })
  const budget = deadline(timeoutMs)
  const timeout = budget.signal
  const composed = signal ? AbortSignal.any([signal, timeout]) : timeout
  try {
    let response
    try {
      response = await fetch(url, { signal: composed })
    } catch (error) {
      throw translate(error, signal, timeout)
    }
    if (!response.ok) throw new SpaceError(`Could not download the audio (${response.status}).`, { kind: 'failed' })
    return new Blob([await response.arrayBuffer()], { type: 'audio/wav' })
  } finally {
    budget.done()
  }
}

/* ------------------------------------------------------------------- shapes */

// Outputs are read positionally and defensively: the Space's own API docs
// undercount /synthesize (they say two elements, it returns three), so anything
// that destructures a fixed shape would break on the next rebuild.
const text = (value) => (typeof value === 'string' ? value : '')
const file = (value) => (value && typeof value === 'object' && (value.url || value.path) ? value : null)

/* ---------------------------------------------------------------- endpoints */

const heavy = { timeoutMs: 180_000 }

// Cold ASR loads span a huge range on free cpu-basic — roughly 168s for a
// whisper-small, ~230s for a 1B CTC head, ~364s for whisper-large-v3 — so a
// single transcribe budget cannot both let the big models finish and fail fast
// for the small ones. The budget is derived from the size in the model's
// dropdown label ("… · 1543M · …"); new sizes need no new number here.
function modelBudget(model) {
  const size = Number(String(model ?? '').match(/·\s*(\d+)M\s*·/)?.[1])
  if (!Number.isFinite(size)) return 210_000
  if (size >= 1200) return 450_000
  if (size >= 500) return 300_000
  return 210_000
}

// The Space forgets our session when it restarts, which surfaces as a choices
// error on a value we know we prepared. That is worth exactly one silent retry
// on a fresh session; retrying anything else would double a minute-long wait.
async function withStaleSessionRetry(run) {
  try {
    return await run()
  } catch (error) {
    if (error instanceof SpaceError && error.kind === 'stale-session') {
      resetSession('the Space restarted and lost our dropdown state')
      return run()
    }
    throw error
  }
}

export function listClips(language, options = {}) {
  return schedule(
    () =>
      withStaleSessionRetry(async () => {
        const { clips } = await withTranscriptInputs(language, async () => null, options)
        return clips ?? manifestLanguages.find((entry) => entry.name === language)?.clips ?? []
      }),
    options,
  )
}

// The model list is the newest piece of session state: /transcribe gained a
// Model dropdown whose options are only valid once _on_lang has filled them,
// and those options are the sizes a visitor can actually run.
export function listModels(language, options = {}) {
  return schedule(
    () =>
      withStaleSessionRetry(async () => {
        const { models } = await withTranscriptInputs(language, async () => null, options)
        return models ?? manifestLanguages.find((entry) => entry.name === language)?.models ?? []
      }),
    options,
  )
}

// The voice list is one of the things that can silently invalidate a request:
// offering a voice the Space has since renamed produces "is not in the list of
// choices" on submit, after the visitor has already waited. Refreshing from
// /lambda lets the page correct itself between deploys.
export function listVoices(language, options = {}) {
  return schedule(
    () =>
      withStaleSessionRetry(async () => {
        const { choices } = await withPrepared('voices', language, async () => null, options)
        return choices ?? manifestLanguages.find((entry) => entry.name === language)?.voices ?? []
      }),
    options,
  )
}

export function loadSample(language, label, options = {}) {
  return schedule(
    () =>
      withStaleSessionRetry(async () => {
        const { value } = await withTranscriptInputs(
          language,
          () => request('load_sample', [language, label], { ...options, ...heavy }),
          options,
        )
        return { audio: file(value?.[0]), reference: text(value?.[1]) }
      }),
    options,
  )
}

export function synthesize({ language, voice, text: input }, options = {}) {
  return schedule(
    () =>
      withStaleSessionRetry(async () => {
        const { value } = await withPrepared(
          'voices',
          language,
          () => request('synthesize', [language, input, voice], { ...options, ...heavy }),
          options,
        )
        const audio = file(value?.[0])
        if (!audio) throw new SpaceError('The Space returned no audio.', { kind: 'failed' })
        markWarm('tts', language)
        return { audio, details: text(value?.[1]) }
      }),
    options,
  )
}

// /transcribe now takes [language, model_label, audio, reference] — the Space
// gained a Model dropdown, so the model's current per-session choices have to
// be filled first (withTranscriptInputs does that). A stale model label falls
// back to the first valid one rather than failing at submit.
export function transcribe({ language, model, audio, reference = '' }, options = {}) {
  const budget = modelBudget(model)
  return schedule(
    () =>
      withStaleSessionRetry(async () => {
        const { models, value } = await withTranscriptInputs(
          language,
          ({ models: live }) => {
            const label = live?.length ? (live.includes(model) ? model : live[0]) : model
            return request('transcribe', [language, label, audio, reference], { ...options, timeoutMs: budget })
          },
          options,
        )
        markWarm('asr', language, model)
        return { text: text(value?.[0]) }
      }),
    options,
    { ceiling: budget + 60_000 },
  )
}

// /convert needs no preparation either: its target-voice dropdown holds all
// twenty voices, which is why they are the language-prefixed spelling.
export function convert({ audio, voice }, options = {}) {
  return schedule(
    () =>
      withStaleSessionRetry(async () => {
        const value = await request('convert', [audio, voice], { ...options, ...heavy })
        const output = file(value?.[0])
        if (!output) throw new SpaceError('The Space returned no audio.', { kind: 'failed' })
        markWarm('vc')
        return { audio: output, details: text(value?.[1]) }
      }),
    options,
  )
}
