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
  if(deform){
    for(let i=0;i<a.count;i++){
      const d=noise(a.getX(i)*deform.frequency,a.getY(i)*deform.frequency,a.getZ(i)*deform.frequency,deform.seed || 0)*deform.amplitude;
      a.setXYZ(i,a.getX(i)+n.getX(i)*d,a.getY(i)+n.getY(i)*d,a.getZ(i)+n.getZ(i)*d);
    }
    g.computeVertexNormals();
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
