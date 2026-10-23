# MVP protocol audit (read-only)

Baseline: `fe3bc3ef3c9422a53a62596bb27c6d464fe6806f`. Windows, Node-based public Bridge implementation, Blender 4.5.15 LTS (`5afeabba6097`). No implementation, docs, package, addon or global configuration changed. Ports 42877/42878/42879 were isolated; all audit-owned backend/worker processes were disposed and no listening socket remained.

Read: AGENTS.md, acceptance scenarios, adapter design, all six TypeScript source files, tools.json and plan-routing.mjs. Followed adapter mappings into the maintained runtime where necessary. This is not a statement that all 217 plan operations or all GUI operations passed.

## Necessary fixes

1. **P1 — Python exceptions become successful headless/jobs.** `blender_rt_headless({script:'raise ValueError("AUDIT_INTENTIONAL_EXCEPTION")',engine:'none'})` returned `ok:true`, `isError:false`, `job.status:'done'`, `exitCode:0` even though `job.stderrTail` and `lastException` contain that ValueError. The execution stopped before `script-end`/`done`. `engine.mjs:1746` does not add `--python-exit-code`; `engine.mjs:1819` treats exit 0 as done. Core now routes every headless execution through this job path (`core.ts:203`), making this a public default-path bug. Fix process exception/termination reporting at the common job execution boundary and preserve raw traceback. The same execution path affects job start/wait/collect.

2. **P1 — blender_rt_opt operations do not map to the runtime.** Contract permits `analyze|join|help`; core sends the same op to `/opt` (see mapping-fixture.json). `engine.mjs:2622` calls the perf dispatcher unchanged. The actual perf module registers `analyze` as render-performance analysis and `opt_analyze`/`opt_join` as object merging (`perf.py:446,450,451`). In real Blender, dispatch `join` returned `ok:false,error:'unknown op'`; `opt_analyze` returned the correct object-merge candidate result. Thus join is unusable and analyze invokes a different capability. Map the public operations to their correct runtime counterparts. No GUI was launched: the HTTP mapping and real Python dispatcher were checked separately.

3. **P1 — same-worker writes have no owner protection.** Holder A acquired a lease; holder B's lease call correctly failed with HTTP 409. A wrote `K.audit_owner='A'` to worker `shared`; B then wrote `'B'` to the same worker successfully; A read back `'B'`. Core adds `isolated:true` for every worker request (`core.ts:84`), and the runtime skips leaseGate for all isolated requests (`server.mjs:704`); there is no worker-level holder gate. Different named workers should remain independent, but two holders using the same scene must not silently overwrite each other. This also affects the shared default names used by automatic do/see/watch sessions. Real state evidence is in real-audit2.json.

4. **P2 — explicit runtime error is reported as tool success.** Real backend call `blender_rt_cmd({name:'qc_render_catalog'})` returns `result.status:'error'` and `CMD_HINT ...`, but outer `ok:true` and `isError:false`. The engine intentionally returns this correction error (`engine.mjs:2520`); `failed()` (`core.ts:53`) does not recognize `status:'error'`. Preserve the helpful correction while setting a consistent failure signal.

## Smaller contract mismatches (bounded follow-up)

- `blender_rt_job` advertises runId and jobId in the same query space. A successful headless result returned both, but status by its runId was unknown while status by jobId worked. `jobStatus/Collect/Wait/Kill` resolve only the stored job id (or legacy run entries), not the job's runId alias. Either support the advertised alias consistently or make the public recovery contract explicitly use jobId.
- Headless's documented default child timeout is 180000 ms, but routing it through job start silently uses 3600000 ms. Verified on real results. Keep advertised behavior or revise the contract with an explicit decision.
- `blender_rt_worker({op:'watch',view_size:'120x80'})` is accepted but rendered 420x236. Core copies raw args to spec instead of the normalized `view(args)` (`core.ts:151`); actual Python watch expects width/height. Worker watch also cannot accept seconds/fps although the dedicated watch tool can. The view-size behavior is a mapping defect; exposing additional controls is a product choice.
- Both jobs and headless tokenize legacy string args into arrays internally, but schemas reject an actual JSON array (`INVALID_ARGUMENTS: data/args must be string`). The job description explicitly promises arrays, and array transport is the safe path for quoted/Unicode arguments. Align the schema with the existing implementation.
- Deliberately malformed `HEADLESS this-is-not-json` retains `resultParseError` but returns success/done. This records useful raw evidence; distinguish execution completion from structured-result failure if callers depend on the marker.

## Verified normal behavior

- All 15 public tools were checked against isolated request-capture fixtures. The expected HTTP routes, object parsing, CSV list conversion, timeout_ms→timeoutMs, script_file→scriptFile, include_noise→includeNoise and out_json→outJson mappings were observed. This verifies adapter mapping, not a full real operation pass. The opt and worker-watch mismatches above remain.
- Real worker start, exec, incremental preload and persistent K state work. Python RuntimeError retains its original message/traceback and returns `isError:true`; nested semantic `{ok:false}` also returns `isError:true`. A following successful read of K works after either failure.
- Real lease acquire/conflicting acquire behaves correctly at the lease endpoint. Worker ownership is the separate gap above.
- Real worker watch returns native image content and reports static scene hashes; image payloads are removed from the structured text. Dimensions passed through raw worker watch are the exception above.
- Real successful headless job returned parsed `{ok:true,answer:42}`, a durable jobId, done status and queryable job state.
- All audit-created backend/worker processes were stopped; only TCP TIME_WAIT entries remained at the checked ports.

## Reproduction and evidence

Run from repository root:

```
node tmp/mvp-protocol-audit/real-audit.mjs
node tmp/mvp-protocol-audit/real-audit2.mjs
node tmp/mvp-protocol-audit/mapping-fixture.mjs
```

Raw result files: `real-audit.json`, `real-audit2.json`, `mapping-fixture.json` in this directory. Runtime scripts/logs/artifacts stay under `tmp/mvp-protocol-audit/runtime*`. The first script's ordinary variable `audit_owner` is deliberately not used as persistence evidence: each worker execution receives a new namespace. The second script tests the promised persistent `K` instead.

GUI doctor/frame/txn/preset/perf/opt end-to-end, official Claude/Codex host runs, independent artifact reopen/export checks and platform matrix are outside this protocol subaudit; other audit scopes must supply their own evidence. No tests were weakened and no implementation was patched.
