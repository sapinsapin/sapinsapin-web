#!/usr/bin/env node
// Builds the deployable RAG candidate Markdown from:
//   - hand-maintained durable prose (knowledge/base/*.md, *.json)
//   - the current structured public-state snapshot (knowledge/snapshots/current-public-state.json)
// Output: knowledge/generated/SapinSapin-knowledge-base-rag-current.md
//
// This is the successor to hand-editing the RAG file directly. From this point
// forward, knowledge/base/*.md should be edited for durable facts, and the
// snapshot should be refreshed (scripts/rag/refresh-sources.mjs) for volatile
// facts — never both edited by hand in the generated output.
//
// Deterministic, no LLM calls: table/section assembly is templated string
// interpolation over the snapshot JSON and the base Markdown files.

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')
const baseDir = resolve(repoRoot, 'knowledge/base')
const snapshotPath = resolve(repoRoot, 'knowledge/snapshots/current-public-state.json')
const outputPath = resolve(repoRoot, 'knowledge/generated/SapinSapin-knowledge-base-rag-current.md')

const PREDECESSOR = 'SapinSapin-knowledge-base-rag-v2.md (content-frozen candidate, 2026-09-22) — itself succeeding SapinSapin-knowledge-base-rag-ready.md (v1, production item id 87c37f86cb5c42a387e5fdaa5ec5ab09, deployed 2026-09-18)'

function fmtDay(iso) {
  if (!iso) return null
  return iso.slice(0, 10)
}

function licenseCell(dataset) {
  if (dataset.license_name) return `\`${dataset.license_name}\``
  if (dataset.license) return dataset.license.toUpperCase() === dataset.license ? dataset.license : dataset.license.toUpperCase()
  return 'Not stated on the public card'
}

function gateNote(dataset) {
  if (dataset.gated === 'auto-gate') return ' — behind an automatic Hugging Face access gate (agree-to-terms, not manually reviewed)'
  if (dataset.gated === 'manual-gate') return ' — behind a manually-reviewed Hugging Face access gate'
  return ''
}

function buildDatasetTable(snapshot, blurbs) {
  const rows = snapshot.datasets
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((d) => {
      const blurb = blurbs.datasets[d.name] || 'Published on the Hub and not yet described here — the dataset card is the source of record.'
      const langs = Array.isArray(d.languages) ? d.languages.join(', ') : 'Not stated'
      return `| \`${d.name}\` | ${blurb} | ${langs} | ${licenseCell(d)}${gateNote(d)} |`
    })
  return [
    '| Dataset | Content | Languages (Hub tag codes) | License / access |',
    '|---|---|---|---|',
    ...rows,
  ].join('\n')
}

function buildModelFamiliesSummary(snapshot, blurbs) {
  const byTask = new Map()
  for (const m of snapshot.models) {
    const key = m.pipeline_tag || 'unspecified'
    if (!byTask.has(key)) byTask.set(key, [])
    byTask.get(key).push(m.name)
  }
  const lines = []
  for (const [task, names] of byTask.entries()) {
    const note = blurbs.model_family_notes[task] || 'Additional model repositories in this category — check individual cards for specifics.'
    const label = task === 'unspecified' ? 'Untagged / other' : task.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    lines.push(`- **${label}** (${names.length} ${names.length === 1 ? 'repository' : 'repositories'}): ${note}`)
  }
  return lines.join('\n')
}

function buildTeamRosterTable(team) {
  const rows = team.map((p) => {
    const links = p.links.map((l) => `[${l.kind}](${l.href})`).join(', ')
    return `| ${p.name} | ${p.role} | ${links} |`
  })
  return [
    'The current sapinsapin-web site\u2019s People section lists the following team members: [confirmed \u2014 src/App.jsx, highest-authority source for roles]',
    '',
    '| Name | Role (per live site) | Links |',
    '|---|---|---|',
    ...rows,
  ].join('\n')
}

function buildInternetoftimNote(snapshot) {
  const list = snapshot.internetoftim_personal_models
  if (!Array.isArray(list)) {
    return 'Tim Santos is also linked from the official site as publishing on Hugging Face under his personal account, `huggingface.co/internetoftim` — a live check of that account was not available when this document was generated; do not describe its current contents without checking it directly.'
  }
  return `Tim Santos also publishes SapinSapin-related model artifacts under his own personal Hugging Face account, \`huggingface.co/internetoftim\` (${list.length} repositories at last check) \u2014 the official SapinSapin AI site itself links this account as where he "also publishes." Artifacts there (e.g. training checkpoints, sweep runs, some ONNX exports) are personal publications, not part of the \`sapinsapin\` organization's own catalog \u2014 check the specific card for license/status before citing anything hosted there, and do not conflate his personal account with the official organization catalog above. [confirmed \u2014 live HF API + site's own reference section]`
}

async function loadBaseFiles() {
  const files = (await readdir(baseDir)).filter((f) => f.endsWith('.md')).sort()
  const contents = {}
  for (const f of files) {
    contents[f] = await readFile(resolve(baseDir, f), 'utf8')
  }
  return { files, contents }
}

function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->\n?/g, '')
}

// Base files use "# NN — Title" for their own section heading and "##" for
// internal subsections. Concatenated under the document's own "#" title that
// would produce multiple H1s and a heading level clash. Demote by one level:
// section title becomes "##", its subsections become "###".
function demoteHeadings(text) {
  return text
    .split('\n')
    .map((line) => (line.startsWith('#') ? `#${line}` : line))
    .join('\n')
}

async function main() {
  const [snapshotRaw, blurbsRaw, { files, contents }] = await Promise.all([
    readFile(snapshotPath, 'utf8'),
    readFile(resolve(baseDir, 'editorial-blurbs.json'), 'utf8'),
    loadBaseFiles(),
  ])
  const snapshot = JSON.parse(snapshotRaw)
  const blurbs = JSON.parse(blurbsRaw)

  const generatedAt = new Date().toISOString()
  const snapshotDate = fmtDay(snapshot.generated_at)

  const placeholders = {
    '{{TEAM_ROSTER_TABLE}}': buildTeamRosterTable(snapshot.team),
    '{{CATALOG_SUMMARY_LINE}}': `Catalog totals as of ${snapshotDate}: ${snapshot.totals.datasets} public datasets, ${snapshot.totals.models} public models on huggingface.co/sapinsapin. **This count changes as the org publishes new work \u2014 always prefer the live Hugging Face org page over this number if the user needs a current total.** [confirmed via HF public API]`,
    '{{DATASET_TABLE}}': buildDatasetTable(snapshot, blurbs),
    '{{MODEL_FAMILIES_SUMMARY}}': `${snapshot.totals.models} public model repositories exist on huggingface.co/sapinsapin as of ${snapshotDate}, grouped by task:\n\n${buildModelFamiliesSummary(snapshot, blurbs)}`,
    '{{INTERNETOFTIM_NOTE}}': buildInternetoftimNote(snapshot),
  }

  const sections = files
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      let text = stripHtmlComments(contents[f]).trim()
      text = demoteHeadings(text)
      for (const [token, value] of Object.entries(placeholders)) {
        text = text.split(token).join(value)
      }
      return text
    })

  const frontMatter = [
    '---',
    'document_type: sappy-rag-knowledge-base',
    'version: "3.0-generated"',
    'status: CANDIDATE \u2014 NOT YET DEPLOYED. Generated automatically from knowledge/base/*.md and knowledge/snapshots/current-public-state.json. Must not be treated as production until Marc explicitly approves and deploys it via the procedure in docs/SAPPY-RAG-UPDATE-PROCEDURE.md.',
    `predecessor: ${PREDECESSOR}`,
    `knowledge_snapshot_date: "${snapshotDate}"`,
    `generated_at: "${generatedAt}"`,
    'canonical_source_policy: ssai/docs/KNOWLEDGE-SOURCES.md (authority hierarchy: live infra/repo > live first-party site/HF/repo > canonical SSAI docs > this RAG lineage > general research snapshot > inference)',
    'source_manifest: knowledge/rag-sources.yaml',
    'scope: Public-facing knowledge for Sappy (Discord + web chat assistant). Contains no secrets, account IDs, Discord IDs, OAuth details, or internal deployment instructions \u2014 see ssai/docs/SAPPY-OPERATIONS.md for that internal material.',
    '---',
    '',
    '# SapinSapin AI \u2014 Knowledge Base for Sappy (generated candidate)',
    '',
  ].join('\n')

  const body = sections.join('\n\n')
  const output = frontMatter + body + '\n'

  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, output)

  console.log(`Generated ${outputPath.replace(repoRoot + '/', '')} (${output.length} bytes, ${sections.length} sections, snapshot ${snapshotDate}).`)
}

main().catch((err) => {
  console.error('generate-rag.mjs crashed:', err)
  process.exit(1)
})
