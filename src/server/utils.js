// @ts-check
import { ensureExists } from '../client/shared/utils.js';

/**
 * @param {string} key
 */
function getEnv(key) {
  return ensureExists(
    process.env[key],
    `Expected to find an ${key} environment variable.`
  );
}

export const HOST = getEnv('HOST');
export const PORT = Number(getEnv('PORT'));
