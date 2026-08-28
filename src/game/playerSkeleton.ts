import * as THREE from 'three';

/**
 * Pilotage d'un squelette Mixamo par des corps rigides.
 *
 * Ce module ne connait ni Rapier ni les assets : il ne manipule que des poses.
 * C'est ce qui permet de le verifier hors navigateur (scripts/verify-skin.mjs).
 */

/** Rotation appliquee a la pose de bind pour que le modele regarde +z, comme le ragdoll a yaw = 0. */
export const MODEL_FACING = Math.PI;

/**
 * `rotation` transfere l'orientation complete du corps rigide : indispensable
 * pour le tronc, sans quoi le personnage ne pivoterait jamais sur lui-meme.
 * `aim` ne fait que pointer l'os le long du membre physique en conservant le
 * roulis de la pose de bind : sans cela les bras resteraient figes en croix.
 * `upright` ignore l'inclinaison du corps et ne garde que le cap : c'est ce qui
 * tient la tete droite malgre les soubresauts du ragdoll.
 */
export type DriveMode = 'rotation' | 'aim' | 'upright';

export const BONE_DRIVERS: ReadonlyArray<{ part: string; bone: string; mode: DriveMode }> = [
  { part: 'pelvis', bone: 'mixamorig:Hips', mode: 'rotation' },
  { part: 'torso', bone: 'mixamorig:Spine1', mode: 'rotation' },
  { part: 'head', bone: 'mixamorig:Head', mode: 'upright' },
  { part: 'upperArmL', bone: 'mixamorig:LeftArm', mode: 'aim' },
  { part: 'foreArmL', bone: 'mixamorig:LeftForeArm', mode: 'aim' },
  { part: 'upperArmR', bone: 'mixamorig:RightArm', mode: 'aim' },
  { part: 'foreArmR', bone: 'mixamorig:RightForeArm', mode: 'aim' },
  { part: 'thighL', bone: 'mixamorig:LeftUpLeg', mode: 'aim' },
  { part: 'shinL', bone: 'mixamorig:LeftLeg', mode: 'aim' },
  { part: 'thighR', bone: 'mixamorig:RightUpLeg', mode: 'aim' },
  { part: 'shinR', bone: 'mixamorig:RightLeg', mode: 'aim' },
];

/** Os servant de reference pour poser les pieds au sol. */
const GROUND_BONES = [
  'mixamorig:LeftToeBase',
  'mixamorig:RightToeBase',
  'mixamorig:LeftFoot',
  'mixamorig:RightFoot',
];

/** L'axe long d'un membre du ragdoll est son -y local. */
const LIMB_AXIS = new THREE.Vector3(0, -1, 0);

/** Pose d'un corps rigide. `RAPIER.RigidBody` satisfait cette forme. */
export interface BodyPose {
  translation(): { x: number; y: number; z: number };
  rotation(): { x: number; y: number; z: number; w: number };
}

export type PoseLookup = (part: string) => BodyPose | undefined;

export interface SyncOptions {
  /** Cap du personnage, en radians. */
  yaw: number;
  /**
   * Recale le personnage en hauteur pour que le pied le plus bas reste au sol.
   * A couper pendant un ecroulement, ou le corps doit vraiment tomber.
   */
  plantFeet: boolean;
}

interface DrivenBone {
  part: string;
  mode: DriveMode;
  /** Orientation monde de l'os en pose de bind, corrigee du cap du modele. */
  restQuat: THREE.Quaternion;
  /** Direction monde de l'os en pose de bind, corrigee du cap du modele. */
  restDir: THREE.Vector3;
}

export interface SkinBinding {
  root: THREE.Object3D;
  skinned: THREE.SkinnedMesh;
  /** Os dans l'ordre hierarchique : un parent precede toujours ses enfants. */
  ordered: THREE.Bone[];
  driven: Map<THREE.Bone, DrivenBone>;
  pelvisBone: THREE.Bone | null;
  /** Os les plus bas, references pour le contact au sol. */
  groundBones: THREE.Bone[];
  /** Hauteur de ces os au-dessus de la semelle, relevee en pose de bind. */
  ankleHeight: number;
  /** Os presents dans BONE_DRIVERS mais absents du squelette. */
  missing: string[];
}

/**
 * Le FBX porte plus de 4 poids par sommet ; le loader supprime les surplus
 * sans renormaliser. Les poids restants ne somment alors plus a 1, et chaque
 * sommet est attire vers l'origine du repere proportionnellement au manque —
 * ce qui disloque le maillage des que le personnage s'en eloigne.
 */
export function normalizeSkinWeights(root: THREE.Object3D) {
  root.traverse((child) => {
    const mesh = child as THREE.SkinnedMesh;
    if (mesh.isSkinnedMesh) mesh.normalizeSkinWeights();
  });
}

/**
 * Selon l'exportateur, les os Mixamo arrivent en `mixamorig:Hips` ou
 * `mixamorigHips`. On compare donc sur une forme normalisee.
 */
export function boneKey(name: string): string {
  return name.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

/** Direction monde d'un os, de sa base vers son premier enfant. */
function boneDirection(bone: THREE.Bone): THREE.Vector3 {
  const child = bone.children.find((c) => (c as THREE.Bone).isBone);
  const origin = bone.getWorldPosition(new THREE.Vector3());
  if (child) {
    const tip = child.getWorldPosition(new THREE.Vector3()).sub(origin);
    if (tip.lengthSq() > 1e-10) return tip.normalize();
  }
  // Os terminal : on retombe sur son axe long, le +y local chez Mixamo.
  return new THREE.Vector3(0, 1, 0).applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()));
}

/**
 * Prepare le pilotage : releve la pose de bind, qui sert de reference a toutes
 * les orientations calculees ensuite.
 *
 * @param root racine deja mise a l'echelle finale, en pose de bind.
 */
export function createSkinBinding(root: THREE.Object3D): SkinBinding {
  let skinned: THREE.SkinnedMesh | undefined;
  const ordered: THREE.Bone[] = [];
  // traverse parcourt le graphe en profondeur : l'ordre obtenu garantit qu'un
  // parent est traite avant ses enfants.
  root.traverse((child) => {
    if ((child as THREE.SkinnedMesh).isSkinnedMesh) skinned ??= child as THREE.SkinnedMesh;
    if ((child as THREE.Bone).isBone) ordered.push(child as THREE.Bone);
  });
  if (!skinned) throw new Error('modele joueur : aucun SkinnedMesh trouve');
  if (!ordered.length) throw new Error('modele joueur : aucun os trouve');

  const byKey = new Map<string, THREE.Bone>();
  for (const bone of ordered) byKey.set(boneKey(bone.name), bone);

  root.updateMatrixWorld(true);
  const facing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), MODEL_FACING);

  const driven = new Map<THREE.Bone, DrivenBone>();
  const missing: string[] = [];
  let pelvisBone: THREE.Bone | null = null;

  for (const driver of BONE_DRIVERS) {
    const bone = byKey.get(boneKey(driver.bone));
    if (!bone) {
      missing.push(driver.bone);
      continue;
    }
    if (driver.part === 'pelvis') pelvisBone = bone;
    driven.set(bone, {
      part: driver.part,
      mode: driver.mode,
      restQuat: bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(facing),
      restDir: boneDirection(bone).applyQuaternion(facing),
    });
  }

  const groundBones: THREE.Bone[] = [];
  let lowestBoneY = Infinity;
  for (const name of GROUND_BONES) {
    const bone = byKey.get(boneKey(name));
    if (!bone) continue;
    groundBones.push(bone);
    lowestBoneY = Math.min(lowestBoneY, bone.getWorldPosition(new THREE.Vector3()).y);
  }

  const ankleHeight = groundBones.length ? lowestBoneY - bindSoleY(skinned) : 0;

  return { root, skinned, ordered, driven, pelvisBone, groundBones, ankleHeight, missing };
}

/**
 * Hauteur du point le plus bas du maillage en pose de bind. L'origine du FBX
 * n'est pas sous les pieds, on ne peut donc pas se contenter de y = 0. On passe
 * par getVertexPosition, seule mesure garantie conforme au rendu.
 */
function bindSoleY(skinned: THREE.SkinnedMesh): number {
  const point = new THREE.Vector3();
  const count = skinned.geometry.attributes.position.count;
  const step = Math.max(1, Math.floor(count / 4000));
  let lowest = Infinity;
  for (let i = 0; i < count; i += step) {
    skinned.getVertexPosition(i, point);
    lowest = Math.min(lowest, skinned.localToWorld(point).y);
  }
  return lowest;
}

const _bodyQuat = new THREE.Quaternion();
const _desired = new THREE.Quaternion();
const _parentQuat = new THREE.Quaternion();
const _parentPos = new THREE.Vector3();
const _parentScale = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _delta = new THREE.Quaternion();
const _pelvisPos = new THREE.Vector3();
const _inverse = new THREE.Matrix4();
const _yawQuat = new THREE.Quaternion();
const _footPos = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Recopie les corps rigides vers le squelette.
 *
 * On n'ecrit que les transformations locales des os. Les matrices monde
 * restent le produit de la hierarchie : les `boneInverses` du skinning sont
 * releves a l'echelle du FBX, et y injecter des coordonnees monde disloquerait
 * le maillage.
 */
export function syncSkeleton(binding: SkinBinding, poses: PoseLookup, options: SyncOptions) {
  const { root, skinned, ordered, driven, pelvisBone, groundBones } = binding;

  _yawQuat.setFromAxisAngle(UP, options.yaw);

  const pelvis = poses('pelvis');
  if (pelvis) {
    const t = pelvis.translation();
    // Le deplacement horizontal est porte par la racine plutot que par le
    // bassin : les os restent ainsi pres de l'origine de leur repere, ou le
    // skinning est le moins sensible aux erreurs d'arrondi. La hauteur, elle,
    // est reprise plus bas par le recalage au sol.
    root.position.set(t.x, 0, t.z);
    root.updateMatrixWorld(true);

    if (pelvisBone?.parent) {
      _inverse.copy(pelvisBone.parent.matrixWorld).invert();
      pelvisBone.position.copy(_pelvisPos.set(t.x, t.y, t.z).applyMatrix4(_inverse));
    }
  }

  for (const bone of ordered) {
    const parent = bone.parent;
    const target = driven.get(bone);
    const body = target && poses(target.part);

    if (target && body && parent) {
      const r = body.rotation();
      _bodyQuat.set(r.x, r.y, r.z, r.w);

      if (target.mode === 'upright') {
        _desired.copy(_yawQuat).multiply(target.restQuat);
      } else if (target.mode === 'rotation') {
        _desired.copy(_bodyQuat).multiply(target.restQuat);
      } else {
        _dir.copy(LIMB_AXIS).applyQuaternion(_bodyQuat);
        _delta.setFromUnitVectors(target.restDir, _dir);
        _desired.copy(_delta).multiply(target.restQuat);
      }

      parent.matrixWorld.decompose(_parentPos, _parentQuat, _parentScale);
      bone.quaternion.copy(_parentQuat.invert()).multiply(_desired);
    }

    // La matrice monde est recalculee au fil du parcours pour que chaque os
    // dispose de l'orientation deja resolue de son parent.
    bone.updateMatrix();
    if (parent) bone.matrixWorld.multiplyMatrices(parent.matrixWorld, bone.matrix);
    else bone.matrixWorld.copy(bone.matrix);
  }

  // Le bassin du ragdoll est tenu a hauteur fixe, mais la longueur apparente
  // des jambes varie avec leur inclinaison : sans ce recalage les pieds
  // s'enfoncent dans le sol ou flottent au-dessus.
  if (options.plantFeet && groundBones.length) {
    let lowest = Infinity;
    for (const bone of groundBones) {
      lowest = Math.min(lowest, _footPos.setFromMatrixPosition(bone.matrixWorld).y);
    }
    root.position.y = binding.ankleHeight - lowest;
    root.updateMatrixWorld(true);
  }

  skinned.skeleton.update();
}
