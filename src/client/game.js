// @ts-check
import {
  BinaryReader,
  BinaryWriter,
  setDebugGlobal,
  lerp,
  ensureExists,
} from './shared/utils.js';
import { $ } from './selectors.js';

/**
 * @typedef {Phaser.Math.Vector2} Vector2
 * @typedef {import("types").ServerPlayer} ServerPlayer
 * @typedef {import("types").ServerToClient} ServerToClient
 * @typedef {import("types").ClientToServer} ClientToServer
 * @typedef {import("types").Direction} Direction
 * @typedef {import("types").State} State
 * @typedef {import('types').OtherPlayer} OtherPlayer
 * @typedef {import('types').Player} Player
 */

const CANVAS_WIDTH = 720;
const CANVAS_HEIGHT = 528;
const TILE_SIZE = 48;
const PLAYER_SPRITE_FRAME_WIDTH = 52;
const PLAYER_SPRITE_FRAME_HEIGHT = 72;
const PLAYER_SCALE_FACTOR = 1.5;
const PLAYER_CHARS_IN_ROW = 4;
const PLAYER_FRAMES_PER_CHAR_ROW = 3;
const PLAYER_FRAMES_PER_CHAR_COL = 4;
const PLAYER_OFFSET_X = TILE_SIZE / 2;
const PLAYER_OFFSET_Y =
  -((PLAYER_SPRITE_FRAME_HEIGHT * PLAYER_SCALE_FACTOR) % TILE_SIZE) / 2;
const SPEED_PIXELS_PER_SECOND = TILE_SIZE * 4;

getInitialState();

/**
 * @returns {Promise<State>}
 */
async function getInitialState() {
  const { resolve, promise: createPromise } = createDeferredPromise();

  /** @type {Phaser.Game} */
  const game = new Phaser.Game({
    title: 'IO Game',
    render: {
      antialias: false,
    },
    type: Phaser.AUTO,
    scene: {
      active: false,
      visible: false,
      key: 'Game',
      create: resolve,
      preload: () => preload(game.scene.scenes[0]),
    },
    scale: {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    backgroundColor: '#48C4F8',
  });

  await createPromise;

  /** @type {Phaser.Scene} */
  const scene = game.scene.scenes[0];
  const tilemap = setupTilemap(scene);
  const player = createPlayer(scene);

  /** @type {State} */
  const state = {
    socket: null,
    generation: null,
    game,
    scene,
    player,
    tilemap,
    others: new Map(),
  };

  startWebSocket(state);
  setDebugGlobal('state', state);

  scene.events.on(
    'update',
    /** @type {(time: number, delta: number) => void} */
    (time, delta) => {
      update(state, time, delta);
    }
  );

  return state;
}

/**
 * @returns {{ promise: Promise<void>, resolve: () => void }}
 */
function createDeferredPromise() {
  /** @type {() => void} */
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  // @ts-ignore - This is actually being assigned.
  return { promise, resolve };
}

/**
 * @param {Phaser.Scene} scene
 * @returns {Phaser.GameObjects.Sprite}
 */
function addSprite(scene) {
  const sprite = scene.add.sprite(0, 0, 'player');
  sprite.setDepth(2);
  sprite.scale = PLAYER_SCALE_FACTOR;
  return sprite;
}

/**
 * @param {Phaser.Scene} scene
 * @returns {Phaser.Tilemaps.Tilemap}
 */
function setupTilemap(scene) {
  const tilemap = scene.make.tilemap({ key: 'cloud-city-map' });
  tilemap.addTilesetImage('Cloud City', 'tiles');
  for (let i = 0; i < tilemap.layers.length; i++) {
    const layer = tilemap.createStaticLayer(i, 'Cloud City', 0, 0);
    layer.setDepth(i);
    layer.scale = 3;
  }
  return tilemap;
}

/**
 * @param {State} state,
 * @param {number} _time
 * @param {number} delta
 */
function update(state, _time, delta) {
  updatePlayerFromControls(state);
  updatePlayerPosition(state, delta);
  sendPlayerUpdate(state);
  updateOtherPlayersPositions(state);
}

/**
 * @param {State} state
 */
function updateOtherPlayersPositions(state) {
  for (const other of state.others.values()) {
    other.sprite.x = lerp(other.sprite.x, other.x, 0.5);
    other.sprite.y = lerp(other.sprite.y, other.y, 0.5);
  }
}

/**
 * @param {Phaser.Scene} scene
 */
function preload(scene) {
  scene.load.image('tiles', 'assets/cloud_tileset.png');
  scene.load.tilemapTiledJSON('cloud-city-map', 'assets/cloud_city.json');
  scene.load.spritesheet('player', 'assets/characters.png', {
    frameWidth: PLAYER_SPRITE_FRAME_WIDTH,
    frameHeight: PLAYER_SPRITE_FRAME_HEIGHT,
  });
}

/**
 * @typedef {ReturnType<typeof getInitialState>}
 */

/**
 * @param {State} state
 */
function startWebSocket(state) {
  const url = 'ws://' + location.host;
  const socket = new WebSocket(url);

  socket.addEventListener('close', (event) => {
    console.log('WebSocket closed', event);
    state.socket = null;
  });

  socket.addEventListener('error', (event) => {
    console.error(event);
  });

  socket.addEventListener('open', () => {
    console.log('WebSocket connection opened.', url);
    state.socket = socket;
  });

  socket.addEventListener(
    'message',
    /** @param {MessageEvent<Blob | string>} event */
    (event) => {
      const { data } = event;
      if (typeof data === 'string') {
        readJsonMessage(state, JSON.parse(data));
      } else {
        data.arrayBuffer().then((data) => readBinaryMessage(state, data));
      }
    }
  );
}

/** @type {{[key: string]: Phaser.Math.Vector2}} */
const movementDirectionVectors = {
  up: Phaser.Math.Vector2.UP,
  down: Phaser.Math.Vector2.DOWN,
  left: Phaser.Math.Vector2.LEFT,
  right: Phaser.Math.Vector2.RIGHT,
};
/**
 * @param {State} state
 */
function updatePlayerFromControls(state) {
  const cursors = state.scene.input.keyboard.createCursorKeys();
  if (cursors.left && cursors.left.isDown) {
    movePlayer(state, 'left');
  } else if (cursors.right && cursors.right.isDown) {
    movePlayer(state, 'right');
  } else if (cursors.up && cursors.up.isDown) {
    movePlayer(state, 'up');
  } else if (cursors.down && cursors.down.isDown) {
    movePlayer(state, 'down');
  }
}

const Vector2 = Phaser.Math.Vector2;

/**
 * When the player is standing still, this function determines if the player
 * can continue moving in that direction.
 *
 * @param {State} state
 * @param {Direction} direction
 * @returns {void}
 */
function movePlayer(state, direction) {
  const { player, tilemap } = state;
  if (player.movementDirection !== 'none') {
    return;
  }

  // Compute the next tile position.
  const dirVector = ensureExists(movementDirectionVectors[direction]);
  const nextTileX =
    Math.floor((player.sprite.getCenter().x - PLAYER_OFFSET_X) / TILE_SIZE) +
    dirVector.x;
  const nextTileY =
    Math.floor((player.sprite.getCenter().y - PLAYER_OFFSET_Y) / TILE_SIZE) +
    dirVector.y;

  if (
    // For the next tile position, is there no tile?
    !tilemap.layers.some((layer) =>
      tilemap.hasTileAt(nextTileX, nextTileY, layer.name)
    ) ||
    // Is the next tile a colliding tile?
    tilemap.layers.some((layer) => {
      const tile = tilemap.getTileAt(nextTileX, nextTileY, false, layer.name);
      return tile && tile.properties.collides;
    })
  ) {
    setStandingFrame(state, direction);
  } else {
    player.movementDirection = direction;
  }
}

/**
 * @param {State} state
 * @param {number} speed
 * @returns {void}
 */
function movePlayerSprite(state, speed) {
  const { player } = state;
  const newPlayerPos = player.sprite
    .getCenter()
    .add(
      ensureExists(movementDirectionVectors[player.movementDirection])
        .clone()
        .multiply(new Vector2(speed))
    );
  player.sprite.setPosition(newPlayerPos.x, newPlayerPos.y);
  player.tileSizePixelsWalked += speed;

  if (player.tileSizePixelsWalked > TILE_SIZE / 2) {
    // The player has walked half a tile.
    setStandingFrame(state, player.movementDirection);
  } else {
    setWalkingFrame(state, player.movementDirection);
  }

  player.tileSizePixelsWalked %= TILE_SIZE;
}

/**
 * @param {State} state
 * @param {number} delta
 * @returns {void}
 */
function updatePlayerPosition(state, delta) {
  const { player } = state;
  if (player.movementDirection === 'none') {
    // This player is not moving, no reason to update the position.
    return;
  }
  const deltaInSeconds = delta / 1000;
  const speedPerDelta = SPEED_PIXELS_PER_SECOND * deltaInSeconds;

  player.decimalPlacesLeft = (speedPerDelta + player.decimalPlacesLeft) % 1;
  const pixelsToWalkThisUpdate = Math.floor(
    speedPerDelta + player.decimalPlacesLeft
  );

  if (player.tileSizePixelsWalked + pixelsToWalkThisUpdate >= TILE_SIZE) {
    // Thie player will cross the tile border this update.
    movePlayerSprite(state, TILE_SIZE - player.tileSizePixelsWalked);
    player.movementDirection = 'none';
  } else {
    movePlayerSprite(state, pixelsToWalkThisUpdate);
  }
}

/**
 * @typedef {Object} FrameRow
 * @prop {number} leftFoot
 * @prop {number} standing
 * @prop {number} rightFoot
 */

/**
 * @param {Phaser.Scene} scene
 * @returns {Player}
 */
function createPlayer(scene) {
  const sprite = addSprite(scene);
  scene.cameras.main.startFollow(sprite);

  const characterIndex = 6;
  const startTilePosX = 8;
  const startTilePosY = 8;

  sprite.setPosition(
    startTilePosX * TILE_SIZE + PLAYER_OFFSET_X,
    startTilePosY * TILE_SIZE + PLAYER_OFFSET_Y
  );
  sprite.setFrame(getFrameIndexFromDirection(characterIndex, 'down').standing);

  return {
    sprite,
    previousPositionSentToServer: new Vector2(Infinity, Infinity),
    lastFootLeft: false,
    characterIndex,
    movementDirection: 'none',
    tileSizePixelsWalked: 0,
    decimalPlacesLeft: 0,
  };
}

/**
 * @param {State} state
 * @param {Direction} direction
 * @returns {void}
 */
function setWalkingFrame(state, direction) {
  const { player } = state;
  const frameRow = getFrameIndexFromDirection(player.characterIndex, direction);
  player.sprite.setFrame(
    player.lastFootLeft ? frameRow.rightFoot : frameRow.leftFoot
  );
}

/**
 * @param {State} state
 * @param {Direction} direction
 * @returns {void}
 */
function setStandingFrame(state, direction) {
  const { player } = state;
  if (
    // Is current frame standing?
    Number(player.sprite.frame.name) !=
    getFrameIndexFromDirection(player.characterIndex, direction).standing
  ) {
    player.lastFootLeft = !player.lastFootLeft;
  }
  player.sprite.setFrame(
    getFrameIndexFromDirection(player.characterIndex, direction).standing
  );
}

/**
 * @param {number} characterIndex
 * @param {Direction} direction
 * @returns {FrameRow}
 */
function getFrameIndexFromDirection(characterIndex, direction) {
  const playerCharRow = Math.floor(characterIndex / PLAYER_CHARS_IN_ROW);
  const playerCharCol = characterIndex % PLAYER_CHARS_IN_ROW;
  const framesInRow = PLAYER_CHARS_IN_ROW * PLAYER_FRAMES_PER_CHAR_ROW;
  const framesInSameRowBefore = PLAYER_FRAMES_PER_CHAR_ROW * playerCharCol;
  let dir;
  switch (direction) {
    case 'down':
      dir = 0;
      break;
    case 'left':
      dir = 1;
      break;
    case 'right':
      dir = 2;
      break;
    case 'up':
      dir = 3;
      break;
    default:
      throw new Error('Could not find the direction.');
  }
  const rows = dir + playerCharRow * PLAYER_FRAMES_PER_CHAR_COL;
  const startFrame = framesInSameRowBefore + rows * framesInRow;
  return {
    leftFoot: startFrame,
    standing: startFrame + 1,
    rightFoot: startFrame + 2,
  };
}

const binaryWriter = new BinaryWriter();

/**
 * @param {State} state
 */
function sendPlayerUpdate(state) {
  const { player, socket } = state;
  if (!socket) {
    return;
  }
  const position = player.sprite.getCenter();
  const { previousPositionSentToServer } = player;

  // Guard against sending unneeded updates.
  if (position.equals(previousPositionSentToServer)) {
    // Nothing to update.
    return;
  }
  previousPositionSentToServer.copy(position);

  binaryWriter.writeTag('player-update');
  binaryWriter.writeFloat64(position.x);
  binaryWriter.writeFloat64(position.y);
  socket.send(binaryWriter.finalize());
}

/**
 * @param {State} state
 * @param {ArrayBuffer} data
 */
function readBinaryMessage(state, data) {
  const binary = new BinaryReader(new Uint8Array(data));
  switch (binary.readTag()) {
    case 'broadcast-tick':
      {
        const playerGeneration = $.getPlayerGeneration(state);
        const othersCount = binary.readUint16();

        // Update all the other player's information.
        for (let i = 0; i < othersCount; i++) {
          const generation = binary.readUint32();

          if (generation === playerGeneration) {
            // This is our current player, skip the data.
            binary.readFloat64();
            binary.readFloat64();
            continue;
          }

          // Get or create the other.
          const other = ensureExists(
            state.others.get(generation),
            'Expected another player to exist when updating'
          );

          // Update the values.
          other.x = binary.readFloat64();
          other.y = binary.readFloat64();
        }
      }
      break;
    default:
      throw new Error('Unknown broadcast tag.');
  }
}

/**
 * @param {State} state
 * @param {ServerToClient} message
 */
function readJsonMessage(state, message) {
  switch (message.type) {
    case 'hello':
      {
        state.generation = message.generation;
        const others = new Map();
        for (const other of message.others) {
          others.set(other.generation, {
            ...other,
            sprite: addSprite(state.scene),
          });
        }
        state.others = others;
      }
      break;
    case 'other-joined':
      {
        const { other } = message;
        // This message is broadcast to everyone, so only add
        // it if it's not the current player.
        if (other.generation !== state.generation) {
          state.others.set(other.generation, {
            ...other,
            sprite: addSprite(state.scene),
          });
        }
      }
      break;
    case 'other-left':
      {
        const other = ensureExists(
          state.others.get(message.generation),
          'A message was received that a player left, but that player could not be found.'
        );
        other.sprite.destroy();
        state.others.delete(message.generation);
      }
      break;
    default:
  }
}
