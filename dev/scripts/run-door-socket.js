#!/usr/bin/env node
/**
 * Socket-based headless launcher: logs in via socket.io and sends a door command.
 * Usage: node dev/scripts/run-door-socket.js --command 2048 [--settings sdk/door-settings.json]
 */

const { io } = require('socket.io-client');
const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');
const fs = require('fs');
const path = require('path');

const argv = yargs(hideBin(process.argv))
  .option('user', { type: 'string', demandOption: false })
  .option('pass', { type: 'string', demandOption: false })
  .option('command', { type: 'string', demandOption: true })
  .option('baseUrl', { type: 'string', default: 'http://localhost:3001' })
  .option('settings', { type: 'string', default: 'sdk/door-settings.json' })
  .help()
  .argv;

const KEY_ENTER = '\r';

async function main() {
  let { baseUrl, user, pass, command, settings: settingsPath } = argv;

  if ((!user || !pass) && settingsPath) {
    const resolved = path.resolve(process.cwd(), settingsPath);
    if (fs.existsSync(resolved)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(resolved, 'utf8'));
        user = user || cfg.username;
        pass = pass || cfg.password;
        baseUrl = cfg.baseUrl || baseUrl;
        console.log(`[socket] Loaded settings from ${resolved}`);
      } catch (err) {
        console.warn(`[socket] Failed to parse settings file ${resolved}:`, err?.message || err);
      }
    } else {
      console.warn(`[socket] Settings file not found at ${resolved}, using CLI values`);
    }
  }

  if (!user || !pass) {
    console.error('[socket] Missing credentials (provide --user/--pass or settings file with username/password)');
    process.exit(1);
  }

  // Try websocket at baseUrl, then 8080 as a fallback if baseUrl is 3001
  const candidateUrls = [baseUrl];
  if (baseUrl.includes('3001')) {
    candidateUrls.push(baseUrl.replace('3001', '8080'));
  }

  let connected = false;
  for (const url of candidateUrls) {
    await new Promise((resolve) => {
      const socket = io(url, {
        transports: ['websocket'],
        reconnection: false,
        timeout: 5000
      });

      socket.on('connect', () => {
        connected = true;
        console.log(`[socket] connected to ${url}, sending login`);
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
          resolve();
        }, 3000);
      });

      socket.on('connect_error', (err) => {
        console.error(`[socket] connect_error on ${url}:`, err?.message || err);
        resolve();
      });

      socket.on('ansi-output', (data) => {
        if (typeof data === 'string') {
          process.stdout.write(data);
        }
      });
    });

    if (connected) break;
  }

  if (!connected) {
    console.error('[socket] Unable to connect to any socket endpoint');
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
