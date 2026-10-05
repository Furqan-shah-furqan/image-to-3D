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
