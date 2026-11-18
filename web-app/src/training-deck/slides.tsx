import type { ReactNode } from 'react'
import {
  AlignmentDiagram, DatasetShapeDiagram, EarlyDiagram, EmbeddingDiagram, FusionPointsDiagram, IntermediateDiagram,
  LateDiagram, OofDiagram, SampleViewsDiagram,
} from './diagrams'
import { edit, fmt, preset, type CaseId } from './evidence'
import { LevelTag, PipelineView, Provenance, ResultsChart } from './widgets'

export interface Slide {
  id: string
  section: 'Concepts' | 'Live demonstration' | 'Wrap-up' | ''
  title: string
  /** Planned minutes, including live time. The plan totals 40. */
  minutes: number
  body: () => ReactNode
  /** What to say. */
  notes: string[]
}

const LAB = '../../nirs4all_multimodale/'
const labLink = (caseId: CaseId, presetId = 'early') => `${LAB}?case=${caseId}&preset=${presetId}`

function Points({ items }: { items: ReactNode[] }) {
  return <ul className="deck-points">{items.map((item, index) => <li key={index}><span>{item}</span></li>)}</ul>
}

function Steps({ items }: { items: ReactNode[] }) {
  return <ol className="deck-steps">{items.map((item, index) => <li key={index}><span>{item}</span></li>)}</ol>
}

function Callout({ children, tone = 'teal' }: { children: ReactNode; tone?: 'teal' | 'amber' }) {
  return <p className="deck-callout" data-tone={tone}>{children}</p>
}

function ProsCons({ pro, con }: { pro: ReactNode; con: ReactNode }) {
  return (
    <div className="deck-proscons">
      <p data-kind="pro"><span>+</span>{pro}</p>
      <p data-kind="con"><span>−</span>{con}</p>
    </div>
  )
}

function Capture({ src, alt }: { src: string; alt: string }) {
  return <figure className="deck-capture"><img src={src} alt={alt} loading="eager" /></figure>
}

const R = {
  ramanAlone: () => preset('spectroscopy', 'Raman alone').oofRmse,
  spec: (name: string) => preset('spectroscopy', name).oofRmse,
  gen: (name: string) => preset('genetics', name).oofRmse,
  img: (name: string) => preset('images', name).oofRmse,
}

export const SLIDES: Slide[] = [
  {
    id: 'title', section: '', title: 'Multimodal data in nirs4all', minutes: 0.5,
    body: () => (
      <div className="deck-title">
        <p className="deck-kicker">nirs4all training · multimodal session</p>
        <h1>One sample, several measurements,<br /><span className="n4-gradient-text">one honest prediction</span></h1>
        <p className="deck-lead">What multimodal data is · four ways to fuse sources · three live comparisons</p>
        <div className="deck-title-levels">
          <LevelTag level="early" /><LevelTag level="embedding" /><LevelTag level="intermediate" /><LevelTag level="late" />
        </div>
        <p className="deck-url">web.nirs4all.org/nirs4all_multimodale</p>
      </div>
    ),
    notes: [
      'Welcome. In this session we look at what happens when one sample is measured by more than one instrument.',
      'Plan: about 20 minutes of concepts with one picture per idea, then three live demonstrations in the browser laboratory, one dataset each, and a short wrap-up.',
      'Everything you will see runs locally in the browser; nothing is uploaded.',
    ],
  },
  {
    id: 'why', section: 'Concepts', title: 'Why combine measurements?', minutes: 1.5,
    body: () => (
      <div className="deck-split deck-split--hero">
        <SampleViewsDiagram />
        <div>
          <p className="deck-big">Each instrument sees <strong>part</strong> of the sample.</p>
          <Callout>Does the second source <strong>really improve</strong> the prediction?</Callout>
        </div>
      </div>
    ),
    notes: [
      'Think of a grain sample. NIRS sees overtones of C–H, O–H and N–H bonds; Raman sees other vibrations; a genotype tells us something the spectrum cannot see; an image sees shape and colour.',
      'Each instrument gives a partial view. When the views are complementary, combining them can predict better than any single one.',
      'But a second source also brings its own noise, its own preprocessing problems and a measurement cost. So the practical question is: does it really improve a prediction I can defend?',
      'That is exactly what we will test in the demonstrations: every fusion is compared with the best single source.',
    ],
  },
  {
    id: 'vocabulary', section: 'Concepts', title: 'What “multimodal” means here', minutes: 2,
    body: () => (
      <>
        <DatasetShapeDiagram />
        <div className="deck-columns">
          <div><h3>Source = block</h3><p>one table per instrument, same samples</p></div>
          <div><h3>Multisource</h3><p>same kind of data: NIRS + Raman + MIR</p></div>
          <div><h3>Multimodal</h3><p>different kinds: spectra, markers, images</p></div>
        </div>
      </>
    ),
    notes: [
      'Vocabulary first, because it is simple. A dataset is still samples in rows. The difference is that the columns come in blocks: one block per source.',
      'If all blocks are spectra, we often say multisource or multiblock, a term you may know from chemometrics. If the blocks are of different nature, for example a spectrum, a table of genetic marker dosages and an image, we say multimodal.',
      'nirs4all keeps each block with its own axis and unit: wavelengths in nm for NIRS, Raman shift in cm⁻¹, no axis for markers, height × width for images. Nothing is silently merged at loading time.',
    ],
  },
  {
    id: 'alignment', section: 'Concepts', title: 'Rule zero: align by sample identity', minutes: 1.5,
    body: () => (
      <>
        <AlignmentDiagram />
        <Callout>Join by <strong>sample ID</strong>, never by row number · keep replicate <strong>groups</strong> together</Callout>
      </>
    ),
    notes: [
      'Before any fusion, the rows must describe the same samples. Two files exported by two instruments are almost never in the same order.',
      'nirs4all matches by sample identifier, exactly. If a sample is missing in one source, you see it in the alignment table; it is not filled in by row number.',
      'Second rule: repeated measurements of the same plant or batch share a group. The group must stay entirely in training or entirely in validation, otherwise scores are optimistic. The genetics example will use this.',
    ],
  },
  {
    id: 'fusion-points', section: 'Concepts', title: 'Four places where sources can meet', minutes: 2,
    body: () => (
      <>
        <FusionPointsDiagram />
        <div className="deck-columns deck-columns--4">
          <div><LevelTag level="early" /><p><strong>variables</strong></p></div>
          <div><LevelTag level="embedding" /><p><strong>summaries</strong> of each source</p></div>
          <div><LevelTag level="intermediate" /><p><strong>inside</strong> one model</p></div>
          <div><LevelTag level="late" /><p><strong>predictions</strong></p></div>
        </div>
      </>
    ),
    notes: [
      'This is the map for the rest of the session. Follow each source from left to right: raw data, preprocessing, a representation, a model, a prediction.',
      'The only question is: at which point do the sources meet?',
      'One: early fusion, right after preprocessing, we put the variables side by side. Two: embedding fusion, each source is first summarised into a few numbers, and the summaries are joined. Three: intermediate fusion, the blocks stay separate but one single model learns from all of them together. Four: late fusion, each source has its own model and we combine the predictions.',
      'The colours you see here are used everywhere afterwards: in the slides, in the laboratory presets and in the result charts.',
    ],
  },
  {
    id: 'early', section: 'Concepts', title: 'Early fusion: put the variables side by side', minutes: 2.5,
    body: () => (
      <>
        <div className="deck-heading-tag"><LevelTag level="early" /></div>
        <EarlyDiagram />
        <PipelineView preset="early" />
        <ProsCons pro="simple · one model · usual PLS tools" con="scale each block · more variables need more LVs" />
      </>
    ),
    notes: [
      'Early fusion is what most of you have already done by hand: you concatenate the columns of the different instruments and you fit one PLS.',
      'Each source still gets its own preprocessing, in its own lane. In nirs4all this is a “source branch” followed by “merge sources: concat”, then the model. What you see under the drawing is the real pipeline editor of the laboratory, with one lane per source.',
      'Two cautions. First, a block with many variables or a large variance can dominate the PLS; that is why each block is scaled, and block scaling exists for that. Second, the combined matrix has more variables, so the model usually needs more latent variables than each single source. Keep that in mind: it is the key point of the first demonstration.',
    ],
  },
  {
    id: 'embedding', section: 'Concepts', title: 'Embedding fusion: summarise each source first', minutes: 2,
    body: () => (
      <>
        <div className="deck-heading-tag"><LevelTag level="embedding" /></div>
        <EmbeddingDiagram />
        <PipelineView preset="embedding" />
        <ProsCons pro="same weight per source · few columns · less noise" con="PCA ignores y: it may drop the useful signal" />
      </>
    ),
    notes: [
      'An embedding is just a compact numerical summary of a sample. You already know one: PCA scores.',
      'In embedding fusion, each source is compressed separately, here to five PCA scores, and only the scores are concatenated before the model. Each source then has the same weight in terms of columns, whatever its number of wavelengths or pixels.',
      'In deep learning the same idea is used with pre-trained encoders: an image network or a language model turns an image or a text into a vector, and vectors from several modalities are fused. The principle is identical.',
      'The PCA is fitted inside each training fold, never on the validation samples. Its limitation: it keeps the directions of largest variance, which are not necessarily those related to y.',
    ],
  },
  {
    id: 'intermediate', section: 'Concepts', title: 'Intermediate fusion: one model, separate blocks', minutes: 2.5,
    body: () => (
      <>
        <div className="deck-heading-tag"><LevelTag level="intermediate" /></div>
        <IntermediateDiagram />
        <PipelineView preset="mid" caseId="images" />
        <ProsCons pro="each source keeps its structure · learned for y" con="needs many samples and some tuning" />
      </>
    ),
    notes: [
      'Intermediate, or mid-level, fusion keeps the blocks separate up to the model, and the model itself does the fusion.',
      'With a neural network, each source has a branch adapted to its nature: a one-dimensional convolution slides along the spectrum, a dense layer reads the marker table, a two-dimensional convolution reads the image. Each branch produces a small embedding; the embeddings are concatenated and a common head predicts y. Everything is trained at once, so the branches learn what is useful for y — this is the difference with the PCA embedding.',
      'The laboratory really trains such a network in the browser, with the native Methods engine. It is small on purpose.',
      'The chemometric cousin is multiblock PLS: blocks stay separate, latent variables are shared, each block gets a weight. Both are available as presets.',
      'Price: more parameters, so more samples are needed, and training choices such as epochs and learning rate matter.',
    ],
  },
  {
    id: 'late', section: 'Concepts', title: 'Late fusion: one model per source, then combine', minutes: 2,
    body: () => (
      <>
        <div className="deck-heading-tag"><LevelTag level="late" /></div>
        <LateDiagram />
        <PipelineView preset="late-stacking" />
        <ProsCons pro="modular · robust to a missing instrument" con="no interaction between sources" />
      </>
    ),
    notes: [
      'Late fusion builds one complete model per source, exactly as you would for a single instrument, and combines the predictions.',
      'The simplest combination is the average. Nothing is learned; a weak source pulls the average towards its errors.',
      'Stacking learns the combination: a small meta-model, here a Ridge regression, receives the predictions of the source models as inputs and learns how much to trust each one.',
      'Late fusion is modular and robust; it is the natural choice when instruments are not always available. Its limit: the information is combined only at the end, so effects that appear only when the sources are seen together are lost.',
    ],
  },
  {
    id: 'oof', section: 'Concepts', title: 'Stacking needs out-of-fold predictions', minutes: 1.5,
    body: () => (
      <>
        <OofDiagram />
        <Callout tone="amber">nirs4all builds the meta-model inputs from out-of-fold predictions inside every training scope, automatically. You only choose the meta-model.</Callout>
      </>
    ),
    notes: [
      'One technical point, because it is the classic trap of stacking.',
      'If the meta-model learns from predictions made on the same samples that trained the source models, those predictions are too good. The meta-model then trusts the most flexible source too much.',
      'So each sample must be predicted by a model that did not see it: cross-validation within the training set, the out-of-fold predictions. nirs4all does this for you, nested inside the outer validation. You do not have to code it, but you should know why the stacking result is honest.',
    ],
  },
  {
    id: 'summary', section: 'Concepts', title: 'The four levels at a glance', minutes: 1.5,
    body: () => (
      <table className="deck-table">
        <thead><tr><th>Level</th><th>What is merged</th><th>Typical model</th><th>Strength</th><th>Watch out</th></tr></thead>
        <tbody>
          <tr><td><LevelTag level="early" /></td><td>preprocessed variables</td><td>PLS on the concatenation</td><td>simple, strong baseline</td><td>block scaling, number of LVs</td></tr>
          <tr><td><LevelTag level="embedding" /></td><td>compact summaries (PCA scores, encoder vectors)</td><td>PLS / Ridge</td><td>balanced, low dimension</td><td>summary may lose y-signal</td></tr>
          <tr><td><LevelTag level="intermediate" /></td><td>learned representations inside one model</td><td>MB-PLS, multibranch network</td><td>uses each modality’s structure</td><td>needs data and tuning</td></tr>
          <tr><td><LevelTag level="late" /></td><td>predictions</td><td>average or stacking</td><td>modular, robust</td><td>no interaction between sources</td></tr>
        </tbody>
      </table>
    ),
    notes: [
      'A summary to keep. Read it by column: what is merged, which model, the strength and the trap.',
      'None of the four levels is best in general. The data decide, and the only way to know is to compare them under the same validation, which is what we do now.',
    ],
  },
  {
    id: 'honest', section: 'Concepts', title: 'Compare fusions honestly', minutes: 1.5,
    body: () => (
      <div className="deck-split">
        <Steps items={[
          <><strong>Baselines</strong>: each source alone</>,
          <><strong>Same folds</strong> for every recipe</>,
          <>Rank on <strong>cross-validation</strong> (OOF)</>,
          <><strong>Test set</strong>: once, at the end</>,
          <>Many edits = a little overfitting</>,
        ]} />
        <Callout>A fusion is worth it only if it beats the <strong>best single source</strong>.</Callout>
      </div>
    ),
    notes: [
      'Before the demonstrations, the rules of the game.',
      'First, single-source baselines are part of every comparison. Second, all recipes share exactly the same folds; you will see the fold fingerprint in the Inspector. Third, we rank on cross-validated out-of-fold predictions. Fourth, the test set is looked at once, at the end.',
      'Last point: when I edit a pipeline live and keep the best variant, I am also making a selection. With a handful of edits on 96 samples it is acceptable for teaching, but in a real study you would confirm on new data.',
    ],
  },
  {
    id: 'lab', section: 'Live demonstration', title: 'The multimodal laboratory', minutes: 1,
    body: () => (
      <div className="deck-split deck-split--wide">
        <Capture src="../captures/lab-editor.png" alt="The fusion pipeline editor with presets and one lane per source" />
        <div>
          <Steps items={[
            <>Choose a case</>,
            <>Pick a <strong>fusion preset</strong>, edit it</>,
            <><strong>Run</strong> one or all presets</>,
            <>Compare in the <strong>Inspector</strong></>,
          ]} />
          <p className="deck-url"><a href={labLink('spectroscopy')}>web.nirs4all.org/nirs4all_multimodale</a></p>
        </div>
      </div>
    ),
    notes: [
      'Switch to the browser now. Show the page top to bottom quickly: the case, the data and the sources, the validation protocol, the pipeline editor with its presets grouped by fusion level, and the results Inspector.',
      'The presets are canonical nirs4all pipelines: the same structure you would write in Python with source_branch or a by-source branch. Execution is native WebAssembly, in a background worker.',
    ],
  },
  {
    id: 'demo-spectro', section: 'Live demonstration', title: 'Demo 1 · Raman + NIRS + MIR', minutes: 5,
    body: () => (
      <div className="deck-split deck-split--demo">
        <div>
          <p className="deck-case">120 samples · Raman 48 · NIRS 64 · MIR 56 variables · 96 calibration / 24 test</p>
          <Steps items={[
            <><a href={labLink('spectroscopy')}>Open the case</a>, follow one sample</>,
            <><strong>Run all presets</strong>: who wins?</>,
            <><LevelTag level="early">Early</LevelTag> PLS components <strong>3 → 6</strong></>,
            <>Delete the <em>MIR</em> lane, run again</>,
          ]} />
        </div>
        <Capture src="../captures/spectroscopy-inspector.png" alt="Inspector ranking the spectroscopy recipes" />
      </div>
    ),
    notes: [
      'Three spectroscopies measured on the same samples. Each technique has its own axis and noise; the target depends on chemistry that each window sees partially.',
      'Run all presets. It takes a few seconds. In the Inspector, sort by cross-validation RMSE.',
      'Surprise: with the default settings, Raman alone is as good as anything, and early fusion is worse than Raman alone. Ask the audience why.',
      'Answer: early fusion has 168 variables and only 3 PLS components; it is under-fitted. Click on the PLS cell and set 6 components; run. Now early fusion clearly beats Raman alone.',
      'Then select the MIR lane and delete it: two sources, run again. Show that removing a source can help.',
      'Note that stacking found the right answer by itself: it learned to trust Raman.',
    ],
  },
  {
    id: 'concl-spectro', section: 'Live demonstration', title: 'Demo 1 · what we learned', minutes: 1.5,
    body: () => (
      <div className="deck-split deck-split--chart">
        <ResultsChart caseId="spectroscopy" highlight={['Raman alone', 'Late · stacking', 'Early · PLS 6', 'Early · PLS 6 · without MIR']} />
        <div>
          <Points items={[
            <><strong>Not automatic</strong>: early PLS‑3 {fmt(R.spec('Early · concatenate'))} vs Raman {fmt(R.ramanAlone())}</>,
            <><strong>More LVs</strong>: PLS‑6 fusion {fmt(edit('spectroscopy', 'Early · PLS 6').oofRmse)} (Raman PLS‑6: {fmt(edit('spectroscopy', 'Raman alone · PLS 6').oofRmse)})</>,
            <><strong>Average dilutes</strong> ({fmt(R.spec('Late · average'))}), <strong>stacking</strong> trusts Raman ({fmt(R.spec('Late · stacking'))})</>,
          ]} />
          <Provenance caseId="spectroscopy" />
        </div>
      </div>
    ),
    notes: [
      'All bars are cross-validated RMSE on the same 96 samples and the same folds; the dashed line is the best single source. Hatched bars are the live edits.',
      'Three messages. One: concatenating is not enough; the model capacity must follow the number of variables. Two: the comparison is fair — Raman alone does not improve with more components, the gain really comes from the other sources. Three: averaging gives the weak sources the same weight as the strong one; stacking learns the weights.',
      'Removing MIR improved the score further, but remember the rule: every edit tested on the same folds is a selection; confirm on the test set once, or on new samples.',
    ],
  },
  {
    id: 'demo-genetics', section: 'Live demonstration', title: 'Demo 2 · NIRS + genetic markers', minutes: 4.5,
    body: () => (
      <div className="deck-split deck-split--demo">
        <div>
          <p className="deck-case">60 plants × 2 measurements = 120 samples · NIRS 64 · 16 marker dosages (0/1/2) · groups kept whole</p>
          <Steps items={[
            <><a href={labLink('genetics')}>Open the case</a>: one plant, two samples</>,
            <><strong>Run all presets</strong></>,
            <><LevelTag level="early">Early</LevelTag> and <em>NIRS alone</em>: PLS <strong>3 → 5</strong></>,
            <><LevelTag level="late">Average</LevelTag> vs <LevelTag level="intermediate">MB-PLS</LevelTag></>,
          ]} />
        </div>
        <Capture src="../captures/genetics-inspector.png" alt="Inspector ranking the genetics recipes" />
      </div>
    ),
    notes: [
      'Second case: two really different modalities, a continuous spectrum and a small table of genotype dosages. Each plant was measured twice: the two rows share the markers but not the spectrum. They form a group and the folds keep groups whole.',
      'Run all presets. The markers alone predict badly, worse than the mean. Would you drop them? Look at the fusions: early and MB-PLS are much better than NIRS alone. The markers carry information that only shows up together with the spectrum.',
      'Then the fair comparison: increase the PLS components for early fusion and for NIRS alone. The gap remains.',
      'Finally compare late average with MB-PLS: averaging with a weak source makes things worse than NIRS alone.',
    ],
  },
  {
    id: 'concl-genetics', section: 'Live demonstration', title: 'Demo 2 · what we learned', minutes: 1.5,
    body: () => (
      <div className="deck-split deck-split--chart">
        <ResultsChart caseId="genetics" highlight={['NIRS alone', 'Intermediate · MB-PLS', 'Early · PLS 5', 'NIRS alone · PLS 5', 'Late · average']} />
        <div>
          <Points items={[
            <><strong>Weak alone ≠ useless</strong>: markers {fmt(R.gen('Genetic markers alone'))}, but fusion {fmt(edit('genetics', 'Early · PLS 5').oofRmse)} vs NIRS {fmt(edit('genetics', 'NIRS alone · PLS 5').oofRmse)}</>,
            <><strong>Variables level wins</strong>: MB-PLS {fmt(R.gen('Intermediate · MB-PLS'))}; average {fmt(R.gen('Late · average'))}</>,
            <><strong>Network</strong> {fmt(R.gen('Intermediate · network'))}: not with 96 samples</>,
          ]} />
          <Provenance caseId="genetics" />
        </div>
      </div>
    ),
    notes: [
      'Main message: judge a source by what it adds, not by its score alone. The markers alone are useless as a predictor, but combined with the spectrum they reduce the error by half.',
      'Feature-level fusions see both blocks at the same time; late fusion sees each block separately, so it cannot exploit the complementarity as well, and the average is even worse than NIRS alone.',
      'The compact network is clearly behind here. With 96 samples and fixed default settings it is not competitive: a more complex model is not automatically better.',
    ],
  },
  {
    id: 'demo-images', section: 'Live demonstration', title: 'Demo 3 · NIRS + images', minutes: 3,
    body: () => (
      <div className="deck-split deck-split--demo">
        <div>
          <p className="deck-case">120 samples · NIRS 64 · 12 × 12 grey image per sample · 96 calibration / 24 test</p>
          <Steps items={[
            <><a href={labLink('images', 'mid')}>Open the case</a>: spectrum + image</>,
            <><LevelTag level="intermediate">Network</LevelTag>: 1-D and 2-D branches</>,
            <><strong>Run all presets</strong></>,
            <>Optional: <strong>100 epochs</strong></>,
          ]} />
        </div>
        <Capture src="../captures/images-inspector.png" alt="Inspector ranking the image recipes" />
      </div>
    ),
    notes: [
      'Last case: a spectrum and a small image for each sample. Early fusion and PLS treat the 144 pixels as 144 independent variables; the network keeps the 2-D layout with a convolution.',
      'Show the network preset in the editor: the same source lanes, and the model step does the fusion. Run all presets.',
      'If time allows, increase the epochs to 100 and run: the score barely moves. More training is not what is missing here; with 96 small synthetic images this compact network does not beat the linear models.',
    ],
  },
  {
    id: 'concl-images', section: 'Live demonstration', title: 'Demo 3 · what we learned', minutes: 1.5,
    body: () => (
      <div className="deck-split deck-split--chart">
        <ResultsChart caseId="images" highlight={['Grayscale images alone', 'Early · concatenate', 'Embedding · PCA scores', 'Intermediate · network']} />
        <div>
          <Points items={[
            <><strong>Image leads</strong> ({fmt(R.img('Grayscale images alone'))}), spectrum adds: early {fmt(R.img('Early · concatenate'))}</>,
            <><strong>Embedding</strong> {fmt(R.img('Embedding · PCA scores'))} with 10 columns instead of 208</>,
            <><strong>2-D network</strong> {fmt(R.img('Intermediate · network'))}: right idea, too few samples</>,
          ]} />
          <Provenance caseId="images" />
        </div>
      </div>
    ),
    notes: [
      'Here fusion clearly helps: both early and embedding beat the best single source.',
      'Embedding fusion is interesting: five numbers per source are almost as good as all 208 variables. That is the idea behind using pre-trained image or spectral encoders on larger problems.',
      'The network respects the image structure, which is the right idea for real images, but with 96 small synthetic images it does not beat PLS. With real images and more samples, the balance may change.',
    ],
  },
  {
    id: 'take-home', section: 'Wrap-up', title: 'What to try first on your data', minutes: 1,
    body: () => (
      <div className="deck-guide">
        <div><span className="deck-guide-key"><span className="deck-num">1</span>Baselines</span><p>each source alone</p></div>
        <div><span className="deck-guide-key"><LevelTag level="early" /></span><p>block scaling, let the LVs grow</p></div>
        <div><span className="deck-guide-key"><LevelTag level="embedding" /><LevelTag level="intermediate" /></span><p>unbalanced blocks · networks only with many samples</p></div>
        <div><span className="deck-guide-key"><LevelTag level="late" /></span><p>instruments not always available: stacking</p></div>
        <div><span className="deck-guide-key"><span className="deck-num">✓</span>Protocol</span><p>same folds · OOF · test once</p></div>
      </div>
    ),
    notes: [
      'To take home: start with the single sources, then early fusion done properly. Move to embeddings or multiblock models when blocks are unbalanced, to late fusion when instruments are not always there. Networks when you have many samples or real images.',
      'And always the same protocol. Thank you; questions are welcome — the laboratory stays open on the screen.',
    ],
  },
  {
    id: 'resources', section: 'Wrap-up', title: 'Questions · resources', minutes: 0,
    body: () => (
      <div className="deck-split">
        <div>
          <h3>Laboratory</h3>
          <p className="deck-url"><a href={LAB}>web.nirs4all.org/nirs4all_multimodale</a></p>
          <p>Import your own CSV / VCF / PNG files with the dataset builder; export any pipeline as JSON.</p>
          <h3>The same pipelines in Python</h3>
          <pre className="deck-code">{`pipeline = [
  {"source_branch": {"NIR": [SNV()], "markers": [StandardScaler()]}},
  {"merge_sources": "concat"},
  PLSRegression(n_components=5),
]`}</pre>
        </div>
        <div>
          <h3>Late fusion (stacking)</h3>
          <pre className="deck-code">{`pipeline = [
  {"branch": {"by_source": True, "steps": {
      "NIR": [SNV(), PLSRegression(5)],
      "markers": [StandardScaler(), PLSRegression(3)]}}},
  {"merge": "predictions"},
  Ridge(alpha=1.0),
]`}</pre>
          <p>Documentation: <a href="https://nirs4all.readthedocs.io">nirs4all.readthedocs.io</a> · user guide › multi-source pipelines</p>
        </div>
      </div>
    ),
    notes: [
      'This slide stays on during questions. The same structures exist in the Python library: source_branch and merge_sources for feature-level fusion, a by-source branch and a prediction merge for late fusion.',
    ],
  },
]
