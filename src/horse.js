import * as THREE from 'three';
import { normalizeAppearance } from './appearance-options.js';

// The model faces +Z. Separate material channels and named groups are the
// attachment points for future hairstyles, saddlecloth patterns and ornaments.
const sphere = new THREE.SphereGeometry(1, 20, 14);
const up = new THREE.Vector3(0, 1, 0);
const surface = (color, roughness = 0.85) => new THREE.MeshStandardMaterial({ color, roughness });

function mesh(parent, geometry, material, position = [0, 0, 0]) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(...position);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function oval(parent, material, scale, position) {
  const object = mesh(parent, sphere, material, position);
  object.scale.set(...scale);
  return object;
}

function limb(parent, material, start, end, radius, endRadius = radius) {
  const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
  const object = mesh(parent, new THREE.CylinderGeometry(endRadius, radius, a.distanceTo(b), 14), material);
  object.position.copy(a).add(b).multiplyScalar(0.5);
  object.quaternion.setFromUnitVectors(up, b.sub(a).normalize());
  return object;
}

function cord(parent, material, points, radius = 0.025) {
  const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
  return mesh(parent, new THREE.TubeGeometry(curve, 32, radius, 6, false), material);
}

// Smooth connected elliptical sections, instead of intersecting polygonal blocks.
function form(parent, material, sections, axis = 'z', segments = 24) {
  const positions = [], indices = [];
  sections.forEach(([center, width, depth], ring) => {
    for (let j = 0; j <= segments; j++) {
      const angle = j / segments * Math.PI * 2;
      positions.push(center[0] + Math.cos(angle) * width,
        center[1] + (axis === 'z' ? Math.sin(angle) * depth : 0),
        center[2] + (axis === 'y' ? Math.sin(angle) * depth : 0));
      if (ring && j < segments) {
        const a = ring * (segments + 1) + j, b = a - segments - 1;
        if (axis === 'z') indices.push(b, b + 1, a, b + 1, a + 1, a);
        else indices.push(b, a, b + 1, b + 1, a, a + 1);
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return mesh(parent, geometry, material);
}

export function createHorse() {
  const root = new THREE.Group(), body = new THREE.Group();
  root.name = 'horse'; body.name = 'body'; root.add(body);
  const coat = surface('#aa6941'), hair = surface('#47332d');
  const cloth = surface('#437f79'), leather = surface('#60432c', 0.65);
  const cream = surface('#f1dfbf'), hoof = surface('#393634', 0.7);
  const muzzle = surface('#86634f'), eye = surface('#171c1b', 0.18);
  const trim = surface('#dfcda3'), metal = surface('#b6b7ab', 0.32);
  metal.metalness = 0.65;

  form(body, coat, [
    [[0, 1.86, -1.24], 0.015, 0.015], [[0, 1.87, -1.13], 0.36, 0.42],
    [[0, 1.88, -0.84], 0.59, 0.65], [[0, 1.82, -0.36], 0.64, 0.67],
    [[0, 1.82, 0.22], 0.6, 0.65], [[0, 1.9, 0.67], 0.53, 0.67],
    [[0, 1.95, 0.95], 0.34, 0.47], [[0, 1.96, 1.07], 0.015, 0.015],
  ]);
  form(body, coat, [
    [[0, 1.63, 0.69], 0.22, 0.31], [[0, 1.96, 0.72], 0.44, 0.55],
    [[0, 2.28, 0.83], 0.39, 0.52], [[0, 2.64, 1.02], 0.3, 0.44],
    [[0, 2.97, 1.16], 0.245, 0.35], [[0, 3.27, 1.23], 0.23, 0.25],
    [[0, 3.39, 1.23], 0.07, 0.12],
  ], 'y');
  // Long forehead, a distinct jaw, and a soft tapered nose.
  oval(body, coat, [0.29, 0.36, 0.3], [0, 3.18, 1.26]);
  form(body, coat, [
    [[0, 3.26, 1.13], 0.015, 0.015], [[0, 3.25, 1.32], 0.29, 0.31],
    [[0, 3.13, 1.58], 0.255, 0.29], [[0, 2.96, 1.83], 0.21, 0.235],
    [[0, 2.84, 2.02], 0.22, 0.18], [[0, 2.82, 2.1], 0.08, 0.08],
  ]);
  oval(body, muzzle, [0.235, 0.19, 0.21], [0, 2.84, 2.025]);
  for (const side of [-1, 1]) {
    const ear = new THREE.Group(); ear.position.set(side * 0.2, 3.46, 1.19); ear.rotation.z = side * -0.19; body.add(ear);
    form(ear, coat, [[[0, -0.07, 0], 0.08, 0.075], [[0, 0.13, 0], 0.1, 0.06], [[0, 0.33, 0.01], 0.01, 0.015]], 'y', 12);
    oval(ear, muzzle, [0.045, 0.15, 0.018], [0, 0.13, 0.055]);
    oval(body, coat, [0.08, 0.11, 0.13], [side * 0.25, 3.26, 1.46]);
    oval(body, eye, [0.045, 0.069, 0.081], [side * 0.299, 3.265, 1.49]);
    oval(body, cream, [0.012, 0.018, 0.02], [side * 0.336, 3.291, 1.51]);
    oval(body, hoof, [0.018, 0.04, 0.065], [side * 0.217, 2.91, 2.08]);
    cord(body, muzzle, [[side * 0.18, 2.77, 2.13], [side * 0.19, 2.745, 2.04], [side * 0.17, 2.755, 1.97]], 0.01);
  }
  cord(body, cream, [[0, 3.46, 1.38], [0, 3.36, 1.57], [0, 3.16, 1.78], [0, 2.99, 1.96]], 0.043);

  const mane = new THREE.Group(); mane.name = 'mane'; body.add(mane);
  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    const y = 3.4 - t * 0.95, z = 1.02 - t * 0.72;
    cord(mane, hair, [[0, y, z], [0.15, y - 0.06, z - 0.035], [0.32, y - 0.27, z + 0.02], [0.32, y - 0.38, z + 0.09]], 0.09 - t * 0.02);
  }
  cord(mane, hair, [[0, 3.5, 1.17], [-0.05, 3.51, 1.34], [-0.09, 3.38, 1.53]], 0.115);
  const tail = new THREE.Group(); tail.name = 'tail'; tail.position.set(0, 2.04, -1.13); body.add(tail);
  for (let i = 0; i < 7; i++) {
    const x = (i - 3) * 0.047;
    cord(tail, hair, [[x * 0.3, 0, 0], [x, -0.3, -0.3], [x * 1.3, -0.85, -0.4], [x * 1.1 + 0.07, -1.53 + Math.abs(x), -0.31]], 0.092);
  }

  const legs = [], knees = [];
  for (const side of [-1, 1]) for (const front of [false, true]) {
    const leg = new THREE.Group(); leg.position.set(side * 0.41, 1.81, front ? 0.72 : -0.82); body.add(leg);
    const kneeZ = front ? -0.01 : 0.13;
    oval(leg, coat, [front ? 0.19 : 0.235, 0.43, 0.24], [0, -0.15, 0]);
    limb(leg, coat, [0, -0.28, 0], [0, -0.82, kneeZ], 0.15, 0.095);
    oval(leg, coat, [0.11, 0.14, 0.115], [0, -0.82, kneeZ]);
    const knee = new THREE.Group(); knee.position.set(0, -0.82, kneeZ); leg.add(knee); knees.push(knee);
    limb(knee, coat, [0, 0, 0], [0, -0.5, -0.055], 0.09, 0.067);
    limb(knee, cream, [0, -0.5, -0.055], [0, -0.78, 0.02], 0.075, 0.095);
    oval(knee, cream, [0.1, 0.12, 0.1], [0, -0.72, 0]);
    const foot = mesh(knee, new THREE.CylinderGeometry(0.1, 0.14, 0.2, 16), hoof, [0, -0.87, 0.035]); foot.scale.z = 1.35;
    legs.push(leg);
  }

  const tack = new THREE.Group(); tack.name = 'tack'; body.add(tack);
  // A draped pad follows the back and hangs naturally along both flanks.
  const padVertices = [], padIndices = [], padUVs = [], count = 22;
  for (let row = 0; row < 2; row++) for (let i = 0; i <= count; i++) {
    const angle = -1.32 + i / count * 2.64;
    padVertices.push(Math.sin(angle) * 0.67, 1.91 + Math.cos(angle) * 0.65, -0.68 + row * 1.22);
    padUVs.push(i / count, row);
    if (row && i < count) { const a = row * (count + 1) + i, b = i; padIndices.push(b, a, b + 1, a, a + 1, b + 1); }
  }
  const padGeometry = new THREE.BufferGeometry(); padGeometry.setAttribute('position', new THREE.Float32BufferAttribute(padVertices, 3)); padGeometry.setIndex(padIndices); padGeometry.computeVertexNormals();
  padGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(padUVs, 2));
  cloth.side = THREE.DoubleSide; mesh(tack, padGeometry, cloth);
  for (const z of [-0.68, 0.54]) {
    const points = Array.from({ length: 23 }, (_, i) => { const a = -1.32 + i / 22 * 2.64; return [Math.sin(a) * 0.677, 1.91 + Math.cos(a) * 0.659, z]; });
    cord(tack, trim, points, 0.022);
  }
  for (const side of [-1, 1]) {
    cord(tack, trim, [[side * 0.65, 2.073, -0.68], [side * 0.65, 2.073, 0.54]], 0.022);
    oval(tack, leather, [0.07, 0.34, 0.31], [side * 0.52, 2.24, 0.09]);
    cord(tack, leather, [[side * 0.39, 2.57, 0.16], [side * 0.6, 2.21, 0.19], [side * 0.65, 1.71, 0.2]], 0.035);
    cord(tack, metal, [[side * 0.65, 1.77, 0.2], [side * 0.69, 1.55, 0.08], [side * 0.69, 1.53, 0.33], [side * 0.65, 1.77, 0.2]], 0.025);
    // Bridle cheek pieces, noseband and reins connect to the rider's hands.
    cord(tack, leather, [[side * 0.22, 3.47, 1.15], [side * 0.32, 3.12, 1.36], [side * 0.225, 2.85, 1.92]], 0.022);
    cord(tack, leather, [[side * 0.24, 2.87, 1.98], [side * 0.43, 2.62, 1.15], [side * 0.3, 2.85, 0.42]], 0.016);
    const ring = mesh(tack, new THREE.TorusGeometry(0.055, 0.012, 6, 16), metal, [side * 0.247, 2.86, 1.94]); ring.rotation.y = Math.PI / 2;
  }
  cord(tack, leather, [[-0.235, 2.96, 1.96], [0, 3.035, 1.985], [0.235, 2.96, 1.96]], 0.028);
  oval(tack, leather, [0.4, 0.12, 0.47], [0, 2.6, -0.1]);
  oval(tack, leather, [0.41, 0.19, 0.13], [0, 2.66, -0.48]);
  oval(tack, leather, [0.32, 0.14, 0.1], [0, 2.66, 0.28]);

  const rider = new THREE.Group(); rider.name = 'rider'; body.add(rider);
  const shirt = surface('#cb7956'), pants = surface('#e6dbc1'), boots = surface('#303d3b', 0.6);
  const skin = surface('#edbd96'), helmet = surface('#35534b', 0.5), riderHair = surface('#66442e');
  oval(rider, pants, [0.32, 0.19, 0.26], [0, 2.72, -0.12]);
  form(rider, shirt, [[[0, 2.75, -0.14], 0.23, 0.16], [[0, 2.89, -0.12], 0.24, 0.17], [[0, 3.16, -0.12], 0.29, 0.18], [[0, 3.28, -0.1], 0.22, 0.14]], 'y');
  limb(rider, skin, [0, 3.24, -0.1], [0, 3.43, -0.08], 0.095);
  oval(rider, skin, [0.235, 0.275, 0.22], [0, 3.6, -0.07]);
  oval(rider, riderHair, [0.239, 0.22, 0.16], [0, 3.63, -0.16]);
  oval(rider, helmet, [0.277, 0.2, 0.26], [0, 3.79, -0.08]);
  oval(rider, helmet, [0.27, 0.035, 0.22], [0, 3.72, 0.09]);
  oval(rider, skin, [0.04, 0.045, 0.05], [0, 3.57, 0.155]);
  for (const side of [-1, 1]) {
    oval(rider, eye, [0.022, 0.029, 0.012], [side * 0.09, 3.63, 0.13]);
    oval(rider, skin, [0.045, 0.07, 0.045], [side * 0.226, 3.58, -0.06]);
    cord(rider, boots, [[side * 0.24, 3.72, -0.04], [side * 0.2, 3.42, 0.025], [0, 3.38, 0.04]], 0.012);
    const shoulder = [side * 0.27, 3.17, -0.09], elbow = [side * 0.37, 2.96, 0.04], hand = [side * 0.29, 2.85, 0.43];
    oval(rider, shirt, [0.12, 0.15, 0.13], shoulder);
    limb(rider, shirt, shoulder, elbow, 0.115, 0.09); oval(rider, shirt, [0.09, 0.09, 0.09], elbow);
    limb(rider, shirt, elbow, hand, 0.085, 0.065); oval(rider, skin, [0.072, 0.065, 0.09], hand);
    const hip = [side * 0.22, 2.72, -0.12], knee = [side * 0.56, 2.22, 0.3], ankle = [side * 0.64, 1.7, 0.08];
    limb(rider, pants, hip, knee, 0.15, 0.11); oval(rider, pants, [0.12, 0.13, 0.12], knee);
    limb(rider, boots, [side * 0.575, 2.13, 0.27], ankle, 0.105, 0.075);
    oval(rider, boots, [0.11, 0.09, 0.21], [side * 0.64, 1.63, 0.19]);
  }
  const decoration = new THREE.Group(); decoration.name = 'decoration'; decoration.position.set(0.3, 3.4, 1.05); decoration.rotation.y = Math.PI / 2; body.add(decoration);
  const petals = surface('#e9be5f');
  for (let i = 0; i < 5; i++) oval(decoration, petals, [0.075, 0.1, 0.035], [Math.sin(i * 1.257) * 0.09, Math.cos(i * 1.257) * 0.09, 0]);
  oval(decoration, cream, [0.055, 0.055, 0.04], [0, 0, 0.025]); decoration.visible = false;
  const variants = {};
  function variant(parent, key, id) {
    const group = new THREE.Group(); group.name = `choice:${key}:${id}`;
    parent.add(group); (variants[key] ||= {})[id] = group; return group;
  }
  function wrapExisting(parent, key, id) {
    const children = [...parent.children], group = variant(parent, key, id);
    for (const child of children) group.add(child);
  }
  wrapExisting(mane, 'maneStyle', 'long');
  wrapExisting(tail, 'tailStyle', 'long');
  wrapExisting(decoration, 'ornament', 'flower');
  decoration.visible = true;
  const shortMane = variant(mane, 'maneStyle', 'short');
  const braidedMane = variant(mane, 'maneStyle', 'braided');
  for (let i = 0; i < 11; i++) {
    const t = i / 10, y = 3.4 - t * 0.95, z = 1.02 - t * 0.72;
    oval(shortMane, hair, [0.11, 0.13, 0.095], [0.055, y + 0.055, z]);
    if (i % 2 === 0) {
      for (const side of [-1, 1]) oval(braidedMane, hair, [0.075, 0.115, 0.065], [0.13 + side * 0.033, y - 0.06, z]).rotation.z = side * 0.5;
      oval(braidedMane, hair, [0.09, 0.07, 0.075], [0.16, y - 0.16, z]);
    }
  }
  for (const group of [shortMane, braidedMane]) cord(group, hair, [[0, 3.49, 1.16], [-0.03, 3.5, 1.33], [-0.05, 3.42, 1.43]], 0.08);
  const shortTail = variant(tail, 'tailStyle', 'short'), braidedTail = variant(tail, 'tailStyle', 'braided');
  for (let i = 0; i < 7; i++) {
    const x = (i - 3) * 0.045;
    cord(shortTail, hair, [[x * 0.3, 0, 0], [x, -0.2, -0.25], [x * 1.1, -0.82, -0.32]], 0.082);
  }
  for (let i = 0; i < 13; i++) {
    for (const side of [-1, 1]) {
      const piece = oval(braidedTail, hair, [0.077, 0.12, 0.075], [side * 0.038, -0.08 - i * 0.095, -0.18 - Math.min(i, 3) * 0.045]);
      piece.rotation.z = side * 0.55;
    }
  }
  oval(braidedTail, hair, [0.105, 0.2, 0.085], [0, -1.42, -0.315]);
  variant(decoration, 'ornament', 'none');
  const bow = variant(decoration, 'ornament', 'bow');
  for (const side of [-1, 1]) {
    oval(bow, petals, [0.14, 0.105, 0.045], [side * 0.105, 0, 0]).rotation.z = side * 0.35;
    cord(bow, petals, [[side * 0.035, -0.03, 0], [side * 0.07, -0.18, 0.015], [side * 0.12, -0.29, 0.03]], 0.043);
  }
  oval(bow, petals, [0.055, 0.06, 0.055], [0, 0, 0.035]);
  const ribbons = variant(decoration, 'ornament', 'ribbons');
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.075;
    cord(ribbons, petals, [[x, 0.06, 0], [x + 0.05, -0.15, 0.01], [x - 0.03, -0.34, 0.02], [x + 0.04, -0.53 + i * 0.045, 0.025]], 0.032);
  }
  const tailRibbons = variant(tail, 'tailOrnament', 'ribbons');
  for (const side of [-1, 1]) cord(tailRibbons, petals, [[side * 0.1, -0.17, -0.33], [side * 0.2, -0.48, -0.48], [side * 0.14, -0.88, -0.46]], 0.035);

  const textures = new Map();
  function patternTexture(id) {
    if (id === 'plain') return null;
    if (textures.has(id)) return textures.get(id);
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#54616a';
    if (id === 'stripes') for (let x = 0; x < 256; x += 64) ctx.fillRect(x, 0, 22, 256);
    else for (let x = 32; x < 256; x += 64) for (let y = 32; y < 256; y += 64) {
      ctx.beginPath();
      if (id === 'dots') ctx.arc(x, y, 10, 0, Math.PI * 2);
      else for (let i = 0; i < 10; i++) {
        const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? 6 : 15;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.fill();
    }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    textures.set(id, texture); return texture;
  }
  const channels = { coat, hair, cloth, leather, ornamentColor: petals };
  function setAppearance(value) {
    const settings = normalizeAppearance(value);
    for (const [key, channel] of Object.entries(channels)) channel.color.set(settings[key]);
    for (const [key, groups] of Object.entries(variants)) for (const [id, group] of Object.entries(groups)) {
      group.visible = id === (key === 'tailOrnament' ? settings.ornament : settings[key]);
    }
    const texture = patternTexture(settings.pattern);
    if (cloth.map !== texture) { cloth.map = texture; cloth.needsUpdate = true; }
    return settings;
  }
  setAppearance({});
  return { root, body, legs, knees, tail, rider, coat, hair, cloth, leather, mane, decoration, setAppearance };
}
