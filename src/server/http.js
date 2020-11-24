// @ts-check
import handler from 'serve-handler';
import http from 'http';

const HTTP_PORT = 8000;

export function startHttpServer() {
  const server = http.createServer((request, response) => {
    return handler(request, response, {
      public: 'client',
    });
  });

  server.listen(HTTP_PORT, () => {
    console.log(`Starting http server at http://localhost:${HTTP_PORT}`);
  });
}
