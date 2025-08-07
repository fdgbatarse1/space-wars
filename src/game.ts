import * as THREE from "three";
import Stats from "stats.js";
import { CONFIG } from "./config";
import { createStarfield, updateStarfield } from "./starfield";
import {
  createShip,
  createRemoteShip,
  updateShip,
  accelerateShip,
  decelerateShip,
  pitchShip,
  yawShip,
  Ship,
} from "./ship";
import {
  createBullet,
  updateBullets,
  canFire,
  Bullet,
  createBulletSystem,
  disposeBulletSystem,
} from "./bullets";
import { setupInput, getInput } from "./input";
import { createNetworkManager } from "./network";

let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let ship: Ship;
let starfield: THREE.Points;
let bullets: Bullet[] = [];
let stats: Stats;
let bulletSystem: ReturnType<typeof createBulletSystem>;
let networkManager: ReturnType<typeof createNetworkManager>;
let remotePlayers: Map<string, Ship> = new Map();
let networkBullets: Map<string, Bullet> = new Map();

let lastTime = performance.now() / 1000;
let accumulator = 0;

export async function initGame(canvas: HTMLCanvasElement): Promise<void> {
  setupScene();
  setupCamera();
  setupRenderer(canvas);
  setupLighting();

  stats = new Stats();
  stats.showPanel(0);
  document.body.appendChild(stats.dom);

  starfield = createStarfield();
  scene.add(starfield);

  ship = await createShip();
  scene.add(ship.mesh);

  bulletSystem = createBulletSystem();
  scene.add(bulletSystem.instancedMesh);

  setupInput();

  networkManager = createNetworkManager();
  setupNetworkHandlers();

  networkManager
    .connect("https://space-wars-backend.onrender.com")
    .then(() => {
      console.log("Connected to multiplayer server");
      networkManager.startSendingUpdates(ship);
    })
    .catch((error) => {
      console.warn(
        "Could not connect to multiplayer server, playing offline:",
        error,
      );
    });

  window.addEventListener("resize", onWindowResize);

  window.addEventListener("beforeunload", () => {
    networkManager.disconnect();
    disposeBulletSystem();
    renderer.dispose();
  });

  animate();

  console.log(renderer.info);
}

function setupNetworkHandlers(): void {
  networkManager.onPlayerJoined = async (playerData) => {
    const remoteShip = await createRemoteShip(playerData.id);
    remoteShip.mesh.position.set(
      playerData.position.x,
      playerData.position.y,
      playerData.position.z,
    );
    remoteShip.mesh.rotation.set(
      playerData.rotation.x,
      playerData.rotation.y,
      playerData.rotation.z,
    );
    remotePlayers.set(playerData.id, remoteShip);
    scene.add(remoteShip.mesh);
  };

  networkManager.onPlayerLeft = (playerId) => {
    const remoteShip = remotePlayers.get(playerId);
    if (remoteShip) {
      scene.remove(remoteShip.mesh);
      remotePlayers.delete(playerId);
    }
  };

  networkManager.onPlayerMoved = (playerData) => {
    const remoteShip = remotePlayers.get(playerData.id);
    if (remoteShip) {
      remoteShip.mesh.position.set(
        playerData.position.x,
        playerData.position.y,
        playerData.position.z,
      );
      remoteShip.mesh.rotation.set(
        playerData.rotation.x,
        playerData.rotation.y,
        playerData.rotation.z,
      );
      remoteShip.velocity.set(
        playerData.velocity.x,
        playerData.velocity.y,
        playerData.velocity.z,
      );
    }
  };

  networkManager.onBulletFired = (bulletData) => {
    if (bulletData.playerId === networkManager.playerId) return;

    const bullet = createBullet(
      new THREE.Vector3(
        bulletData.position.x,
        bulletData.position.y,
        bulletData.position.z,
      ),
      new THREE.Vector3(
        bulletData.velocity.x,
        bulletData.velocity.y,
        bulletData.velocity.z,
      ),
    );
    if (bullet) {
      networkBullets.set(bulletData.id, bullet);
      bullets.push(bullet);
    }
  };
}

function setupScene(): void {
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, 50, 500);
}

function setupCamera(): void {
  camera = new THREE.PerspectiveCamera(
    CONFIG.camera.fov,
    window.innerWidth / window.innerHeight,
    CONFIG.camera.near,
    CONFIG.camera.far,
  );
  camera.position.set(...CONFIG.camera.position);
}

function setupRenderer(canvas: HTMLCanvasElement): void {
  const dpr = Math.min(window.devicePixelRatio, 1.4);

  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: dpr <= 1,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
}

function setupLighting(): void {
  const ambientLight = new THREE.AmbientLight(
    CONFIG.lighting.ambient.color,
    CONFIG.lighting.ambient.intensity,
  );
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(
    CONFIG.lighting.directional.color,
    CONFIG.lighting.directional.intensity,
  );
  directionalLight.position.set(...CONFIG.lighting.directional.position);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.setScalar(512);
  directionalLight.shadow.camera.near = 0.5;
  directionalLight.shadow.camera.far = 30;
  directionalLight.shadow.camera.left = -10;
  directionalLight.shadow.camera.right = 10;
  directionalLight.shadow.camera.top = 10;
  directionalLight.shadow.camera.bottom = -10;
  scene.add(directionalLight);
}

function animate(): void {
  requestAnimationFrame(animate);

  stats.begin();

  const currentTime = performance.now() / 1000;
  const frameTime = Math.min(currentTime - lastTime, CONFIG.maxAccumulator);
  lastTime = currentTime;

  accumulator += frameTime;

  while (accumulator >= CONFIG.fixedTimeStep) {
    update(CONFIG.fixedTimeStep);
    accumulator -= CONFIG.fixedTimeStep;
  }

  render();

  stats.end();
}

function update(deltaTime: number): void {
  const input = getInput();

  if (input.pitchUp) {
    pitchShip(ship, -1, deltaTime);
  }
  if (input.pitchDown) {
    pitchShip(ship, 1, deltaTime);
  }
  if (input.yawLeft) {
    yawShip(ship, -1, deltaTime);
  }
  if (input.yawRight) {
    yawShip(ship, 1, deltaTime);
  }

  if (input.accelerate) {
    accelerateShip(ship, deltaTime);
  } else {
    decelerateShip(ship, deltaTime);
  }

  if (input.fire && canFire()) {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
      ship.mesh.quaternion,
    );
    const bulletPos = ship.mesh.position
      .clone()
      .add(forward.clone().multiplyScalar(1.2));
    const bullet = createBullet(bulletPos, forward);
    if (bullet) {
      bullets.push(bullet);

      if (networkManager && networkManager.isConnected) {
        networkManager.fireBullet(
          bulletPos,
          forward.multiplyScalar(CONFIG.bullet.speed),
        );
      }
    }
  }

  updateShip(ship, deltaTime);
  updateStarfield(starfield, deltaTime);
  bullets = updateBullets(bullets, deltaTime, scene);

  remotePlayers.forEach((remoteShip) => {
    if (remoteShip.velocity.length() > 0) {
      remoteShip.mesh.position.addScaledVector(
        remoteShip.velocity,
        deltaTime * 0.5,
      );
    }
  });

  updateCamera();
}

function updateCamera(): void {
  const offset = new THREE.Vector3(0, 2.5, 8).applyQuaternion(
    ship.mesh.quaternion,
  );
  const targetPosition = ship.mesh.position.clone().add(offset);
  camera.position.lerp(targetPosition, CONFIG.camera.followSpeed);
  camera.lookAt(ship.mesh.position);
}

function render(): void {
  renderer.render(scene, camera);
}

function onWindowResize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  const dpr = Math.min(window.devicePixelRatio, 1.4);
  renderer.setPixelRatio(dpr);
}
