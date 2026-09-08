/**
 * A QWK packet a QWK reader can open.
 *
 * A .QWK file is a ZIP archive, and CONTROL.DAT inside it is the file every
 * reader opens first - it names the board, the user and the conferences, and
 * a packet without it is refused outright.
 *
 * This board wrote MESSAGES.DAT's bytes straight into a file called `.QWK`:
 * not an archive, no CONTROL.DAT anywhere. `createControlDat` had been written
 * to qwk.e's layout and was called by nothing (audit H-QWK2). Meanwhile the
 * ZOOM command announced "Pack Method 1) LHA, 2) ZIP" and produced neither.
 * Every packet the board has generated was unreadable.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { QWKManager } from '../../src/services/qwk.service';

function manager(dir: string): any {
  return new (QWKManager as any)(dir, 'UPROUGH');
}

describe('CONTROL.DAT', () => {
  it('is built to qwk.e\'s line order', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qwk-'));
    const control = manager(dir).createControlDat(
      'Up Rough', 'Sweden', '555', 'spot', 'CALLER',
      [{ id: 1, name: 'General' }, { id: 2, name: 'Amiga' }],
      3,
    );

    const lines = control.toString('ascii').split('\r\n');
    expect(lines[0]).toBe('Up Rough');
    expect(lines[1]).toBe('Sweden');
    expect(lines[2]).toBe('555');
    expect(lines[3]).toContain('spot');
    expect(lines[6]).toBe('CALLER');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('names every conference the packet carries', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qwk-'));
    const control = manager(dir).createControlDat(
      'Up Rough', '', '', 'spot', 'CALLER',
      [{ id: 1, name: 'General' }, { id: 2, name: 'Amiga' }], 0,
    );

    const text = control.toString('ascii');
    expect(text).toContain('General');
    expect(text).toContain('Amiga');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('the packet on disk', () => {
  let dir: string;

  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qwk-pkt-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  function writePacket(): string {
    const mgr = manager(dir);
    const file = path.join(dir, 'TEST.QWK');
    const messages = [{
      messageNumber: 1, conference: 1, from: 'spot', to: 'ALL',
      subject: 'hello', date: new Date(), body: 'a message', isPrivate: false,
      isReply: false,
    }];
    const control = mgr.createControlDat('Up Rough', '', '', 'spot', 'CALLER',
      [{ id: 1, name: 'General' }], 1);
    // The private writer is the thing under test; the public path calls it.
    mgr.writeQWKPacket(file, messages, control);
    return file;
  }

  it('is a ZIP, not a bare MESSAGES.DAT under a .QWK name', () => {
    const file = writePacket();

    const head = fs.readFileSync(file).subarray(0, 2).toString('ascii');
    expect(head).toBe('PK');
  });

  it('contains CONTROL.DAT, which is what a reader opens first', () => {
    const AdmZip = require('adm-zip');

    const names = new AdmZip(writePacket()).getEntries().map((e: any) => e.entryName);

    expect(names).toContain('CONTROL.DAT');
  });

  it('contains MESSAGES.DAT alongside it', () => {
    const AdmZip = require('adm-zip');

    const names = new AdmZip(writePacket()).getEntries().map((e: any) => e.entryName);

    expect(names).toContain('MESSAGES.DAT');
  });

  it('puts the board name where the reader reads it', () => {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(writePacket());

    const control = zip.getEntry('CONTROL.DAT').getData().toString('ascii');

    expect(control.split('\r\n')[0]).toBe('Up Rough');
  });
});
