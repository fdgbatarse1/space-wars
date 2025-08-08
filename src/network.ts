// manages the multiplayer networking client socket.io connection and game events
// exposes connect and disconnect periodic updates bullet firing and callbacks
import { io, Socket } from "socket.io-client";
import * as THREE from "three";
import { Ship } from "./ship";

// represents player state exchanged with the server including position rotation and velocity
interface PlayerData {
  id: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  shipModel?: string;
  health?: number;
  maxHealth?: number;
}

// represents bullet data sent and received when a bullet is fired
interface BulletData {
  id: string;
  playerId: string;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  timestamp: number;
}

// holds internal networking state and registered event callbacks
interface NetworkState {
  socket: Socket | null;
  remotePlayers: Map<string, Ship>;
  updateInterval: number | null;
  localPlayerId: string;
  onPlayerJoined: ((player: PlayerData) => void) | null;
  onPlayerLeft: ((playerId: string) => void) | null;
  onPlayerMoved: ((data: PlayerData) => void) | null;
  onBulletFired: ((bullet: BulletData) => void) | null;
  onPlayerHit:
    | ((data: { playerId: string; health: number; maxHealth: number }) => void)
    | null;
  onPlayerDied: ((playerId: string) => void) | null;
  onPlayerRespawned: ((player: PlayerData) => void) | null;
}

// stores a single shared instance for the session connection and timers
const networkState: NetworkState = {
  socket: null,
  remotePlayers: new Map(),
  updateInterval: null,
  localPlayerId: "",
  onPlayerJoined: null,
  onPlayerLeft: null,
  onPlayerMoved: null,
  onBulletFired: null,
  onPlayerHit: null,
  onPlayerDied: null,
  onPlayerRespawned: null,
};

// exposes the networking api and event hook setters
export function createNetworkManager() {
  return {
    connect,
    disconnect,
    startSendingUpdates,
    stopSendingUpdates,
    sendPositionUpdate,
    fireBullet,
    get playerId() {
      return networkState.localPlayerId;
    },
    get isConnected() {
      return networkState.socket !== null && networkState.socket.connected;
    },
    set onPlayerJoined(callback: ((player: PlayerData) => void) | null) {
      networkState.onPlayerJoined = callback;
    },
    set onPlayerLeft(callback: ((playerId: string) => void) | null) {
      networkState.onPlayerLeft = callback;
    },
    set onPlayerMoved(callback: ((data: PlayerData) => void) | null) {
      networkState.onPlayerMoved = callback;
    },
    set onBulletFired(callback: ((bullet: BulletData) => void) | null) {
      networkState.onBulletFired = callback;
    },
    set onPlayerHit(
      callback:
        | ((data: {
            playerId: string;
            health: number;
            maxHealth: number;
          }) => void)
        | null,
    ) {
      networkState.onPlayerHit = callback;
    },
    set onPlayerDied(callback: ((playerId: string) => void) | null) {
      networkState.onPlayerDied = callback;
    },
    set onPlayerRespawned(callback: ((player: PlayerData) => void) | null) {
      networkState.onPlayerRespawned = callback;
    },
  };
}

// connects to the game server captures the local player id and registers event listeners
function connect(serverUrl: string = "http://localhost:3001"): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = import.meta.env.VITE_SERVER_URL || serverUrl;

    networkState.socket = io(url, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    networkState.socket.on("connect", () => {
      console.log("Connected to server:", networkState.socket?.id);
      networkState.localPlayerId = networkState.socket?.id || "";
      setupEventListeners();
      resolve();
    });

    networkState.socket.on("connect_error", (error) => {
      console.error("Connection error:", error);
      reject(error);
    });
  });
}

// subscribes to server events and forwards them to registered callbacks
function setupEventListeners(): void {
  if (!networkState.socket) return;

  networkState.socket.on("players_list", (players: PlayerData[]) => {
    players.forEach((player) => {
      if (
        player.id !== networkState.localPlayerId &&
        networkState.onPlayerJoined
      ) {
        networkState.onPlayerJoined(player);
      }
    });
  });

  networkState.socket.on("player_joined", (player: PlayerData) => {
    if (
      player.id !== networkState.localPlayerId &&
      networkState.onPlayerJoined
    ) {
      networkState.onPlayerJoined(player);
    }
  });

  networkState.socket.on("player_left", (playerId: string) => {
    if (networkState.onPlayerLeft) {
      networkState.onPlayerLeft(playerId);
    }
  });

  networkState.socket.on("player_moved", (data: PlayerData) => {
    if (data.id !== networkState.localPlayerId && networkState.onPlayerMoved) {
      networkState.onPlayerMoved(data);
    }
  });

  networkState.socket.on("bullet_fired", (bullet: BulletData) => {
    if (networkState.onBulletFired) {
      networkState.onBulletFired(bullet);
    }
  });

  networkState.socket.on(
    "player_hit",
    (data: { playerId: string; health: number; maxHealth: number }) => {
      if (networkState.onPlayerHit) {
        networkState.onPlayerHit(data);
      }
    },
  );

  networkState.socket.on("player_died", (playerId: string) => {
    if (networkState.onPlayerDied) {
      networkState.onPlayerDied(playerId);
    }
  });

  networkState.socket.on("player_respawned", (player: PlayerData) => {
    if (networkState.onPlayerRespawned) {
      networkState.onPlayerRespawned(player);
    }
  });
}

// periodically sends local ship transforms to the server every 50ms by default
function startSendingUpdates(localShip: Ship, interval: number = 50): void {
  if (networkState.updateInterval) {
    clearInterval(networkState.updateInterval);
  }

  networkState.updateInterval = window.setInterval(() => {
    if (networkState.socket && networkState.socket.connected) {
      sendPositionUpdate(localShip);
    }
  }, interval);
}

// stops periodic position rotation and velocity updates
function stopSendingUpdates(): void {
  if (networkState.updateInterval) {
    clearInterval(networkState.updateInterval);
    networkState.updateInterval = null;
  }
}

// emits the current ship pose and velocity to the server if connected
function sendPositionUpdate(ship: Ship): void {
  if (!networkState.socket || !networkState.socket.connected) return;

  const data = {
    position: {
      x: ship.mesh.position.x,
      y: ship.mesh.position.y,
      z: ship.mesh.position.z,
    },
    rotation: {
      x: ship.mesh.rotation.x,
      y: ship.mesh.rotation.y,
      z: ship.mesh.rotation.z,
    },
    velocity: ship.velocity
      ? {
          x: ship.velocity.x,
          y: ship.velocity.y,
          z: ship.velocity.z,
        }
      : { x: 0, y: 0, z: 0 },
  };

  networkState.socket.emit("update_position", data);
}

// notifies the server that a bullet was fired with initial position and velocity
function fireBullet(position: THREE.Vector3, velocity: THREE.Vector3): void {
  if (!networkState.socket || !networkState.socket.connected) return;

  const data = {
    position: { x: position.x, y: position.y, z: position.z },
    velocity: { x: velocity.x, y: velocity.y, z: velocity.z },
  };

  networkState.socket.emit("fire_bullet", data);
}

// disconnects from the server and clears timers and remote player state
function disconnect(): void {
  stopSendingUpdates();

  if (networkState.socket) {
    networkState.socket.disconnect();
    networkState.socket = null;
  }

  networkState.remotePlayers.clear();
}
