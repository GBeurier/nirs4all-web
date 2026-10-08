import type { Workflow } from './workflow.js';
import type { CalibratedWorkflow } from './conformal.js';
export interface FrozenRobustnessScenario { id: string; kind: 'observed' | 'spectral_noise'; severity: number; seed: number; }
export function robustness(model: Workflow | CalibratedWorkflow | Uint8Array, value: unknown,
  truth: { sample_ids: string[]; values: number[][] }, options?: Record<string, unknown> & { scenarios?: FrozenRobustnessScenario[] }): Promise<Record<string, unknown>>;
