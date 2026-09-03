# Web 0.1.10 security candidate

Status: **NO-GO for tag, `main`, GitHub Pages, or publication.**

- The nirs4all-formats WASM payload is rebuilt reproducibly from the exact
  `v0.2.9` source commit `3e5a05674dfab4bbcebf23fe9d615d231ca4d551`.
- The staged Core payload is the exact public `nirs4all@0.3.27` artifact from
  commit `89787477bd7883ceb26b51fa3228bca13db85f6e`; two independent registry
  fetches matched byte-for-byte. Its provenance and complete package inventory
  are guarded by SHA-256.
- Release remains blocked pending review of the final grouped Web gate reported
  from this candidate.

No sibling-repository path dependency or private patch is accepted for that
Core update.
