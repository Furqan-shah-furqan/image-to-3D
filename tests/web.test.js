import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateScene} from '../lib/scene-spec.js';
import {examples} from '../src/examples.js';
import {buildModel} from '../src/model.js';
import {availableModels,resolveModel,extractJson,imagePart,googleRequest,requestKey,generateContent} from '../lib/gemini.js';
import generate from '../api/generate.js';
import models from '../api/models.js';
import review from '../api/review.js';
import {referenceParts} from '../lib/references.js';

test('every example validates and builds actual Three.js geometry',()=>{
  for(const spec of Object.values(examples)){
    validateScene(spec);const viewer=buildModel(spec);assert.equal(viewer.nodes.size,spec.components.length);
    for(const mesh of viewer.nodes.values())assert.ok(mesh.geometry.attributes.position.count>0);
  }
});
test('folded organic surfaces build deterministic, exportable geometry and colour attributes',()=>{
  const spec=structuredClone(examples.chair);
  const material=spec.materials.find(m=>m.id===spec.components[0].material);material.surface={amount:.3,scale:12,seed:42};
  spec.components[0]={...spec.components[0],primitive:'patch',params:[1,1,.08,8,.05],deform:{amplitude:.01,frequency:8,seed:7}};
  validateScene(spec);const first=buildModel(spec),second=buildModel(spec),geometry=first.nodes.get(spec.components[0].id).geometry;
  assert.equal(geometry.attributes.position.count,1681);
  assert.ok([...geometry.attributes.position.array].every(Number.isFinite));
  assert.deepEqual(geometry.attributes.position.array,second.nodes.get(spec.components[0].id).geometry.attributes.position.array);
  const colors=geometry.attributes.color.array;assert.ok(colors.some(n=>n<1));assert.ok(colors.every(n=>n>=.7 && n<=1));
  spec.components[0].deform.amplitude=20;assert.throws(()=>validateScene(spec),/deformation/);
  spec.components[0].deform.amplitude=.01;material.surface.amount=2;assert.throws(()=>validateScene(spec),/surface/);
});
test('additional references are labelled and bounded before reaching the provider',()=>{
  const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9ksAAAAASUVORK5CYII=';
  assert.equal(referenceParts({image,extraImages:[image,image]}).filter(p=>p.inlineData).length,3);
  assert.throws(()=>referenceParts({image,extraImages:[image,image,image,image]}),/three additional/);
  assert.throws(()=>referenceParts({image,extraImages:['invalid']}),/valid additional/);
  assert.throws(()=>referenceParts({image,prompt:'x'.repeat(4000001)}),/too large/);
});
test('rejects executable geometry, missing materials, cycles and excessive allocations',()=>{
  const invalid=change=>{const spec=structuredClone(examples.chair);change(spec);assert.throws(()=>validateScene(spec),/Invalid scene/);};
  invalid(s=>s.components[0].primitive='eval');invalid(s=>s.components[0].material='missing');
  invalid(s=>s.components[0].parentId=s.components[0].id);invalid(s=>s.components[0].position=[Infinity,0,0]);
  invalid(s=>s.components[0].params=[0,0,0,0]);invalid(s=>s.components[0].scale=[0,1,1]);
  invalid(s=>s.components=Array.from({length:241},()=>s.components[0]));
});
test('accepts curved and custom geometry, rejects unsafe index buffers',()=>{
  const spec=structuredClone(examples.lamp);spec.components.push({id:'mesh',name:'Triangle',material:'cap',primitive:'mesh',params:[],position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],points:[[0,0,0],[1,0,0],[0,1,0]],indices:[0,1,2]});
  validateScene(spec);assert.equal(buildModel(spec).nodes.get('mesh').geometry.index.count,3);
  spec.components.at(-1).indices=[0,1,300];assert.throws(()=>validateScene(spec),/index range/);
});
test('model selection discovers supported models and prefers stable full Flash',async()=>{
  const fetcher=async()=>({ok:true,json:async()=>({models:[{name:'models/gemini-2.5-flash',displayName:'Flash',supportedGenerationMethods:['generateContent']},{name:'models/gemini-2.5-pro',supportedGenerationMethods:['generateContent']},{name:'models/gemini-3.0-flash-image',supportedGenerationMethods:['generateContent']}]})});
  assert.equal((await availableModels('key',fetcher)).length,2);assert.equal(await resolveModel('key','auto',fetcher),'gemini-2.5-flash');
  await assert.rejects(()=>resolveModel('key','../../evil'),/Invalid Gemini model/);
});
test('API errors redact secrets; truncated and invalid model output fail clearly',async()=>{
  const secret='private-test-key';
  await assert.rejects(()=>googleRequest('models',secret,null,200,async()=>({ok:false,status:400,json:async()=>({error:{message:`bad ${secret}`}})})),e=>!e.message.includes(secret));
  assert.throws(()=>extractJson({candidates:[{finishReason:'MAX_TOKENS'}]}),/output space/);
  assert.throws(()=>extractJson({candidates:[{content:{parts:[{text:'{"x":'}]}}]}),/incomplete/);
  assert.throws(()=>imagePart('data:image/png;base64,dGhpcyBpcyBub3QgYW4gaW1hZ2U='),/file type/);
});
test('Auto retries an overloaded model then falls back to an available Flash Lite',async()=>{
  const calls=[],delays=[];
  const fetcher=async(url,options)=>{
    if(!options.body)return {ok:true,json:async()=>({models:['gemini-3.8-flash','gemini-3.5-flash-lite'].map(id=>({name:`models/${id}`,supportedGenerationMethods:['generateContent']}))})};
    calls.push(url);assert.equal(JSON.parse(options.body).contents[0].parts[0].text,'same request');
    return calls.length<3?{ok:false,status:503,json:async()=>({error:{message:'High demand'}})}:{ok:true,json:async()=>({candidates:[]})};
  };
  const result=await generateContent('synthetic-key','auto',{contents:[{parts:[{text:'same request'}]}]},10000,fetcher,async ms=>delays.push(ms));
  assert.equal(result.model,'gemini-3.5-flash-lite');assert.equal(calls.length,3);
  assert.ok(calls[0].includes('gemini-3.8-flash'));assert.equal(calls[0],calls[1]);assert.equal(delays.length,2);
});
test('explicit models stay selected; retries are bounded and client errors are not retried',async()=>{
  for(const status of [400,401,403,429,503]){
    let calls=0;const fetcher=async url=>{calls++;assert.ok(url.includes('gemini-chosen:generateContent'));return {ok:false,status,json:async()=>({error:{message:'Provider error'}})};};
    await assert.rejects(()=>generateContent('synthetic-key','gemini-chosen',{},10000,fetcher,async()=>{}),e=>e.providerStatus===status);
    assert.equal(calls,status===503?3:1);
  }
});
function response(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(data){this.data=data;return this;}};}
test('accepts opaque dotted API keys and rejects whitespace or control characters',()=>{
  const key='AQ.synthetic-test-key_1234567890';
  assert.equal(requestKey({headers:{authorization:`Bearer ${key}`}}),key);
  for(const invalid of ['', 'short', 'synthetic key with spaces', 'synthetic-key-with\r\nnewline', 'x'.repeat(513)]){
    assert.throws(()=>requestKey({headers:{authorization:`Bearer ${invalid}`}}),/valid Gemini API key/);
  }
});
test('all API endpoints reject missing keys and GET before touching Google',async()=>{
  for(const handler of [generate,models,review]){const res=response();await handler({method:'POST',headers:{},body:{}},res);assert.equal(res.statusCode,401);const get=response();await handler({method:'GET',headers:{}},get);assert.equal(get.statusCode,405);}
});
test('generation route sends image and upstream-inspired schema, validates result (mock provider contract)',async()=>{
  const original=globalThis.fetch;let requested;
  globalThis.fetch=async(url,options)=>{requested={url,payload:JSON.parse(options.body),headers:options.headers};return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(examples.chair)}]},finishReason:'STOP'}]})};};
  try{
    const res=response();await generate({method:'POST',headers:{authorization:'Bearer test-key-long-enough-123'},body:{image:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9ksAAAAASUVORK5CYII=',model:'gemini-2.5-flash',detail:'balanced',prompt:'Match chair'}},res);
    assert.equal(res.statusCode,200);assert.equal(res.data.spec.title,'Studio chair');assert.ok(requested.payload.systemInstruction.parts[0].text.includes('Image Analysis Protocol'));assert.equal(requested.payload.generationConfig.responseMimeType,'application/json');assert.ok(requested.payload.contents[0].parts.some(p=>p.inlineData));
  }finally{globalThis.fetch=original;}
});

test('TRELLIS keeps its latent session through generation and texture extraction',async()=>{
  const {generateMesh}=await import('../src/trellis.js');const calls=[];let closed=false;
  const client={submit(endpoint,payload){calls.push({endpoint,payload});return {async *[Symbol.asyncIterator](){yield {type:'data',data:endpoint==='/preprocess_image'?[{path:'prepared',url:'https://microsoft-trellis-2.hf.space/prepared'}]:endpoint==='/extract_glb'?[{url:'https://microsoft-trellis-2.hf.space/model.glb'}]:[]};},cancel:async()=>{},close_stream(){}};},close(){closed=true;}};
  const bytes=new Uint8Array([1,2,3]).buffer;
  const result=await generateMesh({image:new Blob(['image']),token:'hf_test',detail:'detailed',connect:async(_,options)=>{assert.equal(options.hf_token,'hf_test');return client;},file:b=>b,fetcher:async()=>({ok:true,headers:new Headers(),arrayBuffer:async()=>bytes})});
  assert.deepEqual(calls.map(x=>x.endpoint),['/start_session','/preprocess_image','/image_to_3d','/extract_glb']);assert.equal(calls[2].payload[2],'1536');assert.deepEqual(calls[3].payload,[500000,4096]);assert.equal(result,bytes);assert.ok(closed);
});
test('GLB import rejects external resources before loader network requests',async()=>{
  const {validateGLB}=await import('../src/mesh.js');
  function glb(json){const text=JSON.stringify(json);const size=Math.ceil(text.length/4)*4,b=new ArrayBuffer(20+size),v=new DataView(b);v.setUint32(0,0x46546c67,true);v.setUint32(4,2,true);v.setUint32(8,b.byteLength,true);v.setUint32(12,size,true);v.setUint32(16,0x4e4f534a,true);new Uint8Array(b,20).fill(32);new Uint8Array(b,20,text.length).set(new TextEncoder().encode(text));return b;}
  assert.throws(()=>validateGLB(glb({images:[{uri:'https://example.com/texture.png'}]})),/embedded textures/);
  assert.throws(()=>validateGLB(glb({extensionsRequired:['KHR_draco_mesh_compression']})),/unsupported compression/);
  assert.throws(()=>validateGLB(new ArrayBuffer(30)),/valid GLB/);
  assert.equal(validateGLB(glb({asset:{version:'2.0'}})).asset.version,'2.0');
});

test('organic deformation keeps shared cap edges closed and UV seam normals continuous',async()=>{
  const THREE=await import('three');const {applySurface}=await import('../src/surface.js');
  for(const geometry of [new THREE.CylinderGeometry(1,1,2,48,8),new THREE.SphereGeometry(1,48,32)]){
    const p=geometry.attributes.position,groups=new Map();
    for(let i=0;i<p.count;i++){const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e6)).join(',');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);}
    const oldNormals=geometry.attributes.normal.array.slice();applySurface(geometry,{amplitude:.12,frequency:7,seed:3});
    for(const indices of groups.values())for(const j of indices){const i=indices[0];for(let axis=0;axis<3;axis++)assert.equal(p.array[i*3+axis],p.array[j*3+axis],'shared positions must remain identical');
      const dot=oldNormals[i*3]*oldNormals[j*3]+oldNormals[i*3+1]*oldNormals[j*3+1]+oldNormals[i*3+2]*oldNormals[j*3+2];
      if(dot>.999)for(let axis=0;axis<3;axis++)assert.ok(Math.abs(geometry.attributes.normal.array[i*3+axis]-geometry.attributes.normal.array[j*3+axis])<1e-5,'smooth UV seam normals');
    }
    assert.ok([...geometry.attributes.normal.array].every(Number.isFinite));
  }
});
test('textured cylinder has interior surface samples instead of only top and bottom rings',()=>{
  const spec=structuredClone(examples.lamp);const c=spec.components[0];c.primitive='cylinder';c.params=[1,1,2];c.deform={amplitude:.03,frequency:8,seed:2};
  const mesh=buildModel(spec).nodes.get(c.id),p=mesh.geometry.attributes.position;
  assert.ok(Array.from({length:p.count},(_,i)=>p.getY(i)).filter(y=>Math.abs(y)<.7).length>500);
});
test('texture quality preserves PBR maps, pixels, color spaces and UV transforms',async()=>{
  const THREE=await import('three');const {configureTextureQuality}=await import('../src/mesh.js');
  const map=new THREE.DataTexture(new Uint8Array([12,34,56,255]),1,1);map.colorSpace=THREE.SRGBColorSpace;map.offset.set(.2,.3);const normal=new THREE.Texture();
  const material=new THREE.MeshStandardMaterial({map,normalMap:normal,roughness:.31,metalness:.2});const pixels=map.image.data.slice();
  assert.equal(configureTextureQuality({materials:new Map([['m',material]])},16),2);assert.equal(map.anisotropy,8);assert.equal(normal.anisotropy,8);assert.equal(normal.colorSpace,THREE.NoColorSpace);assert.equal(map.colorSpace,THREE.SRGBColorSpace);assert.deepEqual(map.image.data,pixels);assert.equal(map.offset.x,.2);assert.equal(material.roughness,.31);
});
test('review cameras fit every corner and do not depend on interactive camera position',async()=>{
  const THREE=await import('three');const {reviewCamera,REVIEW_VIEWS}=await import('../src/review-render.js');
  for(const dimensions of [[1,8,1],[8,1,1],[1,1,8]]){const root=new THREE.Mesh(new THREE.BoxGeometry(...dimensions));root.position.set(2,5,-3);const box=new THREE.Box3().setFromObject(root);
    for(const [,direction] of REVIEW_VIEWS){const camera=reviewCamera(root,direction);for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const projected=new THREE.Vector3(x,y,z).project(camera);assert.ok(Math.abs(projected.x)<1&&Math.abs(projected.y)<1&&Math.abs(projected.z)<1);}}
  }
});
test('review capture restores renderer and leaves model materials untouched, even on error',async()=>{
  const THREE=await import('three');const {captureReview}=await import('../src/review-render.js');
  const material=new THREE.MeshStandardMaterial({wireframe:true}),root=new THREE.Mesh(new THREE.BoxGeometry(),material);root.visible=false;
  const size=new THREE.Vector2(700,400);let ratio=2,renders=0;
  const renderer={toneMappingExposure:1.7,domElement:{},getSize:v=>v.copy(size),getPixelRatio:()=>ratio,setPixelRatio:v=>ratio=v,setSize:(x,y)=>size.set(x,y),render(scene){renders++;const clone=scene.children[0];assert.ok(clone.visible);assert.equal(clone.material.wireframe,false);}};
  const canvas=()=>({getContext:()=>({fillRect(){},drawImage(){},fillText(){}}),toDataURL:()=> 'data:image/jpeg;base64,fixture'});
  assert.equal(captureReview(renderer,root,null,canvas),'data:image/jpeg;base64,fixture');assert.equal(renders,4);assert.equal(ratio,2);assert.deepEqual(size.toArray(),[700,400]);assert.equal(renderer.toneMappingExposure,1.7);assert.equal(root.visible,false);assert.ok(material.wireframe);
  renderer.render=()=>{throw new Error('GPU failure');};assert.throws(()=>captureReview(renderer,root,null,canvas),/GPU failure/);assert.equal(ratio,2);assert.deepEqual(size.toArray(),[700,400]);assert.equal(renderer.toneMappingExposure,1.7);
});

test('extruded outlines preserve real holes rather than covering openings',async()=>{
  const THREE=await import('three');const spec=structuredClone(examples.chair);const c=spec.components[0];
  c.primitive='extrude';c.params=[.2,0];c.points=[[-1,-1,0],[1,-1,0],[1,1,0],[-1,1,0]];c.holes=[{points:[[-.4,-.4,0],[-.4,.4,0],[.4,.4,0],[.4,-.4,0]]}];c.position=[0,0,0];c.rotation=[0,0,0];c.scale=[1,1,1];delete c.parentId;
  validateScene(spec);const mesh=buildModel(spec).nodes.get(c.id);mesh.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(new THREE.Vector3(0,0,2),new THREE.Vector3(0,0,-1));assert.equal(ray.intersectObject(mesh,false).length,0,'opening must be empty');
  ray.ray.origin.x=.8;assert.ok(ray.intersectObject(mesh,false).length>0,'frame wall must remain solid');
  c.holes[0].points=[];assert.throws(()=>validateScene(spec),/hole outline/);
});
test('material microstructure produces repeatable linear normal and roughness maps',async()=>{
  const THREE=await import('three');const {materialDetail}=await import('../src/material-detail.js');
  const a=materialDetail({kind:'wood',scale:4,strength:.3},.6),b=materialDetail({kind:'wood',scale:4,strength:.3},.6);
  assert.deepEqual(a.normalMap.image.data,b.normalMap.image.data);assert.equal(a.normalMap.colorSpace,THREE.NoColorSpace);assert.equal(a.roughnessMap.colorSpace,THREE.NoColorSpace);assert.equal(a.normalMap.wrapS,THREE.RepeatWrapping);assert.equal(a.normalMap.repeat.x,4);
  assert.ok(a.normalMap.image.data.some((v,i)=>i%4===0&&v!==128));assert.ok(a.roughnessMap.image.data.some((v,i)=>i%4===1&&v<255));assert.deepEqual(materialDetail(null,.6),{});
});

test('TRELLIS default connection preserves the Gradio Client class binding',async()=>{
  const {Client}=await import('@gradio/client');const {generateMesh}=await import('../src/trellis.js');const original=Client.connect;let connected=false;
  Client.connect=async function(){assert.equal(this,Client);connected=true;throw new Error('fixture stops before network');};
  try{await assert.rejects(()=>generateMesh({image:new Blob(['fixture'])}),/fixture stops before network/);assert.ok(connected);}finally{Client.connect=original;}
});
