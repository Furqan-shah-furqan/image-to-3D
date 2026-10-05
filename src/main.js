import './style.css';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {createIcons,Box,KeyRound,Github,Scan,ImagePlus,RefreshCw,X,Sparkles,ArrowUpRight,ArrowRight,Info,ScanEye,Columns2,Camera,Maximize,MousePointer2,Minus,Plus,SlidersHorizontal,Diamond,WandSparkles,Download,ShieldCheck,PlugZap,Eye,Layers3,Circle} from 'lucide';
import {generateMesh} from './trellis.js';
import {loadMesh} from './mesh.js';
import {buildModel} from './model.js';
import modelSource from './model.js?raw';
import surfaceSource from './surface.js?raw';
import {examples} from './examples.js';
import {validateScene} from '../lib/scene-spec.js';

const icons={Box,KeyRound,Github,Scan,ImagePlus,RefreshCw,X,Sparkles,ArrowUpRight,ArrowRight,Info,ScanEye,Columns2,Camera,Maximize,MousePointer2,Minus,Plus,SlidersHorizontal,Diamond,WandSparkles,Download,ShieldCheck,PlugZap,Eye,Layers3,Circle};
const refreshIcons=()=>createIcons({icons});
const $=id=>document.getElementById(id);
refreshIcons();
const state={key:'',model:'auto',image:null,file:null,detail:'balanced',spec:null,viewer:null,selectedMaterial:null,generated:false,busy:false,controller:null,frameDistance:5};
try{state.key=sessionStorage.getItem('forma-key') || '';state.model=sessionStorage.getItem('forma-model') || 'auto';}catch{}
let toastTimer;
function toast(message,error=false){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.toggle('error',error);$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,error?15000:5500);}
function updateKeyUI(){const mesh=$('generation-engine').value==='trellis',connected=mesh?state.hfToken:state.key;$('key-label').textContent=connected?(mesh?'HF token saved':'API key connected'):(mesh?'Add HF token':'Add API key');$('key-dot').style.display=connected?'block':'none';}
updateKeyUI();
function openKey(){ $('api-key').value=state.key;$('key-error').textContent='';$('key-dialog').showModal(); }
$('key-button').onclick=openKey;
document.querySelectorAll('.close-dialog').forEach(button=>button.onclick=()=>button.closest('dialog').close());
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)dialog.close();}}));
$('show-key').onclick=()=>{$('api-key').type=$('api-key').type==='password'?'text':'password';};
async function api(path,body,key=state.key,signal){
  const response=await fetch(`/api/${path}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify(body),signal:signal || AbortSignal.timeout(270000)});
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(data?.error || (response.status===504?'Generation timed out. Try Draft detail.':`Request failed (${response.status}). Please try again.`));
  if(!data)throw new Error('The server returned an unexpected response. Please try again.');
  return data;
}
$('key-form').onsubmit=async event=>{
  event.preventDefault();const key=$('api-key').value.trim();$('save-key').disabled=true;$('key-error').textContent='Connecting to Google…';
  try{
    const data=await api('models',{},key);
    const select=$('model-select');select.replaceChildren(new Option('Auto · available Gemini Flash model','auto'));
    for(const model of data.models)select.add(new Option(model.name,model.id));
    state.key=key;state.model=data.models.some(m=>m.id===state.model)?state.model:'auto';select.value=state.model;
    try{sessionStorage.setItem('forma-key',key);sessionStorage.setItem('forma-model',state.model);}catch{}
    $('key-error').textContent='Connected. You can choose a model below or close this window.';updateKeyUI();toast('Gemini connected. Choose a model or upload your reference.');
  }catch(error){$('key-error').textContent=error.message;}finally{$('save-key').disabled=false;}
};
$('model-select').onchange=()=>{state.model=$('model-select').value;try{sessionStorage.setItem('forma-model',state.model);}catch{}};
$('disconnect-key').onclick=()=>{state.key='';state.model='auto';try{sessionStorage.removeItem('forma-key');sessionStorage.removeItem('forma-model');}catch{}$('api-key').value='';$('key-dialog').close();updateKeyUI();toast('API key removed from this tab.');};

const canvas=$('scene-canvas');let renderer,scene,camera,controls,ground,grid,keyLight,fillLight,renderUnavailable=false;
try{
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
  scene=new THREE.Scene();scene.background=new THREE.Color('#f6f5f2');
  const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();
  scene.environment=pmrem.fromScene(room,.04).texture;room.dispose();pmrem.dispose();
  camera=new THREE.PerspectiveCamera(38,1,.01,100);camera.position.set(4,3.2,5);
  controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.07;controls.autoRotateSpeed=1.5;controls.minDistance=.5;controls.maxDistance=25;controls.maxPolarAngle=Math.PI*.51;controls.target.set(0,1.1,0);
  scene.add(new THREE.HemisphereLight('#fff9ee','#92816a',2));
  keyLight=new THREE.DirectionalLight('#fff8ed',3.5);keyLight.position.set(3,6,4);keyLight.castShadow=true;keyLight.shadow.mapSize.set(2048,2048);keyLight.shadow.camera.left=-5;keyLight.shadow.camera.right=5;keyLight.shadow.camera.top=5;keyLight.shadow.camera.bottom=-5;keyLight.shadow.normalBias=.03;scene.add(keyLight);
  fillLight=new THREE.DirectionalLight('#ecf0ff',1.3);fillLight.position.set(-3,3,-2);scene.add(fillLight);
  ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.009;ground.receiveShadow=true;scene.add(ground);
  grid=new THREE.GridHelper(16,40,'#d6dbd0','#e1e5db');grid.material.transparent=true;grid.material.opacity=.28;grid.position.y=-.015;scene.add(grid);
  const resize=()=>{const {width,height}=$('render-pane').getBoundingClientRect();if(width<1||height<1)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();};
  new ResizeObserver(resize).observe($('render-pane'));resize();
  renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);const percent=Math.round(state.frameDistance/controls.getDistance()*100);$('zoom-level').textContent=`${percent}%`;});
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();toast('3D graphics context lost. Reload this page to restore the viewer.',true);});
}catch{renderUnavailable=true;$('model-status').textContent='WebGL unavailable';toast('Your browser cannot start the 3D viewer. Enable hardware acceleration or use a WebGL-capable browser.',true);}
function disposeModel(viewer){if(!viewer)return;const textures=new Set();viewer.root.traverse(node=>node.geometry?.dispose());viewer.materials.forEach(m=>{for(const v of Object.values(m))if(v?.isTexture)textures.add(v);m.dispose();});textures.forEach(t=>{t.source?.data?.close?.();t.dispose();});}
function frameModel(front=false){
  if(!state.viewer||!camera)return;
  const bounds=new THREE.Box3().setFromObject(state.viewer.root),size=bounds.getSize(new THREE.Vector3());
  const vertical=size.y/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))),horizontal=Math.max(size.x,size.z)/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect);
  const distance=Math.max(vertical,horizontal)*1.65;
  const center=new THREE.Vector3(0,size.y*.6,0);controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(front?0:1.1,front?0:.7,1.5).normalize().multiplyScalar(distance));
  state.frameDistance=distance;controls.update();
}
function selectMaterial(id){
  state.selectedMaterial=id;const m=state.spec.materials.find(m=>m.id===id);if(!m)return;
  $('material-color').value=m.color;$('roughness').value=m.roughness;$('metalness').value=m.metalness;$('roughness-value').textContent=m.roughness.toFixed(2);$('metalness-value').textContent=m.metalness.toFixed(2);$('selected-material-name').textContent=m.name;
  document.querySelectorAll('.material-swatch').forEach(b=>b.classList.toggle('active',b.dataset.material===id));
}
function refreshMaterials(){
  const holder=$('material-swatches');holder.replaceChildren();
  for(const m of state.spec.materials){const button=document.createElement('button');button.className='material-swatch';button.dataset.material=m.id;button.title=m.name;button.setAttribute('aria-label',`Edit ${m.name}`);const swatch=document.createElement('span');swatch.style.setProperty('--swatch',m.color);button.append(swatch);button.onclick=()=>selectMaterial(m.id);holder.append(button);}
  $('material-count').textContent=state.spec.materials.length;selectMaterial(state.spec.materials[0].id);
}
function refreshScene(){
  $('scene-count').textContent=`${state.spec.components.length} components`;const list=$('scene-list');list.replaceChildren();
  for(const c of state.spec.components){const row=document.createElement('div');row.className='scene-item';const icon=document.createElement('i');icon.dataset.lucide='box';const name=document.createElement('span');name.textContent=c.name;const input=document.createElement('input');input.type='checkbox';input.checked=state.viewer?.nodes.get(c.id)?.visible ?? true;input.setAttribute('aria-label',`Show ${c.name}`);input.onchange=()=>{state.viewer?.nodes.get(c.id) && (state.viewer.nodes.get(c.id).visible=input.checked);};row.append(icon,name,input);row.onclick=event=>{if(event.target!==input){selectMaterial(c.material);list.querySelectorAll('.scene-item').forEach(n=>n.classList.toggle('active',n===row));}};list.append(row);}
  refreshIcons();
}
function showSpec(spec,generated=false){
  validateScene(spec);let viewer;
  if(!renderUnavailable){
    viewer=buildModel(spec);
    const box=new THREE.Box3().setFromObject(viewer.root),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
    const factor=2.8/Math.max(size.x,size.y,size.z,.001);viewer.root.scale.setScalar(factor);viewer.root.position.set(-center.x*factor,-box.min.y*factor,-center.z*factor);
    if(state.viewer){scene.remove(state.viewer.root);disposeModel(state.viewer);}scene.add(viewer.root);
  }
  state.meshBuffer=null;state.assetKind='procedural';assetExportOptions(false);state.spec=spec;state.viewer=viewer;state.generated=generated;
  if(viewer){viewer.materials.forEach(m=>m.wireframe=$('wireframe-toggle').checked);frameModel();}
  $('model-title').textContent=spec.title;$('model-notes').textContent=spec.description;$('model-source').textContent=generated?'Gemini':'Example';
  $('demo-badge').textContent=generated?'Generated model · approximate':`Example model · ${spec.title}`;
  $('intro-copy').hidden=generated;$('refine-button').disabled=!generated||!state.image||state.busy||renderUnavailable;
  let triangles=0;viewer?.root.traverse(n=>{if(n.geometry)triangles+=(n.geometry.index?.count||n.geometry.attributes.position?.count||0)/3;});
  $('polygon-count').textContent=`${Math.round(triangles).toLocaleString()} triangles`;
  refreshMaterials();refreshScene();$('model-status').textContent=renderUnavailable?'WebGL unavailable':generated?'Model ready':'Ready to explore';
  if(generated)document.querySelectorAll('.example-card').forEach(b=>b.classList.remove('active'));
}
function assetExportOptions(mesh){$('model-format').textContent=mesh?'Textured GLB':'Procedural 3D';for(const option of $('export-format').options)option.disabled=mesh&&option.value!=='glb';if(mesh)$('export-format').value='glb';}
async function showMesh(buffer,title,source='Imported GLB'){
  const viewer=await loadMesh(buffer,title);const box=new THREE.Box3().setFromObject(viewer.root),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  const factor=2.8/Math.max(size.x,size.y,size.z,.001);viewer.root.scale.setScalar(factor);viewer.root.position.set(-center.x*factor,-box.min.y*factor,-center.z*factor);
  if(state.viewer){scene?.remove(state.viewer.root);disposeModel(state.viewer);}scene?.add(viewer.root);
  state.meshBuffer=buffer;state.viewer=viewer;state.spec=viewer.spec;state.assetKind='mesh';state.generated=true;assetExportOptions(true);
  viewer.materials.forEach(m=>m.wireframe=$('wireframe-toggle').checked);frameModel();refreshMaterials();refreshScene();
  $('model-title').textContent=title;$('model-source').textContent=source;$('model-notes').textContent=viewer.spec.description;
  $('intro-copy').hidden=true;$('demo-badge').textContent='Textured mesh · embedded textures';$('refine-button').disabled=true;
  let triangles=0;viewer.root.traverse(n=>{if(n.geometry)triangles+=(n.geometry.index?.count||n.geometry.attributes.position.count)/3;});$('polygon-count').textContent=`${Math.round(triangles).toLocaleString()} triangles`;
  $('model-status').textContent=renderUnavailable?'Model loaded · WebGL unavailable':'Textured model ready';$('export-button').disabled=false;
}
showSpec(structuredClone(examples.chair));

function updateMaterial(property,value){if(!state.viewer)return;const m=state.spec.materials.find(m=>m.id===state.selectedMaterial);m[property]=value;const material=state.viewer.materials.get(m.id);if(property==='color'){material.color.set(value);document.querySelector(`.material-swatch.active span`)?.style.setProperty('--swatch',value);}else{material[property]=value;$(property+'-value').textContent=value.toFixed(2);}material.needsUpdate=true;}
$('material-color').oninput=()=>updateMaterial('color',$('material-color').value);
$('roughness').oninput=()=>updateMaterial('roughness',Number($('roughness').value));$('metalness').oninput=()=>updateMaterial('metalness',Number($('metalness').value));
function background(color){if(!scene)return;scene.background.set(color);$('render-pane').style.background=color;$('viewport').style.background=color;document.querySelectorAll('.background-swatch').forEach(b=>b.classList.toggle('active',b.dataset.bg===color));}
document.querySelectorAll('[data-bg]').forEach(b=>b.onclick=()=>background(b.dataset.bg));$('background-color').oninput=()=>background($('background-color').value);
$('light-intensity').oninput=()=>{const v=Number($('light-intensity').value);if(keyLight){keyLight.intensity=3.5*v;fillLight.intensity=1.3*v;}$('light-value').textContent=`${Math.round(v*100)}%`;};
$('grid-toggle').onchange=()=>{if(grid)grid.visible=$('grid-toggle').checked;};$('rotate-toggle').onchange=()=>{if(controls)controls.autoRotate=$('rotate-toggle').checked;};
$('wireframe-toggle').onchange=()=>{state.viewer?.materials.forEach(m=>m.wireframe=$('wireframe-toggle').checked);};
document.querySelectorAll('[data-camera]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-camera]').forEach(n=>n.classList.toggle('active',n===b));if(!camera)return;frameModel(b.dataset.camera==='front');if(b.dataset.camera==='top'){camera.position.copy(controls.target).add(new THREE.Vector3(0,state.frameDistance,.001));controls.update();}});
$('reset-camera').onclick=()=>{frameModel();document.querySelectorAll('[data-camera]').forEach(b=>b.classList.toggle('active',b.dataset.camera==='perspective'));};
function zoom(factor){if(!camera)return;camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);controls.update();}
$('zoom-out').onclick=()=>zoom(1.2);$('zoom-in').onclick=()=>zoom(.8);
$('fullscreen-button').onclick=()=>{if(!document.fullscreenElement)$('viewport').requestFullscreen?.().catch(()=>toast('Fullscreen is unavailable in this browser.',true));else document.exitFullscreen?.();};
document.querySelectorAll('[data-left-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-left-tab]').forEach(n=>n.classList.toggle('active',n===b));$('reference-tab').hidden=b.dataset.leftTab!=='reference';$('scene-tab').hidden=b.dataset.leftTab!=='scene';});
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-view]').forEach(n=>n.classList.toggle('active',n===b));$('compare-reference').hidden=b.dataset.view!=='compare';$('intro-copy').hidden=state.generated||b.dataset.view==='compare';});
document.querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>{state.detail=b.dataset.detail;document.querySelectorAll('[data-detail]').forEach(n=>n.classList.toggle('active',n===b));});

async function compressedImage(file,maxEdge=1280,maxLength=2200000){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Please choose a JPG, PNG or WebP image.');
  if(file.size>20*1024*1024)throw new Error('Your image is larger than 20 MB. Choose a smaller file.');
  const image=await createImageBitmap(file).catch(()=>{throw new Error('This image could not be opened. Try another JPG or PNG.');});
  try{
    const c=document.createElement('canvas');const scale=Math.min(1,maxEdge/Math.max(image.width,image.height));c.width=Math.max(1,Math.round(image.width*scale));c.height=Math.max(1,Math.round(image.height*scale));
    const context=c.getContext('2d');context.fillStyle='#ffffff';context.fillRect(0,0,c.width,c.height);context.drawImage(image,0,0,c.width,c.height);
    const encoded=c.toDataURL('image/jpeg',.88);if(encoded.length>maxLength)throw new Error('This image is too detailed to upload. Resize it and try again.');return encoded;
  }finally{image.close();}
}
async function upload(file){if(state.busy)return toast('Finish or cancel the current generation first.',true);if(!file)return;try{state.image=await compressedImage(file);state.originalImage=file;state.file=file.name;$('reference-image').src=state.image;$('compare-image').src=state.image;$('reference-image').hidden=false;$('compare-image').hidden=false;$('compare-empty').hidden=true;$('upload-empty').hidden=true;$('replace-image').hidden=false;$('file-info').hidden=false;$('file-name').textContent=file.name;$('refine-button').disabled=state.assetKind==='mesh'||!state.generated||renderUnavailable;toast('Reference added. Ready when you are.');}catch(error){toast(error.message,true);}$('image-input').value='';}
$('image-input').onchange=()=>upload($('image-input').files[0]);
$('drop-zone').onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();$('image-input').click();}};
$('drop-zone').ondragover=event=>{event.preventDefault();$('drop-zone').classList.add('dragging');};$('drop-zone').ondragleave=()=>$('drop-zone').classList.remove('dragging');$('drop-zone').ondrop=event=>{event.preventDefault();$('drop-zone').classList.remove('dragging');upload(event.dataTransfer.files[0]);};
$('remove-image').onclick=()=>{if(state.busy)return;state.image=null;state.file=null;$('reference-image').hidden=true;$('reference-image').removeAttribute('src');$('compare-image').hidden=true;$('compare-image').removeAttribute('src');$('compare-empty').hidden=false;$('upload-empty').hidden=false;$('replace-image').hidden=true;$('file-info').hidden=true;$('refine-button').disabled=true;};
$('compare-image').hidden=true;
state.extraImages=[];
function renderAngles(){
  $('angle-list').replaceChildren();
  for(const [index,reference] of state.extraImages.entries()){
    const row=document.createElement('div'),image=document.createElement('img'),name=document.createElement('span'),remove=document.createElement('button');
    image.src=reference.image;image.alt=`Additional reference ${index+1}`;name.textContent=reference.name;remove.textContent='×';remove.className='icon-button';remove.setAttribute('aria-label',`Remove reference angle ${index+1}`);
    remove.onclick=()=>{if(state.busy)return;state.extraImages.splice(index,1);renderAngles();};row.append(image,name,remove);$('angle-list').append(row);
  }
}
$('add-angles').onclick=()=>{if(!state.busy)$('angle-input').click();};
$('angle-input').onchange=async()=>{
  if(state.busy)return;
  state.refsLoading=true;$('add-angles').disabled=true;
  try{for(const file of $('angle-input').files){if(state.extraImages.length>=3){toast('Use up to three additional angles.',true);break;}state.extraImages.push({name:file.name,image:await compressedImage(file,720,450000)});}renderAngles();}
  catch(error){renderAngles();toast(error.message,true);}finally{$('angle-input').value='';state.refsLoading=false;$('add-angles').disabled=state.busy;}
};
$('upload-shortcut').onclick=()=>{$('image-input').click();};

function captureRender(width=900,height=900){
  if(!renderer)throw new Error('The 3D viewer is unavailable.');
  const size=renderer.getSize(new THREE.Vector2()),pixelRatio=renderer.getPixelRatio(),aspect=camera.aspect;
  try{
    renderer.setPixelRatio(1);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();renderer.render(scene,camera);return canvas.toDataURL('image/jpeg',.88);
  }finally{renderer.setPixelRatio(pixelRatio);renderer.setSize(size.x,size.y,false);camera.aspect=aspect;camera.updateProjectionMatrix();renderer.render(scene,camera);}
}
let elapsedTimer,startTime;
function progress(title,description,percentage){$('progress-title').textContent=title;$('progress-detail').textContent=description;$('progress-bar').style.width=`${percentage}%`;}
function setBusy(busy){
  state.busy=busy;$('add-angles').disabled=busy;$('angle-input').disabled=busy;$('generation-overlay').hidden=!busy;$('generate-button').disabled=busy;$('generation-engine').disabled=busy;$('import-glb').disabled=busy;$('refine-button').disabled=busy||state.assetKind==='mesh'||!state.generated||!state.image||renderUnavailable;$('cancel-button').hidden=!busy;$('image-input').disabled=busy;
  document.querySelectorAll('.example-card').forEach(b=>b.disabled=busy);$('export-button').disabled=busy||(renderUnavailable&&state.assetKind!=='mesh');
  clearInterval(elapsedTimer);if(busy){startTime=Date.now();$('elapsed').textContent='0s elapsed';elapsedTimer=setInterval(()=>$('elapsed').textContent=`${Math.floor((Date.now()-startTime)/1000)}s elapsed`,1000);}
}
function requestBody(prompt,current,render){return {image:state.image,extraImages:state.extraImages.map(r=>r.image),prompt,detail:state.detail,model:state.model,...(current?{current,render}:{})};}
async function generate(refinement){
  if(state.busy)return;
  if(!refinement && $('generation-engine').value==='trellis')return generateTextured();
  if(state.refsLoading)return toast('Wait for the reference angles to finish loading.',true);
  if(!state.key){openKey();return;}
  if(!state.image){toast('Upload a reference image first.',true);$('image-input').click();return;}
  if(renderUnavailable)return toast('A working WebGL viewer is required. Enable hardware acceleration.',true);
  const previous={spec:structuredClone(state.spec),generated:state.generated};
  if(state.assetKind==='mesh')previous.mesh=state.meshBuffer;
  state.controller=new AbortController();setBusy(true);
  try{
    progress(refinement?'Refining the details':'Reading your reference',refinement?'Matching your requested changes to the current model…':'Finding shapes, proportions and surface finishes…',20);
    const current=refinement?structuredClone(state.spec):null,render=current?captureRender():null;
    const basePrompt=refinement || $('prompt').value.trim();
    const initial=await api('generate',requestBody(basePrompt,current,render),state.key,state.controller.signal);
    if(state.controller.signal.aborted)throw new DOMException('Cancelled','AbortError');
    showSpec(initial.spec,true);$('model-source').textContent=initial.model.replace('gemini-','Gemini ');
    progress('Building your 3D scene','Creating geometry, applying materials and lighting…',65);
    if($('review-option').checked){
      let bestSpec=structuredClone(initial.spec),bestReview=null,bestModel=initial.model,candidateModel=initial.model;
      try{
        const maxPasses={draft:1,balanced:2,detailed:3}[state.detail];
        for(let pass=0;pass<=maxPasses;pass++){
          progress('Comparing the result',`Checking proportions and details · pass ${pass+1}…`,75);
          const {review}=await api('review',{image:state.image,extraImages:state.extraImages.map(r=>r.image),render:captureRender(),model:initial.model},state.key,state.controller.signal);
          if(bestReview && review.similarity<=bestReview.similarity){showSpec(bestSpec,true);$('model-source').textContent=bestModel.replace('gemini-','Gemini ');break;}
          bestSpec=structuredClone(state.spec);bestReview=review;bestModel=candidateModel;
          if(!review.needsRevision || !review.issues.length || pass===maxPasses)break;
          progress('Matching your reference',`Refining silhouette, proportions and surfaces · ${pass+1}/${maxPasses}…`,90);
          const revised=await api('generate',requestBody(`${basePrompt}\nImprove these specific issues: ${review.issues.join('; ')}`.slice(0,2000),state.spec,captureRender()),state.key,state.controller.signal);
          showSpec(revised.spec,true);candidateModel=revised.model;$('model-source').textContent=revised.model.replace('gemini-','Gemini ');
        }
        $('model-notes').textContent=`${bestReview.summary} AI similarity estimate: ${Math.round(bestReview.similarity)}% (not measured accuracy). ${bestReview.needsRevision?'Further refinement suggested. ':''}${state.spec.limitations.join(' ')}`;
      }catch(error){if(state.controller.signal.aborted)throw error;showSpec(bestSpec,true);$('model-source').textContent=bestModel.replace('gemini-','Gemini ');toast(`Model generated, but the optional visual refinement did not finish: ${error.message}`,true);$('model-notes').textContent=`${state.spec.description} Visual review incomplete. ${state.spec.limitations.join(' ')}`;}
    }else $('model-notes').textContent=`${state.spec.description} ${state.spec.limitations.join(' ')}`;
    $('model-status').textContent='Your model is ready';toast('Your 3D model is ready. Explore, refine or export it.');
  }catch(error){
    if(state.controller?.signal.aborted){if(previous.mesh)await showMesh(previous.mesh,previous.spec.title);else showSpec(previous.spec,previous.generated);toast('Generation cancelled. Your previous model was restored.');}
    else toast(error.message,true);
  }finally{setBusy(false);state.controller=null;}
}

state.hfToken='';try{state.hfToken=sessionStorage.getItem('forma-hf-token') || '';}catch{}
function engineUI(){updateKeyUI();const mesh=$('generation-engine').value==='trellis';$('trellis-options').hidden=!mesh;$('prompt').hidden=mesh;$('prompt').previousElementSibling.hidden=mesh;$('add-angles').hidden=mesh;$('angle-list').hidden=mesh;$('review-option').closest('label').hidden=mesh;}
$('generation-engine').onchange=engineUI;engineUI();
function hfSettings(){$('hf-token').value=state.hfToken;$('hf-dialog').showModal();}
$('hf-settings').onclick=hfSettings;
// The top-right key button opens settings for the selected generation engine.
$('key-button').onclick=()=>{$('generation-engine').value==='trellis'?hfSettings():openKey();};
$('hf-form').onsubmit=event=>{event.preventDefault();const token=$('hf-token').value.trim();if(token&&!/^hf_[A-Za-z0-9]+$/.test(token))return toast('Paste a Hugging Face token beginning with hf_.',true);state.hfToken=token;updateKeyUI();try{sessionStorage.setItem('forma-hf-token',token);}catch{}$('hf-dialog').close();toast(token?'Hugging Face token saved. The provider validates it during generation.':'Using anonymous Hugging Face access.');};
$('remove-hf-token').onclick=()=>{state.hfToken='';updateKeyUI();$('hf-token').value='';try{sessionStorage.removeItem('forma-hf-token');}catch{}$('hf-dialog').close();};
$('import-glb').onclick=()=>$('glb-input').click();
$('glb-input').onchange=async()=>{if(state.busy)return;const file=$('glb-input').files[0];if(!file)return;setBusy(true);$('cancel-button').hidden=true;try{if(file.size>100*1024*1024)throw new Error('Choose a GLB smaller than 100 MB.');progress('Opening your model','Loading geometry and embedded textures…',50);await showMesh(await file.arrayBuffer(),file.name.replace(/\.glb$/i,''));toast('Textured GLB imported. Preview or export your model.');}catch(error){toast(error.message,true);}finally{setBusy(false);$('glb-input').value='';}};
async function generateTextured(){
  if(!state.image)return toast('Upload a reference image first.',true);
  state.controller=new AbortController();setBusy(true);
  try{
    const buffer=await generateMesh({image:state.originalImage || state.image,token:state.hfToken,detail:state.detail,signal:state.controller.signal,onProgress:progress});
    state.controller.signal.throwIfAborted();await showMesh(buffer,state.file?.replace(/\.[^.]+$/,'') || 'Textured model','TRELLIS.2');toast('Textured model ready. Its textures are included in GLB export.');
  }catch(error){toast(state.controller.signal.aborted?'Generation cancelled. Your previous model is unchanged.':error.message,!state.controller.signal.aborted);}finally{setBusy(false);state.controller=null;}
}

$('generate-button').onclick=()=>generate();$('cancel-button').onclick=()=>state.controller?.abort();
$('refine-button').onclick=()=>{if(!state.key){openKey();return;}$('refine-dialog').showModal();};
$('refine-form').onsubmit=event=>{event.preventDefault();const prompt=$('refine-prompt').value.trim();if(!prompt)return;$('refine-dialog').close();generate(prompt);};
function download(data,name,type){const blob=data instanceof Blob?data:new Blob([data],{type});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
function filename(){return state.spec.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'model';}
$('export-button').onclick=async()=>{
  if(!state.viewer)return;try{
    const format=$('export-format').value,slug=filename();
    if(format==='json')download(JSON.stringify(state.spec,null,2),`${slug}.json`,'application/json');
    else if(format==='js')download(`${modelSource.replace("import {applySurface,foldedPatch} from './surface.js';",surfaceSource.replace("import * as THREE from 'three';",''))}\n\nexport const spec = ${JSON.stringify(state.spec,null,2)};\nexport default buildModel(spec).root;\n`,`${slug}.js`,'text/javascript');
    else{const result=await new GLTFExporter().parseAsync(state.viewer.root,{binary:true,onlyVisible:true});download(result,`${slug}.glb`,'model/gltf-binary');}
    toast('Model exported. Make something with it.');
  }catch(error){toast(`Export failed: ${error.message}`,true);}
};
$('screenshot-button').onclick=()=>{if(!renderer)return;renderer.render(scene,camera);canvas.toBlob(blob=>{if(blob)download(blob,`${filename()}.png`);},'image/png');};
document.querySelectorAll('[data-example]').forEach(b=>b.onclick=()=>{if(state.busy)return;showSpec(structuredClone(examples[b.dataset.example]));document.querySelectorAll('[data-example]').forEach(n=>n.classList.toggle('active',n===b));});

// Real thumbnails rendered from the example geometry, not placeholder image assets.
async function thumbnails(){
  if(renderUnavailable)return;
  const mini=new THREE.WebGLRenderer({antialias:true,alpha:true});mini.setSize(240,200);mini.setPixelRatio(1);mini.toneMapping=THREE.ACESFilmicToneMapping;mini.toneMappingExposure=1.3;
  const s=new THREE.Scene();
  // GPU textures belong to their renderer; create a separate thumbnail environment.
  const miniRoom=new RoomEnvironment(),miniPmrem=new THREE.PMREMGenerator(mini),miniEnvironment=miniPmrem.fromScene(miniRoom,.04);
  s.environment=miniEnvironment.texture;miniRoom.dispose();miniPmrem.dispose();
  s.add(new THREE.HemisphereLight('#fff7ea','#a09584',3));const l=new THREE.DirectionalLight('#fff7ee',3);l.position.set(3,5,4);s.add(l);const c=new THREE.PerspectiveCamera(35,1.2,.01,50);
  try{for(const [id,spec] of Object.entries(examples)){const viewer=buildModel(spec);s.add(viewer.root);const box=new THREE.Box3().setFromObject(viewer.root),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());const distance=Math.max(size.x,size.y,size.z)*2.2;c.position.copy(center).add(new THREE.Vector3(1.4,.9,2).normalize().multiplyScalar(distance));c.lookAt(center);mini.render(s,c);$("thumb-"+id).src=mini.domElement.toDataURL('image/png');s.remove(viewer.root);disposeModel(viewer);}}
  catch{toast('Example thumbnails could not render. The main viewer is still available.',true);}finally{miniEnvironment.dispose();mini.dispose();}
}
thumbnails();
