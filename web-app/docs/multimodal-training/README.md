# Practical multimodal workshop

The published support is in `public/multimodal-training/`: an editable 18-slide PowerPoint,
its rendered PDF and the practical HTML guide. The session allocates 21 minutes to explanations,
17 to live pipeline editing and 2 to discussion.

`slides.json` and `build_practical_deck.py` preserve the editable text, diagrams, tables and notes.
The generator requires Python with python-pptx and Pillow, plus fontconfig. Run it from this
directory in an environment providing those packages; render its PowerPoint with LibreOffice
or PowerPoint to regenerate the PDF. The guide remains a separate public HTML document.

Generation also requires the referenced local native qualification exports. Obtain them from
the original qualification record, or run `tests/multimodal-smoke.mjs` and
`tests/multimodal-editor-smoke.mjs` against the qualified application and update the local
`evidence_file` references in `teaching-evidence.json`. The generator deliberately refuses to
render numerical examples when their native evidence files are missing.

`editor-captures.json` records the actual qualified local build, source revision, capture URL,
versions, image hashes and evidence references. The images were captured from the actual
Web editor; they are labelled as qualified build captures. `teaching-evidence.json` contains
selected native outputs from the deterministic synthetic teaching collections, not recomputed
scores. Local evidence-file references identify the qualification record used for this edition.
Complete experiment exports and fitted states are deliberately outside this source bundle.

The early-fusion comparison keeps the same 96 calibration observations and folds: all three
sources with PLS 3, MIR disconnected with PLS 3, and all sources restored with PLS 6. Its
interpretation is limited to this simulation. The late example uses the actual aligned OOF
predictions for sample-002 and the native fixed-mean output. Scientific inputs remain owned
by IO/Formats; preprocessing and models by Methods; compilation, folds and merging by DAG-ML.

`public/multimodal-training/materials.json` identifies the exact delivered artifact bytes.
