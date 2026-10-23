# Runtime corrections and real regression

Implemented only in `bridge/runtime/engine.mjs`, `bridge/runtime/server.mjs` and the new `tests/runtime/protocol_regression.mjs`. No commit. Baseline failure evidence remains in `real-audit*.json` and `REPORT.md`.

- Jobs and direct headless calls start Blender with `--python-exit-code 1`; real ValueError/RuntimeError now preserve traceback, exit nonzero and report failed.
- `engine.opt` maps public analyze/join to opt_analyze/opt_join; help and existing prefixed operations remain compatible.
- Worker state owns a holder, keyed by the same normalized name used by execution. HTTP start/exec/reset/stop/restart/see/watch reject a different holder while that worker is alive, starting or in flight. Ownership does not depend on holder PID liveness. Status/list remain readable; other named workers remain independent of the GUI lease.
- Generated job and run IDs use UUIDs. Duplicate explicit run IDs are rejected against the current engine reservation set and existing ledger records. Job status/collect/wait/kill accept the job's runId alias, including after engine recreation. Headless-to-job promotion transfers the existing reservation, closes its unused log streams and stops its old heartbeat.
- Headless default timeout and worker-watch argument normalization were left to the root's shared-core changes.

All executed against Blender 4.5.15 LTS on Windows:

```
BLENDER_AGENT_EXE=<real Blender exe>
BLENDER_AGENT_TEST_OUT=<isolated directory>
node tests/runtime/protocol_regression.mjs
node tests/runtime/job_none.mjs
node tests/runtime/worker_lifecycle.mjs
```

`protocol_regression.mjs` passed real worker ownership denial for seven operations, readable status/list, independent worker start under another GUI lease, failed Python scripts, parsed success results, runId alias query/wait/collect/kill, duplicate rejection, recreated-engine recovery and headless promotion. It exercises the actual engine.opt wrapper/module with an addon wire fixture forwarding execute_code to a real isolated Blender worker. Analyze reported two merge candidates; real join merged 2 objects into 1 with unchanged face count and no failures. This is not GUI validation.

`job_none.mjs` passed: input CYCLES settings were preserved and GPU prelude absent. `worker_lifecycle.mjs` passed concurrent start reuse, incremental preload and scene retention. Its optional TTL wait was not run because reaper behavior was not changed.

Evidence: `fixed-runtime.json`, `fixed-job-none.json`, `fixed-lifecycle.json`. Original logs/artifacts are under `tmp/mvp-protocol-audit/fixed-*`. Syntax checks and git diff whitespace checks passed. No listeners remained on audit ports 42877–42880 after cleanup.
