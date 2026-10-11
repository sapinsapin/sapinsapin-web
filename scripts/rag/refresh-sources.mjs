#!/usr/bin/env node
// Refreshes knowledge/snapshots/current-public-state.json from live, first-party
// public sources (Hugging Face API, GitHub API, and the live site's own source
// file). Purely mechanical — no LLM calls. Every value here is either a direct
// API field or a regex/structural extraction from a known file shape.
//
// This script is safe to run repeatedly and safe to run in CI: it only ever
// writes inside knowledge/snapshots/ in the local working tree. It never
// touches Cloudflare, never touches production, and never touches the
// generated RAG file directly (that's generate-rag.mjs's job, run separately).
//
// Usage: node scripts/rag/refresh-sources.mjs [--offline-fixture <path>]
//   --offline-fixture reads a pre-fetched JSON bundle instead of hitting the
//   network — used by tests/CI dry-runs to stay deterministic without
//   depending on live third-party APIs being reachable at test time.

import { fetchJsonPages as fetchJson } from './source-utils.mjs'
import { mkdir, readFile, writeFile, copyFile, access } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')
const snapshotPath = resolve(repoRoot, 'knowledge/snapshots/current-public-state.json')
const historyDir = resolve(repoRoot, 'knowledge/snapshots/history')
const appJsxPath = resolve(repoRoot, 'src/App.jsx')

const HF_ORG = 'sapinsapin'
const HF_PERSONAL = 'internetoftim'
const GH_ORG = 'sapinsapin'

const args = process.argv.slice(2)
const fixtureIdx = args.indexOf('--offline-fixture')
const fixturePath = fixtureIdx >= 0 ? args[fixtureIdx + 1] : null

// ---- Hugging Face: org catalog (tier 1, authoritative for counts/licenses) ----

const licenseOf = (tags = []) => {
  const tag = tags.find((t) => t.startsWith('license:'))
  const value = tag ? tag.slice('license:'.length) : null
  return value && value !== 'other' ? value : null
}

async function fetchHfOrgCatalog(org) {
  const [models, datasets] = await Promise.all([
    fetchJson(`https://huggingface.co/api/models?author=${org}&full=true`),
    fetchJson(`https://huggingface.co/api/datasets?author=${org}&full=true`),
  ])
  return {
    models: models.map((m) => ({
      id: m.id,
      name: m.id.split('/').pop(),
      pipeline_tag: m.pipeline_tag ?? null,
      gated: m.gated === 'auto' ? 'auto-gate' : m.gated === 'manual' ? 'manual-gate' : Boolean(m.gated),
      private: Boolean(m.private),
      lastModified: m.lastModified ?? null,
      license: licenseOf(m.tags) || (m.cardData || {}).license || null, // explicit public metadata only
    })),
    datasets: datasets.map((d) => ({
      id: d.id,
      name: d.id.split('/').pop(),
      gated: d.gated === 'auto' ? 'auto-gate' : d.gated === 'manual' ? 'manual-gate' : Boolean(d.gated),
      private: Boolean(d.private),
      lastModified: d.lastModified ?? null,
      license: licenseOf(d.tags) || (d.cardData || {}).license || null,
      license_name: (d.cardData || {}).license_name ?? null, // e.g. "up-dsp-research" for pld
      languages: (d.cardData || {}).language ?? null,
    })),
  }
}

async function fetchHfSpaces(org) {
  const spaces = await fetchJson(`https://huggingface.co/api/spaces?author=${org}`)
  return spaces.map((s) => ({ id: s.id, sdk: s.sdk ?? null, createdAt: s.createdAt ?? null }))
}

async function fetchGithubRepos(org) {
  try {
    const repos = await fetchJson(`https://api.github.com/orgs/${org}/repos?per_page=100`)
    return repos.filter(r => !r.private).map((r) => ({ name: r.name, private: r.private, archived: r.archived, description: r.description ?? null }))
  } catch (err) {
    // A missing supporting source must preserve the prior complete snapshot.
    console.warn(`  ! GitHub org repo list unavailable: ${err.message}`)
    throw new Error(`GitHub public repository lookup failed: ${err.message}`)
  }
}

// ---- Live site source: team roster + references, parsed directly from JSX ----
// This intentionally does NOT use a JS/JSX parser dependency — the array shape
// in src/App.jsx is simple and stable enough for a targeted regex, and adding
// a full AST toolchain for two small arrays would be disproportionate. If this
// extraction ever returns zero people, the script treats it as a hard failure
// (see main()) rather than silently shipping an empty roster.

// Regex-extracted string literals still contain raw JS escape sequences
// (e.g. "World\u2019s" for World's) since we never actually evaluate the
// source. Decode the handful of escapes this file actually uses rather than
// pulling in a JS parser dependency for two small arrays.
function decodeJsStringEscapes(str) {
  return str
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
}

function parsePeopleFromAppJsx(source) {
  const peopleBlockMatch = source.match(/const people = \[([\s\S]*?)\n\]/)
  if (!peopleBlockMatch) return null
  const block = peopleBlockMatch[1]
  // Split on top-level object boundaries ("{ ... }," at depth 1) — the people
  // array is flat (no nested arrays/objects deeper than links: [...]), so a
  // brace-depth scan is reliable here.
  const people = []
  let depth = 0
  let current = ''
  for (const ch of block) {
    if (ch === '{') { depth++; if (depth === 1) { current = ''; continue } }
    if (ch === '}') { depth--; if (depth === 0) { people.push(current); continue } }
    if (depth >= 1) current += ch
  }
  const parsed = people.map((entry) => {
    const name = entry.match(/name:\s*'((?:\\.|[^'\\])*)'/)?.[1] ?? null
    const role = entry.match(/role:\s*'((?:\\.|[^'\\])*)'/)?.[1] ?? null
    const links = [...entry.matchAll(/kind:\s*'([^']+)',\s*href:\s*'([^']+)'/g)].map(([, kind, href]) => ({ kind, href }))
    return { name, role, links }
  })
  if (parsed.some(p => !p.name || !p.role || p.links.length === 0)) throw new Error('Partial team roster extraction; refusing incomplete people data.')
  return parsed
}

function parseReferencesFromAppJsx(source) {
  const refBlockMatch = source.match(/const references = \[([\s\S]*?)\n\]/)
  if (!refBlockMatch) return []
  const block = refBlockMatch[1]
  const entries = []
  let depth = 0
  let current = ''
  for (const ch of block) {
    if (ch === '{') { depth++; if (depth === 1) { current = ''; continue } }
    if (ch === '}') { depth--; if (depth === 0) { entries.push(current); continue } }
    if (depth >= 1) current += ch
  }
  const parsed = entries.map((entry) => ({
    id: entry.match(/id:\s*'((?:\\.|[^'\\])*)'/)?.[1] ?? null,
    title: decodeJsStringEscapes(entry.match(/title:\s*'((?:\\.|[^'\\])*)'/)?.[1] ?? ''),
    authors: decodeJsStringEscapes(entry.match(/authors:\s*'((?:\\.|[^'\\])*)'/)?.[1] ?? ''),
    where: entry.match(/where:\s*'((?:\\.|[^'\\])*)'/)?.[1] ?? null,
    href: entry.match(/href:\s*'((?:\\.|[^'\\])*)'/)?.[1] ?? null,
  }))
  if (parsed.some(r => !r.id || !r.title || !r.href)) throw new Error('Partial source reference extraction; refusing incomplete references.')
  return parsed
}

async function main() {
  console.log('Refreshing SSAI public-source snapshot...')
  let bundle

  if (fixturePath) {
    console.log(`  (offline mode: reading fixture ${fixturePath})`)
    bundle = JSON.parse(await readFile(fixturePath, 'utf8'))
  } else {
    const [orgCatalog, personalCatalog, spaces, ghRepos, appJsxSource] = await Promise.all([
      fetchHfOrgCatalog(HF_ORG),
      fetchHfOrgCatalog(HF_PERSONAL).then((r) => r.models),
      fetchHfSpaces(HF_ORG),
      fetchGithubRepos(GH_ORG),
      readFile(appJsxPath, 'utf8'),
    ])
    bundle = {
      hf_org: orgCatalog,
      hf_personal_internetoftim: personalCatalog,
      hf_spaces: spaces,
      github_repos: ghRepos,
      site_people: parsePeopleFromAppJsx(appJsxSource),
      site_references: parseReferencesFromAppJsx(appJsxSource),
    }
  }

  // Hard-fail conditions: these are facts a bad refresh must never silently drop.
  const problems = []
  if (!Array.isArray(bundle.site_references) || !bundle.site_references.length) problems.push('Could not extract site references; refusing incomplete snapshot.')
  if (!Array.isArray(bundle.github_repos) || !Array.isArray(bundle.hf_personal_internetoftim)) problems.push('Supporting public sources unavailable; preserving previous snapshot.')
  if (!bundle.site_people || bundle.site_people.length === 0) {
    problems.push('Could not extract any team members from src/App.jsx — the file shape may have changed. Refusing to overwrite the snapshot with an empty roster.')
  }
  if (!bundle.hf_org || !Array.isArray(bundle.hf_org.models) || !Array.isArray(bundle.hf_org.datasets)) {
    problems.push('Hugging Face org catalog fetch did not return the expected shape.')
  }
  if (bundle.hf_org?.models?.length === 0 || bundle.hf_org?.datasets?.length === 0) problems.push('Empty organization catalog; refusing to erase previously known public assets.')
  if (problems.length) {
    console.error('refresh-sources FAILED:')
    for (const p of problems) console.error(`  · ${p}`)
    process.exit(1)
  }

  const snapshot = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    sources_manifest_ref: 'knowledge/rag-sources.yaml',
    totals: {
      models: bundle.hf_org.models.length,
      datasets: bundle.hf_org.datasets.length,
    },
    datasets: bundle.hf_org.datasets,
    models: bundle.hf_org.models,
    spaces: bundle.hf_spaces,
    internetoftim_personal_models: Array.isArray(bundle.hf_personal_internetoftim)
      ? bundle.hf_personal_internetoftim.map((m) => ({ id: m.id, name: m.name, lastModified: m.lastModified }))
      : { error: bundle.hf_personal_internetoftim?.error ?? 'unavailable' },
    github_repos: bundle.github_repos,
    team: bundle.site_people,
    site_references: bundle.site_references,
  }

  // Preserve the previous snapshot for change detection before overwriting.
  await mkdir(historyDir, { recursive: true })
  try {
    await access(snapshotPath)
    const prev = await readFile(snapshotPath, 'utf8')
    const prevParsed = JSON.parse(prev)
    const stamp = (prevParsed.generated_at || 'unknown').replace(/[:.]/g, '-')
    await copyFile(snapshotPath, resolve(historyDir, `${stamp}.json`))
  } catch {
    // No previous snapshot yet — first run, nothing to archive.
  }

  await mkdir(dirname(snapshotPath), { recursive: true })
  await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2) + '\n')

  console.log(
    `Snapshot written: ${snapshot.totals.models} models, ${snapshot.totals.datasets} datasets, ` +
    `${snapshot.team.length} team members, ${snapshot.site_references.length} references.`,
  )
}

main().catch((err) => {
  console.error('refresh-sources.mjs crashed:', err)
  process.exit(1)
})
