# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What this is

The public landing page for SapinSapin AI (https://huggingface.co/sapinsapin), an open
initiative building corpora, benchmarks, and models for Philippine-language AI. It is a
**static React + Vite + Tailwind build with no backend and no database** — every figure the
page shows is synced from the Hugging Face Hub at build time.
Live at https://sapinsapin-web.vercel.app.

The two runtime fetches live in the browser: the `sapinsapin/halohalo-dashboard` Gradio
Space (the three audio capabilities) and a small Cloudflare Worker, `sappy-ai`, that
answers plain-language questions about the project in Filipino. The Space powers the live
`#demo` section; the Worker powers the floating "Ask Sappy" chat that sits in the
bottom-right corner of **every** page. See "The live demo" below for why those are
allowed to do that when the catalog is not.

## Commands

```bash
npm install
npm run dev            # Vite dev server (default port 5173)
npm run build           # Static bundle → dist/
npm run preview         # Serve the built bundle locally
npm run sync             # Both syncs below, in order
npm run sync:catalog     # Dataset/model figures from the Hub API → src/data/hubSnapshot.js
npm run sync:space       # Demo language/voice/clip lists from the Space → src/data/spaceManifest.js
npm run prepare:map      # Regenerate hero map geometry from public boundary data
npm run prepare:icons    # Rasterise the brand mark to PNG favicons
npm run prepare:brand    # Social banners and profile pictures → brand/<platform>/ (needs Chrome)
npm run check:csp        # Assert every inline script is hashed and both runtime origins are in connect-src
```

There is no test suite and no lint script configured in `package.json`.

**Always run `npm run sync` before a deploy build.** It rewrites `src/data/hubSnapshot.js`,
the single source for every count, download figure, task label, and date on the page, and
`src/data/spaceManifest.js`, the demo's language/voice/clip lists:

```bash
npm run sync && npm run build
```

## Architecture

### The data pipeline (the core thing to understand)

```
scripts/sync-catalog.mjs   →   src/data/hubSnapshot.js   (generated, do not edit by hand)
                                        ↓
                                 src/data/catalog.js       (editorial copy + merge)
                                        ↓
                                     the page (App.jsx)
```

- `scripts/sync-catalog.mjs` hits the public Hub API for the `sapinsapin` org and writes
  `src/data/hubSnapshot.js`. This runs at **build time**, not in the browser, because the
  Hub API responds with `access-control-allow-origin: https://huggingface.co`, which blocks
  a client-side fetch from `sapinsapin.ai` via CORS. There is no proxy or serverless
  function — syncing on build is the deliberate tradeoff.
- `src/data/catalog.js` holds hand-written descriptions/kickers and merges in every number
  (counts, downloads, tasks, dates, gated flags) from the generated snapshot, so prose and
  figures can't drift apart. Fields the Hub doesn't state are marked `{{VERIFY}}` or "Not
  stated on the Hub" rather than guessed — never fill these in from a repo name, tag, or
  sibling model.
- `downloads` is the Hub's **30-day** figure (matches the org's dashboard Space label
  "Downloads (30d)"). Keep the "30d" wording wherever the number appears.
- `src/data/hubSnapshot.js` and `src/data/philippinesMapPaths.js` are generated — never
  hand-edit them; regenerate via `npm run sync` / `npm run prepare:map`.

### Layout

```
index.html                   Homepage document
404.html                     Error document — see "The 404 page" below
scripts/
  sync-catalog.mjs        Hub API → hubSnapshot.js (run before deploy)
  sync-space.mjs           Space config → spaceManifest.js (run before deploy)
  prepare-map.mjs          GeoJSON → simplified SVG paths + projected anchors
  prepare-icons.mjs        Brand mark → apple-touch-icon.png, favicon-32.png
src/
  components/
    Icons.jsx              Inline SVG icon set and the brand mark
    ThemeToggle.jsx         The sun/moon button, shared by both page roots
    PhilippinesMap.jsx      Hero map, bearing dial, language readout
    SpeechConsole.jsx       The live demo: the three audio capabilities, lazy-loaded
    ChatWidget.jsx          The floating "Ask Sappy" chat — text and press-and-hold voice — bottom-right of both pages, lazy-loaded
    DeferredOrb.jsx         Mounts a lazy chunk on the earlier of a beat or the first interaction
    SignalTrace.jsx         404 only: the requested URL drawn as a waveform
  lib/
    theme.js                useTheme() — palette state and the view-transition wipe
    spaceClient.js          Every call to the Space — queue, prep, errors
    audio.js                 Decode/resample/encode to 16 kHz mono WAV
  data/
    catalog.js              Editorial copy, merged with the live snapshot
    hubSnapshot.js           Generated — do not edit by hand
    modelNotes.js            Plain-language descriptions for model hover cards
    philippinesMapPaths.js   Generated — do not edit by hand
    spaceManifest.js         Generated — do not edit by hand
  main.jsx                   Entry for index.html
  entry-404.jsx              Entry for 404.html
  App.jsx                    All page sections, nav, theming, citations (single file)
  NotFound.jsx               The 404 page root: nav, error panel, recovery, footer
  index.css                  Design tokens, both themes, component styles
```

`App.jsx` is one file containing every section as its own function component (`Hero`,
`Demo`, `Problem`, `Impact`, `Datasets`, `Models`, `Openness`, `Contribute`,
`PartnersAndFaq`, `Footer`, plus shared helpers like `Cite`, `Reveal`, `CountUp`, `Nav`)
rather than being split into per-file components. Follow that convention rather than
introducing a new components directory for section content. `PhilippinesMap.jsx` and
`SpeechConsole.jsx` and `ChatWidget.jsx` are the exceptions and not a precedent for splitting
sections: all three are self-contained interactive widgets, and the prose around them still
lives in `Hero()` / `Demo()` (the chat keeps its description in "The floating chat" below).

`NotFound.jsx` is not an exception to that rule either — it is a **second page root**, a
sibling of `App.jsx` rather than a piece of it, and it follows the same one-file convention
for its own sections. The only things genuinely shared between the two roots live in
`components/Icons.jsx`, `components/ThemeToggle.jsx` and `lib/theme.js`; anything else
either page needs should be written where that page lives.

### The live demo

`SpeechConsole.jsx` runs the org's speech models — transcribe, synthesize, convert voice —
against the `sapinsapin/halohalo-dashboard` Space, in the browser, with no proxy. Four facts
about that Space drive the whole design. All four were measured, not read off the docs; the
Space's own API page is wrong about the third.

1. **It permits any origin.** The Space reflects whatever `Origin` asks, on `/config`,
   `/gradio_api/*`, the upload route and the file route. This is the opposite of the Hub API
   (which pins the header to huggingface.co and forces the build-time catalog sync), so the
   demo may call it directly while the catalog may not. Different reason, different answer —
   don't "fix" one to match the other.

2. **It cannot do concurrency.** Two requests in flight at once leave it waiting on a session
   it never finishes, and a few of those make it stop answering for about a minute.
   `spaceClient.js` therefore runs a single FIFO queue with exactly one request in flight;
   waiting jobs report their place rather than appearing stalled. Never call it in parallel,
   including from build scripts.

3. **Dropdown values are validated per session, against a cursor.** Gradio keeps one live
   choice list per dropdown per session, and a fresh session only knows the default
   language's (Cebuano's) lists. The Space's language-change handlers are exposed to the API
   under their internal names and are the only way to move those lists: `/_on_lang` fills the
   Transcribe tab's clip and model dropdowns in one call, `/lambda` fills the Synthesize tab's
   voice dropdown. So `/synthesize` rejects a Bikol voice unless `/lambda(Bikol)` ran in that
   session first — and preparing Bikol, then Waray, makes Bikol invalid again. Preparation is
   a cursor, not a cache: `withTranscriptInputs` / `withPrepared` re-run it whenever the
   cursor has moved, inside the same queue slot as the call they protect. `/convert` needs
   none of this — its target-voice dropdown holds every option already.

4. **It runs on free cpu-basic.** Roughly 8–20s warm, and the first use of a model loads its
   weights first — from about a gigabyte for whisper-small and the 1B CTC heads up to ~6 GB
   for whisper-large-v3 (cold loads measure roughly 168s / 230s / 364s respectively). Warmth
   is tracked per language *and* model for ASR. The UI states this up front, holds the
   result's height from the moment a job starts, and only blames a model download once a
   request has outlasted any warm one — warmth is tracked in memory, so a fresh page load
   cannot tell a cold model from a busy Space. Voice conversion is one language-independent
   model, so one run warms it for every language.

`spaceManifest.js` exists only so the controls can render before any request; the Space's own
`choices` outrank it at call time, so drift there degrades to a stale first paint rather than
a failed call. `sync-space.mjs` failing is the signal that the Space's shape changed.

"Ask Sappy" is not a demo capability. The demo is exactly three audio capabilities
 (synthesize, transcribe, convert voice), and Ask Sappy lives entirely in the floating
 bottom-right chat that sits on every page. The Worker is why the chat is only partly
 observable from this repo — the endpoint contract is enforced at call time (any non-`200`
 or malformed body becomes a "could not be answered" bubble, never a thrown border-radius).
 The chat pins Filipino: the voice input is transcribed with whisper-small (the cheapest
 warm model), and only the Worker's live `meta` (tuned languages + TTS model id) decides
 what happens next. A question from a language outside `meta.languages` fails in `meta`'s
 own plain text rather than being guessed from the repo contents — never fill that in from
 the model table.

 `ChatWidget.jsx` enables the mic only when `canRecord()` reports it can record (insecure
 origins and blocked permissions keep it disabled with a hint, since the voice route
 requires the real microphone): the mic button degrades to a disabled state instead of a
 dead click.

 The chat's voice assistant is **press-and-hold, not push-to-talk**: press the mic, speak,
 and release to send — or keep holding and let a real silence end the turn. The mic takes
 `pointer capture` on press, so a finger that slides off it as it lifts still counts as a
 release, and a press shorter than `TAP_MS` (300ms) is a tap and is cancelled rather than
 sent as a sliver of noise. End-of-utterance is detected with the browser's **native RMS
 meter**, not a model: `connectMeter` in `audio.js` feeds `onLevel`, and `ChatWidget`
 turns that level into a decision with hysteresis — speech enters only above `VAD_ON`
 (0.02) and, once in, must fall below `VAD_OFF` (0.012) before its silence counts, for a
 full `VAD_HANGOVER_MS` (700ms), at which point the recording finalises itself and the
 answer pipeline takes over (the hold is the earlier way to send). The same level drives
 the mic's live ring (`--level` on `.sappy-mic.is-live`) and a hint bar explains the
 gesture. A hold that never rises above the floor sends ~0.7s of near-silence, which the
 chat answers with its ordinary "I couldn't understand the question" turn.

 A finished recording runs through `callSappyVoice` in `sappyClient.js`, one exchange end
 to end: upload the WAV, hear it with whisper-small, ask the Worker, and read the answer
 back aloud with the Filipino corpus voice — returning the heard question, the answer, its
 caption, and the spoken reply as a blob. The three Space legs queue through `spaceClient`
 like any other demo request, on purpose: the floating chat and the demo share one lane,
 so the two never double up on the Space's single session. A recording that decodes to
 nothing arrives as `{ question: '' }` and becomes the ordinary "didn't catch that" turn
instead of sending near-silence down the model path. Transaction state lives in the
  send button, not a status line: while an exchange runs, the send control becomes a
  Stop control (a filled square in the same circular button) that aborts the whole
  pipeline — so there is no separate status strip above the compose row to grow or
  forget. The reply bubble lands in the history, and autoplays once, when it's done.
  Every Sappy reply carries Copy / Share chips under the bubble: Copy puts the answer
  on the clipboard (with an execCommand fallback for non-HTTPS previews), and Share
  hands it to the Web Share API when the browser has one, so the answer can leave the
  card on a phone's share sheet.

 #### The floating chat ("Ask Sappy")

 `ChatWidget.jsx` floats the "Ask Sappy" chat in the bottom-right corner of **both** pages
 (index and 404; `DeferredOrb.jsx` mounts it on the earlier of a beat or the first interaction). It is the whole
 Ask Sappy experience — the demo has no chat tab at all. It carries a text conversation
 (one pointed call to the Worker) side by side with the press-and-hold voice line above,
 and plays Sappy's spoken reply back in the bubble it lands in. Its controls: a launcher
 bubble whose one-line invitation appears on hover or keyboard focus, a panel that opens
 into a card, a suggestion-chip row before the first ask, and a compose row with field,
 mic and send.
 The card reuses the demo's `.sappy-*` conversation classes for the bubbles and its own
 `.chat-*` shell and controls. `Escape` closes it, Tab is trapped inside the card while it
 is open, and focus returns to the launcher when it closes. The 404 mount is why the
 widget lives in `components/` like every other thing shared between the two roots.

 Stacking is deliberate: the chat owns the corner at `z-index: 45` — below the sticky nav
 (`z-50`) — and the back-to-top control (`z-40`) stacks **above** it, offset by the
 launcher's drawn height so the two can never collide. Both controls hide in the hero and
 only ever appear beneath it, on the same `scrollY > 0.6 * innerHeight` threshold in both
 components; an open chat card is never hidden. The back-to-top is *directional* on top of
 that: it rises out of the launcher while the reader scrolls **down** and sinks back into
 it while they scroll **up** (a 4px dead zone stops jitter from flapping it), so the corner
 reads as one object rather than two independent widgets. Mounting is why the chat no
 longer trails the back-to-top: `DeferredOrb` still keeps the chat chunk off the first
 load, but the beat is now the earlier of the timer *or the visitor's very first scroll,
 click or keypress* — a scroll that pushes past the hero therefore mounts the widget and
 flips both `data-visible`s on the same event. `check-csp.mjs` allows both runtime origins
 in `connect-src` (Space and Worker): the chat calls both — Space for the voice legs,
 Worker for the question — and the demo calls the Space; keep both listed if either origin
 changes.

#### What updates on its own, and what does not

The demo is only partly self-healing, and the split is deliberate — knowing which half a
change falls in tells you whether it needs a deploy.

| If the Space changes… | The site… |
|---|---|
| a **clip** is added, renamed or removed | corrects itself — refreshed from `/_on_lang` when the dropdown is focused |
| a **voice** is added, renamed or removed | corrects itself — refreshed from `/lambda`, and a selection that no longer exists falls back to a real one instead of failing at submit |
| a **model** is added, renamed or removed | corrects itself — refreshed from `/_on_lang`, and a selection that no longer exists falls back to the first real one instead of failing at submit |
| an **output shape** changes | keeps working — every result is read positionally through `pick()` with fallbacks |
| the Space **restarts** and forgets the session | recovers — one silent retry on a fresh session |
| a **language** is added | ignores it until `npm run sync`; the model badge is dropped rather than printed as `…-undefined` |
| a **language** is removed | still offers it, and that language's requests fail — needs a sync |
| an **endpoint** is renamed | breaks entirely — needs code, not a sync |
| the **target-voice** list changes | needs a sync (it is only read from the config, never refreshed) |

| If the Worker changes… | The site… |
|---|---|
| a **language** is added to `meta.languages` | uses it automatically — the chat follows the Worker's live `meta` |
| a **language** is removed from `meta.languages` | still offers it until the Worker's `meta` next says otherwise — the chat falls back |
| the **meta contract** or the `answer` shape changes | the site degrades to bubbles instead of failing — every Worker response is read defensively |
| the **Worker** returns something that is not a string | substituted with a "could not be answered" bubble, never an exception |

The lazy refreshes fire on focus rather than on mount on purpose: requests are serialised
one at a time, so confirming lists eagerly would put two round trips ahead of whatever the
visitor actually pressed.

Run `npm run sync` before any deploy and the first four rows never come up. If the Space is
asleep at build time the sync fails loudly — the committed manifest is still on disk, so
`npm run build` alone will still produce a working site with slightly stale lists.

`npm run check:space` asserts the facts above against the live Space — CORS, the six
endpoints and their parameter order, manifest agreement, and that session-scoped choices are
still required. It is the closest thing here to a test for the demo; run it in CI or before a
deploy. It fails with the specific fact that moved, and its last two checks would start
failing if Gradio ever stopped scoping choices per session, which is the signal that
`spaceClient.js` could be simplified.

#### Three rules that are easy to undo by accident

- **Never use `AbortSignal.timeout` in browser code here.** It is throttled once a tab is
  hidden — measured at 22x late on a backgrounded page, where `setTimeout` stayed accurate.
  A request whose budget never fires holds the cross-tab lock with it. `deadline()` in
  `spaceClient.js` exists for this; the build scripts are Node and may use either.
- **Every queue slot must end.** `watchdog()` bounds one at 210s — above the shared 180s
  request budget — unless the job declares a bigger ceiling. The large ASR models do:
  cold loads run ~360s for whisper-large-v3, so `transcribe` scales its budget with the size
  in the model's dropdown label (`models` in `spaceClient.js`) and its slot ceiling to
  `budget + 60s`. Without the watchdog a single stuck request closes the queue *and the
  cross-tab lock* for the life of the page, in every tab — which is a dead demo, not a slow
  one. Keep the default ceiling above any budget that does not self-declare.
- **Recording finalises itself at the cap.** Calling `recorder.stop()` alone leaves the
  microphone track live and the browser's recording indicator lit for a recording that has
  already ended, until the visitor presses a button that no longer does anything.

#### Not verified here

Everything above was exercised in Chrome, including the webm→WAV path (driven through a real
`MediaRecorder` fed by an oscillator, so no microphone permission is needed — see the pattern
if you want to re-run it). **Safari and iOS have never been tested**, and they are exactly
where the untested branches live: the `decodeAudioData` callback form, MediaRecorder's
mp4/aac output, `audio/wav` re-typing, and iOS's gesture requirement for `AudioContext`. The
`resample` linear-interpolation fallback has also never executed, since `OfflineAudioContext`
works in Chrome. The floating chat's press-and-hold line adds two more untested branches:
the press-and-talk gesture itself (`pointer capture` + hold-release on the chat's Ask Sappy
mic) has only been exercised with a mouse, and the `VAD_ON`/`VAD_OFF`/`VAD_HANGOVER_MS`
thresholds are tuned on a desktop mic — a loud environment or a phone held close could make
the meter behave differently. Worth a pass on a real device before treating those as sound.

The same caveat covers the mobile pass described under "Mobile and touch" below: the layout,
overflow and hit-target work was measured in a mobile Chromium emulation across 320–1440px
in both orientations, which is enough to catch a bar that does not fit or a field that would
trip Safari's zoom, and is not the same as a real handset. Three things emulation cannot
answer: whether iOS really leaves the viewport alone at 16px, whether the
`env(safe-area-inset-*)` padding lands where the notch and the home indicator actually are,
and how the map, the demo, and the chat widget feel under a thumb.

The console is lazy-loaded and gated on approaching the viewport, so it stays off the
first-paint path and a visitor who never scrolls never contacts the Space at all. Feedback
(`/_fn*`) is deliberately left unwired — anonymous landing-page traffic would pollute the
Space's rating store; the "Open in the Space" link is the path for people who want to rate.

### The 404 page

`404.html` is a **second Vite entry**, not a client-side route. That is the whole reason it
works: the site is static with no router and `vercel.json` adds no rewrite, so an address
that does not resolve is a real miss — Vercel answers it with `dist/404.html` and a real
`404` status, and the address bar still holds what the visitor asked for. A catch-all
rewrite to `index.html` would break all three of those at once. Do not add one.

`src/NotFound.jsx` reads that address and does three things with it, none of which touch
the network — the page contacts nothing at all, which is worth keeping true:

1. **Quotes it back.** "Page not found" without saying *which* page leaves the reader
   unable to tell a typo from a dead link. Printed through `readRequestedRoute()`, which
   strips control characters and caps the length; React escapes it on the way into the DOM.
2. **Draws it** (`SignalTrace.jsx`). The URL is hashed (FNV-1a) into a seeded PRNG and
   shaped into a speech-like waveform, then swept once as if it were being transcribed —
   ending in `NO TRANSCRIPT`, with the tint draining back out of the read half. It is
   deterministic, so the same bad link always draws the same trace. The card says in plain
   words that it is not audio and that nothing was sent anywhere; a speech project drawing
   a waveform on an error page owes the reader that.
3. **Guesses what was meant.** A `destinations` table is ranked against the address with a
   small fuzzy scorer (whole-string subsequence, plus a per-word substring pass so that
   `/whisper-small-pld-fil` still finds the model catalog), and the search field is
   pre-filled with the words from the failed path. Below `MATCH_FLOOR` the page shows the
   full directory rather than an empty list — a search on an error page that answers
   "nothing found" has failed twice.

The field takes `/` and `⌘K`, and `↓`/`↑` move real focus between the results rather than
faking a listbox with `aria-activedescendant` pointing at anchors. `Enter` only commits
when there is a genuine ranked best answer.

When adding a section to the homepage, add it to `destinations` too — otherwise the 404 can
never suggest it. Sections use `/#id` hrefs, which is why the 404 nav carries no anchor
links of its own and no sliding indicator pill: every link here is a cross-document jump.

### Theming

Colors are CSS custom properties holding space-separated RGB channels, switched via
`[data-theme=dark]` on the root:

```css
:root             { --c-ink: 26 22 19; --c-paper: 251 247 240; /* … */ }
[data-theme=dark] { --c-ink: 240 233 222; --c-paper: 18 16 13; /* … */ }
```

`tailwind.config.js` maps its color scale onto those variables (`ink`, `paper`, `ube`,
`pandan`, `cream`, `surface`, `line`), so ordinary utilities like `text-ink/70` follow the
active theme with no `dark:` prefixes anywhere in the markup.

Tailwind only emits a color-opacity modifier (e.g. `/68`) when the value exists in
`theme.opacity`, and the default scale skips most integers. `tailwind.config.js` defines
every integer 0–100 to prevent alpha utilities from silently producing no rule. If you add a
new alpha value in markup, verify it actually renders.

Theme switching uses the View Transitions API for a circular wipe from the toggle, falling
back to a short color-only crossfade elsewhere; both respect `prefers-reduced-motion`. The
footer and the code sample stay dark in both themes and carry their own tokens and
`::selection` colors.

### Mobile and touch

Everything phone- and tablet-specific lives in one unlayered block near the bottom of
`index.css`, headed **"Touch and small screens"**. Unlayered is deliberate: these rules
have to beat Tailwind utilities in the markup (`px-4`, `h-7`, `pt-28`), and anything inside
`@layer components` loses to a utility regardless of specificity — the same reason the
dark-mode refinements above it are unlayered.

Three rules govern what goes in there.

- **Hit targets and control sizing key off `(pointer: coarse)`, not width.** A finger is the
  same size on a 360px phone and a 1024px tablet, and a 700px-wide desktop window is still
  driven by a mouse. Width media queries are for questions that really are about room —
  how many columns fit, how much padding a section can afford.
- **Nothing is hidden or shrunk away.** The phone page is shortened by compacting spacing
  and by putting long lists behind a control, never by dropping a figure, a license, or a
  caption the desktop page shows.
- **Safe-area insets are additive.** `env(safe-area-inset-*)` resolves to `0px` in portrait
  on a device without a notch, so every rule using them is a no-op there.

Four things are easy to undo by accident:

- **Form controls are 16px on touch, in literal pixels.** Mobile Safari zooms the viewport
  when a field under 16px takes focus and does not zoom back out when the field is left —
  the visitor is stranded at 1.4x on a page that fit a moment ago. `1rem` is not a
  substitute: Safari's threshold is absolute, so a visitor with a smaller default font size
  would still be zoomed. The other way to stop it, `maximum-scale=1` in the viewport tag,
  buys the same behavior by taking pinch zoom away from everyone who needs it — hence
  `viewport-fit=cover` and nothing else in both documents' viewport meta.
- **The demo's text fields turn autocorrect and spellcheck off.** A phone keyboard set to
  English rewrites Cebuano and Waray as they are typed, so the model would be handed a
  sentence the visitor never wrote — and the red underline under every word of a Philippine
  language is that same mistake made visible.
- **The horizontal nav links appear at `lg`, not `md`.** Between 768px and about 845px the
  bar cannot hold five links, two icon links and the call to action; below `lg` the same
  five destinations are in the menu panel. Under 380px the theme toggle moves into that
  panel too — `.nav-bar-toggle` in the bar and `.nav-menu-theme` in the panel are the same
  control, and CSS shows exactly one, so only one is ever in the tab order.
- **`.demo-placeholder` has a height per breakpoint.** The mounted console's tallest tab is
  761px at the desktop breakpoint and 1133px at 320px (the Transcribe tab — the only one with
  three dropdowns plus a full audio-source row — defines every figure), with the touch
  reservation heavier on a phone. One number left the phone with a jump the moment the lazy
  chunk landed, which is the jump the placeholder exists to prevent. Re-measure the mounted
  console before changing any of them.

The dataset grid opens at three cards on a phone with a "Show all" control, the way the
model table already holds itself at five. That is behavior, not styling, so it is a
`useMediaQuery('(max-width: 639px)')` in `App.jsx` rather than CSS — and it is subscribed,
not read once, so rotating the phone re-renders instead of leaving the page in the other
layout's mode. Wider viewports never see the button.

The audit that drove all of this is worth repeating after a layout change: drive the built
site in a mobile Chromium context and assert three things at 320/360/375/390/414/768 —
`document.documentElement.scrollWidth === window.innerWidth` (no horizontal overflow),
no `input`/`select`/`textarea` with a computed `font-size` under 16px, and no interactive
element under 44px tall. Also switch through all three demo tabs (and the Voice conversion
tab's three audio sources) and open the floating chat's card at the same widths — its
controls carry their own 16px/44px coarse rules (`.chat-compose input`, `.chat-close`,
`.chat-chip`, and a 3.75rem `.chat-btn`), and the fixed launcher must not pick a corner
collision with `.back-to-top` at 320px. Check both knight controls hide in the hero and
reappear once the page is scrolled, and that the back-to-top emerges from the launcher on
a downward scroll and sinks back into it on an upward one.

Two things about that audit are easy to get wrong.

- **Load the real webfonts before measuring.** A headless run usually cannot reach
  fonts.googleapis.com, so it silently measures the metric-matched fallbacks instead —
  and those match Inter exactly only at weight 400. The nav bar is the tightest row on the
  page and its wordmark is weight 600, where real Inter is about 12px narrower than the
  Arial re-cut. Fetch the stylesheet and its woff2 files, inline them as `data:` URIs, and
  inject the result with `addStyleTag` before taking any measurement. Both states currently
  fit, with 18px of headroom at 320px in the worse of the two.
- **`nav.scrollWidth` reads two pixels under the box width when nothing overflows** — that
  is the 1px border on each side, not a two-pixel margin. Overflow is `scrollWidth` clearly
  *above* the box width; anything at box − 2 is fine. Measure real headroom by subtracting
  the children's widths and gaps from the padding box instead.

### The hero map

`scripts/prepare-map.mjs` downloads a public Philippine boundary, simplifies it, and
projects it with an equirectangular projection using a `cos(midLat)` correction on
longitude — both axes share one scale (scaling independently stretches the archipelago by
~14%). Language markers in `PhilippinesMap.jsx` are projected through that **same**
transform from real coordinates, so markers can't drift from the geography. Marker area is
proportional to that language's 30-day model downloads (radius scales with the square
root). The bearing dial keeps a fixed north mark and rotates only a separate pointer that
tracks the active language layer (click to step forward, right-click to step back).

### Citations

Research claims carry numbered markers linking to a references block in `App.jsx`
(`References`/`Cite`). Pointer users get a hover card; everyone else follows the link.
Sources are listed in `ATTRIBUTION.md` alongside map and model-description provenance. Keep
citations sparse — one on every sentence reads as noise, not rigor.

## Deployment

Vercel builds from `main` using `vercel.json`. Pushing to `main` deploys. The only manual
step is running `npm run sync` beforehand so the committed snapshot is current.

The build emits two documents: `dist/index.html` and `dist/404.html`. Vercel serves the
second for any path that does not resolve to a file, with a `404` status — which depends on
there being no catch-all rewrite in `vercel.json`. After a deploy, `curl -I` any nonsense
path to confirm it still answers `404` rather than `200`.

### The sappy-ai Worker (the floating chat's backend)

The Worker lives at `worker/src/index.js` with its config in `worker/wrangler.toml` and
deploys with Wrangler (no SSH — Cloudflare has none):

```bash
cd worker && npx wrangler deploy
```

Auth is `wrangler login` (OAuth stored on this Mac in
`~/Library/Preferences/.wrangler/config/default.toml`); if that state is missing, run
`wrangler login` once and click Allow in the browser. The toml mirrors the deployed
config exactly: the Workers AI binding (`[ai]` → `env.AI`), the AI Search instance
(`SAPPY_KNOWLEDGE` → `sappy-knowledge`), and three plain vars (Discord application id,
guild id, public key). `DISCORD_BOT_TOKEN` is a Cloudflare **secret** — it is not in the
toml, it survives `wrangler deploy` untouched, and it is re-set with
`echo <value> | npx wrangler secret put DISCORD_BOT_TOKEN`. Do not "helpfully" move a
secret into the toml. Before the first deploy of a changed toml, run
`wrangler deploy --dry-run` and diff its "has access to the following bindings" table
against what is described here — a binding missing from the toml is silently detached.

The Worker itself serves the five CORS headers the site needs (origin-pinned
`access-control-allow-origin`, `vary: Origin`, allow methods/headers), so checking CORS
is a curl, not a dashboard setting. After any deploy, verify the round trip:

```bash
curl -s -D - -H "Origin: https://sapinsapin-web.vercel.app" \
  "https://sappy-ai.primary-bd7.workers.dev/?q=Ano%20ang%20SapinSapin%20AI%3F"
```

Expect `200` + `access-control-allow-origin: https://sapinsapin-web.vercel.app` + a JSON
body with an `answer` key. Keep the workers.dev origin in the site's CSP `connect-src`
(check-csp) in step with any origin change here.
