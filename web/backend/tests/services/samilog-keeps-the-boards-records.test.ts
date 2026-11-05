/**
 * Super-AmiLog keeps the board's own records.
 *
 * The store is SAmiLog v2 (`*SALv002`, DOCS/Storage.DOC): each record is a
 * value followed by the day it was set. The port read its own invented shape,
 * so the board's real records - 275 calls, 3745 downloads, set on the Amiga -
 * came back as noise: the records line showed 9999 calls and zero downloads
 * while the day above it had more (sysop's board, 2026-09-28). And only the
 * calls record was ever updated, live, from today's running total; SAmiLog
 * breaks a record when a day ENDS, with that day's figure (Command_U).
 *
 * Driven on the board's real store file and a real CallersLog.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const REPO = path.join(__dirname, '..', '..', '..', '..');
const DAILY0 = 8 + 4 + 36;               // version, clear date, reserved
const DAY_MS = 24 * 60 * 60 * 1000;
const today = () => Math.floor((Date.now() - Date.UTC(1978, 0, 1)) / DAY_MS);

function board(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'samilog-records-'));
  const utils = path.join(dir, 'Utils', 'samilog');
  fs.mkdirSync(utils, { recursive: true });
  fs.copyFileSync(path.join(REPO, 'board', 'S', 'SAmiLog.Store'), path.join(utils, 'SAmiLog.Store'));
  fs.mkdirSync(path.join(dir, 'Node1'));
  fs.copyFileSync(path.join(__dirname, '..', 'fixtures', 'amiga-board', 'Node1', 'CallersLog'), path.join(dir, 'Node1', 'CallersLog'));
  return dir;
}

function serviceFor(dir: string) {
  process.env.BBS_DATA_DIR = dir;
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../src/services/SamiLogService');
}

/** Rewrite today's slot (day 0) of the store: its date and some counts. */
function setDay0(dir: string, date: number, counts: { calls: number; dnFiles: number }): void {
  const store = path.join(dir, 'Utils', 'samilog', 'SAmiLog.Store');
  const b = fs.readFileSync(store);
  b.writeUInt32BE(date, DAILY0);
  b.writeUInt16BE(counts.calls, DAILY0 + 4);
  b.writeUInt16BE(counts.dnFiles, DAILY0 + 18);
  fs.writeFileSync(store, b);
}

/** Day 0 as the store holds it now: proof the update really ran. */
function day0(dir: string): { date: number; calls: number } {
  const b = fs.readFileSync(path.join(dir, 'Utils', 'samilog', 'SAmiLog.Store'));
  return { date: b.readUInt32BE(DAILY0), calls: b.readUInt16BE(DAILY0 + 4) };
}

const recordOf = (table: string, label: string) =>
  (table.split('\n').find((l) => l.startsWith(label)) ?? '').trim();

const saved = process.env.BBS_DATA_DIR;
afterAll(() => {
  if (saved === undefined) delete process.env.BBS_DATA_DIR; else process.env.BBS_DATA_DIR = saved;
});

it("reads the board's records as SAmiLog wrote them", () => {
  const svc = serviceFor(board());
  const records = svc.generateRecordStats({ noAnsi: true });
  expect(recordOf(records, 'Calls')).toMatch(/^Calls\s+275\s/);
  expect(recordOf(records, 'Dn Files')).toMatch(/^Dn Files\s+3745\s/);
  expect(recordOf(records, 'Up Files')).toMatch(/^Up Files\s+286\s/);
});

it('a day that beat a record breaks it when the day ends, and only that one', async () => {
  const dir = board();
  const yesterday = today() - 1;
  setDay0(dir, yesterday, { calls: 3, dnFiles: 5000 });
  const svc = serviceFor(dir);

  await svc.updateStoreFromCallersLog(1, {});
  expect(day0(dir)).toEqual({ date: today(), calls: 1 });  // the day rolled, the call counted

  const records = svc.generateRecordStats({ noAnsi: true });
  expect(recordOf(records, 'Dn Files')).toMatch(/^Dn Files\s+5000\s/);
  expect(recordOf(records, 'Calls')).toMatch(/^Calls\s+275\s/);
});

it("today's running totals never touch the records", async () => {
  const dir = board();
  setDay0(dir, today(), { calls: 400, dnFiles: 9000 });
  const svc = serviceFor(dir);

  await svc.updateStoreFromCallersLog(1, {});
  expect(day0(dir).calls).toBe(401);                       // the call counted, same day

  const records = svc.generateRecordStats({ noAnsi: true });
  expect(recordOf(records, 'Dn Files')).toMatch(/^Dn Files\s+3745\s/);
  expect(recordOf(records, 'Calls')).toMatch(/^Calls\s+275\s/);
});

it('a logoff that added no session to the CallersLog adds no caller and no call', async () => {
  /*
   * Live 2026-09-28: randy and orlingo each stood twice in the Super-AmiLog
   * list, same node, same times. Every logoff runs the node's batch, and the
   * update reads the LAST session in that node's CallersLog - so a logoff that
   * wrote no session (a caller who dropped before logging in) recorded the
   * previous caller again, and counted them as another call.
   */
  const dir = board();
  setDay0(dir, today(), { calls: 10, dnFiles: 0 });
  const svc = serviceFor(dir);

  await svc.updateStoreFromCallersLog(1, {});
  await svc.updateStoreFromCallersLog(1, {});

  expect(day0(dir).calls).toBe(11);
  const rows = svc.generateBulletin(20, { noAnsi: true, noTexts: true }).split('\n')
    .filter((l: string) => /^\S+\s+1\s/.test(l));
  expect(rows.length).toBeGreaterThan(0);
  expect(new Set(rows).size).toBe(rows.length);
});

it("lists the last call of an express.e CallersLog in the bulletin", async () => {
  /*
   * The CallersLog is express.e's (displayUserToCallersLog, express.e:16041;
   * logoffLog, 9468; the transfer summaries, 18857/20266), read as
   * SAmiLog.asm reads it. The port parsed its own `DD-Mon-YY HH:MM [n] name
   * (LOCAL)` line, which no AmiExpress board writes.
   */
  const dir = board();
  setDay0(dir, today(), { calls: 0, dnFiles: 0 });
  const svc = serviceFor(dir);

  await svc.updateStoreFromCallersLog(1, {});

  expect(day0(dir).calls).toBe(1);
  const row = svc.generateBulletin(20, { noAnsi: true, noTexts: true }).split('\n')
    .find((l: string) => / regress /.test(l));
  // Baud N Name Group/Location On-Time (Actions) H:MM Up-K Dn-K
  expect(row).toMatch(/^19\.2 1 regress +Test Account +17:37:02 \(---DU-\) 0:04 +12 +53$/);
});
