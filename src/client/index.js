// @ts-check

import './game.js';

const socket = new WebSocket('ws://127.0.0.1:8080');

socket.addEventListener('close', (event) => {
  console.log('WebSocket closed', event);
});

socket.addEventListener('error', (event) => {
  console.error(event);
});

socket.addEventListener('open', () => {
  console.log('open');
  socket.send('Hello Server!');
});

socket.addEventListener('message', (event) => {
  console.log('message', event.data);
});
