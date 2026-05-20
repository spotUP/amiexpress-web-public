/**
 * Regression: launchAmigaDoor must NOT transition to DISPLAY_MENU when a
 * RETURNCOMMAND chained directly into another door.
 *
 * Symptom (reported by user 2026-05-20): pressing 'N' in dRE!WAll to
 * decline leaving a wall tag — which is part of the LOGON door chain on
 * bbs.uprough.net — flashes the BBS menu prompt
 *   "AmiExpress Web BBS [2:Amiga Warez!] Menu (47 mins. left): "
 * between dRE!WAll exit and the next door in the chain. Express.e's main
 * loop doesn't render the menu prompt between auto-run commands; the
 * port had the chain runner correctly forward to the next door but then
 * unconditionally set subState=DISPLAY_MENU + menuPause=false, racing
 * the next door's setup.
 *
 * Pin the next-door-active gate so a "tidy up" can't restore the old
 * always-render-menu behaviour.
 *
 * Same grep-style approach as upload-abort-state.test.ts because
 * door.handler.ts can't be loaded cleanly under jest (drags in the BBS
 * subsystem + 68K emulator).
 */

import * as fs from 'fs';
import * as path from 'path';

describe('launchAmigaDoor must not flash menu prompt during chained-door handoff', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'handlers', 'door.handler.ts'),
    'utf8'
  );

  function launchAmigaDoorMenuTransitionBlock(): string {
    // Capture the area around the post-chain DISPLAY_MENU assignment in
    // launchAmigaDoor (the only function that runs the
    // chain/return/prv/acp commands after a door exits).
    const m = src.match(
      /\[launchAmigaDoor\] Failed to auto-run pending door commands[\s\S]*?session\.subState\s*=\s*LoggedOnSubState\.DISPLAY_MENU/
    );
    if (!m) throw new Error('launchAmigaDoor post-chain block not found');
    return m[0];
  }

  test('declares a nextDoorActive guard (chain handoff detection) before the DISPLAY_MENU assignment', () => {
    // Match the variable declaration, not just comment mentions.
    expect(launchAmigaDoorMenuTransitionBlock()).toMatch(
      /const\s+nextDoorActive\s*=[\s\S]*?inDoorManager/
    );
  });

  test('checks DOOR_RUNNING subState as part of the guard', () => {
    expect(launchAmigaDoorMenuTransitionBlock()).toMatch(
      /nextDoorActive[\s\S]*?DOOR_RUNNING|DOOR_RUNNING[\s\S]*?nextDoorActive/
    );
  });

  test('the DISPLAY_MENU assignment is gated on !nextDoorActive', () => {
    expect(launchAmigaDoorMenuTransitionBlock()).toMatch(/!nextDoorActive/);
  });

  test('still preserves the FILES_UPLOAD / FILES_DOWNLOAD bypass (no menu-during-ZMODEM regression)', () => {
    const body = launchAmigaDoorMenuTransitionBlock();
    expect(body).toMatch(/FILES_UPLOAD/);
    expect(body).toMatch(/FILES_DOWNLOAD/);
  });
});
