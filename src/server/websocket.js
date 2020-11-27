// @ts-check
import WebSocket from 'ws';
import { BinaryWriter } from '../client/shared/utils.js';
const WEBSOCKET_PORT = 8080;

/**
 * @typedef {import("types").ServerPlayer} ServerPlayer
 * @typedef {import("types").ServerToClient} ServerToClient
 * @typedef {import("types").ClientToServer} ClientToServer
 */

let lastPlayerGeneration = 0;

/** @type {Map<number, ServerPlayer>} */
const players = new Map();

const binaryWriter = new BinaryWriter();

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
    position: { x: 0, y: 0 },
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
      console.error(messageRaw);
      console.error('Unable to parse the JSON of message', error);
      return;
    }
    handleMessage(json, player);
  });

  socket.send(JSON.stringify({ message: 'message from server' }));

  const intervalId = setInterval(broadcastTick, 32);

  socket.on('close', () => {
    players.delete(player.generation);
    clearInterval(intervalId);
  });
}

/**
 * Broadcast all of the relevant information in a "tick". This utility sends
 * the information in a binary serialized format to make it efficient.
 */
function broadcastTick() {
  binaryWriter.writeTag('tick');
  binaryWriter.writeUint16(players.size);

  for (const player of players.values()) {
    binaryWriter.writeUint32(player.generation);
    binaryWriter.writeFloat64(player.position.x);
    binaryWriter.writeFloat64(player.position.y);
  }
  for (const player of players.values()) {
    player.socket.send(binaryWriter.finalize());
  }
}

/**
 * @param {ClientToServer} message
 * @param {ServerPlayer} player
 */
function handleMessage(message, player) {
  switch (message.type) {
    case 'tick': {
      const { x, y } = message;
      player.position.x = x;
      player.position.y = y;
      break;
    }
    default:
  }
}
