import WebSocket from 'ws';

export type SimpleVector2 = { x: number, y: number };

export type ServerToClient =
  | { type: 'player-id', id: number };

export interface ServerPlayer {
  socket: WebSocket,
  generation: number,
  position: SimpleVector2;
}

export type Direction =
  | "none"
  | "left"
  | "up"
  | "right"
  | "down"

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
