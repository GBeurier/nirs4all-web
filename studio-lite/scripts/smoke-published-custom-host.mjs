#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const versions = {
  nirs4all: process.env.N4A_PUBLISHED_NIRS4ALL_VERSION || '0.3.9',
  ui: process.env.N4A_PUBLISHED_NIRS4ALL_UI_VERSION || '0.1.11',
  methods: process.env.N4A_PUBLISHED_METHODS_VERSION || '1.0.9',
  react: process.env.N4A_PUBLISHED_REACT_VERSION || '18.3.1',
  reactDom: process.env.N4A_PUBLISHED_REACT_DOM_VERSION || '18.3.1',
  vite: process.env.N4A_PUBLISHED_VITE_VERSION || '6.4.3',
  pluginReact: process.env.N4A_PUBLISHED_PLUGIN_REACT_VERSION || '4.7.0',
}
const keepTemp = process.env.N4A_KEEP_PUBLISHED_SMOKE === '1'
const artifactsDir = process.env.ARTIFACTS_DIR

function run(cmd, args, cwd, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    })
    let stdout = ''
    let stderr = ''
    if (capture) {
      child.stdout.on('data', (chunk) => {
        const text = String(chunk)
        stdout += text
        process.stdout.write(text)
      })
      child.stderr.on('data', (chunk) => {
        const text = String(chunk)
        stderr += text
        process.stderr.write(text)
      })
    }
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`${cmd} ${args.join(' ')} exited ${code ?? 1}`))
    })
  })
}

const smokeSource = `
import { capabilityManifest, predictPortablePipeline, runPortablePipeline, runtimeContracts } from 'nirs4all'
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
if (typeof runPortablePipeline !== 'function' || typeof predictPortablePipeline !== 'function') {
  throw new Error('published nirs4all does not expose portable run/predict entrypoints')
}

const demoDataset = {
  X: Array.from({ length: 48 }, (_, index) => {
    const row = Math.floor(index / 4)
    const col = index % 4
    return 0.2 * row + 0.03 * col + Math.sin((row + col) / 5)
  }),
  y: Array.from({ length: 12 }, (_, row) => 0.5 + row * 0.12 + Math.cos(row / 4) * 0.05),
  rows: 12,
  cols: 4,
}

const demoPipeline = {
  name: 'published-custom-host-pls-demo',
  pipeline: [
    {
      class: 'nirs4all.operators.splitters.KennardStoneSplitter',
      params: { test_size: 0.25 },
    },
    {
      class: 'nirs4all.operators.transforms.StandardNormalVariate',
      params: {},
    },
    {
      model: {
        class: 'sklearn.cross_decomposition.PLSRegression',
        params: { n_components: 2 },
      },
    },
  ],
}

const execution = await runPortablePipeline(demoPipeline, demoDataset)
const predictions = await predictPortablePipeline(execution, {
  X: demoDataset.X,
  rows: demoDataset.rows,
  cols: demoDataset.cols,
})
if (!execution?.selected || !Number.isFinite(execution.selected.rmse)) {
  throw new Error('published nirs4all runPortablePipeline did not return a finite selected RMSE')
}
if (predictions?.rows !== demoDataset.rows || predictions?.cols !== 1) {
  throw new Error('published nirs4all predictPortablePipeline returned unexpected dimensions')
}
if (!Array.isArray(predictions.data) || predictions.data.some((value) => !Number.isFinite(value))) {
  throw new Error('published nirs4all predictPortablePipeline returned non-finite predictions')
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
  runEntrypoint: typeof runPortablePipeline,
  predictEntrypoint: typeof predictPortablePipeline,
  portablePipelineExecuted: true,
  selectedRmse: execution.selected.rmse,
  selectedPredictionCount: execution.selected.predictions.length,
  predictionRows: predictions.rows,
  predictionCols: predictions.cols,
  finitePredictions: predictions.data.every((value) => Number.isFinite(value)),
}))
`

const appSource = `
import React from 'react'
import { createRoot } from 'react-dom/client'
import {
  capabilityManifest,
  predictPortablePipeline,
  runPortablePipeline,
  runtimeContracts,
} from 'nirs4all'
import { DatasetPreviewCard, MetricValueBadge, RuntimeEngineBadge } from 'nirs4all-ui/components'
import { buildDatasetPreview } from 'nirs4all-ui/dataset'
import { buildRuntimeEngineStatus, runtimeEngineLabel } from 'nirs4all-ui/runtime'

const demoDataset = {
  X: Array.from({ length: 48 }, (_, index) => {
    const row = Math.floor(index / 4)
    const col = index % 4
    return 0.2 * row + 0.03 * col + Math.sin((row + col) / 5)
  }),
  y: Array.from({ length: 12 }, (_, row) => 0.5 + row * 0.12 + Math.cos(row / 4) * 0.05),
  rows: 12,
  cols: 4,
}

const demoPipeline = {
  name: 'published-custom-host-pls-demo',
  pipeline: [
    {
      class: 'nirs4all.operators.splitters.KennardStoneSplitter',
      params: { test_size: 0.25 },
    },
    {
      class: 'nirs4all.operators.transforms.StandardNormalVariate',
      params: {},
    },
    {
      model: {
        class: 'sklearn.cross_decomposition.PLSRegression',
        params: { n_components: 2 },
      },
    },
  ],
}

function App() {
  const manifest = capabilityManifest()
  const predictSurface = runtimeContracts.find((item) => item.serializedModelPredict)?.surface ?? 'none'
  const dataset = buildDatasetPreview({
    id: 'published-custom-host',
    name: 'Published custom host dataset',
    taskType: 'regression',
    sampleCount: demoDataset.rows,
    featureCount: demoDataset.cols,
    splitCounts: { train: 9, test: 3 },
    tags: ['published', 'client-only'],
  })
  const engineStatus = buildRuntimeEngineStatus({
    engine: 'nirs4all-core-wasm',
    requestedEngine: 'nirs4all-core-wasm',
    diagnostics: [],
  })

  async function runDemo() {
    const result = await runPortablePipeline(demoPipeline, demoDataset)
    await predictPortablePipeline(result, {
      X: demoDataset.X,
      rows: demoDataset.rows,
      cols: demoDataset.cols,
    })
  }

  return (
    <main aria-label="published nirs4all custom app host">
      <h1>Published nirs4all custom host</h1>
      <p>{runtimeEngineLabel({ compiled: true, executed: true })}</p>
      <DatasetPreviewCard view={dataset} className="published-custom-host-dataset" />
      <RuntimeEngineBadge status={engineStatus} className="published-custom-host-engine" />
      <MetricValueBadge metric="rmse" value={0.03125} className="published-custom-host-metric" />
      <dl>
        <dt>Runtime predict surface</dt>
        <dd>{predictSurface}</dd>
        <dt>Controller contracts</dt>
        <dd>{manifest.controllers.length}</dd>
      </dl>
      <button type="button" onClick={runDemo}>Run portable pipeline</button>
    </main>
  )
}

createRoot(document.getElementById('root')).render(<App />)
`

function parseLastJsonLine(stdout) {
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  for (const line of lines.reverse()) {
    if (!line.startsWith('{')) continue
    try {
      return JSON.parse(line)
    } catch {
      /* keep scanning */
    }
  }
  throw new Error('published custom-host smoke did not print a JSON result')
}

async function pathExists(target) {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

async function listFiles(root, prefix = '') {
  const entries = await readdir(path.join(root, prefix), { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const rel = path.join(prefix, entry.name)
    if (entry.isDirectory()) files.push(...await listFiles(root, rel))
    else files.push(rel.split(path.sep).join('/'))
  }
  return files.sort()
}

const workdir = await mkdtemp(path.join(tmpdir(), 'n4a-published-custom-host-'))
try {
  await writeFile(path.join(workdir, 'package.json'), JSON.stringify({
    name: 'n4a-published-custom-host-smoke',
    private: true,
    type: 'module',
    scripts: {
      build: 'vite build',
    },
    dependencies: {
      nirs4all: versions.nirs4all,
      'nirs4all-ui': versions.ui,
      '@nirs4all/methods': versions.methods,
      react: versions.react,
      'react-dom': versions.reactDom,
    },
    devDependencies: {
      '@vitejs/plugin-react': versions.pluginReact,
      vite: versions.vite,
    },
  }, null, 2))
  await writeFile(path.join(workdir, 'smoke.mjs'), smokeSource)
  await writeFile(path.join(workdir, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><title>nirs4all custom host</title></head><body><div id="root"></div><script type="module" src="/src/App.jsx"></script></body></html>\n')
  await writeFile(path.join(workdir, 'vite.config.mjs'), "import react from '@vitejs/plugin-react'\nimport { defineConfig } from 'vite'\n\nexport default defineConfig({ plugins: [react()] })\n")
  await mkdir(path.join(workdir, 'src'), { recursive: true })
  await writeFile(path.join(workdir, 'src', 'App.jsx'), appSource)

  console.log(`Installing published packages in ${workdir}`)
  await run('npm', ['install', '--prefer-online', '--ignore-scripts', '--no-audit', '--no-fund'], workdir)
  console.log('Running published custom-host import smoke')
  const smoke = await run(process.execPath, ['smoke.mjs'], workdir, { capture: true })
  const smokeResult = parseLastJsonLine(smoke.stdout)
  console.log('Building standalone published custom-host Vite app')
  await run('npm', ['run', 'build'], workdir)
  const distDir = path.join(workdir, 'dist')
  const distFiles = await listFiles(distDir)
  const publicImportsOnly = [smokeSource, appSource].every((source) => (
    source.includes("from 'nirs4all'")
      && source.includes("from 'nirs4all-ui/components'")
      && source.includes("from 'nirs4all-ui/dataset'")
      && source.includes("from 'nirs4all-ui/runtime'")
      && !source.includes("from '@/")
      && !source.includes("from '../../src/")
  ))
  if (!publicImportsOnly) {
    throw new Error('published custom-host sources must use only public nirs4all and nirs4all-ui imports')
  }
  if (artifactsDir) {
    await mkdir(artifactsDir, { recursive: true })
    await writeFile(path.join(artifactsDir, 'published-custom-host.json'), JSON.stringify({
      schema_version: 'n4a.e2e.published_custom_host.v1',
      scenario_id: 'e2e-core-ui-custom-app-host',
      status: 'passed',
      published_package_install: true,
      bundled_downstream_app: true,
      public_imports_only: publicImportsOnly,
      nirs4all_version: versions.nirs4all,
      nirs4all_ui_version: versions.ui,
      nirs4all_methods_version: versions.methods,
      upstream_methods_installed: true,
      react_version: versions.react,
      vite_version: versions.vite,
      controller_count: smokeResult.controllers,
      predict_surface: smokeResult.predictSurface,
      dataset_title: smokeResult.dataset,
      engine_label: smokeResult.engine,
      run_entrypoint: smokeResult.runEntrypoint,
      predict_entrypoint: smokeResult.predictEntrypoint,
      portable_pipeline_executed: smokeResult.portablePipelineExecuted,
      selected_rmse: smokeResult.selectedRmse,
      selected_prediction_count: smokeResult.selectedPredictionCount,
      prediction_rows: smokeResult.predictionRows,
      prediction_cols: smokeResult.predictionCols,
      finite_predictions: smokeResult.finitePredictions,
      dist_index_exists: await pathExists(path.join(distDir, 'index.html')),
      dist_asset_count: distFiles.filter((file) => file.startsWith('assets/')).length,
      dist_wasm_asset_count: distFiles.filter((file) => file.endsWith('.wasm')).length,
      dist_files: distFiles,
    }, null, 2))
  }
  console.log(`published custom-host smoke passed: nirs4all@${versions.nirs4all}, nirs4all-ui@${versions.ui}`)
} finally {
  if (keepTemp) console.log(`Keeping temp dir: ${workdir}`)
  else await rm(workdir, { recursive: true, force: true })
}
