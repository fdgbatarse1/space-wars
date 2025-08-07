import "./reset.css";
import "./styles.css";
import { initGame } from "./game";

async function main(): Promise<void> {
  const canvas = document.querySelector("#canvas") as HTMLCanvasElement;

  await initGame(canvas);
  console.log("Game started");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}
