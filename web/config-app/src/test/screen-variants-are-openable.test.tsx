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
import { PetsciiScreenPreview } from '../components/PetsciiScreenPreview';

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
    const source = readFileSync(join(__dirname, '..', 'pages', 'ScreenFilesPage.tsx'), 'utf8');
    // The variants column must produce something clickable that sets the open
    // file - a <span> of joined names is what hid the board's RIP and PETSCII
    // art from this page.
    const column = source.slice(source.indexOf("id: 'variants'"), source.indexOf("id: 'variants'") + 1400);
    expect(column).toMatch(/setOpenFile\(/);
    expect(column).not.toMatch(/cell: res => <span className="font-mono">\{res\.variants\.join/);
  });

  it('routes a petscii file to the PETSCII preview', () => {
    const source = readFileSync(join(__dirname, '..', 'pages', 'ScreenFilesPage.tsx'), 'utf8');
    expect(source).toMatch(/file\.format === 'petscii'[\s\S]{0,400}PetsciiScreenPreview/);
  });
});
