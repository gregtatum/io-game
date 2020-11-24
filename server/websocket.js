const WebSocket = require('ws');

const server = new WebSocket.Server({
  port: 8080,
});

server.on('open', function open() {
  server.send('message from server');
});

server.on('message', function incoming(data) {
  console.log('Received message', data);
});
