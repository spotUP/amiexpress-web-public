/**
 * swap-account-slots: an account moves into another slot and EVERYTHING the
 * board keys by slot moves with it, so each caller keeps his own records.
 *
 * The sysop's account belongs in slot 1 (express.e:10717 - C is mail to slot
 * 1); on the live board slot 1 is '-TCB!-'. Driven through the script's own
 * entry point on a fixture board built by the board's own writers: three
 * accounts in user.data/keys/misc, two conferences' Conf.DB plus a third
 * conference that SHARES conference 2's (CONFDB_SHARED), AquaScan.UserData,
 * flagged files, a part upload, a lost-carrier list, a sysop's note, and the
 * SQL users rows.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import BetterSqlite3 from 'better-sqlite3';

import { swapAccountSlots } from '../../src/scripts/swap-account-slots';
import { UserFileManager } from '../../src/services/UserFileManager';
import { MessagePointerFileManager, CONFBASE_RECORD_SIZE } from '../../src/services/MessagePointerFileManager';
import { NodeFileManager } from '../../src/services/NodeFileManager';

let root: string;
let notesDir: string;
let dbPath: string;
const lines: string[] = [];

function row(username: string, slotNumber: number, email: string): any {
  const when = new Date(Date.UTC(2026, 0, 1));
  return {
    id: `id-${username}`, username, slotNumber, passwordHash: 'hash',
    realname: `${username} real`, location: 'Here', phone: '', email,
    secLevel: username === 'spot' ? 255 : 30, uploads: 0, downloads: 0, bytesUpload: 0, bytesDownload: 0,
    ratio: 0, ratioType: 0, timeTotal: 3600, timeLimit: 3600, timeUsed: 0,
    chatLimit: 600, chatUsed: 0, lastLogin: when, firstLogin: when,
    calls: slotNumber * 10, callsToday: 0, newUser: false, expert: 'N', ansi: true,
    linesPerScreen: 23, computer: '', screenType: '', protocol: '/X Zmodem',
    editor: 'Prompt', zoomType: 'QWK', availableForChat: true, quietNode: false,
    autoRejoin: 1, confAccess: 'XXXXXXXXXX', areaName: '', uuCP: false,
    topUploadCPS: 0, topDownloadCPS: 0, byteLimit: 0, userFlags: 0, baud: 0,
    created: when, updated: when,
  };
}

/** A confBase record that says whose it is. */
function confRecord(marker: number): Buffer {
  const buf = Buffer.alloc(CONFBASE_RECORD_SIZE);
  buf[0] = marker;           // handle[0]: scan flags
  buf.writeInt32BE(marker * 100, 36); // confRead
  return buf;
}

function build(): void {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'slot-swap-'));
  notesDir = path.join(root, 'db', 'userNotes');
  dbPath = path.join(root, 'db', 'amiexpress.db');
  fs.mkdirSync(notesDir, { recursive: true });
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
  for (const n of [1, 2, 3]) fs.mkdirSync(path.join(root, `Conf${n}`), { recursive: true });
  fs.writeFileSync(path.join(root, 'Conf3.info'), 'CONFDB_SHARED=2\n');
  fs.mkdirSync(path.join(root, 'Node1'));

  const ufm = new UserFileManager(root);
  ufm.writeUserFiles(row('-TCB!-', 1, 'tcb@example.com'), 1);
  ufm.writeUserFiles(row('bystander', 2, 'by@example.com'), 2);
  ufm.writeUserFiles(row('spot', 3, 'spot@example.com'), 3);

  const mpf = new MessagePointerFileManager(root);
  for (const conf of [1, 2]) {
    for (const slot of [1, 2, 3]) mpf.writeRaw(conf, slot, confRecord(conf * 10 + slot));
  }

  const aqua = path.join(root, 'Doors', 'AquaScan');
  fs.mkdirSync(aqua, { recursive: true });
  fs.writeFileSync(path.join(aqua, 'AquaScan.UserData'), Buffer.concat([1, 2, 3].map((s) => Buffer.alloc(16, s))));

  fs.mkdirSync(path.join(root, 'Partdownload'));
  fs.writeFileSync(path.join(root, 'Partdownload', 'flagged3'), 'spot flags');
  fs.writeFileSync(path.join(root, 'Partdownload', 'flagged1'), 'tcb flags');
  fs.writeFileSync(path.join(root, 'Partdownload', 'flagged13'), 'not either');
  fs.mkdirSync(path.join(root, 'Conf1', 'PartUpload'));
  fs.writeFileSync(path.join(root, 'Conf1', 'PartUpload', 'DEMO.LHA@3'), 'spot part');
  fs.mkdirSync(path.join(root, 'Conf2', 'LCFILES'));
  fs.writeFileSync(path.join(root, 'Conf2', 'LCFILES', '1.lc'), 'tcb lost');
  fs.writeFileSync(path.join(notesDir, '3'), 'note about spot');

  const sql = new BetterSqlite3(dbPath);
  sql.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, slotnumber INTEGER DEFAULT 0);
            CREATE TABLE node_sessions (id TEXT PRIMARY KEY, nodeid INTEGER, userid TEXT, status TEXT NOT NULL);`);
  for (const [name, slot] of [['-TCB!-', 1], ['bystander', 2], ['spot', 3]] as const) {
    sql.prepare('INSERT INTO users (id, username, slotnumber) VALUES (?, ?, ?)').run(`id-${name}`, name, slot);
  }
  sql.close();
}

const run = (dryRun: boolean, stamp = '20261004T120000') =>
  swapAccountSlots({ account: 'spot', toSlot: 1, dryRun, bbsRoot: root, dbPath, notesDir, stamp, log: (l) => lines.push(l) });

/** Every byte of the board, for "nothing changed". */
function snapshot(): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else out.set(path.relative(root, p), fs.readFileSync(p).toString('base64'));
    }
  };
  walk(root);
  return out;
}

const sqlSlots = () => {
  const sql = new BetterSqlite3(dbPath, { readonly: true });
  try {
    return Object.fromEntries((sql.prepare('SELECT username, slotnumber FROM users').all() as any[])
      .map((r) => [r.username, r.slotnumber]));
  } finally {
    sql.close();
  }
};

beforeEach(() => { lines.length = 0; build(); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('swap-account-slots', () => {
  it('moves the account and everything keyed by its slot; the other account takes its old slot', () => {
    expect(run(false)).toBe('swapped');

    const ufm = new UserFileManager(root);
    const at1 = ufm.readUserBySlot(1)!;
    const at3 = ufm.readUserBySlot(3)!;
    expect([at1.username, at1.email, at1.secLevel]).toEqual(['spot', 'spot@example.com', 255]);
    expect([at3.username, at3.email]).toEqual(['-TCB!-', 'tcb@example.com']);
    expect(ufm.readUserBySlot(2)!.username).toBe('bystander');
    // The fields that name the position say the new one.
    const layout = ufm.recordLayout();
    for (const slot of [1, 3]) {
      const rec = ufm.readSlotRecords(slot);
      expect(rec.user.readInt16BE(layout.slotNumberOffset)).toBe(slot);
      expect(rec.keys.readInt32BE(layout.keysNumberOffset)).toBe(slot);
    }

    // Conf.DB: spot's records are now at 1 in BOTH files - and conference 3,
    // which shares conference 2's file, did not swap it a second time back.
    const mpf = new MessagePointerFileManager(root);
    for (const conf of [1, 2]) {
      expect(mpf.readRaw(conf, 1)).toEqual(confRecord(conf * 10 + 3));
      expect(mpf.readRaw(conf, 3)).toEqual(confRecord(conf * 10 + 1));
      expect(mpf.readRaw(conf, 2)).toEqual(confRecord(conf * 10 + 2));
    }
    expect(mpf.readRaw(3, 1)).toEqual(confRecord(23));

    const aqua = fs.readFileSync(path.join(root, 'Doors', 'AquaScan', 'AquaScan.UserData'));
    expect([aqua[0], aqua[16], aqua[32]]).toEqual([3, 2, 1]);

    const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf8');
    expect(read('Partdownload', 'flagged1')).toBe('spot flags');
    expect(read('Partdownload', 'flagged3')).toBe('tcb flags');
    expect(read('Partdownload', 'flagged13')).toBe('not either');
    expect(read('Conf1', 'PartUpload', 'DEMO.LHA@1')).toBe('spot part');
    expect(fs.existsSync(path.join(root, 'Conf1', 'PartUpload', 'DEMO.LHA@3'))).toBe(false);
    expect(read('Conf2', 'LCFILES', '3.lc')).toBe('tcb lost');
    expect(fs.readFileSync(path.join(notesDir, '1'), 'utf8')).toBe('note about spot');

    expect(sqlSlots()).toEqual({ '-TCB!-': 3, bystander: 2, spot: 1 });

    // Every file it changed has its copy from before.
    expect(fs.existsSync(path.join(root, 'user.data.pre-slot-swap-20261004T120000.backup'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'Conf2', 'Conf.DB.pre-slot-swap-20261004T120000.backup'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'swap-account-slots.journal.json'))).toBe(false);
  });

  it('a second run is nothing to do and changes nothing', () => {
    run(false);
    const before = snapshot();
    expect(run(false, '20261004T130000')).toBe('nothing-to-do');
    expect(snapshot()).toEqual(before);
  });

  it('--dry-run names every change and writes nothing', () => {
    const before = snapshot();
    expect(run(true)).toBe('dry-run');
    expect(snapshot()).toEqual(before);
    const said = lines.join('\n');
    expect(said).toContain("'spot' slot 3 -> 1; '-TCB!-' slot 1 -> 3");
    expect(said).toContain('Conf1/Conf.DB: confBase records 3 <-> 1');
    expect(said).toContain('rename Partdownload/flagged3 -> flagged1');
    expect(said).toContain('SQL users.slotnumber: spot 3 -> 1, -TCB!- 1 -> 3');
  });

  it('refuses while either account is online', () => {
    new NodeFileManager(root).writeNodeUserFile(1, row('-TCB!-', 1, 'tcb@example.com'));
    const before = snapshot();
    expect(run(false)).toBe('refused');
    expect(lines.join('\n')).toContain("'-TCB!-' is online on node 1");
    expect(snapshot()).toEqual(before);
  });

  it('a run that died half way is rolled back from its journal, then done whole', () => {
    // A crashed run: Conf1/Conf.DB was backed up and then written over.
    const confDb = path.join(root, 'Conf1', 'Conf.DB');
    const backup = `${confDb}.pre-slot-swap-20261004T110000.backup`;
    fs.copyFileSync(confDb, backup);
    fs.writeFileSync(confDb, Buffer.alloc(3 * CONFBASE_RECORD_SIZE, 0xee));
    fs.writeFileSync(path.join(root, 'swap-account-slots.journal.json'), JSON.stringify({
      account: 'spot', toSlot: 1, fromSlot: 3, started: '20261004T110000',
      entries: [{ file: confDb, backup }, { file: path.join(root, 'stray.slot-swap-tmp'), backup: null }],
    }));
    fs.writeFileSync(path.join(root, 'stray.slot-swap-tmp'), 'left behind');

    expect(run(false)).toBe('swapped');
    const mpf = new MessagePointerFileManager(root);
    expect(mpf.readRaw(1, 1)).toEqual(confRecord(13));
    expect(fs.existsSync(path.join(root, 'stray.slot-swap-tmp'))).toBe(false);
  });
});
