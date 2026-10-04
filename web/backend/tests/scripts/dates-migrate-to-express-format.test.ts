/**
 * The one-off migration converts the dates the port stored as Unix seconds to
 * express.e's getSystemTime() value - and nothing an Amiga wrote.
 *
 * Fixture board: user.data / user.misc / Conf1/Conf.DB / Conf1/MsgBase with
 * port-written values (2026, Unix), values from the original Amiga board
 * (2019), a message a 68K door wrote in express.e's form (21600 past its
 * body's time) and a message whose body was rewritten later (unidentified).
 */
process.env.TZ = 'Europe/Stockholm';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { runDateMigration } from '../../src/scripts/migrate-dates-to-express-format';

/** 2026-09-30 11:52:16Z, which express.e stores as 0x6abd6870 in Stockholm (CEST). */
const PORT_UNIX = 1790769136;
const PORT_EXPRESS = 0x6abd6870;
/** 2026-02-11 19:34:00Z (CET): express.e's value is one hour less ahead. */
const WINTER_UNIX = 1770838440;
const WINTER_EXPRESS = WINTER_UNIX + 21600 + 3600;
/** A newSinceDate off the original Amiga board, 2019. */
const AMIGA_2019 = 1560000000;
const CUTOVER = '2026-10-04T19:00:00Z';

let root: string;

function writeFixture(): void {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'date-migration-'));

  const user = Buffer.alloc(232 * 2);
  user.write('porter', 0, 'latin1');
  user.writeInt32BE(PORT_UNIX, 96);          // newSinceDate
  user.writeInt32BE(WINTER_UNIX, 128);       // accountDate
  user.writeInt32BE(PORT_UNIX, 154);         // timeLastOn
  user.write('amigan', 232, 'latin1');
  user.writeInt32BE(AMIGA_2019, 232 + 154);  // from the old board: left
  fs.writeFileSync(path.join(root, 'user.data'), user);

  const misc = Buffer.alloc(248 * 2);
  misc.writeInt32BE(PORT_UNIX, 150);         // pwdLastUpdated
  fs.writeFileSync(path.join(root, 'user.misc'), misc);

  const conf = path.join(root, 'Conf1');
  fs.mkdirSync(path.join(conf, 'MsgBase'), { recursive: true });
  const confDb = Buffer.alloc(74 * 2);
  confDb.writeInt32BE(AMIGA_2019, 32);
  confDb.writeInt32BE(PORT_UNIX, 74 + 32);
  fs.writeFileSync(path.join(conf, 'Conf.DB'), confDb);

  // Three messages in express.e's 110-byte layout.
  const headers = Buffer.alloc(110 * 3);
  const record = (i: number, n: number, from: string, msgDate: number, recv: number) => {
    const at = i * 110;
    headers.writeUInt8(0x50, at);
    headers.writeInt32BE(n, at + 2);
    headers.write('ALL', at + 6, 'latin1');
    headers.write(from, at + 37, 'latin1');
    headers.write('subject', at + 68, 'latin1');
    headers.writeUInt32BE(msgDate, at + 100);
    headers.writeUInt32BE(recv, at + 104);
    headers.writeInt16BE(-1, at + 108);
  };
  record(0, 1, 'spot', PORT_UNIX, PORT_UNIX + 30);       // the port's, read by the port
  record(1, 2, 'Spot', PORT_UNIX + 21600, 0);            // Conftop in the emulator: express.e's form
  record(2, 3, 'spot', PORT_UNIX - 5000, 0);             // body rewritten later: cannot tell
  fs.writeFileSync(path.join(conf, 'MsgBase', 'HeaderFile'), headers);
  const body = (n: number, when: number) => {
    const f = path.join(conf, 'MsgBase', String(n));
    fs.writeFileSync(f, 'text\n');
    fs.utimesSync(f, when, when);
  };
  body(1, PORT_UNIX);
  body(2, PORT_UNIX);
  body(3, PORT_UNIX + 86400);
}

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function run(...extra: string[]): string {
  const out: string[] = [];
  expect(runDateMigration(['--root', root, '--cutover', CUTOVER, '--date', '2026-10-05', ...extra], (l) => out.push(l))).toBe(0);
  return out.join('\n');
}

const long = (file: string, at: number) => fs.readFileSync(path.join(root, file)).readUInt32BE(at);

describe('migrating the port-written dates to express.e\'s value', () => {
  test('converts what the port wrote and leaves what an Amiga wrote', () => {
    writeFixture();
    run();

    expect(long('user.data', 96)).toBe(PORT_EXPRESS);
    expect(long('user.data', 128)).toBe(WINTER_EXPRESS);
    expect(long('user.data', 154)).toBe(PORT_EXPRESS);
    expect(long('user.data', 232 + 154)).toBe(AMIGA_2019);
    expect(long('user.misc', 150)).toBe(PORT_EXPRESS);
    expect(long('Conf1/Conf.DB', 32)).toBe(AMIGA_2019);
    expect(long('Conf1/Conf.DB', 74 + 32)).toBe(PORT_EXPRESS);

    const hf = 'Conf1/MsgBase/HeaderFile';
    expect(long(hf, 100)).toBe(PORT_EXPRESS);                 // the port's message
    expect(long(hf, 104)).toBe(PORT_EXPRESS + 30);            // and its received time
    expect(long(hf, 110 + 100)).toBe(PORT_UNIX + 21600);      // the 68K door's: as it was
    expect(long(hf, 220 + 100)).toBe(PORT_UNIX - 5000);       // unidentified: as it was
  });

  test('backs each changed file up first, byte for byte', () => {
    writeFixture();
    const before = fs.readFileSync(path.join(root, 'user.data'));
    const out = run();
    const backup = path.join(root, 'user.data.pre-date-migration-2026-10-05.backup');
    expect(out).toContain(`backup: ${backup}`);
    expect(fs.readFileSync(backup).equals(before)).toBe(true);
  });

  test('a second run changes nothing', () => {
    writeFixture();
    run();
    const files = ['user.data', 'user.misc', 'Conf1/Conf.DB', 'Conf1/MsgBase/HeaderFile'];
    const once = files.map((f) => fs.readFileSync(path.join(root, f)));
    const out = run();
    expect(out).toContain('user.data: skipped - already migrated');
    expect(out).toContain('Nothing to change.');
    files.forEach((f, i) => expect(fs.readFileSync(path.join(root, f)).equals(once[i])).toBe(true));
  });

  test('a dry run reports and writes nothing', () => {
    writeFixture();
    const before = fs.readFileSync(path.join(root, 'user.data'));
    const out = run('--dry-run');
    expect(out).toContain('user.data: 3 field(s) to convert');
    expect(out).toContain('Conf1/MsgBase/HeaderFile: 2 field(s) to convert, 1 already in express.e\'s form, 1 unidentified');
    expect(out).toContain('left as is (unidentified): msg 3 from spot');
    expect(fs.readFileSync(path.join(root, 'user.data')).equals(before)).toBe(true);
    expect(fs.readdirSync(root).some((n) => n.endsWith('.backup'))).toBe(false);
  });

  test('a record the sysop names is converted although its body cannot vouch for it', () => {
    writeFixture();
    run('--convert-msg', '1/3');
    expect(long('Conf1/MsgBase/HeaderFile', 220 + 100)).not.toBe(PORT_UNIX - 5000);
    expect(long('Conf1/MsgBase/HeaderFile', 110 + 100)).toBe(PORT_UNIX + 21600);
  });
});
