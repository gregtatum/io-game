// @ts-check
import { ensureExists, setDebugGlobal } from './shared/utils.js';

/**
 * @typedef {import("types").PlayerGeneration} PlayerGeneration
 */

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
};

setDebugGlobal('$', $);
