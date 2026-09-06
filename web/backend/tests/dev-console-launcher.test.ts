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

  /**
   * Reported 2026-09-06: "the username input field is not focused".
   *
   * The console opens on a login prompt. The launcher attached with the
   * server-log pane selected, so the Username field rendered as the active
   * field - accent label, cursor - while every keystroke went to that pane's
   * bash prompt instead. Nothing was wrong with the prompt: it was never the
   * focused pane.
   */
  /**
   * The logo is one asset with two consumers: this script's startup pane and
   * the console's login screen (dev/console/src/theme/logo.ts). Both gate on
   * it being 79 columns wide, so the width is a contract, not a detail - art
   * that no longer fits wraps into noise in both places at once.
   */
  describe('the shared ASCII logo', () => {
    const logo = readFileSync(
      join(__dirname, '..', '..', '..', 'dev', 'assets', 'amiexpress-logo.txt'),
      'utf8'
    );

    it('is exactly the width both consumers gate on', () => {
      const lines = logo.replace(/\n$/, '').split('\n');
      const width = Math.max(...lines.map(l => l.length));

      expect(width).toBe(79);
      expect(lines).toHaveLength(20);
    });

    it('keeps the artist tag, which is the one non-ASCII glyph in the art', () => {
      // Stored as UTF-8 so `cat` and Ink render it the same; a latin-1
      // round-trip would turn it into a replacement character.
      expect(logo).toContain('tG\u00f8');
    });

    it('is printed by the launcher, with a fallback when the pane is too narrow', () => {
      expect(script).toMatch(/LOGO_FILE=/);
      expect(script).toMatch(/LOGO_COLS=79/);
      expect(script).toMatch(/cat "\$LOGO_FILE"/);
      // The plain box survives as the narrow-terminal branch.
      expect(script).toMatch(/AmiExpress BBS Startup/);
    });
  });

  /**
   * Reported 2026-09-06: the login fields accepted a username and password
   * before the backend was listening, then failed with undici's bare
   * "fetch failed". The console now polls the backend and holds the login
   * until it answers, so the launcher must not also guess with a fixed sleep.
   */
  it('starts the console straight away, leaving readiness to the console', () => {
    const body = launcherBody();
    const pane = body.slice(body.indexOf('dev/console/dist/src/index.js') - 400);

    expect(pane).not.toMatch(/sleep \d+ && if \[ -f dev\/console/);
  });

  it('attaches with the console pane focused, not the server-log pane', () => {
    const body = launcherBody();

    const selects = [...body.matchAll(/tmux select-pane -t "\$\{session\}:amiexpress\.([^"]+)"/g)];
    expect(selects).toHaveLength(1);

    // The console lives in the right column; pane 0 is the startup/log pane.
    expect(selects[0][1]).toBe('{right}');
    expect(selects[0][1]).not.toBe('0');
  });
});
