import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { languages, targetVoices } from '../data/spaceManifest'
import { AudioError, canRecord, extractPeaks, formatBytes, formatSeconds, startRecording, toSpeechWav } from '../lib/audio'
import { convert, fetchAudioBlob, isWarm, listClips, listModels, listVoices, loadSample, synthesize, transcribe, uploadBlob } from '../lib/spaceClient'

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

const capabilities = [
  {
    id: 'synthesize',
    kicker: 'Synthesize',
    tab: 'Text to speech',
    title: 'Type a sentence, hear it spoken',
    copy: 'One of the corpus speakers reads your text back in the language you pick.',
    model: (language) => (modelCode[language] ? `speecht5_tts-pld-${modelCode[language]}` : null),
    resultLabel: 'Synthesized speech',
    warmKind: 'tts',
    verb: 'Synthesizing',
    warmEta: 16,
    action: 'Synthesize',
  },
  {
    id: 'transcribe',
    kicker: 'Transcribe',
    tab: 'Speech to text',
    title: 'Turn speech into text',
    copy: 'Play a corpus clip, upload a file, or record yourself, and read it back.',
    model: (language) => (modelCode[language] ? `whisper-small-pld-${modelCode[language]}` : null),
    resultLabel: 'Model transcription',
    warmKind: 'asr',
    verb: 'Transcribing',
    warmEta: 12,
    action: 'Transcribe',
  },
  {
    id: 'convert',
    kicker: 'Convert voice',
    tab: 'Voice conversion',
    title: 'Say it in another voice',
    copy: 'Keep the words and delivery, swap in the voice of a corpus speaker.',
    model: () => 'speecht5_vc-pld',
    resultLabel: 'Converted speech',
    warmKind: 'vc',
    verb: 'Converting',
    warmEta: 20,
    action: 'Convert voice',
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

  const eta = etaFor(job.capability, job.cold)
  const label = `${job.capability.verb} ${job.subject}`
  if (elapsed < 6) return label
  if (job.cold && elapsed >= COLD_NOTICE_AFTER) {
    // Voice conversion is one language-independent model, so naming a language
    // here would promise a per-language wait that does not exist.
    if (job.capability.warmKind === 'vc') {
      return 'First run — the Space is loading the voice-conversion model onto free CPU. This happens once.'
    }
    const big = /whisper-large-v3/.test(job.model ?? '')
    const size = big ? 'several GB' : 'about 1 GB'
    const after = big ? ' The large bake-off model takes a few minutes.' : ' This happens once per language.'
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
function AudioPlayer({ blob, label, tone = 'ube', peaks: ready }) {
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

function Field({ step, label, hint, children, htmlFor }) {
  return (
    <div className="demo-field">
      <div className="demo-field-head">
        <span className="demo-step" aria-hidden="true">{step}</span>
        <label className="demo-label" htmlFor={htmlFor}>{label}</label>
      </div>
      {children}
      {hint && <p className="demo-hint">{hint}</p>}
    </div>
  )
}

/* ------------------------------------------------------------- audio source */

const sources = [
  { id: 'clip', label: 'Corpus clip' },
  { id: 'upload', label: 'Upload' },
  { id: 'record', label: 'Record' },
]

/**
 * Resolves a clip, an upload, or a recording to one `{ blob, seconds, caption }`
 * so the blocks that consume it never branch on where the audio came from.
 */
function AudioSource({ language, languageLabel, value, onChange, disabled, step }) {
  const [mode, setMode] = useState('clip')
  const manifestClips = useMemo(() => languages.find((entry) => entry.name === language)?.clips ?? [], [language])
  const [clips, refreshClips, clipsBusy] = useLiveOptions(language, manifestClips, listClips)
  const [note, setNote] = useState(null)
  const [pendingLong, setPendingLong] = useState(null)
  const [loadingClip, setLoadingClip] = useState(false)
  const [recorder, setRecorder] = useState(null)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const recordable = useMemo(canRecord, [])
  const fieldId = useId()

  const offered = sources.filter((source) => source.id !== 'record' || recordable)

  useEffect(() => {
    onChange(null)
    setNote(null)
    setPendingLong(null)
  }, [language, mode]) // eslint-disable-line react-hooks/exhaustive-deps

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
      setLoadingClip(true)
      try {
        const { audio, reference } = await loadSample(language, label)
        const blob = await fetchAudioBlob(audio)
        onChange({ blob, seconds: null, caption: label, reference })
      } catch (caught) {
        setNote(caught?.message ?? 'That clip could not be loaded.')
      } finally {
        setLoadingClip(false)
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
    try {
      setRecorder(await startRecording({
        onTick: setRecordSeconds,
        // The cap finalises the recording itself, so this delivers the clip
        // rather than leaving a "Stop recording" button over a microphone that
        // has already been released.
        onAutoStop: (decoded) => {
          setRecorder(null)
          setRecordSeconds(0)
          setNote('Stopped at the 15-second limit.')
          if (decoded) accept(decoded)
          else setNote('That recording could not be read.')
        },
      }))
    } catch (caught) {
      setNote(caught?.message ?? 'Recording could not start.')
    }
  }, [accept])

  const finishRecording = useCallback(async () => {
    if (!recorder) return
    const handle = recorder
    setRecorder(null)
    setRecordSeconds(0)
    try {
      accept(await handle.stop())
    } catch (caught) {
      setNote(caught?.message ?? 'That recording could not be read.')
    }
  }, [accept, recorder])

  useEffect(() => () => recorder?.cancel(), [recorder])

  return (
    <div className="demo-field">
      <div className="demo-field-head">
        <span className="demo-step" aria-hidden="true">{step}</span>
        <span className="demo-label">Audio</span>
        <div className="demo-segmented is-mini" role="group" aria-label="Choose where the audio comes from">
          {offered.map((source) => (
            <button
              key={source.id}
              type="button"
              onClick={() => setMode(source.id)}
              aria-pressed={mode === source.id}
              className={mode === source.id ? 'is-active' : ''}
              disabled={disabled}
            >
              {source.label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'clip' && (
        <select
          id={`${fieldId}-clip`}
          defaultValue=""
          onFocus={refreshClips}
          onChange={(event) => pickClip(event.target.value)}
          disabled={disabled}
          aria-label={`${languageLabel} corpus clip`}
        >
          <option value="" disabled>{clipsBusy ? 'Checking clips…' : `Choose a ${languageLabel} clip`}</option>
          {clips.map((clip) => <option key={clip} value={clip}>{clip}</option>)}
        </select>
      )}

      {mode === 'upload' && (
        <>
          <input type="file" accept="audio/*" aria-label="Audio file" onChange={(event) => acceptFile(event.target.files?.[0])} disabled={disabled} />
          <p className="demo-hint">Up to 15 seconds. Anything the browser can play.</p>
        </>
      )}

      {mode === 'record' && (
        <>
          {recorder ? (
            <button type="button" className="demo-record is-live" onClick={finishRecording}>
              <span className="demo-rec-dot" aria-hidden="true" />Stop recording · {formatSeconds(recordSeconds)}
            </button>
          ) : (
            <button type="button" className="demo-record" onClick={beginRecording} disabled={disabled}>
              <span className="demo-rec-ring" aria-hidden="true" />Start recording
            </button>
          )}
          <p className="demo-hint">Stops on its own after 15 seconds.</p>
        </>
      )}

      {loadingClip && <p className="demo-hint">Fetching the clip…</p>}
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
    </div>
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

function SynthesizePanel({ capability, language, languageLabel, languageField }) {
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
      <div className="demo-inputs">
        {languageField}
        <Field step="2" label="What should it say?" htmlFor={`${id}-text`}>
          {/* Autocorrect and spellcheck are turned off deliberately, not for
              tidiness. A phone keyboard set to English will silently rewrite
              Cebuano and Waray as it is typed — "Maayong" becomes "Maying" —
              so the model would be asked to read a sentence the visitor never
              wrote. The red underlines under every word of a Philippine
              language are the same mistake, made visible. Capitalisation is
              left on, since these really are sentences. */}
          <textarea
            id={`${id}-text`}
            rows={3}
            value={text}
            maxLength={220}
            onChange={(event) => setText(event.target.value)}
            placeholder={sampleText[language] ?? 'Type a sentence in this language'}
            autoCorrect="off"
            autoCapitalize="sentences"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="done"
          />
        </Field>
        <Field step="3" label="Voice" htmlFor={`${id}-voice`}>
          <select id={`${id}-voice`} value={voice} onFocus={refreshVoices} onChange={(event) => setVoice(event.target.value)}>
            {voices.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </Field>
        <button type="button" className="demo-run" onClick={run} disabled={job.busy || !text.trim()}>
          {job.busy ? 'Working…' : capability.action}
        </button>
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
            <AudioPlayer blob={job.result.blob} label={`Synthesized speech, ${job.result.job.languageLabel} in the voice of ${job.result.job.voice}`} />
            <p className="demo-caption">{job.result.caption}</p>
          </div>
        ) : job.busy ? <Skeleton variant="audio" /> : <EmptyStage hint="Your synthesized audio will play here." meta={`${languageLabel} · ${voice}`} />}
      </Stage>
    </>
  )
}

function TranscribePanel({ capability, language, languageLabel, languageField }) {
  const [audio, setAudio] = useState(null)
  const [reference, setReference] = useState('')
  const manifestModels = useMemo(() => languages.find((entry) => entry.name === language)?.models ?? [], [language])
  const [models, refreshModels] = useLiveOptions(language, manifestModels, listModels)
  const [model, setModel] = useState(manifestModels[0] ?? '')
  const job = useJob(capability)
  const live = useAnnouncement(job.phase, job.error)
  const id = useId()

  // Corpus clips carry the sentence the speaker was reading, which is the only
  // way to judge a transcription in a language you may not know.
  useEffect(() => setReference(audio?.reference ?? ''), [audio])

  // The whisper-small baseline is the first option in the Space's own list, so
  // a fresh language follows the picker to its default there too.
  useEffect(() => setModel(manifestModels[0] ?? ''), [manifestModels])

  // Follows the list rather than the language, so a refresh that finds the
  // selected model gone lands on a real one instead of failing at submit.
  useEffect(() => {
    if (models.length && models.includes(model)) return
    if (models.length) setModel(models[0])
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

  return (
    <>
      <div className="demo-inputs">
        {languageField}
        <Field step="2" label="Model" hint="Cebuano and Kapampangan offer a bake-off of small, mid and gigabyte-scale models — slower, larger models are the most accurate, and the first run downloads their weights.">
          <select id={`${id}-model`} value={model} onFocus={refreshModels} onChange={(event) => setModel(event.target.value)}>
            {models.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </Field>
        <AudioSource step="3" language={language} languageLabel={languageLabel} value={audio} onChange={setAudio} disabled={job.busy} />
        <Field step="4" label="Expected transcript" hint="Optional — filled in for you when you pick a corpus clip." htmlFor={`${id}-ref`}>
          {/* Same reasoning as the synthesis box: this field holds a sentence
              in a Philippine language, and a phone keyboard correcting it into
              English would quietly change what the transcription is scored
              against. */}
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
        <button type="button" className="demo-run" onClick={run} disabled={job.busy || !audio}>
          {job.busy ? 'Working…' : capability.action}
        </button>
      </div>
      <Stage
        capability={capability}
        // The badge names the model that produced what is on the stage, not
        // whatever the picker moved to while the request was in flight.
        language={job.result?.job.language ?? language}
        modelBadge={model ? model.split(' · ')[0] : capability.model(language)}
        live={live}
        busy={job.busy}
        status={<StatusLine phase={job.phase} position={job.position} elapsed={job.elapsed} job={job.job} error={job.error} onCancel={job.cancel} onRetry={run} />}
      >
        {job.result ? (
          <div className="demo-result">
            <p className="demo-transcript">{job.result.text || '(the model returned nothing)'}</p>
            {reference && <p className="demo-caption">Read as: {reference}</p>}
          </div>
        ) : job.busy ? <Skeleton /> : <EmptyStage hint="The transcription will appear here." meta={audio ? audio.caption : `${languageLabel} — choose some audio first`} />}
      </Stage>
    </>
  )
}

function ConvertPanel({ capability, language, languageLabel, languageField }) {
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
        return { blob: await fetchAudioBlob(output, { signal }), caption: voice }
      },
    )
  }, [audio, capability, job, language, languageLabel, voice])

  return (
    <>
      <div className="demo-inputs">
        {languageField}
        <AudioSource step="2" language={language} languageLabel={languageLabel} value={audio} onChange={setAudio} disabled={job.busy} />
        <Field step="3" label="Target voice" htmlFor={`${id}-voice`}>
          <select id={`${id}-voice`} value={voice} onChange={(event) => setVoice(event.target.value)}>
            {targetVoices.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </Field>
        <button type="button" className="demo-run" onClick={run} disabled={job.busy || !audio}>
          {job.busy ? 'Working…' : capability.action}
        </button>
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
            <AudioPlayer blob={job.result.blob} label={`Converted speech in the voice of ${job.result.job.voice}`} />
            <p className="demo-caption">{job.result.caption}</p>
          </div>
        ) : job.busy ? <Skeleton variant="audio" /> : <EmptyStage hint="The converted audio will play here." meta={audio ? `Into ${voice}` : 'Choose some audio first'} />}
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

  // Measure the selected tab and let CSS glide the underline to it, the same
  // way the nav moves its pill between sections. Doing it from the real box
  // rather than an nth-child rule keeps it correct when the labels change width
  // at a breakpoint.
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
      <div className="demo-switch" role="tablist" aria-label="Choose a capability" ref={tabsRef} onKeyDown={onKeyDown}>
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
            <span className="demo-switch-kicker">{item.kicker}</span>
            <span className="demo-switch-label">{item.tab}</span>
          </button>
        ))}
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
        className="demo-workspace"
        role="tabpanel"
        id={`demo-panel-${capability.id}`}
        aria-labelledby={`demo-tab-${capability.id}`}
        tabIndex={-1}
      >
        {/* Keyed on capability so switching tabs cannot carry one panel's
            half-filled state into another's fields. The panel renders the input
            column and the stage as siblings, so both sit directly in the grid. */}
        <Panel
          key={capability.id}
          capability={capability}
          language={entry.name}
          languageLabel={entry.label}
          languageField={
            <div className="demo-field">
              <div className="demo-field-head">
                <span className="demo-step" aria-hidden="true">1</span>
                <span className="demo-label">Language</span>
              </div>
              <div className="demo-langs" role="group" aria-label="Choose a language">
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
          }
        />
      </div>
    </div>
  )
}
