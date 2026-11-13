# Optional server workspaces

The **Server workspaces** panel connects only after the user submits a server URL
and project token with **Connect**. It uses the pure `@nirs4all/server-client`
transport. The token input is cleared before any asynchronous work; the client
and credential remain in memory. **Disconnect and abort requests** invalidates
the connection generation, aborts its requests and prevents any old connection
from applying state after a project/token/URL change. The verified project and
rights come from `GET /api/v1/principal`; there is no client project selector.
The deployed origin must be admitted by the server. The offline `file://` app
keeps its local tools; connecting requires the served app and an allowed origin.

Saving transfers the exact editor pipeline and the active step/theme. Dataset
transfer requires the dataset checkbox: it includes the actual materialized
view, complete retained IO record/spec/analysis and original source bytes. This
preserves typed values, NaN/masks, units/axes, precision, sample/group/origin and
observation identities. The IO Symbol is explicitly extracted before encoding
and reattached with `rehydrateIoRetained` on restore; no IO reassembly occurs.

Fitted state has a separate checkbox. A selected completed run is exported by
`engine.exportModel` and the existing `exportN4aContainer` route. Models with
training rows require the additional explicit consent. Owner-imported models
reuse their exact original archive only while bound to the same imported model;
the original archive may contain training/source data, so its transfer always
requires the additional consent. Browser-session models for which the original
bytes are unavailable must be re-imported before inclusion. An imported native
model is not reconstructed from its display recipe or a fabricated run.

The host profile is `nirs4all.web.workspace`, version 1, app `nirs4all.web`.
`@nirs4all/server-client/state` losslessly encodes its envelope. Core writes a V1
`.n4a` attachment with owner `nirs4all.web.workspace`, required feature
`nirs4all-web-workspace@1`, root `workspace/state.json`, and generated binary
members under `workspace/data/`. Server metadata contains only the app/profile,
version and archive SHA reference; no scientific arrays. Opening uses Core's
verified member reader, keeps its handle alive until all asynchronous codec
reads finish, checks Core's container SHA-256 against the server artifact
reference before reading any members, validates the host envelope, and sends any embedded model through
the established `parseN4aFile` owner route. Unknown profile versions refuse.
The embedded model bytes are bound by Core's verified workspace member digest
before the established model importer reads them.

Restored server models and their original archive blobs stay in memory, including
models that retain training rows. The model, origin and original bytes are one
atomic host state; `saveSession` redacts every server-origin model. Initial
session loading refuses a model marked as server-origin, and Disconnect removes
only that marked persisted model while keeping local pipelines/bundled samples.
The existing persistence of the user's independently imported local model stays
available. No credential is part of the session contract.

Opening asks for confirmation before replacing local work. Data is adopted by
the existing host `adoptDataset` API with the restored pipeline kept. Previous
run results/controllers and ephemeral WASM handles are excluded and cleared.
The editor cannot resume a Results view without a result; it opens Pipeline
instead. A dataset-free workspace opens Dataset or, if a model was included,
Predict. No analysis runs automatically and restoration makes no scientific
qualification or cross-host executability claim.

The server scopes workspace/artifact reads to the immutable authenticated
project. A foreign artifact lookup refuses before the download. Updates use
`expectedRevision`; a conflict leaves local work intact and offers **Reload
server workspace** with replacement confirmation or **Save as new workspace**.
An uploaded attachment may remain unreferenced when a revision conflict occurs;
there is no automatic overwrite, deletion or background processing action.

The normal owner gate remains `npm run typecheck`, `npm run test`,
`npm run validate:catalog`, served/single-file builds and the relevant real-server
and local browser smokes. Real-server checks must cover fresh-context reopen,
source/ID roundtrip, optional owner-model prediction, CAS conflict, foreign
project refusal, disconnect during pending requests and token absence from
browser persistence. Local/CORS evidence does not certify external HTTPS rollout.
