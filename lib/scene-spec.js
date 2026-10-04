// A bounded declarative scene format. Model output is data, never executable code.
export const PRIMITIVES = ['box', 'roundedBox', 'sphere', 'capsule', 'cylinder', 'cone', 'torus', 'lathe', 'tube', 'extrude', 'mesh'];
const number = { type: 'NUMBER' };
const string = { type: 'STRING' };
const vector = { type: 'ARRAY', items: number, minItems: 3, maxItems: 3 };
export const sceneSchema = {
  type: 'OBJECT', required: ['title', 'description', 'limitations', 'materials', 'components'],
  properties: {
    title: string, description: string, limitations: { type: 'ARRAY', items: string },
    materials: { type: 'ARRAY', items: {
      type: 'OBJECT', required: ['id', 'name', 'color', 'roughness', 'metalness'],
      properties: { id: string, name: string, color: string, roughness: number, metalness: number, clearcoat: number, opacity: number, transmission: number }
    } },
    components: { type: 'ARRAY', items: {
      type: 'OBJECT', required: ['id', 'name', 'primitive', 'material', 'position', 'rotation', 'scale', 'params'],
      properties: {
        id: string, name: string, parentId: string, primitive: { type: 'STRING', enum: PRIMITIVES },
        material: string, position: vector, rotation: vector, scale: vector,
        params: { type: 'ARRAY', items: number },
        points: { type: 'ARRAY', items: vector }, indices: { type: 'ARRAY', items: { type: 'INTEGER' } }
      }
    } },
    detailInventory: { type: 'ARRAY', items: { type: 'OBJECT', required: ['detail', 'componentId'], properties: { detail: string, componentId: string } } }
  }
};
function fail(message) { throw new Error(`Invalid scene: ${message}`); }
function text(value, label, max = 1000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(label);
  return value;
}
function finite(value, min, max, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(label);
  return value;
}
function vec(value, min, max, label) {
  if (!Array.isArray(value) || value.length !== 3) fail(label);
  value.forEach(n => finite(n, min, max, label));
  return value;
}
export function validateScene(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) fail('expected an object');
  text(spec.title, 'title', 120); text(spec.description, 'description', 1500);
  if (!Array.isArray(spec.limitations) || spec.limitations.length > 20) fail('limitations');
  spec.limitations.forEach(n => text(n, 'limitation', 500));
  if (!Array.isArray(spec.materials) || !spec.materials.length || spec.materials.length > 40) fail('1–40 materials required');
  const materials = new Set();
  for (const m of spec.materials) {
    text(m.id, 'material id', 80); text(m.name, 'material name', 120);
    if (materials.has(m.id)) fail('duplicate material id');
    materials.add(m.id);
    if (!/^#[0-9a-f]{6}$/i.test(m.color)) fail('material colour must be hex');
    finite(m.roughness, 0, 1, 'roughness'); finite(m.metalness, 0, 1, 'metalness');
    for (const k of ['opacity', 'clearcoat', 'transmission']) if (m[k] !== undefined) finite(m[k], 0, 1, k);
  }
  if (!Array.isArray(spec.components) || !spec.components.length || spec.components.length > 240) fail('1–240 components required');
  const ids = new Set(); let pointBudget = 0;
  for (const c of spec.components) {
    text(c.id, 'component id', 80); text(c.name, 'component name', 120);
    if (ids.has(c.id)) fail('duplicate component id'); ids.add(c.id);
    if (!PRIMITIVES.includes(c.primitive)) fail('unsupported primitive');
    if (!materials.has(c.material)) fail('unknown material');
    vec(c.position, -100, 100, 'position'); vec(c.rotation, -100, 100, 'rotation'); vec(c.scale, .0001, 100, 'scale');
    if (!Array.isArray(c.params) || c.params.length > 8) fail('geometry parameters');
    c.params.forEach(n => finite(n, 0, 100, 'geometry parameter'));
    const required = { box: 3, roundedBox: 4, sphere: 1, capsule: 2, cylinder: 3, cone: 2, torus: 2, lathe: 0, tube: 1, extrude: 1, mesh: 0 }[c.primitive];
    if (c.params.length < required) fail(`missing ${c.primitive} parameters`);
    if (c.primitive !== 'lathe' && c.primitive !== 'mesh' && c.params.slice(0, required).every(n => n === 0)) fail('zero-size geometry');
    if (['box', 'roundedBox', 'sphere', 'capsule', 'cone', 'torus', 'tube', 'extrude'].includes(c.primitive) && c.params[0] <= 0) fail('positive geometry size required');
    if (['box', 'roundedBox'].includes(c.primitive) && (c.params[1] <= 0 || c.params[2] <= 0)) fail('positive box dimensions required');
    if (c.primitive === 'cylinder' && (c.params[2] <= 0 || Math.max(c.params[0], c.params[1]) === 0)) fail('cylinder dimensions');
    if (c.primitive === 'cone' && c.params[1] <= 0) fail('cone height');
    if (c.primitive === 'torus' && c.params[1] <= 0) fail('torus tube radius');
    if (c.points !== undefined) {
      if (!Array.isArray(c.points) || c.points.length > 18000) fail('point limit');
      c.points.forEach(p => vec(p, -100, 100, 'point')); pointBudget += c.points.length;
    }
    if (pointBudget > 30000) fail('total point budget exceeded');
    const minPoints = { lathe: 2, tube: 2, extrude: 3, mesh: 3 }[c.primitive];
    if (minPoints && (!c.points || c.points.length < minPoints)) fail(`${c.primitive} needs points`);
    if (c.primitive === 'lathe' && (c.points.some(p => p[0] < 0) || !c.points.some(p => p[0] > 0))) fail('lathe radii');
    if (c.primitive === 'tube' && c.points.every(p => p.every((n, i) => n === c.points[0][i]))) fail('tube path has no length');
    if (c.primitive === 'mesh') {
      if (!Array.isArray(c.indices) || !c.indices.length || c.indices.length > 54000 || c.indices.length % 3) fail('mesh triangle indices');
      if (c.indices.some(n => !Number.isInteger(n) || n < 0 || n >= c.points.length)) fail('mesh index range');
    }
  }
  const nodes = new Map(spec.components.map(c => [c.id, c]));
  for (const c of spec.components) {
    const visited = new Set([c.id]); let parentId = c.parentId;
    while (parentId) {
      if (!ids.has(parentId)) fail('unknown parent');
      if (visited.has(parentId) || visited.size > 20) fail('cyclic or deep hierarchy');
      visited.add(parentId); parentId = nodes.get(parentId).parentId;
    }
  }
  if (spec.detailInventory !== undefined) {
    if (!Array.isArray(spec.detailInventory) || spec.detailInventory.length > 80) fail('detail inventory');
    for (const d of spec.detailInventory) { text(d.detail, 'detail', 300); if (!ids.has(d.componentId)) fail('detail references unknown component'); }
  }
  return spec;
}
