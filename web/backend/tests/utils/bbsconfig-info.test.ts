/**
 * The board's own bbsConfig.info, and why the admin could not write it.
 *
 * `writeInfoFile` refused it - "tooltype array structure not recognised" -
 * so every System Configuration save landed in `bbsConfig.info.txt` only and
 * the icon went on saying something else. The handoff called it unfixable
 * without an Amiga. It is not: the file is readable, it was being read wrong.
 *
 * Three things are wrong with it, and each one alone lost the whole array:
 *
 * 1. The first entry declares 0x19 bytes and holds 14. A length field leads
 *    with NULs, so the bare-string branch read an empty string there and the
 *    parse returned null.
 * 2. The count says 84 - twenty entries - and the file holds SIXTY-TWO.
 *    Tooltypes were appended without the count being grown, so the other 42
 *    were read as icon data and would have been written back as image bytes.
 * 3. Entries are MIXED: some carry a 4-byte length, most are bare
 *    NUL-terminated strings. A reader that assumes either form loses it.
 *
 * The fixture is the real file off the live board with the sysop's address,
 * board name and port numbers replaced by same-length filler - every length
 * field, the count word and the layout are byte-for-byte what the board has.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { parseInfoFile, writeInfoFile, readTooltypeMap, updateTooltype } from '../../src/utils/info-file.util';
import { extractTooltypesFromInfoFile } from '../../src/utils/amiga-command-parser.util';
import { loadBBSConfig } from '../../src/services/bbs-config-file.service';

const BBSCONFIG_INFO_B64 =
  '4xAAAQAAAAABTwAPADQAFgAEAAEAAautyv4AAAAAAAAAAAFPAAcAAAAAAACAAAABBACrrcr+q63K/gAAAH4AAABdAAAAAAAA' +
  'AAAAABAAAAAAAAA0ABUAAqutyv4DAAAAAAAAAAAAAAAQAAAAAAAAABAAD///AAACEAAO/v4AAAUQAAgAAAAAAhAAAAAAAAAA' +
  'EAB////////gAAAAAAAAABAAAAAAAAAzEAAP//8AAGoQAA/37gAAzBAACAAAAAGaEAAAAAAAAzMQAH///////+AAAAAAAAAA' +
  'EAAAAAAAAAAQAA///wAAABAADv7+AAAAEAAIAAAAAAAQAAAAAAAAABAA////////8AD////////gAIAAAAAAAAAAgAAAAAAA' +
  'AACHt/cAAAIAAIf//wAAAAAAgAAAAAAAAAAAAAAAAAAAAP///////+AAgAAAAAAIgACAAAAAABUAAIb+/wAAIgAAh///AABF' +
  'AACAAAAAAIiAAAAAAAAAAAAA////////4ACAAAAAAAAAAIAAAAAAAAAAh+/vAAAAAACH//8AAAAAAIAAAAAAAAAAAAAAAAAA' +
  'AAAAAAABAAAAAFQAAAAZQ09OVkVSVF9UT19NQgBTTVRQX0hPU1Q9c210cC5nbWFpbC5jb20AU01UUF9IT1NUPXNtdHAuZ21h' +
  'aWwuY29tAFNNVFBfUE9SVD00NjUAU01UUF9VU0VSTkFNRQBTTVRQX1NTTABTWVNPUF9FTUFJTD1zeXNvcHMuZXhhbXBsZUB0' +
  'ZXN0LmNvbQBCQlNfRU1BSUw9c3lzb3BzLmV4YW1wbGVAdGVzdC5jb20ATUFJTF9PTl9ORVdfVVNFUgBNQUlMX09OX1NZU09Q' +
  'X0NPTU1FTlQARVhFQ1VURV9BU1lOQ19PTl9MT0dPTj1iYnM6dXRpbHMvZGFubm91bmNlIFRlc3Rib2FyZCB+TgBFWEVDVVRF' +
  'X0FTWU5DX09OX0xPR09GRj1iYnM6dXRpbHMvZGFubm91bmNlIFRlc3Rib2FyZCB+TiBPRkYATUFJTF9PTl9QV0RfRkFJTABG' +
  'VFBQT1JUPTIxMDAARlRQSE9TVD1FWEFNUExFQkIANkZUUERBVEFQT1JUPTQwMTAxLDQwMTAyLDQwMTAzLDQwMTA0LDQwMTA1' +
  'LDQwMTA2LDQwMTA3AFBBU1NXT1JEX1NFQ1VSSVRZPWxlZ2FjeQBGT1JNAElDT05GQUNFAEJCU19OQU1FPUJvYXJkcwBTWVNP' +
  'UF9OQU1FPVJvb3QATE9DQVRJT04AUEhPTkUARU1BSUwAV0VCU0lURQBNSU5fUEFTU1dPUkRfTEVOR1RIPTgATUlOX1BBU1NX' +
  'T1JEX1NUUkVOR1RIPTAATUFYX1BBU1NXT1JEX0ZBSUxTPS0xAENPTkZJUk1fREVMRVRJT05TAERFRkFVTFRfVElNRV9MSU1J' +
  'VD0tMQBNQVhfU0VTU0lPTl9USU1FPS0xAElETEVfVElNRU9VVD0xMABORVdfVVNFUl9TRUNfTEVWRUw9MzAATkVXX1VTRVJf' +
  'VElNRV9MSU1JVD0tMQBORVdfVVNFUl9DSEFUX0xJTUlUPS0xAE5FV19VU0VSX0xJTkVTX1BFUl9TQ1JFRU49MjMATkVXX1VT' +
  'RVJfQU5TSQBORVdfVVNFUl9QUk9UT0NPTD1aTU9ERU0ATkVXX1VTRVJfU0NSRUVOX1RZUEU9QU5TSQBORVdfVVNFUl9FRElU' +
  'T1I9RlVMTABORVdfVVNFUl9DT05GX0FDQ0VTUz1YWFgATkVXX1VTRVJfQVZBSUxBQkxFX0NIQVQATkVXX1VTRVJfQVVUT19S' +
  'RUpPSU4AQU5TSV9FTkFCTEVEAENPTE9SX1NDSEVNRT1zdGFuZGFyZABBTExPV19DVVNUT01fU0NSRUVOUwBMQU5HVUFHRV9C' +
  'QVNFPUxhbmd1YWdlcwBERUZBVUxUX0xBTkdVQUdFPUVuZ2xpc2gATUFYX0NPTkZFUkVOQ0VTPTMyAE1BWF9NRVNTQUdFX0JB' +
  'U0VTPTI1NgBNQVhfRklMRV9BUkVBUz0yNTYATUFYX05PREVTPTI1NQBGSUxFX0NIRUNLX0VOQUJMRUQAVVBMT0FEX0NIRUNL' +
  'X0RVUEUAU01UUF9GUk9NX0VNQUlMAEZUUERBVEFQT1JUAEhUVFBfSE9TVABIVFRQX1BPUlQ9ODAAVEVMTkVUX1BPUlQ9NjAw' +
  'MDAAU1NIX1BPUlQ9MjIyMjIATE9HX0xFVkVMPWluZm8ATE9HX1JFVEVOVElPTl9EQVlTPTkwAAAG//8AAAD/';

describe('bbsConfig.info', () => {
  let testDir: string;
  let filePath: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbsconfig-'));
    filePath = path.join(testDir, 'bbsConfig.info');
    fs.writeFileSync(filePath, Buffer.from(BBSCONFIG_INFO_B64, 'base64'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('reads all sixty-two tooltypes, not the twenty its count claims', () => {
    const info = parseInfoFile(filePath);

    expect(info.tooltypes).toHaveLength(62);
    expect((info as { _fallback?: boolean })._fallback).toBeFalsy();
    expect(readTooltypeMap(filePath).get('LOG_RETENTION_DAYS')).toBe('90');
  });

  it('is no longer refused by the writer', () => {
    expect(() => writeInfoFile(updateTooltype(parseInfoFile(filePath), 'IDLE_TIMEOUT', '15', false)))
      .not.toThrow();

    expect(readTooltypeMap(filePath).get('IDLE_TIMEOUT')).toBe('15');
  });

  it('comes back as a standard array every entry of which validates', () => {
    writeInfoFile(updateTooltype(parseInfoFile(filePath), 'IDLE_TIMEOUT', '15', false));

    const buf = fs.readFileSync(filePath);
    const countOffset = 439;
    const count = buf.readUInt32BE(countOffset);
    expect(count).toBe((62 + 1) * 4);

    let pos = countOffset + 4;
    for (let i = 0; i < 62; i++) {
      const len = buf.readUInt32BE(pos);
      pos += 4;
      // Declared length must land exactly on the string's own terminator.
      expect(buf.indexOf(0, pos)).toBe(pos + len - 1);
      pos += len;
    }
  });

  it('keeps every value through the rewrite', () => {
    const before = readTooltypeMap(filePath);

    writeInfoFile(updateTooltype(parseInfoFile(filePath), 'IDLE_TIMEOUT', '15', false));

    const after = readTooltypeMap(filePath);
    for (const [key, value] of before) {
      if (key === 'IDLE_TIMEOUT') continue;
      expect(after.get(key)).toBe(value);
    }
  });

  it('reaches the config with the ports the sysop set, glued length byte and all', () => {
    // The file spells the key "6FTPDATAPORT" - 0x36 is the entry's own length,
    // baked into the key by an older round trip - and then repeats FTPDATAPORT
    // as a bare flag. The loader used to normalise the first to nothing and let
    // the second overwrite it, so a configured port list read as unset.
    const config = loadBBSConfig(testDir);

    expect(config.ftp_data_ports).toBe('40101,40102,40103,40104,40105,40106,40107');
    expect(config.bbs_name).toBe('Boards');
    expect(config.telnet_port).toBe(60000);
  });

  it('answers a repeated key the way FindToolType does, with the first', () => {
    // The file carries SMTP_HOST twice, and FTPDATAPORT as both a value and a
    // bare flag. icon.library returns the first match (tooltypes.e:215-218).
    const doorSide = extractTooltypesFromInfoFile(filePath);

    expect(doorSide.get('SMTP_HOST')).toBe('smtp.gmail.com');
    expect(doorSide.get('SMTP_PORT')).toBe('465');
  });
});
