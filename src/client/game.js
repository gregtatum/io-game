import { BinaryReader, BinaryWriter, doOnce } from './shared/utils.js';
// @ts-check

/**
 * @typedef {import("types").ServerPlayer} ServerPlayer
 * @typedef {import("types").ServerToClient} ServerToClient
 * @typedef {import("types").ClientToServer} ClientToServer
 * @typedef {import("types").Direction} Direction
 * @typedef {import("types").State} State
 * @typedef {Phaser.Math.Vector2} Vector2
 */

const CANVAS_WIDTH = 720;
const CANVAS_HEIGHT = 528;
const TILE_SIZE = 48;

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
      update: (time, delta) => update(state, time, delta),
    },
    scale: {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    backgroundColor: '#48C4F8',
  });

  await createPromise;

  const scene = game.scene.scenes[0];
  const tilemap = setupTilemap(scene);
  const player = setupPlayer(scene);
  const gridPhysics = new GridPhysics(player, tilemap);
  const gridControls = new GridControls(scene.input, gridPhysics);

  /** @type {State} */
  const state = {
    game,
    scene,
    player,
    tilemap,
    gridPhysics,
    gridControls,
    others: new Map(),
  };

  setDebugGlobal('state', state);

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
 * @returns {Player}
 */
function setupPlayer(scene) {
  const playerSprite = scene.add.sprite(0, 0, 'player');
  playerSprite.setDepth(2);
  scene.cameras.main.startFollow(playerSprite);

  return new Player(playerSprite, 6, 8, 8);
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
  const { gridControls, gridPhysics, player } = state;
  if (!gridControls || !gridPhysics || !player) {
    throw new Error("Game isn't properly initialized.");
  }
  gridControls.update();
  gridPhysics.update(delta);
  sendPlayerUpdate(player);
}

/**
 * @param {Phaser.Scene} scene
 */
function preload(scene) {
  scene.load.image('tiles', 'assets/cloud_tileset.png');
  scene.load.tilemapTiledJSON('cloud-city-map', 'assets/cloud_city.json');
  scene.load.spritesheet('player', 'assets/characters.png', {
    frameWidth: Player.SPRITE_FRAME_WIDTH,
    frameHeight: Player.SPRITE_FRAME_HEIGHT,
  });
}

/**
 * @typedef {ReturnType<typeof getInitialState>}
 */

/**
 * @param {string} key
 * @param {unknown} value
 */
function setDebugGlobal(key, value) {
  console.log('Global: ' + key);
  // @ts-ignore
  window[key] = value;
}

const socket = new WebSocket('ws://127.0.0.1:8080');

socket.addEventListener('close', (event) => {
  console.log('WebSocket closed', event);
});

socket.addEventListener('error', (event) => {
  console.error(event);
});

socket.addEventListener('open', () => {
  console.log('open');
  socket.send('"Hello Server!"');
});

socket.addEventListener(
  'message',
  /** @param {MessageEvent<Blob | string>} event */
  (event) => {
    const { data } = event;
    if (typeof data === 'string') {
      readJsonMessage(JSON.parse(data));
    } else {
      data.arrayBuffer().then(readBinaryMessage);
    }
  }
);

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
    if (this.isMoving()) return;
    if (this.isBlockingDirection(direction)) {
      this.player.setStandingFrame(direction);
    } else {
      this.startMoving(direction);
    }
  }

  /**
   * @param {number} delta
   * @returns {void}
   */
  update(delta) {
    if (this.isMoving()) {
      this.updatePlayerPosition(delta);
    }
  }

  /**
   * @returns {boolean}
   */
  isMoving() {
    return this.movementDirection != 'none';
  }

  /**
   * @param {Direction} direction
   * @returns {void}
   */
  startMoving(direction) {
    this.movementDirection = direction;
  }

  /**
   * @param {Direction} direction
   * @returns {Vector2}
   */
  tilePosInDirection(direction) {
    const vec = movementDirectionVectors[direction];
    if (!vec) {
      throw new Error('Could not find the vector.');
    }
    return this.player.getTilePos().add(vec);
  }

  /**
   * @param {Direction} direction
   * @returns {boolean}
   */
  isBlockingDirection(direction) {
    return this.hasBlockingTile(this.tilePosInDirection(direction));
  }

  /**
   * @param {Vector2} pos
   * @returns {boolean}
   */
  hasNoTile(pos) {
    return !this.tileMap.layers.some((layer) =>
      this.tileMap.hasTileAt(pos.x, pos.y, layer.name)
    );
  }

  /**
   * @param {Vector2} pos
   * @returns {boolean}
   */
  hasBlockingTile(pos) {
    if (this.hasNoTile(pos)) {
      return true;
    }

    return this.tileMap.layers.some((layer) => {
      const tile = this.tileMap.getTileAt(pos.x, pos.y, false, layer.name);
      return tile && tile.properties.collides;
    });
  }

  /**
   * @param {number} delta
   * @returns {void}
   */
  updatePlayerPosition(delta) {
    this.decimalPlacesLeft = this.getDecimalPlaces(
      this.getSpeedPerDelta(delta) + this.decimalPlacesLeft
    );
    const pixelsToWalkThisUpdate = this.getIntegerPart(
      this.getSpeedPerDelta(delta) + this.decimalPlacesLeft
    );

    if (this.willCrossTileBorderThisUpdate(pixelsToWalkThisUpdate)) {
      this.movePlayerSpriteRestOfTile();
    } else {
      this.movePlayerSprite(pixelsToWalkThisUpdate);
    }
  }

  /**
   * @param {number} float
   * @returns {number}
   */
  getIntegerPart(float) {
    return Math.floor(float);
  }

  /**
   * @param {number} float
   * @returns {number}
   */
  getDecimalPlaces(float) {
    return float % 1;
  }

  /**
   * @param {number} delta
   * @returns {number}
   */
  getSpeedPerDelta(delta) {
    const deltaInSeconds = delta / 1000;
    return this.speedPixelsPerSecond * deltaInSeconds;
  }

  /**
   * @param {number} pixelsToWalkThisUpdate
   * @returns {boolean}
   */
  willCrossTileBorderThisUpdate(pixelsToWalkThisUpdate) {
    return this.tileSizePixelsWalked + pixelsToWalkThisUpdate >= TILE_SIZE;
  }

  /**
   * @returns {void}
   */
  movePlayerSpriteRestOfTile() {
    this.movePlayerSprite(TILE_SIZE - this.tileSizePixelsWalked);
    this.stopMoving();
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
    if (this.hasWalkedHalfATile(tileSizePixelsWalked)) {
      this.player.setStandingFrame(direction);
    } else {
      this.player.setWalkingFrame(direction);
    }
  }

  /**
   * @param {number} tileSizePixelsWalked
   * @returns {boolean}
   */
  hasWalkedHalfATile(tileSizePixelsWalked) {
    return tileSizePixelsWalked > TILE_SIZE / 2;
  }

  /**
   * @returns {void}
   */
  stopMoving() {
    this.movementDirection = 'none';
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
  static SPRITE_FRAME_WIDTH = 52;
  static SPRITE_FRAME_HEIGHT = 72;
  static SCALE_FACTOR = 1.5;

  static CHARS_IN_ROW = 4;
  static FRAMES_PER_CHAR_ROW = 3;
  static FRAMES_PER_CHAR_COL = 4;

  /** @type {{ [key in Direction]?: number }} */
  directionToFrameRow = {
    ['down']: 0,
    ['left']: 1,
    ['right']: 2,
    ['up']: 3,
  };
  lastFootLeft = false;

  /**
   * @param {Phaser.GameObjects.Sprite} sprite
   * @param {number} characterIndex
   * @param {number} startTilePosX
   * @param {number} startTilePosY
   */
  constructor(sprite, characterIndex, startTilePosX, startTilePosY) {
    this.sprite = sprite;
    this.characterIndex = characterIndex;
    this.sprite.scale = Player.SCALE_FACTOR;
    this.sprite.setPosition(
      startTilePosX * TILE_SIZE + this.playerOffsetX(),
      startTilePosY * TILE_SIZE + this.playerOffsetY()
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

  /**
   * @returns {Phaser.Math.Vector2}
   */
  getTilePos() {
    const x = (this.sprite.getCenter().x - this.playerOffsetX()) / TILE_SIZE;
    const y = (this.sprite.getCenter().y - this.playerOffsetY()) / TILE_SIZE;
    return new Phaser.Math.Vector2(Math.floor(x), Math.floor(y));
  }

  /**
   * @param {Direction} direction
   * @returns {boolean}
   */
  isCurrentFrameStanding(direction) {
    return (
      Number(this.sprite.frame.name) !=
      this.framesOfDirection(direction).standing
    );
  }

  /**
   * @returns {number}
   */
  playerOffsetX() {
    return TILE_SIZE / 2;
  }

  /**
   * @returns {number}
   */
  playerOffsetY() {
    return (
      -((Player.SPRITE_FRAME_HEIGHT * Player.SCALE_FACTOR) % TILE_SIZE) / 2
    );
  }

  /**
   * @param {Direction} direction
   * @returns {FrameRow}
   */
  framesOfDirection(direction) {
    const playerCharRow = Math.floor(this.characterIndex / Player.CHARS_IN_ROW);
    const playerCharCol = this.characterIndex % Player.CHARS_IN_ROW;
    const framesInRow = Player.CHARS_IN_ROW * Player.FRAMES_PER_CHAR_ROW;
    const framesInSameRowBefore = Player.FRAMES_PER_CHAR_ROW * playerCharCol;
    const dir = this.directionToFrameRow[direction];
    if (dir === undefined) {
      throw new Error('Could not find the direction.');
    }
    const rows = dir + playerCharRow * Player.FRAMES_PER_CHAR_COL;
    const startFrame = framesInSameRowBefore + rows * framesInRow;
    return {
      leftFoot: startFrame,
      standing: startFrame + 1,
      rightFoot: startFrame + 2,
    };
  }
}

export class OtherPlayer {
  static SPRITE_FRAME_WIDTH = 52;
  static SPRITE_FRAME_HEIGHT = 72;
  static SCALE_FACTOR = 1.5;

  static CHARS_IN_ROW = 4;
  static FRAMES_PER_CHAR_ROW = 3;
  static FRAMES_PER_CHAR_COL = 4;

  /** @type {{ [key in Direction]?: number }} */
  directionToFrameRow = {
    ['down']: 0,
    ['left']: 1,
    ['right']: 2,
    ['up']: 3,
  };
  lastFootLeft = false;

  /**
   * @param {Phaser.GameObjects.Sprite} sprite
   * @param {number} characterIndex
   * @param {number} startTilePosX
   * @param {number} startTilePosY
   */
  constructor(sprite, characterIndex, startTilePosX, startTilePosY) {
    this.sprite = sprite;
    this.characterIndex = characterIndex;
    this.sprite.scale = Player.SCALE_FACTOR;
    this.sprite.setPosition(
      startTilePosX * TILE_SIZE + this.playerOffsetX(),
      startTilePosY * TILE_SIZE + this.playerOffsetY()
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

  /**
   * @returns {Phaser.Math.Vector2}
   */
  getTilePos() {
    const x = (this.sprite.getCenter().x - this.playerOffsetX()) / TILE_SIZE;
    const y = (this.sprite.getCenter().y - this.playerOffsetY()) / TILE_SIZE;
    return new Phaser.Math.Vector2(Math.floor(x), Math.floor(y));
  }

  /**
   * @param {Direction} direction
   * @returns {boolean}
   */
  isCurrentFrameStanding(direction) {
    return (
      Number(this.sprite.frame.name) !=
      this.framesOfDirection(direction).standing
    );
  }

  /**
   * @returns {number}
   */
  playerOffsetX() {
    return TILE_SIZE / 2;
  }

  /**
   * @returns {number}
   */
  playerOffsetY() {
    return (
      -((Player.SPRITE_FRAME_HEIGHT * Player.SCALE_FACTOR) % TILE_SIZE) / 2
    );
  }

  /**
   * @param {Direction} direction
   * @returns {FrameRow}
   */
  framesOfDirection(direction) {
    const playerCharRow = Math.floor(this.characterIndex / Player.CHARS_IN_ROW);
    const playerCharCol = this.characterIndex % Player.CHARS_IN_ROW;
    const framesInRow = Player.CHARS_IN_ROW * Player.FRAMES_PER_CHAR_ROW;
    const framesInSameRowBefore = Player.FRAMES_PER_CHAR_ROW * playerCharCol;
    const dir = this.directionToFrameRow[direction];
    if (dir === undefined) {
      throw new Error('Could not find the direction.');
    }
    const rows = dir + playerCharRow * Player.FRAMES_PER_CHAR_COL;
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
 * @param {Player} player
 */
function sendPlayerUpdate(player) {
  const { x, y } = player.getPosition();
  binaryWriter.writeTag('player-update');
  binaryWriter.writeFloat64(x);
  binaryWriter.writeFloat64(y);
  socket.send(binaryWriter.finalize());
}

let players = [];
setDebugGlobal('players', players);

/**
 * @param {ArrayBuffer} data
 */
function readBinaryMessage(data) {
  const binary = new BinaryReader(new Uint8Array(data));
  switch (binary.readTag()) {
    case 'broadcast-tick':
      {
        const playerCount = binary.readUint16();
        players.length = 0;
        for (let i = 0; i < playerCount; i++) {
          players.push({
            generation: binary.readUint32(),
            positionX: binary.readFloat64(),
            positionY: binary.readFloat64(),
          });
        }
        doOnce('logPlayers', () => {
          console.log(`!!! players`, players);
        });
      }
      break;
    default:
      throw new Error('Unknown broadcast tag.');
  }
}

/**
 * @param {ServerToClient} message
 */
function readJsonMessage(message) {
  switch (message.type) {
    case 'hello':
      {
        const { generation } = message;
        console.log(`!!! generation`, generation);
      }
      break;
    default:
  }
}
