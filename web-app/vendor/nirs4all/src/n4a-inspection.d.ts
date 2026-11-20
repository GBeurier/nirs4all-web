import type { N4aSource, N4aOpenOptions, N4aContainerView } from './n4a.js';

export interface N4aInspectionArtifact {
  id: string; kind: string; owner: string;
  content_type: { id: string; version: number };
  storage: { kind: 'embedded'; root_member: string; member_paths: string[] } | { kind: 'reference'; root_sha256?: string };
}
export interface N4aOwnerPreview {
  artifactId?: string;
  kind: 'dataset' | 'pipeline' | 'result' | 'model' | 'document';
  title: string;
  status: 'not_evaluated' | 'validated' | 'opaque' | 'unresolved' | 'refused';
  detail: string;
  fields: { label: string; value: string }[];
  tables: { title: string; columns: string[]; rows: (string | number | boolean | null)[][]; totalRows?: number }[];
  spectra?: { title: string; axis: number[]; axisUnit: string; axisLabel: string; yLabel: string; series: { id: string; label?: string; values: (number | null)[] }[]; totalSamples: number }[];
  graph?: unknown;
}
export interface N4aInspectionPort {
  owner: string; contentType: string; version: number;
  inspect(bytes: Uint8Array, artifact: N4aInspectionArtifact, options: { maxRows?: number; readMember(path: string): Promise<Uint8Array | undefined> }): N4aOwnerPreview | Promise<N4aOwnerPreview>;
}
export interface N4aInspectionDocument {
  view: N4aContainerView;
  byteLength: string;
  memberByteLengths: Record<string, string>;
  manifestText: string;
}
export class N4aInspectionSession {
  private constructor();
  readonly closed: boolean;
  report(): N4aInspectionDocument;
  preview(artifactId: string, options?: { maxRows?: number }): Promise<N4aOwnerPreview & { artifactId: string }>;
  close(): void;
}
export function inspectN4aContainer(source: N4aSource, options?: N4aOpenOptions & { previewers?: readonly N4aInspectionPort[] }): Promise<N4aInspectionSession>;
