// @ts-check
import WebSocket from 'ws';
const WEBSOCKET_PORT = 8080;

/**
 * @typedef {import("types").ServerPlayer} ServerPlayer
 * @typedef {import("types").ServerToClient} ServerToClient
 * @typedef {import("types").ClientToServer} ClientToServer
 */

let lastPlayerGeneration = 0;

/** @type {Map<number, ServerPlayer>} */
const players = new Map();

export function startWebsocketStart() {
  const server = new WebSocket.Server({
    port: WEBSOCKET_PORT,
  });

  console.log(
    `Starting websocket server at http://localhost:${WEBSOCKET_PORT}`
  );

  server.on('connection', handleWebSocketConnection);
}

/**
 * @param {WebSocket} socket
 * @returns {ServerPlayer}
 */
function createNewPlayer(socket) {
  const generation = lastPlayerGeneration++;

  /** @type {ServerPlayer} */
  const player = {
    socket,
    generation,
    broadcast: {
      position: { x: 0, y: 0 },
    },
  };

  players.set(generation, player);

  return player;
}

/**
 * @param {WebSocket} socket
 */
function handleWebSocketConnection(socket) {
  const player = createNewPlayer(socket);

  socket.on('message', (messageRaw) => {
    if (typeof messageRaw !== 'string') {
      console.error('Unknown message', messageRaw);
      return;
    }
    /** @type {any} */
    let json;
    try {
      const json = JSON.parse(messageRaw);
      if (!json || typeof json !== 'object') {
        console.error('Unknown message', messageRaw);
        return;
      }
    } catch (error) {
      console.error('Unable to parse the JSON of  maessage', error);
    }
    handleMessage(json, player);
  });

  socket.send(JSON.stringify({ message: 'message from server' }));

  socket.on('close', () => {
    players.delete(player.generation);
  });
}

/**
 * @param {ClientToServer} message
 * @param {ServerPlayer} _player
 */
function handleMessage(message, _player) {
  switch (message.type) {
    case 'tick': {
      const { x, y } = message;
      break;
    }
    default:
  }
}

/**
 * @param {ServerToClient} message
 */
function broadcast(message) {}
