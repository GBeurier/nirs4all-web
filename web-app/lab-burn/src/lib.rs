//! Browser-only CNN regressors trained with Burn (NdArray CPU backend) for the
//! nirs4all multimodal laboratory. Host model: the laboratory's native DAG-ML
//! controller owns folds, OOF predictions and refit; this crate only fits and
//! predicts. Not part of the nirs4all owner libraries.
//!
//! Two architectures, one branch per source block, branches concatenated
//! mid-network:
//! - `nicon`: the nirs4all NICON 1-D CNN (TensorFlow version) per sequence
//!   branch (spatial dropout 0.08, conv 8×15/5 SELU, dropout 0.2, conv 64×21/3
//!   ReLU, batch norm, conv 32×5/3 ELU, batch norm, flatten), dense 16 sigmoid,
//!   dense 1 sigmoid on a target min-max scaled to [0, 1].
//! - `compact`: conv 1-D (filters × kernel) ReLU, average pool 2, dense
//!   embedding; dense hidden ReLU, linear output on a standardized target.
//! Image branches (kind 2) use conv 2-D ReLU, average pool 2, dense embedding.

use burn::backend::{Autodiff, NdArray};
use burn::module::{AutodiffModule, Module};
use burn::nn::conv::{Conv1d, Conv1dConfig, Conv2d, Conv2dConfig};
use burn::nn::loss::{CrossEntropyLossConfig, MseLoss, Reduction};
use burn::nn::pool::{AvgPool1d, AvgPool1dConfig, AvgPool2d, AvgPool2dConfig};
use burn::nn::{BatchNorm, BatchNormConfig, Linear, LinearConfig};
use burn::optim::{AdamConfig, GradientsParams, Optimizer};
use burn::record::{BinBytesRecorder, FullPrecisionSettings, Recorder};
use burn::tensor::backend::{AutodiffBackend, Backend};
use burn::tensor::{activation, Distribution, Int, Tensor, TensorData};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

type Inner = NdArray<f32>;
type Train = Autodiff<Inner>;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Config {
    /// Per branch: 1 = sequence (spectrum, ordered markers), 2 = image (H, W, C).
    pub branch_kinds: Vec<u32>,
    /// Three integers per branch: [length, 1, 1] or [height, width, channels].
    pub branch_shapes: Vec<usize>,
    #[serde(default = "default_arch")]
    pub architecture: String,
    #[serde(default = "d8")]
    pub filters: usize,
    #[serde(default = "d5")]
    pub kernel_size: usize,
    #[serde(default = "d16")]
    pub embedding_dim: usize,
    #[serde(default = "d16")]
    pub head_hidden: usize,
    #[serde(default = "d60")]
    pub epochs: usize,
    #[serde(default = "d32")]
    pub batch_size: usize,
    #[serde(default = "dlr")]
    pub learning_rate: f64,
    #[serde(default)]
    pub seed: u64,
    /// 0 = regression (one output); k >= 2 = classification into k classes (softmax, cross-entropy).
    #[serde(default)]
    pub n_classes: usize,
}
fn default_arch() -> String { "compact".into() }
fn d5() -> usize { 5 }
fn d8() -> usize { 8 }
fn d16() -> usize { 16 }
fn d32() -> usize { 32 }
fn d60() -> usize { 60 }
fn dlr() -> f64 { 0.005 }

#[derive(Clone, Copy, Debug)]
struct Geometry { kind: u32, d0: usize, d1: usize, d2: usize, used: usize }
impl Geometry {
    fn width(&self) -> usize { self.d0 * self.d1 * self.d2 }
}

/// Longest length ≤ `length` for which every strided convolution and pooling
/// window tiles exactly (Burn 0.16 computes wrong gradients otherwise); the
/// few trailing points beyond it are not read.
fn usable_length(length: usize, nicon: bool, kernel: usize) -> usize {
    let fits = |l: usize| if nicon {
        l >= 15 && (l - 15) % 5 == 0 && {
            let l1 = (l - 15) / 5 + 1;
            l1 >= 21 && (l1 - 21) % 3 == 0 && {
                let l2 = (l1 - 21) / 3 + 1;
                l2 >= 5 && (l2 - 5) % 3 == 0
            }
        }
    } else { l >= kernel && (l - kernel + 1) % 2 == 0 };
    (1..=length).rev().find(|&l| fits(l)).unwrap_or(0)
}
fn conv_len(length: usize, kernel: usize, stride: usize) -> usize {
    if length < kernel { 0 } else { (length - kernel) / stride + 1 }
}

#[derive(Module, Debug)]
pub struct SeqBranch<B: Backend> {
    conv1: Conv1d<B>,
    conv2: Option<Conv1d<B>>,
    bn2: Option<BatchNorm<B, 1>>,
    conv3: Option<Conv1d<B>>,
    bn3: Option<BatchNorm<B, 1>>,
    pool: Option<AvgPool1d>,
    dense: Option<Linear<B>>,
}

#[derive(Module, Debug)]
pub struct ImgBranch<B: Backend> {
    conv: Conv2d<B>,
    pool: AvgPool2d,
    dense: Linear<B>,
}

#[derive(Module, Debug)]
pub struct Net<B: Backend> {
    seq: Vec<SeqBranch<B>>,
    img: Vec<ImgBranch<B>>,
    hidden: Linear<B>,
    output: Linear<B>,
}

fn elu<B: Backend, const D: usize>(x: Tensor<B, D>) -> Tensor<B, D> {
    let negative = x.clone().lower_equal_elem(0.0);
    x.clone().mask_where(negative, x.exp().sub_scalar(1.0))
}
fn selu<B: Backend, const D: usize>(x: Tensor<B, D>) -> Tensor<B, D> {
    const ALPHA: f64 = 1.673_263_242_354_377_3;
    const LAMBDA: f64 = 1.050_700_987_355_480_5;
    let negative = x.clone().lower_equal_elem(0.0);
    x.clone().mask_where(negative, x.exp().sub_scalar(1.0).mul_scalar(ALPHA)).mul_scalar(LAMBDA)
}

impl<B: Backend> Net<B> {
    fn init(config: &Config, geometry: &[Geometry], device: &B::Device) -> Result<Self, String> {
        let nicon = config.architecture == "nicon";
        let mut seq = Vec::new();
        let mut img = Vec::new();
        let mut concat = 0usize;
        for g in geometry {
            if g.kind == 2 {
                let mut k = config.kernel_size.min(g.d0).min(g.d1).max(1);
                // Even convolution outputs so the 2×2 pooling tiles exactly (see usable_length).
                if (g.d0 - k + 1) % 2 == 1 || (g.d1 - k + 1) % 2 == 1 { k = if k > 1 { k - 1 } else { k + 1 } }
                if (g.d0 + 1 < k + 1) || (g.d0 - k + 1) % 2 == 1 || (g.d1 - k + 1) % 2 == 1 {
                    return Err("Image branches need an even height and width for this kernel".into())
                }
                let (h, w) = (g.d0 - k + 1, g.d1 - k + 1);
                let (ph, pw) = (h / 2, w / 2);
                if ph == 0 || pw == 0 { return Err("Image branch too small for its kernel".into()) }
                let flat = config.filters * ph * pw;
                img.push(ImgBranch {
                    conv: Conv2dConfig::new([g.d2, config.filters], [k, k]).init(device),
                    pool: AvgPool2dConfig::new([2, 2]).with_strides([2, 2]).init(),
                    dense: LinearConfig::new(flat, config.embedding_dim).init(device),
                });
                concat += config.embedding_dim;
            } else if nicon {
                let l1 = conv_len(g.used, 15, 5);
                let l2 = conv_len(l1, 21, 3);
                let l3 = conv_len(l2, 5, 3);
                if g.used == 0 || l3 == 0 { return Err(format!("NICON needs at least 175 points per sequence; a branch has {}", g.d0)) }
                seq.push(SeqBranch {
                    conv1: Conv1dConfig::new(1, 8, 15).with_stride(5).init(device),
                    conv2: Some(Conv1dConfig::new(8, 64, 21).with_stride(3).init(device)),
                    bn2: Some(BatchNormConfig::new(64).init(device)),
                    conv3: Some(Conv1dConfig::new(64, 32, 5).with_stride(3).init(device)),
                    bn3: Some(BatchNormConfig::new(32).init(device)),
                    pool: None,
                    dense: None,
                });
                concat += 32 * l3;
            } else {
                let k = config.kernel_size.min(g.d0).max(1);
                let pooled = conv_len(g.used, k, 1) / 2;
                if pooled == 0 { return Err("Sequence branch too short for its kernel".into()) }
                seq.push(SeqBranch {
                    conv1: Conv1dConfig::new(1, config.filters, k).init(device),
                    conv2: None, bn2: None, conv3: None, bn3: None,
                    pool: Some(AvgPool1dConfig::new(2).with_stride(2).init()),
                    dense: Some(LinearConfig::new(config.filters * pooled, config.embedding_dim).init(device)),
                });
                concat += config.embedding_dim;
            }
        }
        let hidden = if nicon { 16 } else { config.head_hidden };
        Ok(Net {
            seq, img,
            hidden: LinearConfig::new(concat, hidden).init(device),
            output: LinearConfig::new(hidden, if config.n_classes >= 2 { config.n_classes } else { 1 }).init(device),
        })
    }

    /// `inputs` are standardized blocks in branch order: [n, 1, length] or [n, channels, height, width].
    /// Regression: one (scaled) output. Classification (`logits`): one raw logit per class.
    fn forward(&self, sequences: Vec<Tensor<B, 3>>, images: Vec<Tensor<B, 4>>, order: &[u32], nicon: bool, training: bool, logits: bool) -> Tensor<B, 2> {
        let mut seqs = sequences.into_iter();
        let mut imgs = images.into_iter();
        let (mut si, mut ii) = (0usize, 0usize);
        let mut parts: Vec<Tensor<B, 2>> = Vec::new();
        for kind in order {
            if *kind == 2 {
                let branch = &self.img[ii];
                ii += 1;
                let x = imgs.next().expect("image block");
                let x = activation::relu(branch.conv.forward(x));
                let x = branch.pool.forward(x);
                let x: Tensor<B, 2> = x.flatten(1, 3);
                parts.push(activation::relu(branch.dense.forward(x)));
            } else {
                let branch = &self.seq[si];
                si += 1;
                let mut x = seqs.next().expect("sequence block");
                if nicon {
                    if training {
                        // Spatial dropout (0.08) on the single input channel, then dropout 0.2 after conv 1.
                        let [n, c, _] = x.dims();
                        let keep = Tensor::<B, 3>::random([n, c, 1], Distribution::Bernoulli(0.92), &x.device()).div_scalar(0.92);
                        x = x * keep;
                    }
                    let mut h = selu(branch.conv1.forward(x));
                    if training {
                        let dims = h.dims();
                        let keep = Tensor::<B, 3>::random(dims, Distribution::Bernoulli(0.8), &h.device()).div_scalar(0.8);
                        h = h * keep;
                    }
                    let h = activation::relu(branch.conv2.as_ref().unwrap().forward(h));
                    let h = branch.bn2.as_ref().unwrap().forward(h);
                    let h = elu(branch.conv3.as_ref().unwrap().forward(h));
                    let h = branch.bn3.as_ref().unwrap().forward(h);
                    parts.push(h.flatten(1, 2));
                } else {
                    let h = activation::relu(branch.conv1.forward(x));
                    let h = branch.pool.as_ref().unwrap().forward(h);
                    let h: Tensor<B, 2> = h.flatten(1, 2);
                    parts.push(activation::relu(branch.dense.as_ref().unwrap().forward(h)));
                }
            }
        }
        let joined = Tensor::cat(parts, 1);
        if logits {
            let hidden = self.hidden.forward(joined);
            return self.output.forward(if nicon { activation::sigmoid(hidden) } else { activation::relu(hidden) });
        }
        if nicon {
            activation::sigmoid(self.output.forward(activation::sigmoid(self.hidden.forward(joined))))
        } else {
            self.output.forward(activation::relu(self.hidden.forward(joined)))
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct Scaling { mean: Vec<f64>, scale: Vec<f64>, y_offset: f64, y_scale: f64 }

/// SplitMix64: deterministic minibatch order.
struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }
}

fn geometry(config: &Config) -> Result<Vec<Geometry>, String> {
    if config.branch_shapes.len() != config.branch_kinds.len() * 3 || config.branch_kinds.is_empty() {
        return Err("branch_shapes needs three integers per branch".into());
    }
    let nicon = config.architecture == "nicon";
    Ok(config.branch_kinds.iter().enumerate().map(|(i, kind)| {
        let d0 = config.branch_shapes[i * 3];
        let kernel = config.kernel_size.min(d0).max(1);
        Geometry { kind: *kind, d0, d1: config.branch_shapes[i * 3 + 1], d2: config.branch_shapes[i * 3 + 2],
            used: if *kind == 2 { d0 } else { usable_length(d0, nicon, kernel) } }
    }).collect())
}

/// Standardized blocks for the given rows, as tensors in the layout each branch expects.
fn blocks<B: Backend>(x: &[f64], cols: usize, rows: &[usize], geometry: &[Geometry], scaling: &Scaling, device: &B::Device)
    -> (Vec<Tensor<B, 3>>, Vec<Tensor<B, 4>>) {
    let (mut seqs, mut imgs) = (Vec::new(), Vec::new());
    let mut offset = 0usize;
    for g in geometry {
        let width = g.width();
        let mut data = Vec::with_capacity(rows.len() * width);
        if g.kind == 2 {
            // Input columns are HWC; Burn convolutions take NCHW.
            for &r in rows {
                for c in 0..g.d2 { for h in 0..g.d0 { for w in 0..g.d1 {
                    let j = offset + (h * g.d1 + w) * g.d2 + c;
                    data.push(((x[r * cols + j] - scaling.mean[j]) / scaling.scale[j]) as f32);
                } } }
            }
            imgs.push(Tensor::from_data(TensorData::new(data, [rows.len(), g.d2, g.d0, g.d1]), device));
        } else {
            for &r in rows {
                for c in 0..g.used {
                    let j = offset + c;
                    data.push(((x[r * cols + j] - scaling.mean[j]) / scaling.scale[j]) as f32);
                }
            }
            seqs.push(Tensor::from_data(TensorData::new(data, [rows.len(), 1, g.used]), device));
        }
        offset += width;
    }
    (seqs, imgs)
}

#[wasm_bindgen]
pub struct CnnRegressor {
    config: Config,
    geometry: Vec<Geometry>,
    scaling: Option<Scaling>,
    model: Option<Net<Inner>>,
}

#[derive(Serialize, Deserialize)]
struct Saved { config: Config, scaling: Scaling, weights: Vec<u8> }

#[wasm_bindgen]
impl CnnRegressor {
    #[wasm_bindgen(constructor)]
    pub fn new(config_json: &str) -> Result<CnnRegressor, JsError> {
        let config: Config = serde_json::from_str(config_json).map_err(|e| JsError::new(&e.to_string()))?;
        let geometry = geometry(&config).map_err(|e| JsError::new(&e))?;
        Ok(CnnRegressor { config, geometry, scaling: None, model: None })
    }

    /// `x`: row-major `rows × cols` features (blocks concatenated in branch order); `y`: one target per row.
    pub fn fit(&mut self, x: &[f64], rows: usize, cols: usize, y: &[f64]) -> Result<(), JsError> {
        self.fit_inner(x, rows, cols, y).map_err(|e| JsError::new(&e))
    }

    /// Regression: predictions in target units. Classification: the most probable class index per row
    /// (ties go to the lowest index).
    pub fn predict(&self, x: &[f64], rows: usize, cols: usize) -> Result<Vec<f64>, JsError> {
        let k = self.config.n_classes;
        if k >= 2 {
            let proba = self.predict_proba(x, rows, cols)?;
            return Ok(proba.chunks(k).map(|row| {
                let mut best = 0;
                for (index, value) in row.iter().enumerate() { if *value > row[best] { best = index } }
                best as f64
            }).collect());
        }
        let (model, scaling) = self.fitted(cols, rows, x)?;
        let device = Default::default();
        let mut out = Vec::with_capacity(rows);
        let all: Vec<usize> = (0..rows).collect();
        for chunk in all.chunks(256) {
            let (seqs, imgs) = blocks::<Inner>(x, cols, chunk, &self.geometry, scaling, &device);
            let pred = model.forward(seqs, imgs, &self.config.branch_kinds, self.config.architecture == "nicon", false, false);
            let values = pred.into_data().to_vec::<f32>().map_err(|e| JsError::new(&format!("{e:?}")))?;
            out.extend(values.into_iter().map(|v| v as f64 * scaling.y_scale + scaling.y_offset));
        }
        Ok(out)
    }

    /// Classification only: softmax class probabilities, row-major `rows × n_classes` (rows sum to 1).
    pub fn predict_proba(&self, x: &[f64], rows: usize, cols: usize) -> Result<Vec<f64>, JsError> {
        let k = self.config.n_classes;
        if k < 2 { return Err(JsError::new("predict_proba needs a classification CNN (n_classes >= 2)")) }
        let (model, scaling) = self.fitted(cols, rows, x)?;
        let device = Default::default();
        let mut out = Vec::with_capacity(rows * k);
        let all: Vec<usize> = (0..rows).collect();
        for chunk in all.chunks(256) {
            let (seqs, imgs) = blocks::<Inner>(x, cols, chunk, &self.geometry, scaling, &device);
            let logits = model.forward(seqs, imgs, &self.config.branch_kinds, self.config.architecture == "nicon", false, true);
            let values = activation::softmax(logits, 1).into_data().to_vec::<f32>().map_err(|e| JsError::new(&format!("{e:?}")))?;
            // Renormalise in f64 so every row is an exact distribution for the OOF checks.
            for row in values.chunks(k) {
                let total: f64 = row.iter().map(|v| *v as f64).sum();
                out.extend(row.iter().map(|v| *v as f64 / total));
            }
        }
        Ok(out)
    }

    /// Weights and scaling, for the controller's fitted state.
    pub fn export_state(&self) -> Result<Vec<u8>, JsError> {
        let (model, scaling) = match (&self.model, &self.scaling) {
            (Some(model), Some(scaling)) => (model, scaling),
            _ => return Err(JsError::new("Fit the CNN before export")),
        };
        let weights = BinBytesRecorder::<FullPrecisionSettings>::default().record(model.clone().into_record(), ())
            .map_err(|e| JsError::new(&format!("{e:?}")))?;
        serde_json::to_vec(&Saved { config: self.config.clone(), scaling: scaling.clone(), weights }).map_err(|e| JsError::new(&e.to_string()))
    }

    pub fn from_state(bytes: &[u8]) -> Result<CnnRegressor, JsError> {
        let saved: Saved = serde_json::from_slice(bytes).map_err(|e| JsError::new(&e.to_string()))?;
        let geometry = geometry(&saved.config).map_err(|e| JsError::new(&e))?;
        let device = Default::default();
        let record = BinBytesRecorder::<FullPrecisionSettings>::default().load(saved.weights, &device)
            .map_err(|e| JsError::new(&format!("{e:?}")))?;
        let model = Net::<Inner>::init(&saved.config, &geometry, &device).map_err(|e| JsError::new(&e))?.load_record(record);
        Ok(CnnRegressor { config: saved.config, geometry, scaling: Some(saved.scaling), model: Some(model) })
    }
}

impl CnnRegressor {
    fn fitted(&self, cols: usize, rows: usize, x: &[f64]) -> Result<(&Net<Inner>, &Scaling), JsError> {
        let (model, scaling) = match (&self.model, &self.scaling) {
            (Some(model), Some(scaling)) => (model, scaling),
            _ => return Err(JsError::new("Fit or restore the CNN first")),
        };
        if cols != scaling.mean.len() || x.len() != rows * cols { return Err(JsError::new("Prediction matrix shape differs from the fitted model")) }
        Ok((model, scaling))
    }

    fn fit_inner(&mut self, x: &[f64], rows: usize, cols: usize, y: &[f64]) -> Result<(), String> {
        let width: usize = self.geometry.iter().map(Geometry::width).sum();
        if width != cols || x.len() != rows * cols || y.len() != rows || rows == 0 {
            return Err("CNN branch geometry disagrees with the source blocks".into());
        }
        let nicon = self.config.architecture == "nicon";
        let mean: Vec<f64> = (0..cols).map(|j| (0..rows).map(|r| x[r * cols + j]).sum::<f64>() / rows as f64).collect();
        let scale: Vec<f64> = (0..cols).map(|j| {
            let s = ((0..rows).map(|r| (x[r * cols + j] - mean[j]).powi(2)).sum::<f64>() / rows as f64).sqrt();
            if s > 0.0 { s } else { 1.0 }
        }).collect();
        let k = self.config.n_classes;
        if k >= 2 && y.iter().any(|v| v.fract() != 0.0 || *v < 0.0 || *v >= k as f64) {
            return Err(format!("classification targets must be class indices 0..{}", k - 1));
        }
        let (y_offset, y_scale) = if k >= 2 { (0.0, 1.0) } else if nicon {
            let lo = y.iter().cloned().fold(f64::INFINITY, f64::min);
            let hi = y.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
            (lo, if hi > lo { hi - lo } else { 1.0 })
        } else {
            let m = y.iter().sum::<f64>() / rows as f64;
            let s = (y.iter().map(|v| (v - m).powi(2)).sum::<f64>() / rows as f64).sqrt();
            (m, if s > 0.0 { s } else { 1.0 })
        };
        let scaling = Scaling { mean, scale, y_offset, y_scale };
        let target: Vec<f32> = y.iter().map(|v| ((v - y_offset) / y_scale) as f32).collect();

        let device = Default::default();
        Train::seed(self.config.seed);
        let mut model = Net::<Train>::init(&self.config, &self.geometry, &device)?;
        let mut optim = AdamConfig::new().init();
        let mut rng = Rng(self.config.seed ^ 0x6E69_7273_3461_6C6C);
        let mut order: Vec<usize> = (0..rows).collect();
        let batch = self.config.batch_size.max(1);
        for _ in 0..self.config.epochs {
            for i in (1..order.len()).rev() { let j = (rng.next() % (i as u64 + 1)) as usize; order.swap(i, j); }
            for chunk in order.chunks(batch) {
                // Batch norm needs more than one sample per batch.
                if chunk.len() < 2 { continue }
                let (seqs, imgs) = blocks::<Train>(x, cols, chunk, &self.geometry, &scaling, &device);
                let loss = if k >= 2 {
                    let labels: Vec<i64> = chunk.iter().map(|&r| y[r] as i64).collect();
                    let targets = Tensor::<Train, 1, Int>::from_data(TensorData::new(labels, [chunk.len()]), &device);
                    let logits = model.forward(seqs, imgs, &self.config.branch_kinds, nicon, true, true);
                    CrossEntropyLossConfig::new().init(&device).forward(logits, targets)
                } else {
                    let yt: Vec<f32> = chunk.iter().map(|&r| target[r]).collect();
                    let ys = Tensor::<Train, 2>::from_data(TensorData::new(yt, [chunk.len(), 1]), &device);
                    let pred = model.forward(seqs, imgs, &self.config.branch_kinds, nicon, true, false);
                    MseLoss::new().forward(pred, ys, Reduction::Mean)
                };
                let grads = GradientsParams::from_grads(loss.backward(), &model);
                model = optim.step(self.config.learning_rate, model, grads);
            }
        }
        self.model = Some(model.valid());
        self.scaling = Some(scaling);
        Ok(())
    }
}

#[allow(dead_code)]
fn _assert_autodiff<B: AutodiffBackend>() {}
