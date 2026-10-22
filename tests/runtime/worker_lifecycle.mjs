// Real persistent-worker lifecycle checks. Optional --ttl waits across the 30s reaper.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const exe=process.env.BLENDER_AGENT_EXE||process.env.DSH_BLENDER_EXE;
if(!exe)throw Error('Set BLENDER_AGENT_EXE to a real Blender executable.');
const out=path.resolve(process.env.BLENDER_AGENT_TEST_OUT||path.join(root,'tmp/worker-lifecycle'));
fs.mkdirSync(out,{recursive:true});
const probe=net.createServer();await new Promise((r,j)=>{probe.once('error',j);probe.listen(0,'127.0.0.1',r);});const port=probe.address().port;await new Promise(r=>probe.close(r));
process.env.DSH_BLENDER_EXE=exe;process.env.DSH_BLENDER_WORKDIR=out;process.env.DSH_BLENDER_WORKER_PORT=String(port);process.env.DSH_WORKER_TTL_MS='1';
const {createEngine}=await import('../../bridge/runtime/engine.mjs');
const e=createEngine();
let result;
try{
const starts=await Promise.all([e.worker.start({engine:'workbench',warmup:false},'lifecycle'),e.worker.start({engine:'workbench',warmup:false},'lifecycle')]);
if(!starts[0].ready||starts[0].pid!==starts[1].pid)throw Error('Concurrent starts failed to reuse one worker');
await e.worker.exec("bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.mesh.primitive_cube_add(size=3);bpy.context.object.name='LifecycleCube'",120000,null,'lifecycle');
const upgraded=await e.worker.start({preload:'audit'},'lifecycle');
if(upgraded.pid!==starts[0].pid)throw Error('Incremental preload restarted the worker');
const kept=await e.worker.exec("assert 'LifecycleCube' in bpy.data.objects;assert hasattr(K,'dsh_audit_api');print('HEADLESS {\"preserved\":true}')",120000,null,'lifecycle');
if(!kept.ok||!kept.result.preserved)throw Error('Incremental preload lost scene or failed to load API');
let busy=null;
if(process.argv.includes('--ttl')){
 const pending=e.worker.exec("import time;time.sleep(35);print('HEADLESS {\"complete\":true}')",60000,null,'lifecycle');
 await new Promise(r=>setTimeout(r,100));busy=e.worker.list().find(w=>w.name==='lifecycle');
 if(busy.inflight!==1)throw Error('Busy worker has no in-flight count');
 const done=await pending;if(!done.ok||!done.result.complete)throw Error('TTL reaper interrupted a busy worker');
 if(e.worker.list().find(w=>w.name==='lifecycle').inflight!==0)throw Error('In-flight count did not clear');
}
result={ok:true,pid:starts[0].pid,port,concurrent_start_same_pid:true,incremental_preload_preserves_scene:true,ttl_checked:!!busy};
}finally{await e.stop();}
const open=await new Promise(resolve=>{const c=net.connect(port,'127.0.0.1');c.once('connect',()=>{c.destroy();resolve(true);});c.once('error',()=>resolve(false));});
if(open)throw Error('Engine stop returned before its owned worker released the port');
fs.writeFileSync(path.join(out,'lifecycle.json'),JSON.stringify({...result,owned_worker_stopped:true},null,2));console.log(JSON.stringify(result,null,2));
