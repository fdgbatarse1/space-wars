// centralizes game tuning for physics camera and visuals tweak values here to rebalance gameplay
// uses seconds world-units and radians damping factors are per-frame multipliers in 0..1
export const CONFIG = {
  ship: {
    forwardSpeed: 15,
    backwardSpeed: 8,
    turnSpeed: 2.2,
    turnSpeedTouch: 2.8,
    velocityDamping: 0.94,
    velocityDampingTouch: 0.98,
    rotationDamping: 0.94,
    rotationDampingTouch: 0.98,
    maxVelocity: 20,
    startPosition: [0, 0.5, 0] as [number, number, number],
  },

  bullet: {
    speed: 30,
    lifetime: 1.0,
    radius: 0.06,
    color: 0xff5555,
    fireRate: 180,
  },

  starfield: {
    count: 1200,
    radius: 240,
    rotationSpeed: 0.02,
  },

  camera: {
    fov: 70,
    near: 0.1,
    far: 1000,
    position: [0, 2.5, 8] as [number, number, number],
    followSpeed: 0.12,
  },

  lighting: {
    ambient: { color: 0x404040, intensity: 0.4 },
    directional: {
      color: 0xffffff,
      intensity: 2.0,
      position: [8, 12, 6] as [number, number, number],
    },
  },

  fixedTimeStep: 1 / 60,
  maxAccumulator: 0.25,
} as const;
