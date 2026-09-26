// The two legs of the "Talk to Sappy" voice capability and its text-only twin:
// a single pointed call to the sapinsapin/sappy-ai Cloudflare Worker, which
// answers from the project knowledge base (Cloudflare AI Search) and sends
// the answer-generation step through the server-side model provider.
//
// This is the second runtime fetch on the page. Unlike the Hub API it is not
// CORS-locked to huggingface.co, so the browser may call it directly; unlike
// the halohalo Space it is our own backend, so no queue, watchdog or session
// prep machinery applies — one GET in, one JSON answer out.
//
// The voice leg unions that Worker call with the Space's cheapest warm ASR
// (whisper-small transcribes the question) and its Filipino corpus TTS (which
// reads the reply aloud). Those legs queue through spaceClient like any other
// demo request, on purpose: the floating chat and the demo share one lane, so
// the two never double up on the Space's single session.

import { fetchAudioBlob, synthesize, transcribe, uploadBlob } from './spaceClient'
import { languages } from '../data/spaceManifest'

const DEFAULT_SAPPY_ENDPOINT = 'https://sappy-ai.primary-bd7.workers.dev'

export const sappyEndpoint = import.meta.env.VITE_SAPPY_URL ?? DEFAULT_SAPPY_ENDPOINT

// The chat pins Filipino: Whisper hears the question and a Filipino corpus
// speaker reads the answer. Only the Worker's live meta decides what happens
// after transcription.
export const SAPPY_VOICE_LANGUAGE = 'Filipino'

// The Worker answers GET ?q=<question> with { answer, mode, retrieval } where
// mode is "project_rag" when the question was answered from the knowledge base
// and "conversation" when it was not. Only `answer` is guaranteed.
export async function askSappy(question, { signal } = {}) {
  const value = typeof question === 'string' ? question.trim() : ''
  if (!value) throw new Error('Sappy needs a question to answer.')

  const url = new URL(sappyEndpoint)
  url.searchParams.set('q', value)

  let res
  try {
    res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  } catch (caught) {
    // A TypeError here is almost always the browser's CORS blanket: the
    // request left the page and never came back. Name the likely cause so a
    // blocked Worker is not read as Sappy being wrong.
    if (caught?.name === 'AbortError') throw caught
    throw new Error('Sappy could not be reached from the page — the Worker may be missing its CORS headers.')
  }

  if (!res.ok) throw new Error(`Sappy answered with ${res.status} (${res.statusText || 'no reason given'}).`)

  let data
  try {
    data = await res.json()
  } catch {
    throw new Error('Sappy sent an answer that could not be read.')
  }

  if (!data || typeof data.answer !== 'string' || !data.answer.trim()) {
    throw new Error('Sappy sent an empty reply.')
  }

  return {
    answer: data.answer,
    mode: data.mode,
    chunks: Number.isInteger(data.retrieval?.chunks_found) ? data.retrieval.chunks_found : null,
  }
}

// One voice exchange, end to end: upload the recorded WAV, hear it with
// whisper-small, ask the Worker, and read the answer back with the Filipino
// corpus voice. `onPhase` receives each leg's short label for the UI.
//
// Returns { question, answer, mode, chunks, blob } with the spoken reply as an
// audio blob, or { question: '' } when the recorder picked up no speech — the
// caller turns that into its ordinary "I didn't catch that" turn rather than
// sending near-silence down the model path.
export async function callSappyVoice(blob, { signal, onPhase } = {}) {
  const filipino = languages.find((entry) => entry.name === SAPPY_VOICE_LANGUAGE)
  const models = filipino?.models ?? []
  // The plain Whisper-small baseline is the first option in the Space's own
  // list, so a fresh session follows the picker to its default there too.
  const model = models.find((option) => /^whisper-small\b/.test(option)) ?? models[0] ?? ''
  const voice = filipino?.voices?.[0] ?? ''
  if (!model || !voice) {
    throw new Error('The Filipino voice manifest is missing — run `npm run sync:space`.')
  }

  const phase = (next) => onPhase?.(next)

  phase('uploading')
  const uploaded = await uploadBlob(blob, 'question.wav', { signal })
  phase('transcribing')
  const { text } = await transcribe({ language: SAPPY_VOICE_LANGUAGE, model, audio: uploaded, reference: '' }, { signal })
  const question = typeof text === 'string' ? text.trim() : ''
  if (!question) return { question: '' }

  phase('searching')
  const reply = await askSappy(question, { signal })
  const caption =
    reply.mode === 'project_rag'
      ? `Answered from the project knowledge base${Number.isInteger(reply.chunks) && reply.chunks > 0 ? ` · ${reply.chunks} referenced passages` : ''}`
      : 'Answered without a knowledge-base match'

  phase('speaking')
  const { audio } = await synthesize({ language: SAPPY_VOICE_LANGUAGE, voice, text: reply.answer }, { signal })
  const spoken = await fetchAudioBlob(audio, { signal })

  return { question, answer: reply.answer, caption, blob: spoken }
}