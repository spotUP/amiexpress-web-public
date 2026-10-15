/**
 * An art setting's value becomes a path, and only inside the door's folder.
 *
 * The value arrives from a settings form, so it is exactly the field a
 * traversal would come through. It is checked twice: a regex says what a value
 * may look like, and the resolved absolute path is re-checked to be inside the
 * door's directory. A bug in either one is then not a hole in both.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { resolveArtValue, listArtChoices, artFileLines } from '../../src/doors/door-art-file';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-art-file-'));
  fs.mkdirSync(path.join(dir, 'headers'));
  fs.writeFileSync(path.join(dir, 'Bulletin_Header.txt'), 'a\nb\n', 'latin1');
  fs.writeFileSync(path.join(dir, 'headers', 'Header3.ansi'), 'x\ny\nz\n', 'latin1');
  fs.writeFileSync(path.join(dir, 'REQUESTS.cfg'), 'Host=x\n', 'latin1');
});

describe('resolveArtValue', () => {
  it('takes a bare filename', () => {
    expect(resolveArtValue(dir, 'Bulletin_Header.txt'))
      .toBe(path.join(dir, 'Bulletin_Header.txt'));
  });

  it('takes one subdirectory level, because the alternates live in one', () => {
    expect(resolveArtValue(dir, 'headers/Header3.ansi'))
      .toBe(path.join(dir, 'headers', 'Header3.ansi'));
  });

  it.each([
    ['../../../etc/passwd', 'parent traversal'],
    ['/etc/passwd', 'absolute'],
    ['BBS:Screens/x.txt', 'an Amiga assign'],
    ['headers\\Header3.ansi', 'a backslash'],
    ['a/b/c.txt', 'two levels'],
    ['', 'empty'],
    ['headers/', 'a directory'],
    ['./Bulletin_Header.txt', 'a dot segment'],
  ])('refuses %s (%s)', (value) => {
    expect(() => resolveArtValue(dir, value)).toThrow();
  });

  it('refuses a symlink that leaves the door folder', () => {
    // The two checks above are LEXICAL and a symlink is not. Door folders on
    // this board do contain symlinks - the classic Request door shipped
    // `REQ.info -> Request.info` - so this is a shape that exists here.
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-outside-'));
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'not yours\n', 'latin1');
    fs.symlinkSync(outside, path.join(dir, 'linked'));

    expect(() => resolveArtValue(dir, 'linked/secret.txt')).toThrow(/link out of/);
  });

  it('still takes a real file reached through a real directory', () => {
    // The symlink check must not refuse the ordinary case on a machine whose
    // temp directory is itself behind a symlink, which macOS's is.
    expect(resolveArtValue(dir, 'headers/Header3.ansi'))
      .toBe(path.join(dir, 'headers', 'Header3.ansi'));
  });
});

describe('artFileLines', () => {
  it('does not count the element after a trailing newline', () => {
    expect(artFileLines(path.join(dir, 'Bulletin_Header.txt'))).toBe(2);
  });

  it('counts a last line with no newline after it', () => {
    fs.writeFileSync(path.join(dir, 'x.ans'), 'one\ntwo', 'latin1');
    expect(artFileLines(path.join(dir, 'x.ans'))).toBe(2);
  });

  it('reads CRLF art the way the board writes it', () => {
    fs.writeFileSync(path.join(dir, 'crlf.ans'), 'one\r\ntwo\r\n', 'latin1');
    expect(artFileLines(path.join(dir, 'crlf.ans'))).toBe(2);
  });
});

describe('listArtChoices', () => {
  it('finds the art beside the door and one level down, with line counts', () => {
    const choices = listArtChoices(dir);

    expect(choices).toEqual(
      expect.arrayContaining([
        { file: 'Bulletin_Header.txt', lines: 2 },
        { file: 'headers/Header3.ansi', lines: 3 },
      ]),
    );
  });

  it('is art only - a config file is not a drawing', () => {
    expect(listArtChoices(dir).map((c) => c.file)).not.toContain('REQUESTS.cfg');
  });

  it('answers for a door folder that is not there, rather than throwing', () => {
    expect(listArtChoices(path.join(dir, 'nope'))).toEqual([]);
  });
});
