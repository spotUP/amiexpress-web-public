#!/usr/bin/env node
/**
 * Convert ASCII/ANSI text to PETSCII .seq format.
 *
 * Usage:
 *   fold -w 40 MENU.TXT | npx ts-node -P dev/scripts/tsconfig.json dev/scripts/convert-to-petscii.ts > Screens/MENU_C64.seq
 */

const path = require('path');
const petsciiUtilPath = path.join(__dirname, '..', '..', 'web', 'backend', 'dist', 'utils', 'petscii.util.js');
const { convertAnsiToPetscii } = require(petsciiUtilPath);

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', chunk => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', err => reject(err));
  });
}

async function main(): Promise<void> {
  if (process.stdin.isTTY) {
    console.error('fold input into this script to emit a PETSCII .seq stream');
    process.exit(1);
  }

  const text = await readStdin();
  const buffer = convertAnsiToPetscii(text);
  process.stdout.write(buffer);
}

main().catch(err => {
  console.error('Failed to convert to PETSCII:', err);
  process.exit(1);
});
