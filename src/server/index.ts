import { spawn } from 'child_process';
import fs from 'fs';
import { createServer } from 'http';
import path from 'path';
import { WebSocket, WebSocketServer } from 'ws';
import yargs from 'yargs';

import { logger } from './logger';

type WebSocketWithId = WebSocket & { id: number };

const { version } = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8')) as {
  version: string;
};

let socketId = -1;
let sockets: WebSocketWithId[] = [];

async function setupServerCLI() {
  const { command, port } = await yargs
    .scriptName('local-ui-dev-error-server')
    .version(version)
    .option('port', {
      alias: 'p',
      default: 9090,
      describe: 'The port on which number the dev error server will',
      type: 'number',
    })
    .option('command', {
      alias: 'c',
      array: true,
      demandOption: true,
      describe: 'One or more commands to run, whose stderr will be displayed in the error overlay.',
      type: 'string',
    })
    .help().argv;
  if (!process.argv.slice(2).length || !command.length) return yargs.showHelp();
  const server = createServer();
  const wss = new WebSocketServer({ server });
  wss.on('connection', ws => {
    const wsWithId = Object.defineProperty(ws, 'id', {
      enumerable: true,
      writable: false,
      value: socketId++,
    }) as WebSocketWithId;
    sockets.push(wsWithId);
    ws.on('close', () => {
      sockets = sockets.filter(s => s.id !== wsWithId.id);
    });
  });

  server.listen('0.0.0.0', port, () => {
    logger.info(`Listening for Local Dev Error Websocket connections on ws://0.0.0.0:${port}`);
    command.forEach(c => {
      const [script, ...args] = c.split(/\s+/g);
      const child = spawn(script, args, { stdio: 'pipe' });
      child.stderr.on('data', d => {
        sockets.forEach(s => s.send(d.toString()));
      });
    });
  });
}

setupServerCLI();
