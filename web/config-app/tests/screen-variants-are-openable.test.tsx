/**
 * A screen's PETSCII and RIP variants have to be REACHABLE.
 *
 * The page groups by screen name and opens the file the resolver picked, which
 * for an ANSI caller is always the `.txt`. The other variants were printed as
 * plain text in a column, so `BBSTITLE.SEQ` and `bbstitle.rip` were listed and
 * unopenable - the sysop's report was "I only see the ANSI".
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { render, screen } from '@testing-library/react';
import { PetsciiScreenPreview } from '../src/components/PetsciiScreenPreview';

vi.mock('@amiexpress/terminal', () => ({
  PetsciiMachine: class {
    feed() { /* the bytes are irrelevant to this assertion */ }
    get state() { return { screen: new Uint8Array(1000), colors: new Uint8Array(1000), cols: 40, rows: 25 }; }
  },
  PetsciiCanvas: ({ machine }: { machine: unknown }) =>
    <div data-testid="petscii-canvas">{machine ? 'drawn' : 'nothing'}</div>,
}));

describe('a .seq screen in the file panel', () => {
  it('is drawn by the PETSCII renderer rather than apologised for', () => {
    // The page used to print "the board does not render this correctly yet".
    // It does: PetsciiMachine and PetsciiCanvas are what a C64 caller's own
    // terminal draws with.
    render(<PetsciiScreenPreview content={btoa('\x93hello')} />);
    expect(screen.getByTestId('petscii-canvas')).toHaveTextContent('drawn');
  });
});

describe('the page source', () => {
  it('opens each variant instead of printing it', () => {
    const source = readFileSync(join(__dirname, '..', 'src', 'pages', 'ScreenScopeTables.tsx'), 'utf8');
    // The variants column must produce something clickable that sets the open
    // file - a <span> of joined names is what hid the board's RIP and PETSCII
    // art from this page.
    const column = source.slice(source.indexOf("id: 'variants'"), source.indexOf("id: 'variants'") + 1400);
    expect(column).toMatch(/setOpenFile\(/);
    expect(column).not.toMatch(/cell: res => <span className="font-mono">\{res\.variants\.join/);
  });

  /*
   * RETIRED 2026-09-17, and the property kept.
   *
   * This asserted, by reading this page's source, that a `.seq` was routed to
   * `PetsciiScreenEditor` in its read-only mode. The page no longer routes
   * anything: it opens the ONE dialog, and the dialog picks the surface from
   * the file's own format and says in a sentence what it can do with it. So
   * the source it pinned is gone, while the property - a PETSCII file reaches
   * the board's own PETSCII renderer - is asserted where it now lives, by
   * `a-seq-slot-opens-an-editor.test.tsx` and `an-artist-works-in-every-format
   * .test.tsx`, both driving the real dialog rather than a regex.
   *
   * A source pin proves a call exists, never that it works. Two of them here
   * survived a rename and a repoint before this; the third did not survive the
   * page losing the code entirely, which is the right outcome.
   */
});
