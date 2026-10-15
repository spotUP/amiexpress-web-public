/**
 * The board's own .info files use a tooltype array the parser could not read,
 * and the writer therefore refused to save.
 *
 * Conf1.info carries a correct count word (32 -> seven entries) and a 4-byte
 * length prefix on the FIRST entry only; DLPATH.1 onwards are bare
 * NUL-terminated strings. locateTooltypeArray required a prefix on every
 * entry, so the parse fell through to the heuristic ASCII scrape, which marks
 * the file `_fallback`, and writeInfoFile threw:
 *
 *   Cannot write /app/data/bbs/Conf1.info: tooltype array structure not
 *   recognised.
 *
 * That reached the sysop on the first attempt to edit a conference. Fifty-one
 * files on this board are written that way, Node<N>.info among them.
 *
 * The offset never needed guessing: DiskObject is 78 bytes, DrawerData 56
 * more, then the images, then the default tool - and for Conf1.info that
 * arrives at byte 378, where the count word is.
 *
 * Commands/Conf7Cmd/u.info is the control, not a second bug: a perfectly
 * standard array, which the scanner already read correctly and which must go
 * on parsing identically now that the structural walk runs first. It passes
 * before and after the fix, by design.
 *
 * Both fixtures are the real bytes off the live board, base64'd, because a
 * hand-built buffer would be this parser checking its own assumptions.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { parseInfoBuffer, parseInfoFile, writeInfoFile, updateTooltype } from '../../src/utils/info-file.util';

/** /app/data/bbs/Conf1.info, 550 bytes: mixed array, prefix on entry 0 only. */
const CONF1_INFO_B64 =
  '4xAAAQAAAAAAnQBYADsADwAEAAEAAautyv4AAAAAAAAAAAAKAMgAAAAAAACAAAABAgAAAAAAq63K/gAAAHsAAADtq63K/gAA' +
  'AAAAAAAAADIAMgGmAKH//wAAAAACABJ/AAAAAAAAAAAAAAAAAAAAAAAAAAAAXAA//////wABAAAAAAAAAAAAAAAAADsADgAC' +
  'q63K/gMAAAAAAAAAAAAAAAAgAAAAAiAAACAAAAAFQAAAIAAAAAiAAAAgAAAAEUAAACAAAAAiIAAAIH/////////AAAAP//4A' +
  'ACAAAAgAAAAAIAAAAAAAAAAgAAAAAAAAACAAAAAAAAAAIAAAAAAAAAAg/////////+D/////////wIAAAARAAAAAgAAACoAA' +
  'AACAAAARAAAAAIAAACKAAAAAgAAAREAAAAAAAAAAAAAAAP//9//////AgAAH//8AAACAAAAAAAAAAIAAAAAAAAAAgAAAAAAA' +
  'AACAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAhORElSUz0yAERMUEFUSC4xPUJCUzpDb25mMS9VcGxvYWQvAFVMUEFUSC4xPUJC' +
  'UzpDb25mMS9VcGxvYWQvAERMUEFUSC4yPUJCUzpDb25mMS9VcGxvYWQvAFVMUEFUSC4yPUJCUzpDb25mMS9VcGxvYWQvAEZP' +
  'UkNFX05FV1NDQU4ARVhDTFVERV9GVFAARk9STQBJQ09ORkFDRQAABv//AAAA/w==';

/** Commands/Conf7Cmd/u.info, 1158-byte offset: standard array, false positive at 102. */
const U_INFO_B64 =
  '4xAAAQAAAAAATAAPAEIAGwAGAAEAAautyv6rrcr+AAAAAAAAAAAAAAAAAAAAAAABAwAAAAAAq63K/oAAAACAAAAAAAAAAAAA' +
  'AAAAABAAAAAAAABCABoAAqutyv4DAAAAAAAAAAAAAAAACAAAAEVVVVBVVVgAAABFVVVQVVVYAAAAAVBBQBVVWAAAABFFREcB' +
  'BBgAAAARAAQIgAAIAAAAOAAACAAAAAAAADg4kQ4eIiAAAAAoRJKDoFMgAAAAfESSgKBSoAAAAERUl8iy+mAAAACCOHRHHIog' +
  'AAAAABAAAAAAAAAAABABABBAAAgAAABVQQEQQVVYAAAAVUVVVVVVWAAAAFVRVVVFVVgAAABVVVVVVVVYAAAAVVFVVUVVWAAA' +
  'AFVVVVVVVVgAAABVUVVVRVVYAAAA////////+AAAAA5JJJJJJwAAAAAOSSSSSScAAAAADkkkkkknAAAAAAAAAAAAAAAAAAH/' +
  '///////wAAAB////////4AAAAf////+//+AAAAH/////7//gAAAB7///+P//4AAAAe////d///AAAAHH///3///4AAABx8du' +
  '8eHd3AAAAde7bXxfrNwAAAODu21/X61cAAADu6toN00FnAAAB33Hi7jjddwAAAP/7//////4AAAB//7/77//8AAAAar+/u+/' +
  '7uAAAAH//qqqv+7gAAAB/v6qqr/+4AAAAer+qqq/vuAAAAH//qqqv77gAAAB//6qqr+/oAAAAf/+qqq/v+AAAAEAAAAAAAAA' +
  'AAAAAbbbbbbYAAAAAAG222222AAAAAABttttttgAAAAAAAAAAAAAAAAAAAAAAABCABoAAqutyv4DAAAAAAAAAAAAAAAACAAA' +
  'AH/3//////gAAAB/4ff//+/4AAAQf8Dr/V/H+AAAEDuI47d4AJAAABARiMECMBAAAAAQABwAAAAAAAAAHkQcHEiHkk4AABEk' +
  'FCJJRJJIAAARKD4iSUSSRAAAExAiKkvlEkIAAB4QQRw6JJHOAAAAEAAIAAAAAAAAACMcQYAABAAAAAAHuOPFy24wAAAAD//3' +
  '////+AAAAF/5///P//gAAAB////////4AAAAf/n//8//+AAAAH////////gAAAB/+f//z//4AAAA////////+AAAAAckkkkk' +
  'k4AAAAAHJJJJJJOAAAAABySSSSSTgAAAAAckkkkkk4AAABH////////wAAA5////////4AAAff////wf/+AAAO////fyp//g' +
  'AADv//f//J//7gAA7//3////7/8AAO//4///////gADhu+Pjt3htscAA7tvr3ba7bbeAAO7Xwd22u227gADs793VtBrtvcAA' +
  '4e++48XbbjHAAH/v//f/////gAA/3P++f////wAAH/j/HDo/9e4AAAH//AgAH+bgAAAB/n4AAD/24AAAAeB8AAAfNuAAAAHf' +
  '/gAAPzbgAAAB3/wAAB+3AAAAAd/+AAA/t+AAAAEAAAAAAAAAAAAAANtttttsAAAAAADbbbbbbAAAAAAA222222wAAAAAANtt' +
  'tttsAAAAAAAAIAAAAApBQ0NFU1M9MTAAAAAAL0xPQ0FUSU9OPWJiczp1dGlscy9zbWFydHNob3cvc21hcnRzaG93MTByMS4w' +
  'eDAAAAAACyhSRVNJREVOVCkAAAAADk1VTFRJTk9ERT1ZRVMAAAAACVRZUEU9WElNAAAAAA0oU1RBQ0s9NDA5NikAAAAAEChN' +
  'SU1JQ1ZFUj0yLjM5KQBGT1JNAAAAEklDT05GQUNFAAAABv//AAAA/w==';

const conf1 = Buffer.from(CONF1_INFO_B64, 'base64');
const uInfo = Buffer.from(U_INFO_B64, 'base64');

describe('an .info whose tooltype entries are not all length-prefixed', () => {
  it('reads every tooltype, not just the one with a prefix', () => {
    const info = parseInfoBuffer(conf1, 'Conf1.info');

    expect(info.isBinary).toBe(true);
    expect(info.tooltypes.map((t) => (t.value ? `${t.key}=${t.value}` : t.key))).toEqual([
      'NDIRS=2',
      'DLPATH.1=BBS:Conf1/Upload/',
      'ULPATH.1=BBS:Conf1/Upload/',
      'DLPATH.2=BBS:Conf1/Upload/',
      'ULPATH.2=BBS:Conf1/Upload/',
      'FORCE_NEWSCAN',
      'EXCLUDE_FTP',
    ]);
  });

  it('can be written back instead of throwing InfoFileWriteError', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'info-mixed-'));
    const file = path.join(dir, 'Conf1.info');
    fs.writeFileSync(file, conf1);

    const info = parseInfoFile(file);
    updateTooltype(info, 'NDIRS', '4', false);

    expect(() => writeInfoFile(info)).not.toThrow();

    const reread = parseInfoFile(file);
    expect(reread.tooltypes.find((t) => t.key === 'NDIRS')?.value).toBe('4');
    // The other six survive the rewrite.
    expect(reread.tooltypes).toHaveLength(7);
    expect(reread.tooltypes.find((t) => t.key === 'DLPATH.2')?.value).toBe('BBS:Conf1/Upload/');
  });

  it('heals the file: every entry comes back length-prefixed', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'info-heal-'));
    const file = path.join(dir, 'Conf1.info');
    fs.writeFileSync(file, conf1);

    const info = parseInfoFile(file);
    updateTooltype(info, 'NDIRS', '3', false);
    writeInfoFile(info);

    // Walk the written array the strict way - a prefix on every entry.
    const out = fs.readFileSync(file);
    const countOffset = 378;
    const count = out.readUInt32BE(countOffset);
    expect(count).toBe((7 + 1) * 4);

    let pos = countOffset + 4;
    const strings: string[] = [];
    for (let i = 0; i < 7; i++) {
      const len = out.readUInt32BE(pos);
      expect(len).toBeGreaterThanOrEqual(2);
      expect(out[pos + 4 + len - 1]).toBe(0);
      strings.push(out.toString('latin1', pos + 4, pos + 4 + len - 1));
      pos += 4 + len;
    }
    expect(strings[0]).toBe('NDIRS=3');
    expect(strings[6]).toBe('EXCLUDE_FTP');
  });

  it('keeps the bytes that follow the array', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'info-trailing-'));
    const file = path.join(dir, 'Conf1.info');
    fs.writeFileSync(file, conf1);

    // FORM\0ICONFACE\0 and the bytes after it are the icon's trailing chunk.
    const trailing = conf1.subarray(528);
    expect(trailing.toString('latin1', 0, 4)).toBe('FORM');

    const info = parseInfoFile(file);
    updateTooltype(info, 'NDIRS', '9', false);
    writeInfoFile(info);

    const out = fs.readFileSync(file);
    expect(out.subarray(out.length - trailing.length)).toEqual(trailing);
  });
});

describe('an .info whose array was already standard', () => {
  it('parses exactly as it did before, through the structural walk', () => {
    const info = parseInfoBuffer(uInfo, 'u.info');

    const keys = info.tooltypes.map((t) => t.key);
    expect(keys).toContain('ACCESS');
    expect(keys).toContain('LOCATION');
    expect(info.tooltypes.find((t) => t.key === 'ACCESS')?.value).toBe('10');
    for (const tt of info.tooltypes) {
      expect(tt.key.replace(/\0/g, '')).not.toBe('');
    }
  });
});
