// Thin Methods facade: raw dataset assembly is delegated to IO.
async function dependencies(options) {
  const io=options.io??await import('@nirs4all/io-wasm/public-dataset');
  const methods=options.methods??await import('@nirs4all/methods');
  return {io,methods};
}
export async function dataset(value,options={}) {
  const io=options.io??await import('@nirs4all/io-wasm/public-dataset');
  return io.dataset(value,options);
}
function blocks(raw) {
  return Object.fromEntries(Object.entries(raw.sources).map(([name,s])=>[name,name==='metadata'?s.rows:{data:s.descriptor.dtype==='float32'?new Float32Array(s.data):new Float64Array(s.data),shape:s.shape}]));
}
export class MultimodalPredictor {
  #recipe; #sourceSchemas; #targetNames;
  get recipe(){return structuredClone(this.#recipe);}
  get sourceSchemas(){return structuredClone(this.#sourceSchemas);}
  get targetNames(){return [...this.#targetNames];}
  constructor(native,recipe,sourceSchemas,io,targetNames){this.native=native;this.#recipe=structuredClone(recipe);this.#sourceSchemas=structuredClone(sourceSchemas);this.io=io;this.#targetNames=[...targetNames];}
  static async fit(recipe,value,options={}) {
    const {io,methods}=await dependencies(options),ds=io.dataset(value),record=ds.toJSON().dataset,raw=io.u07Sources(ds);
    if(record.y===null||record.y.shape.length!==1||record.y.values.some(y=>typeof y!=='number'||!Number.isFinite(y))||record.target_mask.values.some(x=>!x)||record.partitions.values.some(p=>p!=='train'))throw new TypeError('Multimodal full fit requires training rows and one finite observed numeric target');
    const native=new methods.MultimodalPipeline(recipe,raw.source_schemas);
    try{native.fit(blocks(raw),new Float64Array(record.y.values));return new MultimodalPredictor(native,recipe,raw.source_schemas,io,record.target_names);}catch(error){native.dispose();throw error;}
  }
  predict(value) {
    const ds=this.io.dataset(value),record=ds.toJSON().dataset;
    if(record.y!==null||record.partitions.values.some(p=>p!=='predict'))throw new TypeError('Multimodal prediction requires a target-free predict cohort');
    const raw=this.io.u07Sources(ds),schemas=this.io.compatibleSchemas(raw.source_schemas,this.sourceSchemas),out=this.native.predict(blocks(raw),schemas);
    return {sample_ids:raw.sample_ids,target_names:[...this.targetNames],values:Array.from({length:out.rows},(_,i)=>[out.data[i]])};
  }
  toJSON(){return {schema:'nirs4all.multimodal-predictor.v1',schema_version:1,recipe:structuredClone(this.recipe),source_schemas:structuredClone(this.sourceSchemas),state:[...this.native.exportState()],target_names:[...this.targetNames]};}
  static async load(input,options={}) {
    const {io,methods}=await dependencies(options),record=typeof input==='string'?JSON.parse(input):input;
    const keys=['schema','schema_version','recipe','source_schemas','state','target_names'];
    if(record===null||typeof record!=='object'||Object.keys(record).length!==keys.length||keys.some(k=>!Object.hasOwn(record,k))||record.schema!=='nirs4all.multimodal-predictor.v1'||record.schema_version!==1||!Array.isArray(record.target_names)||record.target_names.length!==1||typeof record.target_names[0]!=='string'||!record.target_names[0].trim()||!Array.isArray(record.state)||!record.state.length||record.state.length>67108864||record.state.some(b=>!Number.isInteger(b)||b<0||b>255))throw new TypeError('Invalid multimodal predictor envelope or native byte state');
    const native=methods.MultimodalPipeline.fromState(new Uint8Array(record.state),record.recipe,record.source_schemas);
    return new MultimodalPredictor(native,record.recipe,record.source_schemas,io,record.target_names);
  }
  close(){this.native.dispose();}
}
