/**
 * Every face the board preloads must be a file the board serves.
 *
 * The teletext face was renamed TDAText -> TeletextUPR (TDAText is a Reserved
 * Font Name under the OFL, and the shipped copy also needed its lowercase
 * a-ring repaired), and the preload list kept the old spelling. Nothing
 * failed: the browser asked for `/fonts/TDAText.woff2` on every connect, took
 * the 404, and a teletext session then measured and drew in the fallback face.
 * It surfaced only because the sysop pasted a console log (2026-09-14).
 *
 * The list is data in session-font.ts so this can ask the filesystem about it.
 * `public/fonts` is what `/fonts` serves (routes-setup.ts mounts the built
 * frontend's copy of it).
 */
import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect } from 'vitest';
import { PRELOADED_FONTS, TELETEXT_FONT } from '../../../../packages/terminal/src/utils/session-font';

const FONTS_DIR = path.resolve(__dirname, '..', '..', 'public', 'fonts');

describe('the fonts the board preloads', () => {
  it('are all present in public/fonts', () => {
    const missing = PRELOADED_FONTS
      .filter(({ file }) => !fs.existsSync(path.join(FONTS_DIR, file)))
      .map(({ family, file }) => `${family} -> ${file}`);

    expect(missing).toEqual([]);
  });

  it('includes the teletext face under its real name', () => {
    // The rename is the whole reason this file exists.
    const teletext = PRELOADED_FONTS.find(f => f.family === TELETEXT_FONT);

    expect(teletext).toBeDefined();
    expect(teletext!.file).toBe(`${TELETEXT_FONT}.woff2`);
    expect(PRELOADED_FONTS.some(f => f.family === 'TDAText')).toBe(false);
  });

  it('names each family once', () => {
    const families = PRELOADED_FONTS.map(f => f.family);

    expect(new Set(families).size).toBe(families.length);
  });
});
