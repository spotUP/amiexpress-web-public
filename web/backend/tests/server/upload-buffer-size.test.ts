/**
 * Regression for #11: socket.io's maxHttpBufferSize must be large enough to
 * receive a max-size file upload as the frontend currently encodes them.
 *
 * Background:
 *   The BBSTerminal frontend emits file uploads via:
 *     socket.emit('file-upload', { ..., data: Array.from(new Uint8Array(buf)) })
 *   That serializes each byte as a 1-3 char JSON number plus a comma. Average
 *   inflation factor is ~3x — a 10MB binary becomes ~30MB on the wire.
 *
 *   The configured upload cap is 10MB (config.ts:120 maxFileSize, plus the
 *   multer instance at file-routes.ts:59). Before the fix, socket.io's
 *   maxHttpBufferSize was 1MB, so any file larger than ~330KB triggered a
 *   socket.io "transport error" mid-upload and the user was disconnected
 *   back to the login screen.
 *
 *   The fix bumped maxHttpBufferSize to 64MB so the JSON-encoded worst case
 *   (10MB raw → ~30MB JSON → ~32-40MB after protocol overhead) fits.
 *
 * This test is a source-level guard — it reads the live config and asserts:
 *   maxHttpBufferSize >= 3 * maxFileSize
 *
 * If the upload pipeline is ever refactored to send the file as a binary
 * websocket frame (Uint8Array) instead of a JSON number array, this guard
 * can be relaxed (the inflation factor goes away).
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

  test('maxHttpBufferSize accommodates a JSON-encoded max-size upload (>= 3x maxFileSize)', () => {
    const buffer = extractMaxHttpBufferSize(INDEX_TS)!;
    const fileCap = extractMaxFileSize(CONFIG_TS)!;

    // Average inflation for Array.from(Uint8Array(...)) → JSON is ~3x.
    // Anything below this and an upload at the file cap will trip the
    // socket.io "transport error" disconnect — i.e. resurrect bug #11.
    expect(buffer).toBeGreaterThanOrEqual(fileCap * 3);
  });

  test('maxHttpBufferSize is at least 16MB (sanity floor)', () => {
    const buffer = extractMaxHttpBufferSize(INDEX_TS)!;
    // The pre-fix value was 1e6 (1MB). Anything below 16MB clearly hasn't
    // been considered for the JSON-encoded upload path.
    expect(buffer).toBeGreaterThanOrEqual(16 * 1024 * 1024);
  });
});
