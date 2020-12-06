// @ts-check
import {
  BinaryReader,
  BinaryWriter,
  setDebugGlobal,
  lerp,
  ensureExists,
  hsl,
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
 * @typedef {import('types').TiledMapJSON} TiledMapJSON
 */

// const CANVAS_WIDTH = 720;
// const CANVAS_HEIGHT = 528;
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
const SPEED_PIXELS_PER_MS = TILE_SIZE / 250;
const SCALE_PIXELS = 3;

function getCanvasSize() {
  // Making the canvas divisible by the scale of the pixels and 2 removes any tile
  // seams.
  const scale = SCALE_PIXELS * 2;
  return {
    width: Math.ceil(window.innerWidth / scale) * scale,
    height: Math.ceil(window.innerHeight / scale) * scale,
  };
}

getInitialState();

/**
 * @returns {Promise<TiledMapJSON>}
 */
async function getTileMap() {
  const response = await fetch('assets/tilemaps/interior.json');
  return response.json();
}

/**
 * @returns {Promise<State>}
 */
async function getInitialState() {
  const { resolve, promise: createPromise } = createDeferredPromise();
  const tileMapJson = await getTileMap();

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
      preload: () => preload(game.scene.scenes[0], tileMapJson),
    },
    scale: {
      width: getCanvasSize().width,
      height: getCanvasSize().height,
    },
    backgroundColor: 0x264557,
  });
  manageGameScale(game);

  await createPromise;

  /** @type {Phaser.Scene} */
  const scene = game.scene.scenes[0];
  const { tilemap, tilemapObjects } = setupTilemap(scene, tileMapJson);
  const player = createPlayer(scene, tilemap, tilemapObjects);

  /** @type {State} */
  const state = {
    socket: null,
    generation: null,
    game,
    scene,
    player,
    tilemap,
    keys: createKeys(scene),
    hud: createUninitializedHUD(scene),
    others: new Map(),
  };

  setupHUD(state);
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
 * @param {Phaser.Scene} scene
 * The return type is inferred.
 */
export function createUninitializedHUD(scene) {
  /** @type {string | null} */
  const message = null;

  return {
    message,
    textBackdrop: {
      graphics: scene.add.graphics(),
      width: 300,
      height: 64,
      margin: 10,
    },
    text: {
      object: scene.add.text(0, 0, ''),
      size: 6,
      margin: 6,
      lineSpacing: 8,
    },
  };
}

/**
 * @param {Phaser.Scene} scene
 * The return type is inferred
 */
export function createKeys(scene) {
  return {
    spacebar: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
  };
}

/**
 * @param {State} state
 */
function setupHUD(state) {
  const { hud } = state;
  const { textBackdrop, text } = hud;
  const { graphics, width, height } = textBackdrop;
  const depth = $.getHudDepth(state);

  {
    graphics.setScale(SCALE_PIXELS);
    // Build the background as a stepped gradient.
    const steps = 7;
    const stepHeight = height / steps;
    const h = 0.56;
    const s = 0.97;
    for (let i = 0; i < steps; i++) {
      const l = lerp(0.5, 0.35, i / steps);
      graphics.fillStyle(hsl(h, s, l));
      graphics.fillRect(0, stepHeight * i, width, stepHeight);
    }

    // Create the border.
    graphics.lineStyle(1, hsl(h, s, 0.3));
    graphics.strokeRoundedRect(1, 1, width - 2, height - 2, 2);
    graphics.lineStyle(1, hsl(h, s, 0.8));
    graphics.strokeRoundedRect(0, 0, width, height, 2);
  }

  text.object.setStyle({
    fontFamily: 'dogica',
    fontSize: text.size * SCALE_PIXELS + 'px',
    color: '#fff',
  });
  text.object.setLineSpacing(text.lineSpacing);
  text.object.setWordWrapWidth((width - text.margin * 2) * SCALE_PIXELS);
  text.object.setText(
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis posuere, leo a posuere rutrum, leo lorem facilisis tellus, eu aliquet tortor massa sed risus. Nullam pulvinar lobortis interdum. Proin ut faucibus turpis, ac aliquam metus. Sed mauris libero.'
  );

  text.object.setDepth(depth + 0.1);
  graphics.setDepth(depth);
  // Make everything follow the camera.
  text.object.setScrollFactor(0);
  graphics.setScrollFactor(0);

  text.object.visible = false;
  textBackdrop.graphics.visible = false;
}

/**
 * @param {State} state
 */
function updateHUD(state) {
  const { textBackdrop, text } = state.hud;

  const gameWidth = $.getGameWidth(state);
  const gameHeight = $.getGameHeight(state);

  const { graphics, width, height } = textBackdrop;
  const pixelsWidth = width * SCALE_PIXELS;
  const pixelsHeight = height * SCALE_PIXELS;
  const x = gameWidth / 2 - pixelsWidth / 2;
  const y = gameHeight - pixelsHeight - textBackdrop.margin * SCALE_PIXELS;
  graphics.setPosition(x, y);
  text.object.setPosition(
    x + text.margin * SCALE_PIXELS,
    y + text.margin * SCALE_PIXELS
  );
}

/**
 * @param {Phaser.Game} game
 */
function manageGameScale(game) {
  window.addEventListener('resize', () => {
    const { width, height } = getCanvasSize();
    game.scale.resize(width, height);
  });
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
 * @param {Phaser.Tilemaps.Tilemap} tilemap
 * @param {{x: number, y: number}} [position]
 * @returns {Phaser.GameObjects.Sprite}
 */
function addSprite(scene, tilemap, position) {
  const spritesLayer = ensureExists(
    tilemap.getLayer('Sprites'),
    'Could not find the Sprites layer'
  );
  const sprite = scene.add.sprite(0, 0, 'player');
  sprite.setDepth(spritesLayer.tilemapLayer.depth);
  sprite.scale = PLAYER_SCALE_FACTOR;
  if (position) {
    sprite.x = position.x;
    sprite.y = position.y;
  }
  return sprite;
}

/**
 * @param {Phaser.Scene} scene
 * @param {TiledMapJSON} json
 */
function setupTilemap(scene, json) {
  const mapData = Phaser.Tilemaps.Parsers.Tiled.ParseJSONTiled(
    'tilemap',
    json,
    true
  );
  const tilemap = new Phaser.Tilemaps.Tilemap(scene, mapData);
  const tilesets = json.tilesets.map(({ name }) =>
    tilemap.addTilesetImage(name, name)
  );

  /** @type {Phaser.Tilemaps.StaticTilemapLayer | null} */
  // Go through all the layers in the tilemap's JSON, and turn in them into Phaser
  // static layers.
  for (let i = 0; i < tilemap.layers.length; i++) {
    const layerData = tilemap.layers[i];
    const staticLayer = tilemap.createStaticLayer(i, tilesets, 0, 0);
    staticLayer.setDepth(i);
    staticLayer.scale = SCALE_PIXELS;
    staticLayer.visible = layerData.visible;
  }
  ensureExists(
    tilemap.getLayer('Blocking'),
    'Expected to find a Blocking layer in the tilemap'
  ).tilemapLayer.visible = false;

  return {
    tilemap,
    tilemapObjects: ensureExists(tilemap.objects[0]).objects,
  };
}

/**
 * @param {State} state,
 * @param {number} _time
 * @param {number} delta
 */
function update(state, _time, delta) {
  // Handle all of the player movement.
  maybeStartMovingCharacter(state);
  updatePlayerPositionAndMovingStatus(state, delta);
  updatePlayerAnimation(state.player);

  // TODO - Only do this occasionally.
  window.localStorage.playerPositionX = state.player.sprite.x;
  window.localStorage.playerPositionY = state.player.sprite.y;

  // Handle all other entities
  updateOtherPlayersPositions(state);
  handlePlayerAction(state);
  updateHUD(state);

  // Notify the server of what happened.
  sendPlayerUpdate(state);
}

/**
 * This function only updates the isMoving and direction properties on the player.
 * @param {State} state
 */
function maybeStartMovingCharacter(state) {
  const { player, tilemap } = state;
  if (state.hud.message) {
    // Do not move the player while there is a message displayed.
    return;
  }
  if (!player.isMoving) {
    // The player is not moving, and is free to change directions.
    const desiredDirection = getDirectionFromControls(state);
    if (desiredDirection) {
      // The player is starting to try and change a direction, always face that way.
      player.direction = desiredDirection;
      // See if we can initiate a move.
      player.isMoving = getPlayerCanMove(player, tilemap);
    }
  }
}

/**
 * @param {State} state
 */
function handlePlayerAction(state) {
  const { keys, player } = state;

  if (!Phaser.Input.Keyboard.JustDown(keys.spacebar)) {
    return;
  }

  if (state.hud.message) {
    // There is a message showing, do nothing else.
    hideHudMessage(state);
    return;
  }

  const getObjectsAtXY = $.getObjectsAtXYGetter(state);
  const { x, y } = getDirectionVector(player.direction);
  const nextTileX = Math.floor(
    (player.sprite.getCenter().x - PLAYER_OFFSET_X + x * TILE_SIZE) /
      SCALE_PIXELS
  );
  const nextTileY = Math.floor(
    (player.sprite.getCenter().y - PLAYER_OFFSET_Y + y * TILE_SIZE) /
      SCALE_PIXELS
  );
  const objects = getObjectsAtXY(nextTileX, nextTileY);
  for (const object of objects) {
    switch (object.type) {
      case 'message':
        {
          const messageProperty = object.properties.find(
            /** @param {any} prop */
            (prop) => prop.name === 'message' && prop.type === 'string'
          );
          if (!messageProperty) {
            console.error(object);
            throw new Error(
              'A message object was found that did not have a message.'
            );
          }
          showHudMessage(state, messageProperty.value);
        }
        break;
      default:
      // Do nothing.
    }
  }
}

/**
 * @param {State} state
 * @param {string} message
 */
function showHudMessage(state, message) {
  const { text, textBackdrop } = state.hud;
  text.object.visible = true;
  textBackdrop.graphics.visible = true;
  text.object.setText(message);
  state.hud.message = message;
}

/**
 * @param {State} state
 */
function hideHudMessage(state) {
  const { text, textBackdrop } = state.hud;
  text.object.visible = false;
  textBackdrop.graphics.visible = false;
  state.hud.message = null;
}

/**
 * @param {Player} player
 */
function updatePlayerAnimation(player) {
  const { sprite, characterIndex, direction, isMoving } = player;
  const { leftFoot, standing, rightFoot } = getFrameIndexFromDirection(
    characterIndex,
    direction
  );

  if (isMoving) {
    const walkingGateSize = TILE_SIZE * 2;
    const position =
      direction === 'up' || direction === 'down'
        ? sprite.getCenter().y
        : sprite.getCenter().x;
    const ratioTileMoved = (position % walkingGateSize) / walkingGateSize;

    if (ratioTileMoved < 1 / 4) {
      sprite.setFrame(standing);
    } else if (ratioTileMoved < 2 / 4) {
      sprite.setFrame(leftFoot);
    } else if (ratioTileMoved < 3 / 4) {
      sprite.setFrame(standing);
    } else {
      sprite.setFrame(rightFoot);
    }
  } else {
    sprite.setFrame(standing);
  }
}

/**
 * @param {State} state
 */
function updateOtherPlayersPositions(state) {
  for (const other of state.others.values()) {
    const { sprite } = other;
    const nextX = Math.round(lerp(sprite.x, other.x, 0.6));
    const nextY = Math.round(lerp(sprite.y, other.y, 0.6));
    const dx = nextX - sprite.x;
    const dy = nextY - sprite.y;
    sprite.x = nextX;
    sprite.y = nextY;
    const isMoving = dx !== 0 || dy !== 0;

    // See if the sprite needs to change direction.
    if (isMoving) {
      if (Math.abs(dx) > Math.abs(dy)) {
        other.direction = dx > 0 ? 'right' : 'left';
      } else {
        other.direction = dy > 0 ? 'down' : 'up';
      }
    }

    const { leftFoot, standing, rightFoot } = getFrameIndexFromDirection(
      other.characterIndex,
      other.direction
    );

    if (isMoving) {
      const walkingGateSize = TILE_SIZE * 2;
      const position =
        other.direction === 'up' || other.direction === 'down'
          ? sprite.getCenter().y
          : sprite.getCenter().x;
      const ratioTileMoved = (position % walkingGateSize) / walkingGateSize;

      if (ratioTileMoved < 1 / 4) {
        sprite.setFrame(standing);
      } else if (ratioTileMoved < 2 / 4) {
        sprite.setFrame(leftFoot);
      } else if (ratioTileMoved < 3 / 4) {
        sprite.setFrame(standing);
      } else {
        sprite.setFrame(rightFoot);
      }
    } else {
      sprite.setFrame(standing);
    }
    setSpriteDepth(state, sprite);
  }
}

/**
 * @param {Phaser.Scene} scene
 * @param {TiledMapJSON} tiledMapJson
 */
function preload(scene, tiledMapJson) {
  for (const { image, name } of tiledMapJson.tilesets) {
    scene.load.image(name, 'assets/tilemaps/' + image);
  }

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

/**
 * Turns a Direction string into a real vector
 * @param {Direction} direction
 * @return {Vector2}
 */
function getDirectionVector(direction) {
  switch (direction) {
    case 'up':
      return Vector2.UP;
    case 'down':
      return Vector2.DOWN;
    case 'left':
      return Vector2.LEFT;
    case 'right':
      return Vector2.RIGHT;
    default:
      throw new Error('Cannot get a direction vector for ' + direction);
  }
}

/**
 * @param {State} state
 * @returns {Direction | null}
 */
function getDirectionFromControls(state) {
  const cursors = state.scene.input.keyboard.createCursorKeys();
  if (cursors.left && cursors.left.isDown) {
    return 'left';
  } else if (cursors.right && cursors.right.isDown) {
    return 'right';
  } else if (cursors.up && cursors.up.isDown) {
    return 'up';
  } else if (cursors.down && cursors.down.isDown) {
    return 'down';
  }
  return null;
}

const Vector2 = Phaser.Math.Vector2;

/**
 * When the player is standing still, this function determines if the player
 * can continue moving in that direction.
 *
 * @param {Player} player
 * @param {Phaser.Tilemaps.Tilemap} tilemap
 * @returns {boolean}
 */
function getPlayerCanMove(player, tilemap) {
  if (player.isMoving) {
    throw new Error(
      'The player is already moving, this function should not be called.'
    );
  }

  // Compute the next tile position.
  const { x, y } = getDirectionVector(player.direction);
  const nextTileX =
    Math.floor((player.sprite.getCenter().x - PLAYER_OFFSET_X) / TILE_SIZE) + x;
  const nextTileY =
    Math.floor((player.sprite.getCenter().y - PLAYER_OFFSET_Y) / TILE_SIZE) + y;

  return !tilemap.hasTileAt(nextTileX, nextTileY, 'Blocking');
}

/**
 * @param {State} state
 * @param {number} delta
 * @returns {void}
 */
function updatePlayerPositionAndMovingStatus(state, delta) {
  const { player } = state;
  if (!player.isMoving) {
    // This player is not moving, no reason to update the position.
    return;
  }

  // Compute the integral value of the pixels walked, and store the decimal part.
  let pixelsInt;
  {
    const pixelsFloat = player.speed * delta + player.decimalPlacesLeft;
    pixelsInt = Math.floor(pixelsFloat);
    player.decimalPlacesLeft = pixelsFloat % 1;
  }

  if (player.pixelsWalkedInThisTile + pixelsInt >= TILE_SIZE) {
    // The player will cross the tile border this update, only move the player
    // enough to be at the correct tile position.
    pixelsInt = TILE_SIZE - player.pixelsWalkedInThisTile;
    player.pixelsWalkedInThisTile = 0;
    player.isMoving = false;
  } else {
    player.pixelsWalkedInThisTile = player.pixelsWalkedInThisTile + pixelsInt;
  }

  const oldPosition = player.sprite.getCenter();
  const directionVector = getDirectionVector(player.direction);
  const { sprite } = player;

  sprite.setPosition(
    oldPosition.x + directionVector.x * pixelsInt,
    oldPosition.y + directionVector.y * pixelsInt
  );

  setSpriteDepth(state, sprite);
}

/**
 * @param {State} state
 * @param {Phaser.GameObjects.Sprite} sprite
 */
function setSpriteDepth(state, sprite) {
  const spriteLayerDepth = ensureExists(
    state.tilemap.getLayer('Sprites'),
    'Could not find the Sprites layer.'
  ).tilemapLayer.depth;

  sprite.setDepth(spriteLayerDepth + (1 - 1 / sprite.y));
}

/**
 * @typedef {Object} FrameRow
 * @prop {number} leftFoot
 * @prop {number} standing
 * @prop {number} rightFoot
 */

/**
 * @param {Phaser.Scene} scene
 * @param {Phaser.Tilemaps.Tilemap} tilemap
 * @param {Phaser.Types.Tilemaps.TiledObject[]} objects
 * @returns {Player}
 */
function createPlayer(scene, tilemap, objects) {
  const sprite = addSprite(scene, tilemap);
  scene.cameras.main.startFollow(sprite);
  const { x, y } = ensureExists(
    objects.find((o) => o.name === 'spawn'),
    'Could not find the spawn point for the tilemap'
  );

  const characterIndex = Math.floor(Math.random() * 8);

  const { playerPositionX, playerPositionY } = window.localStorage;
  if (playerPositionX) {
    sprite.setPosition(playerPositionX, playerPositionY);
  } else {
    sprite.setPosition(
      ensureExists(x) * SCALE_PIXELS + PLAYER_OFFSET_X,
      ensureExists(y) * SCALE_PIXELS + PLAYER_OFFSET_Y
    );
  }

  sprite.setFrame(getFrameIndexFromDirection(characterIndex, 'down').standing);

  return {
    sprite,
    previousPositionSentToServer: new Vector2(Infinity, Infinity),
    lastFootLeft: false,
    characterIndex,
    direction: 'down',
    isMoving: false,
    pixelsWalkedInThisTile: 0,
    decimalPlacesLeft: 0,
    speed: SPEED_PIXELS_PER_MS,
  };
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
 * @param {ClientToServer} message
 */
function sendJsonToServer(state, message) {
  ensureExists(state.socket).send(JSON.stringify(message));
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
            sprite: addSprite(state.scene, state.tilemap, other),
            direction: 'down',
          });
        }
        state.others = others;

        sendJsonToServer(state, {
          type: 'hello-back',
          characterIndex: state.player.characterIndex,
        });
      }
      break;
    case 'other-joined':
      {
        const { other } = message;
        // This message is broadcast to everyone, so only add
        // it if it's not the current player.
        if (other.generation !== state.generation) {
          const sprite = addSprite(state.scene, state.tilemap, other);
          state.others.set(other.generation, {
            ...other,
            sprite,
            direction: 'down',
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
