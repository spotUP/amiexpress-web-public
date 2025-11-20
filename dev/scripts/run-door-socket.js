#!/usr/bin/env node
/**
 * Socket-based headless launcher: logs in via socket.io and sends a door command.
 * Usage: node dev/scripts/run-door-socket.js --user sysop --pass secret --command 2048
 */

const { io } = require('socket.io-client');
const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');

const argv = yargs(hideBin(process.argv))
  .option('user', { type: 'string', demandOption: true })
  .option('pass', { type: 'string', demandOption: true })
  .option('command', { type: 'string', demandOption: true })
  .option('baseUrl', { type: 'string', default: 'http://localhost:3001' })
  .help()
  .argv;

const KEY_ENTER = '\r';

async function main() {
  const { baseUrl, user, pass, command } = argv;

  const socket = io(baseUrl, {
    transports: ['websocket'],
    reconnection: false
  });

  socket.on('connect', () => {
    console.log('[socket] connected, sending login');
    socket.emit('command', 'A');
    socket.emit('command', KEY_ENTER);
    socket.emit('command', user);
    socket.emit('command', KEY_ENTER);
    socket.emit('command', pass);
    socket.emit('command', KEY_ENTER);
    socket.emit('command', KEY_ENTER); // skip any "press any key"
    socket.emit('command', command);
    socket.emit('command', KEY_ENTER);
    console.log('[socket] command sent, waiting 3s then closing');
    setTimeout(() => {
      socket.disconnect();
      process.exit(0);
    }, 3000);
  });

  socket.on('connect_error', (err) => {
    console.error('[socket] connect_error', err?.message || err);
    process.exit(1);
  });

  socket.on('ansi-output', (data) => {
    if (typeof data === 'string') {
      process.stdout.write(data);
    }
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
