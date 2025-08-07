import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
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

async function loadModelOnce(modelPath: string): Promise<THREE.Group> {
  const cached = modelCache.get(modelPath);
  if (cached) {
    return cached;
  }
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(modelPath);
  const sceneGroup = gltf.scene as THREE.Group;
  modelCache.set(modelPath, sceneGroup);
  return sceneGroup;
}

function cloneShipModel(
  base: THREE.Group,
  options?: { recolor?: boolean; color?: THREE.Color | number },
): THREE.Group {
  const group = base.clone(true);
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
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
  return group;
}

export async function createShip(): Promise<Ship> {
  let group: THREE.Group;
  try {
    const base = await loadModelOnce("/assets/models/spaceship/Bob.gltf");
    group = cloneShipModel(base);
  } catch (error) {
    console.error("Could not load ship model, using fallback box", error);
    group = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 0.5, 2);
    const material = new THREE.MeshBasicMaterial({ color: 0x4488ff });
    ownedGeometries.add(geometry);
    ownedMaterials.add(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
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

export async function createRemoteShip(playerId: string): Promise<Ship> {
  let group: THREE.Group;
  try {
    const base = await loadModelOnce("/assets/models/spaceship/Bob.gltf");
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
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
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

export function updateShip(ship: Ship, deltaTime: number): void {
  ship.rotationVelocity.multiplyScalar(CONFIG.ship.rotationDamping);

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

export function accelerateShip(ship: Ship, deltaTime: number): void {
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
    ship.mesh.quaternion,
  );
  const acceleration = CONFIG.ship.forwardSpeed * deltaTime;
  ship.velocity.addScaledVector(forward, acceleration);
}

export function decelerateShip(ship: Ship, _deltaTime: number): void {
  ship.velocity.multiplyScalar(CONFIG.ship.velocityDamping);
}

export function pitchShip(
  ship: Ship,
  direction: number,
  deltaTime: number,
): void {
  ship.rotationVelocity.x += direction * CONFIG.ship.turnSpeed * deltaTime;
}

export function yawShip(
  ship: Ship,
  direction: number,
  deltaTime: number,
): void {
  ship.rotationVelocity.y += direction * CONFIG.ship.turnSpeed * deltaTime;
}

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
