// One-off timing probe (NOT part of the gate): measures fitAom wall-time on the
// real Cassava data at increasing row counts, to tell "slow but finishes" from
// "effectively hangs". Run: node tests/aom-cassava-timing.mjs
import { readFileSync } from 'node:fs'
import * as n4m from '../src/engine/wasm/methods/index.js'

const DIR = process.env.CASSAVA_DIR || '/home/delete/nirs4all/nirs4all-data/regression/CASSAVA/Cassava_DM_3357_SanchezRandomByYear10p'
const BANK = [0, 7, 8, 9, 15] // AOM_DEFAULT_BANK
const FOLDS = 5
const NCOMP = 10

function parseMatrix(path, hasHeader) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter((l) => l.trim().length)
  const rows = hasHeader ? lines.slice(1) : lines
  const cols = rows[0].split(';').length
  const data = new Float64Array(rows.length * cols)
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].split(';')
    for (let j = 0; j < cols; j++) data[i * cols + j] = Number(cells[j])
  }
  return { data, rows: rows.length, cols }
}

console.log('loading Cassava CSVs…')
const X = parseMatrix(`${DIR}/Xtrain.csv`, true)
const Yraw = parseMatrix(`${DIR}/Ytrain.csv`, true)
console.log(`X = ${X.rows}×${X.cols}, Y = ${Yraw.rows}×${Yraw.cols}`)

await n4m.loadModule()
console.log('libn4m loaded; bank=' + JSON.stringify(BANK) + ` folds=${FOLDS} ncomp=${NCOMP}`)

function sub(n) {
  const Xs = { data: X.data.subarray(0, n * X.cols), rows: n, cols: X.cols }
  const Ys = { data: Yraw.data.subarray(0, n * Yraw.cols), rows: n, cols: Yraw.cols }
  return { Xs, Ys }
}

for (const n of [300, 600, 1200, 2400, X.rows]) {
  const { Xs, Ys } = sub(n)
  const cost = n * X.cols * FOLDS * BANK.length
  const t0 = Date.now()
  try {
    const m = n4m.fitAom(Xs, Ys, NCOMP, FOLDS, 0, BANK)
    const dt = Date.now() - t0
    console.log(`n=${String(n).padStart(4)}  cost=${(cost / 1e6).toFixed(0).padStart(5)}M  ${String(dt).padStart(6)} ms  selOp=${m.selectedOperator} score=${Number(m.score).toFixed(4)}`)
  } catch (e) {
    console.log(`n=${n}  THREW after ${Date.now() - t0} ms: ${e instanceof Error ? e.message : e}`)
  }
}
console.log('done')
