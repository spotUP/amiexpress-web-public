#!/usr/bin/env node
/**
 * Headless door launcher: logs in via HTTP API and invokes a door command.
 * Usage: node dev/scripts/run-door-headless.js --user sysop --pass secret --command 2048
 */

const axios = require('axios');
const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');

const argv = yargs(hideBin(process.argv))
  .option('user', { type: 'string', demandOption: true })
  .option('pass', { type: 'string', demandOption: true })
  .option('command', { type: 'string', demandOption: true })
  .option('baseUrl', { type: 'string', default: 'http://localhost:3001' })
  .help()
  .argv;

async function login(baseUrl, username, password) {
  const res = await axios.post(`${baseUrl}/api/auth/login`, { username, password });
  return res.data?.token;
}

async function runDoor(baseUrl, token, command) {
  await axios.post(
    `${baseUrl}/api/doors/run`,
    { command },
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

async function main() {
  const { baseUrl, user, pass, command } = argv;
  console.log(`[headless] Logging in to ${baseUrl} as ${user}`);
  const token = await login(baseUrl, user, pass);
  if (!token) {
    throw new Error('Login failed: no token');
  }
  console.log('[headless] Login ok, launching command', command);
  await runDoor(baseUrl, token, command);
  console.log('[headless] Door command dispatched');
}

main().catch(err => {
  console.error('[headless] Error:', err?.message || err);
  process.exit(1);
});

