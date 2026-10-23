# Final startup regression after corrections

Final verified build fingerprint: `be8bc90e415187fcf7b85b798608c9004eb4a6e8c08feb193dd0674a7d70f78d`.

The three earlier lifecycle findings now pass their targeted reproductions. One additional recheck found that build `c3d189...` promoted the identity/state to persistent but its previously-created automatic-service reaper still stopped the backend after the last client left. That failing result is preserved at `tmp/mvp-protocol-audit/fixed-final-review/promotion.json`. Root corrected the callback guard before the final build below was tested.

Permanent regression added only in `packages/blender-agent/test/backend-startup.test.mjs`. It starts real backend services and real independent Node hosts, with no Blender or GUI. Final run:

```
$env:BLENDER_AGENT_STARTUP_OUT = <repository>/tmp/mvp-protocol-audit/fixed-final-review/permanent-tests
node --test packages/blender-agent/test/backend-startup.test.mjs
```

All four tests passed:

1. Two Backend instances released together in one host adopted the same verified backend PID/instance.
2. Two independent host processes released from an IPC barrier both attached successfully to the same backend PID/instance.
3. A real CLI `backend start` promoted the running automatic backend, retained its PID, returned `persistent:true`, and stayed alive with that same PID after the last client detached and 1.6 seconds crossed the reaper interval. Explicit stop cleaned it afterward.
4. Injected HTTP 503 only at client registration caused `BACKEND_ATTACH_FAILED`; dispose completed, the host exited naturally with status 0, and the real service was reaped after its host exited. This is fault injection, not an observed network outage.

Raw final evidence is retained in `tmp/mvp-protocol-audit/fixed-final-review/permanent-tests/*/result.json`. The earlier failed evidence in `final-review/` was not overwritten. The two-host ad hoc rerun and registration-failure rerun are also in `fixed-final-review/two-hosts.json` and `attach-failure.json`.

No new product defect remains from this bounded review. Product files were read-only during recheck; only the new permanent test was added. No prior passing Blender suites were rerun. Audit-owned processes and listeners were cleaned.
