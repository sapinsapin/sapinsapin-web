// Keeps the Content-Security-Policy in vercel.json honest against what the build
// actually emits.
//
// The CSP allows exactly one inline script, by hash — the pre-paint theme
// resolver. Edit that script and the hash goes stale, at which point the browser
// blocks it and the page loses BOTH its theme (flash of the wrong palette) and
// its webfonts, because the font sheet's media flip lives in that same script.
// Nothing else catches this: the build succeeds, and the failure only appears
// on a deployed page with the header attached.
//
// It also fails on any inline event handler (onclick=, onload=, …). Hashes do
// not cover those — only 'unsafe-hashes' does, which is worth avoiding — so one
// reintroduced handler would silently stop working in production.
//
// Run after `npm run build`.

import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

const DOCS = ['dist/index.html', 'dist/404.html']
const problems = []

const vercel = JSON.parse(await readFile(resolve('vercel.json'), 'utf8'))
const csp = vercel.headers
  ?.flatMap((entry) => entry.headers ?? [])
  .find((header) => header.key === 'Content-Security-Policy')?.value

if (!csp) {
  console.error('csp check FAILED: no Content-Security-Policy header in vercel.json')
  process.exit(1)
}

// Comments are stripped first: the analytics block is commented out, and a
// commented <script> is not executed, so its hash must not be required.
const stripComments = (html) => html.replace(/<!--[\s\S]*?-->/g, '')
const INLINE = /<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/g
const HANDLER = /\son[a-z]+\s*=\s*["']/g

for (const doc of DOCS) {
  let html
  try {
    html = stripComments(await readFile(resolve(doc), 'utf8'))
  } catch {
    problems.push(`${doc} is missing — run \`npm run build\` first`)
    continue
  }

  for (const [, body] of html.matchAll(INLINE)) {
    const hash = `sha256-${createHash('sha256').update(body).digest('base64')}`
    if (!csp.includes(hash)) {
      problems.push(`${doc}: inline script not allowed by the CSP — add '${hash}' to script-src`)
    }
  }

  const handlers = [...html.matchAll(HANDLER)].map((m) => m[0].trim())
  if (handlers.length) {
    problems.push(`${doc}: inline event handler(s) the CSP will block: ${handlers.join(', ')}`)
  }
}

if (problems.length) {
  console.error('csp check FAILED:')
  for (const problem of problems) console.error(`  · ${problem}`)
  process.exit(1)
}
console.log('csp check OK — every inline script is hashed in the CSP, no inline handlers')
