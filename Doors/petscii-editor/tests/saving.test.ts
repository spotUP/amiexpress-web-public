/**
 * What a caller saves, and what the board refuses.
 *
 * A `.seq` is BYTES. Storage holds JSON, so they travel as base64 - and the
 * reason this is a test rather than a comment is that reading those bytes as
 * text turns every high-bit byte into U+FFFD, which is how art dies quietly.
 *
 * The board path carries the board's two rules (bank 1 only, black background
 * only). They are checked on the BYTES about to be written, because the file
 * is what the next caller's C64 will read.
 */

import assert from 'assert';
import {
  FILE_PREFIX, withSeqExtension, isSysop,
  listOwnScreens, loadOwnScreen, saveOwnScreen, saveBoardScreen,
} from '../assets';

function fakeStorage() {
  const saved = new Map<string, any>();
  return {
    saved,
    api: {
      keys: async () => Array.from(saved.keys()),
      load: async (key: string) => saved.get(key) ?? null,
      save: async (key: string, value: any) => { saved.set(key, value); },
      delete: async (key: string) => { saved.delete(key); },
    },
  };
}

function ctxWith(storage: any, accessLevel = 100, written: Array<[string, string]> = []) {
  return {
    storage,
    user: { name: 'spot', accessLevel },
    bbs: {
      writeFile: async (path: string, data: string) => { written.push([path, data]); },
      listFiles: async () => [],
      readFile: async () => null,
    },
  } as any;
}

export async function aScreenSurvivesTheRoundTripThroughStorage(): Promise<void> {
  const storage = fakeStorage();
  const ctx = ctxWith(storage.api);
  // Every byte above 127, which is exactly what a text round trip destroys.
  const bytes = Uint8Array.from([0x0e, 0x93, 0xa0, 0xb0, 0xff, 0x12, 0x92]);

  await saveOwnScreen(ctx, 'art.seq', bytes);
  const read = await loadOwnScreen(ctx, 'art.seq');

  assert.deepStrictEqual(Array.from(read ?? []), Array.from(bytes));
}

export async function aCallersScreensAreListedWithoutThePrefix(): Promise<void> {
  const storage = fakeStorage();
  const ctx = ctxWith(storage.api);
  await saveOwnScreen(ctx, 'b.seq', Uint8Array.from([0x0e]));
  await saveOwnScreen(ctx, 'a.seq', Uint8Array.from([0x0e]));

  assert.deepStrictEqual(await listOwnScreens(ctx), ['a.seq', 'b.seq']);
  assert.ok(Array.from(storage.saved.keys()).every((key) => key.startsWith(FILE_PREFIX)));
}

export async function theBoardRefusesAScreenThatBreaksItsRules(): Promise<void> {
  const written: Array<[string, string]> = [];
  const ctx = ctxWith(fakeStorage().api, 255, written);
  // No `$0E`, so the glyph below is drawn in the graphics bank: the rule the
  // sysop set on 2026-09-14, and the board's own checkBoardRules enforces it.
  const bankZero = Uint8Array.from([0x41, 0x42]);

  const result = await saveBoardScreen(ctx, 'Screens/bad.seq', bankZero);

  assert.strictEqual(result.saved, false);
  assert.ok((result.reason ?? '').length > 0, 'a refusal says why');
  assert.strictEqual(written.length, 0, 'and nothing reaches the board');
}

export async function theBoardTakesALegalScreen(): Promise<void> {
  const written: Array<[string, string]> = [];
  const ctx = ctxWith(fakeStorage().api, 255, written);
  const legal = Uint8Array.from([0x0e, 0x41, 0x42]);

  const result = await saveBoardScreen(ctx, 'Screens/good.seq', legal);

  assert.strictEqual(result.saved, true);
  assert.strictEqual(written.length, 1);
  assert.strictEqual(written[0][0], 'Screens/good.seq');
}

export async function onlyASysopCountsAsOne(): Promise<void> {
  assert.strictEqual(isSysop(ctxWith(fakeStorage().api, 100)), false);
  assert.strictEqual(isSysop(ctxWith(fakeStorage().api, 255)), true);
}

export async function aNameGetsTheExtensionItNeeds(): Promise<void> {
  assert.strictEqual(withSeqExtension('art'), 'art.seq');
  assert.strictEqual(withSeqExtension('art.seq'), 'art.seq');
  assert.strictEqual(withSeqExtension('ART.SEQ'), 'ART.SEQ');
}
