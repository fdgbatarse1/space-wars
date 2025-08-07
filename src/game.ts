import * as THREE from "three";
import { gsap } from "gsap";
import Stats from "stats.js";
import { CONFIG } from "./config";
import { createStarfield, updateStarfield } from "./starfield";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import {
  createShip,
  createRemoteShip,
  updateShip,
  disposeShip,
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
import {
  EffectComposer,
  RenderPass,
  ChromaticAberrationEffect,
  EffectPass,
} from "postprocessing";

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
let loadingRemotePlayers: Set<string> = new Set();
let composer: EffectComposer;
let chromaticEffect: ChromaticAberrationEffect;
let hud: HTMLDivElement | null = null;

const cameraKick = { amount: 0 };

let environmentTexture: THREE.Texture | null = null;

let lastTime = performance.now() / 1000;
let accumulator = 0;

export async function initGame(canvas: HTMLCanvasElement): Promise<void> {
  setupScene();
  setupCamera();
  setupRenderer(canvas);
  await setupHDRI();
  setupLighting();
  setupPostProcessing();

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
    .connect(import.meta.env.VITE_SERVER_URL || "http://localhost:8080")
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
    if (environmentTexture) environmentTexture.dispose();
    renderer.dispose();
  });

  animate();

  console.log(renderer.info);
}

function setupNetworkHandlers(): void {
  networkManager.onPlayerJoined = async (playerData) => {
    if (
      remotePlayers.has(playerData.id) ||
      loadingRemotePlayers.has(playerData.id)
    ) {
      return;
    }
    loadingRemotePlayers.add(playerData.id);
    const remoteShip = await createRemoteShip(playerData.id);
    if (
      !loadingRemotePlayers.has(playerData.id) ||
      remotePlayers.has(playerData.id)
    ) {
      loadingRemotePlayers.delete(playerData.id);
      return;
    }
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
    loadingRemotePlayers.delete(playerData.id);
  };

  networkManager.onPlayerLeft = (playerId) => {
    const remoteShip = remotePlayers.get(playerId);
    if (remoteShip) {
      disposeShip(remoteShip);
      scene.remove(remoteShip.mesh);
      remotePlayers.delete(playerId);
    }
    loadingRemotePlayers.delete(playerId);
  };

  networkManager.onPlayerMoved = (playerData) => {
    let remoteShip = remotePlayers.get(playerData.id);
    if (!remoteShip) {
      if (loadingRemotePlayers.has(playerData.id)) return;
      loadingRemotePlayers.add(playerData.id);
      createRemoteShip(playerData.id).then((created) => {
        if (
          !loadingRemotePlayers.has(playerData.id) ||
          remotePlayers.has(playerData.id)
        ) {
          loadingRemotePlayers.delete(playerData.id);
          return;
        }
        created.mesh.position.set(
          playerData.position.x,
          playerData.position.y,
          playerData.position.z,
        );
        created.mesh.rotation.set(
          playerData.rotation.x,
          playerData.rotation.y,
          playerData.rotation.z,
        );
        remotePlayers.set(playerData.id, created);
        scene.add(created.mesh);
        loadingRemotePlayers.delete(playerData.id);
      });
      return;
    }
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

    const start = new THREE.Vector3(
      bulletData.position.x,
      bulletData.position.y,
      bulletData.position.z,
    );
    const velocity = new THREE.Vector3(
      bulletData.velocity.x,
      bulletData.velocity.y,
      bulletData.velocity.z,
    );
    const direction =
      velocity.lengthSq() > 0
        ? velocity.normalize()
        : new THREE.Vector3(0, 0, -1);

    const bullet = createBullet(start, direction);
    if (bullet) {
      networkBullets.set(bulletData.id, bullet);
      bullets.push(bullet);
    }
  };

  networkManager.onPlayerHit = (data: {
    playerId: string;
    health: number;
    maxHealth: number;
  }) => {
    if (data.playerId === networkManager.playerId) {
      if (ship) {
        ship.health = data.health;
        ship.maxHealth = data.maxHealth;
        gsap.killTweensOf(chromaticEffect.offset);
        chromaticEffect.offset.set(0.006, 0.006);
        gsap.to(chromaticEffect.offset as unknown as object, {
          x: 0,
          y: 0,
          duration: 0.35,
          ease: "power2.out",
        });
        updateHUD();
      }
    } else {
      const remoteShip = remotePlayers.get(data.playerId);
      if (remoteShip) {
        remoteShip.health = data.health;
        remoteShip.maxHealth = data.maxHealth;
      }
    }
  };

  networkManager.onPlayerDied = (playerId: string) => {
    if (playerId === networkManager.playerId) {
      ship.velocity.set(0, 0, 0);
      ship.rotationVelocity.set(0, 0, 0);
    } else {
      const remoteShip = remotePlayers.get(playerId);
      if (remoteShip) {
        disposeShip(remoteShip);
        scene.remove(remoteShip.mesh);
        remotePlayers.delete(playerId);
      }
    }
    loadingRemotePlayers.delete(playerId);
  };

  networkManager.onPlayerRespawned = async (playerData) => {
    if (playerData.id === networkManager.playerId) {
      ship.mesh.position.set(
        playerData.position.x,
        playerData.position.y,
        playerData.position.z,
      );
      ship.mesh.rotation.set(
        playerData.rotation.x,
        playerData.rotation.y,
        playerData.rotation.z,
      );
      ship.velocity.set(0, 0, 0);
      ship.rotationVelocity.set(0, 0, 0);
      ship.health = playerData.maxHealth ?? 100;
      ship.maxHealth = playerData.maxHealth ?? 100;
      updateHUD();
    } else {
      let remoteShip = remotePlayers.get(playerData.id);
      if (!remoteShip) {
        if (!loadingRemotePlayers.has(playerData.id)) {
          loadingRemotePlayers.add(playerData.id);
          const created = await createRemoteShip(playerData.id);
          if (
            loadingRemotePlayers.has(playerData.id) &&
            !remotePlayers.has(playerData.id)
          ) {
            remotePlayers.set(playerData.id, created);
            scene.add(created.mesh);
          }
          loadingRemotePlayers.delete(playerData.id);
          remoteShip = remotePlayers.get(playerData.id) ?? created;
        }
      }
      if (!remoteShip) {
        return;
      }
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
      remoteShip.velocity.set(0, 0, 0);
      remoteShip.health = playerData.maxHealth ?? 100;
      remoteShip.maxHealth = playerData.maxHealth ?? 100;
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

async function setupHDRI(): Promise<void> {
  const rgbeLoader = new RGBELoader();
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  try {
    const hdrTex = await rgbeLoader.loadAsync(
      "/assets/textures/studio_small_08_1k.hdr",
    );
    hdrTex.mapping = THREE.EquirectangularReflectionMapping;

    const envMap = pmremGenerator.fromEquirectangular(hdrTex).texture;
    environmentTexture = envMap;

    scene.environment = envMap;
    scene.background = null;

    hdrTex.dispose();
  } catch (e) {
    console.warn("HDRI environment failed to load. Continuing without it.", e);
  } finally {
    pmremGenerator.dispose();
  }
}

function setupLighting(): void {
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

function setupPostProcessing(): void {
  composer = new EffectComposer(renderer);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  chromaticEffect = new ChromaticAberrationEffect({
    offset: new THREE.Vector2(0, 0),
    radialModulation: false,
    modulationOffset: 0,
  });

  const effectPass = new EffectPass(camera, chromaticEffect);
  composer.addPass(effectPass);
}

function updateHUD(): void {
  if (!hud) {
    hud = document.createElement("div");
    hud.style.position = "fixed";
    hud.style.bottom = "12px";
    hud.style.left = "12px";
    hud.style.color = "#fff";
    hud.style.fontFamily =
      "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    hud.style.fontSize = "18px";
    hud.style.userSelect = "none";
    hud.style.pointerEvents = "none";
    hud.style.textShadow = "0 1px 2px rgba(0,0,0,0.6)";
    document.body.appendChild(hud);
  }
  const current = ship?.health ?? 100;
  hud.textContent = `❤ ${Math.max(0, Math.floor(current))}`;
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

      gsap.killTweensOf(cameraKick);
      gsap.fromTo(
        cameraKick,
        { amount: 1.1 },
        { amount: 0, duration: 0.22, ease: "power3.out" },
      );

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
  updateHUD();
}

function updateCamera(): void {
  const offsetBaseZ = 8 + cameraKick.amount * 2.0;
  const offset = new THREE.Vector3(0, 2.5, offsetBaseZ).applyQuaternion(
    ship.mesh.quaternion,
  );
  const targetPosition = ship.mesh.position.clone().add(offset);
  camera.position.lerp(targetPosition, CONFIG.camera.followSpeed);
  camera.lookAt(ship.mesh.position);
}

function render(): void {
  composer.render();
}

function onWindowResize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  const dpr = Math.min(window.devicePixelRatio, 1.4);
  renderer.setPixelRatio(dpr);
  composer.setSize(window.innerWidth, window.innerHeight);
}
