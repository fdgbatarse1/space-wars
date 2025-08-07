import {
  Points,
  BufferGeometry,
  BufferAttribute,
  ShaderMaterial,
  AdditiveBlending,
} from "three";
import { CONFIG } from "./config";

const vertexShader = `
  precision mediump float;
  attribute float aSize;
  varying float vAlpha;
  
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float depth = -mvPosition.z;
    gl_PointSize = aSize * (300.0 / depth);
    vAlpha = 1.0 - smoothstep(200.0, 400.0, depth);
  }
`;

const fragmentShader = `
  precision mediump float;
  varying float vAlpha;
  
  void main() {
    vec2 center = vec2(0.5);
    float dist = length(gl_PointCoord - center);
    
    if (dist > 0.5) {
      discard;
    }
    
    float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
    gl_FragColor = vec4(1.0, 1.0, 1.0, alpha * vAlpha * 0.8);
  }
`;

export function createStarfield(): Points {
  const { count, radius } = CONFIG.starfield;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = 2.0 * Math.PI * u;
    const phi = Math.acos(2.0 * v - 1.0);
    const r = radius * (0.8 + 0.2 * Math.random());

    positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    sizes[i] = 1.0 + Math.random() * 1.5;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aSize", new BufferAttribute(sizes, 1));

  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });

  const starfield = new Points(geometry, material);
  starfield.matrixAutoUpdate = false;

  return starfield;
}

export function updateStarfield(starfield: Points, deltaTime: number): void {
  starfield.rotation.y += CONFIG.starfield.rotationSpeed * deltaTime;
  starfield.updateMatrix();
}
