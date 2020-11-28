import WebSocket from 'ws';
import { Player, OtherPlayer, GridControls, GridPhysics } from '../client/game';

export type PlayerGeneration = number;

export type SimpleVector2 = { x: number, y: number };

export type ServerToClient =
  | { type: 'hello', generation: PlayerGeneration };

export interface ServerPlayer {
  socket: WebSocket,
  generation: PlayerGeneration,
  position: SimpleVector2;
  sendMessage(message: ServerToClient): void;
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

export interface State {
  game: Phaser.Game;
  scene: Phaser.Scenes.SceneManager;
  player: Player;
  tilemap: Phaser.Tilemaps.Tilemap;
  others: Map<number, OtherPlayer>;
  gridControls: GridControls;
  gridPhysics: GridPhysics;
}
