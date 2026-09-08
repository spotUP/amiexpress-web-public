/**
 * Two sysop-facing flows whose justification comments were both wrong.
 *
 * GOODBYE, express.e:25056 - `IF partUploadOK(0)=RESULT_ABORT THEN RETURN`,
 * asked before the flagged-files question. partUploadOK (express.e:17525)
 * walks `<conf>/PartUpload/`, reads each name's `@<slot>` suffix to see whose
 * it is, and on a hit says "There are some incompleted uploads of yours" and
 * asks whether to leave anyway. The note here said "For web version, we don't
 * have partial uploads" - true only because nothing created them, since
 * cleanPlayPen had no callers until it was wired into the post-upload
 * pipeline. Now aborted uploads land there and can be resumed, so a caller
 * hanging up without being asked silently abandons one.
 *
 * CL, express.e:24473-24507 - lists the nodes that have a Callerslog and asks
 * which to view. The note here said this deployment is "single-node and logs
 * go to the database, not per-node flat files". The board writes
 * Node{N}/CallersLog through CallersLogManager on every login, logoff, upload
 * and download, and those files are what a real AmiExpress and every door
 * read - so the sysop saw a database summary and never the board's own log.
 */
process.env.SKIP_DB_INIT = '1';
process.env.SKIP_SERVER_START = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function socket() {
  const out: string[] = [];
  return { out, emit: (e: string, d?: unknown) => { if (e === 'ansi-output') out.push(String(d)); } } as any;
}

describe('a caller with unfinished uploads says goodbye', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'goodbye-'));
    jest.resetModules();
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  function seedPartUpload(names: string[]): void {
    const dir = path.join(root, 'Conf1', 'PartUpload');
    fs.mkdirSync(dir, { recursive: true });
    for (const name of names) fs.writeFileSync(path.join(dir, name), 'partial');
  }

  function callerSession(): any {
    return { currentConf: 1, nodeId: 1, tempData: {}, user: { slotNumber: 7, username: 'spot' } };
  }

  function partUploads(session: any): string[] {
    process.env.BBS_DATA_DIR = root;
    const { partUploadsForCaller } = require('../../src/handlers/commands/system-commands.handler');
    return partUploadsForCaller(session);
  }

  it('finds the caller\'s own partial upload by its @slot suffix', () => {
    seedPartUpload(['BIGFILE.LHA@7']);

    expect(partUploads(callerSession())).toEqual(['BIGFILE.LHA@7']);
  });

  it('ignores a partial upload belonging to somebody else', () => {
    // express.e:17583 reads the suffix back with getUN() precisely to scope
    // the question to the caller.
    seedPartUpload(['SOMEONE.LHA@42']);

    expect(partUploads(callerSession())).toEqual([]);
  });

  it('finds one filed with the ownPartFiles node prefix', () => {
    // cleanPlayPen writes `@<node>-<slot>` when the sysop sets ownPartFiles.
    seedPartUpload(['BIGFILE.LHA@3-7']);

    expect(partUploads(callerSession())).toEqual(['BIGFILE.LHA@3-7']);
  });

  it('finds nothing when the board has no PartUpload directory', () => {
    expect(partUploads(callerSession())).toEqual([]);
  });

  it('finds nothing for a caller with no slot at all', () => {
    seedPartUpload(['BIGFILE.LHA@7']);
    const anonymous = { ...callerSession(), user: { username: 'guest' } };

    expect(partUploads(anonymous)).toEqual([]);
  });
});

describe('which node\'s callers log', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-'));
    jest.resetModules();
    process.env.BBS_ROOT = root;
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    delete process.env.BBS_ROOT;
  });

  function seedNodeLog(nodeId: number, text: string): void {
    const dir = path.join(root, `Node${nodeId}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'CallersLog'), text, 'latin1');
  }

  function manager(): any {
    const { CallersLogManager } = require('../../src/services/CallersLogManager');
    return new CallersLogManager();
  }

  it('lists the nodes that have a log', () => {
    seedNodeLog(0, 'node zero');
    seedNodeLog(1, 'node one');

    expect(manager().availableLogs().map((e: any) => e.nodeId)).toEqual([0, 1]);
  });

  it('stops at the first node with no log, as express does', () => {
    // express.e:24479-24487 walks upward UNTIL a file fails to open.
    seedNodeLog(0, 'node zero');
    seedNodeLog(2, 'node two');

    expect(manager().availableLogs().map((e: any) => e.nodeId)).toEqual([0]);
  });

  it('shows a node\'s log, with its express header line', async () => {
    seedNodeLog(0, 'spot logged on\n');
    const { displayNodeCallersLog } = require('../../src/handlers/commands/sysop-commands.handler');
    const s = socket();

    await displayNodeCallersLog(s, { tempData: {} } as any, 0);

    const text = s.out.join('');
    expect(text).toContain('0 - Callerslog for Node 0');
    expect(text).toContain('spot logged on');
  });

  it('refuses a node with no log, in express\'s words', async () => {
    const { displayNodeCallersLog } = require('../../src/handlers/commands/sysop-commands.handler');
    const s = socket();

    await displayNodeCallersLog(s, { tempData: {} } as any, 9);

    expect(s.out.join('')).toContain('Not a valid node!');
  });

  it('treats an empty answer as "never mind"', async () => {
    const { handleCallersLogNodeInput } = require('../../src/handlers/commands/sysop-commands.handler');
    const s = socket();

    await handleCallersLogNodeInput(s, { tempData: {} } as any, '');

    expect(s.out.join('')).not.toContain('Not a valid node!');
  });
});
