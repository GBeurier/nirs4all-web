#!/usr/bin/env node
// Reliable WSL-local runner for the browser smoke suite.
//
// Starts `vite preview` on a fixed port, POLLS until it actually serves (instead of a
// fixed `sleep`), runs each `tests/*smoke.mjs` against it as an isolated child process,
// then always tears the preview server group down. Exit code is non-zero if the server
// never came up or any smoke failed.
//
// Why this exists: the ad-hoc `nohup npm run preview & sleep 4; for t in tests/*smoke.mjs`
// recipe is racy from WSL (fixed sleep vs. server warm-up), runs every smoke against the
// UNC-path Windows `node` if the PATH isn't fixed first, and leaks the preview process on
// failure. This script waits on real readiness, pins the CHROME executable, and guarantees
// teardown. It does NOT build. The selected output must carry the runtime-profile
// manifest; that exact profile is forwarded to every smoke.
//
// Usage:
//   npm run build && node scripts/run-smokes.mjs           # whole suite
//   node scripts/run-smokes.mjs --out-dir dist-strict --profile strict-wasm rt-fallback
//   PORT=4345 CHROME=/usr/bin/google-chrome node scripts/run-smokes.mjs
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const testsDir = path.join(root, 'tests')
const PORT = Number(process.env.PORT || 4345)
const HOST = '127.0.0.1'
const APP_URL = `http://${HOST}:${PORT}/`
const CHROME = process.env.CHROME || '/usr/bin/google-chrome'
const READY_TIMEOUT_MS = Number(process.env.READY_TIMEOUT_MS || 30000)
const bundledNpmCli = path.resolve(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')
const npmCli = process.env.NPM_CLI_JS || (existsSync(bundledNpmCli) ? bundledNpmCli : '')

const args = process.argv.slice(2)
const filters = []
let outDirArg = process.env.SMOKE_OUT_DIR || 'dist'
let expectedProfile = process.env.SMOKE_WEB_PROFILE || ''
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out-dir') {
    outDirArg = args[++i] || ''
  } else if (args[i] === '--profile') {
    expectedProfile = args[++i] || ''
  } else {
    filters.push(args[i])
  }
}

const outDir = path.resolve(root, outDirArg)
const relativeOutDir = path.relative(root, outDir)
if (!outDirArg || !relativeOutDir || relativeOutDir.startsWith('..') || path.isAbsolute(relativeOutDir)) {
  console.error(`✗ smoke outDir must stay inside ${root}: ${JSON.stringify(outDirArg)}`)
  process.exit(2)
}

let profileManifest
try {
  profileManifest = JSON.parse(readFileSync(path.join(outDir, 'nirs4all-web-profile.v1.json'), 'utf8'))
} catch (error) {
  console.error(`✗ missing or malformed runtime profile manifest in ${outDir}: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(2)
}
const strictProfile = profileManifest.profile === 'strict-wasm'
const expectedManifest = {
  contract: 'nirs4all.web-runtime-profile.v1',
  profile: profileManifest.profile,
  nativeWasmRequired: strictProfile,
  jsBackendFallback: strictProfile ? 'forbid' : 'allow-explicit-offline',
  providerMatrixFallback: strictProfile ? 'forbid' : 'allow-diagnosed',
  schedulerFallback: strictProfile ? 'forbid' : 'allow-explicit',
  remoteComputeProvider: 'forbid',
}
if (!['strict-wasm', 'transitional'].includes(profileManifest.profile) || JSON.stringify(profileManifest) !== JSON.stringify(expectedManifest)) {
  console.error(`✗ unsupported runtime profile manifest in ${outDir}: ${JSON.stringify(profileManifest)}`)
  process.exit(2)
}
if (expectedProfile && expectedProfile !== profileManifest.profile) {
  console.error(`✗ requested smoke profile ${expectedProfile} but ${outDirArg} contains ${profileManifest.profile}`)
  process.exit(2)
}
expectedProfile = profileManifest.profile

const smokes = readdirSync(testsDir)
  .filter((f) => f.endsWith('smoke.mjs')) // the *-timing probe is excluded by the glob (CLAUDE.md)
  .filter((f) => filters.length === 0 || filters.some((q) => f.includes(q)))
  .sort()

if (smokes.length === 0) {
  console.error(`✗ no smoke files matched ${JSON.stringify(filters)} under tests/`)
  process.exit(2)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const tail = [] // ring buffer of recent preview output, dumped only if it never starts
const remember = (buf) => {
  for (const line of String(buf).split('\n')) if (line.trim()) tail.push(line)
  while (tail.length > 25) tail.shift()
}

let previewExited = null
function startPreview() {
  // `detached` so we can signal the whole process group (vite spawns children); `--host`
  // pins the interface so readiness polling and the smokes address the same origin.
  const previewArgs = ['run', 'preview', '--', '--outDir', outDir, '--port', String(PORT), '--strictPort', '--host', HOST]
  const child = spawn(npmCli ? process.execPath : 'npm', npmCli ? [npmCli, ...previewArgs] : previewArgs, {
    cwd: root,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', remember)
  child.stderr.on('data', remember)
  child.on('exit', (code) => {
    previewExited = code ?? 0
  })
  return child
}

function stopPreview(child) {
  if (!child || child.pid == null) return
  try {
    process.kill(-child.pid, 'SIGTERM') // kill the group
  } catch {
    try {
      child.kill('SIGTERM')
    } catch {
      /* already gone */
    }
  }
}

async function waitForServer(deadline) {
  while (Date.now() < deadline) {
    if (previewExited !== null) return false // strictPort clash or crash — do not run against a stale server
    try {
      const res = await fetch(APP_URL, { signal: AbortSignal.timeout(2000) })
      if (res.ok) return true
    } catch {
      /* not up yet */
    }
    await sleep(250)
  }
  return false
}

function runSmoke(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(testsDir, file)], {
      cwd: root,
      env: {
        ...process.env,
        SMOKE_URL: APP_URL,
        SMOKE_OUT_DIR: outDir,
        SMOKE_WEB_PROFILE: expectedProfile,
        CHROME,
      },
      stdio: 'inherit',
    })
    child.on('exit', (code) => resolve(code ?? 1))
  })
}

let preview
let failures = 0
try {
  preview = startPreview()
  const ready = await waitForServer(Date.now() + READY_TIMEOUT_MS)
  if (!ready) {
    console.error(`✗ preview did not become ready at ${APP_URL} within ${READY_TIMEOUT_MS}ms` + (previewExited !== null ? ` (preview exited ${previewExited})` : ''))
    if (tail.length) console.error('  preview output:\n' + tail.map((l) => '    ' + l).join('\n'))
    process.exitCode = 2
  } else {
    console.log(`▶ preview ready at ${APP_URL} — profile=${expectedProfile}, outDir=${outDirArg}, running ${smokes.length} smoke(s) (CHROME=${CHROME})\n`)
    for (const file of smokes) {
      console.log(`──────── ${file} ────────`)
      const code = await runSmoke(file)
      if (code !== 0) {
        failures++
        console.error(`✗ ${file} exited ${code}`)
      }
      console.log('')
    }
    if (failures) {
      console.error(`✗ ${failures}/${smokes.length} smoke(s) FAILED`)
      process.exitCode = 1
    } else {
      console.log(`✓ all ${smokes.length} smoke(s) passed`)
    }
  }
} finally {
  stopPreview(preview)
}
