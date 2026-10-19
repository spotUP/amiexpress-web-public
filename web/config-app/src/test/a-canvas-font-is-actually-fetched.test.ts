/**
 * The board's faces have to be REQUESTED, or a canvas draws in Courier.
 *
 * "this one still dont use topaz and looks broken" (the sysop, 2026-09-14),
 * about a screen preview - after a commit that had already pointed every
 * `ctx.font` at TopazPlus. Naming the face was necessary and not sufficient:
 * setting `ctx.font` does not fetch a webfont, and nothing else on the page
 * asked for it, so the browser never loaded the file and fell back without
 * saying anything.
 *
 * `AnsiCanvas` already repainted on `document.fonts.ready` - and that is the
 * trap. `ready` resolves when PENDING loads finish; a face nobody requested is
 * never pending, so it resolved immediately and repainted the same fallback.
 * The missing piece is `document.fonts.load()`, the only call that starts a
 * fetch for a face no DOM element uses.
 *
 * The last test is the one that would have caught the original bug: every
 * `@font-face` the stylesheet ships is a face some canvas draws with, so any
 * face we ship and never request is this bug again.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { BOARD_FONT_FAMILIES, loadBoardFonts } from '../lib/board-fonts';

const SRC = join(__dirname, '..');

describe('the board fonts', () => {
  it('are asked for by name, which is what starts the fetch', async () => {
    const load = vi.fn().mockResolvedValue([]);

    await loadBoardFonts({ load });

    const asked = load.mock.calls.map(([spec]) => spec as string);
    expect(asked).toEqual([
      '16px "TopazPlus_a1200"',
      '16px "Topaz_a1200"',
      '16px "PetMe64"',
      '16px "TeletextUPR"',
    ]);
  });

  it('include the face the ANSI canvas draws with', () => {
    // Read off the paint module rather than restated here: the defect was the
    // two lists disagreeing, so a copy of the name proves nothing.
    const src = readFileSync(join(SRC, 'components/ansi-canvas-paint.ts'), 'utf8');
    // The face is the paint function's default `fontFamily`, which ctx.font
    // is built from.
    const spec = /fontFamily: string = '[^']*'/.exec(src)?.[0] ?? '';

    expect(spec).toContain('TopazPlus_a1200');
    expect(BOARD_FONT_FAMILIES).toContain('TopazPlus_a1200');
  });

  it('do not fail the admin when one of them will not load', async () => {
    // A face that 404s must cost a worse-looking preview, nothing more.
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('no such font'))
      .mockResolvedValue([]);

    await expect(loadBoardFonts({ load })).resolves.toBeUndefined();
    expect(load).toHaveBeenCalledTimes(BOARD_FONT_FAMILIES.length);
  });

  it('are skipped where the browser has no font set at all', async () => {
    // jsdom, and anything older than FontFaceSet. Start-up must not throw.
    await expect(loadBoardFonts(undefined)).resolves.toBeUndefined();
  });

  it('are requested at start-up, not by whichever page happens to mount', async () => {
    // The whole point is that it does NOT depend on a component. A canvas
    // cannot ask for its own font, so the app asks before any of them mount.
    const main = readFileSync(join(SRC, 'main.tsx'), 'utf8');

    expect(main).toMatch(/loadBoardFonts\s*\(/);
  });

  it('cover every face the stylesheet ships', () => {
    // The invariant that would have caught this. Every @font-face here is
    // drawn by a canvas - ANSI art or the PETSCII atlas - and a canvas fetches
    // nothing, so a shipped face that is never requested is the same bug.
    const css = readFileSync(join(SRC, 'index.css'), 'utf8');
    const shipped = [...css.matchAll(/@font-face\s*\{[^}]*font-family:\s*'([^']+)'/g)]
      .map(match => match[1]);

    expect(shipped.length).toBeGreaterThan(0);
    expect([...BOARD_FONT_FAMILIES].sort()).toEqual([...new Set(shipped)].sort());
  });
});
