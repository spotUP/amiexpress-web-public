/**
 * A door's client bundle may only call ClientDoor methods that exist.
 *
 * CARD LOBBY's client.ts opened with `door.onMessage('sound', ...)`. ClientDoor
 * has no onMessage and nothing on the board ever emitted the event it was
 * waiting for - so the call threw on the bundle's FIRST evaluation:
 *
 *     Uncaught TypeError: door.onMessage is not a function
 *
 * A throw at module scope ends the module. Everything below that line never
 * ran - the input forwarding, the connect handler, and `door.start()` itself -
 * and the browser reported one line in the console while the door appeared to
 * work, because the server half draws the screen (sysop's console, 2026-09-14).
 *
 * Typescript cannot catch it: these bundles are built by esbuild from a
 * `door` typed as `any` in practice, and the SDK is resolved through a
 * symlink. So the check is here, against the real class.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

// The client entry pulls Tone, which ships ESM that jest will not parse.
// The audio engine is not what is under test; the door's method surface is.
jest.mock('tone', () => ({}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ClientDoor } = require('../../client');

const DOORS_DIR = join(__dirname, '../../../board/Doors');

/** Every `door.<name>(` a bundle calls, with the line it is on. */
function callsIn(source: string): { name: string; line: number }[] {
  const calls: { name: string; line: number }[] = [];
  source.split('\n').forEach((text, index) => {
    // Skip comments: the fix for this bug is itself a comment naming the
    // method that used to be called.
    const code = text.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
    for (const match of code.matchAll(/\bdoor\.([a-zA-Z_$][\w$]*)\s*\(/g)) {
      calls.push({ name: match[1], line: index + 1 });
    }
  });
  return calls;
}

function clientBundles(): { door: string; path: string }[] {
  if (!existsSync(DOORS_DIR)) return [];
  return readdirSync(DOORS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ door: entry.name, path: join(DOORS_DIR, entry.name, 'client.ts') }))
    .filter((candidate) => existsSync(candidate.path));
}

/** What a `door` object really answers to, prototype chain included. */
function methodsOf(instance: object): Set<string> {
  const names = new Set<string>();
  let proto: object | null = instance;
  while (proto && proto !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(proto)) names.add(key);
    proto = Object.getPrototypeOf(proto);
  }
  return names;
}

describe('a door client bundle calls methods the SDK has', () => {
  const bundles = clientBundles();

  it('finds the client bundles to check', () => {
    expect(bundles.length).toBeGreaterThan(0);
  });

  it.each(bundles.map((b) => [b.door, b.path]))(
    '%s calls nothing ClientDoor lacks',
    (door, path) => {
      const door_ = new ClientDoor({ name: String(door), version: '0.0.0' } as never);
      const available = methodsOf(door_);
      const missing = callsIn(readFileSync(String(path), 'utf8')).filter(
        (call) => !available.has(call.name),
      );

      expect(
        missing.map((m) => `${path}:${m.line} door.${m.name}() does not exist`),
      ).toEqual([]);
    },
  );

  it('would have caught the one that shipped', () => {
    const door_ = new ClientDoor({ name: 'probe', version: '0.0.0' } as never);
    // The exact call that broke CARD LOBBY in the browser.
    expect(methodsOf(door_).has('onMessage')).toBe(false);
    expect(methodsOf(door_).has('onInput')).toBe(true);
  });
});
