/**
 * Verifie hors navigateur que le squelette du modele joueur suit bien les corps
 * rigides : resolution des noms d'os, taille et position du maillage deforme.
 *
 * Usage : node --experimental-strip-types scripts/verify-skin.mjs
 */
import { readFileSync } from 'node:fs';

// FBXLoader touche au DOM pour les textures embarquees. On lui donne juste
// assez de surface pour que le parse aille au bout.
const fakeElement = () => ({
  addEventListener() {},
  removeEventListener() {},
  set src(_v) {},
  get src() { return ''; },
  width: 0,
  height: 0,
  style: {},
});
globalThis.document = { createElementNS: fakeElement, createElement: fakeElement };
globalThis.window = { URL: { createObjectURL: () => 'blob:fake' } };
globalThis.URL.createObjectURL = () => 'blob:fake';
globalThis.self = globalThis;

const THREE = await import('three');
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
const { createSkinBinding, syncSkeleton, normalizeSkinWeights } = await import('../src/game/playerSkeleton.ts');

const TARGET_HEIGHT = 1.75;
const PELVIS_Y = 0.95;

// Repris de src/game/ragdoll.ts : offsets des membres, relatifs au bassin.
const SPECS = [
  ['pelvis', 0, 0, 0],
  ['torso', 0, 0.38, 0],
  ['head', 0, 0.76, 0],
  ['upperArmL', -0.3, 0.47, 0],
  ['foreArmL', -0.3, 0.2, 0],
  ['upperArmR', 0.3, 0.47, 0],
  ['foreArmR', 0.3, 0.2, 0],
  ['thighL', -0.11, -0.32, 0],
  ['shinL', -0.11, -0.68, 0],
  ['thighR', 0.11, -0.32, 0],
  ['shinR', 0.11, -0.68, 0],
];

/**
 * Reproduit une pose du ragdoll. Comme dans driveToPose, l'orientation d'un
 * corps vaut `yaw * cible`. `tilts` donne les cibles, en radians.
 */
function poses(origin, yaw, tilts = {}) {
  const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const map = new Map();
  for (const [name, ox, oy, oz] of SPECS) {
    const local = new THREE.Vector3(ox, 0, oz).applyQuaternion(rot);
    const quat = rot.clone();
    if (tilts[name]) quat.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...tilts[name])));
    map.set(name, {
      translation: () => ({ x: origin.x + local.x, y: PELVIS_Y + oy, z: origin.z + local.z }),
      rotation: () => ({ x: quat.x, y: quat.y, z: quat.z, w: quat.w }),
    });
  }
  return (part) => map.get(part);
}

/**
 * Position monde d'un sommet reellement deforme par le squelette.
 * getVertexPosition lit l'attribut de position puis applique le skinning ;
 * applyBoneTransform, lui, attend deja la position en entree.
 */
function skinnedVertex(mesh, index, out) {
  mesh.getVertexPosition(index, out);
  return mesh.localToWorld(out);
}

/** Boite englobante du maillage reellement deforme par le squelette. */
function skinnedBounds(mesh, step = 37) {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  const count = mesh.geometry.attributes.position.count;
  for (let i = 0; i < count; i += step) box.expandByPoint(skinnedVertex(mesh, i, v));
  return box;
}

/** Sommet le plus eloigne du centre, avec les os qui le pilotent. */
function worstVertex(mesh, step = 11) {
  const center = skinnedBounds(mesh, step).getCenter(new THREE.Vector3());
  const v = new THREE.Vector3();
  const count = mesh.geometry.attributes.position.count;
  const idx = mesh.geometry.attributes.skinIndex;
  const wgt = mesh.geometry.attributes.skinWeight;
  let best = { dist: -1, bones: [], sum: 0 };

  for (let i = 0; i < count; i += step) {
    const dist = skinnedVertex(mesh, i, v).distanceTo(center);
    if (dist <= best.dist) continue;
    const bones = [];
    let sum = 0;
    for (const c of ['x', 'y', 'z', 'w']) {
      const w = wgt[`get${c.toUpperCase()}`](i);
      sum += w;
      if (w > 0.01) bones.push(`${mesh.skeleton.bones[idx[`get${c.toUpperCase()}`](i)]?.name}:${w.toFixed(2)}`);
    }
    best = { dist, bones, sum };
  }
  return best;
}

/** Angle entre l'axe vertical de la tete et la verticale du monde, en degres. */
function headTilt(binding) {
  for (const [bone, target] of binding.driven) {
    if (target.part !== 'head') continue;
    const q = new THREE.Quaternion();
    bone.matrixWorld.decompose(new THREE.Vector3(), q, new THREE.Vector3());
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    // L'axe long de la tete est son +y local chez Mixamo.
    return THREE.MathUtils.radToDeg(up.angleTo(new THREE.Vector3(0, 1, 0)));
  }
  return NaN;
}

const headIsUpright = (binding) => headTilt(binding) < 5;
const headTiltReport = (binding) => `inclinaison = ${headTilt(binding).toFixed(1)}°`;

const buf = readFileSync(new URL('../src/assets/jay.fbx', import.meta.url));
const model = new FBXLoader().parse(
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  '',
);

normalizeSkinWeights(model);

const raw = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
model.scale.multiplyScalar(TARGET_HEIGHT / raw.y);
model.updateMatrixWorld(true);

const scene = new THREE.Scene();
scene.add(model);
scene.updateMatrixWorld(true);

const binding = createSkinBinding(model);
console.log('os pilotes:', binding.driven.size, '/', 11);
console.log('os manquants:', binding.missing.length ? binding.missing.join(', ') : 'aucun');
console.log('bindMode:', binding.skinned.bindMode);

// Temoin : sans aucun pilotage, le maillage deforme doit coincider avec la
// geometrie brute. Si ce n'est pas le cas, le probleme est dans le bind.
{
  const geo = binding.skinned.geometry;
  geo.computeBoundingBox();
  const rawSize = geo.boundingBox.getSize(new THREE.Vector3());
  const bind = skinnedBounds(binding.skinned).getSize(new THREE.Vector3());
  const scale = TARGET_HEIGHT / raw.y;
  console.log('\n--- pose de bind (temoin) ---');
  console.log('geometrie brute x echelle:', rawSize.toArray().map((n) => (n * scale).toFixed(2)).join(' x '));
  console.log('maillage deforme         :', bind.toArray().map((n) => n.toFixed(2)).join(' x '));

  const worst = worstVertex(binding.skinned);
  console.log('sommet le plus ecarte    :', worst.dist.toFixed(2), 'm ->', worst.bones.join(', '));
  console.log('somme des poids          :', worst.sum.toFixed(3));

  const mesh = binding.skinned;
  const hips = binding.pelvisBone;
  const i = mesh.skeleton.bones.indexOf(hips);
  const fmt = (m) => `[${m.elements.map((n) => n.toFixed(3)).join(' ')}]`;
  const scaleOf = (m) => new THREE.Vector3().setFromMatrixScale(m).x.toFixed(4);
  console.log('index de Hips dans skeleton.bones:', i);
  console.log('echelle mesh.matrixWorld :', scaleOf(mesh.matrixWorld));
  console.log('echelle bindMatrix       :', scaleOf(mesh.bindMatrix));
  console.log('echelle bindMatrixInverse:', scaleOf(mesh.bindMatrixInverse));
  if (i >= 0) {
    const boneMatrix = new THREE.Matrix4().multiplyMatrices(
      hips.matrixWorld,
      mesh.skeleton.boneInverses[i],
    );
    console.log('echelle Hips.matrixWorld :', scaleOf(hips.matrixWorld));
    console.log('echelle boneInverse Hips :', scaleOf(mesh.skeleton.boneInverses[i]));
    console.log('echelle boneMatrix Hips  :', scaleOf(boneMatrix), fmt(boneMatrix));
  }
}

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

check('tous les os resolus', binding.missing.length === 0);

// Jambes ecartees, torse penche et tete franchement inclinee : la tete doit
// rester droite et les pieds au sol malgre tout.
const COURSE = {
  thighL: [0.5, 0, 0],
  thighR: [-0.45, 0, 0.15],
  shinL: [-0.3, 0, 0],
  torso: [0.35, 0.2, 0],
  head: [0.7, 0.4, 0.3],
};

for (const [label, origin, yaw, tilts] of [
  ['joueur au repos (yaw=PI)', new THREE.Vector3(-2.2, 0, 8.4), Math.PI, {}],
  ['adversaire au repos (yaw=0)', new THREE.Vector3(2.2, 0, -5.6), 0, {}],
  ['joueur en course (yaw=PI)', new THREE.Vector3(-2.2, 0, 8.4), Math.PI, COURSE],
]) {
  syncSkeleton(binding, poses(origin, yaw, tilts), { yaw, plantFeet: true });
  scene.updateMatrixWorld(true);
  binding.skinned.skeleton.update();

  const box = skinnedBounds(binding.skinned);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  console.log(`\n--- ${label} ---`);
  console.log('taille  :', size.toArray().map((n) => n.toFixed(2)).join(' x '));
  console.log('centre  :', center.toArray().map((n) => n.toFixed(2)).join(', '));
  console.log('y min/max:', box.min.y.toFixed(2), '/', box.max.y.toFixed(2));

  if (process.argv.includes('--bones')) {
    const p = new THREE.Vector3();
    for (const bone of binding.ordered) {
      if (!/Hips|Spine|Neck|Head$|Arm|Hand$|UpLeg|Leg$|Foot$/.test(bone.name)) continue;
      bone.getWorldPosition(p);
      console.log(`  ${bone.name.padEnd(26)} ${p.toArray().map((n) => n.toFixed(2).padStart(6)).join(' ')}`);
    }
  }

  check('hauteur plausible (1.4 - 2.1 m)', size.y > 1.4 && size.y < 2.1, `${size.y.toFixed(2)} m`);
  check('largeur plausible (< 1.6 m)', size.x < 1.6, `${size.x.toFixed(2)} m`);
  check('pieds au sol', Math.abs(box.min.y) < 0.05, `y min = ${box.min.y.toFixed(2)}`);
  check('tete droite', headIsUpright(binding, yaw), headTiltReport(binding, yaw));
  check(
    'centre sur le point de spawn',
    Math.hypot(center.x - origin.x, center.z - origin.z) < 0.6,
    `ecart = ${Math.hypot(center.x - origin.x, center.z - origin.z).toFixed(2)} m`,
  );
}

console.log(failures ? `\n${failures} verification(s) en echec` : '\nToutes les verifications passent');
process.exit(failures ? 1 : 0);
