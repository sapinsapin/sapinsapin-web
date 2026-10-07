#!/usr/bin/env node
// Backup, replace, and verify the single production RAG item in Cloudflare AI Search.
// Cloudflare credentials are read from the environment and are never logged.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const itemId = '87c37f86cb5c42a387e5fdaa5ec5ab09'
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
  const item = await apiJson(`/items/${encodeURIComponent(itemId)}`)
  if (item.id !== itemId || typeof item.key !== 'string' || !item.key || item.source_id && item.source_id !== 'builtin') {
    throw new Error('The configured production item does not match the expected built-in knowledge item; refusing to deploy.')
  }
  const content = await downloadItem(itemId)
  if (!content.length) throw new Error('The production item backup is empty; refusing to deploy.')
  await writeFile(resolve(backupDir, 'production-item.backup'), content, { mode: 0o600 })
  await writeFile(resolve(backupDir, 'metadata.json'), JSON.stringify({ id: itemId, key: item.key, checksum: item.checksum, backed_up_at: new Date().toISOString() }, null, 2), { mode: 0o600 })
  console.log(`Backed up production item ${itemId} (${content.length} bytes).`)
}

async function upload(content, key) {
  const form = new FormData()
  form.set('file', new Blob([content], { type: 'text/markdown; charset=utf-8' }), key)
  form.set('wait_for_completion', 'true')
  return apiJson('/items', { method: 'POST', body: form })
}

async function waitForIndexing() {
  const deadline = Date.now() + 12 * 60 * 1000
  while (Date.now() < deadline) {
    const item = await apiJson(`/items/${encodeURIComponent(itemId)}`)
    if (item.status === 'completed' && item.chunks_count > 0) {
      console.log(`Indexing completed with ${item.chunks_count} chunks.`)
      return
    }
    if (item.status === 'error' || item.status === 'skipped') throw new Error(`Cloudflare indexing ended with status ${item.status}.`)
    await new Promise((resolve) => setTimeout(resolve, 10_000))
  }
  throw new Error('Cloudflare indexing did not complete within 12 minutes.')
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
      body: JSON.stringify({ messages: [{ role: 'user', content: question.question }] }),
    })
    const chunks = chunksFrom(result)
    if (!chunks.length) {
      console.error(`Retrieval QA ${question.id}: no chunks returned.`)
      failures += 1
      continue
    }
    const text = chunks.map((chunk) => typeof chunk.text === 'string' ? chunk.text : '').join('\n').toLowerCase()
    const required = question.must_mention_any || []
    const missing = required.length && !required.some((term) => text.includes(term.toLowerCase()))
    const forbidden = (question.must_not_mention || []).filter((term) => text.includes(term.toLowerCase()))
    if (missing || forbidden.length) {
      console.error(`Retrieval QA ${question.id}: ${missing ? 'expected terms absent' : ''}${missing && forbidden.length ? '; ' : ''}${forbidden.length ? `forbidden terms found: ${forbidden.join(', ')}` : ''}.`)
      failures += 1
    } else {
      console.log(`Retrieval QA ${question.id}: passed (${chunks.length} chunks).`)
    }
  }
  if (failures) throw new Error(`${failures} retrieval QA check(s) failed.`)
}

async function deploy() {
  requiredEnv()
  const metadata = JSON.parse(await readFile(resolve(backupDir, 'metadata.json'), 'utf8'))
  const backup = await readFile(resolve(backupDir, 'production-item.backup'))
  const candidate = await readFile(sourcePath)
  let writeAttempted = false
  try {
    writeAttempted = true
    const indexed = await upload(candidate, metadata.key)
    if (indexed.id !== itemId) throw new Error(`Cloudflare returned a different item ID (${indexed.id || 'missing'}); refusing to continue.`)
    await waitForIndexing()
    await runRetrievalQa()
    console.log('Production RAG deployment and retrieval QA passed.')
  } catch (error) {
    if (writeAttempted) {
      console.error('Deployment verification failed; restoring the production backup.')
      try {
        const restored = await upload(backup, metadata.key)
        if (restored.id !== itemId) throw new Error('Rollback returned a different item ID.')
        await waitForIndexing()
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
else throw new Error('Usage: node scripts/rag/deploy-rag.mjs <backup|deploy>')
