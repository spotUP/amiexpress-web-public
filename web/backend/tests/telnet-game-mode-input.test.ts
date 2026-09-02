/**
 * A door in GAME MODE takes input over telnet.
 *
 * "key input are still not working via telnet in gmaster and probably all our
 * typescript doors" (sysop, 2026-09-02, confirmed on a live telnet session).
 *
 * Game mode means the CLIENT sends key-down/key-up events instead of
 * characters, so the character path steps aside. Only a browser has that
 * channel: a telnet or SSH caller sends bytes and nothing else. The character
 * path stood aside for them too, so every keystroke was dropped - the door
 * drew perfectly and did nothing.
 *
 * This pins the rule that decides it. The routing itself lives in
 * socket-handlers.ts; what is testable without a socket is the question it
 * asks, and that question is the whole bug.
 */

export {};

import { deliversKeyEvents } from '../src/services/key-event-capable';

describe('who delivers key events', () => {
  it('a browser does', () => {
    expect(deliversKeyEvents({ connectionType: 'web' })).toBe(true);
  });

  it('telnet and ssh do not - they send characters', () => {
    expect(deliversKeyEvents({ connectionType: 'telnet' })).toBe(false);
    expect(deliversKeyEvents({ connectionType: 'ssh' })).toBe(false);
  });

  it('an unknown transport is treated as a browser', () => {
    // The safe default is the one whose failure is visible: a browser wrongly
    // treated as characters-only would at worst see input twice, but a telnet
    // caller wrongly treated as key-event capable sees nothing at all - and
    // that is the bug this file exists for. Sessions created without a
    // connectionType are the web ones (session-manager.ts defaults to 'web').
    expect(deliversKeyEvents({})).toBe(true);
    expect(deliversKeyEvents({ connectionType: undefined })).toBe(true);
  });
});

describe('the game-mode gate in the character path', () => {
  /**
   * The gate as socket-handlers.ts spells it. Kept in step with the source by
   * the assertion below, which reads the file.
   */
  const characterPathStandsAside = (session: { gameModeEnabled?: boolean; connectionType?: any }) =>
    !!session.gameModeEnabled && deliversKeyEvents(session);

  it('stands aside for a browser in game mode', () => {
    expect(characterPathStandsAside({ gameModeEnabled: true, connectionType: 'web' })).toBe(true);
  });

  it('keeps carrying characters for telnet in game mode', () => {
    expect(characterPathStandsAside({ gameModeEnabled: true, connectionType: 'telnet' })).toBe(false);
  });

  it('carries characters for everyone when game mode is off', () => {
    expect(characterPathStandsAside({ gameModeEnabled: false, connectionType: 'web' })).toBe(false);
    expect(characterPathStandsAside({ connectionType: 'telnet' })).toBe(false);
  });

  it('is what socket-handlers.ts actually asks', () => {
    // A rule nothing reads is the shape of the original bug, so this checks
    // the gate in the source is the one tested above.
    const { readFileSync } = require('fs');
    const { join } = require('path');
    const source = readFileSync(
      join(__dirname, '..', 'src', 'server', 'socket-handlers.ts'), 'utf8',
    );
    expect(source).toContain('if (session.gameModeEnabled && deliversKeyEvents(session)) {');
  });
});
