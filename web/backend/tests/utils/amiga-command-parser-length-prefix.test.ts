/**
 * A tooltype whose length byte prints as '!' must not be read as a comment.
 *
 * The ToolTypes array is length-prefixed: every entry is a ULONG byte count
 * followed by that many bytes. The parser used to ignore those prefixes and
 * scrape printable runs instead, so the low byte of the count arrived glued to
 * the front of the entry - and for a 32-character tooltype that byte is 0x21,
 * which prints as '!'. The scraper dropped anything starting with '!' as a
 * commented-out entry, a convention Workbench does not have (it uses
 * parentheses).
 *
 * The cost was not cosmetic. LOCATION is the one required field, so its loss
 * made loadCommandFromInfo return null and the command vanished from the
 * registry: BADD, BS, M, MOSEARCH, mobnup, HoldScan, Calls, SP, edit, open and
 * others answered with an error on the live board instead of running.
 *
 * Every fixture is the real bytes off that board, base64'd - a hand-built
 * buffer would only be this parser checking its own assumptions.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  extractTooltypesFromInfoFile,
  loadCommandFromInfo,
} from '../../src/utils/amiga-command-parser.util';

/** Commands/BBSCmd/BS.info: LOCATION is entry 0 and 32 characters long. */
const BS_INFO_B64 =
  '4xAAAQAAAAAANQAZAD8AIgAEAAEAAQgaEjgAAAAAAAAAAAAAAAAAAAAAAAAAAAABAgAAAAAACBzSEAAAADEAAAAOCB/86AAA' +
  'AAAAAAAAAAAACQKAAMb//wAAAAACABJ/B9LUxgAAAAAHw2LMAAAAAAAAAAAAYgBG/////wABAAAAAAAAAAAAAAAAAD8AIQAC' +
  'AAf7KAMAAAAAAAAAAAB+AAAAAAAAAD/4AAAAAAAAf/8AAAAAAAAB/+AAAAAAAAAH+AAAAAAAAAD+AAAAAAAAAB8AAAAAAAAA' +
  'B4AAAAAAAAAB4AAAAP/g/gDwAAAB//H+AHAAAAP/+/wAOAAAB/v/+AAcAAAP8f/wABwAAB/g/+AADgAAP8B/wAAOAAB/gH/A' +
  'AA4AAP8A/+AADgAB/gH/8AAOAAP8A//4ABwAB/gH+/wAHAAP8A/x/gA4AA/gD+D+AHgAD+AP4P4A8AAAAAAAAAHgAAAAAAAA' +
  'B4AAAAAAAAAfAAAAAAAAAP4AAAAAAAAH+AAAAAAAAf/gAAAAAAD//wAAAAAAAH/4AAAAAAAA/gAAAAAAAP+AAAAAAAA//8AA' +
  'AAAAAf//gAAAAAAP/wAAAAAAAD/AAAAAAAAA/gAAAAAAAAHwAAAAAAAAA8AAAAAAAAAPAAH/4f4AAB4AAf/B/AAAPAAD/+P8' +
  'AAA4AAf/9/gAAHAAD/f/8AAAcAAf4//gAADgAD/B/8AAAOAAf4D/gAAA4AD/AP+AAADgAf4B/8AAAOAD/AP/4AAAcAf4B//w' +
  'AABwD/AP9/gAADgf4B/j/AAAHB/AH8H8AAAeEAAQAQAAAA8AAAAAAAAAA8AAAAAAAAAB8AAAAAAAAAD+AAAAAAAAAD/AAAAA' +
  'AAAAD/8AAAAAAAAB//8AAAAAAAA//4AAAAAAAAD/AAAAAAAAABgAAAAhTE9DQVRJT049RE9PUlM6QnV5JlNlbGwvQnV5JlNl' +
  'bGwAAAAADk1VTFRJTk9ERT1ZRVMAAAAACkFDQ0VTUz0zMAAAAAAJVFlQRT1YSU0AAAAADFNUQUNLPTEwMDAwAAAAAAAAAA==';

/** Commands/BBSCmd/B.info: the control - LOCATION is entry 1, prefix 0x1f. */
const B_INFO_B64 =
  '4xAAAQAAAAAAEgARADYAGwAGAAEAAQfFCbAHxnHgAAAAAAAAAAAAAAAAAAAAAAABBAAH4hLsB8NTtAAAAlIAAAAGAAAAAAAA' +
  'AAAAABAAAAAAAAA2ABoAAgADFGgDAAAAAAAAAAAAAAAEACqqqqqqqqwAKqqqqqqqrAAqqCCqqqqsACqqqqqqggwAKqqqqqqq' +
  'rAAqooqqqqqsACqqqqqqqqwAKqKKoKqqrAAqqqqqqqqsACqqqqqqqqwAKqqAACqCDAAqqoAAKqqsACqqqqqqqqwAKqiqqqKq' +
  'rAAqqqqqqqqsACqoqqqiqqwAKqqqqqqqrAAqqKqqoqqsACqqqqqqqqwAKqiqqqKqrAB////////8AAckkkkkk4AABySSSSST' +
  'gAAHJJJJJJOAAAAAAAAAAAAA////////+AD////////wAP////9f//AA/////Vf/8AD/////X//wAP//////VVAA//////9V' +
  'UAD/99/V/1VQAP///19/VVAA////1f9VUAD3/////1VQANf///////AA//9//9//8AD/f1VVX/9wANV/VVVf93AA//9VVV/3' +
  'cAD/f1VVX/9wAPV/VVVf33AA//9VVV/fcAD//1VVX9/QAP//VVVf3/AAgAAAAAAAAAAA222222wAAADbbbbbbAAAANttttts' +
  'AAAAAAAAAAAAAAAAAAAANgAaAAIAAxYIAwAAAAAAAAAAAAAABAA////////8AD/++/////wAP/11/q///AA//vv//5JMAD//' +
  '//////wAP/ff/////AA/66/////8AD/336X///wAP////////AA////////8AD//1VV/kkwAP//VVX///AA////////8AD/8' +
  '///n//wAP////////AA//P//5//8AD////////wAP/z//+f//AA////////8AD/8///n//wAf////////AADkkkkkknAAAOS' +
  'SSSSScAAA5JJJJJJwAADkkkkkknAAP////////gA////////8AD////+D//wAP/++/lT//AA/////g//8AD//////gAAAP//' +
  '///+AAAA//ffgf4AAAD///5afgAAAP///4H+AAAA8/////4AAADD///////wAP/+KqqP//AA/n4AAA/+cADAfwAAH/JwAP/+' +
  'AAAP83AA/z8AAB/7cADwPgAAD5twAO//AAAfm3AA7/4AAA/bgADv/wAAH9vwAIAAAAAAAAAAAG222222AAAAbbbbbbYAAABt' +
  'tttttgAAAG222222AAAAAAABAAAAABwAAAAJQUNDRVNTPTEAAAAAH0xPQ0FUSU9OPURPT1JTOkVtUF9Ub29scy9CdWxscwAA' +
  'AAANTVVMVElOT0RFPU5PAAAAAAtQUklPUklUWT0wAAAAAAxTVEFDSz01MDAwMAAAAAAJVFlQRT1YSU0A';

/**
 * Doors/What/WHAT.info: OVERCLOCK=100 was appended after the array without
 * growing its count, so only a reader that looks past the array's end sees it.
 * A real Amiga would not, but this BBS has honoured it for as long as it has
 * been there.
 */
const WHAT_INFO_B64 =
  '4xAAAQAAAAABNQCPAEIADwAGAAEAAQg644AIOuOYAAAAAAAAAAAAAAAAAAAAAAABA8QAAAAACDgfkAAAATEAAACEAAAAAAAA' +
  'AAAAABAAAAAAAABCAA4AAgAF+qgDAAAAAAAAAAAAAAAAAAAAP/////////8AACAAAAAAAAABwAAgAAAAAAAAAcAAIAAAAAAA' +
  'AAHAACAAAAAAAAABwAAgAAAAAAAAAcAAIAAAAAAAAAHAACAAAAAAAAABwAAgAAAAAAAAAcAAIAAAAAAAAAHAACAAAAAAAAAB' +
  'wAA//////////8AAH//////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPh8f///vxwAAAH8/v///3O4AAA' +
  'B//7wA8Dh8AAAAeeef8PBwOAAAAHnnh/zw4HwAAAB554A+8cDuAAAAeee//vOBxwAAADDDH/xnA4OAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAABCAA4AAgAF+8ADAAAAAAAAAAAAAAAAAAAAP/////////8AACAAAAAAAAABwAAgAAAA' +
  'AAAAAcAAIAAAAAAAAAHAACAAAAAAAAABwAAgAAAAAAAAAcAAIAAAAAAAAAHAACAAAAAAAAABwAAgAAAAAAAAAcAAIAAAAAAA' +
  'AAHAACAAAAAAAAABwAA//////////8AAH//////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPh8f///vxw' +
  'AAAH8/v///3O4AAAB//7wA8Dh8AAAAeeef8PBwOAAAAHnnh/zw4HwAAAB554A+8cDuAAAAeee//vOBxwAAADDDH/xnA4OAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHAAAABtMT0NBVElPTj1ET09SUzpXaGF0L1doYXQueAAAAAAOTVVM' +
  'VElOT0RFPVlFUwAAAAAKQUNDRVNTPTIwAAAAAAlUWVBFPVhJTQAAAAAMU1RBQ0s9NTAwMDAAAAAADlBSSU9SSVRZPVNBTUUA' +
  'T1ZFUkNMT0NLPTEwMAA=';

describe('.info tooltype array length prefixes', () => {
  let testDir: string;

  const write = (name: string, b64: string): string => {
    const filePath = path.join(testDir, name);
    fs.writeFileSync(filePath, Buffer.from(b64, 'base64'));
    return filePath;
  };

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'info-length-prefix-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('reads a LOCATION whose length byte prints as an exclamation mark', () => {
    const tooltypes = extractTooltypesFromInfoFile(write('BS.info', BS_INFO_B64));

    expect(tooltypes.get('LOCATION')).toBe('DOORS:Buy&Sell/Buy&Sell');
    expect(tooltypes.get('ACCESS')).toBe('30');
    expect(tooltypes.get('TYPE')).toBe('XIM');
    expect(tooltypes.get('MULTINODE')).toBe('YES');
    expect(tooltypes.get('STACK')).toBe('10000');
  });

  it('registers the command that LOCATION belongs to', () => {
    const cmd = loadCommandFromInfo(write('BS.info', BS_INFO_B64));

    expect(cmd).not.toBeNull();
    expect(cmd!.name).toBe('BS');
    expect(cmd!.location).toBe('Doors/Buy&Sell/Buy&Sell');
  });

  it('reads an icon whose first entry carries an unprintable length byte the same way', () => {
    const tooltypes = extractTooltypesFromInfoFile(write('B.info', B_INFO_B64));

    expect(tooltypes.get('ACCESS')).toBe('1');
    expect(tooltypes.get('LOCATION')).toBe('DOORS:EmP_Tools/Bulls');
    expect(tooltypes.get('PRIORITY')).toBe('0');
  });

  it('keeps a tooltype appended past the end of the array', () => {
    const tooltypes = extractTooltypesFromInfoFile(write('WHAT.info', WHAT_INFO_B64));

    expect(tooltypes.get('LOCATION')).toBe('DOORS:What/What.x');
    expect(tooltypes.get('PRIORITY')).toBe('SAME');
    expect(tooltypes.get('OVERCLOCK')).toBe('100');
  });

  it('still treats a parenthesised tooltype as commented out', () => {
    const filePath = path.join(testDir, 'COMMENTED.info');
    fs.writeFileSync(filePath, Buffer.from(
      'LOCATION=Doors/Thing/Thing\n(ACCESS=200)\nTYPE=XIM\n', 'latin1'
    ));

    const tooltypes = extractTooltypesFromInfoFile(filePath);

    expect(tooltypes.get('LOCATION')).toBe('Doors/Thing/Thing');
    expect(tooltypes.has('ACCESS')).toBe(false);
  });
});
