/**
 * A PETSCII preview needs the C64 character ROM, and the admin never had it.
 *
 * `buildGlyphAtlas` (packages/terminal) rasterises all 512 screen codes with
 * `PetMe64`, which maps each one to a Private Use Area codepoint. Only
 * web/frontend declared the face and shipped the file, so in the admin every
 * codepoint resolved to the missing-glyph box: a `.seq` preview came out as a
 * grid of identical hollow squares, in the right places and the right colours,
 * which is what the sysop photographed - "i uploaded a petscii .seq file now
 * in the ansi studio but the preview is broken".
 *
 * The file has to live under `src/` rather than `public/`: the stylesheet is
 * emitted into `assets/`, so a `public/` path written relative from there
 * points at `assets/fonts/...`, which is nowhere. Vite rewrites a `src/` url
 * to the emitted asset under whatever base the admin is served from.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const appRoot = path.join(__dirname, '..', '..');

describe('the C64 font the PETSCII previews draw with', () => {
  it('ships with the admin', () => {
    const font = path.join(appRoot, 'src', 'fonts', 'PetMe64.ttf');

    expect(fs.existsSync(font)).toBe(true);
    // A truetype file, not a stub: the atlas silently draws boxes for a face
    // that loads but has no glyphs.
    expect(fs.statSync(font).size).toBeGreaterThan(100_000);
  });

  it('is declared, from a path the build can rewrite', () => {
    const css = fs.readFileSync(path.join(appRoot, 'src', 'index.css'), 'utf8');
    // The PetMe64 face, wherever it sits among the others.
    const start = css.lastIndexOf('@font-face', css.indexOf("font-family: 'PetMe64'"));
    const face = css.slice(start, css.indexOf('}', start));

    expect(face).toContain("font-family: 'PetMe64'");
    expect(face).toContain('./fonts/PetMe64.ttf');
    // Not `/fonts/...`: root-absolute ignores the admin's `/admin/` base.
    expect(face).not.toContain("url('/fonts");
    // The atlas is rasterised once; a fallback face drawn while the real one
    // loads would be baked into all 512 glyphs.
    expect(face).toContain('font-display: block');
  });
});
