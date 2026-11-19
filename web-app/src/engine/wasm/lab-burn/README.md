# lab-burn-cnn

Browser-only CNN regressors for the multimodal laboratory, trained with
[Burn](https://github.com/tracel-ai/burn) 0.16.1 (NdArray CPU backend) and
compiled to WebAssembly. Two architectures, one branch per source, branches
concatenated mid-network: `nicon` (the nirs4all NICON 1-D CNN, TensorFlow
version) and `compact`. Image branches use a 2-D convolution.

This is a host model of the laboratory, not part of the nirs4all owner
libraries: DAG-ML keeps folds, OOF predictions and refit; this crate only fits
and predicts (`src/multimodal/hostModels.ts`). It is not portable to Python/R
and not exported as Methods state.

Burn 0.16 computes wrong gradients for strided convolutions/pooling whose
window does not tile the input exactly, so each sequence branch reads the
longest prefix that tiles (`usable_length`); at most a few trailing points are
ignored.

Rebuild the committed package:

```bash
export PATH="$HOME/.cargo/bin:$PATH"
RUSTFLAGS='-C target-feature=+simd128 --cfg getrandom_backend="wasm_js"' \
  wasm-pack build --target web --release --out-dir ../src/engine/wasm/lab-burn --out-name lab_burn_cnn
rm ../src/engine/wasm/lab-burn/.gitignore
cargo run --release --example bench   # native timing and save/restore check
```
