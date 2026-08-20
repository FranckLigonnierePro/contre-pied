import * as THREE from 'three';
import { RAPIER, type World } from './physics';
import { COURT, GROUPS, PALETTE } from './constants';

export interface Stage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
}

export function createStage(container: HTMLElement): Stage {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.ciel);
  scene.fog = new THREE.Fog(PALETTE.ciel, 35, 90);

  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 200);
  camera.position.set(0, 5, 16);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const resize = () => {
    const w = container.clientWidth || innerWidth;
    const h = container.clientHeight || innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };
  addEventListener('resize', resize);
  resize();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x4a7a5c, 1.1));
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.5);
  sun.position.set(9, 18, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera as THREE.OrthographicCamera;
  cam.left = -16; cam.right = 16; cam.top = 20; cam.bottom = -20; cam.far = 60;
  scene.add(sun);

  return { scene, camera, renderer };
}

/** Construit le court : sol, lignes, filet, parois vitrees + les colliders correspondants. */
export function buildCourt(scene: THREE.Scene, world: World) {
  const { halfWidth: hw, halfLength: hl } = COURT;

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(hw * 2, 0.2, hl * 2),
    new THREE.MeshStandardMaterial({ color: PALETTE.sol, roughness: 0.95 }),
  );
  floor.position.y = -0.1;
  floor.receiveShadow = true;
  scene.add(floor);

  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(60, 0.1, 90),
    new THREE.MeshStandardMaterial({ color: 0x18543a, roughness: 1 }),
  );
  apron.position.y = -0.16;
  apron.receiveShadow = true;
  scene.add(apron);

  addLines(scene);

  // Sol physique.
  const floorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.1, 0));
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(30, 0.1, 45).setRestitution(0.78).setFriction(0.8).setCollisionGroups(GROUPS.env),
    floorBody,
  );

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: PALETTE.verre,
    transparent: true,
    opacity: 0.18,
    roughness: 0.05,
    metalness: 0,
    side: THREE.DoubleSide,
  });

  const wall = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glassMat);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setRestitution(0.7).setFriction(0.3).setCollisionGroups(GROUPS.env),
      body,
    );
  };

  const bh = COURT.backWallHeight;
  const sh = COURT.sideWallHeight;
  wall(hw * 2, bh, 0.1, 0, bh / 2, -hl); // fond IA
  wall(hw * 2, bh, 0.1, 0, bh / 2, hl); // fond joueur
  wall(0.1, sh, hl * 2, -hw, sh / 2, 0); // lateral gauche
  wall(0.1, sh, hl * 2, hw, sh / 2, 0); // lateral droit

  // Montants d'angle, purement decoratifs.
  const postMat = new THREE.MeshStandardMaterial({ color: PALETTE.grillage, roughness: 0.6 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, bh, 0.12), postMat);
    post.position.set(sx * hw, bh / 2, sz * hl);
    post.castShadow = true;
    scene.add(post);
  }

  buildNet(scene, world);
}

function addLines(scene: THREE.Scene) {
  const { halfWidth: hw, serviceLine } = COURT;
  const mat = new THREE.MeshBasicMaterial({ color: PALETTE.ligne });
  const line = (w: number, d: number, x: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), mat);
    mesh.position.set(x, 0.005, z);
    scene.add(mesh);
  };
  for (const s of [-1, 1]) line(hw * 2, 0.06, 0, s * serviceLine);
  line(0.06, serviceLine * 2, 0, 0); // ligne centrale de service
}

function buildNet(scene: THREE.Scene, world: World) {
  const { halfWidth: hw, netHeight: nh, netPostHeight: nph } = COURT;

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(hw * 2, nh, 0.04),
    new THREE.MeshStandardMaterial({
      color: 0x101820,
      transparent: true,
      opacity: 0.55,
      roughness: 1,
    }),
  );
  mesh.position.y = nh / 2;
  scene.add(mesh);

  const band = new THREE.Mesh(
    new THREE.BoxGeometry(hw * 2, 0.06, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xffffff }),
  );
  band.position.y = nh;
  scene.add(band);

  const postMat = new THREE.MeshStandardMaterial({ color: 0x2b3a44 });
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, nph), postMat);
    post.position.set(s * hw, nph / 2, 0);
    post.castShadow = true;
    scene.add(post);
  }

  // Le filet arrete la balle : restitution faible pour un amorti credible.
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, nh / 2, 0));
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(hw, nh / 2, 0.02).setRestitution(0.1).setFriction(0.9).setCollisionGroups(GROUPS.env),
    body,
  );
}
