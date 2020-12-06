// @ts-check
import WebSocket from 'ws';
import { BinaryWriter, BinaryReader } from '../client/shared/utils.js';
// This is used as a type.
// eslint-disable-next-line no-unused-vars
import http from 'http';

/**
 * @typedef {import("types").ServerPlayer} ServerPlayer
 * @typedef {import("types").ServerToClient} ServerToClient
 * @typedef {import("types").ClientToServer} ClientToServer
 */

const generations = {
  player: 0,
  tick: 0,
};

/** @type {Map<number, ServerPlayer>} */
const players = new Map();

const binaryWriter = new BinaryWriter();

/**
 * @param {http.Server} httpServer
 */
export function startWebsocketServer(httpServer) {
  // Hook the websocket server into the http one.
  const server = new WebSocket.Server({
    server: httpServer,
  });

  server.on('connection', handleWebSocketConnection);
}

/**
 * @param {WebSocket} socket
 * @returns {ServerPlayer}
 */
function createNewPlayer(socket) {
  const generation = generations.player++;

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
    characterIndex: 0,
    position: { x: 0, y: 0 },
    tickGeneration: 0,
    sendMessage,
  };

  return player;
}

/** @type {NodeJS.Timeout} */
let intervalId;

/**
 * @param {WebSocket} socket
 */
function handleWebSocketConnection(socket) {
  const others = [];
  for (const { generation, position, characterIndex } of players.values()) {
    others.push({ generation, x: position.x, y: position.y, characterIndex });
  }
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
      json = JSON.parse(messageRaw);
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

  console.log('New player connected', player.generation);

  player.sendMessage({
    type: 'hello',
    generation: player.generation,
    others,
  });

  if (players.size === 1) {
    // Start up the broadcast loop.
    intervalId = setInterval(broadcastBinaryTick, 16.6666);
  }

  socket.on('close', () => {
    console.log('Player disconnected', player.generation);
    players.delete(player.generation);

    broadcastJson({
      type: 'other-left',
      generation: player.generation,
    });

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
function broadcastBinaryTick() {
  // Determine which players to send updates for.
  const tickGeneration = generations.tick;
  const playersToUpdate = [];
  for (const player of players.values()) {
    if (player.tickGeneration === tickGeneration) {
      playersToUpdate.push(player);
    }
  }

  if (playersToUpdate.length === 0) {
    return;
  }

  // Only write
  binaryWriter.writeTag('broadcast-tick');
  binaryWriter.writeUint16(playersToUpdate.length);

  for (const player of playersToUpdate) {
    binaryWriter.writeUint32(player.generation);
    binaryWriter.writeFloat64(player.position.x);
    binaryWriter.writeFloat64(player.position.y);
  }
  const buffer = binaryWriter.finalize();
  for (const player of players.values()) {
    player.socket.send(buffer);
  }
  generations.tick++;
}

/**
 * Broadcast all of the relevant information in a "tick". This utility sends
 * the information in a binary serialized format to make it efficient.
 * @param {ServerToClient} message
 */
function broadcastJson(message) {
  const string = JSON.stringify(message);
  for (const player of players.values()) {
    player.socket.send(string);
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
    case 'hello-back': {
      player.characterIndex = message.characterIndex;
      players.set(player.generation, player);
      // Only broadcast that this player joined after they send the initial hello.
      broadcastJson({
        type: 'other-joined',
        other: {
          x: 0,
          y: 0,
          characterIndex: player.characterIndex,
          generation: player.generation,
        },
      });
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
      player.tickGeneration = generations.tick;
      break;
    }
    default:
      console.error('Unhandled tag', tag);
  }
}
