/**
 * CARD LOBBY is type checked, and the ceiling is what forced it.
 *
 * Its index.ts was 2808 lines against this repo's 2000-line ceiling AND
 * carried `// @ts-nocheck` on line 1, so nothing in it had ever been checked.
 * That was not cosmetic. Behind the suppression sat calls to methods that do
 * not exist:
 *
 *   this.drawUnoCard()             gamepad X at an UNO table
 *   this.callUno()                 gamepad Y at an UNO table
 *   this.refreshLobby()            gamepad START, and the R key
 *   this.gameStateManager.getUnoEngine()   gamepad A at an UNO table
 *   this.loadProfile(...)          the end of every UNO game
 *   this.dialogManager.showConfirmDialog(...)   deleting a table
 *
 * Every one of those is a TypeError at the moment a player reaches it. They
 * are fixed, and this file exists so the suppression cannot come back and
 * take the compiler's answer away again: `tsc --noEmit` in Doors/card-lobby
 * is now a real check, and these are the two ways to make it stop being one.
 *
 * The door's own suite covers behaviour; this covers the guarantee.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const DOOR = join(__dirname, '..', '..', '..', '..', 'Doors', 'card-lobby');

/** Comments do not call anything - run() carries a commented-out call. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Every .ts the door compiles - its tsconfig includes index, managers, lib. */
function sources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'tests') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sources(full, found);
    else if (entry.endsWith('.ts')) found.push(full);
  }
  return found;
}

describe('card-lobby keeps the compiler', () => {
  it('suppresses type checking nowhere', () => {
    // The directive only counts at the start of a line - the managers'
    // own headers explain what it cost, in prose, which is not a directive.
    const suppressed = sources(DOOR).filter((file) =>
      /^\s*\/\/\s*@ts-nocheck/m.test(readFileSync(file, 'utf8')),
    );
    expect(suppressed).toEqual([]);
  });

  it('stays under the repo line ceiling, which is what pays for the above', () => {
    // The pre-commit hook refuses a file over 2000 lines, so a door that
    // grows past it cannot be edited at all - which is how this one sat at
    // 2808 lines with a ten-line fix waiting on it for a day.
    const lines = readFileSync(join(DOOR, 'index.ts'), 'utf8').split('\n').length;
    expect(lines).toBeLessThan(2000);
  });

  it('has no method calling a name the class does not define', () => {
    // The specific defect class, checked directly rather than by trusting
    // that someone ran tsc: every `this.foo(` in index.ts must be a member
    // of the class or of one of the managers it holds.
    const source = stripComments(readFileSync(join(DOOR, 'index.ts'), 'utf8'));
    const defined = new Set([
      ...[...source.matchAll(/^  (?:public |private )?(?:async )?([A-Za-z_][A-Za-z0-9_]*)\s*[(<]/gm)]
        .map((m) => m[1]),
      ...[...source.matchAll(/^  (?:public|private) (?:get |set )?([A-Za-z_][A-Za-z0-9_]*)[!:?]/gm)]
        .map((m) => m[1]),
    ]);

    const called = [...source.matchAll(/\bthis\.([A-Za-z_][A-Za-z0-9_]*)\(/g)].map((m) => m[1]);
    const missing = [...new Set(called)].filter((name) => !defined.has(name));

    expect(missing).toEqual([]);
  });
});
