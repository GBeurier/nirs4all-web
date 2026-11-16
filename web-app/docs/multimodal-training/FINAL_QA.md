# Final presentation QA

The practical 18-slide support is ready for the parent's coherent Web delivery. It teaches early, intermediate and late fusion with editable matrix/network diagrams, native prediction and score tables, and genuine editor captures. No repository, remote or public-site write was performed by this presentation task. The earlier rejected presentations were preserved.

## Deliverables

Publish these three files together under `/multimodal-training/`:

- `nirs4all_multimodal_training.pptx`
- `nirs4all_multimodal_training.pdf`
- `demo-guide.html`

Supporting sources, actual capture/native-result receipts, instructor guide, `SLIDE_NOTES.md`, editable-slide text and QA remain beside them. `FINAL_ARTIFACTS.json` and `SHA256SUMS` record exact file bytes.

## Render and structure

The final PPTX was generated using the project virtual environment. The existing task-local LibreOffice 7.3.7.2 launcher exported the PDF with exit 0. `pdftoppm -r 100 -png` produced the final previews with exit 0. All 18 slides were inspected individually; three final contact sheets are in `qa/contact-01.jpg` through `contact-03.jpg`.

- 18 PowerPoint slides, 18 PDF pages and 18 substantive speaker notes.
- 4 editable native PowerPoint tables; conceptual diagrams and labels remain editable.
- 31 picture objects, all with alt descriptions; 0 shapes outside the slide bounds.
- 9 distinct UI capture files used; their hashes match the receipts, and their original image bytes are embedded unchanged. Ordinary PowerPoint crops preserve actual pixels. Slides 13 and 14 explicitly identify multiple detail crops from one actual state.
- 1,260 seconds of explanation + 1,020 seconds of demonstrations + 120 seconds of discussion = 2,400 seconds (40 minutes).
- Final font fallback: Liberation Sans. Canonical warm paper/teal theme and original flagship teal logo retained.

The PLS/components box on slide 5 and both embedding boxes on slide 12 now fit. Slide 13 shows the actual paired image and spectrum for sample-002. Slide 14 visibly shows Embedding size 8 and the complete conv1d/conv2d source descriptions. No remaining material clipping, overlap or contrast issue was found in the final Linux LibreOffice render. UI captures intentionally show selected portions of the real editor, rather than entire long pages.

## Actual scientific evidence

The displayed numbers are read from current native exports; the presentation performs no local prediction, mean or score calculation. All four source-file hashes still match `teaching-evidence.json`.

| Actual saved draft | Native OOF n | Native OOF RMSE (a.u.) |
| --- | ---: | ---: |
| Raman + NIRS + MIR, PLS 3 | 96 | 0.25294434131417365 |
| Raman + NIRS, PLS 3 | 96 | 0.1562304267021797 |
| All original sources restored, PLS 6 | 96 | 0.08168572409919417 |

These runs share the actual dataset and fold fingerprints. The teaching conclusion is limited to source contribution and model capacity interacting in this simulation. It does not declare MIR intrinsically unhelpful. The slide says to compare OOF and keep the held-out test out of tuning.

The actual outer-OOF late-fusion row for sample-002 is Raman 1.6767437838717518, NIRS 1.0172494531753968, MIR 1.172858166445718 and native mean 1.2889504678309558 a.u. Slide 8 formats these native fields. Slide 16 copies sourceIds and head.params.n_components = 6 from the actual exported document, and shows the corresponding native OOF n and RMSE.

## Capture/build provenance

Captures are labelled **Actual qualified build capture**, never public-live capture. Their source is Web 0.5.3 / UI 0.2.5 at `http://127.0.0.1:4370/nirs4all_multimodale/`, recorded on 16 November 2026. Web source is `df06f00832050bce0e6c47da9145b4285bcc0b6d`; official UI package source is `590ee17427defd6f2c41c53f5d6cd316752932db`. The public delivery target is `https://web.nirs4all.org/nirs4all_multimodale/`.

The owner supplied accepted edited-run, Builder-import and complete strategy-matrix evidence for that qualified build. This task checked the evidence hashes and extracted native fields; it did not rerun the scientific matrix. The Builder illustration is the actual Columns step from `release-builder`, not the similarly named synthetic-editor capture. The image inspector/source-view recaptures used real browser interactions only, with no CSS/DOM changes, zero browser errors and zero network writes.

## Standalone HTML

The English guide has no script, remote font or external asset dependency. Browser checks at widths 1,440 and 390 pixels passed: one h1/main/nav, valid fragment targets, named links, loaded decorative brand image, no horizontal overflow, no page errors and no network requests. Keyboard Tab reaches the skip link and Enter focuses the main guide. Download hrefs use the agreed final public filenames. Public download links were not followed before delivery.

## Limits

Microsoft PowerPoint desktop rendering was not executed. The LibreOffice PDF is untagged; no PDF/UA claim is made. HTML semantics, keyboard navigation and layout were checked, without a screen-reader session or formal WCAG conformance audit. Speaker notes and `qa/slide-text.md` provide text explanations and native table content alongside the visuals. The parent verifies public serving of this same editor and these exact assets after publication.

## SHA-256

`nirs4all_multimodal_training.pptx` (1,219,049 bytes)

`3c6bb6007d176d6da5f6d689c39cc68af422ecc8e5287f23a2e8ba451097748a`

`nirs4all_multimodal_training.pdf` (1,012,658 bytes)

`cc494e58adf6870841760047c60286396b54e0678e32baa5ee9a27f8c358fde8`

`demo-guide.html` (37,420 bytes)

`aa2bbb6999034b9e80c5f767283f11188274c622e6cf5ad7efa1042940a257ac`

