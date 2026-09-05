import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import NumberFlow from '@number-flow/react'
import { datasets, models, catalogSnapshot, totals } from './data/catalog'
import { ArrowDown, ArrowUp, ArrowUpRight, CheckIcon, Code, CopyIcon, Dataset, Github, HuggingFace, Mark, MarkMono } from './components/Icons'
import ThemeToggle from './components/ThemeToggle'
import PhilippinesMap from './components/PhilippinesMap'
import { useTheme } from './lib/theme'
import { describeModel } from './data/modelNotes'
import { languages as demoLanguages } from './data/spaceManifest'
import { languageAnchors } from './data/philippinesMapPaths'

const hub = 'https://huggingface.co/sapinsapin'
const github = 'https://github.com/sapinsapin'
const space = 'https://huggingface.co/spaces/sapinsapin/halohalo-dashboard'

/* Scrolls to the true document top rather than to the #top hash target —
   a plain anchor jump lands the Hero's top edge at the viewport top, which
   leaves it hidden behind the sticky header instead of reproducing the
   unscrolled, header-above-hero view the page opens with. */
function scrollToTop() {
  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  window.scrollTo({ top: 0, behavior })
}

const navItems = [
  { id: 'demo', label: 'Demo' },
  { id: 'work', label: 'Work' },
  { id: 'models', label: 'Models' },
  { id: 'open', label: 'Why open' },
  { id: 'contribute', label: 'Contribute' },
]

/* Sources for the empirical claims on the page. Kept deliberately short — a
   citation on every sentence would read as noise rather than rigour. */
const references = [
  {
    id: 'joshi',
    title: 'The State and Fate of Linguistic Diversity and Inclusion in the NLP World',
    authors: 'Joshi, Santy, Budhiraja, Bali & Choudhury',
    where: 'ACL 2020',
    href: 'https://aclanthology.org/2020.acl-main.560/',
  },
  {
    id: 'blasi',
    title: 'Systematic Inequalities in Language Technology Performance across the World\u2019s Languages',
    authors: 'Blasi, Anastasopoulos & Neubig',
    where: 'ACL 2022',
    href: 'https://aclanthology.org/2022.acl-long.376/',
  },
  {
    id: 'ethnologue',
    title: 'Languages of the Philippines',
    authors: 'Ethnologue (SIL International)',
    where: 'Country profile',
    href: 'https://www.ethnologue.com/country/PH/',
  },
  {
    id: 'initiative',
    title: 'The Sapin-Sapin initiative \u2014 Sariling AI PINas',
    authors: 'Tim Santos',
    where: 'Announcement, 2026',
    href: 'https://www.linkedin.com/posts/internetoftim_currently-in-ai-engineer-singapore-will-activity-7461251671738978304-eazx/',
  },
]

/* How many dataset cards a phone opens with. Three is one screen's worth at
   the compacted card height, which is enough to show that the catalog has
   variety in it without turning the section into a wall to be scrolled past. */
const COMPACT_DATASETS = 3

const referenceIndex = Object.fromEntries(references.map((reference, index) => [reference.id, { ...reference, number: index + 1 }]))

/* Serialises structured data for a <script> tag. The escaping is the point:
   these schemas carry dataset titles and descriptions synced from the Hub, and
   a "</script>" in any of them would otherwise close the tag early and let the
   rest of the string be parsed as markup. Escaping "<" is enough, and leaves
   the JSON valid. */
const jsonLd = (schema) => JSON.stringify(schema).replace(/</g, '\\u003c')

/* An inline citation marker. Pointer users get a preview card so they never
   lose their place; everyone else follows the link down to the reference list. */
function Cite({ source }) {
  const reference = referenceIndex[source]
  if (!reference) return null
  return <span className="cite">
    <a href={`#ref-${reference.id}`} className="cite-marker" aria-label={`Reference ${reference.number}: ${reference.title}, ${reference.authors}, ${reference.where}`}>
      {reference.number}
    </a>
    {/* The whole card is the link to the source. It duplicates the reference
        list entry, so it is kept out of the tab order and the accessibility
        tree — the marker and the list already cover keyboard and screen
        reader users. */}
    <a
      className="cite-card"
      href={reference.href}
      target="_blank"
      rel="noreferrer"
      tabIndex={-1}
      aria-hidden="true"
    >
      <strong>{reference.title}</strong>
      <em>{reference.authors} · {reference.where}</em>
      <span className="cite-card-cta">Open source <ArrowUpRight className="h-3 w-3" /></span>
    </a>
  </span>
}

function References() {
  return <section className="section-shell pt-16 sm:pt-32">
    <div className="reference-block">
      <div className="reference-head">
        <Eyebrow>References</Eyebrow>
        <p>Every research claim on this page carries a numbered marker that links here. Catalog figures are read from the public Hugging Face cards rather than restated.</p>
      </div>
      <div>
        <ol className="reference-list">
          {references.map((reference, index) => (
            <li key={reference.id} id={`ref-${reference.id}`}>
              <span className="reference-number">{index + 1}</span>
              <ExternalLink href={reference.href} label={`${reference.title} (opens in a new tab)`}>
                <span className="reference-title">{reference.title} <ArrowUpRight className="reference-arrow h-3 w-3" /></span>
                <span className="reference-meta">{reference.authors} · {reference.where}</span>
              </ExternalLink>
            </li>
          ))}
        </ol>
        <p className="reference-note">
          Initiative background from <ExternalLink href="https://www.linkedin.com/in/internetoftim/" label="Tim Santos on LinkedIn">Tim Santos</ExternalLink>
          {' '}— Director of Product at Graphcore and lead author of the Philippine AI Report 2025
          {' '}(<ExternalLink href="https://www.manilatimes.net/2026/05/24/tmt-newswire/global-ai-expert-tim-santos-leads-strategic-ai-masterclass-for-philippine-business-leaders/2350495" label="The Manila Times profile of Tim Santos">The Manila Times</ExternalLink>),
          {' '}who also publishes on <ExternalLink href="https://huggingface.co/internetoftim" label="Tim Santos on Hugging Face">Hugging Face</ExternalLink>.
          {' '}Dataset and model figures come from the public Hub cards on {catalogSnapshot}.
        </p>
      </div>
    </div>
  </section>
}

function ExternalLink({ href, children, className = '', label }) {
  return <a className={className} href={href} target="_blank" rel="noreferrer" aria-label={label}>{children}</a>
}

function Eyebrow({ children }) {
  return <p className="eyebrow"><span className="eyebrow-rule" aria-hidden="true" />{children}</p>
}

function SectionHeading({ eyebrow, title, children, className = '' }) {
  return <div className={`max-w-3xl ${className}`}>
    <Eyebrow>{eyebrow}</Eyebrow>
    <h2 className="mt-5 font-display text-[clamp(2.25rem,4vw,4rem)] font-medium leading-[1.01] tracking-[-.055em] text-ink">{title}</h2>
    {children && <p className="mt-6 max-w-2xl text-[1.03rem] leading-7 text-ink/70 md:text-lg">{children}</p>}
  </div>
}

/* Reveals its children as they scroll into view. The previous build ran these
   animations on page load, so everything below the fold had already finished
   animating before it was ever seen. */
function Reveal({ as: Tag = 'div', className = '', children, ...rest }) {
  const ref = useRef(null)
  useEffect(() => {
    const node = ref.current
    if (!node) return undefined
    if (!('IntersectionObserver' in window)) { node.classList.add('is-revealed'); return undefined }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      node.classList.add('is-revealed')
      observer.disconnect()
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.1 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return <Tag ref={ref} className={`reveal ${className}`} {...rest}>{children}</Tag>
}

/* Rolls a figure up from zero the first time it scrolls into view. Respects
   reduced-motion by jumping straight to the value. */
function CountUp({ value, format }) {
  const ref = useRef(null)
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const node = ref.current
    if (!node) return undefined
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (still || !('IntersectionObserver' in window)) { setShown(value); return undefined }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setShown(value)
      observer.disconnect()
    }, { threshold: 0.4 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [value])
  return <span ref={ref}><NumberFlow value={shown} format={format} /></span>
}

/* Live answer to a media query. Used where the difference between phone and
   desktop is a difference in *behaviour* rather than in styling — CSS handles
   everything that is only a matter of appearance. Subscribed rather than read
   once, so rotating a phone or dragging a window across the breakpoint
   re-renders instead of leaving the page in the other layout's mode. */
function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia?.(query).matches ?? false)
  useEffect(() => {
    const list = window.matchMedia?.(query)
    if (!list) return undefined
    const onChange = () => setMatches(list.matches)
    onChange()
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])
  return matches
}

/* Marks whichever section is crossing the middle of the viewport. */
function useActiveSection() {
  const [activeId, setActiveId] = useState(null)
  useEffect(() => {
    const sections = navItems
      .map(({ id }) => document.getElementById(id))
      .filter(Boolean)
    if (!sections.length || !('IntersectionObserver' in window)) return undefined

    const visible = new Set()
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) visible.add(entry.target.id)
        else visible.delete(entry.target.id)
      })
      const next = navItems.map(({ id }) => id).filter((id) => visible.has(id))
      setActiveId(next.length ? next[next.length - 1] : null)
    }, { rootMargin: '-45% 0px -50% 0px' })

    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [])
  return activeId
}

function Nav({ theme, onToggleTheme }) {
  const activeId = useActiveSection()
  const linksRef = useRef(null)
  const menuRef = useRef(null)
  const [hidden, setHidden] = useState(false)

  // Slide the indicator pill under whichever link is active.
  const positionPill = useCallback(() => {
    const container = linksRef.current
    if (!container) return
    const current = container.querySelector('a[data-active="true"]')
    if (!current) { container.style.setProperty('--pill-o', '0'); return }
    container.style.setProperty('--pill-x', `${current.offsetLeft}px`)
    container.style.setProperty('--pill-w', `${current.offsetWidth}px`)
    container.style.setProperty('--pill-o', '1')
  }, [])

  useLayoutEffect(positionPill, [activeId, positionPill])

  useEffect(() => {
    const container = linksRef.current
    if (!container || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(positionPill)
    observer.observe(container)
    // Web fonts change link widths after first paint.
    document.fonts?.ready.then(positionPill).catch(() => {})
    return () => observer.disconnect()
  }, [positionPill])

  // Condense the bar once the page has moved off the top, and — on phones
  // only — slide it out of the way on a downward scroll and bring it back on
  // the way up. Desktop and tablet keep the bar fixed in place; a header that
  // vanishes under a mouse cursor is disorienting in a way it isn't on touch.
  useEffect(() => {
    let frame = 0
    let lastY = window.scrollY
    // Mirrors the attribute currently on <html>. Writing an attribute is a
    // style invalidation even when the value is unchanged, so tracking the
    // last value here keeps a long scroll down to two writes rather than one
    // per animation frame.
    let scrolled = null
    const mobileQuery = window.matchMedia('(max-width: 767px)')
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        const y = Math.max(0, window.scrollY)
        const isScrolled = y > 8
        if (isScrolled !== scrolled) {
          scrolled = isScrolled
          document.documentElement.dataset.scrolled = String(isScrolled)
        }

        if (mobileQuery.matches) {
          const delta = y - lastY
          if (y < 48) setHidden(false)
          else if (delta > 6) { setHidden(true); closeMenus() }
          else if (delta < -6) setHidden(false)
        }
        lastY = y
        frame = 0
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    // A resize across the mobile breakpoint (rotation, DevTools) shouldn't
    // leave the bar stuck off-screen on the wider layout.
    const onResize = () => { if (!mobileQuery.matches) setHidden(false) }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      cancelAnimationFrame(frame)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const closeMenus = () => {
    if (menuRef.current) menuRef.current.open = false
  }

  // Dismiss the mobile menu on outside click or Escape.
  useEffect(() => {
    const close = (event) => {
      const menu = menuRef.current
      if (!menu?.open) return
      if (event.type === 'keydown' && event.key !== 'Escape') return
      if (event.type === 'pointerdown' && menu.contains(event.target)) return
      menu.open = false
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close) }
  }, [])

  const links = navItems.map(({ id, label }) => (
    <a key={id} href={`#${id}`} data-active={activeId === id} onClick={() => { if (menuRef.current) menuRef.current.open = false }}>{label}</a>
  ))

  return <header
    data-hidden={hidden}
    className="site-header sticky top-0 z-50 mx-auto max-w-[1440px] px-4 pt-3 sm:px-6 lg:px-9"
  >
    {/* Height, inline padding, radius, and width all morph between the
        unscrolled bar and the scrolled island, so they live in .nav-shell
        rather than as utilities here — see index.css. */}
    <nav className="nav-shell flex items-center justify-between gap-2" aria-label="Main navigation">
      <a href="#top" onClick={(event) => { event.preventDefault(); closeMenus(); scrollToTop() }} className="brand-lockup rounded-lg py-1.5 text-ink" aria-label="SapinSapin AI home">
        <Mark className="h-[1.85rem] w-[2rem]" />
        <span className="text-[.9rem] font-semibold tracking-[-.045em] whitespace-nowrap">SapinSapin <span className="font-normal text-ink/63">AI</span></span>
      </a>
      {/* The inline section links wait for lg rather than md. Between 768 and
          about 845 they used to overflow the bar — five links, two icon links
          and the call to action do not fit a tablet-width shell — and that gap
          only widened once every control in it grew to a 44px touch target.
          Below lg the same five destinations are in the menu panel, so nothing
          is out of reach at any width; the bar simply stops pretending it has
          desktop room. */}
      <div ref={linksRef} className="nav-links hidden items-center gap-1 text-[.78rem] font-medium text-ink/70 lg:flex">{links}</div>
      <div className="flex items-center gap-1.5 sm:gap-2">
        <ExternalLink href={github} className="nav-icon-link hidden sm:grid" label="SapinSapin AI on GitHub"><Github className="h-[1.1rem] w-[1.1rem]" /></ExternalLink>
        <ExternalLink href={hub} className="nav-icon-link hidden sm:grid" label="SapinSapin AI on Hugging Face"><HuggingFace className="h-[1.1rem] w-[1.1rem]" /></ExternalLink>
        <span className="nav-divider hidden sm:block" aria-hidden="true" />
        {/* On the narrowest phones this one is hidden and its twin inside the
            menu panel takes over — brand, call to action and menu are what a
            320px bar can hold at 44px each. index.css owns the switch, so only
            one of the two is ever in the tab order. */}
        <span className="nav-bar-toggle contents"><ThemeToggle theme={theme} onToggle={onToggleTheme} /></span>
        <ExternalLink href={`${hub}?tab=datasets`} className="btn btn-primary !px-3.5 !py-2 !text-[.74rem]" label="Browse SapinSapin AI datasets on Hugging Face">
          <span className="hidden sm:inline">Explore the Hub</span><span className="sm:hidden">Hub</span> <ArrowUpRight className="h-3.5 w-3.5" />
        </ExternalLink>
        <details className="nav-menu lg:hidden" ref={menuRef}>
          <summary aria-label="Open navigation"><span /><span /><span /></summary>
          <div className="nav-menu-panel">
            {navItems.map(({ id, label }) => (
              <a key={id} href={`#${id}`} data-active={activeId === id} onClick={() => { if (menuRef.current) menuRef.current.open = false }}>{label}</a>
            ))}
            <div className="nav-menu-theme">
              <span>Appearance</span>
              <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            </div>
          </div>
        </details>
      </div>
    </nav>
  </header>
}

function Hero() {
  return <section id="top" className="relative overflow-hidden px-4 pb-0 pt-3 sm:px-6 sm:pt-4 lg:px-9">
    <div className="hero-frame page-shell relative grid items-center gap-8 overflow-hidden rounded-[2rem] px-6 py-8 sm:px-10 sm:py-10 lg:grid-cols-[1fr_.95fr] lg:gap-12 lg:px-16">
      <div className="hero-wash" aria-hidden="true" />
      <div className="relative z-10 max-w-2xl">
        <div className="hero-badge hero-rise hero-rise-1"><span className="hero-pulse" aria-hidden="true" /> Open research infrastructure</div>
        <h1 className="hero-rise hero-rise-2 mt-6 font-display text-[clamp(2.9rem,5.6vw,6.1rem)] font-medium leading-[.92] tracking-[-.068em] text-ink">Every voice<br />belongs in the<br /><em className="font-normal text-ube">future.</em></h1>
        <p className="hero-rise hero-rise-3 mt-6 max-w-xl text-[1rem] leading-7 text-ink/72 sm:text-lg sm:leading-8 [text-wrap:pretty]">SapinSapin AI builds open speech and language foundations so Philippine AI can be made with — and for — the people who speak it.</p>
        <div className="hero-rise hero-rise-3 mt-8 flex flex-wrap gap-3">
          {/* Same-page anchor, so it takes the in-page arrow — ArrowUpRight is
              reserved for links that leave the site (see ExternalLink), which
              this one never did despite jumping to #work. */}
          <a href="#work" className="btn btn-primary">Explore the collections <ArrowDown className="h-4 w-4" /></a>
          {/* Points at the demo on this page rather than the Space it used to
              open. The down arrow is the page's mark for an in-page jump; the
              Space is still one click away from inside the demo itself. */}
          <a href="#demo" className="btn btn-ghost">Try the live demo <ArrowDown className="h-4 w-4" /></a>
        </div>
        <div className="hero-evidence hero-rise hero-rise-4 mt-10">
          <span><b><CountUp value={totals.datasets} format={{ minimumIntegerDigits: 2 }} /></b> data collections</span><span><b><CountUp value={totals.models} /></b> public models</span><span><b><CountUp value={languageAnchors.length} /></b> language layers</span>
        </div>
      </div>
      <div className="relative z-10 mx-auto w-full max-w-[580px] lg:ml-auto"><PhilippinesMap /></div>
    </div>
  </section>
}

/* The halohalo Space is the fastest way to understand what the project does,
   so it gets a section of its own rather than a footer link. */
// The console is the only part of the page that fetches at runtime, and it sits
// below the fold. Splitting it out keeps it off the first-paint path that
// d89c6ab went to the trouble of clearing, and gating it on approach means a
// visitor who never scrolls here never touches the Space at all.
const SpeechConsole = lazy(() => import('./components/SpeechConsole'))

function DeferredConsole() {
  const ref = useRef(null)
  const [near, setNear] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return undefined
    if (!('IntersectionObserver' in window)) { setNear(true); return undefined }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setNear(true)
    }, { rootMargin: '400px 0px' })
    observer.observe(node)

    // Two more ways in. The observer is the precise trigger, but this is the
    // page's headline feature — if it ever failed to fire, the demo would
    // simply never appear.
    //
    // The hash check is not belt-and-braces, it is load-bearing: the hero's
    // "Try the live demo" button and the nav both jump straight to #demo, and
    // an anchor jump does not reliably emit a scroll event, so those two links
    // could otherwise land someone on an empty placeholder.
    const onScroll = () => setNear(true)
    const onHash = () => { if (window.location.hash === '#demo') setNear(true) }
    onHash()
    window.addEventListener('scroll', onScroll, { once: true, passive: true })
    window.addEventListener('hashchange', onHash)

    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('hashchange', onHash)
    }
  }, [])

  // The placeholder holds the console's own height so arriving at the section
  // does not shove the rest of the page down as the chunk lands.
  const placeholder = <div ref={ref} className="demo-placeholder" aria-hidden="true" />
  if (!near) return placeholder
  return <Suspense fallback={placeholder}><SpeechConsole /></Suspense>
}

function Demo() {
  return <section id="demo" className="section-shell scroll-mt-24 pt-20 sm:pt-36">
    <div className="demo-panel">
      <div className="demo-intro">
        <div>
          <Eyebrow>Try it in the browser</Eyebrow>
          <h2 className="mt-5 font-display text-[clamp(2.25rem,4vw,3.6rem)] font-medium leading-[1.02] tracking-[-.055em] text-ink">Hear the models <em className="text-ube">work.</em></h2>
          <p className="mt-6 max-w-xl text-[1.03rem] leading-7 text-ink/70">These run the org’s own speech models for nine Philippine languages and English — no install, no account. Everything below calls the halohalo Space directly from this page. The catalog also carries text-generation models, which the demo does not run — they are under <a className="font-medium text-ube underline decoration-ube/30 underline-offset-[3px] transition-colors hover:decoration-ube" href="#models">Text generation</a> in the model table below.</p>
          {/* Said once, up front, rather than discovered at second twenty. The
              Space is on free shared CPU, and pretending otherwise would make
              a working demo look broken. */}
          <p className="mt-4 max-w-xl text-sm leading-6 text-ink/60">They run on free shared CPU with no GPU, so a request takes roughly ten to twenty seconds — and the first one in a language waits on a ~1&nbsp;GB model download. Requests are handled one at a time.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ExternalLink href={space} className="btn btn-ghost" label="Open the halohalo Space on Hugging Face">Open in the Space <ArrowUpRight className="h-4 w-4" /></ExternalLink>
            <a href="#models" className="btn btn-ghost">Browse the models <ArrowDown className="h-4 w-4" /></a>
          </div>
        </div>
        {/* Counts come from the generated manifest rather than being written
            here, so they cannot drift from the languages the demo can serve. */}
        <aside className="demo-spec" aria-label="What the demo runs">
          <p className="demo-spec-label">Behind this demo</p>
          <dl className="demo-spec-list">
            {[
              [demoLanguages.length, 'Speech recognition', 'whisper-small-pld-*'],
              [demoLanguages.length, 'Speech synthesis', 'speecht5_tts-pld-*'],
              [1, 'Voice conversion', 'speecht5_vc-pld'],
            ].map(([count, name, id]) => (
              <div key={name} className="demo-spec-row">
                <dt>
                  <span className="demo-spec-count">{count}</span>
                  <span className="demo-spec-name">{name}</span>
                </dt>
                <dd><code>{id}</code></dd>
              </div>
            ))}
          </dl>
          <p className="demo-spec-note">
            Finetuned on the Philippine Language Dataset. Clips and voice presets come from the corpus collected by the UP&nbsp;Diliman Digital Signal Processing Laboratory.
          </p>
        </aside>
      </div>
      <DeferredConsole />
    </div>
  </section>
}

function Problem() {
  const points = [
    ['01', 'The default is not neutral.', <>Language technology is overwhelmingly trained on languages with abundant data. That shapes who gets understood — and who gets left out.<Cite source="blasi" /></>],
    ['02', 'Language is local knowledge.', <>The Philippines has more than 170 living indigenous languages, each carrying distinct histories, communities, and ways of seeing.<Cite source="ethnologue" /> A useful AI must be grounded in that reality.</>],
    ['03', 'The foundation has to be open.', 'Open datasets make it possible for researchers, developers, and institutions to inspect, build, and improve together.'],
  ]
  return <section className="section-shell pt-20 sm:pt-36">
    <div className="grid gap-12 lg:grid-cols-[.78fr_1.22fr] lg:gap-24">
      <SectionHeading eyebrow="The work begins with data" title={<>AI should understand<br />the Philippines <em className="text-ube">in its own words.</em></>}>Philippine languages remain underrepresented in the datasets that shape modern AI.<Cite source="joshi" /> The work of inclusion starts long before a model is trained.</SectionHeading>
      <Reveal className="divide-y divide-ink/10 border-t border-ink/10">{points.map(([number, title, copy]) => <article key={number} className="grid gap-4 py-8 sm:grid-cols-[60px_1fr] sm:gap-6"><p className="text-xs font-semibold tracking-[.16em] text-ube">{number}</p><div><h3 className="text-xl font-semibold tracking-[-.045em] text-ink">{title}</h3><p className="mt-3 max-w-lg leading-7 text-ink/68">{copy}</p></div></article>)}</Reveal>
    </div>
  </section>
}

function Impact() {
  const stats = [
    { value: 513.3, format: { minimumFractionDigits: 1, maximumFractionDigits: 1 }, label: 'documented speech hours', source: 'PLD + Filipino Speech Corpus' },
    { value: 25265710, label: 'tokens of pretraining text', source: 'BantayWika + halohalo' },
    { value: 10, label: 'languages in the collection', source: 'PLD — nine Philippine, plus English' },
    { value: totals.datasets, label: 'datasets in the catalog', source: `Hub sync · ${catalogSnapshot}` },
  ]
  return <section className="section-shell pt-20 sm:pt-36"><div className="layer-band"><div className="mb-11 flex flex-col justify-between gap-5 md:flex-row md:items-end"><SectionHeading eyebrow="Impact, made inspectable" title={<>Built in public.<br />Measured honestly.</>} /><p className="max-w-sm text-sm leading-6 text-ink/65">Counts are taken from the public Hub cards and dataset documentation. “Documented” means the figure is stated on a public dataset card; access-controlled collections whose totals are not public are excluded, and a stated figure is not an independently verified one.</p></div><Reveal as="dl" className="grid divide-y divide-ink/10 border-y border-ink/10 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">{stats.map(({ value, format, label, source }) => <div className="px-0 py-7 sm:px-6 lg:px-7" key={label}><dt className="font-display text-4xl tracking-[-.06em] text-ube sm:text-5xl"><CountUp value={value} format={format} /></dt><dd className="mt-2 text-sm font-semibold tracking-[-.02em] text-ink">{label}</dd><dd className="mt-1 text-xs leading-5 text-ink/60">{source}</dd></div>)}</Reveal></div></section>
}

function DatasetCard({ item, index }) {
  const languages = item.languages.split(' · ')
  const shown = languages.slice(0, 3)
  const rest = languages.length - shown.length
  const unstated = (value) => (value === '{{VERIFY}}' ? <span className="meta-unstated">Not stated on the Hub</span> : value)

  return <article className={`dataset-card ${item.featured ? 'dataset-featured' : ''}`}>
    <div className="dataset-head">
      <p className="dataset-kicker">{item.kind}</p>
      <span className="dataset-index">{String(index + 1).padStart(2, '0')}</span>
    </div>
    <h3 className="dataset-title">{item.title}</h3>
    <p className="dataset-desc">{item.description}</p>

    <dl className="dataset-meta">
      <div className="dataset-meta-wide">
        <dt className="meta-label">Languages</dt>
        <dd>{shown.join(' · ')}{rest > 0 && <span className="meta-more"> +{rest} more</span>}</dd>
      </div>
      <div><dt className="meta-label">Size</dt><dd>{unstated(item.size)}</dd></div>
      <div><dt className="meta-label">Downloads 30d</dt><dd className="dataset-figure">{item.downloads.toLocaleString()}</dd></div>
      <div><dt className="meta-label">License</dt><dd>{unstated(item.license)}</dd></div>
      <div><dt className="meta-label">Updated</dt><dd>{item.updated}</dd></div>
    </dl>

    <div className="dataset-foot">
      <div className="dataset-tags">
        {item.gated && <span className="tag tag-gated">Access controlled</span>}
        {item.tags.slice(0, item.gated ? 2 : 3).map(tag => <span key={tag} className="tag">{tag}</span>)}
      </div>
      <ExternalLink href={item.href} className="round-link" label={`Open ${item.title} on Hugging Face`}><ArrowUpRight className="h-4 w-4" /></ExternalLink>
    </div>
  </article>
}

function Datasets() {
  // The catalog splits cleanly into speech and text corpora, so the same
  // filter pattern used for models keeps nine cards from reading as one wall.
  const [filter, setFilter] = useState('All data')
  const tabs = useMemo(() => {
    const counts = new Map()
    datasets.forEach((item) => counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1))
    return [['All data', datasets.length], ...[...counts].sort((a, b) => b[1] - a[1])]
  }, [])
  const visible = filter === 'All data' ? datasets : datasets.filter((item) => item.kind === filter)

  // Nine cards side by side are three rows of a grid; nine cards stacked are
  // about four screens of swiping between the invitation to explore the data
  // and the model catalog underneath it. On a phone the list therefore opens
  // at three and says how many more there are — the same bargain the model
  // table already strikes at five, rather than a different one per section.
  // Wider viewports never see the button: the grid there is already short.
  const compact = useMediaQuery('(max-width: 639px)')
  const [expanded, setExpanded] = useState(false)
  const collapsed = compact && !expanded
  const shown = collapsed ? visible.slice(0, COMPACT_DATASETS) : visible

  return <section id="work" className="section-shell scroll-mt-24 pt-20 sm:pt-40">
    <div className="flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
      <SectionHeading eyebrow="The collection" title="Foundations you can build on.">Speech, text, and language data made discoverable in one place. Each card links directly to its live dataset card, documentation, and terms.</SectionHeading>
      <ExternalLink href={`${hub}?tab=datasets`} className="text-link" label="View all SapinSapin AI datasets on Hugging Face">Visit the Hub <ArrowUpRight className="h-4 w-4" /></ExternalLink>
    </div>

    <div className="dataset-filters" role="group" aria-label="Filter datasets by kind">
      {tabs.map(([label, count]) => (
        <button key={label} type="button" onClick={() => { setFilter(label); setExpanded(false) }} aria-pressed={filter === label} className={filter === label ? 'is-active' : ''}>
          {label} <span>{count}</span>
        </button>
      ))}
    </div>

    <Reveal className="dataset-grid">
      {shown.map((item, index) => <DatasetCard key={item.id} item={item} index={index} />)}
    </Reveal>

    {compact && visible.length > COMPACT_DATASETS && (
      <div className="list-more">
        <button type="button" onClick={() => setExpanded((open) => !open)} aria-expanded={expanded}>
          {expanded ? 'Show fewer' : `Show all ${visible.length} collections`}
          {expanded ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
        </button>
        <p>Showing {shown.length} of {visible.length}{filter === 'All data' ? '' : ` · ${filter}`}</p>
      </div>
    )}

    <p className="mt-6 text-xs leading-5 text-ink/60">Sizes and licences are shown exactly as the public Hub card states them; where a card does not state one, this page says so rather than guessing. Counts and dates synced {catalogSnapshot}.</p>
  </section>
}

function ModelPreview({ model, style }) {
  const note = describeModel(model)
  return <div id="model-preview" role="tooltip" className="model-preview" style={style}>
    <p className="model-preview-name">{model.name}</p>
    <p className="model-preview-summary">{note.summary}</p>
    <dl className="model-preview-meta">
      {note.base && <div><dt>Built on</dt><dd>{note.base}</dd></div>}
      {note.data && <div><dt>Trained with</dt><dd>{note.data}</dd></div>}
    </dl>
    <p className="model-preview-foot">{model.downloads} downloads in the last 30 days · updated {model.updated}</p>
  </div>
}

function Models() {
  // Group by task so the 28 entries can be filtered instead of read as one
  // undifferentiated list. Entries whose Hub card does not state a task are
  // kept visible under their own group rather than quietly dropped.
  const taskOf = (model) => (model.task === '{{VERIFY}}' ? 'Task not listed' : model.task)

  const { ranked, tabs, peak } = useMemo(() => {
    const sorted = [...models].sort((a, b) => (Number(b.downloads) || 0) - (Number(a.downloads) || 0))
    const counts = new Map()
    sorted.forEach((model) => counts.set(taskOf(model), (counts.get(taskOf(model)) ?? 0) + 1))
    return {
      ranked: sorted,
      tabs: [['All models', models.length], ...[...counts].sort((a, b) => b[1] - a[1])],
      peak: Math.max(...sorted.map((model) => Number(model.downloads) || 0), 1),
    }
  }, [])

  const [filter, setFilter] = useState('All models')
  const [displayCount, setDisplayCount] = useState(5)

  // Hover preview. Positioned fixed so it escapes the panel's overflow, and
  // flipped above the row when there is not enough room below.
  const [preview, setPreview] = useState(null)
  const canHover = useRef(true)
  useEffect(() => {
    canHover.current = window.matchMedia('(hover: hover)').matches
  }, [])
  useEffect(() => {
    if (!preview) return undefined
    const dismiss = () => setPreview(null)
    window.addEventListener('scroll', dismiss, { passive: true })
    return () => window.removeEventListener('scroll', dismiss)
  }, [preview])

  const openPreview = (event, model) => {
    if (!canHover.current) return
    const rect = event.currentTarget.getBoundingClientRect()
    const width = 330
    const left = Math.min(Math.max(12, rect.left + 28), window.innerWidth - width - 12)
    const below = window.innerHeight - rect.bottom
    setPreview({
      model,
      style: below > 240
        ? { left, top: rect.bottom + 10 }
        : { left, bottom: window.innerHeight - rect.top + 10 },
    })
  }
  const visible = filter === 'All models' ? ranked : ranked.filter((model) => taskOf(model) === filter)

  // Incremental pagination: show initial 5 -> next 5 (10) -> show all.
  const shown = visible.slice(0, displayCount)
  const isFullyExpanded = displayCount >= visible.length

  const handleToggleDisplay = () => {
    if (displayCount < 10 && visible.length > 10) {
      setDisplayCount(10)
    } else if (displayCount < visible.length) {
      setDisplayCount(visible.length)
    } else {
      setDisplayCount(5)
    }
  }

  let buttonText = ''
  if (displayCount < 10 && visible.length > 10) {
    buttonText = 'Show 5 more'
  } else if (displayCount < visible.length) {
    buttonText = `Show all ${visible.length} models`
  } else {
    buttonText = 'Show fewer'
  }

  return <section id="models" className="section-shell scroll-mt-24 pt-20 sm:pt-40">
    <div className="models-panel">
      <div className="grid gap-8 px-6 py-8 sm:px-10 sm:py-11 lg:grid-cols-[1fr_.72fr]">
        <SectionHeading eyebrow="Models" title={<>A growing model<br />layer, <em className="text-ube">in the open.</em></>}>The public model catalog spans language generation, speech recognition, text-to-speech, and audio-to-audio work. Every entry below links to its live model card.</SectionHeading>
        <div className="self-end border-l-0 border-ink/10 pt-2 lg:border-l lg:pl-8">
          <p className="font-display text-6xl tracking-[-.08em] text-pandan"><CountUp value={totals.models} /></p>
          <p className="mt-2 text-sm font-medium text-ink/80">public models catalogued</p>
          <p className="mt-4 text-xs leading-5 text-ink/60">Ordered by downloads over the last 30 days. Counts, tasks, and dates are synced from the public Hub API on {catalogSnapshot}; model cards remain the canonical source.</p>
        </div>
      </div>

      <div className="model-filters" role="group" aria-label="Filter models by task">
        {tabs.map(([label, count]) => (
          <button
            key={label}
            type="button"
            onClick={() => { setFilter(label); setDisplayCount(5) }}
            aria-pressed={filter === label}
            className={filter === label ? 'is-active' : ''}
          >
            {label} <span>{count}</span>
          </button>
        ))}
      </div>

      <div className="model-head" aria-hidden="true">
        <span>#</span><span>Model</span><span>Task</span><span>Base model</span><span>Training data</span><span className="text-right">Downloads 30d</span><span />
      </div>

      <div>
        {shown.map((model, index) => (
          <a
            key={model.name}
            href={model.href}
            target="_blank"
            rel="noreferrer"
            className="model-row group"
            aria-label={`Open ${model.name} on Hugging Face`}
            aria-describedby={preview?.model.name === model.name ? 'model-preview' : undefined}
            onPointerEnter={(event) => openPreview(event, model)}
            onPointerLeave={() => setPreview(null)}
            onFocus={(event) => openPreview(event, model)}
            onBlur={() => setPreview(null)}
          >
            <span className="hidden font-mono text-[10px] text-ink/60 lg:block">{String(index + 1).padStart(2, '0')}</span>
            <div>
              <p className="font-semibold tracking-[-.025em] text-ink group-hover:text-ube">{model.name}</p>
              <p className="mt-1 text-xs text-ink/60 sm:hidden">{taskOf(model)} · {model.downloads} downloads (30d) · updated {model.updated}</p>
            </div>
            <span className={`model-task${model.task === '{{VERIFY}}' ? ' is-unlisted' : ''}`}>{taskOf(model)}</span>
            <span className="hidden text-xs text-ink/60 lg:block">{model.architecture}</span>
            <span className="hidden text-xs text-ink/60 xl:block">{model.trainingData}</span>
            <span className="hidden text-right text-xs text-ink/60 sm:block">
              <span className="block font-semibold tabular-nums text-ink/80">{model.downloads}</span>
              <span className="model-bar" aria-hidden="true"><i style={{ transform: `scaleX(${Math.max(0.02, Math.sqrt((Number(model.downloads) || 0) / peak))})` }} /></span>
              <small className="mt-1 block text-[10px] text-ink/60">Updated {model.updated}</small>
            </span>
            <ArrowUpRight className="h-4 w-4 text-ink/60 transition group-hover:text-ube" />
          </a>
        ))}
      </div>

      {preview && <ModelPreview model={preview.model} style={preview.style} />}

      {visible.length > 5 && (
        <div className="model-more">
          <button type="button" onClick={handleToggleDisplay} aria-expanded={isFullyExpanded}>
            {buttonText}
            {isFullyExpanded ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
          </button>
          <p>Showing {shown.length} of {visible.length}{filter === 'All models' ? '' : ` · ${filter}`}</p>
        </div>
      )}
    </div>
  </section>
}

function Openness() {
  const principles = [['Open science', 'Methods and artifacts can be inspected, challenged, and extended.'], ['Reproducibility', 'Clear provenance makes research more useful than a result alone.'], ['Digital sovereignty', 'The foundations for local technology should be accessible to the people it serves.'], ['Community ownership', 'Native speakers, researchers, and builders should have a place in the work.'], ['Ethical AI', 'Data choices matter. Limits, licenses, and consent need to travel with the data.'], ['Language preservation', 'Useful language data is infrastructure for future research, learning, and culture.']]
  return <section id="open" className="scroll-mt-24 pt-20 sm:pt-40"><div className="open-section"><div className="section-shell"><div className="grid gap-14 lg:grid-cols-[.82fr_1.18fr] lg:gap-24"><SectionHeading eyebrow="Why open data matters" title={<>Infrastructure<br />for a plural <em className="text-ube">future.</em></>}>Open data is not a footnote. It is how public-interest research becomes durable, accountable infrastructure.</SectionHeading><Reveal className="grid gap-x-8 gap-y-0 border-t border-ink/10 sm:grid-cols-2">{principles.map(([title, copy], index) => <article className="border-b border-ink/10 py-6" key={title}><p className="font-display text-2xl tracking-[-.045em] text-ube/80">0{index + 1}</p><h3 className="mt-3 font-semibold tracking-[-.035em] text-ink">{title}</h3><p className="mt-2 text-sm leading-6 text-ink/68">{copy}</p></article>)}</Reveal></div></div></div></section>
}

function CodeBlock() {
  const [copied, setCopied] = useState(false)
  const codeText = 'from datasets import load_dataset\n\ndataset = load_dataset("sapinsapin/pld")'

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* Fallback for clipboard permissions */
    }
  }

  return (
    <div className="code-sample mt-6 group">
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? 'Copied code snippet' : 'Copy code snippet'}
        title={copied ? 'Copied!' : 'Copy code'}
        className="absolute top-2.5 right-2.5 flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/75 backdrop-blur-sm transition-all hover:border-white/20 hover:bg-white/15 hover:text-white active:scale-95"
      >
        {copied ? (
          <CheckIcon className="h-3.5 w-3.5 text-pandan" />
        ) : (
          <CopyIcon className="h-3.5 w-3.5 text-white/70 transition-colors group-hover:text-white" />
        )}
      </button>
      <div className="pr-10">
        <span className="text-pandan">from</span> datasets <span className="text-pandan">import</span> load_dataset<br /><br />
        dataset = load_dataset(<span className="text-ube">&quot;sapinsapin/pld&quot;</span>)
      </div>
    </div>
  )
}

function Contribute() {
  const cards = [
    { icon: Dataset, number: '01', title: 'Use the datasets', text: 'Start with a dataset card, read its documentation, and build something useful for a Philippine language.', cta: 'Browse datasets', href: `${hub}?tab=datasets` },
    { icon: Code, number: '02', title: 'Contribute code', text: 'Explore the public repositories, open an issue, improve a pipeline, or share a reproducible experiment.', cta: 'Open GitHub', href: github },
    { icon: MarkMono, number: '03', title: 'Contribute data', text: 'If you work with a Philippine language as a researcher, annotator, native speaker, or engineer, start a conversation in a project issue.', cta: 'Start a conversation', href: 'https://github.com/sapinsapin/halohalo/issues' },
  ]
  return <section id="contribute" className="section-shell scroll-mt-24 pt-20 sm:pt-40"><div className="contribute-intro"><div><Eyebrow>It takes a village</Eyebrow><h2 className="mt-5 max-w-3xl font-display text-[clamp(2.5rem,5vw,5rem)] font-medium leading-[.96] tracking-[-.065em] text-ink">Help make Philippine AI <em className="text-ube">more possible.</em></h2></div><div className="max-w-md"><p className="text-[1.05rem] leading-7 text-ink/70">This work is designed to be used, questioned, and improved in public.</p><CodeBlock /></div></div><Reveal className="mt-4 grid gap-4 md:grid-cols-3">{cards.map(({ icon: Icon, number, title, text, cta, href }) => <article key={title} className="contribute-card"><div className="flex items-center justify-between"><Icon className="h-7 w-7 text-ube" /><span className="text-xs text-ink/60">{number}</span></div><h3 className="mt-12 text-xl font-semibold tracking-[-.045em] text-ink">{title}</h3><p className="mt-3 min-h-[72px] text-sm leading-6 text-ink/68">{text}</p><ExternalLink href={href} className="text-link mt-8" label={cta}>{cta} <ArrowUpRight className="h-4 w-4" /></ExternalLink></article>)}</Reveal></section>
}

function PartnersAndFaq() {
  const faqs = [
    ['Which license applies?', 'Licenses are dataset-specific. The catalog intentionally lists the license shown on each public Hub card; MIT and the UP-DSP research license appear among the current datasets. Always read the dataset card and its terms before use.'],
    ['Can I use the data commercially?', 'It depends on the individual dataset license and any access conditions. Do not infer commercial permission from this site; the linked Hugging Face dataset card is the source of record.'],
    ['How are datasets updated?', 'Dataset cards on the Hugging Face Hub show their own last-updated date and documentation. This homepage is designed around a catalog snapshot and should be refreshed from the Hub before each deployment.'],
    ['How do I contribute?', 'The current public invitation is to open an issue or discussion on a SapinSapin repository. This makes proposals, improvements, and questions visible to the community.'],
    ['What is the model roadmap?', 'The public catalog currently includes language, speech recognition, text-to-speech, and audio-to-audio models. For roadmap details, follow the organization\u2019s Hugging Face activity and public repositories.'],
  ]
  return <section id="faq" className="section-shell scroll-mt-24 pt-20 sm:pt-40"><div className="grid gap-16 lg:grid-cols-[.75fr_1.25fr] lg:gap-24"><div><SectionHeading eyebrow="Partners" title="Grounded in research.">The partner space is intentionally restrained until there is a verified list to show.</SectionHeading><div className="partner-card mt-10"><div className="partner-mark">UP</div><div><p className="font-semibold tracking-[-.035em] text-ink">UP Diliman DSP Laboratory</p><p className="mt-1 text-sm text-ink/63">Verified contributor to the underlying speech and text corpus work.</p></div></div></div><div><Eyebrow>Frequently asked questions</Eyebrow><div className="mt-5 divide-y divide-ink/10 border-y border-ink/10">{faqs.map(([question, answer]) => <details className="faq" key={question}><summary><h3 className="inline">{question}</h3><span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></div></div></section>
}


/* Appears once the reader has scrolled a screen or so down, so it can carry
   them straight back to the unscrolled, header-above-hero view. */
function BackToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        setVisible(window.scrollY > window.innerHeight * .6)
        frame = 0
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame) }
  }, [])

  return <button
    type="button"
    onClick={() => scrollToTop()}
    className="back-to-top"
    data-visible={visible}
    aria-hidden={!visible}
    tabIndex={visible ? 0 : -1}
    aria-label="Back to top"
  >
    <ArrowUp className="h-[1.1rem] w-[1.1rem]" />
  </button>
}

function Footer() {
  return <footer className="site-footer mt-20 sm:mt-40"><div className="section-shell py-14 sm:py-20"><div className="grid gap-12 lg:grid-cols-[1.25fr_.75fr_.75fr]"><div><div className="flex items-center gap-2.5"><Mark className="h-[2.1rem] w-[2.3rem]" /><p className="font-semibold tracking-[-.04em]">SapinSapin AI</p></div><p className="footer-body mt-5 max-w-sm text-sm leading-6">Open foundations for Philippine-language AI. Built with care for the layers that make a language live.</p></div><div><p className="footer-label">Find us</p><div className="footer-links"><ExternalLink href={github}>GitHub <ArrowUpRight className="h-3.5 w-3.5" /></ExternalLink><ExternalLink href={hub}>Hugging Face <ArrowUpRight className="h-3.5 w-3.5" /></ExternalLink><ExternalLink href="https://github.com/sapinsapin/halohalo/issues">Contact / contribute <ArrowUpRight className="h-3.5 w-3.5" /></ExternalLink><ExternalLink href="https://github.com/faeldon/philippines-json-maps">Map attribution <ArrowUpRight className="h-3.5 w-3.5" /></ExternalLink></div></div><div><p className="footer-label">Licensing</p><p className="footer-body mt-4 text-sm leading-6">No single project-wide license is implied. Individual datasets and models have their own terms, including MIT and other licenses. Check each linked card before use.</p></div></div><div className="footer-rule mt-14 flex flex-col justify-between gap-3 pt-5 text-[11px] sm:flex-row"><p>© 2026 SapinSapin AI</p><p>Catalog data synced {catalogSnapshot} · Designed for open research</p></div></div></footer>
}

function App() {
  const [theme, toggleTheme] = useTheme()

  // Anchor targets are rendered by React, so a #ref-… deep link has nothing to
  // scroll to at load time. Re-run the jump once the tree is on the page.
  // #top is a special case: the browser's own native anchor-scroll (which
  // fires on load before this even runs) lands the Hero's top edge at the
  // viewport top, hiding it behind the sticky header — the same bug the
  // brand-logo click works around. useLayoutEffect corrects it before paint
  // so a manual refresh on #top doesn't flash the wrong position first.
  useLayoutEffect(() => {
    if (window.location.hash === '#top') { window.scrollTo(0, 0); return }
  }, [])

  useEffect(() => {
    const { hash } = window.location
    if (!hash || hash.length < 2 || hash === '#top') return
    const target = document.getElementById(decodeURIComponent(hash.slice(1)))
    if (!target) return
    requestAnimationFrame(() => target.scrollIntoView({ block: 'center' }))
  }, [])

  const datasetsSchema = {
    '@context': 'https://schema.org',
    '@type': 'DataCatalog',
    name: 'SapinSapin AI — Open Philippine Language Dataset Catalog',
    url: `${hub}?tab=datasets`,
    description: 'A curated catalog of open speech corpora and pretraining text datasets for Philippine-language AI research, spanning 10+ languages including Filipino, Cebuano, Ilocano, and Hiligaynon.',
    provider: { '@type': 'Organization', name: 'SapinSapin AI', url: 'https://sapinsapin.ai' },
    dateModified: catalogSnapshot,
    inLanguage: ['fil', 'ceb', 'ilo', 'hil', 'bcl', 'pag', 'pam', 'tsg', 'war', 'en'],
    dataset: datasets.map(({ title, description, href, license }) => ({
      '@type': 'Dataset',
      name: title,
      description,
      url: href,
      license: license === '{{VERIFY}}' ? undefined : license,
    })),
  }

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Which license applies to SapinSapin AI datasets?', acceptedAnswer: { '@type': 'Answer', text: 'Licenses are dataset-specific. The catalog lists the license shown on each public Hub card; MIT and the UP-DSP research license appear among the current datasets. Always read the dataset card and its terms before use.' } },
      { '@type': 'Question', name: 'Can I use Philippine language AI data commercially?', acceptedAnswer: { '@type': 'Answer', text: 'It depends on the individual dataset license and any access conditions. Do not infer commercial permission from this site; the linked Hugging Face dataset card is the source of record.' } },
      { '@type': 'Question', name: 'How are Philippine language datasets updated?', acceptedAnswer: { '@type': 'Answer', text: 'Dataset cards on the Hugging Face Hub show their own last-updated date and documentation. This homepage is designed around a catalog snapshot and should be refreshed from the Hub before each deployment.' } },
      { '@type': 'Question', name: 'How do I contribute to SapinSapin AI?', acceptedAnswer: { '@type': 'Answer', text: 'The current public invitation is to open an issue or discussion on a SapinSapin repository. This makes proposals, improvements, and questions visible to the community.' } },
      { '@type': 'Question', name: 'What is the SapinSapin AI model roadmap?', acceptedAnswer: { '@type': 'Answer', text: 'The public catalog currently includes language, speech recognition, text-to-speech, and audio-to-audio models. For roadmap details, follow the organization\'s Hugging Face activity and public repositories.' } },
    ],
  }

  return <>
    <a href="#work" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-paper">Skip to content</a>
    <Nav theme={theme} onToggleTheme={toggleTheme} />
    <main aria-label="SapinSapin AI — Open foundations for Philippine-language AI"><Hero /><Demo /><Problem /><Impact /><Datasets /><Models /><Openness /><Contribute /><PartnersAndFaq /><References /></main>
    <Footer />
    <BackToTop />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(datasetsSchema) }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqSchema) }} />
  </>
}

export default App
