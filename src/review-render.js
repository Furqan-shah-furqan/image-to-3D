import * as THREE from 'three';

export const REVIEW_VIEWS=[['Front (+Z)',[0,0,1]],['Three-quarter',[1,.45,1.5]],['Side (+X)',[1,0,0]],['Back (-Z)',[0,0,-1]]];
export function reviewCamera(root,direction,aspect=1){
  root.updateWorldMatrix(true,true);
  const box=new THREE.Box3().setFromObject(root),sphere=box.getBoundingSphere(new THREE.Sphere());
  const radius=Math.max(sphere.radius,.01),camera=new THREE.PerspectiveCamera(38,aspect,radius*.01,radius*20);
  // A bounding sphere fits every orientation, including long/wide objects.
  const halfFov=Math.min(THREE.MathUtils.degToRad(camera.fov/2),Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*aspect));
  camera.position.copy(sphere.center).add(new THREE.Vector3(...direction).normalize().multiplyScalar(radius/Math.sin(halfFov)*1.12));
  camera.lookAt(sphere.center);camera.updateMatrixWorld();return camera;
}
// Review the complete object with stable lighting and cameras, independent of
// user orbit, zoom, wireframe, background, hidden parts and auto-rotation.
export function captureReview(renderer,root,environment,createCanvas=()=>document.createElement('canvas')){
  const scene=new THREE.Scene();scene.background=new THREE.Color('#eeeeee');scene.environment=environment;
  const copy=root.clone(true),clones=new Map();copy.traverse(node=>{
    node.visible=true;
    if(node.material){const clone=m=>{if(!clones.has(m)){const c=m.clone();c.wireframe=false;clones.set(m,c);}return clones.get(m);};node.material=Array.isArray(node.material)?node.material.map(clone):clone(node.material);}
  });scene.add(copy);
  scene.add(new THREE.HemisphereLight(0xffffff,0x777777,.6));
  const key=new THREE.DirectionalLight(0xffffff,2.5);key.position.set(3,5,4);scene.add(key);
  const fill=new THREE.DirectionalLight(0xffffff,.7);fill.position.set(-4,2,-3);scene.add(fill);
  const size=renderer.getSize(new THREE.Vector2()),ratio=renderer.getPixelRatio(),exposure=renderer.toneMappingExposure;
  const atlas=createCanvas();atlas.width=1024;atlas.height=1080;const ctx=atlas.getContext('2d');
  try{
    renderer.setPixelRatio(1);renderer.setSize(512,512,false);renderer.toneMappingExposure=1;
    ctx.fillStyle='#eeeeee';ctx.fillRect(0,0,atlas.width,atlas.height);
    for(const [index,[label,direction]] of REVIEW_VIEWS.entries()){
      renderer.render(scene,reviewCamera(copy,direction));const x=(index%2)*512,y=Math.floor(index/2)*540;
      ctx.drawImage(renderer.domElement,x,y+28,512,512);ctx.fillStyle='#222222';ctx.font='18px sans-serif';ctx.fillText(label,x+14,y+22);
    }
    return atlas.toDataURL('image/jpeg',.92);
  }finally{renderer.setPixelRatio(ratio);renderer.setSize(size.x,size.y,false);renderer.toneMappingExposure=exposure;clones.forEach(m=>m.dispose());}
}
