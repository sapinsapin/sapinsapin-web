// Compare source facts, not generation/as-of dates. Never edits files.
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const path = 'knowledge/snapshots/current-public-state.json';
function facts(raw) {
  const { generated_at, ...value } = JSON.parse(raw);
  for (const [key, items] of Object.entries(value)) {
    if (Array.isArray(items)) value[key] = items.slice().sort((a,b) => String(a.id ?? a.name).localeCompare(String(b.id ?? b.name)));
  }
  return JSON.stringify(value);
}
const previous = execFileSync('git', ['show', `HEAD:${path}`], { encoding: 'utf8' });
console.log(facts(previous) === facts(await readFile(path, 'utf8')) ? 'false' : 'true');
