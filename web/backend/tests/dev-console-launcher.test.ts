/**
 * start-servers.sh dev-console launcher regression tests.
 *
 * Reported 2026-08-25: running the start script produced
 *   Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'react'
 *   imported from dev/console/dist/src/index.js
 *
 * dev/console has its OWN package.json (ink + react) and is not covered by
 * the root install, so a checkout that never installed there has no
 * node_modules at all. The launcher went straight to `npm run build` with
 * its output discarded and its failure swallowed by `|| true`, then started
 * node against a dist whose imports could not resolve - so a missing
 * install surfaced as a bare module-resolution stack trace in a tmux pane.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const script = readFileSync(
  join(__dirname, '..', '..', '..', 'dev', 'scripts', 'start-servers.sh'),
  'utf8'
);

/** The launcher body, so assertions cannot match unrelated parts of the file. */
function launcherBody(): string {
  const start = script.indexOf('launch_tmux_session() {');
  expect(start).toBeGreaterThanOrEqual(0);
  const end = script.indexOf('\n}', start);
  return script.slice(start, end);
}

describe('dev console launcher', () => {
  it('installs the console dependencies when they are missing', () => {
    const body = launcherBody();

    expect(body).toMatch(/if \[ ! -d "\$console_dir\/node_modules" \]/);
    expect(body).toMatch(/npm install/);
  });

  it('installs before it builds', () => {
    const body = launcherBody();
    // Match the invocations, not the words: the comment above them explains
    // the old `npm run build` behaviour and would otherwise satisfy this.
    const install = body.indexOf('npm install --silent');
    const build = body.indexOf('&& npm run build --silent');

    expect(install).toBeGreaterThanOrEqual(0);
    expect(build).toBeGreaterThanOrEqual(0);
    expect(install).toBeLessThan(build);
  });

  it('says so when the install fails instead of failing silently', () => {
    expect(launcherBody()).toMatch(/WARNING: dev console install failed/);
  });

  it('guards the console pane so an unbuilt console prints a hint, not a stack trace', () => {
    const body = launcherBody();

    expect(body).toMatch(/if \[ -f dev\/console\/dist\/src\/index\.js \]/);
    expect(body).toMatch(/\[console\] unavailable/);
  });
});
