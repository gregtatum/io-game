// @ts-check
import WebSocket from 'ws';
import { BinaryWriter, BinaryReader } from '../client/shared/utils.js';
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

  /**
   * @param {ServerToClient} message
   */
  function sendMessage(message) {
    socket.send(JSON.stringify(message));
  }

  /** @type {ServerPlayer} */
  const player = {
    socket,
    generation,
    position: { x: 0, y: 0 },
    sendMessage,
  };

  players.set(generation, player);

  return player;
}

/** @type {NodeJS.Timeout} */
let intervalId;

/**
 * @param {WebSocket} socket
 */
function handleWebSocketConnection(socket) {
  const player = createNewPlayer(socket);

  socket.on('message', (messageRaw) => {
    if (messageRaw instanceof Buffer) {
      /** @type {Buffer} */
      handleBinaryMessage(messageRaw, player);
      return;
    }
    if (typeof messageRaw !== 'string') {
      console.error('Received an unknown message');
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
    handleJsonMessage(json, player);
  });

  player.sendMessage({
    type: 'hello',
    generation: player.generation,
  });

  if (players.size === 1) {
    // Start up the broadcast loop.
    intervalId = setInterval(broadcastTick, 1000);
  }

  socket.on('close', () => {
    players.delete(player.generation);

    if (players.size === 0) {
      // Don't do a broadcast loop if there are no players.
      clearInterval(intervalId);
    }
  });
}

/**
 * Broadcast all of the relevant information in a "tick". This utility sends
 * the information in a binary serialized format to make it efficient.
 */
function broadcastTick() {
  binaryWriter.writeTag('broadcast-tick');
  binaryWriter.writeUint16(players.size);

  for (const player of players.values()) {
    binaryWriter.writeUint32(player.generation);
    binaryWriter.writeFloat64(player.position.x);
    binaryWriter.writeFloat64(player.position.y);
  }
  const buffer = binaryWriter.finalize();
  for (const player of players.values()) {
    player.socket.send(buffer);
  }
}

/**
 * @param {ClientToServer} message
 * @param {ServerPlayer} player
 */
function handleJsonMessage(message, player) {
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

/**
 * @param {Buffer} buffer
 * @param {ServerPlayer} player
 */
function handleBinaryMessage(buffer, player) {
  const reader = new BinaryReader(buffer);
  const tag = reader.readTag();
  switch (tag) {
    case 'player-update': {
      player.position.x = reader.readFloat64();
      player.position.y = reader.readFloat64();
      break;
    }
    default:
      console.error('Unhandled tag', tag);
  }
}
