import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { languages, targetVoices } from '../data/spaceManifest'
import { AudioError, canRecord, extractPeaks, formatBytes, formatSeconds, startRecording, toSpeechWav } from '../lib/audio'
import { findBaseline, findSameModel, modelFamily, parseModelLabel } from '../lib/modelLabels'
import { compareVoices, convert, fetchAudioBlob, isWarm, listClips, listModels, listVoices, loadSample, synthesize, transcribe, uploadBlob } from '../lib/spaceClient'

// The Hub's model ids use ISO codes that do not always match the speaker
// prefixes in the corpus — Bikol speakers are BIK_*, but the model is …-bcl —
// so the mapping is spelled out rather than derived. A language the Space gains
// before the next sync resolves to null, and the badge is dropped rather than
// printing an id ending in "undefined".
const modelCode = {
  Bikol: 'bcl',
  Cebuano: 'ceb',
  'English (PH)': 'eng',
  Filipino: 'fil',
  Hiligaynon: 'hil',
  Ilocano: 'ilo',
  Pangasinan: 'pag',
  Kapampangan: 'pam',
  Tausug: 'tsg',
  Waray: 'war',
}

// Three capabilities, each named by what goes in and what comes out. The icon
// carries the tab on a phone, where the eyebrow is dropped for room.
const capabilities = [
  {
    id: 'synthesize',
    kicker: 'Synthesize',
    tab: 'Text to speech',
    short: 'Speak',
    title: 'Hear Philippine languages spoken',
    copy: 'Listen to the org’s published Orpheus voices beside a human reader, or type your own sentence for the live baseline.',
    model: (language) => (modelCode[language] ? `speecht5_tts-pld-${modelCode[language]}` : null),
    resultLabel: 'Synthesized speech',
    warmKind: 'tts',
    verb: 'Synthesizing',
    warmEta: 16,
    action: 'Speak it',
    icon: 'M3 9.5v5h3.5L11 19V5L6.5 9.5H3Zm12.5 2.5a4 4 0 0 0-2-3.46v6.92a4 4 0 0 0 2-3.46ZM13.5 4.3v2.06a6 6 0 0 1 0 11.28v2.06a8 8 0 0 0 0-15.4Z',
  },
  {
    id: 'transcribe',
    kicker: 'Transcribe',
    tab: 'Speech to text',
    short: 'Transcribe',
    title: 'Turn speech into text',
    copy: 'Record yourself, upload a file, or play a corpus clip — then read what the model heard.',
    model: (language) => (modelCode[language] ? `whisper-small-pld-${modelCode[language]}` : null),
    resultLabel: 'Model transcription',
    warmKind: 'asr',
    verb: 'Transcribing',
    warmEta: 12,
    action: 'Transcribe',
    icon: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z',
  },
  {
    id: 'convert',
    kicker: 'Convert voice',
    tab: 'Voice conversion',
    short: 'Convert',
    title: 'Say it in another voice',
    copy: 'Keep your words and timing, swap in the voice of a corpus speaker — in any of the ten languages.',
    model: () => 'speecht5_vc-pld',
    resultLabel: 'Converted speech',
    warmKind: 'vc',
    verb: 'Converting',
    warmEta: 20,
    action: 'Convert voice',
    icon: 'M7 7h10l-3-3 1.4-1.4L21.8 9l-6.4 6.4L14 14l3-3H7V7Zm10 10H7l3 3-1.4 1.4L2.2 15l6.4-6.4L10 10l-3 3h10v4Z',
  },
]

// A first run downloads roughly a gigabyte of weights inside the Space before
// any inference starts, so the two cases are nowhere near each other.
const COLD_ETA = 75

// Warmth is tracked in memory, so a fresh page load assumes every model is cold
// even when the Space has been serving them all morning. Waiting until the
// request has outlasted any warm one before blaming a model download keeps the
// page from announcing a gigabyte that is not being downloaded.
const COLD_NOTICE_AFTER = 25

const sampleText = {
  Bikol: 'Marhay na aga sa saindo gabos.',
  Cebuano: 'Maayong buntag sa tanan.',
  'English (PH)': 'Good morning to everyone here.',
  Filipino: 'Magandang umaga sa inyong lahat.',
  Hiligaynon: 'Maayong aga sa inyo tanan.',
  Ilocano: 'Naimbag a bigat kadakayo amin.',
  Pangasinan: 'Maabig ya kabuasan ed sikayon amin.',
  Kapampangan: 'Mayap a abak kekayu ngan.',
  Tausug: 'Marayaw mahinaat kaniyu katan.',
  Waray: 'Maupay nga aga ha iyo ngatanan.',
}

/* --------------------------------------------------------------- job status */

const etaFor = (capability, cold) => (cold ? COLD_ETA : capability.warmEta)

// Driven by real events where there are any, and by the clock where there are
// not. The Space sends heartbeats but no progress, so honesty past the estimate
// means saying it is taking longer — never inventing a number that keeps moving.
function statusCopy({ phase, position, elapsed, job }) {
  if (phase === 'connecting') return 'Connecting to the Space…'
  if (phase === 'uploading') return `Uploading your audio${job?.uploadSize ? ` (${formatBytes(job.uploadSize)})` : ''}`
  if (phase === 'queued') {
    return position > 1
      ? `Waiting — ${position - 1} other ${position - 1 === 1 ? 'request' : 'requests'} ahead of yours`
      : 'Waiting for the Space to free up'
  }
  if (phase !== 'running') return ''

  // A job that carries its own running label sets it here; it outranks the
  // generic verb+subject line below.
  if (job?.detail) return job.detail

  const eta = etaFor(job.capability, job.cold)
  const label = `${job.capability.verb} ${job.subject}`
  if (elapsed < 6) return label
  if (job.cold && elapsed >= COLD_NOTICE_AFTER) {
    // Voice conversion is one language-independent model, so naming a language
    // here would promise a per-language wait that does not exist.
    if (job.capability.warmKind === 'vc') {
      return 'First run — the Space is loading the voice-conversion model onto free CPU. This happens once.'
    }
    const sizeM = parseModelLabel(job.model).sizeM ?? 0
    const big = sizeM >= 1200
    const size = big ? 'several GB' : sizeM >= 500 ? 'a few GB' : 'about 1 GB'
    const after = big || sizeM >= 500 ? ' Larger, more accurate models take a few minutes the first time.' : ' This happens once per language.'
    return `First run for ${job.languageLabel} — the Space is loading a ${size} model onto free CPU.${after}`
  }
  if (elapsed >= 45) {
    return 'Still going. This runs on free shared CPU with no GPU — you can keep reading, the result will appear here.'
  }
  if (elapsed > eta) return 'Taking longer than usual — still running.'
  return `${label} — about ${Math.max(1, Math.round(eta - elapsed))}s left`
}

const activePhases = new Set(['connecting', 'uploading', 'queued', 'running'])

const clamp = (text, limit = 180) =>
  typeof text === 'string' && text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text

/**
 * One capability's request lifecycle.
 *
 * Two rules matter more than the rest. A successful result is never cleared
 * when the next run starts — the previous audio stays playable until new audio
 * arrives, because blanking it is what makes a slow demo feel broken. And the
 * job pins its own language and voice at submit time, so switching the picker
 * mid-run cannot relabel something already in flight.
 */
function useJob(capability) {
  const [phase, setPhase] = useState('idle')
  const [position, setPosition] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const jobRef = useRef(null)
  const abortRef = useRef(null)

  useEffect(() => {
    if (!activePhases.has(phase)) return undefined
    const startedAt = Date.now()
    setElapsed(0)
    const tick = setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 250)
    return () => clearInterval(tick)
  }, [phase])

  useEffect(() => () => abortRef.current?.abort(), [])

  const start = useCallback(
    async (context, work) => {
      if (jobRef.current) return
      const controller = new AbortController()
      abortRef.current = controller
      const job = { capability, ...context }
      jobRef.current = job

      setError(null)
      setPhase('connecting')
      setPosition(0)

      try {
        const value = await work({
          signal: controller.signal,
          job,
          setPhase,
          onPosition: (next) => {
            setPosition(next)
            setPhase((current) =>
              next > 0 ? 'queued' : current === 'queued' || current === 'connecting' ? 'running' : current,
            )
          },
        })
        setResult({ ...value, job })
        setPhase('success')
      } catch (caught) {
        if (caught?.kind === 'cancelled') {
          setPhase('cancelled')
          setTimeout(() => setPhase((current) => (current === 'cancelled' ? 'idle' : current)), 4000)
        } else {
          setError(caught)
          setPhase('error')
        }
      } finally {
        jobRef.current = null
        abortRef.current = null
      }
    },
    [capability],
  )

  const cancel = useCallback(() => abortRef.current?.abort(), [])
  return { phase, position, elapsed, result, error, busy: activePhases.has(phase), start, cancel, job: jobRef.current }
}

/* -------------------------------------------------------------- small parts */

// Object URLs outlive the render that made them, so they are revoked on both
// replacement and unmount; a demo people re-run twenty times otherwise leaks a
// WAV per press.
function useObjectUrl(blob) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!blob) {
      setUrl(null)
      return undefined
    }
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  return url
}

/**
 * A dropdown's options: the baked list first, replaced by the Space's own once
 * the visitor reaches for the control.
 *
 * The manifest renders instantly and is usually right, but it is a snapshot from
 * the last deploy — if the Space gains or renames a voice, submitting a stale one
 * fails only after the visitor has waited for it. Confirming lazily keeps the
 * first paint free of requests while letting the page correct itself.
 *
 * Responses are matched against the language that is current when they land, so
 * switching away mid-flight cannot drop one language's options into another's
 * dropdown.
 */
function useLiveOptions(language, fallback, fetcher) {
  const [options, setOptions] = useState(fallback)
  const [busy, setBusy] = useState(false)
  const requestedFor = useRef(null)

  useEffect(() => { setOptions(fallback) }, [fallback])

  const refresh = useCallback(() => {
    if (requestedFor.current === language) return
    requestedFor.current = language
    setBusy(true)
    fetcher(language)
      .then((next) => { if (next?.length && requestedFor.current === language) setOptions(next) })
      .catch(() => { if (requestedFor.current === language) requestedFor.current = null })
      .finally(() => { if (requestedFor.current === language) setBusy(false) })
  }, [fetcher, language])

  return [options, refresh, busy]
}

// `ready` is passed when the caller already has the samples — anything we
// encoded ourselves — so only audio that arrived from the Space is decoded here.
function usePeaks(blob, ready) {
  const [peaks, setPeaks] = useState(ready ?? null)
  useEffect(() => {
    if (!blob || ready) {
      setPeaks(ready ?? null)
      return undefined
    }
    let live = true
    extractPeaks(blob).then(({ peaks: next }) => { if (live) setPeaks(next) }).catch(() => {})
    return () => { live = false }
  }, [blob, ready])
  return peaks
}

/**
 * The audio player.
 *
 * Native <audio> controls are the one element that would make this look like a
 * form rather than a demo — they carry the browser's chrome, not the page's.
 * This draws the clip's own waveform, which doubles as the scrubber and shows
 * at a glance that a result really is speech and not silence.
 */
function AudioPlayer({ blob, label, tone = 'ube', peaks: ready, autoplay = false }) {
  const url = useObjectUrl(blob)
  const peaks = usePeaks(blob, ready)
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    setPlaying(false)
    setTime(0)
  }, [url])

  // The result plays the moment it lands. Autoplay can be refused
  // by the browser — but only when it is blocked, so the refused case still
  // leaves the waveform button, which the visitor can press.
  useEffect(() => {
    if (autoplay && url) audioRef.current?.play().catch(() => {})
  }, [autoplay, url])

  const toggle = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) audio.play().catch(() => setPlaying(false))
    else audio.pause()
  }, [])

  const seek = useCallback(
    (event) => {
      const audio = audioRef.current
      if (!audio || !duration) return
      const box = event.currentTarget.getBoundingClientRect()
      audio.currentTime = Math.min(duration, Math.max(0, ((event.clientX - box.left) / box.width) * duration))
    },
    [duration],
  )

  const progress = duration ? time / duration : 0
  const bars = peaks ?? Array.from({ length: 96 }, () => 0.08)

  return (
    <div className={`demo-player is-${tone}`}>
      <audio
        ref={audioRef}
        src={url ?? undefined}
        preload="metadata"
        aria-label={label}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          const value = event.currentTarget.duration
          setDuration(Number.isFinite(value) ? value : 0)
        }}
      />
      <button type="button" className="demo-play" onClick={toggle} aria-label={playing ? `Pause ${label}` : `Play ${label}`}>
        {playing ? (
          <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="3" width="3" height="10" rx="1" /><rect x="9" y="3" width="3" height="10" rx="1" /></svg>
        ) : (
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 3.4v9.2a.6.6 0 0 0 .92.5l7-4.6a.6.6 0 0 0 0-1l-7-4.6a.6.6 0 0 0-.92.5Z" /></svg>
        )}
      </button>

      {/* A real slider, not decoration. The <audio> element is display:none, so
          without this there would be no way to scrub except by pointing at
          pixels — the play button alone leaves keyboard users stuck at 0:00. */}
      <div
        className="demo-wave"
        role="slider"
        tabIndex={0}
        aria-label={`Seek within ${label}`}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration) || 0}
        aria-valuenow={Math.round(time)}
        aria-valuetext={`${formatSeconds(time)} of ${formatSeconds(duration)}`}
        onClick={seek}
        onKeyDown={(event) => {
          const audio = audioRef.current
          if (!audio || !duration) return
          const jump = { ArrowRight: 2, ArrowLeft: -2, ArrowUp: 2, ArrowDown: -2 }[event.key]
          if (jump === undefined && event.key !== 'Home' && event.key !== 'End') return
          event.preventDefault()
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? duration : audio.currentTime + jump
          audio.currentTime = Math.min(duration, Math.max(0, next))
        }}
      >
        <svg viewBox="0 0 96 32" preserveAspectRatio="none">
          {bars.map((peak, index) => {
            const height = Math.max(1.5, peak * 30)
            return (
              <rect
                key={index}
                x={index + 0.15}
                y={(32 - height) / 2}
                width={0.7}
                height={height}
                rx={0.35}
                className={index / bars.length <= progress ? 'is-played' : ''}
              />
            )
          })}
        </svg>
      </div>

      <span className="demo-time">{formatSeconds(time)} / {formatSeconds(duration)}</span>
    </div>
  )
}

function Skeleton({ variant }) {
  if (variant === 'audio') {
    return (
      <div className="demo-skel-audio" aria-hidden="true">
        {Array.from({ length: 48 }, (_, index) => <span key={index} style={{ ['--i']: index }} />)}
      </div>
    )
  }
  return <div className="demo-skel" aria-hidden="true"><span /><span /><span /></div>
}

function StatusLine({ phase, position, elapsed, job, error, onCancel, onRetry }) {
  // Error text comes from the Space, so it is clamped before display: Gradio
  // validation messages can run to hundreds of characters and would otherwise
  // push the controls off screen.
  const message =
    phase === 'error'
      ? clamp(error?.message) ?? 'Something went wrong.'
      : phase === 'cancelled'
        ? 'Cancelled.'
        : statusCopy({ phase, position, elapsed, job })

  if (!message) return null

  const running = activePhases.has(phase)
  const eta = job ? etaFor(job.capability, job.cold) : 1
  // Parked at 92%: a bar that reaches the end while the visitor is still
  // waiting is worse than no bar at all.
  const progress = phase === 'running' ? Math.min(elapsed / eta, 0.92) : 0

  return (
    <div className={`demo-status is-${phase}`}>
      {phase === 'running' && (
        <div className="demo-status-bar" aria-hidden="true"><i style={{ transform: `scaleX(${progress})` }} /></div>
      )}
      <div className="demo-status-row">
        <p className="demo-status-text">{message}</p>
        {running && elapsed >= 3 && <span className="demo-status-clock" aria-hidden="true">{formatSeconds(elapsed)}</span>}
        {running && elapsed >= 8 && <button type="button" className="demo-status-action" onClick={onCancel}>Cancel</button>}
        {phase === 'error' && onRetry && <button type="button" className="demo-status-action" onClick={onRetry}>Try again</button>}
      </div>
    </div>
  )
}

function Field({ step, label, hint, children, htmlFor, aside, as = 'div' }) {
  const Tag = as
  // A fieldset is used where the field is a group of radios or buttons, so the
  // legend names the group for a screen reader the way a <label> names a box.
  const Label = as === 'fieldset' ? 'legend' : htmlFor ? 'label' : 'span'
  return (
    <Tag className="demo-field">
      <div className="demo-field-head">
        {step && <span className="demo-step" aria-hidden="true">{step}</span>}
        <Label className="demo-label" {...(Label === 'label' ? { htmlFor } : {})}>{label}</Label>
        {aside && <span className="demo-field-aside">{aside}</span>}
      </div>
      {children}
      {hint && <p className="demo-hint">{hint}</p>}
    </Tag>
  )
}


/* ------------------------------------------------------------ model picker */

// The Space's labels are dense ("★ RECOMMENDED · whisper-large-v3-pld-ceb-norm ·
// 1543M · CER 10.8% frozen-disjoint normalised") and were truncated to
// "whisper-small-pld-ceb · 242M · CER 2…" in a phone-width select. The option
// text is rebuilt into plain words, and the full detail sits under the control.
// The VALUE stays the Space's own label, byte for byte — that is what it checks.
const tierWords = { recommended: 'Most accurate', baseline: 'Fastest', research: 'Research' }

// Weights are stored at four bytes a parameter, so the first-run download is
// roughly four times the parameter count. Approximate on purpose, and said so.
const downloadSize = (sizeM) => {
  if (!sizeM) return null
  const gb = (sizeM * 4) / 1000
  return gb >= 1.5 ? `~${Math.round(gb)} GB` : '~1 GB'
}

function modelOptionText(label) {
  const model = parseModelLabel(label)
  const tier = tierWords[model.tier]
  const size = model.sizeM ? (model.sizeM >= 1000 ? `${(model.sizeM / 1000).toFixed(1)}B` : `${model.sizeM}M`) : null
  return [tier, modelFamily(model.id), size && `${size} params`].filter(Boolean).join(' · ')
}

function ModelDetail({ label }) {
  const model = parseModelLabel(label)
  if (!model.id) return null
  return (
    <div className="demo-model-detail">
      <code>{model.id}</code>
      <span className="demo-model-tags">
        {model.metric && (
          <span title={model.split === 'held-out' ? 'Measured on speakers and sentences the model never saw in training.' : 'Measured on a split that shares speakers with training, which flatters the score.'}>
            {model.metric.name} {model.metric.value}% {model.split === 'held-out' ? 'on unseen speakers' : model.split === 'in-domain' ? 'on seen speakers' : ''}
          </span>
        )}
        {downloadSize(model.sizeM) && <span>{downloadSize(model.sizeM)} first load</span>}
        {model.normalised && <span>writes plain lowercase</span>}
      </span>
    </div>
  )
}

/* ---------------------------------------------------- reference comparison */

// "Did it get it right?" is the question every visitor has and most cannot
// answer in a language they do not speak. Corpus clips carry the sentence the
// speaker was reading, so the page answers it: character agreement after
// folding case, stress accents and punctuation — the same folding the "-norm"
// models are trained with, so a correct lowercase answer is not marked wrong
// for dropping an accent. It is an indication, labelled as one, not the CER
// the model cards report.
const fold = (value) =>
  String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()

function characterAgreement(reference, hypothesis) {
  const a = fold(reference)
  const b = fold(hypothesis)
  if (!a || !b) return null
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    previous = current
  }
  return Math.max(0, Math.round((1 - previous[b.length] / a.length) * 100))
}

/* ------------------------------------------------------------- audio source */

const sources = [
  { id: 'record', label: 'Record' },
  { id: 'upload', label: 'Upload' },
  { id: 'clip', label: 'Corpus clip' },
]

/**
 * Resolves a clip, an upload, or a recording to one `{ blob, seconds, caption }`
 * so the blocks that consume it never branch on where the audio came from.
 *
 * Recording leads when the browser can record: "say something" is the fastest
 * way to see the demo is real. Where it cannot (an insecure origin, no
 * MediaRecorder) the corpus clips lead instead, and the Record option is not
 * offered rather than offered and refused.
 */
function AudioSource({ language, languageLabel, value, onChange, disabled, step }) {
  const recordable = useMemo(canRecord, [])
  const [mode, setMode] = useState(recordable ? 'record' : 'clip')
  const manifestClips = useMemo(() => languages.find((entry) => entry.name === language)?.clips ?? [], [language])
  const [clips, refreshClips, clipsBusy] = useLiveOptions(language, manifestClips, listClips)
  const [note, setNote] = useState(null)
  const [pendingLong, setPendingLong] = useState(null)
  const [loadingClip, setLoadingClip] = useState(null)
  const [recorder, setRecorder] = useState(null)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const [level, setLevel] = useState(0)
  const [dragging, setDragging] = useState(false)
  const fieldId = useId()

  const offered = sources.filter((source) => source.id !== 'record' || recordable)

  useEffect(() => {
    onChange(null)
    setNote(null)
    setPendingLong(null)
  }, [language, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clips are confirmed against the Space as soon as the clip list is on
  // screen, not on a focus that buttons never receive.
  useEffect(() => { if (mode === 'clip') refreshClips() }, [mode, refreshClips])

  const acceptFile = useCallback(
    async (file, { trim = false } = {}) => {
      if (!file) return
      setNote(null)
      setPendingLong(null)
      try {
        const decoded = await toSpeechWav(file, { trim })
        onChange({
          blob: decoded.blob,
          peaks: decoded.peaks,
          seconds: decoded.seconds,
          caption: `${file.name ?? 'recording'} · ${formatSeconds(decoded.seconds)}${decoded.trimmed ? ' (first 15s)' : ''}`,
        })
      } catch (caught) {
        // Offered rather than done silently: sending fifteen seconds of a
        // four-minute file should be the visitor's decision.
        if (caught instanceof AudioError && caught.kind === 'too-long') setPendingLong({ file, seconds: caught.seconds })
        else setNote(caught?.message ?? 'That file could not be read.')
      }
    },
    [onChange],
  )

  const pickClip = useCallback(
    async (label) => {
      if (!label) return
      setNote(null)
      onChange(null)
      setLoadingClip(label)
      try {
        const { audio, reference } = await loadSample(language, label)
        const blob = await fetchAudioBlob(audio)
        onChange({ blob, seconds: null, caption: label.replace(/^\d+\.\s*/, ''), reference, clip: label })
      } catch (caught) {
        setNote(caught?.message ?? 'That clip could not be loaded.')
      } finally {
        setLoadingClip(null)
      }
    },
    [language, onChange],
  )

  const accept = useCallback(
    (decoded) => {
      onChange({
        blob: decoded.blob,
        peaks: decoded.peaks,
        seconds: decoded.seconds,
        caption: `Your recording · ${formatSeconds(decoded.seconds)}`,
      })
    },
    [onChange],
  )

  const beginRecording = useCallback(async () => {
    setNote(null)
    onChange(null)
    try {
      setRecorder(await startRecording({
        onTick: setRecordSeconds,
        // The meter is what tells a visitor the microphone is actually hearing
        // them — without it, a muted mic and a working one look identical
        // until fifteen seconds of silence come back as an empty transcript.
        onLevel: setLevel,
        // The cap finalises the recording itself, so this delivers the clip
        // rather than leaving a "Stop recording" button over a microphone that
        // has already been released.
        onAutoStop: (decoded) => {
          setRecorder(null)
          setRecordSeconds(0)
          setLevel(0)
          setNote('Stopped at the 15-second limit.')
          if (decoded) accept(decoded)
          else setNote('That recording could not be read.')
        },
      }))
    } catch (caught) {
      setNote(caught?.message ?? 'Recording could not start.')
    }
  }, [accept, onChange])

  const finishRecording = useCallback(async () => {
    if (!recorder) return
    const handle = recorder
    setRecorder(null)
    setRecordSeconds(0)
    setLevel(0)
    try {
      accept(await handle.stop())
    } catch (caught) {
      setNote(caught?.message ?? 'That recording could not be read.')
    }
  }, [accept, recorder])

  useEffect(() => () => recorder?.cancel(), [recorder])

  return (
    <fieldset className="demo-field">
      <div className="demo-field-head">
        {step && <span className="demo-step" aria-hidden="true">{step}</span>}
        <legend className="demo-label">Audio</legend>
      </div>
      <div className="demo-segmented" role="group" aria-label="Where the audio comes from">
        {offered.map((source) => (
          <button
            key={source.id}
            type="button"
            onClick={() => setMode(source.id)}
            aria-pressed={mode === source.id}
            className={mode === source.id ? 'is-active' : ''}
            disabled={disabled || Boolean(recorder)}
          >
            {source.label}
          </button>
        ))}
      </div>

      {mode === 'record' && (
        <div className="demo-recorder">
          {recorder ? (
            <button type="button" className="demo-record is-live" onClick={finishRecording} style={{ '--level': Math.min(1, level * 12).toFixed(3) }}>
              <span className="demo-rec-dot" aria-hidden="true" />
              <span>Stop · {formatSeconds(recordSeconds)}</span>
              <span className="demo-rec-meter" aria-hidden="true"><i /></span>
            </button>
          ) : (
            <button type="button" className="demo-record" onClick={beginRecording} disabled={disabled}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z" /></svg>
              {value ? 'Record again' : 'Start recording'}
            </button>
          )}
          <p className="demo-hint">Up to 15 seconds, recorded on your device. Only the finished clip is sent.</p>
        </div>
      )}

      {mode === 'upload' && (
        <label
          className={`demo-drop${dragging ? ' is-over' : ''}${disabled ? ' is-disabled' : ''}`}
          onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); acceptFile(event.dataTransfer.files?.[0]) }}
        >
          <input type="file" accept="audio/*" className="sr-only" onChange={(event) => acceptFile(event.target.files?.[0])} disabled={disabled} />
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 16V7.8l-3.3 3.3-1.4-1.4L12 4l5.7 5.7-1.4 1.4L13 7.8V16h-2Zm-6 4v-5h2v3h10v-3h2v5H5Z" /></svg>
          <span><b>Choose an audio file</b><small>or drop one here · up to 15 seconds</small></span>
        </label>
      )}

      {mode === 'clip' && (
        <div className="demo-clips" role="group" aria-label={`${languageLabel} corpus clips`} id={`${fieldId}-clips`}>
          {clips.map((clip) => (
            <button
              key={clip}
              type="button"
              className={value?.clip === clip ? 'is-active' : ''}
              aria-pressed={value?.clip === clip}
              onClick={() => pickClip(clip)}
              disabled={disabled || Boolean(loadingClip)}
            >
              <span className="demo-clip-mark" aria-hidden="true">{loadingClip === clip ? '…' : '▶'}</span>
              <span>{clip.replace(/^\d+\.\s*/, '')}</span>
            </button>
          ))}
          {clipsBusy && !clips.length && <p className="demo-hint">Checking clips…</p>}
          <p className="demo-hint">Read speech from the corpus, with the sentence the speaker was reading.</p>
        </div>
      )}

      {pendingLong && (
        <p className="demo-note">
          That clip is {formatSeconds(pendingLong.seconds)} long.{' '}
          <button type="button" className="text-link" onClick={() => acceptFile(pendingLong.file, { trim: true })}>Use the first 15 seconds</button>
        </p>
      )}
      {note && <p className="demo-note">{note}</p>}

      {/* Both halves are checked because they update a render apart: clearing
          the audio on a language change nulls `value` immediately, while the
          object URL is revoked in an effect and survives one more paint. */}
      {value && <AudioPlayer blob={value.blob} peaks={value.peaks} label={`Your audio: ${value.caption}`} tone="ink" />}
    </fieldset>
  )
}

/* -------------------------------------------------------------------- stage */

function Stage({ capability, language, children, status, live, busy, modelBadge }) {
  const ref = useRef(null)
  const was = useRef(false)
  // The default badge names the model that generates this capability for the
  // language; call sites override it when the exact model in flight matters.
  const badge = modelBadge ?? capability.model(language)

  // On a phone the stage sits below the button that fills it, so starting a job
  // would otherwise put the answer off-screen for the fifteen seconds someone is
  // most likely to be watching. Only nudges when it is actually out of view, so
  // the two-column desktop layout never moves.
  useEffect(() => {
    if (busy && !was.current) {
      const box = ref.current?.getBoundingClientRect()
      if (box && (box.top > window.innerHeight - 120 || box.bottom < 120)) {
        ref.current.scrollIntoView({
          block: 'nearest',
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        })
      }
    }
    was.current = busy
  }, [busy])

  return (
    <div className="demo-stage" ref={ref}>
      <div className="demo-stage-head">
        <span className="demo-stage-label">{capability.resultLabel}</span>
        {badge && <code className="demo-stage-model">{badge}</code>}
      </div>
      <div className="demo-stage-body">{children}</div>
      {status}
      {/* Transitions only, so a screen reader hears "done", not a clock. */}
      <p className="sr-only" role="status" aria-live="polite">{live}</p>
    </div>
  )
}

// Naming what is currently selected turns the waiting state into a summary of
// what pressing the button will do, instead of an empty box with an icon in it.
function EmptyStage({ hint, meta }) {
  return (
    <div className="demo-empty">
      <svg viewBox="0 0 40 24" aria-hidden="true" className="demo-empty-icon">
        {[7, 12, 17, 5, 20, 9, 14, 6, 11, 4].map((height, index) => (
          <rect key={index} x={index * 4 + 1} y={12 - height / 2} width="1.6" height={height} rx="0.8" />
        ))}
      </svg>
      <p>{hint}</p>
      {meta && <p className="demo-empty-meta">{meta}</p>}
    </div>
  )
}

function useAnnouncement(phase, error) {
  return useMemo(() => {
    if (phase === 'success') return 'Result ready.'
    if (phase === 'error') return `Failed: ${error?.message ?? 'unknown error'}`
    if (phase === 'cancelled') return 'Cancelled.'
    return ''
  }, [phase, error])
}

/* ------------------------------------------------------------------- panels */

/**
 * The org's published text-to-speech, heard rather than described.
 *
 * Orpheus 3B is what the org actually ships for speech synthesis, but on free
 * CPU it takes minutes a sentence, so the live box below runs the small SpeechT5
 * baseline instead. Without this block a visitor would judge the project by its
 * retired model. The Space pre-renders held-out sentences through every system
 * it has evaluated, next to a human reading the same line; this plays them.
 * Clips are fetched on first press, not on load — five Ogg files a sentence
 * add up on a phone connection.
 */
function PublishedVoices({ language, languageLabel }) {
  const [state, setState] = useState({ phase: 'idle', data: null, error: null, for: null })
  const [sentence, setSentence] = useState(0)

  useEffect(() => {
    let live = true
    setSentence(0)
    setState({ phase: 'loading', data: null, error: null, for: language })
    compareVoices(language)
      .then((data) => { if (live) setState({ phase: 'ready', data, error: null, for: language }) })
      .catch((error) => { if (live) setState({ phase: 'error', data: null, error, for: language }) })
    return () => { live = false }
  }, [language])

  const current = state.data?.sentences?.[sentence]
  const scoreFor = (system) => {
    const rows = state.data?.scores?.rows ?? []
    const key = system.toLowerCase().split(/[\s,—(]/)[0]
    return rows.find((row) => row.system.toLowerCase().startsWith(key))?.values?.[0]
  }

  return (
    <section className="demo-voices" aria-labelledby="demo-voices-title">
      <div className="demo-voices-head">
        <div>
          <p className="demo-kicker">Published model</p>
          <h4 id="demo-voices-title">Hear Orpheus 3B beside a human reader</h4>
        </div>
        <p className="demo-hint">
          Pre-rendered from sentences the models never trained on. Orpheus is too heavy for the free live box below, so it is served as recordings.
        </p>
      </div>

      {state.phase === 'loading' && <Skeleton />}
      {state.phase === 'error' && (
        <p className="demo-note">The comparison for {languageLabel} could not be loaded right now. The live baseline below still works.</p>
      )}
      {state.phase === 'ready' && !current && (
        <p className="demo-note">No pre-rendered comparison is published for {languageLabel} yet.</p>
      )}
      {current && (
        <>
          <div className="demo-sentences" role="group" aria-label="Choose a sentence">
            {state.data.sentences.map((item, index) => (
              <button
                key={item.text}
                type="button"
                aria-pressed={index === sentence}
                className={index === sentence ? 'is-active' : ''}
                onClick={() => setSentence(index)}
                title={item.text}
              >
                {index + 1}
              </button>
            ))}
          </div>
          <blockquote className="demo-sentence" lang={modelCode[language] === 'eng' ? 'en' : undefined}>{current.text}</blockquote>
          <ul className="demo-voice-list">
            {current.clips.map((clip) => {
              const ours = /orpheus/i.test(clip.system)
              const human = /human/i.test(clip.system)
              const score = scoreFor(clip.system)
              return (
                <li key={`${sentence}-${clip.system}`} className={ours ? 'is-ours' : human ? 'is-human' : ''}>
                  <div className="demo-voice-name">
                    <span>{clip.system.replace(/\s*—\s*the Synthesize tab$/i, ' (live box below)')}</span>
                    {ours && <b className="demo-pill">Ours · published</b>}
                    {score && score !== '—' && <small title="Character error rate when a recogniser transcribes this voice — lower is clearer.">CER {score}</small>}
                  </div>
                  {clip.audio ? <LazyClip fileData={clip.audio} label={`${clip.system}: ${current.text}`} tone={human ? 'ink' : 'ube'} /> : <p className="demo-hint">Not available for {languageLabel}.</p>}
                </li>
              )
            })}
          </ul>
          <p className="demo-caption">
            CER = how many characters a speech recogniser gets wrong when it listens to that voice. Lower means clearer speech. Scores cover 50 sentences per language.
          </p>
        </>
      )}
    </section>
  )
}

// A play button that fetches its file on first press, then hands over to the
// normal player with autoplay so the press is not wasted.
function LazyClip({ fileData, label, tone }) {
  const [blob, setBlob] = useState(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const load = useCallback(async () => {
    setBusy(true)
    setFailed(false)
    try {
      setBlob(await fetchAudioBlob(fileData))
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }, [fileData])
  if (blob) return <AudioPlayer blob={blob} label={label} tone={tone} autoplay />
  return (
    <button type="button" className="demo-lazy" onClick={load} disabled={busy} aria-label={`Play ${label}`}>
      <span className="demo-play" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
      </span>
      <span>{busy ? 'Loading…' : failed ? 'Could not load — try again' : 'Play'}</span>
    </button>
  )
}

function SynthesizePanel({ capability, language, languageLabel }) {
  const manifestVoices = useMemo(() => languages.find((entry) => entry.name === language)?.voices ?? [], [language])
  const [voices, refreshVoices] = useLiveOptions(language, manifestVoices, listVoices)
  const [voice, setVoice] = useState(manifestVoices[0] ?? '')
  const [text, setText] = useState(sampleText[language] ?? '')
  const job = useJob(capability)
  const live = useAnnouncement(job.phase, job.error)
  const id = useId()

  useEffect(() => {
    setText(sampleText[language] ?? '')
  }, [language])

  // Follows the list rather than the language, so a refresh that finds the
  // selected voice gone lands on a real one instead of failing at submit.
  useEffect(() => {
    if (voices.length && !voices.includes(voice)) setVoice(voices[0])
  }, [voices, voice])

  const run = useCallback(() => {
    const value = text.trim()
    if (!value) return
    job.start(
      { language, languageLabel, voice, subject: `${languageLabel} · ${voice}`, cold: !isWarm(capability.warmKind, language) },
      async ({ signal, onPosition, setPhase }) => {
        const { audio } = await synthesize({ language, voice, text: value }, { signal, onPosition })
        setPhase('running')
        return { blob: await fetchAudioBlob(audio, { signal }), caption: `${languageLabel} · ${voice}` }
      },
    )
  }, [capability, job, language, languageLabel, text, voice])

  return (
    <>
      <PublishedVoices language={language} languageLabel={languageLabel} />
      <div className="demo-live-head">
        <p className="demo-kicker">Try it live</p>
        <p className="demo-hint">Type anything. This runs the small SpeechT5 baseline on free CPU, so it is quick but robotic next to Orpheus.</p>
      </div>
      <div className="demo-inputs">
        <Field label="What should it say?" htmlFor={`${id}-text`} aside={`${text.length}/220`}>
          {/* Autocorrect and spellcheck are turned off deliberately, not for
              tidiness. A phone keyboard set to English will silently rewrite
              Cebuano and Waray as it is typed — "Maayong" becomes "Maying" —
              so the model would be asked to read a sentence the visitor never
              wrote. Capitalisation is left on, since these really are sentences. */}
          <textarea
            id={`${id}-text`}
            rows={3}
            value={text}
            maxLength={220}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) run() }}
            placeholder={sampleText[language] ?? 'Type a sentence in this language'}
            autoCorrect="off"
            autoCapitalize="sentences"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="done"
          />
        </Field>
        <Field label="Speaker" htmlFor={`${id}-voice`}>
          <select id={`${id}-voice`} value={voice} onFocus={refreshVoices} onPointerDown={refreshVoices} onChange={(event) => setVoice(event.target.value)}>
            {voices.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </Field>
        <RunButton capability={capability} job={job} onRun={run} ready={Boolean(text.trim())} />
      </div>
      <Stage
        capability={capability}
        // The badge names the model that produced what is on the stage, not
        // whatever the picker moved to while the request was in flight.
        language={job.result?.job.language ?? language}
        live={live}
        busy={job.busy}
        status={<StatusLine phase={job.phase} position={job.position} elapsed={job.elapsed} job={job.job} error={job.error} onCancel={job.cancel} onRetry={run} />}
      >
        {job.result ? (
          <div className="demo-result">
            <AudioPlayer blob={job.result.blob} autoplay label={`Synthesized speech, ${job.result.job.languageLabel} in the voice of ${job.result.job.voice}`} />
            <p className="demo-caption">{job.result.caption}</p>
          </div>
        ) : job.busy ? <Skeleton variant="audio" /> : <EmptyStage hint="Your audio will play here." meta={`${languageLabel} · ${voice}`} />}
      </Stage>
    </>
  )
}

// One run button for all three panels: it says what it will do, and while a
// job is in flight it says what is happening instead of a bare "Working…".
function RunButton({ capability, job, onRun, ready, why }) {
  return (
    <div className="demo-run-wrap">
      <button type="button" className="demo-run" onClick={onRun} disabled={job.busy || !ready}>
        {job.busy ? (
          <><span className="demo-spinner" aria-hidden="true" />{capability.verb}…</>
        ) : (
          <><svg viewBox="0 0 24 24" aria-hidden="true"><path d={capability.icon} /></svg>{capability.action}</>
        )}
      </button>
      {!ready && !job.busy && why && <p className="demo-hint demo-run-why">{why}</p>}
    </div>
  )
}

function TranscribePanel({ capability, language, languageLabel }) {
  const [audio, setAudio] = useState(null)
  const [reference, setReference] = useState('')
  const [showReference, setShowReference] = useState(false)
  const manifestModels = useMemo(() => languages.find((entry) => entry.name === language)?.models ?? [], [language])
  const [models, refreshModels] = useLiveOptions(language, manifestModels, listModels)
  // The baseline is the default — fast, small, warm most often. The Space
  // lists its recommended model first, but on free CPU that can be a 1.5B
  // model and a two-minute first run; the visitor can choose it.
  const [model, setModel] = useState(findBaseline(manifestModels) ?? manifestModels[0] ?? '')
  const job = useJob(capability)
  const live = useAnnouncement(job.phase, job.error)
  const id = useId()

  // Corpus clips carry the sentence the speaker was reading, which is the only
  // way to judge a transcription in a language you may not know.
  useEffect(() => {
    setReference(audio?.reference ?? '')
    if (audio?.reference) setShowReference(true)
  }, [audio])

  useEffect(() => setModel(findBaseline(manifestModels) ?? manifestModels[0] ?? ''), [manifestModels])

  // Follows the list rather than the language, so a refresh that relabels the
  // selected model keeps the same model (matched by id), and one that drops it
  // falls back to the baseline instead of failing at submit.
  useEffect(() => {
    if (!models.length || models.includes(model)) return
    setModel(findSameModel(models, model) ?? findBaseline(models) ?? models[0])
  }, [models, model])

  const run = useCallback(() => {
    if (!audio) return
    job.start(
      {
        language,
        languageLabel,
        model,
        subject: languageLabel,
        cold: !isWarm(capability.warmKind, language, model),
        uploadSize: audio.blob.size,
        reference,
      },
      async ({ signal, onPosition, setPhase }) => {
        setPhase('uploading')
        const uploaded = await uploadBlob(audio.blob, 'input.wav', { signal })
        setPhase('connecting')
        // The model is re-validated against the Space's live list on its way
        // in, so a manifest that has gone stale recovers instead of failing.
        return { text: (await transcribe({ language, model, audio: uploaded, reference }, { signal, onPosition })).text }
      },
    )
  }, [audio, capability, job, language, languageLabel, model, reference])

  const resultReference = job.result?.job.reference
  const agreement = job.result && resultReference ? characterAgreement(resultReference, job.result.text) : null
  const several = models.length > 1

  return (
    <>
      <div className="demo-inputs">
        <AudioSource language={language} languageLabel={languageLabel} value={audio} onChange={setAudio} disabled={job.busy} />
        <Field
          label="Model"
          htmlFor={`${id}-model`}
          aside={several ? `${models.length} for ${languageLabel}` : null}
          hint={several ? 'Larger models are more accurate but slower, and the first run downloads their weights.' : null}
        >
          <select id={`${id}-model`} value={model} onFocus={refreshModels} onPointerDown={refreshModels} onChange={(event) => setModel(event.target.value)} disabled={job.busy}>
            {models.map((option) => <option key={option} value={option}>{modelOptionText(option)}</option>)}
          </select>
          <ModelDetail label={model} />
        </Field>
        {showReference ? (
          <Field label="What was said (optional)" hint="Lets the page score the transcription. Filled in for you with a corpus clip." htmlFor={`${id}-ref`}>
            {/* Same reasoning as the synthesis box: a phone keyboard correcting
                this into English would quietly change what is scored. */}
            <input
              id={`${id}-ref`}
              type="text"
              maxLength={300}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="What was actually said"
              autoCorrect="off"
              autoCapitalize="sentences"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="done"
            />
          </Field>
        ) : (
          <button type="button" className="demo-add" onClick={() => setShowReference(true)}>+ Add what was said, to score the result</button>
        )}
        <RunButton capability={capability} job={job} onRun={run} ready={Boolean(audio)} why="Record, upload or pick a clip first." />
      </div>
      <Stage
        capability={capability}
        // The badge names the model that produced what is on the stage, not
        // whatever the picker moved to while the request was in flight.
        language={job.result?.job.language ?? language}
        modelBadge={parseModelLabel(job.result?.job.model ?? model).id || capability.model(language)}
        live={live}
        busy={job.busy}
        status={<StatusLine phase={job.phase} position={job.position} elapsed={job.elapsed} job={job.job} error={job.error} onCancel={job.cancel} onRetry={run} />}
      >
        {job.result ? (
          <div className="demo-result">
            <p className="demo-transcript">{job.result.text || '(the model heard nothing — try speaking closer to the mic)'}</p>
            {resultReference && (
              <div className="demo-compare">
                <p className="demo-caption"><b>Read as:</b> {resultReference}</p>
                {agreement !== null && (
                  <p className="demo-score" title="Characters that match after ignoring case, accents and punctuation. An indication, not the benchmark CER.">
                    <span className="demo-score-bar" aria-hidden="true"><i style={{ transform: `scaleX(${agreement / 100})` }} /></span>
                    {agreement}% of characters match
                  </p>
                )}
              </div>
            )}
            {job.result.text && (
              <button type="button" className="demo-status-action demo-copy" onClick={() => navigator.clipboard?.writeText(job.result.text)}>Copy text</button>
            )}
          </div>
        ) : job.busy ? <Skeleton /> : <EmptyStage hint="The transcription will appear here." meta={audio ? audio.caption : `${languageLabel} — add some audio first`} />}
      </Stage>
    </>
  )
}

function ConvertPanel({ capability, language, languageLabel }) {
  const [audio, setAudio] = useState(null)
  const [voice, setVoice] = useState(targetVoices[0] ?? '')
  const job = useJob(capability)
  const live = useAnnouncement(job.phase, job.error)
  const id = useId()

  // Default to a voice in the language being explored, but leave all twenty
  // selectable — converting Waray speech into a Bikol voice is the point.
  useEffect(() => {
    const preferred = targetVoices.find((option) => option.startsWith(`${language} ·`))
    if (preferred) setVoice(preferred)
  }, [language])

  // Twenty voices in one flat list was a long scroll on a phone; grouping them
  // under their language makes the list scannable.
  const grouped = useMemo(() => {
    const groups = new Map()
    for (const option of targetVoices) {
      const [group] = option.split(' · ')
      if (!groups.has(group)) groups.set(group, [])
      groups.get(group).push(option)
    }
    return [...groups]
  }, [])

  const run = useCallback(() => {
    if (!audio) return
    job.start(
      // The target voice already carries its own language ("Cebuano · CEB_0200"),
      // so it is the whole subject — prefixing it would say Cebuano twice.
      { language, languageLabel, voice, subject: voice, cold: !isWarm(capability.warmKind, language), uploadSize: audio.blob.size },
      async ({ signal, onPosition, setPhase }) => {
        setPhase('uploading')
        const uploaded = await uploadBlob(audio.blob, 'input.wav', { signal })
        setPhase('connecting')
        const { audio: output } = await convert({ audio: uploaded, voice }, { signal, onPosition })
        setPhase('running')
        return { blob: await fetchAudioBlob(output, { signal }), caption: voice, source: audio }
      },
    )
  }, [audio, capability, job, language, languageLabel, voice])

  return (
    <>
      <div className="demo-inputs">
        <AudioSource language={language} languageLabel={languageLabel} value={audio} onChange={setAudio} disabled={job.busy} />
        <Field label="Into whose voice?" htmlFor={`${id}-voice`} hint="Any of the twenty corpus speakers, in any language.">
          <select id={`${id}-voice`} value={voice} onChange={(event) => setVoice(event.target.value)} disabled={job.busy}>
            {grouped.map(([group, options]) => (
              <optgroup key={group} label={group}>
                {options.map((option) => <option key={option} value={option}>{option.split(' · ')[1] ?? option}</option>)}
              </optgroup>
            ))}
          </select>
        </Field>
        <RunButton capability={capability} job={job} onRun={run} ready={Boolean(audio)} why="Record, upload or pick a clip first." />
      </div>
      <Stage
        capability={capability}
        language={job.result?.job.language ?? language}
        live={live}
        busy={job.busy}
        status={<StatusLine phase={job.phase} position={job.position} elapsed={job.elapsed} job={job.job} error={job.error} onCancel={job.cancel} onRetry={run} />}
      >
        {job.result ? (
          <div className="demo-result">
            {/* Before and after, stacked, so the change is one tap apart. */}
            <p className="demo-caption"><b>Before</b> · {job.result.source?.caption}</p>
            <AudioPlayer blob={job.result.source?.blob} peaks={job.result.source?.peaks} label={`Original: ${job.result.source?.caption}`} tone="ink" />
            <p className="demo-caption"><b>After</b> · {job.result.caption}</p>
            <AudioPlayer blob={job.result.blob} autoplay label={`Converted speech in the voice of ${job.result.job.voice}`} />
          </div>
        ) : job.busy ? <Skeleton variant="audio" /> : <EmptyStage hint="The converted audio will play here." meta={audio ? `Into ${voice}` : 'Add some audio first'} />}
      </Stage>
    </>
  )
}

/* -------------------------------------------------------------------- shell */

const panels = { synthesize: SynthesizePanel, transcribe: TranscribePanel, convert: ConvertPanel }

export default function SpeechConsole() {
  const [active, setActive] = useState('synthesize')
  const [language, setLanguage] = useState('Cebuano')
  const entry = languages.find((item) => item.name === language) ?? languages[0]
  const capability = capabilities.find((item) => item.id === active)
  const Panel = panels[capability.id]
  const tabsRef = useRef(null)
  const langsRef = useRef(null)

  // Measure the selected tab and let CSS glide the indicator to it.
  useEffect(() => {
    const container = tabsRef.current
    if (!container) return undefined
    const place = () => {
      const current = container.querySelector('[aria-selected="true"]')
      if (!current) return
      container.style.setProperty('--tab-x', `${current.offsetLeft}px`)
      container.style.setProperty('--tab-w', `${current.offsetWidth}px`)
    }
    place()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(place)
    observer.observe(container)
    return () => observer.disconnect()
  }, [active])

  // On a phone the language strip scrolls sideways; keep the chosen language
  // in view rather than leaving it clipped off the edge after a tap.
  useEffect(() => {
    const strip = langsRef.current
    const current = strip?.querySelector('[aria-pressed="true"]')
    if (!strip || !current || strip.scrollWidth <= strip.clientWidth) return
    const left = current.offsetLeft - (strip.clientWidth - current.offsetWidth) / 2
    strip.scrollTo({ left, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [language])

  // Arrow keys move between tabs, which a plain button group would not do; the
  // tablist role promises this behaviour, so it has to be implemented.
  const onKeyDown = useCallback(
    (event) => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
      if (!step) return
      event.preventDefault()
      const index = capabilities.findIndex((item) => item.id === active)
      const next = capabilities[(index + step + capabilities.length) % capabilities.length]
      setActive(next.id)
      tabsRef.current?.querySelector(`#demo-tab-${next.id}`)?.focus()
    },
    [active],
  )

  return (
    <div className="demo-studio">
      <div
        className="demo-switch"
        role="tablist"
        aria-label="Choose a capability"
        ref={tabsRef}
        onKeyDown={onKeyDown}
        style={{ '--demo-cols': String(capabilities.length) }}
      >
        {capabilities.map((item) => (
          <button
            key={item.id}
            id={`demo-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={active === item.id}
            aria-controls={`demo-panel-${item.id}`}
            tabIndex={active === item.id ? 0 : -1}
            className={active === item.id ? 'is-active' : ''}
            onClick={() => setActive(item.id)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="demo-switch-icon"><path d={item.icon} /></svg>
            <span className="demo-switch-text">
              <span className="demo-switch-kicker">{item.kicker}</span>
              <span className="demo-switch-label">{item.tab}</span>
            </span>
            <span className="demo-switch-short" aria-hidden="true">{item.short}</span>
          </button>
        ))}
      </div>

      {/* Language comes first and is shared by all three tabs. It used to be
          the last numbered step inside each panel, which put the one choice
          that changes every other field (voices, clips, models) at the bottom
          — on a phone, a full screen below the fields it was resetting. */}
      <div className="demo-lang-bar">
        <span className="demo-label" id="demo-lang-label">Language</span>
        <div className="demo-langs" role="group" aria-labelledby="demo-lang-label" ref={langsRef}>
          {languages.map((item) => (
            <button
              key={item.name}
              type="button"
              onClick={() => setLanguage(item.name)}
              aria-pressed={language === item.name}
              className={language === item.name ? 'is-active' : ''}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Keyed so the heading and the workspace replay their entrance when the
          capability changes — an instant swap of every word on screen reads as
          a page jump rather than a switch. */}
      <div className="demo-panel-head" key={`head-${capability.id}`}>
        <h3 className="demo-panel-title">{capability.title}</h3>
        <p className="demo-panel-copy">{capability.copy}</p>
      </div>

      <div
        key={`panel-${capability.id}`}
        className={`demo-workspace is-${capability.id}`}
        role="tabpanel"
        id={`demo-panel-${capability.id}`}
        aria-labelledby={`demo-tab-${capability.id}`}
        tabIndex={-1}
      >
        {/* Keyed on capability so switching tabs cannot carry one panel's
            half-filled state into another's fields. */}
        <Panel key={capability.id} capability={capability} language={entry.name} languageLabel={entry.label} />
      </div>
    </div>
  )
}
