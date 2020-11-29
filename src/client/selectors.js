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
};

setDebugGlobal('$', $);
