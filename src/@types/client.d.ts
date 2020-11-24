declare namespace Client {
  export type Direction =
    | "none"
    | "left"
    | "up"
    | "right"
    | "down"

  export type ToServer =
    { type: 'tick', x: number, y: number };
}
