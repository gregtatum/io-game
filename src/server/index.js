// @ts-check
import { startHttpServer } from './http.js';
import { startWebsocketServer } from './websocket.js';

const server = startHttpServer();
startWebsocketServer(server);
