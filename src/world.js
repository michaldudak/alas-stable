import * as THREE from 'three';
import { createStable } from './stable.js';
import { insideStable } from './stable-layout.js';

const materials = new Map();
export function material(color) {
  if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }));
  return materials.get(color);
}
export function box(parent, color, size, position, rotation = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material(color));
  mesh.position.set(...position); mesh.rotation.y = rotation;
  mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function ellipsoid(parent, color, size, position, detail = 1) {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, detail), material(color));
  mesh.scale.set(...size); mesh.position.set(...position);
  mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function cylinder(parent, color, radius, height, position, radiusTop = radius) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radius, height, 7), material(color));
  mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function sign(parent, text, x, z, angle = 0) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f5ebcf'; ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#755334'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, 502, 118);
  ctx.fillStyle = '#35503c'; ctx.font = '600 43px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 66);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(5, 1.25, 0.15), new THREE.MeshStandardMaterial({ map: texture }));
  mesh.position.set(x, 2.8, z); mesh.rotation.y = angle; parent.add(mesh);
  cylinder(parent, '#876744', 0.1, 2.4, [x, 1.2, z]);
}
export function createWorld(scene) {
  const solids = [], obstacles = [];
  scene.background = new THREE.Color('#b9dfe2'); scene.fog = new THREE.Fog('#b9dfe2', 85, 230);
  scene.add(new THREE.HemisphereLight('#fff7df', '#638549', 2.4));
  const sun = new THREE.DirectionalLight('#fff0cf', 3); sun.position.set(-35, 65, 25); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, far: 180 }); sun.shadow.bias = -0.0005; scene.add(sun);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(260, 96), material('#91ac67')); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const arena = new THREE.Mesh(new THREE.PlaneGeometry(32, 58), material('#d8bf8e')); arena.rotation.x = -Math.PI / 2; arena.position.set(0, 0.025, -9); arena.receiveShadow = true; scene.add(arena);
  // A continuous broad bridleway through the meadow and the forest.
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.035, 31), new THREE.Vector3(36, 0.035, 40), new THREE.Vector3(70, 0.035, 10),
    new THREE.Vector3(63, 0.035, -57), new THREE.Vector3(10, 0.035, -80), new THREE.Vector3(-60, 0.035, -62),
    new THREE.Vector3(-72, 0.035, -4), new THREE.Vector3(-44, 0.035, 30),
  ], true);
  const points = curve.getPoints(240), verts = [], indices = [];
  for (let i = 0; i < points.length; i++) {
    const tangent = curve.getTangent(i / (points.length - 1)), p = points[i];
    verts.push(p.x - tangent.z * 2.8, p.y, p.z + tangent.x * 2.8, p.x + tangent.z * 2.8, p.y, p.z - tangent.x * 2.8);
    if (i < points.length - 1) { const n = i * 2; indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const pathMaterial = new THREE.MeshStandardMaterial({ color: '#c9b687', side: THREE.DoubleSide, roughness: 1 });
  const path = new THREE.Mesh(geometry, pathMaterial); path.receiveShadow = true; scene.add(path);
  function fence(x, z, length, alongZ = false) {
    const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = alongZ ? Math.PI / 2 : 0; scene.add(group);
    for (let i = -length / 2; i <= length / 2 + 0.01; i += 4) box(group, '#eee3c8', [0.23, 1.55, 0.23], [i, 0.77, 0]);
    for (const y of [0.6, 1.15]) box(group, '#e8ddc2', [length, 0.16, 0.13], [0, y, 0]);
    solids.push({ x, z, w: alongZ ? 0.2 : length, d: alongZ ? length : 0.2, jumpable: true });
  }
  fence(-17, -9, 60, true); fence(17, -9, 60, true); fence(0, -39, 34);
  fence(-12, 21, 10); fence(12, 21, 10);
  for (const [z, color] of [[7, '#75968a'], [-8, '#bf795f'], [-24, '#d6aa54']]) {
    const x = 0, width = 8;
    for (const side of [-1, 1]) {
      box(scene, '#f7edcf', [0.3, 1.9, 0.3], [x + side * 4.2, 0.95, z]);
      box(scene, color, [1.2, 0.16, 0.75], [x + side * 4.2, 0.1, z]);
      solids.push({ x: x + side * 4.2, z, w: 0.3, d: 0.3 });
    }
    const rails = new THREE.Group(); rails.position.set(x, 0, z); scene.add(rails);
    for (const y of [0.5, 1]) for (let i = 0; i < 8; i++) box(rails, i % 2 ? '#fff0d3' : color, [1, 0.16, 0.16], [-3.5 + i, y, 0]);
    obstacles.push({ x, z, width, rails, down: 0 });
  }
  const stable = createStable(scene, solids);
  sign(scene, 'TOR  →', -9, 26); sign(scene, 'LAS  →', 39, 34, -0.3);
  let seed = 521;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 230; i++) {
    const x = (random() - 0.5) * 224, z = (random() - 0.5) * 224;
    if (insideStable(x, z, 7) || Math.hypot(x, z) > 112 || (Math.abs(x) < 24 && z > -46 && z < 36) || (x < -20 && x > -49 && z > -5 && z < 27)) continue;
    if (points.some(p => Math.hypot(x - p.x, z - p.z) < 6)) continue;
    if (z > 25 && random() > 0.2) continue;
    const height = 4 + random() * 5, tree = new THREE.Group(); tree.position.set(x, 0, z); scene.add(tree);
    cylinder(tree, '#80674b', 0.3, height * 0.65, [0, height * 0.325, 0], 0.18);
    const green = ['#577b47', '#648751', '#789958', '#456f50'][Math.floor(random() * 4)];
    if (z < -35) {
      for (let j = 0; j < 3; j++) cylinder(tree, green, 2.4 - j * 0.45, 3.5, [0, height * 0.5 + j * 1.2, 0], 0);
    } else ellipsoid(tree, green, [2.6, height * 0.43, 2.5], [0, height * 0.76, 0], 1);
    solids.push({ x, z, w: 0.65, d: 0.65 });
  }
  for (let i = 0; i < 450; i++) {
    const x = (random() - 0.5) * 210, z = (random() - 0.5) * 210;
    if (insideStable(x, z, 5) || (Math.abs(x) < 20 && z > -42 && z < 30) || points.some(p => Math.hypot(x - p.x, z - p.z) < 3.3)) continue;
    const color = ['#e9d795', '#f0e6c8', '#b5bf79', '#819957'][i % 4];
    ellipsoid(scene, color, [0.15, 0.15 + random() * 0.2, 0.15], [x, 0.16, z], 0);
  }
  for (let i = 0; i < 15; i++) {
    const angle = i / 15 * Math.PI * 2;
    ellipsoid(scene, i % 2 ? '#809b70' : '#73936d', [35, 12 + random() * 15, 28], [Math.sin(angle) * 160, 0, Math.cos(angle) * 160], 1);
  }
  for (let i = 0; i < 11; i++) {
    const cloud = new THREE.Group(); cloud.position.set((random() - 0.5) * 250, 40 + random() * 22, (random() - 0.5) * 250); scene.add(cloud);
    for (let j = 0; j < 4; j++) ellipsoid(cloud, '#f8f4e6', [7, 2.6, 3], [j * 4, Math.sin(j) * 1.2, 0], 1).castShadow = false;
  }
  return { obstacles, solids, points, stable };
}
