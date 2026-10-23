# Independent final lifecycle review

Read-only review of the new Backend/client lifecycle and CLI guards. No product code changes. Tested fingerprints `9dcb840637e8f20683d568a2d2b7fc1ee396460225c05366089c1046d39611b0` (initial simultaneous check) and `71b6e663d6e519a19338c1438624738aa355d2ebc00a5665109e0c4d273cd48c` (follow-up checks). Product control logic was unchanged between them; manifest coverage changed. These are pre-fix findings, not a verdict on subsequent root corrections.

## Necessary issues reproduced

1. **First simultaneous hosts do not converge on one backend.** Two independent host processes were launched, both constructed the same Backend config, and both were released from an IPC barrier to call ensure. Host 21916 attached to backend 22000; host 34904 rejected with `BACKEND_START_FAILED`. The log retains the losing service's `EADDRINUSE`. Earlier two Backend instances in one process reproduced the same result. The client-count lifecycle works once a backend exists, but the initial launch path only waits for its own instance marker and treats a competing launcher failure as terminal. Fix by coordinating startup or safely adopting the winner after full identity/config validation. Reproduction: `node tmp/mvp-protocol-audit/final-review/two-hosts.mjs`; evidence `two-hosts.json`, `two-host-runtime/.blender-agent/backend-42877.log`.

2. **CLI backend start does not promote an existing automatic backend.** An automatic Backend was kept alive in host A. A separate CLI `backend start` exited 0 and returned `ok:true,persistent:false` for the same backend PID. A following CLI worker start with an explicit holder failed with `PERSISTENT_BACKEND_REQUIRED` and told the caller to run backend start, which had just reported success. The start path returns the existing service without changing its lifetime. Reproduction: `node tmp/mvp-protocol-audit/final-review/persistence-promotion.mjs`; full stdout/stderr in `persistence-promotion.json`.

3. **Failed first client registration leaves a referenced child and prevents host exit.** Controlled fault injection returned HTTP 503 only for `/_adapter/clients`; startup, identity and the service were real. ensure failed with `BACKEND_ATTACH_FAILED`; dispose resolved and the host printed `DISPOSE_RESOLVED_MAIN_DONE`. It was still alive 1.5 seconds later because the launched child is only unref'd after attach success, while detach returns immediately without an attachedInstance. The backend had never accepted a client and kept running while its owner was alive, preserving the cycle. Only the exact test host was then killed; its backend exited through owner reaping. This proves handling of a denied registration, not a claim that natural network failures were observed. Reproduction: `node tmp/mvp-protocol-audit/final-review/attach-failure.mjs`; evidence `attach-failure.json`.

## Normal behavior independently checked

With A and B attached to the same real service, A's explicit stop was rejected with `BACKEND_IN_USE,otherClients:1`. Unregistered C's stop was rejected with `otherClients:2`. B still saw the original backend PID afterward. Closing the test clients cleaned the service. Evidence: `stop-protection.json`; script `stop-protection.mjs`.

No already-passing Blender/MCP regression suites were rerun. The checks require no Blender launch and use isolated ports 42877–42879. All test-created service/host processes were closed or explicitly killed by retained handles; no audit listener remained.

Including TypeScript controller sources, tools.json and plan-routing.mjs in the staged fingerprint is an appropriate correction: a change to client-registration semantics must reject a stale backend even if runtime/addon files have not changed.
