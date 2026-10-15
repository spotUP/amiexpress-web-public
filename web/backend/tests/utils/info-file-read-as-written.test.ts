/**
 * Three ways a .info file was read as something it is not.
 *
 * All three come of trusting printable runs where the format is knowable, and
 * every fixture is the real bytes off the live board.
 *
 * 1. A tooltype APPENDED past the end of the array. `Doors/What/WHAT.info`
 *    carries `OVERCLOCK=100` written after the array without growing its
 *    count. The door side has honoured it for as long as it has been there;
 *    the admin read it as icon data, so it could not be seen or edited while
 *    remaining in force. Read into the array here, so the next save writes it
 *    where icon.library would look.
 *
 * 2. An array at an ODD offset. `FCheck/LHA.info` keeps its array at byte 439.
 *    The finder stepped two bytes at a time and never tested it, so the file
 *    fell back to the printable-run scan - which glued the entry's length byte
 *    0x53 ('S') to its key and reported `SOPTIONS` for a tooltype the file
 *    spells `OPTIONS`. Nothing on the board has ever had an SOPTIONS.
 *
 * 3. Tooltypes INVENTED from a bitmap. A drawer icon has no array, so the
 *    admin scraped one out of the image and produced "W`", "D@" and "K@B" as
 *    tooltype keys. Across this repo that heuristic produced 5,714 keys that
 *    are not keys; requiring a word-shaped key where the parse is guessing
 *    leaves 43, and loses none of the real ones.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { parseInfoFile, writeInfoFile, readTooltypeMap, updateTooltype } from '../../src/utils/info-file.util';
import { extractTooltypesFromInfoFile } from '../../src/utils/amiga-command-parser.util';

/** Doors/What/WHAT.info - OVERCLOCK=100 appended past the array. */
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

/** FCheck/LHA.info - a standard array that begins at odd offset 439. */
const LHA_INFO_B64 =
  '4xAAAQAAAAAAjQBgADQAFgAEAAEAAautyv4AAAAAAAAAAACNAFUAAAAAAACAAAABBACrrcr+q63K/gAAADoAAACwAAAAAAAA' +
  'AAAAABAAAAAAAAA0ABUAAqutyv4DAAAAAAAAAAAAAAAQAAAAAAADgBAAD//////AEAAIAAAAD2AQAAn8AAA+cBAACAAAAHxI' +
  'EAB5/AAA+EfgAAgAAAHwfhAACAAAA+ABEAAIBd+33wEQAAgB4A+AARAACf37v38BEAAIAfx+AAEQAHn//v//AeAACAB/+AAB' +
  'EAAIAD/w/wEQAAgAD+AAARAAD///////EAAAAAOAAAAQAAAAAQAAABAA////////8AD////////gAIAAAAAAAAAAgAAAAAMA' +
  'AACH////9oAAAIYD///NgAAAh////7uwAAAGA///d7gAAPf///7vgeAAh////d/+AACH+iBLoP4AAIf+3/d//gAAhgLkToD+' +
  'AACH/vu9//4AAAYAfXgA/gAA9/++9//+4ACH/8/vAP4AAIf/99///gAAgAADgAAAAACAAAEAAAAAAIAAAAAAAAAAAAAAAAAA' +
  'AAAAAAABAAAAABgAAAAmQ0hFQ0tFUj1ET09SUzptdWx0aS1jaGVjay9tVUxUSS1jSEVDSwAAAAALU1RBQ0s9U0FNRQAAAAAL' +
  'UFJJT1JJVFk9MQAAAAAdRVJST1IuMT1BcmNoaXZlIENvcnJ1cHRlZCEhIQAAAABTT1BUSU9OUz1BRFZFUlQ9RE9PUlM6bXVs' +
  'dGktY2hlY2svc2FuY3R1YXJ5LnR4dCBCQlMtUEFUSD1CQlM6IFBBQ0tFUj1DOkxIQSBUWVBFPUxIQQBGT1JNAAAAEklDT05G' +
  'QUNFAAAABv//AAAA/w==';

/** AmiXnet/Confs/AX0001/Hold.info - a drawer icon with no tooltypes at all. */
const HOLD_INFO_B64 =
  '4xAAAQAAAAABJQAUADsADwAEAAEAAQBD5gAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAmoAAAAAAAAAAAAAASEAAAAJAFzggAAA' +
  'AAAAAAAAADYAdQCWAE///wAAAAACABJ/AEtAYgAAAAAAPODkAAAAAAAAAAAAXAA//////wABAAAAAAAAAAAAAAAAADsADgAC' +
  'AAJXYAMAAAAAAAAAAAAAAAAgAAAAAiAAACAAAAAFQAAAIAAAAAiAAAAgAAAAEUAAACAAAAAiIAAAIH/////////AAAAP//4A' +
  'ACAAAAgAAAAAIAAAAAAAAAAgAAAAAAAAACAAAAAAAAAAIAAAAAAAAAAg/////////+D/////////wIAAAARAAAAAgAAACoAA' +
  'AACAAAARAAAAAIAAACKAAAAAgAAAREAAAAAAAAAAAAAAAP//9//////AgAAH//8AAACAAAAAAAAAAIAAAAAAAAAAgAAAAAAA' +
  'AACAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

describe('reading a .info file as what it is', () => {
  let testDir: string;

  const write = (name: string, b64: string): string => {
    const filePath = path.join(testDir, name);
    fs.writeFileSync(filePath, Buffer.from(b64, 'base64'));
    return filePath;
  };

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'info-read-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('a tooltype appended past the end of the array', () => {
    it('is visible to the admin, not buried in the icon data', () => {
      const filePath = write('WHAT.info', WHAT_INFO_B64);

      expect(readTooltypeMap(filePath).get('OVERCLOCK')).toBe('100');
      expect(parseInfoFile(filePath).iconData.length).toBe(0);
    });

    it('is still read by the door side', () => {
      const filePath = write('WHAT.info', WHAT_INFO_B64);

      expect(extractTooltypesFromInfoFile(filePath).get('OVERCLOCK')).toBe('100');
    });

    it('is written into the array by the next save, and survives it', () => {
      const filePath = write('WHAT.info', WHAT_INFO_B64);

      writeInfoFile(updateTooltype(parseInfoFile(filePath), 'ACCESS', '25', false));

      // Both readers, because the point is that the two agree afterwards.
      expect(readTooltypeMap(filePath).get('OVERCLOCK')).toBe('100');
      expect(readTooltypeMap(filePath).get('ACCESS')).toBe('25');
      const doorSide = extractTooltypesFromInfoFile(filePath);
      expect(doorSide.get('OVERCLOCK')).toBe('100');
      expect(doorSide.get('LOCATION')).toBe('DOORS:What/What.x');

      // In the array, not trailing after it: one occurrence, length-prefixed.
      const bytes = fs.readFileSync(filePath);
      const at = bytes.indexOf(Buffer.from('OVERCLOCK=100'));
      expect(at).toBeGreaterThan(0);
      expect(bytes.indexOf(Buffer.from('OVERCLOCK=100'), at + 1)).toBe(-1);
      expect(bytes.readUInt32BE(at - 4)).toBe('OVERCLOCK=100'.length + 1);
    });
  });

  describe('an array that begins at an odd offset', () => {
    it('is found, so the key is OPTIONS and not SOPTIONS', () => {
      const filePath = write('LHA.info', LHA_INFO_B64);

      const tooltypes = extractTooltypesFromInfoFile(filePath);

      expect(tooltypes.has('SOPTIONS')).toBe(false);
      expect(tooltypes.get('OPTIONS')).toContain('PACKER=C:LHA');
      expect(tooltypes.get('CHECKER')).toBe('DOORS:multi-check/mULTI-cHECK');
      expect(tooltypes.get('ERROR.1')).toBe('Archive Corrupted!!!');
    });

    it('leaves the ICONFACE image after it alone', () => {
      const filePath = write('LHA.info', LHA_INFO_B64);

      const info = parseInfoFile(filePath);

      expect(info.iconData.subarray(0, 4).toString('latin1')).toBe('FORM');
      expect(info.tooltypes.map(t => t.key)).not.toContain('ICONFACE');
    });
  });

  describe('a drawer icon with no tooltype array', () => {
    it('yields no tooltypes rather than keys read out of the bitmap', () => {
      const filePath = write('Hold.info', HOLD_INFO_B64);

      const keys = parseInfoFile(filePath).tooltypes.map(t => t.key);

      expect(keys).toEqual([]);
    });
  });
});
