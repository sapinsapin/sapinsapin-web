#!/usr/bin/env node
// Deterministic validation for the generated RAG candidate. Fails loudly (exit
// code 1) on structural problems and flags-for-human-review anything it
// cannot itself prove correct — it never marks an unverifiable claim as safe.
//
// Usage: node scripts/rag/validate-rag.mjs
// Exit codes: 0 = pass (may still have WARN-level flags), 1 = hard failure.

import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')
const generatedPath = resolve(repoRoot, 'knowledge/generated/SapinSapin-knowledge-base-rag-current.md')
const snapshotPath = resolve(repoRoot, 'knowledge/snapshots/current-public-state.json')
const qaPath = resolve(repoRoot, 'knowledge/qa/questions.json')

// Size sanity thresholds — the point is to catch a badly broken generation
// (empty file, or a runaway duplicate-section bug), not to police prose style.
const MIN_BYTES = 8_000
const MAX_BYTES = 60_000
const EXPECTED_SECTION_COUNT_RANGE = [6, 12] // number of "## " headings expected

const REQUIRED_SECTION_KEYWORDS = [
  'What SapinSapin AI is',
  'Leadership and team',
  'Datasets and models',
  'Demonstrated vs. aspirational capabilities',
  'Web presence',
  'Safe-answer and qualification rules',
  'Source register',
]

// Patterns that must NEVER appear in a public RAG file, regardless of source.
const FORBIDDEN_PATTERNS = [
  { name: 'Cloudflare account id', re: /\bbd7cc1ad3407fb0024c197108e016285\b/ },
  { name: 'Discord snowflake ID (17-19 digit numeric string)', re: /\b\d{17,19}\b/ },
  { name: 'generic API-key-shaped token', re: /\b(sk|pk|ghp|gho|ghs|github_pat)_[A-Za-z0-9]{16,}\b/ },
  { name: 'AWS-style access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'private key header', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'bearer token pattern', re: /\bBearer\s+[A-Za-z0-9\-_.]{20,}\b/ },
  { name: 'explicit .env-style secret assignment', re: /\b[A-Z_]{4,}_(SECRET|TOKEN|KEY)\s*[:=]\s*['"]?[A-Za-z0-9]{8,}/ },
  { name: 'literal internal wrangler/account/zone id label', re: /\b(account_id|zone_id)\s*[:=]\s*['"]?[a-f0-9]{16,}/i },
]

const PLACEHOLDER_LEFTOVERS = [/\{\{[A-Z_]+\}\}/, /\{\{VERIFY\}\}/]

function fail(problems, msg) { problems.push({ level: 'FAIL', msg }) }
function warn(problems, msg) { problems.push({ level: 'WARN', msg }) }

async function main() {
  const problems = []

  let content
  try {
    content = await readFile(generatedPath, 'utf8')
  } catch {
    fail(problems, `Generated RAG file not found at ${generatedPath} — did generate-rag.mjs run?`)
    report(problems)
    return
  }

  // --- Empty / size sanity ---
  if (content.trim().length === 0) fail(problems, 'Generated RAG file is empty.')
  if (content.length < MIN_BYTES) fail(problems, `Generated RAG file is only ${content.length} bytes — below the ${MIN_BYTES}-byte sanity floor. Likely a broken generation.`)
  if (content.length > MAX_BYTES) warn(problems, `Generated RAG file is ${content.length} bytes — above the ${MAX_BYTES}-byte expected ceiling. Check for accidental duplication before approving.`)

  // --- Front matter presence ---
  const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (!frontMatterMatch) {
    fail(problems, 'No YAML front matter block found.')
  } else {
    const fm = frontMatterMatch[1]
    for (const field of ['document_type', 'version', 'status', 'predecessor', 'knowledge_snapshot_date', 'generated_at', 'canonical_source_policy', 'scope']) {
      if (!fm.includes(`${field}:`)) fail(problems, `Front matter missing required field: ${field}`)
    }
    if (!/status:.*CANDIDATE|status:.*CONTENT-FROZEN/i.test(fm)) {
      fail(problems, 'Front matter "status" field does not clearly mark this as a non-production candidate. Refusing to treat an ambiguous status as safe.')
    }
    if (!fm.match(/knowledge_snapshot_date:\s*"?\d{4}-\d{2}-\d{2}/)) {
      fail(problems, 'Missing or malformed knowledge_snapshot_date in front matter.')
    }
  }

  // --- Required sections present, no duplicates ---
  const headings = [...content.matchAll(/^#{2,3}\s+(.+)$/gm)].map((m) => m[1].trim())
  for (const required of REQUIRED_SECTION_KEYWORDS) {
    const found = headings.filter((h) => h.includes(required))
    if (found.length === 0) fail(problems, `Missing required section: "${required}"`)
    if (found.length > 1) fail(problems, `Duplicate section detected for: "${required}" (found ${found.length} times)`)
  }
  const sectionCount = (content.match(/^##\s+/gm) || []).length
  const [minS, maxS] = EXPECTED_SECTION_COUNT_RANGE
  if (sectionCount < minS || sectionCount > maxS) {
    warn(problems, `Section count is ${sectionCount}, outside the expected ${minS}-${maxS} range — check for a structural regression.`)
  }

  // --- Placeholder leftovers (unfilled template tokens) ---
  for (const re of PLACEHOLDER_LEFTOVERS) {
    if (re.test(content)) fail(problems, `Unfilled placeholder token found matching ${re} — the generator did not substitute everything.`)
  }

  // --- Forbidden content: secrets / internal identifiers ---
  for (const { name, re } of FORBIDDEN_PATTERNS) {
    const m = content.match(re)
    if (m) fail(problems, `Forbidden pattern detected (${name}): "${m[0].slice(0, 12)}..." — this must never appear in the public RAG.`)
  }

  // --- Cross-check volatile counts against the snapshot that generated them ---
  let snapshot
  try {
    snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'))
  } catch {
    fail(problems, `Could not read/parse ${snapshotPath} to cross-check volatile counts.`)
  }
  if (snapshot) {
    const modelCountInText = content.match(/(\d+)\s+public model repositories exist/)
    const datasetCountInText = content.match(/(\d+)\s+public datasets/)
    if (modelCountInText && Number(modelCountInText[1]) !== snapshot.totals.models) {
      fail(problems, `Model count in generated text (${modelCountInText[1]}) does not match the source snapshot (${snapshot.totals.models}) — generator/snapshot are out of sync.`)
    }
    if (datasetCountInText && Number(datasetCountInText[1]) !== snapshot.totals.datasets) {
      fail(problems, `Dataset count in generated text (${datasetCountInText[1]}) does not match the source snapshot (${snapshot.totals.datasets}) — generator/snapshot are out of sync.`)
    }
    // Explicit license claims must trace to a snapshot value — flag any
    // license word appearing in the dataset table that isn't backed by the
    // snapshot's own license/license_name fields for that exact dataset.
    const knownLicenseTokens = new Set()
    for (const d of snapshot.datasets) {
      if (d.license) knownLicenseTokens.add(String(d.license).toLowerCase())
      if (d.license_name) knownLicenseTokens.add(String(d.license_name).toLowerCase())
    }
    const tableSection = content.split('## Datasets and models')[1]?.split('##')[0] ?? ''
    const licenseWordsInTable = [...tableSection.matchAll(/\|\s*`([a-z0-9_-]+)`\s*\|[^|]*\|[^|]*\|([^|]*)\|/gi)]
    for (const [, datasetName, licenseCell] of licenseWordsInTable) {
      const cellLower = licenseCell.toLowerCase()
      if (cellLower.includes('not stated')) continue
      const matchesKnown = [...knownLicenseTokens].some((tok) => cellLower.includes(tok))
      if (!matchesKnown && cellLower.trim()) {
        warn(problems, `Dataset "${datasetName}" license cell ("${licenseCell.trim()}") does not obviously match any license value in the source snapshot — flagging for human review rather than assuming correctness.`)
      }
    }
    // Snapshot staleness.
    const snapshotAgeDays = Math.floor((Date.now() - new Date(snapshot.generated_at).getTime()) / 86400000)
    if (snapshotAgeDays > 45) {
      warn(problems, `Source snapshot is ${snapshotAgeDays} days old (generated_at ${snapshot.generated_at}) — consider re-running refresh-sources.mjs before treating this candidate as current.`)
    }
  }

  // --- Blanket-claim language scan (heuristic, always human-reviewable) ---
  const blanketPhrases = [
    /supports all Philippine languages/i,
    /fully supports every/i,
    /production-ready(?!.{0,40}\bnot\b)/i,
    /benchmarked (?:as )?(?:the )?(?:best|state.of.the.art)/i,
    /is used by the (?:Philippine )?government/i,
    /deployed in (?:hospitals|clinics|government)/i,
  ]
  for (const re of blanketPhrases) {
    if (re.test(content)) fail(problems, `Overclaim-shaped phrase detected matching ${re} — review and rephrase before this candidate can be approved.`)
  }

  // --- QA question keyword sanity (cheap proxy, not a retrieval test) ---
  let qa
  try {
    qa = JSON.parse(await readFile(qaPath, 'utf8'))
  } catch {
    warn(problems, `Could not read ${qaPath} — skipping QA keyword sanity check.`)
  }
  if (qa) {
    for (const q of qa.questions) {
      const hasAny = (q.must_mention_any || []).length === 0 || (q.must_mention_any || []).some((kw) => content.toLowerCase().includes(kw.toLowerCase()))
      if (!hasAny) fail(problems, `QA question "${q.id}" (${q.question}) — none of its expected keywords appear anywhere in the generated document. Retrieval would likely surface nothing useful.`)
      for (const bad of q.must_not_mention || []) {
        if (content.toLowerCase().includes(bad.toLowerCase())) fail(problems, `QA question "${q.id}" — forbidden phrase "${bad}" found in the generated document.`)
      }
    }
  }

  report(problems)
}

function report(problems) {
  const fails = problems.filter((p) => p.level === 'FAIL')
  const warns = problems.filter((p) => p.level === 'WARN')

  if (warns.length) {
    console.log(`\n${warns.length} item(s) flagged for human review (not blocking):`)
    for (const w of warns) console.log(`  ⚠ ${w.msg}`)
  }
  if (fails.length) {
    console.error(`\n${fails.length} FAILURE(S):`)
    for (const f of fails) console.error(`  ✗ ${f.msg}`)
    console.error('\nvalidate-rag.mjs: FAILED')
    process.exit(1)
  }
  console.log(`\nvalidate-rag.mjs: PASSED${warns.length ? ' (with human-review flags above)' : ''}`)
}

main().catch((err) => {
  console.error('validate-rag.mjs crashed:', err)
  process.exit(1)
})
