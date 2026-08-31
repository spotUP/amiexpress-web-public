/**
 * The two helpers the config writers were missing.
 *
 * `resolveDirectory` returns the directory as it is SPELLED ON DISK. express.e
 * writes `Fcheck` and this board's volume holds `FCheck`; on the Amiga's
 * case-insensitive filesystem they are one directory, on the Linux container
 * they are two, and the file-checker service hardcoded the spelling express.e
 * uses. The live board answered ENOENT for the read and a save would have
 * created a second directory the BBS never looks in. macOS cannot fail that
 * way - it is case-insensitive too, which is exactly why the bug survived - so
 * the assertion here is on the RETURNED PATH, which is platform-independent.
 *
 * `moveInfoFile` moves an icon instead of deleting it and writing a new file
 * over the name. That is what turned a 529-byte icon into a 54-byte text stub
 * on rename.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { moveInfoFile, resolveDirectory } from '../../src/utils/info-file.util';

describe('resolveDirectory', () => {
  let root: string;

  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-dir-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('returns the spelling that is on disk, not the one that was asked for', () => {
    fs.mkdirSync(path.join(root, 'FCheck'));

    expect(resolveDirectory(root, 'Fcheck')).toBe(path.join(root, 'FCheck'));
  });

  it('returns the asked-for path when nothing is there yet, so it can be created', () => {
    expect(resolveDirectory(root, 'Fcheck')).toBe(path.join(root, 'Fcheck'));
  });
});

describe('moveInfoFile', () => {
  let root: string;

  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'move-info-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('moves the bytes, so an icon stays an icon', () => {
    const from = path.join(root, 'ARC.info');
    const to = path.join(root, 'ARCHIVE.info');
    const bytes = Buffer.concat([Buffer.from([0xe3, 0x10, 0x00, 0x01]), Buffer.alloc(500, 0x55)]);
    fs.writeFileSync(from, bytes);

    expect(moveInfoFile(from, to)).toBe(true);
    expect(fs.readFileSync(to)).toEqual(bytes);
    expect(fs.existsSync(from)).toBe(false);
  });

  it('finds the source whatever case it is written in', () => {
    fs.writeFileSync(path.join(root, 'ARC.info'), Buffer.from([0xe3, 0x10, 0, 1]));

    expect(moveInfoFile(path.join(root, 'arc.info'), path.join(root, 'NEW.info'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'NEW.info'))).toBe(true);
  });

  it('reports nothing moved when there is no source, leaving the caller to create one', () => {
    expect(moveInfoFile(path.join(root, 'missing.info'), path.join(root, 'NEW.info'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'NEW.info'))).toBe(false);
  });
});
