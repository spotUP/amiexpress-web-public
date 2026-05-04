/**
 * Regression for #11: socket.io's maxHttpBufferSize must be sane.
 *
 * Background — two-phase history of the upload pipeline:
 *
 * 1. Original bug: BBSTerminal emitted file uploads through the socket as
 *    a JSON-serialized number array (Array.from(new Uint8Array(buf))).
 *    That inflates each byte to ~3 chars on the wire, so a 10MB file
 *    became ~30MB. With maxHttpBufferSize at 1MB, anything > ~330KB
 *    blew the cap mid-upload and socket.io disconnected with a
 *    "transport error", bouncing the user back to login. Short-term
 *    fix: bump the buffer to 64MB to fit the JSON-inflated worst case.
 *
 * 2. Real fix: switch BBSTerminal to multipart HTTP POST against the
 *    already-wired /api/upload (multer) endpoint. The file body never
 *    touches the websocket; the frontend only emits a small
 *    `file-upload-ready` event with the file metadata after multer
 *    has written it. With binary off the socket the buffer can be
 *    reasonable (4MB) — large enough for non-file payloads, small
 *    enough that any binary on the socket is caught early.
 *
 * This test asserts the post-migration invariants:
 *   - maxHttpBufferSize is set to a sane non-pathological value (1-16MB).
 *   - maxFileSize (HTTP upload cap) can comfortably exceed it because
 *     uploads no longer go through the socket.
 *   - The legacy regression case (1MB cap, JSON-array uploads) is gone.
 */

import * as fs from 'fs';
import * as path from 'path';

const INDEX_TS = fs.readFileSync(
  path.resolve(__dirname, '../../src/index.ts'),
  'utf8'
);
const CONFIG_TS = fs.readFileSync(
  path.resolve(__dirname, '../../src/config.ts'),
  'utf8'
);

// Pull the maxHttpBufferSize literal from index.ts. Accept any of:
//   maxHttpBufferSize: 64 * 1024 * 1024
//   maxHttpBufferSize: 64e6
//   maxHttpBufferSize: 67108864
function extractMaxHttpBufferSize(src: string): number | null {
  const match = src.match(/maxHttpBufferSize:\s*([^,\n]+)/);
  if (!match) return null;
  // eval-the-expression in a controlled way — only allow numeric literals,
  // arithmetic operators, and exponent notation. No identifiers.
  const expr = match[1].trim().replace(/\/\/.*$/, '').trim();
  if (!/^[\d_.\s+\-*/eE()]+$/.test(expr)) return null;
  // eslint-disable-next-line no-new-func
  const value = Function(`"use strict"; return (${expr});`)();
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function extractMaxFileSize(src: string): number | null {
  const match = src.match(/maxFileSize:\s*(\d+(?:_\d+)*)/);
  if (!match) return null;
  return parseInt(match[1].replace(/_/g, ''), 10);
}

describe('socket.io upload buffer sizing (regression for #11)', () => {
  test('maxHttpBufferSize is set in src/index.ts', () => {
    const value = extractMaxHttpBufferSize(INDEX_TS);
    expect(value).not.toBeNull();
    expect(value!).toBeGreaterThan(0);
  });

  test('maxFileSize is set in src/config.ts', () => {
    const value = extractMaxFileSize(CONFIG_TS);
    expect(value).not.toBeNull();
    expect(value!).toBeGreaterThan(0);
  });

  test('maxHttpBufferSize is at least 1MB (covers ANSI screens, AREXX I/O, etc.)', () => {
    const buffer = extractMaxHttpBufferSize(INDEX_TS)!;
    expect(buffer).toBeGreaterThanOrEqual(1 * 1024 * 1024);
  });

  test('maxHttpBufferSize is at most 16MB — file bodies must NOT go through the socket', () => {
    const buffer = extractMaxHttpBufferSize(INDEX_TS)!;
    // The migration moved file uploads to HTTP /api/upload (multer). The
    // websocket should never carry a file body. If maxHttpBufferSize creeps
    // above 16MB, someone may have re-introduced a binary-on-socket pattern
    // that #11 was meant to permanently eliminate.
    expect(buffer).toBeLessThanOrEqual(16 * 1024 * 1024);
  });

  test('frontend BBSTerminal emits file-upload-ready (multipart HTTP path), not file-upload (JSON array)', () => {
    const fs = require('fs');
    const path = require('path');
    const bbs = fs.readFileSync(
      path.resolve(__dirname, '../../../../packages/terminal/src/components/BBSTerminal.tsx'),
      'utf8'
    );

    // The multipart path must be present.
    expect(bbs).toMatch(/socket\.emit\(\s*['"]file-upload-ready['"]/);

    // The legacy JSON-array path (Array.from(new Uint8Array(...))) MUST NOT
    // appear. Any code that re-introduces it brings #11 right back.
    expect(bbs).not.toMatch(/Array\.from\s*\(\s*new\s+Uint8Array\s*\([^)]*\)\s*\)/);

    // Must use fetch against the multer endpoint.
    expect(bbs).toMatch(/fetch\(\s*[^,)]*uploadUrl[\s\S]*?method:\s*['"]POST['"]/);
  });

  test('backend listens for file-upload-ready and feeds it to processFileUpload', () => {
    const fs = require('fs');
    const path = require('path');
    const handlers = fs.readFileSync(
      path.resolve(__dirname, '../../src/server/file-socket-handlers.ts'),
      'utf8'
    );

    expect(handlers).toMatch(/socket\.on\(\s*['"]file-upload-ready['"]/);
    // The handler must invoke processFileUpload with the multer-supplied path.
    const block = handlers.match(
      /socket\.on\(\s*['"]file-upload-ready['"][\s\S]*?\n\s{2}\}\);?/
    );
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/processFileUpload\s*\(/);
    expect(block![0]).toMatch(/path:\s*data\.path/);
  });
});
