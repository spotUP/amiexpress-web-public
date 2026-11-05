/**
 * REACHABILITY: the artist's logo file reaches the screen through the door's
 * real entry point (Door.execute -> door.onStart -> showMenu -> renderMenu ->
 * sessionLogoRows -> blessed -> ctx.output -> socket).
 *
 * The sdk tests prove the reader; only this proves Galaga calls it. The
 * sentinel is a string no part of the figlet logo or the menu contains.
 */

import assert from 'assert';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const DOOR_DIR = join(__dirname, '..');
const ART_DIR = join(DOOR_DIR, 'art');
const SENTINEL = 'ZXQ-ARTIST-LOGO-7731';

export async function artist_logo_file_reaches_the_screen_through_door_start(): Promise<void> {
  assert.ok(!existsSync(ART_DIR), 'refusing to run over a real art/ folder');
  const sent: string[] = [];
  const socket = {
    emit: (_event: string, data: unknown) => { if (typeof data === 'string') sent.push(data); },
    on: () => socket, off: () => socket, once: () => socket, removeListener: () => socket,
    removeAllListeners: () => socket,
  };
  const bbsSession: Record<string, unknown> = { nodeId: 1, screenWidth: 80 };

  // Door storage goes to a scratch board, not into the checkout.
  const board = mkdtempSync(join(tmpdir(), 'galaga-logo-'));
  const priorBoard = process.env.BBS_DATA_DIR;
  // Storage only honours a data dir named `bbs`.
  process.env.BBS_DATA_DIR = join(board, 'bbs');
  mkdirSync(ART_DIR);
  try {
    writeFileSync(join(ART_DIR, 'logo.ans'), `${SENTINEL}\r\nsecond row\r\n`);
    const { default: door } = await import('../index.js');
    // execute() stays in the input loop until the door closes; the menu is
    // drawn by then, so do not await it.
    void (door as any).execute({ socket, bbsSession, user: { id: 'logo-slot-test' }, params: [] }).catch(() => undefined);
    for (let i = 0; i < 100 && !sent.join('').includes('Classic 1981'); i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    const screen = sent.join('');
    assert.ok(screen.includes('Classic 1981'), 'the menu never reached the screen');
    assert.ok(screen.includes(SENTINEL), 'the artist logo file did not reach the screen');
    assert.ok(!screen.includes('/ ___| __ _| |'), 'the code figlet drew although a logo file exists');
  } finally {
    rmSync(ART_DIR, { recursive: true, force: true });
    rmSync(board, { recursive: true, force: true });
    if (priorBoard === undefined) delete process.env.BBS_DATA_DIR; else process.env.BBS_DATA_DIR = priorBoard;
  }
}
