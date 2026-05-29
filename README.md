# nirs4all-lite

> **Statut : planifié (à créer).** Ce dépôt est un placeholder. Aucun code n'est encore présent.

**Distribution simplifiée multi-langages** de la chaîne bas-niveau de l'écosystème nirs4all —
`nirs4all-formats` + `nirs4all-io` + `nirs4all-methods` (`libn4m`) + `dag-ml` [+ `dag-ml-data`] —
emballée pour les écosystèmes scientifiques **non-Python**.

## Le « lite » est une sémantique de *capability*, pas de *codebase*

Sans Python, on perd `sklearn` / `PyTorch` / `TensorFlow` / `JAX`. La stack distribuée ici est
donc mécaniquement plus restreinte côté ML : lecture de formats spectroscopiques, assemblage de
datasets, PLS et variants (`libn4m`), coordination DAG reproductible. C'est *lite* par capability,
**pas par code**.

Ce que `nirs4all-lite` *n'est pas* : pas une réécriture du code Python, pas un sous-ensemble du
code source, pas un fork. Ce qu'il *est* : un dépôt de **distribution et de release packaging**,
zéro code numérique nouveau. Une release `lite` = un bundle immutable qui épingle des versions
précises des libs amont et les expose en un produit par langage cible.

## Cibles de distribution envisagées

- **R** (CRAN)
- **MATLAB / Octave** (FileExchange, `.mltbx`)
- **Julia** (`Pkg`)
- **JavaScript / WASM** (npm) — démos en ligne sur nirs4all.org
- **C / C++** (vcpkg / Conan / Homebrew / `.deb` / `.rpm`)
- **Conda** channel multi-langage
- **Docker** images

> PyPI est exclu par construction : `lite` est non-Python.

## Hygiène (à écrire dès le démarrage)

- **Aucun patch upstream.** Un correctif de binding remonte en PR dans la lib source.
- **Semver strict**, tags `v1`/`v2`, compat matrix « version `lite` × versions libs amont » publiée.
- **Tests sur repos fixtures** : un dépôt test minimal consomme chaque bundle à chaque PR.
- **SBOM + provenance + attestations** (Sigstore / SLSA / in-toto), **CVE rebuild policy**, politique
  de retrait d'artefacts cassés, fenêtre EOL/support explicite.
- **Matrice de compatibilité** (glibc / OpenSSL / R version / MATLAB version / cibles OS).
- **Droits de redistribution** vérifiés par cible (licences hétérogènes : CeCILL, MIT, AGPL, BLAS/Eigen…).
- **Règle d'admission d'une cible** : CODEOWNER nommé + fixture CI dédiée + politique de release écrite.

## Références

Voir `nirs4all-ecosystem/NIRS4ALL-ECOSYSTEM_VISION.md` §4.3 pour le cadrage complet, et l'annexe
`nirs4all-dist` pour la factory de build (sujet distinct, à instruire après la première release `lite`).
