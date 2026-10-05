import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
export function validateGLB(buffer){
  if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<20||buffer.byteLength>100*1024*1024)throw new Error('Choose a GLB model smaller than 100 MB.');
  const v=new DataView(buffer);
  if(v.getUint32(0,true)!==0x46546c67||v.getUint32(4,true)!==2||v.getUint32(8,true)!==buffer.byteLength||v.getUint32(16,true)!==0x4e4f534a)throw new Error('This file is not a valid GLB 2.0 model.');
  const length=v.getUint32(12,true);if(length>buffer.byteLength-20)throw new Error('The GLB file is incomplete.');
  const json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,length)));
  for(const resource of [...(json.buffers||[]),...(json.images||[])])if(resource.uri && !/^data:/i.test(resource.uri))throw new Error('Import a self-contained GLB with embedded textures. External files are not supported.');
  const unsupported=(json.extensionsRequired||[]).filter(x=>['KHR_draco_mesh_compression','KHR_texture_basisu','EXT_meshopt_compression'].includes(x));
  if(unsupported.length)throw new Error('This GLB uses unsupported compression. Export an uncompressed GLB.');
  return json;
}
export async function loadMesh(buffer,title='Textured model'){
  validateGLB(buffer);const gltf=await new GLTFLoader().parseAsync(buffer,'');
  const root=new THREE.Group();root.add(gltf.scene);const materials=new Map(),nodes=new Map(),components=[];
  gltf.scene.traverse(node=>{
    if(!node.isMesh)return;node.castShadow=true;node.receiveShadow=true;
    const list=Array.isArray(node.material)?node.material:[node.material];
    for(const m of list)if(!materials.has(m.uuid))materials.set(m.uuid,m);
    nodes.set(node.uuid,node);components.push({id:node.uuid,name:node.name || `Mesh ${components.length+1}`,material:list[0].uuid});
  });
  if(!components.length || !materials.size)throw new Error('The GLB contains no visible mesh.');
  const spec={title,description:'Textured mesh. Original UVs and embedded PBR textures are preserved. Hidden sides are inferred from the reference.',materials:[...materials].map(([id,m])=>({id,name:m.name || `Material ${materials.size===1?1:id.slice(0,4)}`,color:`#${m.color?.getHexString() || 'ffffff'}`,roughness:m.roughness ?? 1,metalness:m.metalness ?? 0})),components};
  return {root,materials,nodes,spec};
}

// Improve oblique texture sampling without changing UVs, color spaces, PBR
// channels, normal strength or the source pixels imported by GLTFLoader.
export function configureTextureQuality(viewer,maxAnisotropy=1){
  const textures=new Set();
  for(const material of viewer.materials.values())for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
  for(const texture of textures){texture.anisotropy=Math.max(1,Math.min(8,maxAnisotropy));texture.needsUpdate=true;}
  return textures.size;
}
