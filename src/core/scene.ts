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

/** Decor du stade : tribunes, eclairage, cloture et bannieres. */
export function buildStadium(scene: THREE.Scene) {
  const { halfWidth: hw, halfLength: hl } = COURT;

  // Tribunes en gradins autour du court.
  const standMat = new THREE.MeshStandardMaterial({ color: PALETTE.tribune, roughness: 0.9 });
  const seatMat = new THREE.MeshStandardMaterial({ color: PALETTE.siege, roughness: 0.85 });
  const tiers = 5;
  const tierH = 0.55;
  const tierD = 1.1;

  const buildStandRow = (w: number, d: number, x: number, z: number, rotY: number) => {
    const group = new THREE.Group();
    for (let i = 0; i < tiers; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(w, tierH, tierD), standMat);
      step.position.set(0, tierH * (i + 0.5), -tierD * i);
      step.receiveShadow = true;
      group.add(step);
      // Rangee de sieges coloree.
      const seats = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, tierH * 0.35, tierD * 0.7), seatMat);
      seats.position.set(0, tierH * (i + 1) - tierH * 0.15, -tierD * i);
      group.add(seats);
      // Touches de couleur pour simuler la foule.
      const crowd = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.88, tierH * 0.25, tierD * 0.5),
        new THREE.MeshStandardMaterial({
          color: i % 2 === 0 ? 0x4a6a8a : 0x6a4a5a,
          roughness: 1,
        }),
      );
      crowd.position.set(0, tierH * (i + 1) + tierH * 0.05, -tierD * i);
      group.add(crowd);
    }
    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    scene.add(group);
  };

  const margin = 3.5;
  buildStandRow(hw * 2 + 8, tierD, 0, hl + margin, 0);
  buildStandRow(hw * 2 + 8, tierD, 0, -hl - margin, Math.PI);
  buildStandRow(hl * 2 + 8, tierD, -hw - margin, 0, Math.PI / 2);
  buildStandRow(hl * 2 + 8, tierD, hw + margin, 0, -Math.PI / 2);

  // Dalle beton autour du court.
  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(hw * 2 + 14, 0.08, hl * 2 + 20),
    new THREE.MeshStandardMaterial({ color: PALETTE.beton, roughness: 0.95 }),
  );
  apron.position.y = -0.12;
  apron.receiveShadow = true;
  scene.add(apron);

  // Cloture grillagee au-dessus des vitres laterales.
  const fenceMat = new THREE.MeshStandardMaterial({
    color: PALETTE.grillage,
    transparent: true,
    opacity: 0.35,
    roughness: 0.7,
    side: THREE.DoubleSide,
  });
  for (const sx of [-1, 1]) {
    const fence = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.2, hl * 2 + 2), fenceMat);
    fence.position.set(sx * (hw + 0.3), 3.8, 0);
    scene.add(fence);
  }

  // Poteaux d'eclairage aux quatre coins exterieurs.
  const poleMat = new THREE.MeshStandardMaterial({ color: PALETTE.grillage, roughness: 0.5, metalness: 0.3 });
  const lightMat = new THREE.MeshStandardMaterial({
    color: PALETTE.luminaire,
    emissive: PALETTE.luminaire,
    emissiveIntensity: 0.6,
    roughness: 0.3,
  });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 12), poleMat);
    pole.position.set(sx * (hw + 5), 6, sz * (hl + 4));
    pole.castShadow = true;
    scene.add(pole);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, 0.6), lightMat);
    lamp.position.set(sx * (hw + 5), 12.2, sz * (hl + 4));
    scene.add(lamp);
    const spot = new THREE.PointLight(0xfff0d0, 0.4, 30);
    spot.position.copy(lamp.position);
    scene.add(spot);
  }

  // Bannieres publicitaires sur les cotes.
  const bannerMat = new THREE.MeshStandardMaterial({ color: PALETTE.banniere, roughness: 0.6 });
  const bannerColors = [0xff3a6a, 0x3a8aff, 0xffc93a, 0x3aff8a];
  for (let i = 0; i < 4; i++) {
    const banner = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.8, 0.06), bannerMat.clone());
    (banner.material as THREE.MeshStandardMaterial).color.setHex(bannerColors[i]);
    banner.position.set(-hw - 2.5 + i * 2.5, 2.5, hl + 2.8);
    scene.add(banner);
  }

  // Panneau de score decoratif au fond.
  const scoreboard = new THREE.Mesh(
    new THREE.BoxGeometry(4, 1.2, 0.15),
    new THREE.MeshStandardMaterial({ color: 0x111820, roughness: 0.4, metalness: 0.2 }),
  );
  scoreboard.position.set(0, 3.2, -hl - 2.5);
  scene.add(scoreboard);
  const scoreGlow = new THREE.Mesh(
    new THREE.BoxGeometry(3.6, 0.7, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x00ff88, emissive: 0x00ff88, emissiveIntensity: 0.3 }),
  );
  scoreGlow.position.set(0, 3.2, -hl - 2.42);
  scene.add(scoreGlow);
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
