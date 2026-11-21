// Builds the French training slides as ONE offline HTML file that opens with a double-click
// (file://, any OS, no server): JS, CSS and the brand icon are inlined by the single-file
// build; the Inspector captures are inlined here as data URIs. Links to the laboratory point
// to the online site. Usage: node scripts/build-offline-slides.mjs [output.html]
import { execFileSync } from 'node:child_process'
import { readFile, writeFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const output = path.resolve(process.argv[2] ?? path.join(root, 'dist-single-slides', 'slides-formation-multimodale.html'))
execFileSync('npx', ['vite', 'build', '--mode', 'singlefile'], { cwd: root, stdio: 'inherit', env: { ...process.env, N4A_SINGLE_ENTRY: 'slides' } })
let html = await readFile(path.join(root, 'dist-single-slides', 'multimodal-training', 'slides', 'index.html'), 'utf8')
const captures = path.join(root, 'public', 'multimodal-training', 'captures')
for (const name of await readdir(captures)) {
  if (!name.endsWith('.png')) continue
  const uri = `data:image/png;base64,${(await readFile(path.join(captures, name))).toString('base64')}`
  html = html.split(`../captures/${name}`).join(uri)
}
const missing = [...html.matchAll(/\.\.\/captures\/[\w.-]+/g)].map(match => match[0])
if (missing.length) throw new Error(`Captures not inlined: ${[...new Set(missing)].join(', ')}`)
// The page favicon is a separate request; drop it rather than point at a missing file.
html = html.replace(/<link rel="icon"[^>]*>\s*/, '')
await writeFile(output, html)
console.log(`offline slides: ${output} (${(html.length / 1048576).toFixed(1)} MB)`)
