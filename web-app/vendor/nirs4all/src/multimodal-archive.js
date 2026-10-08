import {readPortableArchiveV2,loadArchiveV2Native} from './archive-v2.js';
import {loadDagMlWasm,loadMethodsWasm} from './index.js';

/** Replay an unchanged .n4a archive on a target-free IO Dataset. */
export async function predictMultimodalArchive(archiveBytes,value,options={}) {
  const io=options.io??await import('@nirs4all/io-wasm/public-dataset');
  const dagMl=options.dagMl??await loadDagMlWasm();
  const methods=options.methods??await loadMethodsWasm();
  const replay=options.replayHelper??(await import('dag-ml-wasm/multimodal_dataset_replay.mjs')).replayMultimodalDatasetArchive;
  const digest=options.digest??(await loadArchiveV2Native()).sha256_bytes;
  const current=io.multimodalRuntimeInput(value,digest);
  const archive=await (options.readArchive??readPortableArchiveV2)(archiveBytes);
  const packagePath=archive.manifest.replay.portable_predictor_package.member_path;
  const packageValue=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(archive.members[packagePath]));
  const saved=packageValue.effective_plan.graph_plan.graph.nodes[0].operator.source_schemas;
  current.source_schemas=io.compatibleSchemas(current.source_schemas,saved);
  return replay({archiveBytes,readPortableArchiveV2:async()=>archive,dagMl,methods,current,digest});
}
