# Portable Core parity fixtures

These fixtures are vendored from `nirs4all-core/tests/parity` so the Web test
suite remains reproducible from an isolated checkout or worktree. The oracle
`portable_python_oracle.json` has SHA-256
`fc008911607a3260218d98fee86ec38e4dd0e5994e91126f7403baff5bc7377c`.

When the Core parity oracle changes, update the oracle and all four JSON
pipeline fixtures together, then run the complete Web test and build gates.
