import { useEffect, useMemo, useRef, useState } from 'react'
import { Anchor, ArrowLeft, ArrowUpRight, Github, HuggingFace, Mark } from './components/Icons'
import SignalTrace from './components/SignalTrace'
import ThemeToggle from './components/ThemeToggle'
import { useTheme } from './lib/theme'

/* The 404 document. A separate Vite entry rather than a client-side route:
   the site is static with no router, so Vercel serves dist/404.html for any
   address that does not resolve — which means the browser's URL, and the HTTP
   status, are both still the ones the visitor actually asked for.

   Design brief: an error page here should do more than apologise. It reads the
   address that failed, draws it (SignalTrace), and then tries to work out what
   the visitor meant — entirely in the browser, with no network of any kind. */

const hub = 'https://huggingface.co/sapinsapin'
const github = 'https://github.com/sapinsapin'
const space = 'https://huggingface.co/spaces/sapinsapin/halohalo-dashboard'

/* Everywhere a visitor could reasonably have been heading. `keywords` exist to
   be matched against, not displayed: they carry the words that appear in real
   mistyped links (repo names, model families, the words people search for)
   which the titles alone would miss. */
const destinations = [
  {
    id: 'home', kind: 'page', title: 'Homepage', href: '/',
    blurb: 'The whole project on one page — datasets, models, the demo, and how to contribute.',
    keywords: ['home', 'index', 'start', 'landing', 'main', 'sapinsapin', 'about'],
  },
  {
    id: 'demo', kind: 'section', title: 'Live speech demo', href: '/#demo',
    blurb: 'Transcribe, synthesise, and convert voice in ten Philippine languages, straight from the browser.',
    keywords: ['demo', 'try', 'speech', 'asr', 'tts', 'transcribe', 'synthesis', 'voice conversion', 'halohalo', 'dashboard', 'playground', 'inference'],
  },
  {
    id: 'work', kind: 'section', title: 'Data collections', href: '/#work',
    blurb: 'Every dataset in the catalog with its size, license, and 30-day downloads.',
    keywords: ['datasets', 'data', 'corpus', 'corpora', 'collections', 'pld', 'bantaywika', 'filipinospeechcorpus', 'philippine language dataset', 'download', 'halohalo', 'halo', 'text', 'tokens', 'pretraining'],
  },
  {
    id: 'models', kind: 'section', title: 'Models', href: '/#models',
    blurb: 'The public catalog — speech recognition, text-to-speech, voice conversion, and language models.',
    keywords: ['models', 'model card', 'whisper', 'speecht5', 'llama', 'gpt oss', 'weights', 'checkpoints', 'finetune', 'balitanlp', 'bikollm', 'bikol llm', 'qwen', 'llm', 'text generation', 'language model'],
  },
  {
    id: 'open', kind: 'section', title: 'Why open', href: '/#open',
    blurb: 'What is published, what is held back, and the reasoning behind both.',
    keywords: ['open', 'openness', 'open source', 'license', 'licence', 'licensing', 'terms', 'ethics', 'governance'],
  },
  {
    id: 'contribute', kind: 'section', title: 'Contribute', href: '/#contribute',
    blurb: 'How to record, review, or improve the corpus — and where to raise a proposal.',
    keywords: ['contribute', 'contributing', 'join', 'help', 'volunteer', 'community', 'contact', 'support', 'issues'],
  },
  {
    id: 'faq', kind: 'section', title: 'Partners and FAQ', href: '/#faq',
    blurb: 'Licensing, commercial use, update cadence, roadmap, and the research partners behind the work.',
    keywords: ['faq', 'questions', 'partners', 'commercial', 'roadmap', 'up diliman', 'dsp', 'research'],
  },
  {
    id: 'hub', kind: 'external', title: 'Hugging Face organisation', href: hub,
    blurb: 'The source of record for every dataset and model figure shown on this site.',
    keywords: ['hugging face', 'huggingface', 'hub', 'hf', 'org', 'repository', 'repo'],
  },
  {
    id: 'space', kind: 'external', title: 'halohalo Space', href: space,
    blurb: 'The Gradio Space the demo calls, with feedback and rating built in.',
    keywords: ['space', 'spaces', 'gradio', 'halohalo', 'app'],
  },
  {
    id: 'github', kind: 'external', title: 'GitHub', href: github,
    blurb: 'Source, issues, and discussions.',
    keywords: ['github', 'git', 'code', 'source', 'issues', 'pull request', 'readme'],
  },
]

const kindLabel = { page: 'Page', section: 'On the homepage', external: 'Leaves the site' }

/* The address that failed, made safe to print. React escapes it on the way
   into the DOM, so this is about legibility rather than injection: control
   characters and stray whitespace would otherwise render as gaps, and a
   pathological URL would push the layout around. */
function readRequestedRoute() {
  const { pathname = '/', search = '' } = window.location
  let raw = `${pathname}${search}`
  try { raw = decodeURIComponent(raw) } catch { /* Malformed escapes print as-is. */ }
  const clean = raw.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').replace(/\s+/g, ' ').trim()
  if (!clean || clean === '/') return '/'
  return clean.length > 96 ? `${clean.slice(0, 95)}…` : clean
}

const normalise = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()

/* How much of the query appears, in order, inside a candidate. A plain
   substring test would miss `/mdls` and `/model-cards` alike; a subsequence
   forgives both dropped letters and extra ones. Contiguity is scored
   separately so that a candidate containing the letters *together* outranks
   one that merely contains them somewhere. */
function subsequenceScore(query, candidate) {
  let cursor = 0
  let matched = 0
  let run = 0
  let contiguous = 0
  for (const char of query) {
    const at = candidate.indexOf(char, cursor)
    if (at === -1) { run = 0; continue }
    run = at === cursor ? run + 1 : 0
    contiguous += Math.min(run, 5)
    cursor = at + 1
    matched += 1
  }
  const coverage = matched / query.length
  const flow = contiguous / (query.length * 5)
  return coverage * 0.72 + flow * 0.28
}

function scoreDestination(query, destination) {
  if (!query) return 0
  const fields = [destination.title, ...destination.keywords]
  let best = 0
  for (const field of fields) {
    const candidate = normalise(field)
    if (!candidate) continue
    // An outright substring is a different class of evidence from a scattered
    // subsequence, so it floors the score rather than competing with it.
    const score = candidate.includes(query)
      ? 0.82 + Math.min(1, query.length / candidate.length) * 0.18
      : subsequenceScore(query, candidate)
    if (score > best) best = score
  }
  // One recognisable word buried in a long path — /whisper-small-pld-fil, or
  // /api/v1/transcribe — is the most common dead link there is, and scoring
  // only the whole string buries it under the noise around it. So each word is
  // also tried alone. Substring rather than subsequence, and three characters
  // minimum: a loose match on a two-letter fragment finds something in
  // everything, which is the same as finding nothing.
  const words = query.split(' ').filter((word) => word.length > 1)
  for (const word of words) {
    if (word.length < 3) continue
    for (const field of fields) {
      const candidate = normalise(field)
      if (!candidate.includes(word)) continue
      // Discounted below a whole-query hit, then scaled by how much of the
      // field the word actually accounts for — "pld" filling the whole of a
      // keyword is stronger evidence than it appearing inside a sentence.
      const score = 0.62 + Math.min(1, word.length / candidate.length) * 0.3
      if (score > best) best = score
    }
  }

  // Finally, whole words landing anywhere in the entry — title, blurb or
  // keywords — lift it. This is what makes a two-word query rank the entry
  // that answers both words above the one that answers either.
  if (words.length) {
    const haystack = normalise([destination.title, destination.blurb, ...destination.keywords].join(' '))
    const hits = words.filter((word) => haystack.includes(word)).length
    best = Math.min(1, best + (hits / words.length) * 0.22)
  }
  return best
}

/* Only entries that are actually plausible; below this a listed entry is noise
   dressed up as a suggestion. */
const MATCH_FLOOR = 0.64

/* A trailing file extension and bare numbers are almost never what the visitor
   meant — they are the debris of whatever CMS wrote the dead link — and
   leaving them in the seed query dilutes every score. `index` is deliberately
   not in here: it is a real word for the homepage. */
const EXTENSION = /^(html?|php|aspx?|jsp|cfm|xml|json|txt|md)$/

function seedQueryFrom(route) {
  return normalise(route)
    .split(' ')
    .filter((word) => word && !EXTENSION.test(word) && !/^\d+$/.test(word))
    .join(' ')
    .slice(0, 64)
}

function Nav({ theme, onToggleTheme }) {
  // No section links and no sliding pill: every anchor here would be a
  // cross-document jump, and an indicator tracking sections this document does
  // not contain would be pointing at nothing.
  return <header className="site-header sticky top-0 z-50 mx-auto max-w-[1440px] px-4 pt-3 sm:px-6 lg:px-9">
    <nav className="nav-shell flex items-center justify-between gap-2" aria-label="Main navigation">
      <a href="/" className="brand-lockup rounded-lg py-1.5 text-ink" aria-label="SapinSapin AI home">
        <Mark className="h-[1.85rem] w-[2rem]" />
        <span className="text-[.9rem] font-semibold tracking-[-.045em] whitespace-nowrap">SapinSapin <span className="font-normal text-ink/63">AI</span></span>
      </a>
      <div className="flex items-center gap-1.5 sm:gap-2">
        <a href={github} target="_blank" rel="noreferrer" className="nav-icon-link hidden sm:grid" aria-label="SapinSapin AI on GitHub"><Github className="h-[1.1rem] w-[1.1rem]" /></a>
        <a href={hub} target="_blank" rel="noreferrer" className="nav-icon-link hidden sm:grid" aria-label="SapinSapin AI on Hugging Face"><HuggingFace className="h-[1.1rem] w-[1.1rem]" /></a>
        <span className="nav-divider hidden sm:block" aria-hidden="true" />
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <a href="/" className="btn btn-primary !px-3.5 !py-2 !text-[.74rem]"><ArrowLeft className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Back to the site</span><span className="sm:hidden">Home</span></a>
      </div>
    </nav>
  </header>
}

/* The recovery console. One field, always visible, pre-filled with the words
   pulled out of the failed address — so the answer is usually already on
   screen before anyone types. Results are plain links in document order and
   the arrow keys move real focus between them, rather than a listbox
   impersonation with aria-activedescendant pointing at anchors. */
function Recovery({ route }) {
  const [query, setQuery] = useState(() => seedQueryFrom(route))
  const inputRef = useRef(null)
  const listRef = useRef(null)

  // Ranked when there is something to rank against, and the full directory
  // otherwise. A search on an error page that answers "nothing found" with an
  // empty area has failed twice; the fallback is always the whole list.
  const { results, ranked } = useMemo(() => {
    const everything = destinations.map((destination) => ({ destination, score: 0 }))
    const trimmed = normalise(query)
    if (!trimmed) return { results: everything, ranked: false }
    const matches = destinations
      .map((destination) => ({ destination, score: scoreDestination(trimmed, destination) }))
      .filter((entry) => entry.score >= MATCH_FLOOR)
      .sort((a, b) => b.score - a.score)
    return matches.length ? { results: matches, ranked: true } : { results: everything, ranked: false }
  }, [query])

  const best = ranked && results[0].score >= 0.7 ? results[0] : null

  // `/` and ⌘K focus the field from anywhere on the page — the two shortcuts
  // people already try. Ignored while typing somewhere else, so `/` in the
  // field itself stays a slash.
  useEffect(() => {
    const onKeyDown = (event) => {
      const inField = /^(input|textarea|select)$/i.test(event.target?.tagName || '')
      const wantsPalette = (event.key === 'k' && (event.metaKey || event.ctrlKey)) || (event.key === '/' && !inField)
      if (!wantsPalette) return
      event.preventDefault()
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const focusResult = (index) => {
    const links = listRef.current?.querySelectorAll('a')
    if (!links?.length) return
    const target = links[Math.max(0, Math.min(links.length - 1, index))]
    target?.focus()
  }

  const onFieldKeyDown = (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); focusResult(0) }
    // Enter only commits when there is a genuine best answer. With the fallback
    // list on screen the top row is just whatever comes first in the directory,
    // and sending someone there would be a guess wearing a confident face.
    if (event.key === 'Enter' && ranked) { event.preventDefault(); window.location.assign(results[0].destination.href) }
    if (event.key === 'Escape') setQuery('')
  }

  const onListKeyDown = (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const links = [...(listRef.current?.querySelectorAll('a') ?? [])]
    const current = links.indexOf(document.activeElement)
    if (current === -1) return
    event.preventDefault()
    if (event.key === 'ArrowUp' && current === 0) { inputRef.current?.focus(); return }
    focusResult(current + (event.key === 'ArrowDown' ? 1 : -1))
  }

  return <section className="nf-recovery" aria-labelledby="nf-recovery-title">
    <div className="nf-recovery-head">
      <p className="eyebrow"><span className="eyebrow-rule" aria-hidden="true" />Find it again</p>
      <h2 id="nf-recovery-title" className="nf-recovery-title">
        {best
          ? <>You probably wanted <em className="text-ube">{best.destination.title.toLowerCase()}.</em></>
          : <>Everything is <em className="text-ube">one press away.</em></>}
      </h2>
      <p className="nf-recovery-copy">
        The field is pre-filled with the words from the address that failed. Ranking happens in this page — no search service, no request.
      </p>
    </div>

    <div className="nf-search">
      <svg className="nf-search-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="7.2" cy="7.2" r="4.45" stroke="currentColor" strokeWidth="1.5" />
        <path d="m10.6 10.6 2.65 2.65" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onFieldKeyDown}
        placeholder="Search the site — models, datasets, the demo…"
        aria-label="Search this site"
        aria-describedby="nf-search-count"
        autoComplete="off"
        spellCheck="false"
        // What gets typed here are fragments of a URL — repo names, model
        // families, path segments. A phone that capitalises the first letter
        // and autocorrects "ilo" to "I'll" is actively working against the
        // matcher. `enterKeyHint` labels the return key "search", which is
        // also what pressing it does.
        autoCorrect="off"
        autoCapitalize="none"
        enterKeyHint="search"
      />
      {query && <button type="button" className="nf-search-clear" onClick={() => { setQuery(''); inputRef.current?.focus() }} aria-label="Clear the search">Clear</button>}
      <kbd className="nf-search-kbd" aria-hidden="true">/</kbd>
    </div>

    <p id="nf-search-count" className="nf-search-count" role="status">
      {ranked
        ? `${results.length} close ${results.length === 1 ? 'match' : 'matches'}, best first`
        : normalise(query)
          ? `Nothing close to that — here is everything, all ${results.length} of them`
          : `Everywhere this site goes — all ${results.length}`}
    </p>

    {/* The handler sits on the list rather than on each link so that arrow
        keys work from whichever result currently holds focus. */}
    <ul ref={listRef} className="nf-results" onKeyDown={onListKeyDown}>
      {results.map(({ destination, score }) => {
        const external = destination.kind === 'external'
        return <li key={destination.id}>
          <a
            href={destination.href}
            {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
            className="nf-result"
            data-kind={destination.kind}
          >
            <span className="nf-result-icon" aria-hidden="true">
              {destination.kind === 'section' ? <Anchor className="h-[.95rem] w-[.95rem]" />
                : external ? <ArrowUpRight className="h-[.95rem] w-[.95rem]" />
                  : <ArrowLeft className="h-[.95rem] w-[.95rem]" />}
            </span>
            <span className="nf-result-main">
              <span className="nf-result-title">{destination.title}</span>
              <span className="nf-result-blurb">{destination.blurb}</span>
            </span>
            <span className="nf-result-meta">
              <span className="nf-result-kind">{kindLabel[destination.kind]}</span>
              {score > 0 && <span className="nf-result-score" title={`Similarity to the address you followed: ${(score * 100).toFixed(0)}%`}>
                <i style={{ transform: `scaleX(${score.toFixed(3)})` }} />
                <b>{(score * 100).toFixed(0)}%</b>
              </span>}
            </span>
          </a>
        </li>
      })}
    </ul>
  </section>
}

function Footer() {
  return <footer className="site-footer mt-24 sm:mt-32">
    <div className="section-shell py-12">
      <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
        <a href="/" className="flex items-center gap-2.5" aria-label="SapinSapin AI home">
          <Mark className="h-[2.1rem] w-[2.3rem]" />
          <span className="font-semibold tracking-[-.04em]">SapinSapin AI</span>
        </a>
        <div className="footer-links !mt-0 sm:!grid-flow-col sm:!gap-7">
          <a href="/">Homepage</a>
          <a href={hub} target="_blank" rel="noreferrer">Hugging Face <ArrowUpRight className="h-3.5 w-3.5" /></a>
          <a href={github} target="_blank" rel="noreferrer">GitHub <ArrowUpRight className="h-3.5 w-3.5" /></a>
          <a href="https://github.com/sapinsapin/halohalo/issues" target="_blank" rel="noreferrer">Report a broken link <ArrowUpRight className="h-3.5 w-3.5" /></a>
        </div>
      </div>
      <div className="footer-rule mt-10 flex flex-col justify-between gap-3 pt-5 text-[11px] sm:flex-row">
        <p>© 2026 SapinSapin AI</p>
        <p>HTTP 404 · Open foundations for Philippine-language AI</p>
      </div>
    </div>
  </footer>
}

export default function NotFound() {
  const [theme, toggleTheme] = useTheme()
  // Read once, in the initialiser. The address cannot change without a
  // navigation, and doing this in an effect instead would draw the trace for
  // "/" on the first paint and then swap it for the real one.
  const [route] = useState(readRequestedRoute)

  return <>
    <a href="#nf-recovery-title" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-paper">Skip to the suggestions</a>
    <Nav theme={theme} onToggleTheme={toggleTheme} />

    <main className="nf-main">
      <section className="nf-hero-wrap">
        <div className="hero-frame page-shell nf-hero">
          <div className="hero-wash" aria-hidden="true" />

          <div className="relative z-10">
            <div className="hero-badge hero-rise hero-rise-1"><span className="hero-pulse" aria-hidden="true" /> Error 404 · Route not found</div>
            <h1 className="hero-rise hero-rise-2 nf-title">We didn’t<br />catch <em className="font-normal text-ube">that.</em></h1>
            <p className="hero-rise hero-rise-3 nf-lede">
              Nothing on this site answers to that address — no page, no section, no dataset. The link may have been renamed, or it may simply have a typo in it.
            </p>

            <p className="hero-rise hero-rise-3 nf-route">
              <span>Requested</span>
              <code>{route}</code>
            </p>

            <div className="hero-rise hero-rise-4 mt-8 flex flex-wrap gap-3">
              <a href="/" className="btn btn-primary"><ArrowLeft className="h-4 w-4" /> Back to the homepage</a>
              <a href="/#demo" className="btn btn-ghost">Go to the live demo</a>
              <a href={hub} target="_blank" rel="noreferrer" className="btn btn-ghost">Open the Hub <ArrowUpRight className="h-4 w-4" /></a>
            </div>
          </div>

          <div className="relative z-10 nf-trace-slot">
            <SignalTrace seed={route} />
          </div>
        </div>
      </section>

      <Recovery route={route} />
    </main>

    <Footer />
  </>
}
