import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { askSappy, callSappyVoice } from '../lib/sappyClient'
import { canRecord, startRecording } from '../lib/audio'

// The floating "Ask Sappy" chat, fixed in the bottom-right corner of every
// page (index and 404). It is *the* Ask Sappy experience: a text conversation
// and a press-and-hold voice line into the same assistant — Whisper-small
// hears Filipino, the sapinsapin/sappy-ai Worker answers from the project
// knowledge base, and a Filipino corpus speaker reads the reply back aloud.
// The voice legs queue through spaceClient like the demo's own requests; the
// Worker leg is a single pointed GET. It is mounted by DeferredOrb a beat
// after paint so its chunk stays off the first-paint path.

const SUGGESTIONS = ['Ano ang SapinSapin AI?', 'Paano ako makakapag-ambag?', 'May bayad ba ang mga datos?']

// Native RMS voice activity, tuned on a desktop mic (see AGENTS.md). Speech
// enters only above VAD_ON and, once in, must fall below VAD_OFF for a full
// VAD_HANGOVER_MS — hysteresis, so a breath doesn't end a turn and a quiet
// word inside a phrase doesn't cut one off.
const VAD_ON = 0.02
const VAD_OFF = 0.012
const VAD_HANGOVER_MS = 700
const TAP_MS = 300

const PHASE_TEXT = {
  uploading: 'Contacting the demo Space…',
  transcribing: 'Transcribing your question…',
  searching: 'Sappy is searching the project knowledge base…',
  speaking: 'Reading the answer aloud in Filipino…',
}

const clamp = (text, limit = 240) =>
  typeof text === 'string' && text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text

let uid = 0
const nextId = () => `chat-${++uid}`

/* The launcher glyph: a chat bubble with a spark cut out of it. Filled in the
   button colour with fill-rule evenodd so the spark is a hole that shows the
   button's gradient through — one path, two reads, no extra colours. */
function ChatMark({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.7 8.7 0 0 1-3.1-.55L4 21l1.6-5.3A8.5 8.5 0 1 1 21 11.5Z
           M12 8.05 15.45 11.5 12 14.95 8.55 11.5Z"
      />
    </svg>
  )
}

/* Small spoken-reply player: a play/pause circle over a hidden audio element.
   Autoplays when a fresh reply bubble lands, and degrades to a tap when the
   browser (rightly) refuses the autoplay. */
function ChatReply({ blob, autoplay }) {
  const [url, setUrl] = useState(null)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef(null)

  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])

  useEffect(() => {
    if (autoplay && url) audioRef.current?.play().catch(() => {})
  }, [autoplay, url])

  useEffect(() => {
    const audio = audioRef.current
    const onEnd = () => setPlaying(false)
    audio?.addEventListener('ended', onEnd)
    return () => audio?.removeEventListener('ended', onEnd)
  }, [url])

  const toggle = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) audio.play().catch(() => {})
    else audio.pause()
  }, [])

  return (
    <div className="chat-reply">
      <audio ref={audioRef} src={url} preload="auto" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
      <button type="button" className="chat-replay" onClick={toggle} aria-label={playing ? 'Stop the spoken reply' : 'Play the spoken reply'}>
        {playing ? (
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5.5h3.4v13H7zM13.6 5.5H17v13h-3.4z" fill="currentColor" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.4 5.9a.9.9 0 0 1 1.4-.8l9 6a.9.9 0 0 1 0 1.5l-9 6a.9.9 0 0 1-1.4-.8Z" fill="currentColor" /></svg>
        )}
      </button>
      <span className="chat-reply-label">Sappy's spoken reply</span>
    </div>
  )
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [visible, setVisible] = useState(false)
  const [chat, setChat] = useState([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState('idle') // uploading | transcribing | searching | speaking
  const [error, setError] = useState(null)
  const [recorder, setRecorder] = useState(null)
  const recorderRef = useRef(null)
  const micRef = useRef(null)
  const startedAtRef = useRef(0)
  const vadRef = useRef({ speaking: false, lastSpeech: 0 })
  const controllerRef = useRef(null)
  const listRef = useRef(null)
  const inputRef = useRef(null)
  const launcherRef = useRef(null)
  const cardRef = useRef(null)
  const lastSpokenRef = useRef(null)
  const prevOpenRef = useRef(false)
  const id = useId()

  const push = useCallback((message) => setChat((list) => [...list, message]), [])

  // Swap the provisional "…" bubble for the question Whisper actually heard.
  const replaceLastUser = useCallback(
    (text) => setChat((list) => [...list.slice(0, -1), { ...list[list.length - 1], text }]),
    [],
  )

  // Follow the newest bubble as the conversation grows past the box.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chat, busy])

  useEffect(() => () => controllerRef.current?.abort(), [])
  useEffect(() => () => recorderRef.current?.cancel(), [])

  /* Visible exactly like the back-to-top control: hidden in the hero, present
     once the reader is past the first screen. An open card is never hidden —
     a dialog that evaporates because you scrolled is a dialog that stole your
     input. */
  useEffect(() => {
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        setVisible(window.scrollY > window.innerHeight * 0.6)
        frame = 0
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])

  /* Focus moves with the dialog: into the field when it opens, back onto the
     launcher when it closes — and Tab is trapped inside the card while it is
     open, so a keyboard user cannot tab out into the page behind it. */
  useEffect(() => {
    if (open) {
      inputRef.current?.focus({ preventScroll: true })
    } else if (prevOpenRef.current) {
      launcherRef.current?.focus({ preventScroll: true })
    }
    prevOpenRef.current = open
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const el = cardRef.current
    if (!el) return undefined
    const onKeyDown = (event) => {
      if (event.key !== 'Tab') return
      const focusables = Array.from(el.querySelectorAll('button:not(:disabled), input:not(:disabled), [href], textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'))
      if (!focusables.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    el.addEventListener('keydown', onKeyDown)
    return () => el.removeEventListener('keydown', onKeyDown)
  }, [open])

  /* One exchange, one lane. Text goes straight to the Worker; voice runs the
     whole pipeline — upload, whisper-small, the Worker, corpus TTS — in a
     single pass so the status line can tell the whole story, and Cancel can
     stop the whole thing. */
  const run = useCallback(
    async (question, { blob } = {}) => {
      if (busy) return
      const controller = new AbortController()
      controllerRef.current = controller
      setError(null)
      setBusy(true)
      setPhase('uploading')

      try {
        if (blob) {
          push({ id: nextId(), role: 'user', text: '…' })
          const heard = await callSappyVoice(blob, { signal: controller.signal, onPhase: setPhase })
          if (!heard.question) {
            push({ id: nextId(), role: 'sappy', text: 'I didn’t catch that — could you say it again, or type it?', caption: 'Nothing was transcribed' })
            return
          }
          replaceLastUser(heard.question)
          const loud = { id: nextId(), role: 'sappy', text: heard.answer, caption: heard.caption, blob: heard.blob }
          lastSpokenRef.current = loud.id
          push(loud)
          return
        }

        const text = (question ?? '').trim()
        if (!text) return
        push({ id: nextId(), role: 'user', text })
        const reply = await askSappy(text, { signal: controller.signal })
        push({
          id: nextId(),
          role: 'sappy',
          text: clamp(reply.answer),
          caption:
            reply.mode === 'project_rag'
              ? `Answered from the project knowledge base${Number.isInteger(reply.chunks) && reply.chunks > 0 ? ` · ${reply.chunks} referenced passages` : ''}`
              : 'Answered without a knowledge-base match',
        })
      } catch (caught) {
        if (caught?.kind === 'cancelled' || caught?.name === 'AbortError') return
        if (controllerRef.current === controller) {
          push({ id: nextId(), role: 'sappy', text: clamp(caught?.message ?? 'Something went wrong — try again.'), caption: 'Not answered' })
        }
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null
        setBusy(false)
        setPhase('idle')
      }
    },
    [busy, push, replaceLastUser],
  )

  const submit = useCallback(
    (event) => {
      event.preventDefault()
      if (busy) return
      const value = draft.trim()
      if (!value) return
      setDraft('')
      run(value)
    },
    [busy, draft, run],
  )

  const toggle = useCallback(() => setOpen((was) => !was), [])
  const close = useCallback(() => setOpen(false), [])

  const openAndAsk = useCallback(
    (text) => {
      setOpen(true)
      run(text)
    },
    [run],
  )

  const onComposeKeyDown = useCallback(
    (event) => {
      if (event.key === 'Escape') close()
    },
    [close],
  )

  /* --------------------------------------------- press-and-hold voice line */

  const finishRecording = useCallback(async () => {
    const handle = recorderRef.current
    if (!handle) return
    recorderRef.current = null
    setRecorder(null)
    // Anything under ~one breath is a tap, not a question: cancel it rather
    // than sending a sliver of noise down the transcribe path.
    if (Date.now() - startedAtRef.current < TAP_MS) {
      handle.cancel()
      return
    }
    try {
      const decoded = await handle.stop()
      if (decoded) run('', { blob: decoded.blob })
      else setError({ message: 'That recording could not be read.' })
    } catch (caught) {
      setError({ message: caught?.message ?? 'That recording could not be read.' })
    }
  }, [run])

  const beginRecording = useCallback(async () => {
    if (busy || recorderRef.current) return
    setError(null)
    startedAtRef.current = Date.now()
    vadRef.current = { speaking: false, lastSpeech: 0 }
    try {
      const handle = await startRecording({
        onTick: () => {},
        onLevel: (level) => {
          const node = micRef.current
          if (node) node.style.setProperty('--level', String(Math.min(1, level * 8).toFixed(3)))
          // Voice activity from the same AnalyserNode levels the pulse is
          // drawn with: speech enters above VAD_ON and, once in, must fall
          // below VAD_OFF before its silence counts — hysteresis. A full
          // VAD_HANGOVER_MS of real silence finalises the recording and the
          // answer follows on its own; lifting the finger does the same.
          const vad = vadRef.current
          if (vad.speaking) {
            if (level >= VAD_OFF) vad.lastSpeech = Date.now()
            else if (Date.now() - vad.lastSpeech >= VAD_HANGOVER_MS) {
              vad.speaking = false
              finishRecording()
            }
          } else if (level >= VAD_ON) {
            vad.speaking = true
            vad.lastSpeech = Date.now()
          }
        },
        // The cap finalises the recording itself, so the clip is delivered
        // here rather than leaving a dead "Stop" button in the compose row.
        onAutoStop: async (decoded) => {
          recorderRef.current = null
          setRecorder(null)
          if (decoded) run('', { blob: decoded.blob })
          else setError({ message: 'That recording could not be read.' })
        },
      })
      recorderRef.current = handle
      setRecorder(handle)
    } catch (caught) {
      recorderRef.current = null
      setRecorder(null)
      setError({ message: caught?.message ?? 'Recording could not start.' })
    }
  }, [busy, finishRecording, run])

  const onMicPointerDown = useCallback(
    (event) => {
      event.preventDefault()
      // Capture the pointer so releasing off the mic still ends the turn — a
      // finger slides as it lifts, and a hold-to-talk control that decides
      // "you let go somewhere else" is a control that cuts you off.
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId)
      } catch {
        /* no active pointer (e.g. a programmatic event) — release still works
           because we read the recorder handle, not the pointer */
      }
      beginRecording()
    },
    [beginRecording],
  )

  const onMicPointerUp = useCallback(() => finishRecording(), [finishRecording])

  const onMicKeyDown = useCallback(
    (event) => {
      if (event.key !== ' ' && event.key !== 'Enter') return
      event.preventDefault()
      if (busy) {
        controllerRef.current?.abort()
        return
      }
      beginRecording()
    },
    [beginRecording, busy],
  )

  const onMicKeyUp = useCallback(
    (event) => {
      if (event.key !== ' ' && event.key !== 'Enter') return
      event.preventDefault()
      finishRecording()
    },
    [finishRecording],
  )

  const recordable = canRecord()
  const status = PHASE_TEXT[phase] ?? null
  const shown = visible || open

  return (
    <div className="chat-root" data-visible={shown}>
      {open ? (
        <section className="chat-card" role="dialog" aria-label="Ask Sappy — chat" aria-modal="false" ref={cardRef}>
          <header className="chat-head">
            <div className="chat-head-brand">
              <span className="chat-avatar" aria-hidden="true"><ChatMark className="chat-avatar-glyph" /></span>
              <span className="chat-head-copy">
                <span className="chat-kicker">Ask Sappy</span>
                <span className="chat-sub">Answers from the project knowledge base · Filipino</span>
              </span>
            </div>
            <button type="button" className="chat-close" onClick={close} aria-label="Close chat">
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </button>
          </header>

          <div className="chat-body">
            <div className="sappy-history chat-history" ref={listRef} aria-live="polite">
              {chat.length === 0 && (
                <p className="sappy-welcome">
                  Ask in Filipino — type below, or hold the mic while you speak and let go
                  when you're done (a pause sends it on its own). Sappy answers from the
                  project knowledge base and reads the reply back aloud.
                </p>
              )}
              {chat.map((message) =>
                message.role === 'user' ? (
                  <div key={message.id} className="sappy-msg is-you">
                    <p className="sappy-msg-text">{message.text}</p>
                  </div>
                ) : (
                  <div key={message.id} className="sappy-msg is-sappy">
                    <p className="sappy-msg-text">{message.text}</p>
                    {message.blob && (
                      <ChatReply blob={message.blob} autoplay={message.id === lastSpokenRef.current} />
                    )}
                    {message.caption && <p className="sappy-caption">{message.caption}</p>}
                  </div>
                ),
              )}
              {busy && (
                <div className="sappy-msg is-sappy is-thinking" aria-hidden="true">
                  <span className="sappy-dot" />
                  <span className="sappy-dot" />
                  <span className="sappy-dot" />
                </div>
              )}
              {error && !busy && <p className="sappy-error" role="alert">{clamp(error.message, 220)}</p>}
            </div>
            {chat.length === 0 && !busy && (
              <div className="chat-suggest">
                <p className="chat-suggest-label">Subukan:</p>
                {SUGGESTIONS.map((text) => (
                  <button key={text} type="button" className="chat-chip" onClick={() => openAndAsk(text)}>
                    {text}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="chat-foot">
            {busy && status && (
              <p className="chat-status">
                {status}
                <button type="button" className="chat-cancel" onClick={() => controllerRef.current?.abort()}>Cancel</button>
              </p>
            )}
            {recorder && <p className="sappy-live-hint">Hold and speak — release to send, or let a pause do it.</p>}

            <form className="sappy-compose chat-compose" onSubmit={submit}>
              <label className="sappy-sr" htmlFor={`${id}-ask`}>Ask Sappy</label>
              <input
                id={`${id}-ask`}
                ref={inputRef}
                type="text"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onComposeKeyDown}
                placeholder="Magtanong sa Filipino…"
                autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                maxLength={220}
                disabled={busy || recorder}
              />
              <button
                type="button"
                ref={micRef}
                className={`sappy-mic ${recorder ? 'is-live' : ''}`}
                onPointerDown={onMicPointerDown}
                onPointerUp={onMicPointerUp}
                onKeyDown={onMicKeyDown}
                onKeyUp={onMicKeyUp}
                disabled={busy || !recordable}
                aria-label="Hold the mic and speak — release to send"
                title={recordable ? 'Hold to ask by voice — release to send (a silence also sends)' : 'Voice needs a microphone in this browser'}
              >
                <svg viewBox="0 0 24 24" className="sappy-mic-glyph" aria-hidden="true">
                  <rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
              <button type="submit" className="sappy-send" aria-label="Send message" disabled={busy || recorder || !draft.trim()}>
                <svg viewBox="0 0 24 24" className="sappy-send-glyph" aria-hidden="true"><path d="M12 20V5M5 12l7-7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </form>
          </div>
        </section>
      ) : (
        <button
          type="button"
          ref={launcherRef}
          className="chat-btn"
          onClick={toggle}
          aria-expanded={false}
          aria-haspopup="dialog"
          aria-label="Open the Ask Sappy chat"
        >
          <ChatMark className="chat-glyph" />
          {chat.length === 0 && (
            <span className="chat-tip" aria-hidden="true">Ask Sappy — magtanong sa Filipino</span>
          )}
        </button>
      )}
    </div>
  )
}