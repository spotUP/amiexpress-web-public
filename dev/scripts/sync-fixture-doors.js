#!/usr/bin/env node
/**
 * Sync fixture doors from dev/fixtures/doors into doors/ (overwriting existing).
 */
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../..');
const fixturesRoot = path.join(projectRoot, 'dev/fixtures/doors');
const doorsRoot = path.join(projectRoot, 'doors');

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }
  if (stat.isFile()) {
    fs.copyFileSync(src, dest);
  }
}

if (!fs.existsSync(fixturesRoot)) {
  console.error(`Fixtures not found at ${fixturesRoot}`);
  process.exit(1);
}

if (!fs.existsSync(doorsRoot)) {
  fs.mkdirSync(doorsRoot, { recursive: true });
}

for (const entry of fs.readdirSync(fixturesRoot)) {
  const src = path.join(fixturesRoot, entry);
  const dest = path.join(doorsRoot, entry);
  console.log(`[sync] ${entry}`);
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  copyRecursive(src, dest);
}

console.log('Fixture doors synced.');
