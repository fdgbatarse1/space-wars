// loads and caches ship models builds local and remote ships updates motion and cleans up resources
// keeps shared models immutable and tracks owned materials and geometries to dispose safely
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { CONFIG } from "./config";

export interface Ship {
  mesh: THREE.Group;
  velocity: THREE.Vector3;
  rotationVelocity: THREE.Vector3;
  isRemote?: boolean;
  playerId?: string;
  health?: number;
  maxHealth?: number;
  boundingBox?: THREE.Box3;
}

const modelCache: Map<string, THREE.Group> = new Map();
const ownedMaterials = new WeakSet<THREE.Material>();
const ownedGeometries = new WeakSet<THREE.BufferGeometry>();
let blueTexture: THREE.Texture | null = null;

// reuses loaders to avoid extra workers and warm up the draco decoder once
const gltfLoader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath(
  "https://www.gstatic.com/draco/versioned/decoders/1.5.7/",
);
dracoLoader.preload();
gltfLoader.setDRACOLoader(dracoLoader);

// returns base turn speed plus a small boost on mobile/coarse pointer devices
function getTurnSpeed(): number {
  const isCoarsePointer =
    window.matchMedia?.("(pointer: coarse)").matches ?? false;
  return isCoarsePointer ? CONFIG.ship.turnSpeedTouch : CONFIG.ship.turnSpeed;
}

// returns rotation damping using a stronger factor on touch/coarse pointer devices
function getRotationDamping(): number {
  const isCoarsePointer =
    window.matchMedia?.("(pointer: coarse)").matches ?? false;
  return isCoarsePointer
    ? CONFIG.ship.rotationDampingTouch
    : CONFIG.ship.rotationDamping;
}

// returns velocity damping using a stronger factor on touch/coarse pointer devices
function getVelocityDamping(): number {
  const isCoarsePointer =
    window.matchMedia?.("(pointer: coarse)").matches ?? false;
  return isCoarsePointer
    ? CONFIG.ship.velocityDampingTouch
    : CONFIG.ship.velocityDamping;
}

// loads a glb or gltf model once and caches its root group to reuse across ships
async function loadModelOnce(modelPath: string): Promise<THREE.Group> {
  const cached = modelCache.get(modelPath);
  if (cached) {
    return cached;
  }
  const gltf = await gltfLoader.loadAsync(modelPath);
  const sceneGroup = gltf.scene as THREE.Group;
  if (!blueTexture) {
    const textureLoader = new THREE.TextureLoader();
    blueTexture = await textureLoader.loadAsync(
      "/assets/textures/Bob_Blue.png",
    );
  }
  sceneGroup.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      const material = obj.material as
        | THREE.Material
        | THREE.Material[]
        | undefined;
      if (!material) return;
      const materialsArray = Array.isArray(material) ? material : [material];
      materialsArray.forEach((mat) => {
        (mat as THREE.MeshStandardMaterial).map = blueTexture;
        mat.side = THREE.FrontSide;
        mat.needsUpdate = true;
      });
    }
  });
  modelCache.set(modelPath, sceneGroup);
  return sceneGroup;
}

// deep-clones the model optionally recolors materials freezes matrices rotates y and wraps in a parent group
function cloneShipModel(
  base: THREE.Group,
  options?: { recolor?: boolean; color?: THREE.Color | number },
): THREE.Group {
  const wrapper = new THREE.Group();
  const model = base.clone(true);
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = false;
      child.receiveShadow = false;
      child.matrixAutoUpdate = false;

      if (options?.recolor && child.material) {
        const material = (child.material as THREE.MeshStandardMaterial).clone();
        if (options.color) {
          const color =
            options.color instanceof THREE.Color
              ? options.color
              : new THREE.Color(options.color);
          material.color = color;
        }
        ownedMaterials.add(material);
        child.material = material;
      }
    }
  });
  model.rotateY(Math.PI);
  wrapper.add(model);
  return wrapper;
}

// builds the local player ship from the cached model or box fallback sets start pose and computes a bounding box
export async function createShip(): Promise<Ship> {
  let group: THREE.Group;
  try {
    const base = await loadModelOnce("/assets/models/spaceship/Bob-v1.glb");
    group = cloneShipModel(base);
  } catch (error) {
    console.error("Could not load ship model, using fallback box", error);
    group = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 0.5, 2);
    const material = new THREE.MeshBasicMaterial({ color: 0x4488ff });
    ownedGeometries.add(geometry);
    ownedMaterials.add(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    mesh.rotateY(Math.PI);
  }

  group.position.set(...CONFIG.ship.startPosition);

  const boundingBox = new THREE.Box3().setFromObject(group);

  return {
    mesh: group,
    velocity: new THREE.Vector3(),
    rotationVelocity: new THREE.Vector3(),
    health: 100,
    maxHealth: 100,
    boundingBox,
  };
}

// builds a remote player ship tinted tags with playerId and computes a bounding box
export async function createRemoteShip(playerId: string): Promise<Ship> {
  let group: THREE.Group;
  try {
    const base = await loadModelOnce("/assets/models/spaceship/Bob-v1.glb");
    group = cloneShipModel(base, {
      recolor: true,
      color: new THREE.Color(0.8, 0.8, 1.0),
    });
  } catch (error) {
    console.error(
      "Could not load remote ship model, using fallback box",
      error,
    );
    group = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 0.5, 2);
    const material = new THREE.MeshBasicMaterial({ color: 0x8844ff });
    ownedGeometries.add(geometry);
    ownedMaterials.add(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    mesh.rotateY(Math.PI);
  }

  const boundingBox = new THREE.Box3().setFromObject(group);

  return {
    mesh: group,
    velocity: new THREE.Vector3(),
    rotationVelocity: new THREE.Vector3(),
    isRemote: true,
    playerId,
    health: 100,
    maxHealth: 100,
    boundingBox,
  };
}

// integrates rotation and position with damping and clamped speed refreshes the bounding box and updates fixed matrices
export function updateShip(ship: Ship, deltaTime: number): void {
  ship.rotationVelocity.multiplyScalar(getRotationDamping());

  ship.mesh.rotation.x += ship.rotationVelocity.x * deltaTime;
  ship.mesh.rotation.y += ship.rotationVelocity.y * deltaTime;
  ship.mesh.rotation.z += ship.rotationVelocity.z * deltaTime;

  if (ship.velocity.length() > CONFIG.ship.maxVelocity) {
    ship.velocity.normalize().multiplyScalar(CONFIG.ship.maxVelocity);
  }

  ship.mesh.position.addScaledVector(ship.velocity, deltaTime);

  if (ship.boundingBox) {
    ship.boundingBox.setFromObject(ship.mesh);
  }

  ship.mesh.updateMatrix();
  ship.mesh.traverse((child) => {
    if (child instanceof THREE.Mesh && !child.matrixAutoUpdate) {
      child.updateMatrix();
    }
  });
}

// accelerates forward in the ship's facing direction
export function accelerateShip(ship: Ship, deltaTime: number): void {
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
    ship.mesh.quaternion,
  );
  const acceleration = CONFIG.ship.forwardSpeed * deltaTime;
  ship.velocity.addScaledVector(forward, acceleration);
}

// applies velocity damping to slow the ship
export function decelerateShip(ship: Ship, _deltaTime: number): void {
  ship.velocity.multiplyScalar(getVelocityDamping());
}

// adjusts pitch angular velocity based on input direction and delta time
export function pitchShip(
  ship: Ship,
  direction: number,
  deltaTime: number,
): void {
  ship.rotationVelocity.x += direction * getTurnSpeed() * deltaTime;
}

// adjusts yaw angular velocity based on input direction and delta time
export function yawShip(
  ship: Ship,
  direction: number,
  deltaTime: number,
): void {
  ship.rotationVelocity.y += direction * getTurnSpeed() * deltaTime;
}

// disposes only owned materials and geometries avoiding shared cached assets
export function disposeShip(ship: Ship): void {
  ship.mesh.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mesh = obj as THREE.Mesh;

    const material = mesh.material as THREE.Material | THREE.Material[] | null;
    if (material) {
      const materialsArray = Array.isArray(material) ? material : [material];
      materialsArray.forEach((mat) => {
        if (ownedMaterials.has(mat) && typeof mat.dispose === "function") {
          mat.dispose();
        }
      });
    }

    const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
    if (
      geometry &&
      ownedGeometries.has(geometry) &&
      typeof geometry.dispose === "function"
    ) {
      geometry.dispose();
    }
  });
}

// optionally disposes the draco decoder workers when no further draco content will be loaded
export function disposeDracoLoader(): void {
  dracoLoader.dispose();
}
