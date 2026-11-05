/**
 * The suite must not play in the checkout.
 *
 * Every test file set `process.env.BBS_DATA_DIR` to a fresh temp dir and every
 * one of those was ignored: `defaultBaseDir()` (sdk/core/Storage.ts) takes
 * BBS_DATA_DIR only when the directory is called `bbs`, and falls back to
 * `process.cwd()` otherwise. So all 21 files wrote to ONE place -
 * `Doors/card-lobby/data/doors/card_lobby/` - and kept writing to it across
 * runs: on 2026-09-15 that lobby.json was 641 KB and 120 tables deep, and
 * menus.test.ts had already had to top up a wallet that earlier runs had
 * spent to 164 chips.
 *
 * Three properties, driven through the real Storage the door uses:
 *   - a file's data lands in ITS temp dir,
 *   - two files do not see each other's lobby,
 *   - and nothing lands in the checkout.
 *
 * This module runs LAST in run-tests.ts so the third one judges the whole
 * suite that ran before it.
 */

import assert from 'assert';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { isolatedDataDir, doorDataRoot } from './isolated-data-dir';

const MY_ROOT = isolatedDataDir('isolation');

/** A door store built exactly as index.ts builds it. */
async function globalStore() {
  const { Storage } = await import('@amiexpress/bbs-door-sdk');
  return new Storage({ doorName: 'card_lobby', global: true });
}

export async function aTestFileStoresInsideItsOwnTempDir(): Promise<void> {
  const store = await globalStore();
  await store.save('lobby', { tables: ['mine'] });

  const mine = join(MY_ROOT, 'data', 'doors', 'card_lobby', 'lobby.json');
  assert.ok(
    existsSync(mine),
    `the door's lobby must land in the file's own dir, not ${doorDataRoot('card_lobby')}`,
  );
}

export async function twoTestFilesDoNotShareALobby(): Promise<void> {
  const first = isolatedDataDir('isolation-a');
  const firstStore = await globalStore();
  await firstStore.save('lobby', { tables: ['first'] });

  const second = isolatedDataDir('isolation-b');
  const secondStore = await globalStore();
  assert.notStrictEqual(first, second, 'two calls must hand out two dirs');
  assert.strictEqual(
    await secondStore.load('lobby'),
    null,
    'the second file must open on an empty lobby, not the first file\'s tables',
  );

  await secondStore.save('lobby', { tables: ['second'] });

  // And writing the second must not have touched the first.
  process.env.BBS_DATA_DIR = join(first, 'bbs');
  const firstAgain = await globalStore();
  assert.deepStrictEqual(
    (await firstAgain.load<{ tables: string[] }>('lobby'))?.tables,
    ['first'],
    'the first file keeps its own lobby',
  );

  process.env.BBS_DATA_DIR = join(MY_ROOT, 'bbs');
  rmSync(first, { recursive: true, force: true });
  rmSync(second, { recursive: true, force: true });
}

export async function theSuiteLeavesNoLobbyInTheCheckout(): Promise<void> {
  // run-tests.ts runs from Doors/card-lobby, which is what the old fallback
  // resolved to. Every module above this one has already run.
  const leaked = join(process.cwd(), 'data', 'doors', 'card_lobby');
  assert.ok(
    !existsSync(leaked),
    `the suite wrote into the checkout at ${leaked} - a test file is missing isolatedDataDir(), `
    + 'or something resolved its store before the env was set',
  );
}
