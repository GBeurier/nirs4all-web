import type { Workflow } from './workflow.js';
export class CalibratedWorkflow {
  archive: Uint8Array;
  calibration: Record<string, unknown>;
  constructor(archive: Uint8Array, calibration: Record<string, unknown>);
  predict(value: unknown, options?: Record<string, unknown>): Promise<Record<string, unknown>>;
  export(): Uint8Array;
}
export function calibrate(model: Workflow | Uint8Array, value: unknown, options?: Record<string, unknown>): Promise<CalibratedWorkflow>;
export function predictCalibrated(model: CalibratedWorkflow | Uint8Array, value: unknown, options?: Record<string, unknown>): Promise<Record<string, unknown>>;
export function conformalMetrics(model: CalibratedWorkflow, prediction: Record<string, unknown>, truth: { sample_ids: string[]; values: number[][] }): Promise<Record<string, unknown>>;
export function loadCalibrated(archive: Uint8Array, options?: Record<string, unknown>): Promise<CalibratedWorkflow>;
export function exportCalibrated(model: CalibratedWorkflow): Uint8Array;
