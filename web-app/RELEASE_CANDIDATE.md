# Web 0.1.10 security candidate

Status: **NO-GO for tag, `main`, GitHub Pages, or publication.**

- The nirs4all-formats WASM payload is rebuilt reproducibly from the exact
  `v0.2.9` source commit `3e5a05674dfab4bbcebf23fe9d615d231ca4d551`.
- The staged Core payload remains `nirs4all@0.3.25`. Release stays blocked until
  the published Core `0.3.27` artifact is staged as the single Core source,
  its provenance and byte-hash guards are updated, and the Web gate is rerun.

No sibling-repository path dependency or private patch is accepted for that
Core update.
