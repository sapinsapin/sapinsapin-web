#!/usr/bin/env node
// Backup, replace, and verify the single production RAG item in Cloudflare AI Search.
// Cloudflare credentials are read from the environment and are never logged.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
// Item IDs can change when an AI Search item is recreated. The key is the
// durable identity; discover its current ID before touching production.
const productionKey = 'SapinSapin-knowledge-base-rag-current.md'
const instance = 'sappy-knowledge'
const namespace = 'default'
const backupDir = process.env.RAG_BACKUP_DIR || resolve(process.env.RUNNER_TEMP || '/tmp', 'rag-production-backup')
const sourcePath = resolve(root, 'knowledge/generated/SapinSapin-knowledge-base-rag-current.md')
const qaPath = resolve(root, 'knowledge/qa/questions.json')
const apiRoot = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai-search/namespaces/${namespace}/instances/${instance}`

function requiredEnv() {
  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error('Cloudflare credentials are missing.')
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${apiRoot}${path}`, {
    ...options,
    signal: AbortSignal.timeout(path === '/items' ? 90_000 : 20_000),
    headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, ...options.headers },
  })
  if (!response.ok) throw new Error(`Cloudflare API returned HTTP ${response.status} for ${options.method || 'GET'} ${path}.`)
  return response
}

async function apiJson(path, options) {
  const response = await request(path, options)
  const body = await response.json()
  if (!body.success || !body.result) throw new Error(`Cloudflare API reported failure for ${path}.`)
  return body.result
}

async function downloadItem(id) {
  const response = await request(`/items/${encodeURIComponent(id)}/download`)
  return Buffer.from(await response.arrayBuffer())
}

async function saveBackup() {
  requiredEnv()
  await mkdir(backupDir, { recursive: true })
  const items = await apiJson(`/items?key=${encodeURIComponent(productionKey)}`)
  // Cloudflare reports source_id=null for some older built-in items.
  const matches = Array.isArray(items) ? items.filter((item) => item.key === productionKey && (item.source_id == null || item.source_id === 'builtin')) : []
  if (matches.length !== 1) {
    const summary = matches.length ? `${matches.length} exact-key matches` : 'no exact-key match'
    const listed = await apiJson('/items?per_page=50')
    const candidates = Array.isArray(listed)
      ? listed
          .filter((item) => item.source_id == null || item.source_id === 'builtin')
          .map((item) => `${item.key} [${item.status || 'unknown'}]`)
      : []
    throw new Error(`Expected one built-in production item named ${productionKey}; found ${summary}. Available built-in items: ${candidates.join('; ') || '(none returned)'}. Refusing to deploy.`)
  }
  const item = matches[0]
  const content = await downloadItem(item.id)
  if (!content.length) throw new Error('The production item backup is empty; refusing to deploy.')
  await writeFile(resolve(backupDir, 'production-item.backup'), content, { mode: 0o600 })
  await writeFile(resolve(backupDir, 'metadata.json'), JSON.stringify({ id: item.id, key: item.key, checksum: item.checksum, sha256: digest(content), backed_up_at: new Date().toISOString() }, null, 2), { mode: 0o600 })
  console.log(`Backed up production item ${item.id} (${content.length} bytes).`)
}

async function upload(content, key) {
  const form = new FormData()
  form.set('file', new Blob([content], { type: 'text/markdown; charset=utf-8' }), key)
  form.set('wait_for_completion', 'true')
  return apiJson('/items', { method: 'POST', body: form })
}

async function waitForIndexing(id) {
  const deadline = Date.now() + 8 * 60 * 1000
  while (Date.now() < deadline) {
    const item = await apiJson(`/items/${encodeURIComponent(id)}`)
    if (item.status === 'completed' && item.chunks_count > 0) {
      console.log(`Indexing completed with ${item.chunks_count} chunks.`)
      return
    }
    if (item.status === 'error' || item.status === 'skipped') throw new Error(`Cloudflare indexing ended with status ${item.status}.`)
    await new Promise((resolve) => setTimeout(resolve, 10_000))
  }
  throw new Error('Cloudflare indexing did not complete within 8 minutes; time reserved for rollback.')
}

function chunksFrom(result) {
  if (Array.isArray(result?.data)) return result.data
  if (Array.isArray(result?.result?.data)) return result.result.data
  if (Array.isArray(result?.chunks)) return result.chunks
  return []
}

async function runRetrievalQa() {
  const qa = JSON.parse(await readFile(qaPath, 'utf8'))
  let failures = 0
  for (const question of qa.questions) {
    const result = await apiJson('/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: question.question }], ai_search_options: { cache: { enabled: false }, retrieval: { max_num_results: 5, match_threshold: 0.4 } } }),
    })
    const chunks = chunksFrom(result)
    if (!chunks.length) {
      console.error(`Retrieval QA ${question.id}: no chunks returned.`)
      failures += 1
      continue
    }
    const text = chunks.map((chunk) => chunk.text ?? chunk.content ?? '').join('\n').toLowerCase()
    const required = question.must_mention_any || []
    const missing = (required.length && !required.some((term) => text.includes(term.toLowerCase()))) || (question.must_mention_all || []).some(term => !text.includes(term.toLowerCase()))
    const forbidden = (question.must_not_mention || []).filter((term) => text.includes(term.toLowerCase()))
    if (missing || forbidden.length) {
      console.error(`Retrieval QA ${question.id}: ${missing ? 'expected terms absent' : ''}${missing && forbidden.length ? '; ' : ''}${forbidden.length ? `forbidden terms found: ${forbidden.join(', ')}` : ''}.`)
      console.error(`Retrieval QA ${question.id} chunk diagnostics: ${chunks.map(c => `[${c.score ?? '?'}] ${String(c.text ?? c.content ?? '').slice(0, 160).replaceAll('\n',' ')}`).join(' | ')}`)
      failures += 1
    } else {
      console.log(`Retrieval QA ${question.id}: passed (${chunks.length} chunks).`)
    }
  }
  if (failures) throw new Error(`${failures} retrieval QA check(s) failed.`)
}

const digest = content => createHash('sha256').update(content).digest('hex')

async function verifyBytes(id, expected) {
  if (digest(await downloadItem(id)) !== digest(expected)) throw new Error('Indexed item download does not match expected content bytes.')
}

async function health() {
  requiredEnv()
  const listed = await apiJson(`/items?key=${encodeURIComponent(productionKey)}`)
  const items = listed.filter(item => item.key === productionKey && (item.source_id == null || item.source_id === 'builtin'))
  if (items.length !== 1) throw new Error('Expected exactly one production item.')
  const item = await apiJson(`/items/${encodeURIComponent(items[0].id)}`)
  if (item.status !== 'completed' || item.chunks_count <= 0) throw new Error('Production item is not completely indexed.')
  await verifyBytes(item.id, await readFile(sourcePath))
  await runRetrievalQa()
  console.log('Production health passed: exact committed bytes, completed indexing, and retrieval QA.')
}

async function deploy() {
  requiredEnv()
  const metadata = JSON.parse(await readFile(resolve(backupDir, 'metadata.json'), 'utf8'))
  const backup = await readFile(resolve(backupDir, 'production-item.backup'))
  const candidate = await readFile(sourcePath)
  if (metadata.key !== productionKey || !metadata.sha256 || metadata.sha256 !== digest(backup)) throw new Error('Production backup identity/integrity check failed; refusing to write.')
  await verifyBytes(metadata.id, backup)
  if (digest(candidate) === digest(backup)) {
    await runRetrievalQa()
    console.log('Production already contains the candidate; retrieval QA passed without a write.')
    return
  }
  let writeAttempted = false
  try {
    writeAttempted = true
    const indexed = await upload(candidate, metadata.key)
    if (indexed.key !== metadata.key || indexed.source_id && indexed.source_id !== 'builtin' || !indexed.id) {
      throw new Error('Cloudflare returned an item that does not match the backed-up production key; refusing to continue.')
    }
    await waitForIndexing(indexed.id)
    await verifyBytes(indexed.id, candidate)
    await runRetrievalQa()
    console.log('Production RAG deployment and retrieval QA passed.')
  } catch (error) {
    if (writeAttempted) {
      console.error('Deployment verification failed; restoring the production backup.')
      try {
        const restored = await upload(backup, metadata.key)
        if (restored.key !== metadata.key || restored.source_id && restored.source_id !== 'builtin' || !restored.id) throw new Error('Rollback returned an unexpected item.')
        await waitForIndexing(restored.id)
        await verifyBytes(restored.id, backup)
        console.error('Rollback completed and the prior item finished indexing.')
      } catch (rollbackError) {
        throw new Error(`${error.message} Rollback also failed: ${rollbackError.message}`)
      }
    }
    throw error
  }
}

const command = process.argv[2]
if (command === 'backup') await saveBackup()
else if (command === 'deploy') await deploy()
else if (command === 'health') await health()
else throw new Error('Usage: node scripts/rag/deploy-rag.mjs <backup|deploy|health>')
