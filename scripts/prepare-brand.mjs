// Generates the social-media brand kit in brand/<platform>/ — an SVG source and
// an upload-ready PNG for every banner and profile picture.
//
// Banners follow public/og-card.svg: cream paper, faded grid, the brand mark's
// three bars as a landscape bleeding off the right edge, copy on the left. Each
// platform gets its own copy position so nothing lands under an avatar or
// outside the area a phone crop keeps.
//
// PNGs are rendered by headless Chrome so Fraunces and Inter load for real
// (set CHROME to override the macOS default path). Run: npm run prepare:brand

import { execFileSync } from 'node:child_process'
import { mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const INK = '#1A1613'
const PAPER = '#FBF7F0'
const [TOP, MID, BASE] = ['#EBD9AE', '#6E964A', '#5B3E96']

const fonts = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;1,9..144,500&amp;family=Inter:wght@400;500;600;700&amp;display=swap');
      .display { font-family: 'Fraunces', Georgia, serif; }
      .label { font-family: 'Inter', Arial, sans-serif; }`

const r = (value) => Math.round(value * 100) / 100

// W×H canvas. `band` is the horizontal strip the bars fill (the whole height,
// except on YouTube where only the middle strip is seen on desktop). The copy
// block is centred vertically on `cy`, starts at `x`, and is scaled by `k`
// relative to the 1640×624 Facebook cover. `compact` drops the eyebrow and URL
// and sets the tagline on one line, for strips too short for four rows.
// `right` is where the bars are measured from; it defaults to the canvas edge,
// and moves inward where a crop would otherwise cut the bars away entirely.
function banner({ W, H, band = [0, H], right = W, x, cy, k, compact = false, label }) {
  const [bandY, bandH] = band
  const u = bandH / 624
  const bars = [
    [390, -22, TOP],
    [520, 208, MID],
    [680, 438, BASE],
  ].map(([inset, y, fill]) => {
    const left = right - inset * u
    return `<rect x="${r(left)}" y="${r(bandY + y * u)}" width="${r(W - left + 70 * u)}" height="${r(208 * u)}" rx="${r(104 * u)}" fill="${fill}"/>`
  })

  const t = (dy, size, attrs, body) =>
    `<text x="${r(x)}" y="${r(cy + dy * k)}" class="display" font-weight="500" font-size="${r(size * k)}" letter-spacing="${r(-size * k / 49)}" ${attrs}>${body}</text>`

  const copy = compact
    ? [
        t(-10, 88, `fill="${INK}"`, 'SapinSapin AI'),
        t(62, 54, `fill="${INK}"`, `Every voice belongs <tspan font-style="italic" fill="${BASE}">in the future.</tspan>`),
      ]
    : [
        `<text x="${r(x)}" y="${r(cy - 145 * k)}" class="label" font-weight="700" font-size="${r(19 * k)}" letter-spacing="${r(3 * k)}" fill="${INK}" fill-opacity=".62">OPEN FOUNDATIONS FOR PHILIPPINE AI</text>`,
        t(-53, 88, `fill="${INK}"`, 'SapinSapin AI'),
        t(19, 54, `fill="${INK}"`, 'Every voice belongs'),
        t(83, 54, `font-style="italic" fill="${BASE}"`, 'in the future.'),
        `<g transform="translate(${r(x)} ${r(cy + 139 * k)}) scale(${r(k)})">
    <rect x="7" y="0" width="16" height="7" rx="3.5" fill="${TOP}"/>
    <rect x="3.5" y="9" width="23" height="7" rx="3.5" fill="${MID}"/>
    <rect x="0" y="18" width="30" height="7" rx="3.5" fill="${BASE}"/>
  </g>`,
        `<text x="${r(x + 42 * k)}" y="${r(cy + 159 * k)}" class="label" font-weight="600" font-size="${r(22 * k)}" letter-spacing="-.2" fill="${INK}" fill-opacity=".72">sapinsapin.ai</text>`,
      ]

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="SapinSapin AI — Every voice belongs in the future">
  <!-- ${label} -->
  <defs>
    <style>
      ${fonts}
    </style>
    <linearGradient id="gridFade" x1="0%" y1="0%" x2="72%" y2="88%">
      <stop offset="0%" stop-color="#fff"/>
      <stop offset="62%" stop-color="#000"/>
      <stop offset="100%" stop-color="#000"/>
    </linearGradient>
    <mask id="gridMask"><rect width="${W}" height="${H}" fill="url(#gridFade)"/></mask>
    <pattern id="grid" width="44" height="44" patternUnits="userSpaceOnUse">
      <path d="M44 0H0V44" fill="none" stroke="${INK}" stroke-opacity=".045"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" mask="url(#gridMask)"/>
  ${bars.join('\n  ')}
  ${copy.join('\n  ')}
</svg>
`
}

// Profile pictures are cropped to a circle almost everywhere, so the bars sit
// at 80% scale on a full cream square: the purple bar's corners clear the
// circle with room to spare instead of grazing it.
const avatar = (S) => `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 48 48" role="img" aria-label="SapinSapin AI">
  <rect width="48" height="48" fill="${PAPER}"/>
  <g transform="translate(24 24) scale(.8) translate(-24 -24)">
    <rect x="15" y="9" width="18" height="8" rx="4" fill="${TOP}"/>
    <rect x="11" y="20" width="26" height="8" rx="4" fill="${MID}"/>
    <rect x="7" y="31" width="34" height="8" rx="4" fill="${BASE}"/>
  </g>
</svg>
`

const assets = [
  // Facebook Page cover: 1640×624 is 2× the 820×312 desktop display. Phones
  // crop the sides to roughly x 265–1375, so the copy stays inside that band.
  ['facebook/facebook-cover-1640x624', banner({ W: 1640, H: 624, x: 300, cy: 310, k: 1, label: 'Facebook cover 1640x624 — mobile keeps x 265–1375' })],
  ['facebook/facebook-profile-720x720', avatar(720), 720, 720],

  // X header 1500×500 (3:1). The avatar overlaps the bottom-left, so the copy
  // starts right of it.
  ['x/x-header-1500x500', banner({ W: 1500, H: 500, x: 430, cy: 236, k: 0.8, label: 'X header 1500x500 — avatar covers the bottom-left' })],
  ['x/x-profile-400x400', avatar(400), 400, 400],

  // LinkedIn personal background 1584×396 (4:1): the profile photo covers the
  // bottom-left 568×264, so the copy starts past x 568.
  ['linkedin/linkedin-profile-banner-1584x396', banner({ W: 1584, H: 396, x: 610, cy: 184, k: 0.72, compact: true, label: 'LinkedIn personal background 1584x396 — keep clear of bottom-left 568x264' })],
  // LinkedIn Company Page cover 1128×191; the page logo sits over the left edge.
  ['linkedin/linkedin-company-cover-1128x191', banner({ W: 1128, H: 191, x: 250, cy: 92, k: 0.55, compact: true, label: 'LinkedIn Company Page cover 1128x191' })],
  ['linkedin/linkedin-logo-400x400', avatar(400), 400, 400],

  // YouTube 2560×1440: TVs show it all, desktop a 2560×423 strip, phones only
  // the 1546×423 centre. Bars are measured from x 2300 so phones still see
  // most of them, and the copy stays inside the centre.
  ['youtube/youtube-banner-2560x1440', banner({ W: 2560, H: 1440, band: [508, 423], right: 2300, x: 640, cy: 722, k: 0.95, label: 'YouTube banner 2560x1440 — safe area 1546x423 centred (x 507–2053, y 508–931)' })],
  ['youtube/youtube-profile-800x800', avatar(800), 800, 800],

  // Instagram shows profile pictures at 320px but keeps a larger upload sharp
  // on high-density screens. Instagram has no banner.
  ['instagram/instagram-profile-1080x1080', avatar(1080), 1080, 1080],
]

const sizeOf = (svg) => svg.match(/width="(\d+)" height="(\d+)"/).slice(1).map(Number)

if (!existsSync(CHROME)) throw new Error(`Chrome not found at ${CHROME}; set CHROME to render PNGs`)
const scratch = await mkdtemp(join(tmpdir(), 'brand-'))

for (const [name, svg] of assets) {
  const out = resolve('brand', name)
  await mkdir(resolve(out, '..'), { recursive: true })
  await writeFile(`${out}.svg`, svg)

  const [W, H] = sizeOf(svg)
  const page = join(scratch, 'page.html')
  await writeFile(page, `<!doctype html><style>html,body{margin:0;background:${PAPER}}svg{display:block}</style>${svg}`)
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    `--window-size=${W},${H}`, '--virtual-time-budget=8000',
    `--screenshot=${out}.png`, pathToFileURL(page).href,
  ], { stdio: 'ignore', timeout: 90_000 })
  console.log(`${name}.png · ${W}x${H}`)
}

await rm(scratch, { recursive: true, force: true })
