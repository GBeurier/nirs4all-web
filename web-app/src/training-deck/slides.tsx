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

/** A stacking variant: what the meta-model sees and its nirs4all merge step. */
function Variant({ tag, what, code, alt }: { tag: string; what: string; code: string; alt?: string }) {
  return (
    <div className="deck-variant">
      <h3>{tag}</h3>
      <p>{what}</p>
      <pre><code>{code}</code></pre>
      {alt ? <p className="deck-variant__alt">ou <code>{alt}</code></p> : null}
    </div>
  )
}

/** A method card: name, origin, one-line idea and its pros / cons. */
function Method({ name, origin, idea, pros = [], cons = [] }: { name: string; origin?: string; idea?: string; pros?: string[]; cons?: string[] }) {
  return (
    <div className="deck-method">
      <h3>{name}{origin ? <small>{origin}</small> : null}</h3>
      {idea ? <p className="deck-method__idea">{idea}</p> : null}
      <ul>
        {pros.map(item => <li key={item} className="deck-method__pro">{item}</li>)}
        {cons.map(item => <li key={item} className="deck-method__con">{item}</li>)}
      </ul>
    </div>
  )
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
  ts: (name: string) => preset('timeseries', name),
}

export const SLIDES: Slide[] = [
  {
    id: 'title', section: '', title: 'Données multimodales dans nirs4all', minutes: 0.5,
    body: () => (
      <div className="deck-title">
        <p className="deck-kicker">formation nirs4all · session multimodale</p>
        <h1>Un échantillon, plusieurs mesures,<br /><span className="n4-gradient-text">une prédiction défendable</span></h1>
        <p className="deck-lead">Les données multimodales · early, mid et late fusion · trois démonstrations</p>
        <div className="deck-title-levels">
          <LevelTag level="early" /><LevelTag level="mid" /><LevelTag level="late" />
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
    id: 'why', section: 'Concepts', title: 'Pourquoi combiner des mesures ?', minutes: 1,
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
          <div><h3>Multimodal</h3><p>natures différentes : spectres, marqueurs, images, séries temporelles</p></div>
        </div>
      </>
    ),
    notes: [
      'D’abord le vocabulaire, parce qu’il est simple. Un jeu de données, ce sont toujours des échantillons en lignes. La différence, c’est que les colonnes arrivent par blocs : un bloc par source.',
      'Si tous les blocs sont des spectres, on parle de multisource ou de multibloc, un terme que vous connaissez en chimiométrie. Si les blocs sont de nature différente — un spectre, un tableau de dosages de marqueurs, une image — on parle de multimodal.',
      'nirs4all garde chaque bloc avec son axe et son unité : longueurs d’onde en nm pour le NIRS, déplacement Raman en cm⁻¹, pas d’axe pour les marqueurs, hauteur × largeur pour les images, temps × variables pour une série temporelle. Rien n’est fusionné en douce au chargement.',
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
    id: 'series', section: 'Concepts', title: 'Séries temporelles : une série, une source', minutes: 1.5,
    body: () => (
      <div className="deck-split">
        <Points items={[
          <><strong>Une source</strong> = une série multivariée par échantillon : temps × variables (T<sub>max</sub>, T<sub>min</sub>, pluie, rayonnement), pas une source par variable</>,
          <><strong>Un axe déclaré</strong> : jours avant récolte, même grille pour tous ; rien n’est rééchantillonné ni interpolé en douce</>,
          <><strong>Souvent un contexte</strong> partagé : même météo pour toute une récolte, fenêtres qui se chevauchent dans une saison → folds <strong>groupés</strong> (ici région × saison)</>,
        ]} />
        <Capture src="../captures/timeseries-explore.png" alt="La source météo dans le labo : une série de quatre variables par fruit" />
      </div>
    ),
    notes: [
      'Les séries temporelles sont une autre nature de données : météo avant récolte, capteurs d’un procédé, suivi de maturation. nirs4all les traite comme une source à part entière.',
      'Point important : une série, c’est un tableau temps × variables pour chaque échantillon. La météo entière est une seule source avec ses quatre variables, pas quatre sources indépendantes. La série garde son axe de temps déclaré, avec son unité, comme un spectre garde ses longueurs d’onde.',
      'Souvent, la série est un contexte partagé : tous les fruits d’une même récolte ont la même météo, et deux récoltes à quelques jours d’écart partagent presque toute leur fenêtre de 90 jours. La série ne peut expliquer que les différences entre récoltes. Il faut donc grouper les folds par saison et par région, sinon le modèle reconnaît la saison et les scores sont optimistes. On le verra en démonstration.',
      'Pour la fusion, les mêmes quatre niveaux s’appliquent : aplatir temps × variables en early, résumer la série (ACP, encodeur) en mid, un modèle par source en late.',
    ],
  },
  {
    id: 'fusion-points', section: 'Concepts', title: 'Quatre endroits où les sources se rejoignent', minutes: 2,
    body: () => (
      <>
        <FusionPointsDiagram />
        <div className="deck-columns deck-columns--4">
          <div><LevelTag level="early" /><p>les <strong>variables</strong></p></div>
          <div><LevelTag level="mid">Mid · scores</LevelTag><p>des <strong>caractéristiques</strong> extraites par source</p></div>
          <div><LevelTag level="mid">Mid · réseau</LevelTag><p>des caractéristiques <strong>apprises</strong>, concaténées au milieu</p></div>
          <div><LevelTag level="late" /><p>les <strong>prédictions</strong></p></div>
        </div>
      </>
    ),
    notes: [
      'Voici la carte pour la suite. Suivez chaque source de gauche à droite : données brutes, prétraitement, un résumé, un modèle, une prédiction.',
      'La seule question est : à quel endroit les sources se rejoignent-elles ?',
      'Early fusion, ou bas niveau : on met les variables prétraitées côte à côte. Late fusion, ou haut niveau : chaque source a son modèle et on combine les prédictions.',
      'Entre les deux, la mid fusion : on fusionne des caractéristiques. Deux façons de les obtenir. Soit on les extrait à part pour chaque source, par exemple des scores ACP ou PLS : c’est le « mid-level » des chimiométriciens. Soit un réseau les apprend, une branche par source, et on les concatène au milieu du réseau : c’est la mid fusion, ou intermediate fusion, du deep learning.',
      'Les couleurs que vous voyez ici sont utilisées partout ensuite : slides, presets du labo et graphiques de résultats.',
    ],
  },
  {
    id: 'early', section: 'Concepts', title: 'Early fusion : les variables côte à côte', minutes: 2,
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
    id: 'mid', section: 'Concepts', title: 'Mid fusion ① : résumer chaque source', minutes: 2,
    body: () => (
      <>
        <div className="deck-heading-tag"><LevelTag level="mid" /></div>
        <EmbeddingDiagram />
        <PipelineView preset="mid-pca" />
        <ProsCons pro="même poids par source · peu de colonnes · moins de bruit" con="l’ACP ignore y : elle peut perdre le signal utile" />
      </>
    ),
    notes: [
      'Première forme de mid fusion : on ne fusionne plus les variables mais des caractéristiques extraites à part pour chaque source. Le cas le plus classique en chimiométrie, le « mid-level » : les scores d’une ACP ou d’un PLS par bloc. On peut aussi y mettre des variables sélectionnées, ou des descripteurs calculés.',
      'Ici, chaque source est résumée par cinq scores ACP, et seuls ces scores sont concaténés avant le modèle. Chaque source pèse alors le même nombre de colonnes, quel que soit son nombre de longueurs d’onde ou de pixels.',
      'En deep learning, on fait la même chose avec des encodeurs pré-entraînés : un réseau d’images ou un modèle de langage transforme une image ou un texte en vecteur — un « embedding » — et ce sont ces vecteurs qu’on fusionne. Le principe est le même.',
      'L’ACP est ajustée dans chaque fold d’entraînement, jamais sur les échantillons de validation. Sa limite : elle garde les directions de plus grande variance, qui ne sont pas forcément celles liées à y, et elle est calculée sans regarder les autres sources. La deuxième forme corrige les deux.',
    ],
  },
  {
    id: 'mid-cnn', section: 'Concepts', title: 'Mid fusion ② : concaténer au milieu d’un CNN', minutes: 2,
    body: () => (
      <>
        <div className="deck-heading-tag"><LevelTag level="mid" /></div>
        <IntermediateDiagram />
        <PipelineView preset="cnn" caseId="images" />
        <ProsCons pro="chaque source garde sa structure · caractéristiques apprises pour y" con="demande des échantillons et du réglage" />
      </>
    ),
    notes: [
      'Deuxième forme de mid fusion, celle du deep learning. Les blocs restent séparés jusque dans le réseau, et la fusion se fait au milieu, par concaténation.',
      'Chaque source a une branche adaptée à sa nature : une convolution 1D glisse le long du spectre, une couche dense lit le tableau de marqueurs, une convolution 2D lit l’image. Chaque branche produit un petit vecteur, un embedding ; on concatène ces vecteurs au milieu du réseau et une tête commune prédit y. Tout est entraîné d’un bloc : les branches apprennent ce qui est utile pour y, en tenant compte des autres sources. C’est la différence avec les scores ACP, calculés à part et sans regarder y.',
      'Le labo entraîne vraiment ce CNN dans le navigateur. Ce n’est ni PyTorch ni TensorFlow : c’est un petit réseau écrit en C++ dans Methods, compilé en WebAssembly avec le reste. Rétropropagation, optimiseur Adam, erreur quadratique, graine fixée : le résultat est reproductible. Il reste petit — 8 filtres par branche, des embeddings de 16, 150 epochs — et tourne sur le processeur, sans GPU, en quelques secondes.',
      'Le prix : beaucoup plus de paramètres qu’un PLS, donc plus d’échantillons nécessaires, et des choix d’entraînement — taille, nombre d’epochs, taux d’apprentissage — qui comptent.',
    ],
  },
  {
    id: 'ml-names', section: 'Concepts', title: 'Mid fusion : comment le ML l’appelle', minutes: 1,
    body: () => (
      <>
        <table className="deck-table deck-table--terms">
          <thead><tr><th>Terme</th><th>Où on le lit</th><th>Ce que ça désigne</th></tr></thead>
          <tbody>
            <tr><td><strong>intermediate fusion</strong></td><td>revues de deep learning multimodal</td><td>fusion des représentations intermédiaires d’un réseau</td></tr>
            <tr><td><strong>mid fusion</strong> · middle fusion</td><td>vision, audio-vidéo, capteurs</td><td>concaténation au milieu du réseau, entre les branches et la tête</td></tr>
            <tr><td><strong>joint fusion</strong></td><td>imagerie médicale (Huang et al., 2020)</td><td>idem, avec la perte rétropropagée jusqu’aux branches : entraînement de bout en bout</td></tr>
            <tr><td><strong>feature-level fusion</strong></td><td>ML classique · chimiométrie « mid-level » (Borràs et al., 2015)</td><td>fusion de caractéristiques extraites à part (ACP, PLS, sélection)</td></tr>
            <tr><td><strong>embedding fusion</strong></td><td>modèles de fondation</td><td>fusion des vecteurs d’encodeurs pré-entraînés, souvent gelés</td></tr>
          </tbody>
        </table>
        <Callout>Même idée : on fusionne des <strong>caractéristiques</strong>. La vraie différence : <strong>extraites à part</strong> (ACP, encodeur gelé) ou <strong>apprises ensemble</strong> pour y (CNN entraîné de bout en bout).</Callout>
      </>
    ),
    notes: [
      'Le vocabulaire n’est pas stabilisé, et vous lirez tous ces termes pour la même famille d’idées.',
      'En deep learning, « intermediate fusion » et « mid fusion » désignent la concaténation au milieu d’un réseau, entre les branches par modalité et la tête de prédiction. En imagerie médicale, la revue de Huang et collègues (npj Digital Medicine, 2020) parle de « joint fusion » quand la perte est rétropropagée jusqu’aux branches, autrement dit quand tout est appris de bout en bout.',
      '« Feature-level fusion » est plus large : n’importe quelle fusion de caractéristiques, y compris des scores ACP ou PLS calculés à part. C’est le « mid-level » des chimiométriciens, par exemple dans la revue de Borràs et collègues (Analytica Chimica Acta, 2015). « Embedding fusion » s’emploie surtout quand les caractéristiques viennent d’encodeurs pré-entraînés et gelés.',
      'Le critère qui compte en pratique : les caractéristiques sont-elles extraites à part, sans regarder y ni les autres sources, ou apprises ensemble pour y ? La deuxième option est plus puissante, mais demande des données.',
    ],
  },
  {
    id: 'late', section: 'Concepts', title: 'Late fusion : un modèle par source, puis on combine', minutes: 2,
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
    id: 'oof', section: 'Concepts', title: 'Le stacking demande des prédictions out-of-fold', minutes: 1,
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
    id: 'stacking-plus', section: 'Concepts', title: 'Stacking enrichi : prédictions + données, ou résidus', minutes: 1.5,
    body: () => (
      <>
        <div className="deck-variants">
          <Variant tag="Stacking" what="le méta-modèle apprend sur les ŷ OOF des sources"
            code={'{"merge": "predictions"},\n{"model": Ridge(alpha=1.0)}'} />
          <Variant tag="+ données" what="ŷ OOF + variables d’avant le branchement (ou des branches)"
            code={'{"merge": {"predictions": "all",\n           "include_original": true}},\n{"model": Ridge(alpha=1.0)}'}
            alt={'{"merge": {"predictions": "all", "features": "all"}}'} />
          <Variant tag="Résidus" what="un 2ᵉ modèle apprend y − ŷ (OOF) : ŷ = ŷ_base + λ · correction"
            code={'{"residual": ResidualModel(\n    base=PLSRegression(n_components=10),\n    learner=RandomForestRegressor(),\n    lam=0.5)}'} />
        </div>
        <Callout tone="amber">Plus de colonnes = plus de capacité : à valider sous les <strong>mêmes folds</strong>, contre le stacking simple. Syntaxe du SDK nirs4all (Python) ; le labo du navigateur montre le stacking simple.</Callout>
      </>
    ),
    notes: [
      'Le stacking ne se limite pas aux prédictions. On peut redonner au méta-modèle des informations en plus.',
      'Première option : les prédictions out-of-fold plus les variables d’origine. Dans nirs4all, c’est le merge avec predictions: all et include_original: true ; le méta-modèle voit les ŷ de chaque source et les données d’avant le branchement. Avec features: all, ce sont les caractéristiques produites dans les branches.',
      'Deuxième option : les résidus. Un premier modèle, par exemple une PLS, explique l’essentiel ; un second modèle apprend ce qu’il reste, y moins ŷ, calculé en out-of-fold. La prédiction finale est la base plus lambda fois la correction ; lambda égal à zéro redonne la base.',
      'Attention : chaque ajout donne plus de capacité au méta-modèle. Il faut le comparer au stacking simple sous les mêmes folds, et ne regarder le test qu’à la fin.',
    ],
  },
  {
    id: 'summary', section: 'Concepts', title: 'Récapitulatif, deux vocabulaires', minutes: 0.5,
    body: () => (
      <table className="deck-table">
        <thead><tr><th>Chimiométrie</th><th>Machine learning</th><th>Ce qui est fusionné</th><th>Modèles du labo</th><th>Attention</th></tr></thead>
        <tbody>
          <tr><td>bas niveau</td><td><LevelTag level="early">early fusion</LevelTag></td><td>les variables prétraitées</td><td>PLS sur la concaténation · MB-PLS</td><td>pondération des blocs, nombre de VL</td></tr>
          <tr><td>niveau intermédiaire</td><td><LevelTag level="mid">feature-level</LevelTag></td><td>des caractéristiques extraites à part (scores ACP/PLS)</td><td>ACP par source → PLS</td><td>le résumé peut perdre le signal</td></tr>
          <tr><td>—</td><td><LevelTag level="mid">mid · intermediate · joint</LevelTag></td><td>des caractéristiques apprises, concaténées dans le réseau</td><td>CNN multibranche</td><td>données et réglage</td></tr>
          <tr><td>haut niveau</td><td><LevelTag level="late">late fusion</LevelTag></td><td>les prédictions</td><td>moyenne · stacking</td><td>pas d’interaction entre sources</td></tr>
        </tbody>
      </table>
    ),
    notes: [
      'Un résumé à garder, avec les deux vocabulaires, parce que vous lirez les deux. Les chimiométriciens parlent de bas, moyen et haut niveau ; la littérature machine learning parle d’early, intermediate et late fusion.',
      'Les deux formes de mid fusion fusionnent des caractéristiques ; la chimiométrie classique n’a que la première. Et le MB-PLS reste du bas niveau, avec une structure de blocs.',
      'Aucun niveau n’est le meilleur en général. Ce sont les données qui décident, et la seule façon de le savoir est de comparer sous la même validation. C’est ce qu’on fait maintenant.',
    ],
  },
  {
    id: 'multiblock', section: 'Concepts', title: 'Le multibloc chimiométrique', minutes: 1.5,
    body: () => (
      <>
        <div className="deck-methods">
          <Method name="MB-PLS" origin="Westerhuis 1998" idea="un super-score commun, un poids par bloc"
            pros={['lecture par bloc (poids, scores)', 'standard, rapide']} cons={['linéaire', 'sensible à la pondération des blocs']} />
          <Method name="SO-PLS" origin="Næs 2011" idea="les blocs entrent l’un après l’autre, orthogonalisés"
            pros={['ce que chaque bloc ajoute', 'invariant à l’échelle des blocs']} cons={['l’ordre des blocs compte', 'composantes par bloc à régler']} />
          <Method name="ROSA" origin="Liland 2016" idea="à chaque composante, le bloc le plus utile gagne"
            pros={['sélection de blocs', 'rapide']} cons={['un seul bloc par composante']} />
          <Method name="ComDim · O2PLS" origin="Qannari · Trygg" idea="parts communes et spécifiques des blocs"
            pros={['exploration, saliences par bloc']} cons={['souvent non supervisé (ComDim)']} />
        </div>
        <Callout>Tous restent du <strong>bas niveau</strong> (ou intermédiaire) <strong>linéaire</strong>. Dans nirs4all-methods : MB-PLS, SO-PLS, ROSA, O2PLS, ON-PLS ; le labo expose MB-PLS.</Callout>
      </>
    ),
    notes: [
      'Beaucoup d’entre vous connaissent déjà le multibloc : c’est la réponse chimiométrique à la fusion. Je situe les grandes familles.',
      'MB-PLS : un super-score commun et un poids par bloc. Westerhuis a montré que c’est équivalent à une PLS sur la concaténation pondérée : c’est donc du bas niveau, avec une lecture par bloc. Son point faible : le résultat dépend de la pondération des blocs.',
      'SO-PLS : les blocs entrent l’un après l’autre, chacun orthogonalisé par rapport aux précédents. On lit directement ce qu’un bloc ajoute aux autres, et c’est invariant à l’échelle relative des blocs. Mais l’ordre compte, et il faut choisir un nombre de composantes par bloc.',
      'ROSA : à chaque composante, le bloc qui explique le mieux y gagne. C’est rapide et ça fait de la sélection de blocs. ComDim et O2PLS séparent ce qui est commun et ce qui est spécifique à chaque bloc ; ComDim est surtout exploratoire.',
      'Point commun : ce sont des méthodes linéaires, de bas niveau ou intermédiaire. Plusieurs sont déjà dans nirs4all-methods ; dans ce labo, j’expose MB-PLS.',
    ],
  },
  {
    id: 'kernels', section: 'Concepts', title: 'Les approches à noyaux', minutes: 1.5,
    body: () => (
      <>
        <div className="deck-kernel">
          <div className="deck-kernel__flow">
            <span className="deck-kernel__src">NIRS</span><span className="deck-kernel__arrow">→</span><span className="deck-kernel__k">K₁ (n × n)</span>
            <span className="deck-kernel__src">Marqueurs</span><span className="deck-kernel__arrow">→</span><span className="deck-kernel__k">K₂ = GRM</span>
            <span className="deck-kernel__src">Images</span><span className="deck-kernel__arrow">→</span><span className="deck-kernel__k">K₃</span>
          </div>
          <div className="deck-kernel__sum">K = w₁K₁ + w₂K₂ + w₃K₃<small>MKL : les poids w sont appris</small></div>
          <div className="deck-kernel__model">KRR · SVR · kernel PLS · GP</div>
        </div>
        <div className="deck-methods deck-methods--two">
          <Method name="Pour" pros={['non linéaire, peu de paramètres', 'tout type de source (un noyau adapté)', 'p ≫ n sans problème', 'poids par source lisibles (MKL)']} />
          <Method name="Contre" cons={['mémoire et temps en n² à n³', 'choix du noyau et de sa largeur', 'le modèle garde les échantillons d’entraînement', 'plus de lecture par variable']} />
        </div>
      </>
    ),
    notes: [
      'D’autres parmi vous viennent des noyaux. L’idée : chaque source devient une matrice de similarité entre échantillons, n par n. On combine ces matrices, puis un modèle à noyau apprend : kernel ridge, SVR, kernel PLS ou processus gaussien.',
      'Pont utile avec la génétique : le GBLUP de la sélection génomique, c’est un noyau linéaire sur les marqueurs, la matrice de parenté génomique. Le multiple kernel learning apprend en plus le poids de chaque noyau, donc de chaque source.',
      'Les avantages : non linéaire avec peu de paramètres, n’importe quelle source dès qu’on a une similarité adaptée, et aucun problème quand il y a beaucoup plus de variables que d’échantillons.',
      'Les limites : le coût grandit avec le nombre d’échantillons au carré ou au cube ; il faut choisir le noyau et sa largeur, c’est un hyperparamètre à valider ; le modèle garde les échantillons d’entraînement, ce qui compte pour le partage et la confidentialité ; et on perd la lecture variable par variable.',
      'Où on se situe : la combinaison de noyaux est une fusion intermédiaire, sur l’espace des similarités. Dans nirs4all-methods il y a une kernel PLS et une GPR-PLS ; elles ne sont pas encore dans ce labo.',
    ],
  },
  {
    id: 'compare-families', section: 'Concepts', title: 'Quelle famille pour quel besoin ?', minutes: 1,
    body: () => (
      <>
        <table className="deck-table deck-table--compare">
          <thead><tr><th>Famille</th><th>Niveau</th><th>Non linéaire</th><th>Peu d’échantillons</th><th>Interprétation</th><th>À essayer quand…</th></tr></thead>
          <tbody>
            <tr><td>Concaténation + PLS</td><td><LevelTag level="early">bas</LevelTag></td><td>✗</td><td>✓</td><td>✓ variables</td><td>toujours, comme référence</td></tr>
            <tr><td>Multibloc (MB/SO-PLS)</td><td><LevelTag level="early">bas · interm.</LevelTag></td><td>✗</td><td>✓</td><td>✓ blocs</td><td>on veut le rôle de chaque bloc</td></tr>
            <tr><td>Noyaux (MKL)</td><td><LevelTag level="mid">intermédiaire</LevelTag></td><td>✓</td><td>✓</td><td>~ poids des sources</td><td>non-linéarité, n modéré</td></tr>
            <tr><td>Réseaux (CNN)</td><td><LevelTag level="mid">mid · joint</LevelTag></td><td>✓</td><td>✗</td><td>✗</td><td>beaucoup d’échantillons, images</td></tr>
            <tr><td>Moyenne · stacking</td><td><LevelTag level="late">haut</LevelTag></td><td>selon les modèles</td><td>✓</td><td>✓ poids des sources</td><td>sources très différentes, robustesse</td></tr>
          </tbody>
        </table>
        <Callout>Ce que nirs4all apporte : <strong>toutes ces familles sous le même protocole</strong>. Mêmes folds, prédictions OOF, test jamais vu, prétraitement par source appris dans le fold, sweeps de paramètres et comparaison côte à côte. Les recettes sont les mêmes en Python, en R et dans le navigateur.</Callout>
      </>
    ),
    notes: [
      'Pour résumer les familles. La concaténation avec une PLS est toujours la référence à battre, avec les sources seules. Le multibloc ajoute la lecture par bloc. Les noyaux apportent la non-linéarité avec peu de paramètres. Les réseaux demandent des données mais savent lire des images. Le late fusion est robuste quand les sources sont très différentes.',
      'Ce que nirs4all apporte, ce n’est pas une méthode de plus : c’est de les mettre toutes sous le même protocole. Les mêmes folds pour tout le monde, des prédictions out-of-fold pour le stacking, un test qu’on ne regarde qu’à la fin, un prétraitement par source appris uniquement sur les échantillons d’entraînement, des sweeps de paramètres, et une comparaison côte à côte dans l’Inspector.',
      'Et la recette est un fichier JSON : la même, exécutable en Python, en R ou dans le navigateur, avec les modèles natifs. C’est ce qui rend la comparaison honnête et reproductible.',
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
    id: 'lab', section: 'Démonstration', title: 'Le labo multimodal', minutes: 0.5,
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
    id: 'demo-spectro', section: 'Démonstration', title: 'Démo 1 · Raman + NIRS + MIR', minutes: 3.5,
    body: () => (
      <div className="deck-split deck-split--demo">
        <div>
          <p className="deck-case">120 échantillons · Raman 48 · NIRS 64 · MIR 56 variables · 96 calibration / 24 test</p>
          <Steps items={[
            <><a href={labLink('spectroscopy')}>Ouvrir le cas</a>, suivre un échantillon</>,
            <><strong>« Run all presets »</strong> : qui gagne ?</>,
            <><LevelTag level="early">Early</LevelTag> sweep des composantes PLS <strong>5 · 10 · 15</strong> (vue <em>Tuning</em>)</>,
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
      'Réponse : avec 168 variables, 3 composantes PLS sous-ajustent la fusion early. Les presets PLS font maintenant un sweep des composantes (5, 10, 15) : chaque valeur est un run complet. Dans l’Inspector, la vue Tuning trace le score en fonction du nombre de composantes ; avec plus de composantes, la fusion early bat nettement le Raman seul. Le graphique de conclusion montre la même chose avec l’édition 3 → 6 enregistrée.',
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
    id: 'demo-genetics', section: 'Démonstration', title: 'Démo 2 · NIRS + marqueurs génétiques', minutes: 3,
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
      'Puis la comparaison loyale : le sweep a déjà essayé 5, 10 et 15 composantes pour la fusion early comme pour le NIRS seul. À capacité égale, l’écart reste.',
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
            <><strong>CNN</strong> {fmt(R.gen('Mid · CNN'))} : bat le NIRS seul, pas le bas niveau</>,
          ]} />
          <Provenance caseId="genetics" />
        </div>
      </div>
    ),
    notes: [
      'Message principal : on juge une source sur ce qu’elle apporte, pas sur son score seule. Les marqueurs seuls sont inutiles comme prédicteur, mais combinés au spectre ils divisent l’erreur par deux.',
      'Les fusions de bas niveau voient les deux blocs en même temps ; la fusion late voit chaque bloc séparément, elle exploite moins bien la complémentarité, et la moyenne fait même moins bien que le NIRS seul.',
      'Le CNN fait mieux que le NIRS seul et que la fusion late, mais reste derrière la fusion de bas niveau : avec 96 échantillons, un modèle plus complexe n’est pas automatiquement meilleur.',
    ],
  },
  {
    id: 'demo-images', section: 'Démonstration', title: 'Démo 3 · NIRS + images', minutes: 3,
    body: () => (
      <div className="deck-split deck-split--demo">
        <div>
          <p className="deck-case">120 échantillons · NIRS 64 · une image 12 × 12 en niveaux de gris par échantillon · 96 calibration / 24 test</p>
          <Steps items={[
            <><a href={labLink('images', 'cnn')}>Ouvrir le cas</a> : spectre + image</>,
            <><LevelTag level="mid">Mid · CNN</LevelTag> : branches 1D et 2D, concaténées au milieu</>,
            <><strong>« Run all presets »</strong></>,
            <>CNN minuscule : <strong>4 filtres, 24 epochs</strong>, relancer</>,
          ]} />
        </div>
        <Capture src="../captures/images-inspector.png" alt="L’Inspector classe les recettes du cas images" />
      </div>
    ),
    notes: [
      'Dernier cas : un spectre et une petite image par échantillon. La fusion early et le PLS traitent les 144 pixels comme 144 variables indépendantes ; le CNN garde la disposition 2D avec une convolution, et fusionne au milieu du réseau.',
      'Montrer le preset Mid · CNN dans l’éditeur : les mêmes voies par source, et c’est l’étape modèle qui contient les branches et la concaténation. Lancer tous les presets.',
      'Puis réduire le CNN — 4 filtres, embeddings de 6, 24 epochs, taux d’apprentissage 0,003 — et relancer : il perd beaucoup. La taille du réseau et l’entraînement comptent autant que l’architecture.',
      'Honnêteté : les réglages du CNN ont été choisis après quelques essais sur ces mêmes données, son score est donc un peu optimiste.',
    ],
  },
  {
    id: 'concl-images', section: 'Démonstration', title: 'Démo 3 · ce qu’on retient', minutes: 1.5,
    body: () => (
      <div className="deck-split deck-split--chart">
        <ResultsChart caseId="images" highlight={['Image seule', 'Early · concaténation', 'Mid · CNN', 'CNN minuscule']} />
        <div>
          <Points items={[
            <><strong>L’image domine</strong> ({fmt(R.img('Image seule'))}), le spectre complète : early {fmt(R.img('Early · concaténation'))}</>,
            <><strong>Mid · CNN</strong> {fmt(R.img('Mid · CNN'))} : bat l’image seule ; minuscule : {fmt(edit('images', 'CNN minuscule').oofRmse)}</>,
            <><strong>Mid · scores ACP</strong> {fmt(R.img('Mid · scores ACP'))} avec 10 colonnes au lieu de 208</>,
          ]} />
          <Provenance caseId="images" />
        </div>
      </div>
    ),
    notes: [
      'Ici la fusion aide clairement : early comme mid fusion battent la meilleure source seule.',
      'Le CNN, avec sa fusion au milieu, bat l’image seule et se rapproche du PLS ; le CNN minuscule est loin derrière. Avec de vraies images et plus d’échantillons, l’avantage de la convolution peut grandir.',
      'Les scores ACP sont aussi intéressants : cinq scores par source font presque aussi bien que les 208 variables. C’est l’idée qu’on reprend avec des encodeurs pré-entraînés d’images ou de spectres sur de plus gros problèmes.',
    ],
  },
  {
    id: 'demo-timeseries', section: 'Démonstration', title: 'Démo 4 · NIR + météo (mangue)', minutes: 2.5,
    body: () => (
      <div className="deck-split deck-split--demo">
        <div>
          <p className="deck-case">565 mangues réelles · spectre Vis-SWNIR 245 points · météo 90 jours × 4 variables · saisons 1–3 calibration (430) / saison 4 test (135) · folds groupés région × saison</p>
          <Steps items={[
            <><a href={labLink('timeseries')}>Ouvrir le cas</a> : un spectre et une série météo par fruit</>,
            <>Explorer : la météo est <strong>une</strong> source, 4 courbes</>,
            <><strong>« Run all presets »</strong> (≈ 1 min 40)</>,
            <>Comparer <LevelTag level="single">NIR seul</LevelTag> et les fusions</>,
          ]} />
        </div>
        <Capture src="../captures/timeseries-inspector.png" alt="L’Inspector classe les recettes du cas mangue et météo" />
      </div>
    ),
    notes: [
      'Données réelles et publiques : des mangues australiennes, un spectre Vis-SWNIR par fruit (Anderson et al., CC BY 4.0), et la météo journalière des 90 jours avant la récolte (Open-Meteo, réanalyse ERA5). La cible est la matière sèche.',
      'Limite à dire tout de suite : la source ne publie que la région et la date de récolte, pas l’emplacement des vergers. La météo vient d’un point représentatif par région, et elle est la même pour tous les fruits d’une récolte.',
      'Montrer la vue Explore : la météo est une seule source, avec quatre courbes : températures maximale et minimale, pluie, rayonnement. Le fruit sélectionné en rouge, l’enveloppe de tous les fruits derrière.',
      'La validation suit les auteurs : saisons 1 à 3 en calibration, saison 4 en test. Les folds sont groupés par région et par saison, parce que les récoltes d’une même saison partagent presque toute leur météo. Lancer tous les presets, environ une minute quarante. Les scores ne sont pas comparables à ceux des publications, qui utilisent leurs propres découpages.',
    ],
  },
  {
    id: 'concl-timeseries', section: 'Démonstration', title: 'Démo 4 · ce qu’on retient', minutes: 1.5,
    body: () => (
      <div className="deck-split deck-split--chart">
        <ResultsChart caseId="timeseries" highlight={['NIR seul', 'Météo seule', 'Early · concaténation', 'Late · stacking']} />
        <div>
          <Points items={[
            <><strong>Le spectre porte le signal</strong> : NIR seul {fmt(R.ts('NIR seul').oofRmse)} % MS (R² {R.ts('NIR seul').oofR2?.toFixed(2)})</>,
            <><strong>La météo seule ne se transfère pas</strong> d’une saison à l’autre : {fmt(R.ts('Météo seule').oofRmse)}, R² négatif</>,
            <>Fusion early {fmt(R.ts('Early · concaténation').oofRmse)} : 360 colonnes de contexte <strong>diluent</strong> le spectre ; stacking {fmt(R.ts('Late · stacking').oofRmse)} (sa PLS spectre est fixée à 10 composantes)</>,
          ]} />
          <Provenance caseId="timeseries" />
        </div>
      </div>
    ),
    notes: [
      'Résultat honnête, et c’est la leçon : ici, la météo n’aide pas. Le spectre seul est le meilleur.',
      'Pourquoi ? La météo est la même pour tous les fruits d’une récolte, il n’y a que 36 récoltes et six blocs région × saison en calibration. Avec des folds groupés, le modèle doit prédire une saison qu’il n’a jamais vue : la météo seule n’y arrive pas, son R² est négatif.',
      'En early, on ajoute 360 colonnes météo, constantes au sein d’une récolte, aux 245 longueurs d’onde ; après mise à l’échelle, elles pèsent plus que le spectre et la PLS fait nettement moins bien que le spectre seul. Le stacking fait mieux que l’early mais ne bat pas le spectre seul ; attention, sa PLS sur le spectre est fixée à 10 composantes, la comparaison avec le NIR seul à 15 composantes n’est pas à armes égales.',
      'Sans folds groupés, un modèle pourrait simplement reconnaître la récolte à sa météo et paraître meilleur qu’il ne l’est : c’est le piège de la slide sur les séries temporelles. Pour qu’une série de contexte aide, il faut beaucoup plus de récoltes, ou des résumés agronomiques (somme de températures, cumul de pluie) plutôt que 90 jours bruts.',
    ],
  },
  {
    id: 'take-home', section: 'Synthèse', title: 'Par quoi commencer sur vos données', minutes: 1,
    body: () => (
      <div className="deck-guide">
        <div><span className="deck-guide-key"><span className="deck-num">1</span>Références</span><p>chaque source seule</p></div>
        <div><span className="deck-guide-key"><LevelTag level="early" /></span><p>pondérer les blocs, laisser croître les VL · MB-PLS</p></div>
        <div><span className="deck-guide-key"><LevelTag level="mid">Mid · scores</LevelTag></span><p>blocs très déséquilibrés : scores par source</p></div>
        <div><span className="deck-guide-key"><LevelTag level="late" /></span><p>instruments pas toujours disponibles : stacking</p></div>
        <div><span className="deck-guide-key"><LevelTag level="mid">Mid · CNN</LevelTag></span><p>beaucoup d’échantillons, vraies images</p></div>
        <div><span className="deck-guide-key"><span className="deck-num">✓</span>Protocole</span><p>mêmes folds · OOF · test une fois</p></div>
      </div>
    ),
    notes: [
      'À retenir : commencer par les sources seules, puis une fusion early bien faite. Passer à la mid fusion par scores quand les blocs sont déséquilibrés, à la late fusion quand les instruments ne sont pas toujours là. La mid fusion dans un CNN quand on a beaucoup d’échantillons ou de vraies images.',
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
