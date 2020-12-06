// @ts-check
import { ensureExists, setDebugGlobal } from './shared/utils.js';

/**
 * @typedef {import("types").PlayerGeneration} PlayerGeneration
 */

const getObjectAtXYGetter = memoize1(
  /**
   * @param {Phaser.Tilemaps.Tilemap} tilemap
   */
  (tilemap) => {
    const objects = ensureExists(tilemap.objects[0]).objects;
    /** @type {Map<number, Phaser.Types.Tilemaps.TiledObject[]>} */
    const xyToObjectsList = new Map();
    let maxX = 0;
    for (const { x } of objects) {
      maxX = Math.max(x || 0, maxX);
    }
    for (const object of objects) {
      const { x, y } = object;
      if (x === undefined || y === undefined) {
        continue;
      }
      const xyKey = y * maxX + x;
      let list = xyToObjectsList.get(xyKey);
      if (!list) {
        list = [];
        xyToObjectsList.set(xyKey, list);
      }
      list.push(object);
    }
    /** @type {Phaser.Types.Tilemaps.TiledObject[]} */
    const empty = [];

    /**
     * @param {number} x
     * @param {number} y
     * @returns {Phaser.Types.Tilemaps.TiledObject[]}
     */
    function getObjectAtXY(x, y) {
      const xyKey = y * maxX + x;
      return xyToObjectsList.get(xyKey) || empty;
    }

    return getObjectAtXY;
  }
);

/**
 * @template T
 * @typedef {import('types').Selector<T>} Selector<T>
 */

/**
 * Selectors for the state
 */
export const $ = {
  /** @type {Selector<PlayerGeneration>} */
  getPlayerGeneration: (state) => ensureExists(state.generation),
  /** @type {Selector<number>} */
  getTilemapMaxDepth: (state) => state.tilemap.layers.length,
  /** @type {Selector<number>} */
  getHudDepth: (state) => $.getTilemapMaxDepth(state) + 1,
  /** @type {Selector<number>} */
  getGameWidth: (state) => state.scene.game.canvas.width,
  /** @type {Selector<number>} */
  getGameHeight: (state) => state.scene.game.canvas.height,
  /** @type {Selector<(x: number, y: number) => Phaser.Types.Tilemaps.TiledObject[]} */
  getObjectsAtXYGetter: (state) => getObjectAtXYGetter(state.tilemap),
};

setDebugGlobal('$', $);

/**
 * @template Arg
 * @template Returns
 * @param {(arg: Arg) => Returns} fn
 * @returns {(arg: Arg) => Returns}
 */
function memoize1(fn) {
  /** @type {Arg | undefined} */
  let prevArg;
  /** @type {Returns} */
  let prevReturn;

  /** @type {(arg: Arg) => Returns} */
  return (currArg) => {
    if (currArg === prevArg) {
      return prevReturn;
    }
    prevArg = currArg;
    prevReturn = fn(currArg);
    return prevReturn;
  };
}
