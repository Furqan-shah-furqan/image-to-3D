import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateScene} from '../lib/scene-spec.js';
import {examples} from '../src/examples.js';
import {buildModel} from '../src/model.js';
import {availableModels,resolveModel,extractJson,imagePart,googleRequest} from '../lib/gemini.js';
import generate from '../api/generate.js';
import models from '../api/models.js';
import review from '../api/review.js';

test('every example validates and builds actual Three.js geometry',()=>{
  for(const spec of Object.values(examples)){
    validateScene(spec);const viewer=buildModel(spec);assert.equal(viewer.nodes.size,spec.components.length);
    for(const mesh of viewer.nodes.values())assert.ok(mesh.geometry.attributes.position.count>0);
  }
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
function response(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(data){this.data=data;return this;}};}
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
