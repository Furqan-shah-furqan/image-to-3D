import * as THREE from 'three';

// Tileable microstructure in linear data maps. Base color stays image-derived.
// Detail is an explicit material choice; it is never applied to imported PBR assets.
export function materialDetail(detail,roughness){
  if(!detail)return {};
  const size=256,heights=new Float32Array(size*size),normal=new Uint8Array(size*size*4),orm=new Uint8Array(size*size*4);
  const tau=Math.PI*2,strength=detail.strength ?? .25,scale=detail.scale ?? 4;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size*tau,v=y/size*tau;
    const noise=(Math.sin(u*7+Math.sin(v*5))*Math.cos(v*11)+.5*Math.sin(u*17+v*13)+.25*Math.cos(u*29-v*23))/1.75;
    let h=noise;
    if(detail.kind==='wood')h=.7*Math.sin(u*12+1.5*Math.sin(v)+.3*noise)+.3*noise;
    if(detail.kind==='fabric')h=(Math.cos(u*32)+Math.cos(v*32))*.35+noise*.1;
    if(detail.kind==='organic')h=.65*noise+.35*Math.sin(u*3)*Math.sin(v*4);
    heights[y*size+x]=h;
  }
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=(y*size+x)*4,h=heights[y*size+x];
    const dx=(heights[y*size+(x+1)%size]-heights[y*size+(x+size-1)%size])*strength*2;
    const dy=(heights[((y+1)%size)*size+x]-heights[((y+size-1)%size)*size+x])*strength*2;
    const n=new THREE.Vector3(-dx,-dy,1).normalize();normal.set([Math.round((n.x*.5+.5)*255),Math.round((n.y*.5+.5)*255),Math.round((n.z*.5+.5)*255),255],i);
    // glTF multiplies roughness factor by G; normalize variation around 1
    // so a user's roughness slider remains meaningful (no double squaring).
    orm.set([255,Math.round(255*Math.max(.6,1-strength*.3*(h*.5+.5))),255,255],i);
  }
  const texture=data=>{let t;
    // GLTFExporter combines roughness/metallic maps through Canvas2D, which
    // requires a drawable image rather than a raw DataTexture image object.
    if(typeof document!=='undefined'){const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d');const pixels=ctx.createImageData(size,size);pixels.data.set(data);ctx.putImageData(pixels,0,0);t=new THREE.CanvasTexture(canvas);}
    else t=new THREE.DataTexture(data,size,size);
    t.colorSpace=THREE.NoColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(scale,scale);t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;return t;};
  return {normalMap:texture(normal),roughnessMap:texture(orm)};
}
