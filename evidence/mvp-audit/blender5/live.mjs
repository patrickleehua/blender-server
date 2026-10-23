import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {Client} from '../../../packages/blender-agent/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport} from '../../../packages/blender-agent/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import {portOccupied} from '../../../packages/blender-agent/dist/backend.js';
const root=path.resolve('.');
const out=path.join(root,'evidence/mvp-audit/blender5');
const workdir=path.join(root,'tmp/mvp-blender5/MCP 中文 空格');
fs.mkdirSync(workdir,{recursive:true});
const blender=path.join(root,'.local/blender-5.0.1-windows-x64/blender.exe');
const client=new Client({name:'mvp-blender5-acceptance',version:'1.0.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[path.join(root,'packages/blender-agent/dist/cli.js'),'mcp','--port','44877','--addon-port','44876','--worker-port','44879','--workdir',workdir,'--blender',blender],stderr:'pipe'});
const log=[];let backendPid,workerPid;
const persist=()=>fs.writeFileSync(path.join(out,'mcp-calls.json'),JSON.stringify(log,null,2));
const call=async(label,name,args,{error=false}={})=>{
 const begin=Date.now(); const r=await client.callTool({name,arguments:args},undefined,{timeout:120000});
 const evidence={label,name,args,ms:Date.now()-begin,isError:r.isError,structuredContent:r.structuredContent,content:r.content.filter(c=>c.type!=='image')};
 log.push(evidence);persist();assert.equal(!!r.isError,error,JSON.stringify(evidence));return r;
};
const execute=(label,code,extra={})=>call(label,'blender_rt_do',{session:'proof5',see:false,code,...extra});
const scene=path.join(out,'scene.blend'),glb=path.join(out,'scene.glb');
try {
 await client.connect(transport);assert.equal((await client.listTools()).tools.length,15);
 await call('headless-doctor','blender_viewport',{op:'doctor'},{error:true});
 await execute('scene-create',`import bpy\nbpy.ops.wm.read_factory_settings(use_empty=True)\nbpy.ops.mesh.primitive_cube_add(size=2, location=(1,2,1.5))\no=bpy.context.object\no.name='Blender5Proof'\no.dimensions=(2,4,3)\nK.marker='persists'\nprint('HEADLESS {"created":true}')`);
 backendPid=JSON.parse(fs.readFileSync(path.join(workdir,'.blender-agent/backend-44877.json'),'utf8')).pid;
 const status=await call('worker-status','blender_rt_worker',{op:'status',name:'proof5'});workerPid=status.structuredContent.result.pid;
 await call('audit-preload','blender_rt_plan',{session:'proof5',op:'audit_mesh',args:{objects:['Blender5Proof']}});
 const after=await call('worker-status-after-audit','blender_rt_worker',{op:'status',name:'proof5'});assert.equal(after.structuredContent.result.pid,workerPid);
 await execute('preload-preserves-save',`import bpy\nassert K.marker=='persists'\nassert 'Blender5Proof' in bpy.data.objects\nbpy.ops.wm.save_as_mainfile(filepath=${JSON.stringify(scene)})`);
 fs.writeFileSync(path.join(out,'relative-script.py'),'import os\nassert os.path.basename(__file__)=="relative-script.py"\nassert "Blender5Proof" in bpy.data.objects\nK.relative_ok=True\n');
 await call('blend-relative-file','blender_rt_do',{session:'proof5',see:false,file:'relative-script.py'});
 await execute('relative-proof','assert K.relative_ok');
 const seen=await call('native-image','blender_rt_see',{session:'proof5',view_size:'560x315',from:'8,-9,8',look_at:'1,2,1.5',ortho:true,ortho_scale:12});
 const image=seen.content.find(c=>c.type==='image');assert.ok(image);assert.equal(image.mimeType,'image/png');const bytes=Buffer.from(image.data,'base64');assert.equal(bytes.readUInt32BE(16),560);assert.equal(bytes.readUInt32BE(20),315);fs.writeFileSync(path.join(out,'mcp.png'),bytes);
 await call('expected-error','blender_rt_do',{session:'proof5',see:false,code:'raise RuntimeError("expected Blender5 regression failure")'},{error:true});
 await execute('error-recovery','assert "Blender5Proof" in bpy.data.objects and K.marker=="persists"');
 await call('txn-preload','blender_rt_worker',{op:'start',name:'proof5',engine:'workbench',warmup:false,preload:'txn'});
 await execute('txn-snapshot',`import json\nK.out_dir=${JSON.stringify(out)}\nr=json.loads(K.dsh_txn_api['snapshot']('blender5-before'))\nassert r['ok'], r\nprint('HEADLESS '+json.dumps(r))`);
 await execute('txn-mutation',`bpy.data.objects['Blender5Proof'].location.x=99`);
 await execute('txn-restore',`import json\nr=json.loads(K.dsh_txn_api['restore']('blender5-before'))\nassert r['ok'], r\nassert abs(bpy.data.objects['Blender5Proof'].location.x-1)<1e-5\nprint('HEADLESS '+json.dumps(r))`);
 await execute('save-export',`import bpy\nbpy.ops.wm.save_as_mainfile(filepath=${JSON.stringify(scene)})\nbpy.ops.export_scene.gltf(filepath=${JSON.stringify(glb)},export_format='GLB')`);
 assert.equal(fs.readFileSync(glb).subarray(0,4).toString(),'glTF');
 for (const type of ['blend','glb']) {
  const verify=path.join(root,`tmp/mvp-blender5/verify-${type}.py`);
  fs.writeFileSync(verify,`import bpy,json\nfrom mathutils import Vector\n${type==='blend'?`bpy.ops.wm.open_mainfile(filepath=${JSON.stringify(scene)})`:`bpy.ops.wm.read_factory_settings(use_empty=True)\nbpy.ops.import_scene.gltf(filepath=${JSON.stringify(glb)})`}\no=bpy.data.objects['Blender5Proof']\ncoords=[o.matrix_world @ Vector(v) for v in o.bound_box]\nbounds=[[min(v[i] for v in coords),max(v[i] for v in coords)] for i in range(3)]\nexpected=[[0,2],[0,4],[0,3]]\nassert all(abs(a-b)<1e-5 for row,e in zip(bounds,expected) for a,b in zip(row,e)),bounds\nresult={'ok':True,'blender':bpy.app.version_string,'type':${JSON.stringify(type)},'object':o.name,'bounds':bounds,'vertices':len(o.data.vertices)}\nopen(${JSON.stringify(path.join(out,`independent-${type}.json`))},'w',encoding='utf8').write(json.dumps(result,indent=2))\nprint('INDEPENDENT '+json.dumps(result))\n`);
  const p=spawnSync(blender,['-b','--factory-startup','--python-exit-code','1','--python',verify],{encoding:'utf8',windowsHide:true,timeout:120000});fs.writeFileSync(path.join(out,`independent-${type}.stdout.txt`),p.stdout||'');fs.writeFileSync(path.join(out,`independent-${type}.stderr.txt`),p.stderr||'');assert.equal(p.status,0,p.stderr+p.stdout);
 }
} finally {
 await client.close();
 for(let n=0;n<100&&await portOccupied(44877);n++)await new Promise(r=>setTimeout(r,50));
 assert.equal(await portOccupied(44877),false);assert.equal(await portOccupied(44879),false);
 if(backendPid)assert.throws(()=>process.kill(backendPid,0));if(workerPid)assert.throws(()=>process.kill(workerPid,0));
 fs.writeFileSync(path.join(out,'cleanup.json'),JSON.stringify({backendPid,workerPid,httpPortReleased:!await portOccupied(44877),workerPortReleased:!await portOccupied(44879),backgroundChildrenStopped:true},null,2));
}
fs.writeFileSync(path.join(out,'mcp-result.json'),JSON.stringify({ok:true,version:'5.0.1',calls:log.length,nativeImage:true,independentBlend:true,independentGlb:true,txnRestore:true,errorRecovery:true,incrementalPreloadSamePid:true},null,2));
console.log('BLENDER5 MCP PASS');


