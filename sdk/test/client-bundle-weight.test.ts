/**
 * A door's browser bundle carries what the door uses, and not the rest.
 *
 * "only what is used by the 68k doors should be included in the binaries not
 * the full sdk every time, this should be true for the typescript blessed sdk
 * as well" (sysop, 2026-09-02).
 *
 * It was not true. `client/index.ts` re-exports UIEngine, UIEngine imports the
 * blessed barrel, and the barrel is every widget - so a door that imports
 * `ClientDoor` for the browser shipped the whole terminal UI engine, ANSI
 * editor included. Measured on PENGO, whose client imports three names:
 * 1.5 MB, of which 143 KB was the ANSI editor widget alone.
 *
 * The fix is one line - `"sideEffects": false` in the SDK's package.json -
 * which lets a bundler drop a re-exported module nobody used. That claim is
 * true of this SDK: no module here does anything at import time that an
 * importer depends on (no registries, no prototype patches, no polyfills).
 *
 * This test is the guard on both halves: the flag, and what it buys.
 */

import { describe, it, expect } from '@jest/globals';
import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** The SDK's client entry, as an absolute path a temp file can import. */
const CLIENT_ENTRY = path.resolve(__dirname, '..', 'client', 'index.ts').replace(/\\/g, '/');

/** Bundle one line of door-shaped source and hand back the output. */
function bundle(source: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-bundle-'));
  const entry = path.join(dir, 'entry.ts');
  fs.writeFileSync(entry, source);

  const result = esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'esm',
    target: 'es2020',
    platform: 'browser',
    external: ['fs', 'path', 'child_process'],
    absWorkingDir: path.resolve(__dirname, '..'),
  });

  fs.rmSync(dir, { recursive: true, force: true });
  return result.outputFiles[0].text;
}

describe('the SDK says it is side-effect free', () => {
  it('declares it, which is what lets a bundler drop what a door did not use', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'),
    );
    expect(pkg.sideEffects).toBe(false);
  });

  it('has no module that does its work at import time', () => {
    // The flag is a promise. These are the shapes that would break it: a
    // bare `import './x'` for effect, a global registered on load, a patched
    // prototype. If one appears, the flag has to become a list of files.
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('dist')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) out.push(full);
      }
      return out;
    };

    const offenders: string[] = [];
    for (const file of walk(path.resolve(__dirname, '..'))) {
      const text = fs.readFileSync(file, 'utf8');
      for (const line of text.split('\n')) {
        if (/^import\s+['"][^'"]+['"];/.test(line)) offenders.push(`${file}: ${line.trim()}`);
        if (/^(globalThis|window)\.\w+\s*=/.test(line)) offenders.push(`${file}: ${line.trim()}`);
        if (/^\w+\.prototype\.\w+\s*=/.test(line)) offenders.push(`${file}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('a browser bundle carries what the door asked for', () => {
  // Slower than a unit test because it really bundles; worth it, because the
  // thing under test is what a bundler does, and nothing else can prove it.
  jest.setTimeout(60_000);

  it('keeps what the door asked for', () => {
    // Dropping the unused must not drop the used. PENGO's client imports
    // exactly these three names.
    const out = bundle(`
      import { ClientDoor, AudioEngine, TrackerEngine } from '${CLIENT_ENTRY}';
      export const parts = [ClientDoor, AudioEngine, TrackerEngine];
    `);

    expect(out).toContain('AudioEngine');
    expect(out).toContain('TrackerEngine');
    expect(out).toContain('ClientDoor');
  });
});

/**
 * The artifact, not the theory.
 *
 * A door's committed dist/client.bundle.js is what a caller's browser
 * downloads, and it is the only place the rule can be checked honestly: a
 * door resolves the SDK as a PACKAGE, and it is dist-esm's compiled shapes -
 * not the source - that a bundler cannot drop without the sideEffects flag.
 * Bundling source in a fixture passes either way, which is how a weaker
 * version of this test passed while every door still shipped the whole
 * widget set.
 */
describe('the bundles doors actually ship', () => {
  const doorsDir = path.resolve(__dirname, '..', '..', 'Doors');

  const bundles = (): Array<{ door: string; kb: number }> =>
    fs.readdirSync(doorsDir)
      .map((door) => ({ door, file: path.join(doorsDir, door, 'dist', 'client.bundle.js') }))
      .filter((entry) => fs.existsSync(entry.file))
      .map((entry) => ({ door: entry.door, kb: Math.round(fs.statSync(entry.file).size / 1024) }));

  it('has bundles to check', () => {
    expect(bundles().length).toBeGreaterThan(5);
  });

  it('keeps every door under the weight the whole widget set put on them', () => {
    // Before the fix the heaviest were 1.5 MB and the median 1.2 MB, most of
    // it the terminal UI engine no browser bundle uses. After: 996 KB at the
    // top, and that is Tone.js, which the arcade doors do use. 1,100 KB is
    // the ceiling - above it, something is being pulled in again.
    const heavy = bundles().filter((entry) => entry.kb > 1100);
    expect(heavy).toEqual([]);
  });

  it('keeps a door that only wants ClientDoor small', () => {
    // NEO-BLESSED-SHOWCASE draws its UI server-side; its client imports one
    // name. It shipped 784 KB of widgets it never touched, and now ships 16.
    const showcase = bundles().find((entry) => entry.door === 'neo-blessed-showcase');
    if (!showcase) return;                    // the door may not be installed
    expect(showcase.kb).toBeLessThan(100);
  });
});
