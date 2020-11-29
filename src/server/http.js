// @ts-check
import handler from 'serve-handler';
import http from 'http';
import { join } from 'path';
import { PORT, HOST } from './utils.js';

/**
 * @returns {http.Server}
 */
export function startHttpServer() {
  const server = http.createServer((request, response) => {
    return handler(request, response, {
      public: join('src/client'),
    });
  });

  server.listen(PORT, () => {
    console.log(`Starting http server at http://${HOST}:${PORT}`);
  });

  return server;
}
