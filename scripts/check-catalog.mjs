// Asserts the invariant the page's credibility rests on: the headline counts and
// the rendered rows come from the same place.
//
// src/data/catalog.js used to map over hardcoded arrays while the counts came
// from the synced snapshot, so publishing a repo made the page say "29 models"
// above a table of 28. That is now structural — the catalog iterates the
// snapshot — and this script is what keeps it that way, because the failure is
// invisible to `npm run build`: the mismatch compiles perfectly.
//
// Run it in CI after a sync and before the push that deploys.

import { datasets, models, totals } from '../src/data/catalog.js'
import { hubDatasets, hubModels, syncedAt } from '../src/data/hubSnapshot.js'

const problems = []

if (models.length !== totals.models) {
  problems.push(`models: snapshot totals say ${totals.models}, catalog renders ${models.length}`)
}
if (datasets.length !== totals.datasets) {
  problems.push(`datasets: snapshot totals say ${totals.datasets}, catalog renders ${datasets.length}`)
}

const missing = (kind, live, rendered) => {
  const shown = new Set(rendered)
  const gone = live.filter((id) => !shown.has(id))
  if (gone.length) problems.push(`${kind} on the Hub but not rendered: ${gone.join(', ')}`)
}
missing('models', hubModels.map((m) => m.name), models.map((m) => m.name))
missing('datasets', hubDatasets.map((d) => d.id), datasets.map((d) => d.id))

// A snapshot older than this is a sync that silently stopped running.
const STALE_DAYS = 10
const age = Math.floor((Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`) - Date.parse(`${syncedAt}T00:00:00Z`)) / 86400000)
if (age > STALE_DAYS) problems.push(`snapshot is ${age} days old (syncedAt ${syncedAt}) — the sync is not running`)

if (problems.length) {
  console.error('catalog check FAILED:')
  for (const p of problems) console.error(`  · ${p}`)
  process.exit(1)
}
console.log(`catalog check OK — ${models.length} models, ${datasets.length} datasets, synced ${syncedAt} (${age}d old)`)
