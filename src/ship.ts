import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CONFIG } from "./config";

export interface Ship {
  mesh: THREE.Group;
  velocity: THREE.Vector3;
  rotationVelocity: THREE.Vector3;
  isRemote?: boolean;
  playerId?: string;
}

export async function createShip(): Promise<Ship> {
  const group = new THREE.Group();

  try {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync("/assets/models/spaceship/Bob.gltf");
    const model = gltf.scene;

    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = false;
        child.matrixAutoUpdate = false;
      }
    });

    group.add(model);
  } catch (error) {
    console.error("Could not load ship model, using fallback box", error);
    const geometry = new THREE.BoxGeometry(1, 0.5, 2);
    const material = new THREE.MeshBasicMaterial({
      color: 0x4488ff,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }

  group.position.set(...CONFIG.ship.startPosition);

  return {
    mesh: group,
    velocity: new THREE.Vector3(),
    rotationVelocity: new THREE.Vector3(),
  };
}

export async function createRemoteShip(playerId: string): Promise<Ship> {
  const group = new THREE.Group();

  try {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync("/assets/models/spaceship/Bob.gltf");
    const model = gltf.scene;

    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = false;
        child.matrixAutoUpdate = false;

        if (child.material) {
          const material = (
            child.material as THREE.MeshStandardMaterial
          ).clone();
          material.color = new THREE.Color(0.8, 0.8, 1.0);
          child.material = material;
        }
      }
    });

    group.add(model);
  } catch (error) {
    console.error(
      "Could not load remote ship model, using fallback box",
      error,
    );
    const geometry = new THREE.BoxGeometry(1, 0.5, 2);
    const material = new THREE.MeshBasicMaterial({
      color: 0x8844ff,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }

  return {
    mesh: group,
    velocity: new THREE.Vector3(),
    rotationVelocity: new THREE.Vector3(),
    isRemote: true,
    playerId,
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
