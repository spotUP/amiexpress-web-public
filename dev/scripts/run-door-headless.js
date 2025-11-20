#!/usr/bin/env node
/**
 * Headless door launcher: logs in via HTTP API and invokes a door command.
 * Usage: node dev/scripts/run-door-headless.js --user sysop --pass secret --command 2048
 */

const axios = require('axios');
const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');

const argv = yargs(hideBin(process.argv))
  .option('user', { type: 'string', demandOption: false })
  .option('pass', { type: 'string', demandOption: false })
  .option('command', { type: 'string', demandOption: true })
  .option('baseUrl', { type: 'string', default: 'http://localhost:3001' })
  .option('settings', { type: 'string', default: 'sdk/door-settings.json' })
  .help()
  .argv;

async function login(baseUrl, username, password) {
  // Try common auth endpoints (REST API on /api/auth/login)
  const endpoints = [
    `${baseUrl}/api/auth/login`,
    `${baseUrl}/auth/login`,
    `${baseUrl}/api/login`
  ];
  let lastError;
  for (const url of endpoints) {
    try {
      const res = await axios.post(url, { username, password });
      if (res.data?.token) {
        return res.data.token;
      }
    } catch (err) {
      lastError = err;
    }
  }

  // Fallback: try admin login route used by the config UI
  const adminUrl = `${baseUrl}/admin/api/login`;
  try {
    const res = await axios.post(adminUrl, { username, password });
    if (res.data?.token) {
      return res.data.token;
    }
    throw new Error('Admin login response missing token');
  } catch (err) {
    lastError = err;
  }

  throw lastError || new Error('Login failed');
}

async function runDoor(baseUrl, token, command) {
  await axios.post(
    `${baseUrl}/api/doors/run`,
    { command },
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

async function main() {
  let { baseUrl, user, pass, command, settings: settingsPath } = argv;

  // Allow pulling creds/baseUrl from a settings file if not provided
  if ((!user || !pass) && settingsPath) {
    const fs = require('fs');
    const path = require('path');
    const resolved = path.resolve(process.cwd(), settingsPath);
    if (fs.existsSync(resolved)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(resolved, 'utf8'));
        user = user || cfg.username;
        pass = pass || cfg.password;
        baseUrl = cfg.baseUrl || baseUrl;
        console.log(`[headless] Loaded settings from ${resolved}`);
      } catch (err) {
        console.warn(`[headless] Failed to parse settings file ${resolved}:`, err?.message || err);
      }
    } else {
      console.warn(`[headless] Settings file not found at ${resolved}, using CLI/env values`);
    }
  }

  if (!user || !pass) {
    throw new Error('Missing credentials: provide --user/--pass or a settings file with username/password');
  }

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
