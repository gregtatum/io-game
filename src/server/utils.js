// @ts-check
import { ensureExists } from '../client/shared/utils.js';

/**
 * @param {string} key
 */
function getEnv(key) {
  return ensureExists(
    process.env[key],
    `The "${key}" environment variable was not set. Did you mean to run \`yarn start-dev\`?`
  );
}

export const HOST = getEnv('HOST');
export const PORT = Number(getEnv('PORT'));
