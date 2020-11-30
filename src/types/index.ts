import WebSocketServer from 'ws';

export type PlayerGeneration = number;

export type SimpleVector2 = { x: number, y: number };

export type OtherPlayerSerialized = {
  generation: PlayerGeneration,
  x: number,
  y: number
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
  movementDirection: Direction;
  tileSizePixelsWalked: number;
  decimalPlacesLeft: number;
}

export type Direction =
  | "none"
  | "left"
  | "up"
  | "right"
  | "down"

// Tags for binary messages for client server communication.
// Make sure and update the `broadcastTags` variable when
// adding to this list.
export type BroadcastTag = "broadcast-tick" | "player-update";

export type ClientToServer =
  { type: 'tick', x: number, y: number };

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
  sprite: Phaser.GameObjects.Sprite
}

export interface State {
  socket: WebSocket | null;
  generation: PlayerGeneration | null,
  game: Phaser.Game;
  scene: Phaser.Scene;
  player: Player;
  tilemap: Phaser.Tilemaps.Tilemap;
  others: Map<number, OtherPlayer>;
}

export type Selector<T> = (state: State) => T;
