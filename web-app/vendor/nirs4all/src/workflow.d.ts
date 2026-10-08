export interface WorkflowOptions {
  sourceId?: string;
  components?: number[];
  preprocessing?: 'raw' | 'snv_savgol';
  folds?: number;
  seed?: number;
  runId?: string;
  inputSampleIds?: string[];
  dagMl?: any;
  methods?: any;
  io?: any;
}
export interface WorkflowExport { schema: 'nirs4all.workflow.v1'; archive: number[]; outcome: any; config: WorkflowOptions; }
export class Workflow {
  archive: Uint8Array;
  outcome: any;
  config: WorkflowOptions;
  constructor(archive: Uint8Array, outcome: any, config: WorkflowOptions);
  predict(value: unknown, options?: WorkflowOptions): Promise<WorkflowPrediction>;
  retrain(value: unknown, options?: WorkflowOptions): Promise<Workflow>;
  export(): WorkflowExport;
  compare(query?: Record<string, unknown>): any;
  predictions(query?: Record<string, unknown>): any;
  summary(): any;
}
export function run(value: unknown, options?: WorkflowOptions): Promise<Workflow>;
export function predict(model: Workflow | Uint8Array, value: unknown, options?: WorkflowOptions): Promise<WorkflowPrediction>;
export function retrain(model: Workflow, value: unknown, options?: WorkflowOptions): Promise<Workflow>;
export function exportWorkflow(model: Workflow): WorkflowExport;
export function load(value: WorkflowExport | string | Uint8Array | ArrayBuffer, options?: WorkflowOptions): Promise<Workflow>;
import type { ArchiveV2ReplayResult } from './index.js';

export interface DagWorkflowReplayResult {
  schema_version: number;
  outputs: Array<{ predictions: Array<{ sample_ids: string[]; target_names: string[]; values: number[][] }> }>;
  [key: string]: unknown;
}
/** The native C/WASM ABI result and DAG host-controller result retain their schemas. */
export type WorkflowPrediction = DagWorkflowReplayResult | ArchiveV2ReplayResult;
