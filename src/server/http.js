// @ts-check
import handler from 'serve-handler';
import http from 'http';
import { join } from 'path';

const HTTP_PORT = 8000;

export function startHttpServer() {
  const server = http.createServer((request, response) => {
    return handler(request, response, {
      public: join('src/client'),
    });
  });

  server.listen(HTTP_PORT, () => {
    console.log(`Starting http server at http://localhost:${HTTP_PORT}`);
  });
}
