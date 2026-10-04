import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
export function buildModel(spec) {
  const root = new THREE.Group(); root.name = spec.title;
  const materials = new Map(spec.materials.map(m => [m.id, new THREE.MeshPhysicalMaterial({
    name: m.name, color: m.color, roughness: m.roughness, metalness: m.metalness,
    clearcoat: m.clearcoat || 0, opacity: m.opacity ?? 1, transparent: (m.opacity ?? 1) < 1 || (m.transmission || 0) > 0,
    transmission: m.transmission || 0, thickness: .15, side: THREE.DoubleSide
  })]));
  const nodes = new Map();
  for (const c of spec.components) {
    const p = c.params; let geometry;
    switch (c.primitive) {
      case 'box': geometry = new THREE.BoxGeometry(p[0], p[1], p[2]); break;
      case 'roundedBox': geometry = new RoundedBoxGeometry(p[0], p[1], p[2], 4, Math.min(p[3], Math.min(...p.slice(0,3)) / 2)); break;
      case 'sphere': geometry = new THREE.SphereGeometry(p[0], 32, 24); break;
      case 'capsule': geometry = new THREE.CapsuleGeometry(p[0], p[1], 8, 24); break;
      case 'cylinder': geometry = new THREE.CylinderGeometry(p[0], p[1], p[2], 48); break;
      case 'cone': geometry = new THREE.ConeGeometry(p[0], p[1], 48); break;
      case 'torus': geometry = new THREE.TorusGeometry(p[0], p[1], 16, 72); break;
      case 'lathe': geometry = new THREE.LatheGeometry(c.points.map(q => new THREE.Vector2(q[0],q[1])), 64); break;
      case 'tube': geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(c.points.map(q => new THREE.Vector3(...q))), Math.min(256, Math.max(32,c.points.length * 10)), p[0], 16, false); break;
      case 'extrude': {
        const shape = new THREE.Shape(c.points.map(q => new THREE.Vector2(q[0],q[1]))); shape.closePath();
        const bevel = Math.min(p[1] || 0, p[0]/3);
        geometry = new THREE.ExtrudeGeometry(shape, { depth:p[0], bevelEnabled:bevel > 0, bevelThickness:bevel, bevelSize:bevel, bevelSegments:3, steps:1 });
        break;
      }
      case 'mesh': geometry = new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.Float32BufferAttribute(c.points.flat(),3)); geometry.setIndex(c.indices); geometry.computeVertexNormals(); break;
      default: throw new Error(`Unsupported geometry: ${c.primitive}`);
    }
    const mesh = new THREE.Mesh(geometry,materials.get(c.material));
    mesh.name = c.name; mesh.userData.componentId = c.id; mesh.userData.materialId = c.material;
    mesh.position.fromArray(c.position); mesh.rotation.set(...c.rotation); mesh.scale.fromArray(c.scale);
    mesh.castShadow = true; mesh.receiveShadow = true; nodes.set(c.id, mesh);
  }
  for (const c of spec.components) (c.parentId ? nodes.get(c.parentId) : root).add(nodes.get(c.id));
  root.userData.sceneSpec = spec;
  return { root, materials, nodes };
}
