// tracks pressed keys and basic touch and drag gestures for keyboard and pointer input
// controls: w/s pitch a/d yaw shift accelerates space fires on touch drag to steer hold to accelerate double-tap to fire
const keys = new Set<string>();

let isPointerDown = false;
let lastPointerX = 0;
let lastPointerY = 0;
let accumulatedDeltaX = 0;
let accumulatedDeltaY = 0;
let fireRequested = false;
let lastTapTimeMs = 0;

export interface InputState {
  pitchUp: boolean;
  pitchDown: boolean;
  yawLeft: boolean;
  yawRight: boolean;
  accelerate: boolean;
  fire: boolean;
}

// sets up listeners to track the currently pressed keys stored as lowercase
export function setupInput(): void {
  window.addEventListener("keydown", (e) => {
    keys.add(e.key.toLowerCase());
  });

  window.addEventListener("keyup", (e) => {
    keys.delete(e.key.toLowerCase());
  });

  const canvas = document.querySelector("#canvas") as HTMLCanvasElement | null;
  const target: EventTarget = canvas ?? window;

  const onPointerDown = (e: Event): void => {
    const evt = e as PointerEvent;
    isPointerDown = true;
    lastPointerX = evt.clientX;
    lastPointerY = evt.clientY;
    accumulatedDeltaX = 0;
    accumulatedDeltaY = 0;

    const now = performance.now();
    if (now - lastTapTimeMs < 250) {
      fireRequested = true;
    }
    lastTapTimeMs = now;
  };

  const onPointerMove = (e: Event): void => {
    const evt = e as PointerEvent;
    if (!isPointerDown) return;
    const dx = evt.clientX - lastPointerX;
    const dy = evt.clientY - lastPointerY;
    accumulatedDeltaX += dx;
    accumulatedDeltaY += dy;
    lastPointerX = evt.clientX;
    lastPointerY = evt.clientY;
  };

  const onPointerUp = (): void => {
    isPointerDown = false;
    accumulatedDeltaX = 0;
    accumulatedDeltaY = 0;
  };

  target.addEventListener("pointerdown", onPointerDown, {
    passive: true,
  } as AddEventListenerOptions);
  target.addEventListener("pointermove", onPointerMove, {
    passive: true,
  } as AddEventListenerOptions);
  target.addEventListener("pointerup", onPointerUp, {
    passive: true,
  } as AddEventListenerOptions);
  target.addEventListener("pointercancel", onPointerUp, {
    passive: true,
  } as AddEventListenerOptions);
}

// produces a snapshot of the current input state by mapping tracked keys to game actions
export function getInput(): InputState {
  const isCoarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const threshold = isCoarse ? 1 : 6;

  const pointerYawLeft = accumulatedDeltaX < -threshold;
  const pointerYawRight = accumulatedDeltaX > threshold;
  const pointerPitchUp = accumulatedDeltaY < -threshold;
  const pointerPitchDown = accumulatedDeltaY > threshold;

  const state: InputState = {
    pitchUp: keys.has("w") || pointerPitchUp,
    pitchDown: keys.has("s") || pointerPitchDown,
    yawLeft: keys.has("a") || pointerYawLeft,
    yawRight: keys.has("d") || pointerYawRight,
    accelerate: keys.has("shift") || isPointerDown,
    fire: keys.has(" ") || fireRequested,
  };

  fireRequested = false;
  accumulatedDeltaX *= 0.5;
  accumulatedDeltaY *= 0.5;

  return state;
}

// clears all tracked input useful on teardown or when resetting the scene
export function cleanupInput(): void {
  keys.clear();
}
