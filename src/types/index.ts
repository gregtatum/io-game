import WebSocketServer from 'ws';

export type PlayerGeneration = number;

export type SimpleVector2 = { x: number, y: number };

export type OtherPlayerSerialized = {
  generation: PlayerGeneration,
  x: number,
  y: number,
  characterIndex: number,
}

export type ServerToClient =
  | {
      type: 'hello',
      generation: PlayerGeneration,
      others: OtherPlayerSerialized[]
    }
  | {
      type: 'other-joined',
      other: OtherPlayerSerialized
    }
  | {
      type: 'other-left',
      generation: PlayerGeneration
    };

export interface ServerPlayer {
  socket: WebSocketServer,
  characterIndex: number,
  generation: PlayerGeneration,
  position: SimpleVector2;
  tickGeneration: number,
  sendMessage(message: ServerToClient): void;
}

export interface Player {
  lastFootLeft: boolean;
  previousPositionSentToServer: Phaser.Math.Vector2;
  sprite: Phaser.GameObjects.Sprite;
  characterIndex: number;
  direction: Direction;
  isMoving: boolean;
  pixelsWalkedInThisTile: number;
  decimalPlacesLeft: number;
  speed: number,
}

export type Direction =
  | "left"
  | "up"
  | "right"
  | "down"

// Tags for binary messages for client server communication.
// Make sure and update the `broadcastTags` variable when
// adding to this list.
export type BroadcastTag = "broadcast-tick" | "player-update";

export type ClientToServer =
  | { type: 'hello-back', characterIndex: number }
  | { type: 'tick', x: number, y: number };

export type TypedArray =
 | typeof Int8Array
 | typeof Uint8Array
 | typeof Int16Array
 | typeof Uint16Array
 | typeof Int32Array
 | typeof Uint32Array
 | typeof Float32Array
 | typeof Float64Array;

export type DataViewConstructor = typeof DataView;

export interface OtherPlayer {
  generation: PlayerGeneration,
  x: number,
  y: number,
  sprite: Phaser.GameObjects.Sprite,
  direction: Direction,
  characterIndex: number,
}

export interface State {
  socket: WebSocket | null;
  generation: PlayerGeneration | null,
  game: Phaser.Game;
  scene: Phaser.Scene;
  player: Player;
  tilemap: Phaser.Tilemaps.Tilemap;
  others: Map<number, OtherPlayer>;
  hud: {
    textBackdrop: {
      graphics: Phaser.GameObjects.Graphics;
      width: number,
      height: number,
      margin: number,
    },
    text: {
      object: Phaser.GameObjects.Text,
      size: number,
      margin: number,
      lineSpacing: number,
    }
  };
}

export type Selector<T> = (state: State) => T;

export type TiledMapJSON = {
  compressionlevel: number,
  editorsettings: {
    export: { format: "json", target: "interior.json" }
  },
  tileheight: number,
  tilewidth: number,
  height: number,
  width: number,
  infinite: boolean,
  layers: Array<{
    compression: string,
    data: number[],
    height: number,
    width: number,
    x: number,
    y: number,
    id: number,
    name: string, // e.g. "Floor1",
    opacity: number,
    type: "tilelayer",
    visible: boolean,
  }>,
  nextlayerid: number,
  nextobjectid: number,
  orientation: string, // "orthogonal",
  renderorder: string, // "right-down",
  tiledversion: number, // "1.4.3",
  tilesets: Array<{
    image: string, // "images/art.png",
    name: string, // "art",
    columns: number,
    firstgid: number,
    imageheight: number,
    imagewidth: number,
    margin: number,
    spacing: number,
    tilecount: number,
    tileheight: number,
    tilewidth: number,
    lastgid: number
  }>,
  type: "map",
  version: number,
}
