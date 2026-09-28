// Asserts every suggestion chip in ChatWidget is a question the Worker's
// router will actually send to the project's knowledge.
//
// This exists because a chip shipped that the corpus cannot answer. The chip
// "Paano ako makakapag-ambag?" asked how to contribute, the knowledge base has
// sections on datasets, models, licensing and people but no contribution
// process, and Sappy replied that it had no verified information and suggested
// asking in the Discord instead. A suggestion chip is a promise: the site is
// asking the question on the visitor's behalf, so anything it offers has to be
// one Sappy can stand behind.
//
// It checks the routing half, which is the half that can be checked without a
// network. The other half — that the corpus actually answers it — is not
// automatable here, and must be verified against the live Worker before a chip
// is changed:
//
//   curl -s "https://sappy-ai.primary-bd7.workers.dev/?q=<urlencoded chip>"
//
// Read the answer, not just the mode. `project_rag` with "wala akong sapat na
// verified na impormasyon" still means the chip is unanswerable.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { isProjectQuestion } from '../worker/src/index.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const widget = readFileSync(resolve(root, 'src/components/ChatWidget.jsx'), 'utf8')

const match = widget.match(/const SUGGESTIONS\s*=\s*\[([^\]]*)\]/)
if (!match) {
  console.error('Could not find the SUGGESTIONS array in src/components/ChatWidget.jsx')
  process.exit(1)
}

const chips = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
if (chips.length === 0) {
  console.error('SUGGESTIONS parsed as empty — the chip format may have changed')
  process.exit(1)
}

const unroutable = chips.filter((chip) => !isProjectQuestion(chip))
if (unroutable.length) {
  console.error('chip check failed — these chips would be answered by the boundary, not the knowledge:')
  for (const chip of unroutable) console.error(`  - ${chip}`)
  process.exit(1)
}

console.log(`chip check OK — all ${chips.length} chips route to the project's knowledge`)
for (const chip of chips) console.log(`  - ${chip}`)
