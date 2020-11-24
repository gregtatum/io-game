declare namespace Server {
  export type Vector2 = { x: number, y: number };

  export type ToClient =
    | { type: 'TICK', players: Player['broadcast'][] }
    | { type: 'PLAYER_ID', id: number };

  export interface Player {
    socket: WebSocket,
    generation: number,
    broadcast: {
      position: Vector2;
    }
  }
}
