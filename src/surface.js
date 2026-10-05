import * as THREE from 'three';

// Smooth, deterministic surface variation, baked into geometry for export.
function noise(x,y,z,seed) {
  return (Math.sin(x*1.37+y*.79+seed)*Math.sin(y*1.71+z*.91+seed*.37)+Math.sin(z*2.13+x*.67+seed*.73)*.5)/1.5;
}
export function foldedPatch(p) {
  const g=new THREE.PlaneGeometry(p[0],p[1],40,40);g.rotateX(-Math.PI/2);
  const a=g.attributes.position,f=p[3] ?? 6;
  for(let i=0;i<a.count;i++){
    const x=a.getX(i),z=a.getZ(i),edge=Math.max(Math.abs(x)/(p[0]/2),Math.abs(z)/(p[1]/2));
    a.setY(i,p[2]*(Math.sin(x*f+z*f*.4)*.65+Math.sin(z*f*1.3)*.35)+(p[4] || 0)*edge**3);
  }
  g.computeVertexNormals();return g;
}
export function applySurface(g,deform,surface) {
  const a=g.attributes.position,n=g.attributes.normal;
  if(deform && deform.amplitude>0){
    // UV/cap seams contain duplicate positions with different vertex normals.
    // Move each position once so those copies cannot pull apart into cracks.
    const groups=new Map(),original=n.array.slice();
    for(let i=0;i<a.count;i++){
      const key=[a.getX(i),a.getY(i),a.getZ(i)].map(v=>Math.round(v*1e6)).join(',');
      if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);
    }
    const direction=new THREE.Vector3();
    for(const indices of groups.values()){
      const i=indices[0],x=a.getX(i),y=a.getY(i),z=a.getZ(i);direction.set(0,0,0);
      // Unique normals avoid bias from duplicated cap centres or UV poles.
      const normals=new Set();for(const j of indices){const key=[n.getX(j),n.getY(j),n.getZ(j)].map(v=>Math.round(v*1e5)).join(',');if(!normals.has(key)){normals.add(key);direction.add(new THREE.Vector3(n.getX(j),n.getY(j),n.getZ(j)));}}
      direction.normalize();const d=noise(x*deform.frequency,y*deform.frequency,z*deform.frequency,deform.seed || 0)*deform.amplitude;
      for(const j of indices)a.setXYZ(j,x+direction.x*d,y+direction.y*d,z+direction.z*d);
    }
    g.computeVertexNormals();const computed=n.array.slice();
    // Smooth across UV seams only where the original surface was smooth.
    // Preserve intentional hard edges between caps and walls.
    for(const indices of groups.values())for(const i of indices){
      direction.set(0,0,0);
      for(const j of indices)if(original[i*3]*original[j*3]+original[i*3+1]*original[j*3+1]+original[i*3+2]*original[j*3+2]>.999){direction.x+=computed[j*3];direction.y+=computed[j*3+1];direction.z+=computed[j*3+2];}
      if(direction.lengthSq()<1e-12)direction.set(computed[i*3],computed[i*3+1],computed[i*3+2]);
      if(direction.lengthSq()<1e-12)direction.set(original[i*3],original[i*3+1],original[i*3+2]);
      if(direction.lengthSq()<1e-12)direction.set(0,1,0);
      direction.normalize();n.setXYZ(i,direction.x,direction.y,direction.z);
    }
    a.needsUpdate=true;n.needsUpdate=true;
  }
  if(surface){
    const colors=new Float32Array(a.count*3);
    for(let i=0;i<a.count;i++){
      const v=1-surface.amount*(.5+.5*noise(a.getX(i)*surface.scale,a.getY(i)*surface.scale,a.getZ(i)*surface.scale,surface.seed || 0));
      colors.set([v,v,v],i*3);
    }
    g.setAttribute('color',new THREE.BufferAttribute(colors,3));
  }
  g.computeBoundingSphere();return g;
}
