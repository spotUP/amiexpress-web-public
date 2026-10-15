/**
 * Manifest location for TypeScript doors (door-manifest-path.ts).
 *
 * Live regression this pins (2026-08-24, bbs.uprough.net): in production a
 * hybrid door's entry resolves to <door>/dist/server.js and the manifest
 * was probed at dirname(entry) - dist/ has no package.json, so hybrid
 * detection failed: red "Invalid TypeScript door: execute is undefined"
 * flashed in the menu and the door's server RPC handlers (arkanoid
 * highscores, score webhooks) were never registered. Development masked it
 * because the dev entry is the door root's index.ts, whose dirname IS the
 * door root.
 */

import * as path from 'path';
import { doorManifestPath } from '../../src/doors/door-manifest-path';

describe('doorManifestPath', () => {
  const doorRoot = path.join('/app', 'Doors', 'arkanoid');

  it('probes the door root even when the entry lives in dist/ (the live bug)', () => {
    const entry = path.join(doorRoot, 'dist', 'server.js');

    expect(doorManifestPath(doorRoot, entry)).toBe(path.join(doorRoot, 'package.json'));
  });

  it('probes the door root for a dev source entry too', () => {
    const entry = path.join(doorRoot, 'index.ts');

    expect(doorManifestPath(doorRoot, entry)).toBe(path.join(doorRoot, 'package.json'));
  });

  it('falls back to dirname(entry) for doors registered as a bare file path', () => {
    const entry = path.join('/app', 'Doors', 'single-file-door.ts');

    expect(doorManifestPath(null, entry)).toBe(path.join('/app', 'Doors', 'package.json'));
  });
});
