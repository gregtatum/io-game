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
  const player = setupPlayer(scene);
  const gridPhysics = new GridPhysics(player, tilemap);
  const gridControls = new GridControls(scene.input, gridPhysics);

  /** @type {State} */
  const state = {
    socket: null,
    generation: null,
    game,
    scene,
    player,
    tilemap,
    gridPhysics,
    gridControls,
    others: new Map(),
  };

  startWebSocket(state);
  setDebugGlobal('state', state);

  scene.events.on(
    'update',
    /**
     * @param {number} time
     * @param {number} delta
     */
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
 * @returns {Player}
 */
function setupPlayer(scene) {
  const sprite = addSprite(scene);
  scene.cameras.main.startFollow(sprite);

  return new Player(sprite, 6, 8, 8);
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
  const { gridControls, gridPhysics, player, others } = state;
  if (!gridControls || !gridPhysics || !player) {
    throw new Error("Game isn't properly initialized.");
  }
  gridControls.update();
  gridPhysics.updatePlayerPosition(delta);
  sendPlayerUpdate(state);
  for (const other of others.values()) {
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

export class GridControls {
  /**
   * @param {Phaser.Input.InputPlugin} input
   * @param {GridPhysics} gridPhysics
   */
  constructor(input, gridPhysics) {
    this.input = input;
    this.gridPhysics = gridPhysics;
  }

  update() {
    const cursors = this.input.keyboard.createCursorKeys();
    if (cursors.left && cursors.left.isDown) {
      this.gridPhysics.movePlayer('left');
    } else if (cursors.right && cursors.right.isDown) {
      this.gridPhysics.movePlayer('right');
    } else if (cursors.up && cursors.up.isDown) {
      this.gridPhysics.movePlayer('up');
    } else if (cursors.down && cursors.down.isDown) {
      this.gridPhysics.movePlayer('down');
    }
  }
}

const Vector2 = Phaser.Math.Vector2;

export class GridPhysics {
  /** @type {Direction} */
  movementDirection = 'none';
  /** @type {number} */
  speedPixelsPerSecond = TILE_SIZE * 4;
  /** @type {number} */
  tileSizePixelsWalked = 0;
  decimalPlacesLeft = 0;

  /**
   * @param {Player} player
   * @param {Phaser.Tilemaps.Tilemap} tileMap
   */
  constructor(player, tileMap) {
    this.player = player;
    this.tileMap = tileMap;
  }

  /**
   * @param {Direction} direction
   * @returns {void}
   */
  movePlayer(direction) {
    if (this.movementDirection !== 'none') {
      return;
    }

    // Compute the next tile position.
    const x = (this.player.sprite.getCenter().x - PLAYER_OFFSET_X) / TILE_SIZE;
    const y = (this.player.sprite.getCenter().y - PLAYER_OFFSET_Y) / TILE_SIZE;
    const currTilePosition = new Vector2(Math.floor(x), Math.floor(y));
    const nextTilePosition = currTilePosition.add(
      ensureExists(movementDirectionVectors[direction])
    );

    if (
      // For the next tile position, is there no tile?
      !this.tileMap.layers.some((layer) =>
        this.tileMap.hasTileAt(
          nextTilePosition.x,
          nextTilePosition.y,
          layer.name
        )
      ) ||
      // Is the next tile a colliding tile?
      this.tileMap.layers.some((layer) => {
        const tile = this.tileMap.getTileAt(
          nextTilePosition.x,
          nextTilePosition.y,
          false,
          layer.name
        );
        return tile && tile.properties.collides;
      })
    ) {
      this.player.setStandingFrame(direction);
    } else {
      this.movementDirection = direction;
    }
  }

  /**
   * @param {number} delta
   * @returns {void}
   */
  updatePlayerPosition(delta) {
    if (this.movementDirection === 'none') {
      return;
    }
    const deltaInSeconds = delta / 1000;
    const speedPerDelta = this.speedPixelsPerSecond * deltaInSeconds;

    this.decimalPlacesLeft = (speedPerDelta + this.decimalPlacesLeft) % 1;
    const pixelsToWalkThisUpdate = Math.floor(
      speedPerDelta + this.decimalPlacesLeft
    );

    if (this.tileSizePixelsWalked + pixelsToWalkThisUpdate >= TILE_SIZE) {
      // Thie player will cross the tile border this update.
      this.movePlayerSprite(TILE_SIZE - this.tileSizePixelsWalked);
      this.movementDirection = 'none';
    } else {
      this.movePlayerSprite(pixelsToWalkThisUpdate);
    }
  }

  /**
   * @param {number} speed
   * @returns {void}
   */
  movePlayerSprite(speed) {
    const newPlayerPos = this.player
      .getPosition()
      .add(this.movementDistance(speed));
    this.player.setPosition(newPlayerPos);
    this.tileSizePixelsWalked += speed;
    this.updatePlayerFrame(this.movementDirection, this.tileSizePixelsWalked);
    this.tileSizePixelsWalked %= TILE_SIZE;
  }

  /**
   * @param {Direction} direction
   * @param {number} tileSizePixelsWalked
   * @returns {void}
   */
  updatePlayerFrame(direction, tileSizePixelsWalked) {
    if (tileSizePixelsWalked > TILE_SIZE / 2) {
      // The player has walked half a tile.
      this.player.setStandingFrame(direction);
    } else {
      this.player.setWalkingFrame(direction);
    }
  }

  /**
   * @param {number} speed
   * @returns {Vector2}
   */
  movementDistance(speed) {
    const vec = movementDirectionVectors[this.movementDirection];
    if (!vec) {
      throw new Error('Could not find the vector.');
    }
    return vec.clone().multiply(new Vector2(speed));
  }
}

/**
 * @typedef {Object} FrameRow
 * @prop {number} leftFoot
 * @prop {number} standing
 * @prop {number} rightFoot
 */

export class Player {
  /** @type {{ [key in Direction]?: number }} */
  directionToFrameRow = {
    ['down']: 0,
    ['left']: 1,
    ['right']: 2,
    ['up']: 3,
  };
  lastFootLeft = false;
  previousPositionSentToServer = new Vector2(Infinity, Infinity);

  /**
   * @param {Phaser.GameObjects.Sprite} sprite
   * @param {number} characterIndex
   * @param {number} startTilePosX
   * @param {number} startTilePosY
   */
  constructor(sprite, characterIndex, startTilePosX, startTilePosY) {
    this.sprite = sprite;
    this.characterIndex = characterIndex;
    this.sprite.setPosition(
      startTilePosX * TILE_SIZE + PLAYER_OFFSET_X,
      startTilePosY * TILE_SIZE + PLAYER_OFFSET_Y
    );
    this.sprite.setFrame(this.framesOfDirection('down').standing);
  }

  /** @returns {Vector2} */
  getPosition() {
    return this.sprite.getCenter();
  }

  /**
   * @param {Vector2} position
   * @returns {void}
   */
  setPosition(position) {
    this.sprite.setPosition(position.x, position.y);
  }

  /**
   * @param {Direction} direction
   * @returns {void}
   */
  setWalkingFrame(direction) {
    const frameRow = this.framesOfDirection(direction);
    this.sprite.setFrame(
      this.lastFootLeft ? frameRow.rightFoot : frameRow.leftFoot
    );
  }

  /**
   * @param {Direction} direction
   * @returns {void}
   */
  setStandingFrame(direction) {
    if (this.isCurrentFrameStanding(direction)) {
      this.lastFootLeft = !this.lastFootLeft;
    }
    this.sprite.setFrame(this.framesOfDirection(direction).standing);
  }

  /** @type {(direction: Direction) => boolean} */
  isCurrentFrameStanding(direction) {
    return (
      Number(this.sprite.frame.name) !=
      this.framesOfDirection(direction).standing
    );
  }

  /** @type {(direction: Direction) => FrameRow} */
  framesOfDirection(direction) {
    const playerCharRow = Math.floor(this.characterIndex / PLAYER_CHARS_IN_ROW);
    const playerCharCol = this.characterIndex % PLAYER_CHARS_IN_ROW;
    const framesInRow = PLAYER_CHARS_IN_ROW * PLAYER_FRAMES_PER_CHAR_ROW;
    const framesInSameRowBefore = PLAYER_FRAMES_PER_CHAR_ROW * playerCharCol;
    const dir = this.directionToFrameRow[direction];
    if (dir === undefined) {
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
  const position = player.getPosition();
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
