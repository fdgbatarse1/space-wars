const keys = new Set<string>();

export interface InputState {
  pitchUp: boolean;
  pitchDown: boolean;
  yawLeft: boolean;
  yawRight: boolean;
  accelerate: boolean;
  fire: boolean;
}

export function setupInput(): void {
  window.addEventListener("keydown", (e) => {
    keys.add(e.key.toLowerCase());
  });

  window.addEventListener("keyup", (e) => {
    keys.delete(e.key.toLowerCase());
  });
}

export function getInput(): InputState {
  return {
    pitchUp: keys.has("w"),
    pitchDown: keys.has("s"),
    yawLeft: keys.has("a"),
    yawRight: keys.has("d"),
    accelerate: keys.has("shift"),
    fire: keys.has(" "),
  };
}

export function cleanupInput(): void {
  keys.clear();
}
