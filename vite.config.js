import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { hubTotals } from './src/data/hubSnapshot.js'

const entry = (file) => fileURLToPath(new URL(file, import.meta.url))

// index.html carries an SEO copy with a model count that would go stale the way
// every hardcoded figure does. Replace the token at build time from the synced
// snapshot so the meta/OG/Twitter/noscript text always matches the catalog.
const fillCounts = (text) => text
  .replaceAll('{{MODEL_COUNT}}', String(hubTotals.models))
  .replaceAll('{{DATASET_COUNT}}', String(hubTotals.datasets))

// public/llms.txt is copied verbatim by Vite, so the same tokens are filled in
// the built copy after the bundle is written. It said "28 public models" for
// weeks after the catalog passed 40 because it was hand-maintained.
let outDir = 'dist'
const syncCounts = () => ({
  name: 'sync-counts-in-html',
  configResolved(config) { outDir = resolve(config.root, config.build.outDir) },
  transformIndexHtml(html) {
    return fillCounts(html)
  },
  closeBundle() {
    const file = resolve(outDir, 'llms.txt')
    if (!existsSync(file)) return
    const filled = fillCounts(readFileSync(file, 'utf8'))
    if (/\{\{[A-Z_]+\}\}/.test(filled)) throw new Error('llms.txt still has an unfilled {{TOKEN}}')
    writeFileSync(file, filled)
  },
})

export default defineConfig({
  plugins: [react(), syncCounts()],
  build: {
    // Target modern browsers for smaller, faster bundles
    target: 'es2020',
    // Enable CSS code splitting for better caching
    cssCodeSplit: true,
    rollupOptions: {
      // Two documents, not one app with a router. The site is static, so the
      // 404 has to be a real file: Vercel serves dist/404.html for any address
      // that does not resolve, which keeps both the status code and the
      // address bar honest. Anything shared between the two — index.css, the
      // icons, the theme hook — is hoisted into a common chunk by Rollup.
      input: {
        main: entry('index.html'),
        notFound: entry('404.html'),
      },
      output: {
        // Optimize chunk splitting — Vite 8+ uses rolldown, which requires
        // manualChunks as a function rather than a static map.
        //
        // @number-flow used to be pulled out here as well. It is not any more:
        // forcing it into a named chunk made rolldown put the shared React
        // jsx-runtime interop in *that* chunk, so every entry imported it —
        // which cost the 404 page 8 kB gzipped of a component it never renders.
        // Left alone, number-flow lands in `main` with the only page that uses
        // it, and the homepage ships the same total either way.
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'vendor'
          }
        },
      },
    },
  },
})
