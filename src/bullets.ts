import * as THREE from "three";
import { CONFIG } from "./config";

const MAX_BULLETS = 100;

export interface Bullet {
  velocity: THREE.Vector3;
  lifetime: number;
  active: boolean;
  instanceId: number;
  position?: THREE.Vector3;
  boundingBox?: THREE.Box3;
}

export interface BulletSystem {
  instancedMesh: THREE.InstancedMesh;
  bullets: Bullet[];
  geometry: THREE.SphereGeometry;
  material: THREE.MeshBasicMaterial;
}

let lastFireTime = 0;
let bulletSystem: BulletSystem | null = null;
const tempMatrix = new THREE.Matrix4();
const tempPosition = new THREE.Vector3();

export function createBulletSystem(): BulletSystem {
  const geometry = new THREE.SphereGeometry(CONFIG.bullet.radius, 6, 6);

  const material = new THREE.MeshBasicMaterial({
    color: CONFIG.bullet.color,
  });

  const instancedMesh = new THREE.InstancedMesh(
    geometry,
    material,
    MAX_BULLETS,
  );
  instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  instancedMesh.frustumCulled = false;

  for (let i = 0; i < MAX_BULLETS; i++) {
    tempMatrix.makeScale(0, 0, 0);
    instancedMesh.setMatrixAt(i, tempMatrix);
  }
  instancedMesh.instanceMatrix.needsUpdate = true;

  const bullets: Bullet[] = [];
  for (let i = 0; i < MAX_BULLETS; i++) {
    bullets.push({
      velocity: new THREE.Vector3(),
      lifetime: 0,
      active: false,
      instanceId: i,
    });
  }

  bulletSystem = {
    instancedMesh,
    bullets,
    geometry,
    material,
  };

  return bulletSystem;
}

export function createBullet(
  position: THREE.Vector3,
  direction: THREE.Vector3,
): Bullet | null {
  if (!bulletSystem) return null;

  const bullet = bulletSystem.bullets.find((b) => !b.active);
  if (!bullet) return null;

  bullet.active = true;
  bullet.velocity.copy(direction).multiplyScalar(CONFIG.bullet.speed);
  bullet.lifetime = 0;
  bullet.position = position.clone();

  const bulletSize = CONFIG.bullet.radius * 2;
  bullet.boundingBox = new THREE.Box3(
    new THREE.Vector3(-bulletSize, -bulletSize, -bulletSize),
    new THREE.Vector3(bulletSize, bulletSize, bulletSize),
  );
  bullet.boundingBox.translate(position);

  tempMatrix.makeTranslation(position.x, position.y, position.z);
  bulletSystem.instancedMesh.setMatrixAt(bullet.instanceId, tempMatrix);
  bulletSystem.instancedMesh.instanceMatrix.needsUpdate = true;

  return bullet;
}

export function updateBullets(
  bullets: Bullet[],
  deltaTime: number,
  _scene: THREE.Scene,
): Bullet[] {
  if (!bulletSystem) return bullets;

  let needsUpdate = false;

  const bs = bulletSystem;
  bulletSystem.bullets.forEach((bullet) => {
    if (!bullet.active) return;

    bullet.lifetime += deltaTime;

    if (bullet.lifetime > CONFIG.bullet.lifetime) {
      tempMatrix.makeScale(0, 0, 0);
      bs.instancedMesh.setMatrixAt(bullet.instanceId, tempMatrix);
      bullet.active = false;
      needsUpdate = true;
      return;
    }

    bs.instancedMesh.getMatrixAt(bullet.instanceId, tempMatrix);
    tempPosition.setFromMatrixPosition(tempMatrix);
    tempPosition.addScaledVector(bullet.velocity, deltaTime);
    tempMatrix.setPosition(tempPosition);
    bs.instancedMesh.setMatrixAt(bullet.instanceId, tempMatrix);

    if (bullet.position) {
      bullet.position.copy(tempPosition);
    }
    if (bullet.boundingBox && bullet.position) {
      const bulletSize = CONFIG.bullet.radius * 2;
      bullet.boundingBox.min.set(
        bullet.position.x - bulletSize,
        bullet.position.y - bulletSize,
        bullet.position.z - bulletSize,
      );
      bullet.boundingBox.max.set(
        bullet.position.x + bulletSize,
        bullet.position.y + bulletSize,
        bullet.position.z + bulletSize,
      );
    }

    needsUpdate = true;
  });

  if (needsUpdate) {
    bs.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  return bulletSystem.bullets.filter((b) => b.active);
}

export function canFire(): boolean {
  const now = Date.now();
  if (now - lastFireTime > CONFIG.bullet.fireRate) {
    lastFireTime = now;
    return true;
  }
  return false;
}

export function getBulletSystem(): BulletSystem | null {
  return bulletSystem;
}

export function disposeBulletSystem(): void {
  if (!bulletSystem) return;

  bulletSystem.geometry.dispose();
  bulletSystem.material.dispose();
  bulletSystem.instancedMesh.dispose();
  bulletSystem = null;
}
