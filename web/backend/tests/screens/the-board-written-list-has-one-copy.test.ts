/**
 * THE LIST OF SCREENS THE BOARD WRITES HAS EXACTLY ONE COPY.
 *
 * `board-written-screens.json` is read by three things in two languages:
 * `screen-tables.ts` (this side), the admin's theme checklist THROUGH
 * screen-tables in a vite bundle, and `docker-entrypoint.sh`, which greps the
 * keys to decide what a deploy must not copy over the board's own output.
 *
 * The bug that produced the file: a deploy put the image's committed
 * `Screens/quicknew.txt` back over the one the board had just generated, and
 * the sysop read a stale screen as fresh output for twenty minutes
 * (2026-09-15). The first proposed cure was a second list in the shell with a
 * test pinning the two together - which is not one source of truth, it is two
 * with a nicer failure mode.
 *
 * So what these tests defend is not the CONTENT of the list. It is that this
 * module still derives from the shared file rather than carrying its own copy
 * again: re-inline a literal and the assertions below fail the moment the JSON
 * and the literal disagree, which is the day someone edits one of them.
 */
import * as fs from 'fs';
import * as path from 'path';

import { BOARD_WRITTEN_NAME, BOARD_WRITTEN_PATTERNS, isBoardWritten } from '../../src/screens/screen-tables';

const SHARED = path.join(__dirname, '..', '..', 'src', 'screens', 'board-written-screens.json');

/** The file as the SHELL sees it: parsed here, not imported through the module under test. */
function patternsFromFile(): string[] {
  const parsed = JSON.parse(fs.readFileSync(SHARED, 'utf8')) as Record<string, unknown>;
  return Object.keys(parsed).filter((key) => key !== '_comment');
}

describe('the board-written list has one copy', () => {
  it('builds the table from the shared file, not from a literal beside it', () => {
    const fromFile = patternsFromFile();

    expect(fromFile.length).toBeGreaterThan(0);
    expect(BOARD_WRITTEN_PATTERNS).toEqual(fromFile);
    // Every pattern in the file reaches the regex the rest of the board tests
    // against. A re-inlined literal passes the line above only while the two
    // agree; this one fails as soon as the file gains an entry it lacks.
    for (const pattern of fromFile) {
      expect(BOARD_WRITTEN_NAME.source).toContain(pattern);
    }
  });

  it('keeps the prose out of the patterns', () => {
    // `_comment` is an array of sentences for whoever opens the JSON. Left in,
    // it becomes a regex alternative that matches the literal file name
    // "_comment" - harmless, and the kind of thing that survives for a year.
    expect(BOARD_WRITTEN_PATTERNS).not.toContain('_comment');
    expect(isBoardWritten('_comment')).toBe(false);
  });

  it('gives every entry a reason, beside the pattern it justifies', () => {
    const parsed = JSON.parse(fs.readFileSync(SHARED, 'utf8')) as Record<string, unknown>;
    for (const pattern of patternsFromFile()) {
      // The value is why the board writes that file. An entry with no reason
      // is the "this file is stale" mistake the file's own header warns about,
      // and it hides a real screen from the artists' gallery.
      expect(typeof parsed[pattern]).toBe('string');
      expect((parsed[pattern] as string).trim()).not.toBe('');
    }
  });

  it('every entry compiles, anchored whole and case-insensitively', () => {
    for (const pattern of patternsFromFile()) {
      expect(() => new RegExp(`^(${pattern})$`, 'i')).not.toThrow();
    }
    expect(BOARD_WRITTEN_NAME.flags).toContain('i');
    expect(BOARD_WRITTEN_NAME.source.startsWith('^(')).toBe(true);
    expect(BOARD_WRITTEN_NAME.source.endsWith(')$')).toBe(true);
  });

  it('classifies the board’s own output and leaves art alone', () => {
    // The behaviour every other reader depends on, unchanged by the move to a
    // shared file - `bull9.txt` is written by the REQUESTS door, `bull10.txt`
    // is the identical kind of file with nobody writing it.
    expect(isBoardWritten('bull9.txt')).toBe(true);
    expect(isBoardWritten('BULL9.TXT')).toBe(true);
    expect(isBoardWritten('quicknew.txt')).toBe(true);
    expect(isBoardWritten('CallersLog.txt')).toBe(true);
    expect(isBoardWritten('anything.log')).toBe(true);
    expect(isBoardWritten('bull10.txt')).toBe(false);
    expect(isBoardWritten('Logon.txt')).toBe(false);
  });

  it('stays free of filesystem imports, because a browser bundles it', () => {
    // Not a style rule. web/config-app/vite.config.ts aliases @bbs/screens at
    // this directory and ArtistStudioPage pulls isBoardWritten in through
    // theme-checklist, so this module is bundled for the browser. A
    // readFileSync here breaks the admin build - which is why the shared list
    // is JSON and imported rather than a text file and read.
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'screens', 'screen-tables.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/from\s+['"](node:)?fs['"]/);
    expect(source).not.toMatch(/require\(\s*['"](node:)?fs['"]\s*\)/);
    expect(source).not.toMatch(/from\s+['"](node:)?path['"]/);
  });
});
