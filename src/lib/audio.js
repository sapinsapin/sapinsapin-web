// Turns whatever the browser can decode into the one format the Space is
// reliably happy with: 16 kHz mono 16-bit WAV.
//
// This is not premature tidiness. MediaRecorder hands back webm/opus on Chrome
// and mp4/aac on Safari, and the Space's Python side cannot read either without
// ffmpeg present. Decoding in the browser and re-encoding as WAV sidesteps the
// whole question, shrinks the upload, and happens to be exactly what Whisper and
// SpeechT5 want anyway.

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
export const MAX_SECONDS = 15
const TARGET_RATE = 16_000

export class AudioError extends Error {
  constructor(message, { kind = 'failed', seconds = null } = {}) {
    super(message)
    this.name = 'AudioError'
    this.kind = kind
    this.seconds = seconds
  }
}

export const formatBytes = (bytes) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

export const formatSeconds = (seconds) => {
  const whole = Math.max(0, Math.round(seconds))
  return whole >= 60 ? `${Math.floor(whole / 60)}m ${String(whole % 60).padStart(2, '0')}s` : `${whole}s`
}

// One context for every decode on the page. Browsers cap how many an origin may
// hold open (Chrome allows about six) and a demo people re-run repeatedly would
// otherwise reach that ceiling and start throwing. Decoding does not need a
// running context, so leaving this suspended costs nothing.
let sharedContext = null

function audioContext() {
  const Ctor = window.AudioContext ?? window.webkitAudioContext
  if (!Ctor) throw new AudioError('This browser cannot decode audio.', { kind: 'unsupported' })
  if (!sharedContext || sharedContext.state === 'closed') sharedContext = new Ctor()
  return sharedContext
}

// Safari only grew the promise form of decodeAudioData recently, and still
// rejects with null rather than an Error on a file it cannot read.
function decode(context, bytes) {
  return new Promise((resolve, reject) => {
    const fail = () => reject(new AudioError('That file is not audio this browser can read.', { kind: 'unsupported' }))
    let result
    try {
      result = context.decodeAudioData(bytes, resolve, fail)
    } catch {
      fail()
      return
    }
    if (result?.then) result.then(resolve, fail)
  })
}

// Average the channels rather than taking the first: a stereo interview with one
// speaker panned to the right would otherwise decode to near-silence.
function toMono(buffer) {
  const { numberOfChannels, length } = buffer
  if (numberOfChannels === 1) return buffer.getChannelData(0)
  const mono = new Float32Array(length)
  for (let channel = 0; channel < numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < length; i += 1) mono[i] += data[i] / numberOfChannels
  }
  return mono
}

// OfflineAudioContext resamples properly (it low-pass filters first). Linear
// interpolation is the fallback for the browsers that refuse to build one at
// 16 kHz — audible as a little aliasing, still perfectly transcribable.
async function resample(mono, sourceRate) {
  if (sourceRate === TARGET_RATE) return mono
  const frames = Math.max(1, Math.round((mono.length * TARGET_RATE) / sourceRate))

  const Offline = window.OfflineAudioContext ?? window.webkitOfflineAudioContext
  if (Offline) {
    try {
      const offline = new Offline(1, frames, TARGET_RATE)
      const source = offline.createBufferSource()
      const buffer = offline.createBuffer(1, mono.length, sourceRate)
      buffer.copyToChannel(mono, 0)
      source.buffer = buffer
      source.connect(offline.destination)
      source.start()
      return (await offline.startRendering()).getChannelData(0)
    } catch {
      /* fall through */
    }
  }

  const ratio = mono.length / frames
  const out = new Float32Array(frames)
  for (let i = 0; i < frames; i += 1) {
    const at = i * ratio
    const low = Math.floor(at)
    const high = Math.min(low + 1, mono.length - 1)
    out[i] = mono[low] + (mono[high] - mono[low]) * (at - low)
  }
  return out
}

function encodeWav(samples, sampleRate = TARGET_RATE) {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const ascii = (offset, string) => {
    for (let i = 0; i < string.length; i += 1) view.setUint8(offset + i, string.charCodeAt(i))
  }

  ascii(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  ascii(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]))
    // Asymmetric scaling: 16-bit PCM runs -32768..32767, so a full-scale
    // positive sample would wrap to negative if scaled by 32768.
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

/**
 * Decode `input` and re-encode it as 16 kHz mono WAV.
 *
 * Anything longer than `maxSeconds` throws `kind: 'too-long'` carrying the real
 * duration rather than quietly cutting it — the caller offers the trim, so the
 * visitor knows they are sending fifteen seconds of a four-minute file.
 */
export async function toSpeechWav(input, { maxSeconds = MAX_SECONDS, trim = false } = {}) {
  if (input.size > MAX_UPLOAD_BYTES) {
    throw new AudioError(`That file is ${formatBytes(input.size)}. The limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`, {
      kind: 'too-large',
    })
  }

  const decoded = await decode(audioContext(), await input.arrayBuffer())

  const seconds = decoded.duration
  if (!Number.isFinite(seconds) || seconds < 0.15) {
    throw new AudioError('That clip is too short to recognise.', { kind: 'too-short', seconds })
  }
  if (seconds > maxSeconds && !trim) {
    throw new AudioError(`That clip is ${formatSeconds(seconds)} long.`, { kind: 'too-long', seconds })
  }

  let mono = toMono(decoded)
  const trimmed = seconds > maxSeconds
  if (trimmed) mono = mono.subarray(0, Math.floor(maxSeconds * decoded.sampleRate))

  const resampled = await resample(mono, decoded.sampleRate)
  return {
    blob: encodeWav(resampled),
    // Returned so the preview player does not decode a second time the audio we
    // have already decoded, resampled and encoded here.
    peaks: peaksFrom(resampled, 96),
    seconds: Math.min(seconds, maxSeconds),
    originalSeconds: seconds,
    trimmed,
  }
}

/**
 * Reduce samples to `buckets` normalised peaks for drawing a waveform.
 *
 * Peak per bucket rather than RMS: speech is mostly quiet, and an RMS envelope
 * of a sentence reads as a flat sausage. Normalising to the loudest bucket
 * keeps a softly-recorded speaker legible instead of drawing a flat line.
 */
function peaksFrom(mono, buckets) {
  const size = Math.max(1, Math.floor(mono.length / buckets))
  const peaks = new Float32Array(buckets)
  let loudest = 0

  for (let bucket = 0; bucket < buckets; bucket += 1) {
    const start = bucket * size
    let peak = 0
    for (let i = start; i < start + size && i < mono.length; i += 1) {
      const value = Math.abs(mono[i])
      if (value > peak) peak = value
    }
    peaks[bucket] = peak
    if (peak > loudest) loudest = peak
  }

  if (loudest > 0) for (let i = 0; i < buckets; i += 1) peaks[i] /= loudest
  return Array.from(peaks)
}

/** Peaks for audio we did not encode ourselves — a result fetched from the Space. */
export async function extractPeaks(blob, buckets = 96) {
  const decoded = await decode(audioContext(), await blob.arrayBuffer())
  return { peaks: peaksFrom(toMono(decoded), buckets), seconds: decoded.duration }
}

/* ------------------------------------------------------------------ capture */

export const canRecord = () =>
  typeof window !== 'undefined' &&
  window.isSecureContext &&
  typeof MediaRecorder !== 'undefined' &&
  Boolean(navigator.mediaDevices?.getUserMedia)

// Wires an AnalyserNode onto a live stream so `onLevel` can observe the room
// as it is recorded. Unwritten this is pure overhead, so the graph is only
// built when a caller asks for levels (the voice orb's VAD). The shared context
// is used rather than a private one per record — a second context eats into the
// browser's per-origin budget for no benefit — which means recording leaves the
// shared context running. That is fine for the demo, which only suspends it as
// a courtesy.
function connectMeter(stream, onLevel) {
  if (!onLevel) return null
  const context = audioContext()
  if (context.state !== 'running') context.resume().catch(() => {})
  const source = context.createMediaStreamSource(stream)
  const analyser = context.createAnalyser()
  analyser.fftSize = 2048
  source.connect(analyser)

  const data = new Float32Array(analyser.fftSize)
  let level = 0
  const tick = setInterval(() => {
    analyser.getFloatTimeDomainData(data)
    let sum = 0
    for (let i = 0; i < data.length; i += 1) sum += data[i] * data[i]
    const rms = Math.sqrt(sum / data.length)
    // Fast attack, slow decay: a spoken "t" spikes and vanishes inside one
    // window, and the meter should show the spike rather than smear it away.
    level = rms > level ? rms : level * 0.9
    onLevel(level)
  }, 100)
  return () => {
    clearInterval(tick)
    source.disconnect()
  }
}

/**
 * Start recording. Resolves to a handle whose `stop()` returns the WAV.
 *
 * The tracks are stopped on every path out, including errors — leaving them
 * open keeps the browser's recording indicator lit long after the UI says it
 * finished, which reads as the page still listening.
 */
export async function startRecording({ maxSeconds = MAX_SECONDS, onTick, onLevel, onAutoStop } = {}) {
  let stream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch (error) {
    const denied = error?.name === 'NotAllowedError' || error?.name === 'SecurityError'
    throw new AudioError(
      denied ? 'Microphone access was blocked.' : 'No microphone is available.',
      { kind: denied ? 'denied' : 'no-device' },
    )
  }

  const recorder = new MediaRecorder(stream)
  const chunks = []
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data?.size) chunks.push(event.data)
  })

  const disconnectMeter = connectMeter(stream, onLevel)
  const startedAt = Date.now()
  const stopped = new Promise((resolve) => recorder.addEventListener('stop', resolve, { once: true }))
  recorder.start()

  const tick = setInterval(() => onTick?.((Date.now() - startedAt) / 1000), 200)
  let cap

  const release = () => {
    clearInterval(tick)
    clearTimeout(cap)
    disconnectMeter?.()
    stream.getTracks().forEach((track) => track.stop())
  }

  // Memoised, so hitting the cap and then pressing stop yields one recording and
  // one release rather than racing to build the blob twice.
  let finishing = null
  const finish = () => {
    finishing ??= (async () => {
      try {
        if (recorder.state === 'recording') recorder.stop()
        await stopped
        const raw = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        if (!raw.size) throw new AudioError('Nothing was recorded.', { kind: 'empty' })
        return await toSpeechWav(raw, { maxSeconds, trim: true })
      } finally {
        release()
      }
    })()
    return finishing
  }

  // Reaching the cap finalises the recording outright. Merely calling
  // recorder.stop() here would leave the microphone track live until the visitor
  // pressed a button that no longer did anything — the browser would keep
  // showing its recording indicator for a recording that had already ended.
  cap = setTimeout(() => {
    if (recorder.state !== 'recording') return
    finish().then((result) => onAutoStop?.(result), () => onAutoStop?.(null))
  }, maxSeconds * 1000)

  return { stop: finish, cancel: release }
}
