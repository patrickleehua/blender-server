// Windows-only real hidden GUI acceptance. Run from repository root after a normal package build.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Bridge} from '../../packages/blender-agent/dist/core.js';
import {portOccupied} from '../../packages/blender-agent/dist/backend.js';
const root=path.resolve('.'),out=path.resolve(process.env.BLENDER_AGENT_GUI_OUT||'evidence/mvp-audit/gui');
const work=path.resolve(process.env.BLENDER_AGENT_GUI_WORK||'tmp/mvp-gui');
const blender=path.resolve(process.env.BLENDER_AGENT_TEST_EXE||'.local/blender-4.5.15-windows-x64/blender.exe');
if(process.platform!=='win32')throw Error('This hidden-GUI test uses Windows Start-Process');
const port=Number(process.env.BLENDER_AGENT_GUI_PORT||45877),addonPort=port-1,workerPort=port+2;
for(const p of [port,addonPort,workerPort])assert.equal(await portOccupied(p),false,`Test port ${p} already in use`);
for(const dir of [out,work,path.join(work,'config'),path.join(work,'scripts')])fs.mkdirSync(dir,{recursive:true});
const control=path.join(work,'control.json'),ack=path.join(work,'control-ack.json');
const addon=path.join(root,'packages/blender-agent/assets/addon/dsh_blender_bridge.py');
const boot=path.join(work,'gui-boot.py');
fs.writeFileSync(boot,`import bpy,sys,os,json,importlib.util\nfrom mathutils import Quaternion\np=${JSON.stringify(addon)}\ns=importlib.util.spec_from_file_location('dsh_gui_live_bridge',p)\nm=importlib.util.module_from_spec(s)\nsys.modules[s.name]=m\ns.loader.exec_module(m)\nm.register()\nbpy.context.scene.dshbb_port=${addonPort}\nbpy.context.scene.dshbb_auto_start_server=True\nbpy.context.scene.dshbb_backend_url='http://127.0.0.1:${port}'\nm._dshbb_ensure_server_running()\n# Test-local timer allows pause to be restored without bypassing it through tool execution.\n_last=[None]\ndef control_tick():\n    try:\n        p=${JSON.stringify(control)}\n        if os.path.isfile(p):\n            d=json.load(open(p,encoding='utf-8'))\n            if d.get('id')!=_last[0]:\n                bpy.context.scene.dshbb_ai_paused=bool(d['paused'])\n                _last[0]=d['id']\n                json.dump({'id':d['id'],'paused':bpy.context.scene.dshbb_ai_paused},open(${JSON.stringify(ack)},'w'))\n    except Exception as e: print('CONTROL_ERROR',str(e),flush=True)\n    return 0.1\nbpy.app.timers.register(control_tick,first_interval=0.1,persistent=True)\nprint('GUI_BOOT '+json.dumps({'background':bpy.app.background,'port':bpy.context.scene.dshbb_port,'config':bpy.utils.user_resource('CONFIG'),'addon':p}),flush=True)\n`);
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const launcher=path.join(work,'launch.ps1');
fs.writeFileSync(launcher,`$ErrorActionPreference='Stop'\n$env:BLENDER_USER_CONFIG=${quote(path.join(work,'config'))}\n$env:BLENDER_USER_SCRIPTS=${quote(path.join(work,'scripts'))}\n$env:DSH_BLENDER_BACKEND_URL='http://127.0.0.1:${port}'\n$p=Start-Process -FilePath ${quote(blender)} -ArgumentList @('--factory-startup','--python',('"'+${quote(boot)}+'"')) -WindowStyle Hidden -PassThru -RedirectStandardOutput ${quote(path.join(out,'gui.stdout.txt'))} -RedirectStandardError ${quote(path.join(out,'gui.stderr.txt'))}\n$p.Id\n`);
const launch=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',launcher],{encoding:'utf8',windowsHide:true,timeout:15000});
assert.equal(launch.status,0,launch.stderr);const guiPid=Number(launch.stdout.trim());assert.ok(guiPid>0);
const b=new Bridge({port,addonPort,workerPort,workdir:work,blender,holder:'gui-live-owner'});
const manifest=JSON.parse(fs.readFileSync(path.join(root,'packages/blender-agent/assets/manifest.json'),'utf8'));
const metadata={blender,guiPid,port,addonPort,workerPort,node:process.version,startedAt:new Date().toISOString(),assetsFingerprint:manifest.fingerprint,cliSha256:createHash('sha256').update(fs.readFileSync(path.join(root,'packages/blender-agent/dist/cli.js'))).digest('hex')};
fs.writeFileSync(path.join(out,'environment.json'),JSON.stringify(metadata,null,2));
const records=[];let backendPid;
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
async function until(fn,message,ms=15000){const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error(message);}
async function c(label,name,args,negative=false){const r=await b.call(name,args);const clean=JSON.parse(JSON.stringify(r,(k,v)=>k==='data'||k==='png_b64'?undefined:v));records.push({label,name,args,result:clean});fs.writeFileSync(path.join(out,'calls.json'),JSON.stringify(records,null,2));assert.equal(!!r.isError,negative,label+': '+JSON.stringify(clean));return r;}
const act=(label,code)=>c(label,'blender_rt_do',{auto:false,see:false,code});
async function shot(label){const r=await c(label,'blender_rt_see',{auto:false,view_size:'560x315',from:'9,-11,8',look_at:'0,0,0',ortho:true,ortho_scale:14});const i=r.content.find(i=>i.type==='image');assert.ok(i);const bytes=Buffer.from(i.data,'base64');assert.equal(i.mimeType,'image/png');assert.equal(bytes.readUInt32BE(16),560);assert.equal(bytes.readUInt32BE(20),315);fs.writeFileSync(path.join(out,label+'.png'),bytes);return createHash('sha256').update(bytes).digest('hex');}
async function pause(value){const id=Date.now();fs.writeFileSync(control,JSON.stringify({id,paused:value}));await until(()=>{try{const d=JSON.parse(fs.readFileSync(ack));return d.id===id&&d.paused===value;}catch{return false;}},'GUI pause control not acknowledged');}
try{
 await until(()=>portOccupied(addonPort),'GUI addon did not listen',60000);
 const doc=await c('doctor','blender_viewport',{op:'doctor'});assert.equal(doc.structuredContent.kind,'ok');
 backendPid=(await b.backend.identity()).pid;
 await act('create-two-cubes',`import bpy,json,os\nassert not bpy.app.background\nassert bpy.utils.user_resource('CONFIG').replace('\\\\','/').startswith(${JSON.stringify(path.join(work,'config').replaceAll('\\','/'))})\nbpy.ops.object.select_all(action='SELECT')\nbpy.ops.object.delete(use_global=False)\nfor name,x in [('GuiCubeA',-1.8),('GuiCubeB',1.8)]:\n    bpy.ops.mesh.primitive_cube_add(size=2,location=(x,0,0))\n    bpy.context.object.name=name\nK.out_dir=${JSON.stringify(out)}\nK.gui_marker='only-this-gui'\nbpy.ops.wm.save_as_mainfile(filepath=${JSON.stringify(path.join(out,'gui-scene.blend'))})\nprint('GUI_PROOF '+json.dumps({'pid':os.getpid(),'version':bpy.app.version_string,'objects':[o.name for o in bpy.data.objects]}))`);
 const before=await shot('before');
 await act('gpu-buffer-type-probe',`import gpu,json\noff=gpu.types.GPUOffScreen(16,8)\ntry:\n    with off.bind():\n        gpu.state.active_framebuffer_get().clear(color=(0.25,0.5,0.75,1.0))\n        buf=off.texture_color.read()\n        mv=memoryview(buf)\n        info={'format':mv.format,'itemsize':mv.itemsize,'nbytes':mv.nbytes,'expected_rgba8_bytes':16*8*4,'expected_float_bytes':16*8*4*4}\n        print('GPU_BUFFER '+json.dumps(info))\nfinally:\n    off.free()`);
 await act('gpu-known-clear-probe',`import gpu,json,numpy as np\noff=gpu.types.GPUOffScreen(16,8)\ntry:\n    with off.bind():\n        fb=gpu.state.active_framebuffer_get()\n        fb.clear(color=(0.25,0.5,0.75,1.0))\n        buf=fb.read_color(0,0,16,8,4,0,'UBYTE')\n        mv=memoryview(buf)\n        arr=np.asarray(buf)\n        info={'format':mv.format,'shape':list(mv.shape),'strides':list(mv.strides),'nbytes':mv.nbytes,'contiguous':mv.contiguous,'memoryview_first':list(bytes(mv)[:20]),'np_shape':list(arr.shape),'np_first':arr.flatten()[:20].tolist(),'tolist_first':str(buf.to_list())[:500],'scalar':int(buf[0][0][0])}\n        print('GPU_CLEAR_PROBE '+json.dumps(info))\nfinally:\n    off.free()`);
 await act('gpu-flat-buffer-selftest',`import gpu,json\noff=gpu.types.GPUOffScreen(16,8)\ntry:\n    with off.bind():\n        fb=gpu.state.active_framebuffer_get()\n        fb.clear(color=(0.25,0.5,0.75,1.0))\n        buf=fb.read_color(0,0,16,8,4,0,'UBYTE')\n        buf.dimensions=16*8*4\n        raw=bytes(memoryview(buf))\n        assert len(raw)==512\n        expected=[64,128,191,255]\n        assert all(abs(int(raw[j])-expected[j%4])<=1 for j in range(len(raw))),list(raw[:16])\n        print('GPU_FLAT_CLEAR '+json.dumps({'ok':True,'rgba':list(raw[:4]),'shape':list(memoryview(buf).shape),'strides':list(memoryview(buf).strides),'bytes':len(raw)}))\nfinally:\n    off.free()`);
 await act('product-gpu-rgba8-selftest',`import gpu,json\nread_rgba8=K.dsh_view_api['capture'].__globals__['_read_rgba8']\noff=gpu.types.GPUOffScreen(16,8)\ntry:\n    with off.bind():\n        fb=gpu.state.active_framebuffer_get()\n        fb.clear(color=(0.25,0.5,0.75,1.0))\n        raw=read_rgba8(fb,16,8)\n        expected=[64,128,191,255]\n        assert len(raw)==512\n        assert all(abs(int(raw[j])-expected[j%4])<=1 for j in range(len(raw))),list(raw[:16])\n        print('PRODUCT_GPU_CLEAR '+json.dumps({'ok':True,'rgba':list(raw[:4]),'bytes':len(raw)}))\nfinally:\n    off.free()`);
 const defaultView=await c('default-gui-viewport','blender_rt_see',{auto:false,max_size:560});
 const defaultImage=defaultView.content.find(i=>i.type==='image');assert.ok(defaultImage);fs.writeFileSync(path.join(out,'default-viewport.png'),Buffer.from(defaultImage.data,'base64'));
 const render=await c('same-gui-render-mode','blender_rt_see',{auto:false,view_mode:'render',view_size:'560x315',from:'9,-11,8',look_at:'0,0,0',ortho:true,ortho_scale:10});
 const renderImage=render.content.find(i=>i.type==='image');assert.ok(renderImage);fs.writeFileSync(path.join(out,'same-gui-render.png'),Buffer.from(renderImage.data,'base64'));
 await act('gui-mutate','assert K.gui_marker=="only-this-gui"\nbpy.data.objects["GuiCubeB"].scale.z=2');
 const after=await shot('after');assert.notEqual(before,after,'GUI change did not change returned image');
 await act('reset-for-join','bpy.data.objects["GuiCubeB"].scale.z=1');
 const opt=await c('opt-analyze','blender_rt_opt',{op:'analyze'});assert.equal(opt.structuredContent.result.joinable,2);
 await c('opt-join-dry-run','blender_rt_opt',{op:'join',args:{dry_run:true}});
 await act('dry-run-unchanged','assert len([o for o in bpy.data.objects if o.type=="MESH"])==2\nassert sum(len(o.data.polygons) for o in bpy.data.objects if o.type=="MESH")==12');
 const joined=await c('opt-join-real','blender_rt_opt',{op:'join',args:{dry_run:false,save_before:path.join(out,'before-join.blend')}});assert.deepEqual(joined.structuredContent.result.faces,[12,12]);assert.equal(joined.structuredContent.result.groups_joined,1);
 await act('independent-join-check','meshes=[o for o in bpy.data.objects if o.type=="MESH"]\nassert len(meshes)==1\nassert len(meshes[0].data.polygons)==12 and len(meshes[0].data.vertices)==16\nmeshes[0].name="GuiJoined"');
 await c('cmd-explicit-error','blender_rt_cmd',{name:'__gui_live_unknown_command__'},true);
 await act('save-before-snapshot',`bpy.ops.wm.save_as_mainfile(filepath=${JSON.stringify(path.join(out,'gui-scene.blend'))})`);
 await c('txn-snapshot','blender_rt_txn',{op:'snapshot',label:'gui-baseline'});
 await act('txn-mutate','bpy.data.objects["GuiJoined"].location.z=19');
 await c('txn-restore','blender_rt_txn',{op:'restore',label:'gui-baseline'});
 await act('txn-assert','assert abs(bpy.data.objects["GuiJoined"].location.z)<1e-6\nassert len(bpy.data.objects["GuiJoined"].data.polygons)==12');
 await c('preset-save','blender_rt_preset',{op:'save',name:'gui-live',data:JSON.stringify({location:[1,2,3]})});
 await c('preset-preview','blender_rt_preset',{op:'apply',name:'gui-live'});
 await act('preset-preview-readonly','assert abs(bpy.data.objects["GuiJoined"].location.z)<1e-6\nK.dsh_preset_api("apply", {"name":"gui-live","targets":["OBJ:GuiJoined"],"dry_run":True})\nassert abs(bpy.data.objects["GuiJoined"].location.z)<1e-6');
 await c('preset-apply','blender_rt_preset',{op:'apply',name:'gui-live',targets:'OBJ:GuiJoined'});
 await act('preset-real-assert','assert list(bpy.data.objects["GuiJoined"].location)==[1,2,3]');
 await c('preset-delete','blender_rt_preset',{op:'delete',name:'gui-live'});
 await c('perf-status','blender_rt_perf',{op:'status'});
 await act('perf-eevee-baseline','bpy.context.scene.render.engine="BLENDER_EEVEE_NEXT"\nbpy.context.scene.eevee.use_raytracing=False\nbpy.context.scene.eevee.taa_render_samples=16\nbpy.context.scene.eevee.shadow_ray_count=1\nbpy.context.scene.eevee.shadow_step_count=4');
 await c('perf-eevee-apply','blender_rt_perf',{op:'apply',args:{samples:64}});
 await act('perf-eevee-applied','assert bpy.context.scene.eevee.use_raytracing is True\nassert bpy.context.scene.eevee.taa_render_samples>=64');
 await c('perf-eevee-revert','blender_rt_perf',{op:'revert'});
 await act('perf-eevee-revert-readback','assert bpy.context.scene.render.engine=="BLENDER_EEVEE_NEXT"\nassert bpy.context.scene.eevee.use_raytracing is False\nassert bpy.context.scene.eevee.taa_render_samples==16\nassert bpy.context.scene.eevee.shadow_ray_count==1\nassert bpy.context.scene.eevee.shadow_step_count==4');
 await act('perf-cycles-setup','bpy.context.scene.render.engine="CYCLES"\nbpy.context.scene.cycles.samples=32');
 await c('perf-apply','blender_rt_perf',{op:'apply',args:{samples:64}});await c('perf-revert','blender_rt_perf',{op:'revert'});
 await act('perf-revert-readback','assert bpy.context.scene.cycles.samples==32');
 await c('loop-bench','blender_rt_loop',{op:'bench',iterations:2});await c('loop-status','blender_rt_loop',{op:'status'});
 const workersBefore=await c('workers-before-pause','blender_rt_worker',{op:'list'});
 await pause(true);
 await c('paused-see-refuses-fallback','blender_rt_see',{view_size:'560x315'},true);
 await c('paused-do-refuses-fallback','blender_rt_do',{see:false,code:'raise RuntimeError("must not reach a different worker")'},true);
 const workersAfter=await c('workers-after-pause','blender_rt_worker',{op:'list'});assert.deepEqual(workersAfter.structuredContent,workersBefore.structuredContent);
 await pause(false);
 const resumed=await c('doctor-resumed','blender_viewport',{op:'doctor'});assert.equal(resumed.structuredContent.kind,'ok');
 await act('resumed-same-scene','assert K.gui_marker=="only-this-gui"\nassert "GuiJoined" in bpy.data.objects\nbpy.data.objects["GuiJoined"].location=(0,0,0)');
 await shot('final');
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:true,calls:records.length,...metadata,guiDoctor:'ok',nativeImages:true,joinFaceCountPreserved:true,txnRestore:true,presetPreviewReadOnly:true,pausedNoFallback:true},null,2));
 console.log('GUI LIVE PASS');
}finally{
 await pause(false).catch(()=>{});
 await b.dispose();
 if(alive(guiPid)){process.kill(guiPid,'SIGKILL');}
 await until(async()=>!alive(guiPid)&&!await portOccupied(addonPort),'Own GUI did not exit');
 await until(async()=>!await portOccupied(port)&&!await portOccupied(workerPort)&&(!backendPid||!alive(backendPid)),'Own backend cleanup failed');
 fs.writeFileSync(path.join(out,'cleanup.json'),JSON.stringify({ok:true,guiPid,backendPid,guiExited:!alive(guiPid),backendExited:!backendPid||!alive(backendPid),addonPortReleased:!await portOccupied(addonPort),httpPortReleased:!await portOccupied(port),workerPortReleased:!await portOccupied(workerPort)},null,2));
}
