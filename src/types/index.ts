import WebSocket from 'ws';

export type SimpleVector2 = { x: number, y: number };

export type ServerToClient =
  | { type: 'TICK', players: ServerPlayer['broadcast'][] }
  | { type: 'PLAYER_ID', id: number };

export interface ServerPlayer {
  socket: WebSocket,
  generation: number,
  broadcast: {
    position: SimpleVector2;
  }
}

export type Direction =
  | "none"
  | "left"
  | "up"
  | "right"
  | "down"

export type ClientToServer =
  { type: 'tick', x: number, y: number };
