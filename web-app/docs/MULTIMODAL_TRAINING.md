# Multisource and multimodal teaching laboratory

The laboratory is a separate static entry at
`https://web.nirs4all.org/nirs4all_multimodale/`, linked from the main Web
workbench. It loads files locally and computes in a background worker with the
Formats, IO, DAG-ML and Methods WebAssembly owners. There is no training server.

## Teaching experiments

All bundled data are deterministic CC0 simulations generated offline. Each
collection has 120 observations, with 96 calibration observations and 24 declared
test observations. They illustrate mechanisms, not expected rankings on real data.

| Case | Sources | Main teaching question |
| --- | --- | --- |
| Three spectroscopies | Raman: 48 shifts; NIRS: 64 wavelengths; MIR: 56 wavenumbers | Does another spectral window add complementary information? |
| Spectra and genetic markers | 64 NIRS wavelengths; 16 biallelic dosage markers; 60 biological groups with two observations each | How do modality-specific preprocessing and grouped validation change the experiment? |
| Spectra and images | 64 NIRS wavelengths; 12 × 12 grayscale images | What changes when a model learns local spatial features instead of treating pixels as ordinary columns? |

Each source retains its own axis, unit and representation. Selecting a sample
links its spectrum, marker values, image and target by identity. Source files in
the teaching collections intentionally use different row orders.

## Fusion pipelines

Fusion levels: early (low level: variables, including multiblock PLS, which fuses
block-structured variables), mid (features: extracted per source, here PCA
scores, the chemometric mid level; or learned by network branches and
concatenated inside the network, the deep-learning intermediate/mid/joint
fusion), late (high level: predictions). The CNN settings were chosen after a
few trials on the teaching collections, so its teaching scores are slightly
optimistic.

Section 5 edits one canonical nirs4all pipeline with the shared rack editor
(`nirs4all-ui/pipelineEditor`). Each source has its own lane; the step after the
lanes decides where the sources meet. Operators are native Methods method IDs.

| Preset | Canonical structure | What is learned |
| --- | --- | --- |
| Single source | `source_branch` with one lane → PLS | One PLS model; run every source baseline |
| Early | `source_branch` → `merge_sources: "concat"` → PLS | One PLS model on the concatenated variables |
| Early · MB-PLS | `source_branch` → MB-PLS (no source merge) | Centered-block, equal-super-weight multiblock NIPALS (low-level fusion with block structure) |
| Mid · PCA scores | `source_branch` (scaling + training-fitted PCA scores per source) → `merge_sources` → PLS | Per-source PCA and one PLS model |
| Mid · CNN | `source_branch` → multibranch network (8 filters, embeddings of 16, 150 epochs) | Jointly trained convolution/dense branches whose embeddings are concatenated mid-network, and a common regression head |
| Late · average | `branch` with `by_source: true` (one model per lane) → `merge: {predictions: "all", aggregate: "mean"}` | Source PLS models; fixed equal weights |
| Late · stacking | `by_source` branch → `merge: "predictions"` → Ridge | Source PLS models and a Ridge meta-learner on nested OOF predictions |
| Late · AOM stacking | `by_source` branch: AOM-PLS (`aom_pop.calibration`) per spectrum, PLS elsewhere → `merge: "predictions"` → Ridge | Operator-adaptive PLS per spectrum (raw/SNV/MSC branches and preprocessing chains selected by internal CV inside the training fold), Ridge meta-learner |

A lane may end with a nested `branch` of several models (several base models per
source). `merge: {predictions: "all", include_original: true}` gives the
meta-model the scaled source variables as well (hybrid stacking). The host maps
this subset onto the qualified native execution document and refuses anything
else with an explanation (splitter steps, sweeps or tuning, spectral steps on
marker or image lanes, a source merge before a multiblock model, …). The
preset recipes compile to exactly the native recipes of the previous teaching
strategies (`src/multimodal/fusion.test.ts`).

### Browser models (laboratory only)

Besides the native Methods models, three host models can end a branch. They run
behind the same native DAG-ML controller (same folds, OOF predictions, refit and
held-out replay) but exist only in the browser: no Python/R equivalent and no
portable Methods state. The maintainer accepted this exception for the teaching
laboratory.

| Operator | Engine | Preset | Notes |
| --- | --- | --- | --- |
| `host.mljs.random_forest_regressor` | ml.js (Core `classic-ml` adapter) | Early · random forest | 50 trees; long spectra resampled to 128 points first |
| `host.tfjs.cnn_regressor` | TensorFlow.js 3.21 (WebGL on a hardware GPU, otherwise CPU) | Mid · CNN (TF.js), markers · CNN (TF.js) | offered when a marker table is present; 1-D convolution along the marker order |
| `host.burn.cnn_regressor` | Burn 0.16.1 compiled to WebAssembly (`lab-burn/`) | Mid · NICON (Burn) | the nirs4all NICON 1-D CNN per spectrum (≥ 175 points; resampled to 256), SNV and Savitzky–Golay first |

On the 294-sample cocaine collection (three spectra of 778–3,734 points), running
every preset takes about three minutes in a desktop browser; NICON is the longest
step (about two minutes).

**Run this pipeline** adds one run; **Run all presets** adds every preset of the
dataset. Every completed run stays in the shared Inspector in section 6 until the
data change or **Clear runs**; rank on the OOF scores and check that runs share
the same fold set. Pipelines export and import as canonical JSON.

The network uses 1-D convolutions for spectra, a dense branch for markers and
2-D convolutions for images. It trains from scratch for a fixed number of epochs;
it is a compact CPU/WASM model, not a pretrained image backbone. Flattening an
image preserves its ordered pixel values but gives PLS no convolutional locality
or shared-filter inductive bias.

## A valid comparison

Use the same selected sources, source preprocessing, samples, outer folds and
held-out identities for every candidate. Defaults are three outer folds and three
inner folds with fixed hyperparameters. The seed is an exact decimal u64 string.
Declared groups remain whole in outer, inner and refit-OOF folds. Repeated
measurement identities are distinct; their biological group identifies dependency.

Every fitted preprocessing step learns only from its current training scope.
Stacking trains each meta-learner on predictions from base models that did not
train on those observations. Hybrid raw features use exactly the same identities
as those OOF features. Final refit repeats the inner OOF process on calibration
data; held-out predictions come from replaying the fitted native package.

Compare recipes using OOF scores. The held-out test is a final check after a
recipe is chosen. Looking repeatedly at scores while changing recipes is
exploration, not unbiased model selection. The page presents run order rather
than declaring a universal winner.

Each source can have its own SNV, Savitzky–Golay or train-fitted standard scaling
where its representation allows it. Spectral operations do not apply to marker
or image tables. Optional block RMS scaling divides each block by one
training-fitted scalar; the PLS head does not silently undo it with variable-wise
scaling. The network's internal train-fitted normalization absorbs a uniform
block scalar, as disclosed in its result diagnostics.

Changing the data clears the comparison. Changing the validation protocol keeps
earlier runs but the Inspector warns that they use another fold set. Cancel
terminates the owned compute worker and keeps no partial run. The JSON downloads document settings,
scopes, predictions, scores, versions and provenance; they are not executable
`.n4a` models and omit portable states that could contain training rows.

## Importing real data

Open **Import your files** to use the reusable `nirs4all-ui/datasetBuilder`
**Dataset Builder**, following four distinct steps:

1. **Source:** add the CSV/VCF/PNG files. CSV tables require UTF-8, comma separators
   and a header row. PNG assets are listed separately from their mapping table.
   A matching example ZIP can be downloaded and unzipped for rehearsal. An
   optional `manifest.json` pre-fills the editable choices; it is not required.
2. **Role:** mark each table as Measurements, Metadata & target, Combined, or
   Ignore. Choose the measurement profile/modality and edit its label. Combined
   tables hold both feature columns and the target.
3. **Columns:** select exact sample IDs, target and unit, optional biological
   groups and deterministic partition; select ordered feature columns and axes.
   VCF uses all variants and exact header sample identities. PNG mappings use
   the fixed `sample_id,file` columns and explicit HWC geometry.
4. **Validation:** review the mapping, click **Validate alignment**, inspect the
   owner-provided source counts, then click **Create dataset**. Any edit clears
   the prior validation. A refused import preserves the active dataset/results;
   complete-data training refuses missing cells while displaying their counts.

Collection names are flat and unambiguous. IO joins exact string identifiers,
including leading zeros; it never repairs a join by row position or guesses
sample IDs from image filenames. A file declared in an optional manifest but
not selected remains a blocking missing-file entry until added or explicitly
ignored. This wizard maps one measurement block per file; manifests with
multiple measurement declarations for the same file are explicitly refused.

The declared profile is `nirs4all.multimodal-import.v1`. Metadata specifies the
sample ID, numeric target, target unit, optional biological group and optional
deterministic train/test partition. Each numeric source declares ordered feature
headers. Spectroscopic sources also declare their numerical axis and unit.

A marker CSV source can replace the example VCF declaration:

```json
{
  "id": "genetics",
  "label": "Genetic markers",
  "modality": "genetics",
  "profile": "numeric_csv",
  "file": "markers.csv",
  "sampleId": "sample_id",
  "features": ["marker_1", "marker_2", "marker_3"]
}
```

VCF imports use the narrower `vcf_gt_dosage` profile: biallelic diploid GT calls
become alternate-allele dosages 0/1/2. Phase is discarded with provenance; missing
calls remain missing. BCF, multiallelic, symbolic and unsupported ploidy inputs
are refused. PNG imports use `png_manifest`, a `sample_id,file` mapping CSV and
an explicit fixed `[height,width,channels]` shape. Initial image support is 8-bit,
non-interlaced grayscale/RGB PNG without alpha, palettes or animation. There is no
automatic resize or per-image contrast stretch.

Missing cells retain validity information for inspection. This first training
profile requires complete aligned data and refuses missing cells rather than
globally imputing them. The browser currently authorizes a 64 MiB aggregate
decoded import budget. Large-image pipelines require an appropriate host profile.

The detailed owner contract is
[IO multimodal import](https://github.com/GBeurier/nirs4all-io/blob/main/docs/MULTIMODAL_IMPORT.md).
Numerical operations belong to Methods, source-controller orchestration and
native folds/OOF/scoring/replay to DAG-ML, and reusable presentation to UI.

## Forty-minute session

The training slides (in French, at the maintainer's request) are a page of this site,
`https://web.nirs4all.org/multimodal-training/slides/`, built from
`src/training-deck/` with the same theme and the laboratory's own pipeline
editor. Keys: arrows/space to move, **N** speaker notes, **P** a synchronised
presenter window (current and next slide, notes, a timer against the 40-minute
plan), **F** full screen. `?print` lays the deck out for PDF export and
`?print&notes` adds the notes; the exported PDFs are in
`public/multimodal-training/`.

The plan is 21 minutes of concepts (multimodal data, alignment, the four fusion
levels, honest stacking and comparison), 17 minutes for three live
demonstrations with one conclusion slide each, and two minutes of wrap-up. The
conclusion charts read `src/training-deck/evidence.json`: native scores recorded
from this laboratory (presets and the live edits of the demonstrations) on one
fold set per case. Regenerate it after any owner or recipe change by running the
presets and the scripted edits, and check the fold fingerprints match.

Useful primary conceptual references are Wolpert (1992),
[Stacked generalization](https://doi.org/10.1016/S0893-6080%2805%2980023-1),
Westerhuis et al. (1998),
[Analysis of multiblock and hierarchical PCA and PLS models](https://doi.org/10.1002/%28SICI%291099-128X%28199809/10%2912%3A5%3C301%3A%3AAID-CEM515%3E3.0.CO%3B2-S),
and Borràs et al. (2015),
[Data fusion methodologies for food and beverage authentication and quality assessment](https://doi.org/10.1016/j.aca.2015.04.042).
