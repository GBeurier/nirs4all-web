export interface PublicDatasetRecord {schema:'nirs4all.dataset.v1';schema_version:1;dataset:Record<string,unknown>;origin_ids:string[];fold_ids:(string|null)[];}
export interface PublicDataset {readonly sampleIds:string[];toJSON():PublicDatasetRecord;toDenseRegression(sourceId:string):{X:number[][];y:number[];sample_ids:string[]};}
export interface MultimodalOptions {io?:unknown;methods?:unknown;}
export interface MultimodalPrediction {sample_ids:string[];target_names:string[];values:number[][];}
export function dataset(value:PublicDatasetRecord|PublicDataset,options?:MultimodalOptions):Promise<PublicDataset>;
export class MultimodalPredictor {
  static fit(recipe:Record<string,unknown>,value:PublicDatasetRecord|PublicDataset,options?:MultimodalOptions):Promise<MultimodalPredictor>;
  static load(input:string|Record<string,unknown>,options?:MultimodalOptions):Promise<MultimodalPredictor>;
  predict(value:PublicDatasetRecord|PublicDataset):MultimodalPrediction;
  toJSON():Record<string,unknown>;
  close():void;
}
