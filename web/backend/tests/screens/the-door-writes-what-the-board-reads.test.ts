/**
 * THE RELEASE 2 GATE. A message the DOOR wrote must be a message the BOARD
 * reads - byte for byte, in a copy of a real conference.
 *
 * The plan says this blocks R2 shipping, and the reason is specific. The C
 * writer has its own tests, and they pass; but they check ae_msgbase's bytes
 * with ae_msgbase's own parser. A writer and a reader that were built together
 * will happily agree with each other and disagree with the board - which is how
 * "a wrong byte in a 110-byte header" becomes "somebody's mail is unreadable",
 * the exact risk that kept release 1 from writing at all.
 *
 * So this drives the REAL C binary (sdk/c/build/write-message) and reads the
 * result back with MessageIndexManager, the board's own reader. Nothing in the
 * chain is a stand-in.
 *
 * The fixture is REAL BYTES - web/backend/tests/fixtures/msgheaders/
 * amiga-written.HeaderFile, records from a live conference - copied to a temp
 * directory first. A parser checked against fixtures its own writer produced
 * proves nothing, and writing into the tracked fixture would destroy it.
 */
process.env.SKIP_DB_INIT = '1';

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const REPO = path.join(__dirname, '..', '..', '..', '..');
const WRITER = path.join(REPO, 'sdk', 'c', 'build', 'write-message');
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'msgheaders', 'amiga-written.HeaderFile');

const HEADER_SIZE = 110;

/** A conference directory holding a copy of the real HeaderFile. */
function aRealBaseCopy(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'msgbase-gate-'));
  fs.copyFileSync(FIXTURE, path.join(dir, 'HeaderFile'));
  return dir;
}

/** Run the door's own writer. Returns the message number it assigned. */
function doorWrites(dir: string, opts: {
  status?: string; to?: string; from?: string; subject?: string; date?: number; body?: string;
} = {}): number {
  const out = execFileSync(WRITER, [
    dir,
    opts.status ?? 'P',
    opts.to ?? 'EALL',
    opts.from ?? 'spot',
    opts.subject ?? 'from the door',
    String(opts.date ?? 1600000000),
    opts.body ?? 'line one\nline two\n',
  ], { encoding: 'utf8' });
  return Number(out.trim());
}

/**
 * The board's side, and deliberately the BOARD'S OWN parser - not a copy of
 * the layout written for this test. `MessageIndexManager.parseHeaderFile` is
 * what the running board uses to decide who wrote what.
 */
function boardReadsHeaders(dir: string) {
  const { MessageIndexManager } = require('../../src/services/MessageIndexManager');
  const manager = new MessageIndexManager();
  const raw = fs.readFileSync(path.join(dir, 'HeaderFile'));
  return manager.parseHeaderFile(raw);
}

const haveWriter = fs.existsSync(WRITER);
const describeIfBuilt = haveWriter ? describe : describe.skip;

describe('the release 2 gate', () => {
  it('has the C writer built, or the gate is not being run', () => {
    // Loud rather than skipped-and-forgotten: a gate that silently does not
    // run is worse than no gate. `make -C sdk/c build/write-message`.
    expect([WRITER, haveWriter]).toEqual([WRITER, true]);
  });
});

describeIfBuilt('a message the door wrote, read by the board', () => {
  it('appears to the board with every field intact', () => {
    const dir = aRealBaseCopy();
    const before = boardReadsHeaders(dir).length;

    const num = doorWrites(dir, { from: 'spot', to: 'EALL', subject: 'from the door' });
    expect(num).toBeGreaterThan(0);

    const after = boardReadsHeaders(dir);
    expect(after).toHaveLength(before + 1);

    const written = after[after.length - 1];
    expect(written.msgNumb).toBe(num);
    expect(written.fromName).toBe('spot');
    expect(written.toName).toBe('EALL');
    expect(written.subject).toBe('from the door');
  });

  it('does not disturb the messages that were already there', () => {
    // The failure this guards is not "the new record is wrong" but "the new
    // record changed what the whole-file sequence pass concludes about its
    // neighbours" - a base that read fine before the post and not after.
    const dir = aRealBaseCopy();
    const before = boardReadsHeaders(dir);

    doorWrites(dir);

    const after = boardReadsHeaders(dir);
    expect(after.slice(0, before.length)).toEqual(before);
  });

  it('writes a record the board classifies as AmiExpress layout', () => {
    const dir = aRealBaseCopy();
    const num = doorWrites(dir);
    const raw = fs.readFileSync(path.join(dir, 'HeaderFile'));
    const rec = raw.subarray(raw.length - HEADER_SIZE);

    // The AmiExpress offsets, asserted on the bytes rather than through any
    // parser: number at 2, names at 6 and 37, subject at 68, date at 100.
    // The port's layout has each of these one byte earlier, and a record
    // written there would read as a different message entirely.
    expect(rec.readUInt32BE(2)).toBe(num);
    expect(rec.subarray(6, 10).toString('latin1')).toBe('EALL');
    expect(rec.subarray(37, 41).toString('latin1')).toBe('spot');
    expect(rec.readUInt32BE(100)).toBe(1600000000);
    expect(rec.readUInt32BE(104)).toBe(0);          // unread by its recipient
    expect(String.fromCharCode(rec[0])).toBe('P');
  });

  it('leaves MailStats pointing at the NEXT free number', () => {
    // highMsgNum is the next number, not the highest. Getting it backwards
    // makes the following post open an existing body MODE_NEWFILE and truncate
    // it - data loss this codebase has already had once.
    const dir = aRealBaseCopy();
    const num = doorWrites(dir);

    const stats = fs.readFileSync(path.join(dir, 'MailStats'));
    expect(stats).toHaveLength(18);
    expect(stats.readUInt32BE(4)).toBe(num + 1);
  });

  it('puts the body where the board looks for it, LF-terminated', () => {
    const dir = aRealBaseCopy();
    const num = doorWrites(dir, { body: 'hello\nworld' });

    // express.e:10700-10703 - body lines and nothing else, named after the
    // message number with no extension.
    const body = fs.readFileSync(path.join(dir, String(num)), 'latin1');
    expect(body).toBe('hello\nworld\n');
    expect(fs.existsSync(path.join(dir, `${num}.txt`))).toBe(false);
  });

  it('two posts in a row do not collide', () => {
    const dir = aRealBaseCopy();
    const first = doorWrites(dir, { body: 'first\n' });
    const second = doorWrites(dir, { body: 'second\n' });

    expect(second).toBe(first + 1);
    expect(fs.readFileSync(path.join(dir, String(first)), 'latin1')).toBe('first\n');
    expect(fs.readFileSync(path.join(dir, String(second)), 'latin1')).toBe('second\n');
  });

  it('leaves MailLock as express.e does - there, empty, and not held', () => {
    // lockMsgBase creates the file and never deletes or writes it
    // (express.e:11944-11970); the lock is the handle, not the file.
    const dir = aRealBaseCopy();
    const first = doorWrites(dir);
    const lock = path.join(dir, 'MailLock');
    expect(fs.existsSync(lock)).toBe(true);
    expect(fs.readFileSync(lock).length).toBe(0);
    expect(doorWrites(dir)).toBe(first + 1);
  });

  it('REFUSES to append to a base holding port-written records', () => {
    // The board copes with both layouts; the door only writes one. Refusing
    // is the whole safety argument for letting release 2 write at all.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'msgbase-gate-port-'));
    fs.copyFileSync(
      path.join(__dirname, '..', 'fixtures', 'msgheaders', 'port-written.HeaderFile'),
      path.join(dir, 'HeaderFile')
    );
    const before = fs.readFileSync(path.join(dir, 'HeaderFile'));

    expect(() => doorWrites(dir)).toThrow();
    expect(fs.readFileSync(path.join(dir, 'HeaderFile'))).toEqual(before);
  });
});
