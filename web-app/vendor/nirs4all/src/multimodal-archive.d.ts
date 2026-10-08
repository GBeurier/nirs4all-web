import type {PublicDataset,PublicDatasetRecord} from './multimodal.js';
export interface MultimodalArchivePrediction {
  sample_ids:string[]; target_names:string[]; values:number[][];
  training_performed:false; outcome:Record<string,unknown>; audit:Record<string,unknown>[];
  archive_sha256:string;
}
export declare function predictMultimodalArchive(archiveBytes:Uint8Array,value:PublicDataset|PublicDatasetRecord,
  options?:{io?:Record<string,unknown>; dagMl?:Record<string,unknown>; methods?:Record<string,unknown>}):Promise<MultimodalArchivePrediction>;
