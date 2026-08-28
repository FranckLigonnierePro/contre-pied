import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import jayUrl from '../assets/jay.fbx?url';
import jayTextureUrl from '../assets/jay_text.png?url';
import {
  createSkinBinding,
  normalizeSkinWeights,
  syncSkeleton,
  type SkinBinding,
  type SyncOptions,
} from './playerSkeleton';
import type { Part } from './ragdoll';

/** Hauteur cible du personnage, en metres. */
const TARGET_HEIGHT = 1.75;

export interface PlayerSkin {
  root: THREE.Group;
  binding: SkinBinding;
}

let template: THREE.Group | null = null;
let playerTexture: THREE.Texture | null = null;

function applyPlayerMaterials(root: THREE.Object3D, map: THREE.Texture) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = new THREE.MeshStandardMaterial({
      map,
      roughness: 0.75,
      metalness: 0.02,
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // La sphere englobante est figee sur la pose de bind : sans cela le
    // personnage disparait des que le ragdoll l'en fait sortir.
    mesh.frustumCulled = false;
  });
}

function firstMaterialMap(root: THREE.Object3D): THREE.Texture | null {
  let map: THREE.Texture | null = null;
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (map || !mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    map = (mats[0] as THREE.MeshStandardMaterial | undefined)?.map ?? null;
  });
  return map;
}

/** La texture embarquee dans le FBX est la seule reference fiable pour l'orientation des UV. */
async function loadPlayerTexture(embedded: THREE.Texture | null): Promise<THREE.Texture> {
  const texture = await new THREE.TextureLoader().loadAsync(jayTextureUrl);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (embedded) {
    texture.flipY = embedded.flipY;
    texture.wrapS = embedded.wrapS;
    texture.wrapT = embedded.wrapT;
  }
  texture.needsUpdate = true;
  return texture;
}

/** Charge le modele une seule fois et normalise son echelle. */
export async function loadPlayerModel(): Promise<THREE.Group> {
  if (template) return template;

  const model = await new FBXLoader().loadAsync(jayUrl);
  playerTexture = await loadPlayerTexture(firstMaterialMap(model));
  normalizeSkinWeights(model);

  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  // Le FBX est exporte en centimetres. On ne touche qu'a l'echelle : position
  // et cap sont imposes a chaque image par le bassin du ragdoll.
  model.scale.multiplyScalar(TARGET_HEIGHT / size.y);
  applyPlayerMaterials(model, playerTexture);

  template = model;
  return template;
}

/** Clone le modele pour un joueur et prepare le pilotage de ses os. */
export function createPlayerSkin(source: THREE.Group): PlayerSkin {
  if (!playerTexture) throw new Error('loadPlayerModel() doit etre appele avant createPlayerSkin()');

  const root = cloneSkinned(source) as THREE.Group;
  applyPlayerMaterials(root, playerTexture);
  root.updateMatrixWorld(true);

  const binding = createSkinBinding(root);
  for (const bone of binding.missing) {
    console.warn(`jay.fbx : os "${bone}" absent du squelette, membre non pilote`);
  }

  return { root, binding };
}

/** Recopie les corps rigides du ragdoll vers le squelette skinne. */
export function syncPlayerSkin(
  skin: PlayerSkin,
  parts: Map<string, Part>,
  options: SyncOptions,
) {
  syncSkeleton(skin.binding, (part) => parts.get(part)?.body, options);
}
