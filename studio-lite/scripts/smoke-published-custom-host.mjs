#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const versions = {
  nirs4all: process.env.N4A_PUBLISHED_NIRS4ALL_VERSION || '0.2.13',
  ui: process.env.N4A_PUBLISHED_NIRS4ALL_UI_VERSION || '0.1.5',
  react: process.env.N4A_PUBLISHED_REACT_VERSION || '18.3.1',
  reactDom: process.env.N4A_PUBLISHED_REACT_DOM_VERSION || '18.3.1',
}
const keepTemp = process.env.N4A_KEEP_PUBLISHED_SMOKE === '1'

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} ${args.join(' ')} exited ${code ?? 1}`))
    })
  })
}

const smokeSource = `
import { capabilityManifest, runtimeContracts } from 'nirs4all'
import { DatasetPreviewCard, MetricValueBadge, RuntimeEngineBadge } from 'nirs4all-ui/components'
import { buildDatasetPreview } from 'nirs4all-ui/dataset'
import { buildRuntimeEngineStatus, runtimeEngineLabel } from 'nirs4all-ui/runtime'

const manifest = capabilityManifest()
if (!Array.isArray(manifest.controllers) || manifest.controllers.length < 4) {
  throw new Error('published nirs4all does not expose the expected controller manifest')
}

const predictSurface = runtimeContracts.find((item) => item.serializedModelPredict)?.surface
if (predictSurface !== 'javascript_wasm') {
  throw new Error(\`unexpected serialized-model predict surface: \${predictSurface ?? 'none'}\`)
}

const dataset = buildDatasetPreview({
  id: 'published-custom-host',
  name: 'Published custom host dataset',
  taskType: 'regression',
  sampleCount: 12,
  featureCount: 4,
  splitCounts: { train: 9, test: 3 },
  tags: ['published', 'client-only'],
})
if (dataset?.title !== 'Published custom host dataset') {
  throw new Error('published nirs4all-ui/dataset did not build the expected preview')
}

const engineStatus = buildRuntimeEngineStatus({
  engine: 'nirs4all-core-wasm',
  requestedEngine: 'nirs4all-core-wasm',
  diagnostics: [],
})
if (engineStatus?.badgeLabel !== 'Nirs4all Core Wasm') {
  throw new Error('published nirs4all-ui/runtime did not build the expected engine status')
}
if (runtimeEngineLabel({ compiled: true, executed: true }) !== 'executed by dag-ml') {
  throw new Error('published nirs4all-ui/runtime did not preserve dag-ml lineage labels')
}

for (const [name, value] of Object.entries({ DatasetPreviewCard, MetricValueBadge, RuntimeEngineBadge })) {
  if (typeof value !== 'function') throw new Error(\`\${name} is not a component function\`)
}

console.log(JSON.stringify({
  controllers: manifest.controllers.length,
  predictSurface,
  dataset: dataset.title,
  engine: engineStatus.badgeLabel,
}))
`

const workdir = await mkdtemp(path.join(tmpdir(), 'n4a-published-custom-host-'))
try {
  await writeFile(path.join(workdir, 'package.json'), JSON.stringify({
    name: 'n4a-published-custom-host-smoke',
    private: true,
    type: 'module',
    dependencies: {
      nirs4all: versions.nirs4all,
      'nirs4all-ui': versions.ui,
      react: versions.react,
      'react-dom': versions.reactDom,
    },
  }, null, 2))
  await writeFile(path.join(workdir, 'smoke.mjs'), smokeSource)

  console.log(`Installing published packages in ${workdir}`)
  await run('npm', ['install', '--prefer-online', '--ignore-scripts', '--no-audit', '--no-fund'], workdir)
  console.log('Running published custom-host import smoke')
  await run(process.execPath, ['smoke.mjs'], workdir)
  console.log(`published custom-host smoke passed: nirs4all@${versions.nirs4all}, nirs4all-ui@${versions.ui}`)
} finally {
  if (keepTemp) console.log(`Keeping temp dir: ${workdir}`)
  else await rm(workdir, { recursive: true, force: true })
}
