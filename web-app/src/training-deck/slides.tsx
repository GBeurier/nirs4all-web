import type { ReactNode } from 'react'
import {
  AlignmentDiagram, DatasetShapeDiagram, EarlyDiagram, EmbeddingDiagram, FusionPointsDiagram, IntermediateDiagram,
  LateDiagram, OofDiagram, SampleViewsDiagram,
} from './diagrams'
import { edit, fmt, preset, type CaseId } from './evidence'
import { LevelTag, PipelineView, Provenance, ResultsChart } from './widgets'

export interface Slide {
  id: string
  section: 'Concepts' | 'Démonstration' | 'Synthèse' | ''
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
  ramanAlone: () => preset('spectroscopy', 'Raman seul').oofRmse,
  spec: (name: string) => preset('spectroscopy', name).oofRmse,
  gen: (name: string) => preset('genetics', name).oofRmse,
  img: (name: string) => preset('images', name).oofRmse,
}

export const SLIDES: Slide[] = [
  {
    id: 'title', section: '', title: 'Données multimodales dans nirs4all', minutes: 0.5,
    body: () => (
      <div className="deck-title">
        <p className="deck-kicker">formation nirs4all · session multimodale</p>
        <h1>Un échantillon, plusieurs mesures,<br /><span className="n4-gradient-text">une prédiction défendable</span></h1>
        <p className="deck-lead">Les données multimodales · quatre niveaux de fusion · trois démonstrations</p>
        <div className="deck-title-levels">
          <LevelTag level="early" /><LevelTag level="mid" /><LevelTag level="joint" /><LevelTag level="late" />
        </div>
        <p className="deck-url">web.nirs4all.org/nirs4all_multimodale</p>
      </div>
    ),
    notes: [
      'Bienvenue. Dans cette session, on regarde ce qui se passe quand un même échantillon est mesuré par plusieurs instruments.',
      'Le plan : une vingtaine de minutes de concepts, une image par idée, puis trois démonstrations en direct dans le labo du navigateur, une par jeu de données, et une courte synthèse.',
      'Tout ce que vous allez voir tourne localement dans le navigateur ; aucune donnée n’est envoyée.',
    ],
  },
  {
    id: 'why', section: 'Concepts', title: 'Pourquoi combiner des mesures ?', minutes: 1.5,
    body: () => (
      <div className="deck-split deck-split--hero">
        <SampleViewsDiagram />
        <div>
          <p className="deck-big">Chaque instrument voit <strong>une partie</strong> de l’échantillon.</p>
          <Callout>La deuxième source améliore-t-elle <strong>vraiment</strong> la prédiction ?</Callout>
        </div>
      </div>
    ),
    notes: [
      'Prenons un échantillon de grain. Le NIRS voit les harmoniques des liaisons C–H, O–H et N–H ; le Raman voit d’autres vibrations ; le génotype dit quelque chose que le spectre ne voit pas ; l’image voit la forme et la couleur.',
      'Chaque instrument donne une vue partielle. Quand les vues sont complémentaires, les combiner peut prédire mieux que n’importe laquelle seule.',
      'Mais une deuxième source apporte aussi son bruit, ses problèmes de prétraitement et un coût de mesure. La vraie question est donc : améliore-t-elle une prédiction que je peux défendre ?',
      'C’est exactement ce qu’on va tester en démonstration : chaque fusion est comparée à la meilleure source seule.',
    ],
  },
  {
    id: 'vocabulary', section: 'Concepts', title: 'Ce que « multimodal » veut dire ici', minutes: 2,
    body: () => (
      <>
        <DatasetShapeDiagram />
        <div className="deck-columns">
          <div><h3>Source = bloc</h3><p>une table par instrument, mêmes échantillons</p></div>
          <div><h3>Multisource</h3><p>même nature de données : NIRS + Raman + MIR</p></div>
          <div><h3>Multimodal</h3><p>natures différentes : spectres, marqueurs, images</p></div>
        </div>
      </>
    ),
    notes: [
      'D’abord le vocabulaire, parce qu’il est simple. Un jeu de données, ce sont toujours des échantillons en lignes. La différence, c’est que les colonnes arrivent par blocs : un bloc par source.',
      'Si tous les blocs sont des spectres, on parle de multisource ou de multibloc, un terme que vous connaissez en chimiométrie. Si les blocs sont de nature différente — un spectre, un tableau de dosages de marqueurs, une image — on parle de multimodal.',
      'nirs4all garde chaque bloc avec son axe et son unité : longueurs d’onde en nm pour le NIRS, déplacement Raman en cm⁻¹, pas d’axe pour les marqueurs, hauteur × largeur pour les images. Rien n’est fusionné en douce au chargement.',
    ],
  },
  {
    id: 'alignment', section: 'Concepts', title: 'Règle zéro : aligner par identifiant', minutes: 1.5,
    body: () => (
      <>
        <AlignmentDiagram />
        <Callout>Jointure par <strong>identifiant d’échantillon</strong>, jamais par numéro de ligne · les <strong>groupes</strong> de répétitions restent ensemble</Callout>
      </>
    ),
    notes: [
      'Avant toute fusion, les lignes doivent décrire les mêmes échantillons. Deux fichiers exportés par deux instruments ne sont presque jamais dans le même ordre.',
      'nirs4all joint par identifiant, exactement. S’il manque un échantillon dans une source, vous le voyez dans le tableau d’alignement ; il n’est jamais complété par numéro de ligne.',
      'Deuxième règle : les mesures répétées d’une même plante ou d’un même lot forment un groupe. Le groupe doit rester entièrement en entraînement ou entièrement en validation, sinon les scores sont optimistes. L’exemple génétique s’en sert.',
    ],
  },
  {
    id: 'fusion-points', section: 'Concepts', title: 'Quatre endroits où les sources se rejoignent', minutes: 2,
    body: () => (
      <>
        <FusionPointsDiagram />
        <div className="deck-columns deck-columns--4">
          <div><LevelTag level="early" /><p>les <strong>variables</strong></p></div>
          <div><LevelTag level="mid" /><p>des <strong>caractéristiques</strong> extraites par source</p></div>
          <div><LevelTag level="joint" /><p><strong>dans</strong> un seul modèle appris</p></div>
          <div><LevelTag level="late" /><p>les <strong>prédictions</strong></p></div>
        </div>
      </>
    ),
    notes: [
      'Voici la carte pour la suite. Suivez chaque source de gauche à droite : données brutes, prétraitement, un résumé, un modèle, une prédiction.',
      'La seule question est : à quel endroit les sources se rejoignent-elles ?',
      'Un : bas niveau, ou early fusion. On met les variables prétraitées côte à côte. Deux : niveau intermédiaire. Chaque source est d’abord résumée par quelques caractéristiques, par exemple des scores ACP ou PLS, puis on fusionne ces résumés. Trois : haut niveau, ou late fusion. Chaque source a son modèle, et on combine les prédictions.',
      'Et un cas à part, que le monde du deep learning appelle souvent « intermediate fusion » : un seul modèle, un réseau, qui apprend en même temps une représentation par source et la façon de les combiner. On l’appellera modèle conjoint, pour ne pas le confondre avec le niveau intermédiaire des chimiométriciens.',
      'Les couleurs que vous voyez ici sont utilisées partout ensuite : slides, presets du labo et graphiques de résultats.',
    ],
  },
  {
    id: 'early', section: 'Concepts', title: 'Bas niveau : les variables côte à côte', minutes: 2.5,
    body: () => (
      <>
        <div className="deck-heading-tag"><LevelTag level="early" /></div>
        <EarlyDiagram />
        <PipelineView preset="early" />
        <ProsCons pro="simple · un seul modèle · outils PLS habituels" con="pondérer les blocs · plus de variables → plus de VL" />
      </>
    ),
    notes: [
      'La fusion de bas niveau, c’est ce que la plupart d’entre vous ont déjà fait à la main : on concatène les colonnes des différents instruments et on ajuste un seul PLS.',
      'Chaque source garde son propre prétraitement, dans sa propre voie. Dans nirs4all, c’est une « source branch » suivie de « merge sources : concat », puis le modèle. Ce que vous voyez sous le dessin est le vrai éditeur de pipeline du labo, avec une voie par source.',
      'Deux précautions. Un bloc avec beaucoup de variables, ou une grande variance, peut dominer le PLS : c’est pour ça qu’on pondère chaque bloc. Et la matrice combinée a plus de variables : le modèle a généralement besoin de plus de variables latentes qu’une source seule. Retenez-le, c’est le point clé de la première démonstration.',
      'Le MB-PLS est une variante multibloc de ce niveau. Chaque bloc donne un score, les scores de blocs sont combinés en un super-score commun, et on retire de toutes les variables la part qu’il explique. Westerhuis a montré en 1998 que ce MB-PLS équivaut à un PLS sur la concaténation des blocs pondérés. On travaille donc bien sur les variables : c’est du bas niveau, avec la structure en blocs en plus, notamment des poids par bloc à interpréter.',
    ],
  },
  {
    id: 'mid', section: 'Concepts', title: 'Niveau intermédiaire : résumer chaque source', minutes: 2,
    body: () => (
      <>
        <div className="deck-heading-tag"><LevelTag level="mid" /></div>
        <EmbeddingDiagram />
        <PipelineView preset="mid-pca" />
        <ProsCons pro="même poids par source · peu de colonnes · moins de bruit" con="l’ACP ignore y : elle peut perdre le signal utile" />
      </>
    ),
    notes: [
      'Au niveau intermédiaire, on ne fusionne plus les variables mais des caractéristiques extraites de chaque source. Le cas le plus classique en chimiométrie : les scores d’une ACP ou d’un PLS par bloc. On peut aussi y mettre des variables sélectionnées, ou des descripteurs calculés.',
      'Ici, chaque source est résumée par cinq scores ACP, et seuls ces scores sont concaténés avant le modèle. Chaque source pèse alors le même nombre de colonnes, quel que soit son nombre de longueurs d’onde ou de pixels.',
      'En deep learning, on fait la même chose avec des encodeurs pré-entraînés : un réseau d’images ou un modèle de langage transforme une image ou un texte en vecteur — un « embedding » — et ce sont ces vecteurs qu’on fusionne. Le principe est le même.',
      'L’ACP est ajustée dans chaque fold d’entraînement, jamais sur les échantillons de validation. Sa limite : elle garde les directions de plus grande variance, qui ne sont pas forcément celles liées à y. Des scores PLS par bloc tiendraient compte de y.',
    ],
  },
  {
    id: 'joint', section: 'Concepts', title: 'Modèle conjoint : une branche par source, un seul réseau', minutes: 2.5,
    body: () => (
      <>
        <div className="deck-heading-tag"><LevelTag level="joint" /></div>
        <IntermediateDiagram />
        <PipelineView preset="network" caseId="images" />
        <ProsCons pro="chaque source garde sa structure · représentation apprise pour y" con="demande beaucoup d’échantillons et du réglage" />
      </>
    ),
    notes: [
      'Le modèle conjoint, c’est ce que le deep learning appelle « intermediate fusion ». Les blocs restent séparés jusqu’au modèle, et c’est le modèle lui-même qui fait la fusion.',
      'Chaque source a une branche adaptée à sa nature : une convolution 1D glisse le long du spectre, une couche dense lit le tableau de marqueurs, une convolution 2D lit l’image. Chaque branche produit un petit vecteur ; on les concatène et une tête commune prédit y. Tout est entraîné d’un bloc : les branches apprennent ce qui est utile pour y. C’est la différence avec les scores ACP du niveau intermédiaire, qui sont calculés sans regarder y.',
      'Le labo entraîne vraiment un tel réseau dans le navigateur. Ce n’est ni PyTorch ni TensorFlow : c’est un petit réseau écrit en C++ dans Methods, compilé en WebAssembly avec le reste. Rétropropagation, optimiseur Adam, erreur quadratique, graine fixée : le résultat est reproductible. Il est volontairement minuscule, quelques milliers de paramètres, et tourne sur le processeur sans GPU.',
      'Le prix : beaucoup plus de paramètres qu’un PLS, donc plus d’échantillons nécessaires, et des choix d’entraînement — nombre d’epochs, taux d’apprentissage — qui comptent.',
    ],
  },
  {
    id: 'late', section: 'Concepts', title: 'Haut niveau : un modèle par source, puis on combine', minutes: 2,
    body: () => (
      <>
        <div className="deck-heading-tag"><LevelTag level="late" /></div>
        <LateDiagram />
        <PipelineView preset="late-stacking" />
        <ProsCons pro="modulaire · robuste à un instrument absent" con="aucune interaction entre les sources" />
      </>
    ),
    notes: [
      'La fusion de haut niveau construit un modèle complet par source, exactement comme pour un seul instrument, puis combine les prédictions.',
      'La combinaison la plus simple est la moyenne. Rien n’est appris : une source faible tire la moyenne vers ses erreurs.',
      'Le stacking apprend la combinaison : un petit méta-modèle, ici une régression Ridge, reçoit en entrée les prédictions des modèles par source et apprend la confiance à accorder à chacune.',
      'Cette fusion est modulaire et robuste ; c’est le choix naturel quand les instruments ne sont pas toujours disponibles. Sa limite : l’information n’est combinée qu’à la fin, donc les effets qui n’apparaissent qu’en regardant les sources ensemble sont perdus.',
    ],
  },
  {
    id: 'oof', section: 'Concepts', title: 'Le stacking demande des prédictions out-of-fold', minutes: 1.5,
    body: () => (
      <>
        <OofDiagram />
        <Callout tone="amber">nirs4all construit automatiquement les entrées du méta-modèle à partir de prédictions OOF, dans chaque périmètre d’entraînement. Vous choisissez seulement le méta-modèle.</Callout>
      </>
    ),
    notes: [
      'Un point technique, parce que c’est le piège classique du stacking.',
      'Si le méta-modèle apprend sur des prédictions faites sur les échantillons mêmes qui ont entraîné les modèles par source, ces prédictions sont trop bonnes. Le méta-modèle fait alors trop confiance à la source la plus flexible.',
      'Chaque échantillon doit donc être prédit par un modèle qui ne l’a pas vu : une validation croisée à l’intérieur du train, les prédictions out-of-fold. nirs4all le fait pour vous, imbriqué dans la validation externe. Vous n’avez pas à le coder, mais il faut savoir pourquoi le résultat du stacking est honnête.',
    ],
  },
  {
    id: 'summary', section: 'Concepts', title: 'Les quatre niveaux, deux vocabulaires', minutes: 1.5,
    body: () => (
      <table className="deck-table">
        <thead><tr><th>Chimiométrie</th><th>Machine learning</th><th>Ce qui est fusionné</th><th>Modèles du labo</th><th>Attention</th></tr></thead>
        <tbody>
          <tr><td><LevelTag level="early">Bas niveau</LevelTag></td><td>early fusion</td><td>les variables prétraitées</td><td>PLS sur la concaténation · MB-PLS</td><td>pondération des blocs, nombre de VL</td></tr>
          <tr><td><LevelTag level="mid">Niveau intermédiaire</LevelTag></td><td>feature-level · embeddings</td><td>des caractéristiques par source (scores ACP/PLS)</td><td>ACP par source → PLS</td><td>le résumé peut perdre le signal</td></tr>
          <tr><td><LevelTag level="joint">Modèle conjoint</LevelTag></td><td>intermediate fusion</td><td>des représentations apprises ensemble</td><td>réseau multibranche</td><td>données et réglage</td></tr>
          <tr><td><LevelTag level="late">Haut niveau</LevelTag></td><td>late fusion · decision-level</td><td>les prédictions</td><td>moyenne · stacking</td><td>pas d’interaction entre sources</td></tr>
        </tbody>
      </table>
    ),
    notes: [
      'Un résumé à garder, avec les deux vocabulaires, parce que vous lirez les deux. Les chimiométriciens parlent de bas, moyen et haut niveau ; la littérature machine learning parle d’early, intermediate et late fusion.',
      'Attention au faux ami : l’« intermediate fusion » du machine learning désigne en général un réseau qui apprend tout ensemble, pas les scores ACP par bloc du niveau intermédiaire chimiométrique. Et le MB-PLS reste du bas niveau, avec une structure de blocs.',
      'Aucun niveau n’est le meilleur en général. Ce sont les données qui décident, et la seule façon de le savoir est de comparer sous la même validation. C’est ce qu’on fait maintenant.',
    ],
  },
  {
    id: 'honest', section: 'Concepts', title: 'Comparer les fusions honnêtement', minutes: 1.5,
    body: () => (
      <div className="deck-split">
        <Steps items={[
          <><strong>Références</strong> : chaque source seule</>,
          <><strong>Mêmes folds</strong> pour toutes les recettes</>,
          <>Classer sur la <strong>validation croisée</strong> (OOF)</>,
          <><strong>Jeu de test</strong> : une seule fois, à la fin</>,
          <>Beaucoup d’essais = un peu de sur-apprentissage</>,
        ]} />
        <Callout>Une fusion ne vaut que si elle bat la <strong>meilleure source seule</strong>.</Callout>
      </div>
    ),
    notes: [
      'Avant les démonstrations, les règles du jeu.',
      'Un : les références source par source font partie de chaque comparaison. Deux : toutes les recettes utilisent exactement les mêmes folds ; vous verrez leur empreinte dans l’Inspector. Trois : on classe sur les prédictions out-of-fold de la validation croisée. Quatre : le jeu de test se regarde une fois, à la fin.',
      'Dernier point : quand je modifie un pipeline en direct et que je garde la meilleure variante, je fais aussi une sélection. Avec quelques essais sur 96 échantillons, c’est acceptable pour l’enseignement ; dans une vraie étude, on confirme sur de nouvelles données.',
    ],
  },
  {
    id: 'lab', section: 'Démonstration', title: 'Le labo multimodal', minutes: 1,
    body: () => (
      <div className="deck-split deck-split--wide">
        <Capture src="../captures/lab-editor.png" alt="L’éditeur de pipeline de fusion, avec les presets et une voie par source" />
        <div>
          <Steps items={[
            <>Choisir un cas</>,
            <>Choisir un <strong>preset</strong> de fusion, l’éditer</>,
            <>Lancer un ou tous les presets</>,
            <>Comparer dans l’<strong>Inspector</strong></>,
          ]} />
          <p className="deck-url"><a href={labLink('spectroscopy')}>web.nirs4all.org/nirs4all_multimodale</a></p>
        </div>
      </div>
    ),
    notes: [
      'On passe au navigateur. Parcourir la page de haut en bas rapidement : le cas, les données et les sources, le protocole de validation, l’éditeur de pipeline avec ses presets rangés par niveau de fusion, et l’Inspector des résultats.',
      'L’interface du labo est en anglais : « Run this pipeline » lance le pipeline affiché, « Run all presets » lance tous les presets du jeu de données.',
      'Les presets sont des pipelines nirs4all canoniques : la même structure qu’en Python avec source_branch ou une branche par source. L’exécution est native, en WebAssembly, dans un worker en arrière-plan.',
    ],
  },
  {
    id: 'demo-spectro', section: 'Démonstration', title: 'Démo 1 · Raman + NIRS + MIR', minutes: 5,
    body: () => (
      <div className="deck-split deck-split--demo">
        <div>
          <p className="deck-case">120 échantillons · Raman 48 · NIRS 64 · MIR 56 variables · 96 calibration / 24 test</p>
          <Steps items={[
            <><a href={labLink('spectroscopy')}>Ouvrir le cas</a>, suivre un échantillon</>,
            <><strong>« Run all presets »</strong> : qui gagne ?</>,
            <><LevelTag level="early">Early</LevelTag> composantes PLS <strong>3 → 6</strong></>,
            <>Supprimer la voie <em>MIR</em>, relancer</>,
          ]} />
        </div>
        <Capture src="../captures/spectroscopy-inspector.png" alt="L’Inspector classe les recettes du cas spectroscopie" />
      </div>
    ),
    notes: [
      'Trois spectroscopies mesurées sur les mêmes échantillons. Chaque technique a son axe et son bruit ; la cible dépend d’une chimie que chaque fenêtre voit en partie.',
      'Lancer tous les presets. Cela prend quelques secondes. Dans l’Inspector, trier par RMSE de validation croisée.',
      'Surprise : avec les réglages par défaut, le Raman seul vaut tout le reste, et la fusion early est moins bonne que le Raman seul. Demander à la salle pourquoi.',
      'Réponse : la fusion early a 168 variables et seulement 3 composantes PLS ; elle est sous-ajustée. Cliquer sur la cellule PLS et mettre 6 composantes ; relancer. La fusion early bat alors nettement le Raman seul.',
      'Puis sélectionner la voie MIR et la supprimer : deux sources, relancer. Montrer qu’enlever une source peut aider.',
      'Noter que le stacking a trouvé tout seul la bonne réponse : il a appris à faire confiance au Raman.',
    ],
  },
  {
    id: 'concl-spectro', section: 'Démonstration', title: 'Démo 1 · ce qu’on retient', minutes: 1.5,
    body: () => (
      <div className="deck-split deck-split--chart">
        <ResultsChart caseId="spectroscopy" highlight={['Raman seul', 'Late · stacking', 'Early · PLS 6', 'Early · PLS 6 · sans MIR']} />
        <div>
          <Points items={[
            <><strong>Pas automatique</strong> : early PLS‑3 {fmt(R.spec('Early · concaténation'))} contre Raman {fmt(R.ramanAlone())}</>,
            <><strong>Plus de VL</strong> : fusion PLS‑6 {fmt(edit('spectroscopy', 'Early · PLS 6').oofRmse)} (Raman PLS‑6 : {fmt(edit('spectroscopy', 'Raman seul · PLS 6').oofRmse)})</>,
            <><strong>La moyenne dilue</strong> ({fmt(R.spec('Late · moyenne'))}), le <strong>stacking</strong> mise sur le Raman ({fmt(R.spec('Late · stacking'))})</>,
          ]} />
          <Provenance caseId="spectroscopy" />
        </div>
      </div>
    ),
    notes: [
      'Toutes les barres sont des RMSE de validation croisée sur les mêmes 96 échantillons et les mêmes folds ; la ligne pointillée est la meilleure source seule. Les barres hachurées sont les modifications faites en direct.',
      'Trois messages. Un : concaténer ne suffit pas ; la capacité du modèle doit suivre le nombre de variables. Deux : la comparaison est loyale — le Raman seul ne s’améliore pas avec plus de composantes, le gain vient bien des autres sources. Trois : la moyenne donne aux sources faibles le même poids qu’à la forte ; le stacking apprend les poids.',
      'Retirer le MIR améliore encore le score, mais rappelez-vous la règle : chaque essai sur les mêmes folds est une sélection ; on confirme sur le jeu de test une seule fois, ou sur de nouveaux échantillons.',
      'Ces données sont des simulations pédagogiques : ces classements illustrent des mécanismes, pas des résultats généralisables.',
    ],
  },
  {
    id: 'demo-genetics', section: 'Démonstration', title: 'Démo 2 · NIRS + marqueurs génétiques', minutes: 4.5,
    body: () => (
      <div className="deck-split deck-split--demo">
        <div>
          <p className="deck-case">60 plantes × 2 mesures = 120 échantillons · NIRS 64 · 16 dosages de marqueurs (0/1/2) · groupes gardés entiers</p>
          <Steps items={[
            <><a href={labLink('genetics')}>Ouvrir le cas</a> : une plante, deux échantillons</>,
            <><strong>« Run all presets »</strong></>,
            <><LevelTag level="early">Early</LevelTag> et <em>NIRS seul</em> : PLS <strong>3 → 5</strong></>,
            <><LevelTag level="late">Moyenne</LevelTag> contre <LevelTag level="early">MB-PLS</LevelTag></>,
          ]} />
        </div>
        <Capture src="../captures/genetics-inspector.png" alt="L’Inspector classe les recettes du cas génétique" />
      </div>
    ),
    notes: [
      'Deuxième cas : deux modalités vraiment différentes, un spectre continu et un petit tableau de dosages génotypiques. Chaque plante a été mesurée deux fois : les deux lignes ont les mêmes marqueurs mais pas le même spectre. Elles forment un groupe, et les folds gardent les groupes entiers.',
      'Lancer tous les presets. Les marqueurs seuls prédisent mal, moins bien que la moyenne. Faut-il les jeter ? Regardez les fusions : early et MB-PLS font bien mieux que le NIRS seul. Les marqueurs apportent une information qui n’apparaît qu’avec le spectre.',
      'Puis la comparaison loyale : augmenter les composantes PLS pour la fusion early et pour le NIRS seul. L’écart reste.',
      'Enfin comparer la moyenne late et le MB-PLS : moyenner avec une source faible fait pire que le NIRS seul.',
    ],
  },
  {
    id: 'concl-genetics', section: 'Démonstration', title: 'Démo 2 · ce qu’on retient', minutes: 1.5,
    body: () => (
      <div className="deck-split deck-split--chart">
        <ResultsChart caseId="genetics" highlight={['NIRS seul', 'Early · MB-PLS', 'Early · PLS 5', 'NIRS seul · PLS 5', 'Late · moyenne']} />
        <div>
          <Points items={[
            <><strong>Faible seule ≠ inutile</strong> : marqueurs {fmt(R.gen('Marqueurs seuls'))}, mais fusion {fmt(edit('genetics', 'Early · PLS 5').oofRmse)} contre NIRS {fmt(edit('genetics', 'NIRS seul · PLS 5').oofRmse)}</>,
            <><strong>Le bas niveau gagne</strong> : MB-PLS {fmt(R.gen('Early · MB-PLS'))} ; moyenne {fmt(R.gen('Late · moyenne'))}</>,
            <><strong>Réseau</strong> {fmt(R.gen('Conjoint · réseau'))} : pas avec 96 échantillons</>,
          ]} />
          <Provenance caseId="genetics" />
        </div>
      </div>
    ),
    notes: [
      'Message principal : on juge une source sur ce qu’elle apporte, pas sur son score seule. Les marqueurs seuls sont inutiles comme prédicteur, mais combinés au spectre ils divisent l’erreur par deux.',
      'Les fusions de bas niveau voient les deux blocs en même temps ; la fusion late voit chaque bloc séparément, elle exploite moins bien la complémentarité, et la moyenne fait même moins bien que le NIRS seul.',
      'Le petit réseau est nettement derrière ici. Avec 96 échantillons et des réglages par défaut, il n’est pas compétitif : un modèle plus complexe n’est pas automatiquement meilleur.',
    ],
  },
  {
    id: 'demo-images', section: 'Démonstration', title: 'Démo 3 · NIRS + images', minutes: 3,
    body: () => (
      <div className="deck-split deck-split--demo">
        <div>
          <p className="deck-case">120 échantillons · NIRS 64 · une image 12 × 12 en niveaux de gris par échantillon · 96 calibration / 24 test</p>
          <Steps items={[
            <><a href={labLink('images', 'network')}>Ouvrir le cas</a> : spectre + image</>,
            <><LevelTag level="joint">Réseau</LevelTag> : branches 1D et 2D</>,
            <><strong>« Run all presets »</strong></>,
            <>En option : <strong>100 epochs</strong></>,
          ]} />
        </div>
        <Capture src="../captures/images-inspector.png" alt="L’Inspector classe les recettes du cas images" />
      </div>
    ),
    notes: [
      'Dernier cas : un spectre et une petite image par échantillon. La fusion early et le PLS traitent les 144 pixels comme 144 variables indépendantes ; le réseau garde la disposition 2D avec une convolution.',
      'Montrer le preset réseau dans l’éditeur : les mêmes voies par source, et c’est l’étape modèle qui fait la fusion. Lancer tous les presets.',
      'S’il reste du temps, passer à 100 epochs et relancer : le score bouge à peine. Ce n’est pas l’entraînement qui manque ici ; avec 96 petites images synthétiques, ce réseau compact ne bat pas les modèles linéaires.',
    ],
  },
  {
    id: 'concl-images', section: 'Démonstration', title: 'Démo 3 · ce qu’on retient', minutes: 1.5,
    body: () => (
      <div className="deck-split deck-split--chart">
        <ResultsChart caseId="images" highlight={['Image seule', 'Early · concaténation', 'Intermédiaire · scores ACP', 'Conjoint · réseau']} />
        <div>
          <Points items={[
            <><strong>L’image domine</strong> ({fmt(R.img('Image seule'))}), le spectre complète : early {fmt(R.img('Early · concaténation'))}</>,
            <><strong>Niveau intermédiaire</strong> {fmt(R.img('Intermédiaire · scores ACP'))} avec 10 colonnes au lieu de 208</>,
            <><strong>Réseau 2D</strong> {fmt(R.img('Conjoint · réseau'))} : bonne idée, trop peu d’échantillons</>,
          ]} />
          <Provenance caseId="images" />
        </div>
      </div>
    ),
    notes: [
      'Ici la fusion aide clairement : early comme niveau intermédiaire battent la meilleure source seule.',
      'Le niveau intermédiaire est intéressant : cinq scores par source font presque aussi bien que les 208 variables. C’est l’idée qu’on reprend avec des encodeurs pré-entraînés d’images ou de spectres sur de plus gros problèmes.',
      'Le réseau respecte la structure de l’image, ce qui est la bonne idée pour de vraies images, mais avec 96 petites images synthétiques il ne bat pas le PLS. Avec de vraies images et plus d’échantillons, l’équilibre peut changer.',
    ],
  },
  {
    id: 'take-home', section: 'Synthèse', title: 'Par quoi commencer sur vos données', minutes: 1,
    body: () => (
      <div className="deck-guide">
        <div><span className="deck-guide-key"><span className="deck-num">1</span>Références</span><p>chaque source seule</p></div>
        <div><span className="deck-guide-key"><LevelTag level="early" /></span><p>pondérer les blocs, laisser croître les VL · MB-PLS</p></div>
        <div><span className="deck-guide-key"><LevelTag level="mid" /></span><p>blocs très déséquilibrés : scores par source</p></div>
        <div><span className="deck-guide-key"><LevelTag level="late" /></span><p>instruments pas toujours disponibles : stacking</p></div>
        <div><span className="deck-guide-key"><LevelTag level="joint" /></span><p>beaucoup d’échantillons, vraies images</p></div>
        <div><span className="deck-guide-key"><span className="deck-num">✓</span>Protocole</span><p>mêmes folds · OOF · test une fois</p></div>
      </div>
    ),
    notes: [
      'À retenir : commencer par les sources seules, puis une fusion de bas niveau bien faite. Passer au niveau intermédiaire quand les blocs sont déséquilibrés, au haut niveau quand les instruments ne sont pas toujours là. Le modèle conjoint quand on a beaucoup d’échantillons ou de vraies images.',
      'Et toujours le même protocole. Merci ; place aux questions — le labo reste ouvert à l’écran.',
    ],
  },
  {
    id: 'resources', section: 'Synthèse', title: 'Questions · ressources', minutes: 0,
    body: () => (
      <div className="deck-split">
        <div>
          <h3>Le labo</h3>
          <p className="deck-url"><a href={LAB}>web.nirs4all.org/nirs4all_multimodale</a></p>
          <p>Importez vos propres fichiers CSV / VCF / PNG avec le Dataset Builder ; exportez n’importe quel pipeline en JSON.</p>
          <h3>Les mêmes pipelines en Python</h3>
          <pre className="deck-code">{`pipeline = [
  {"source_branch": {"NIR": [SNV()], "markers": [StandardScaler()]}},
  {"merge_sources": "concat"},
  PLSRegression(n_components=5),
]`}</pre>
        </div>
        <div>
          <h3>Fusion late (stacking)</h3>
          <pre className="deck-code">{`pipeline = [
  {"branch": {"by_source": True, "steps": {
      "NIR": [SNV(), PLSRegression(5)],
      "markers": [StandardScaler(), PLSRegression(3)]}}},
  {"merge": "predictions"},
  Ridge(alpha=1.0),
]`}</pre>
          <p>Documentation : <a href="https://nirs4all.readthedocs.io">nirs4all.readthedocs.io</a> · guide utilisateur › multi-source pipelines</p>
        </div>
      </div>
    ),
    notes: [
      'Cette slide reste affichée pendant les questions. Les mêmes structures existent dans la bibliothèque Python : source_branch et merge_sources pour la fusion de bas niveau, une branche par source et une fusion des prédictions pour le haut niveau.',
    ],
  },
]
