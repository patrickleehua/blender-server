# Blender Agent Bridge

Independent Node.js 22+ CLI and MCP stdio server for Claude, Codex and other agents. No DSH installation or account is required. Blender 4.x/5.x runs on the same machine. The package includes the compatibility engine, addon, 15 tool contracts, 33-family/217-operation plan catalog, and an agent skill.

## Install and configure a project

Install the published package or a locally generated `.tgz` with npm. From a source checkout, run `npm ci` and `npm run build` inside `packages/blender-agent`.

```powershell
blender-agent --help
blender-agent config --host claude --workdir "C:/my project/blender work"
blender-agent config --host codex --workdir "C:/my project/blender work"
```

These commands print configuration; they do not change global settings. To copy the bundled skill and generate project configuration, run the package's setup script:

```powershell
node <installed-package>/scripts/portable-setup.mjs --project "C:/my project" --host both
# Review the dry run, then repeat with --apply.
```

The script uses the installed package's own `dist/cli.js` and `assets/skill`; it does not require the source repository. Existing host configuration is preserved and receives a separate candidate file for review.

After updating the package, rerun its setup script against the same project and options, first with `--dry-run`, then `--apply`. Files still matching the installer manifest receive an `update`; user edits or unowned files cause `conflict` and block all writes. Host configs containing user-added servers or settings are preserved for manual review. Uninstall removes only unchanged installer-owned files using the latest recorded hashes. The canonical bundled Skill is `assets/skill/`.

## GUI first

Use `blender-agent call blender_viewport --json '{"op":"launch"}'` to open Blender with the bundled addon. You may also install `assets/addon/dsh_blender_bridge.py` in Blender, enable it and press Connect in the N panel. The default addon port is 9876, HTTP backend 9877, worker base port 9879.

`blender-agent doctor` must report `kind="ok"` to prove the GUI route works. A running backend alone does not prove Blender is ready. The native addon can send multiple selected objects or a whole collection and can pause AI writes; inserting that selection into a particular host's draft depends on that host's integration.

Automatic worker fallback requires a doctor result that clearly says the GUI is unreachable. Busy, paused or ambiguous GUI states never switch to another scene. A full UI screenshot requires the GUI and cannot be replaced by a headless render.

## Persistent CLI workflows

Separate CLI calls need an explicit persistent backend to retain workers and jobs. Use the same ports, workdir and explicit holder for the workflow. Different concurrent workflows need different holders and independent worker names; separate Blender instances also need separate ports.

```powershell
$bridgeOptions = @('--workdir', 'C:/my project/blender work', '--blender', 'C:/Program Files/Blender Foundation/Blender 4.5/blender.exe', '--holder', 'model-session-a')
blender-agent backend start @bridgeOptions
blender-agent call blender_rt_worker --json '{"op":"start","name":"model","engine":"workbench","warmup":false}' @bridgeOptions
blender-agent call blender_rt_do --json '{"session":"model","code":"import bpy; bpy.ops.mesh.primitive_cube_add()","see":false}' @bridgeOptions
blender-agent call blender_rt_see --json '{"session":"model","view_size":"560x315"}' @bridgeOptions
blender-agent backend stop @bridgeOptions
```

For scripts or JSON with quotes and newlines, use `call <tool> --file args.json` or `--stdin`. UTF-8 BOM, Chinese characters and spaces in paths are supported. Relative `blender_rt_do.file` paths resolve beside the worker's currently saved `.blend`; unsaved scenes require an absolute script path.

CLI do/see/watch, worker operations other than list/status, plan calls with a session (except catalog), and loop target=session require an explicit stable `--holder my-session` or `BLENDER_AGENT_HOLDER`. Reuse the same holder and worker name across calls. Leases and release require the same explicit identity. Another holder operating that worker receives `WORKER_OWNED` / HTTP 409; query list/status and use a different worker name. MCP uses its service process identity without a fixed configured holder.

CLI do/see/watch, non-catalog plan, worker operations other than list/status, loop target=session, headless, job start and viewport start/restart require `backend start` first. Missing persistence returns `PERSISTENT_BACKEND_REQUIRED`; missing identity returns `EXPLICIT_HOLDER_REQUIRED`. Catalog, doctor and status queries can run independently.

An automatic MCP backend tracks registered active clients: one host closing or dying preserves other active clients' scenes; the last client leaving cleans it up. An explicitly persistent backend remains running without clients. Explicit stop returns `BACKEND_IN_USE` while other clients are connected; close those clients first. Stopping a backend cleans its background Blender children and leaves user GUI windows open.

## Tools and results

`blender-agent tools` lists all 15 schemas. `catalog --family audit` discovers a family; `catalog --full` returns the detailed catalog. `call blender_rt_plan --json '{"op":"catalog"}'` is the equivalent tool call. Existing plan names and Python `K` APIs remain compatible.

CLI results are JSON on stdout; MCP results contain native `image` content blocks with image bytes and MIME types. Logs are stored under `<workdir>/.blender-agent/`. Transport timeout or cancellation leaves execution status uncertain; inspect job or worker state before retrying. A failed write is never replayed automatically. Long headless work obtains a job handle first; `blender_rt_job` collects or stops it.

If code succeeded but its image failed, the result has `isError=true` and `executionCompleted=true`: retry only see, never replay the code. Headless/job `args` accepts string arrays to preserve individual arguments containing spaces or Unicode. Worker see/watch supports `view_size`.

The adapter validates backend identity, engine fingerprint, workdir and ports before sending operations. It refuses occupied foreign ports, binds to loopback and authenticates HTTP requests. It uses a generated local config rather than reading settings from an old DSH home directory. Existing `DSH_BLENDER_*` environment names remain compatibility inputs; `--port`, `--addon-port`, `--worker-port`, `--workdir`, `--blender`, `--holder`, `--timeout-ms` override the corresponding settings.

QC results retain `pass / fail / degraded`; `degraded` is not acceptance. Optional native dependencies are not bundled (including Open3D, manifold3d, OpenCV/MediaPipe and glTF Validator). Organic characters, rigging and film-quality lighting are outside the catalog's declared scope.

## Verification and license

`npm test` runs protocol, identity, timeout and lifecycle regressions. Set `BLENDER_AGENT_TEST_EXE` and run `npm run test:live` for real Blender/MCP scene, image, file and cleanup acceptance. Tests use isolated ports and temporary scenes.

Current real coverage is Windows headless on Blender 4.5.15 and 5.0.1, and Windows GUI on 4.5.15. CI for other platforms has not run; cross-platform examples do not establish acceptance.

The bridge and reused compatibility engine retain BSD-3-Clause notices. The bundled skill has its own MIT license and notice in `assets/skill/`. See `LICENSE`, `assets/LICENSE` and `assets/NOTICE.md` where present. Blender remains a separate Blender Foundation product.
