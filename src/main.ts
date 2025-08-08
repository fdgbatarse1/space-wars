// loads global styles and bootstraps the game when the dom is ready
// finds the canvas element and hands it to initGame to start rendering and input
import "./reset.css";
import "./styles.css";
import { initGame } from "./game";

// initializes the game by selecting the canvas and delegating setup to initGame
async function main(): Promise<void> {
  const canvas = document.querySelector("#canvas") as HTMLCanvasElement;

  await initGame(canvas);
  console.log("Game started");
}

// ensures main runs after the dom is parsed if it is already loaded run immediately
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}
