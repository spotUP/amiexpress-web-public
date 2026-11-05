/**
 * An upload belongs to the conference it was sent to - whatever the SQL
 * mirror knows.
 *
 * `file_areas` on this board is seed data: four demo rows ("General Files",
 * `/files/general`) covering conferences 1 and 2 of fourteen, with paths
 * that exist nowhere. Everything downstream took `areas[0]`, so an FTP
 * caller in conference 3 and up was refused outright - "Cant upload here" -
 * while the same file uploaded at the menu was accepted; and one in
 * conference 1 was filed against a fictional area, saved only by the mover
 * falling back to `<conf>/Files`.
 *
 * The board itself knows where files go: `DLPATH.1` in `Conf<n>.info`
 * (express.e:15264), the same directory the download side reads. These pin
 * that the icon decides, that the mirror is filled in from it rather than
 * consulted, and that an FTP upload is described by its own FILE_ID.DIZ.
 */
process.env.SKIP_DB_INIT = '1';

import fs from 'fs';
import os from 'os';
import path from 'path';
import { parseInfoFile, writeInfoFile, updateTooltype } from '../../src/utils/info-file.util';
import { destinationFor } from '../../src/services/upload-filing.service';

const REPO = path.resolve(__dirname, '../../../..');

/** A board whose Conf7 says, in its own icon, where its files live. */
function boardWithConference(n: number, dlPath?: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftp-area-'));
  fs.mkdirSync(path.join(root, `Conf${n}`, 'Files'), { recursive: true });
  if (dlPath) {
    fs.mkdirSync(path.resolve(root, dlPath), { recursive: true });
    const icon = path.join(root, `Conf${n}.info`);
    fs.copyFileSync(path.join(REPO, 'board', 'Conf1.info'), icon);
    writeInfoFile(updateTooltype(parseInfoFile(icon), `DLPATH.1`, dlPath, false));
  }
  return root;
}

describe('where an upload lands', () => {
  it("is the conference's own DLPATH when the area has none", () => {
    const root = boardWithConference(7, 'Conf7/Uploads');
    expect(destinationFor(undefined, 7, root)).toBe(path.join(root, 'Conf7/Uploads'));
    expect(destinationFor(null, 7, root)).toBe(path.join(root, 'Conf7/Uploads'));
    expect(destinationFor({}, 7, root)).toBe(path.join(root, 'Conf7/Uploads'));
  });

  it("is the area's own dlPath when the sysop configured one", () => {
    const root = boardWithConference(7, 'Conf7/Uploads');
    expect(destinationFor({ dlPath: '/somewhere/else' }, 7, root)).toBe('/somewhere/else');
    // The seeded rows carry the process directory as a placeholder; that is
    // not a configured path and must not win over the board's own.
    expect(destinationFor({ dlPath: process.cwd() }, 7, root)).toBe(path.join(root, 'Conf7/Uploads'));
    expect(destinationFor({ dlPath: '   ' }, 7, root)).toBe(path.join(root, 'Conf7/Uploads'));
  });

  it('is undefined when the conference has no icon at all, so the mover falls back', () => {
    const root = boardWithConference(9);
    expect(destinationFor(undefined, 9, root)).toBeUndefined();
  });
});

describe('the FTP upload gate', () => {
  // The guard points the board's dataDir at a fixture per run, so this is
  // the real refuseUpload against a real board - not a grep of its source.
  const boardRoot = () => require('../../src/config').config.get('dataDir') as string;

  function conferenceWithFiles(n: number, dlPath: string): void {
    const root = boardRoot();
    fs.mkdirSync(path.resolve(root, dlPath), { recursive: true });
    const icon = path.join(root, `Conf${n}.info`);
    fs.copyFileSync(path.join(REPO, 'board', 'Conf1.info'), icon);
    writeInfoFile(updateTooltype(parseInfoFile(icon), 'DLPATH.1', dlPath, false));
  }

  it('lets a caller upload into a conference the SQL mirror has never heard of', async () => {
    conferenceWithFiles(11, 'Conf11/Files');
    const { boardFtpDeps } = require('../../src/ftp/ftp-auth');
    const refusal = await boardFtpDeps().refuseUpload!(
      { id: 'u', username: 'Knut' } as never, 11, 'DEMO.LHA'
    );
    // file_areas has no row for conference 11 - and that is not a reason.
    expect(refusal).toBeFalsy();
  });

  it('refuses when the conference has nowhere to put a file', async () => {
    // A conference number this board has no icon and no directory for: no
    // DLPATH, no Files/, nowhere for the bytes to go.
    const root = boardRoot();
    fs.rmSync(path.join(root, 'Conf37.info'), { force: true });
    fs.rmSync(path.join(root, 'Conf37'), { recursive: true, force: true });
    const { boardFtpDeps } = require('../../src/ftp/ftp-auth');
    const refusal = await boardFtpDeps().refuseUpload!(
      { id: 'u', username: 'Knut' } as never, 37, 'DEMO.LHA'
    );
    expect(refusal).toMatchObject({ code: 550, text: 'Cant upload here' });
  });

  it('still refuses a name the board would not accept', async () => {
    conferenceWithFiles(12, 'Conf12/Files');
    const { boardFtpDeps } = require('../../src/ftp/ftp-auth');
    const refusal = await boardFtpDeps().refuseUpload!(
      { id: 'u', username: 'Knut' } as never, 12, 'a name with spaces.lha'
    );
    expect(refusal).toMatchObject({ code: 553 });
  });

  /*
   * REWRITTEN 2026-09-16. This used to slice `ftp-auth.ts` from the string
   * "async acceptUpload" and assert four regexes over the text after it. It
   * breaks on a rename, it passes on code that never runs, and - the part
   * that matters - `areas[0]` returning somewhere wrong would still satisfy
   * "the source does not contain areas[0]" if it were spelled another way.
   *
   * `boardFtpDeps()` hands out the real `acceptUpload`, so the test calls it
   * with the collaborators stubbed and reads what it decided: the description
   * it filed, and the area it filed against.
   */
  const acceptAnUpload = async (opts: { diz: string[] | null; tagline?: { text: string; use: number }; user?: Record<string, unknown>; outcome?: Record<string, unknown> }) => {
    jest.resetModules();

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftp-accept-'));
    const filed: Array<Record<string, unknown>> = [];
    const areaAsked: number[] = [];
    const THE_CONFERENCE_AREA = { id: 77, name: 'Conference 7 Files', path: 'Conf7/Uploads' };

    // File Description as the board's EXAMINE door, with its tag data: one
    // 102-byte record per slot, tagline at 0, Use Tagline at byte 81.
    if (opts.tagline) {
      const door = path.join(root, 'Doors', 'FileDescription');
      fs.mkdirSync(door, { recursive: true });
      fs.writeFileSync(path.join(door, 'FileDescription.x'), 'x');
      const tagdata = Buffer.alloc(102 * 3);
      tagdata.write(opts.tagline.text, 102 * 1, 'latin1'); // slot 2
      tagdata[102 * 1 + 81] = opts.tagline.use;
      fs.writeFileSync(path.join(door, 'FileDescription.Tagdata'), tagdata);
    }
    jest.doMock('../../src/handlers/command-execution.handler', () => ({
      commandCache: {
        syscmd: new Map(opts.tagline ? [['EXAMINE', { location: 'DOORS:FileDescription/FileDescription.x' }]] : []),
      },
    }));

    jest.doMock('../../src/utils/file-diz.util', () => ({
      extractAndReadDiz: jest.fn(async () => opts.diz),
    }));
    jest.doMock('../../src/utils/file-test.util', () => ({
      testFile: jest.fn(async () => 'SUCCESS'),
      TestResult: { SUCCESS: 'SUCCESS', FAILURE: 'FAILURE', NONE: 'NONE' },
    }));
    jest.doMock('../../src/services/upload-filing.service', () => ({
      ...jest.requireActual('../../src/services/upload-filing.service'),
      areaForConference: jest.fn(async (conferenceId: number) => {
        areaAsked.push(conferenceId);
        return THE_CONFERENCE_AREA;
      }),
      fileUploadedFile: jest.fn(async (payload: Record<string, unknown>) => {
        filed.push(payload);
        return { orphaned: false, notices: [], status: 'active', duplicate: false, ...opts.outcome };
      }),
    }));
    jest.doMock('../../src/database', () => ({
      db: {
        getConfigRepository: () => ({ getNodeConfig: () => ({ sentby_files: true }) }),
        getUserById: async () => ({ slotNumber: 2 }),
      },
    }));
    jest.doMock('../../src/config', () => ({
      config: { get: (key: string) => (key === 'dataDir' ? root : undefined) },
    }));

    const { boardFtpDeps } = require('../../src/ftp/ftp-auth');
    const { Readable } = require('stream');

    await boardFtpDeps().acceptUpload(
      {
        filename: 'ARTPACK.LHA',
        nodeId: 1,
        conferenceId: 7,
        user: opts.user ?? { username: 'Knut' },
      },
      Readable.from([Buffer.from('payload')]),
    );

    return { filed: filed[0], areaAsked, area: THE_CONFERENCE_AREA };
  };

  it('describes the file by its own FILE_ID.DIZ, as a menu upload does', async () => {
    const { filed } = await acceptAnUpload({ diz: ['ARTPACK #7', 'twelve screens'] });
    expect(filed.description).toBe('ARTPACK #7\ntwelve screens');
  });

  // A deliberate deviation (sysop, 2026-09-30): FTP cannot answer File
  // Description's prompts, so the door is not run - but the line it would
  // have added, the uploader's own tagline, is.
  it('adds the uploader\'s File Description tagline under the FILE_ID', async () => {
    const { filed } = await acceptAnUpload({ diz: ['ARTPACK #7'], tagline: { text: '/// //// KNUT', use: 1 } });
    expect(filed.description).toBe('ARTPACK #7\n/// //// KNUT');
  });

  it('leaves the tagline off when the uploader set Use Tagline to No', async () => {
    const { filed } = await acceptAnUpload({ diz: ['ARTPACK #7'], tagline: { text: '/// //// KNUT', use: 0 } });
    expect(filed.description).toBe('ARTPACK #7');
  });

  it('keeps the placeholder when the archive carries no DIZ', async () => {
    // An FTP caller has no prompt to type a description at, so the fallback
    // has to say something rather than nothing.
    const { filed } = await acceptAnUpload({ diz: null });
    expect(filed.description).toBe('Uploaded over FTP by Knut');
  });

  it('files it against the conference it was sent to, never the first area', async () => {
    const { filed, areaAsked, area } = await acceptAnUpload({ diz: null });
    expect(areaAsked).toEqual([7]);
    expect(filed.fileArea).toEqual(area);
    expect(filed.conferenceId).toBe(7);
  });

  // express.e:19684-19686: an FTP upload is background-checked
  // (ftpStartFileCheck, 15205), and each checked file raises today's limit.
  it('an upload raises what the caller may download today', async () => {
    const user = { username: 'Knut', secLevel: 20, byteLimit: 1_000_000, todaysBytesLimit: 3_000_000 };
    await acceptAnUpload({ diz: null, user });
    expect(user.todaysBytesLimit).toBe(3_000_000 + Buffer.byteLength('payload'));
  });

  it('an upload leaves an unlimited caller unlimited', async () => {
    const user = { username: 'Knut', secLevel: 20, byteLimit: 0, todaysBytesLimit: 0 };
    await acceptAnUpload({ diz: null, user });
    expect(user.todaysBytesLimit).toBe(0);
  });

  // express.e:19626-19630 / 19676-19681 (doBackgroundCheck, FTP's path): a
  // clean file counts one upload and its bytes; a held one counts neither.
  it("an FTP upload counts toward the caller's uploads and bytes uploaded", async () => {
    const user = { username: 'Knut', secLevel: 20, uploads: 2, bytesUpload: 100, byteLimit: 0 };
    await acceptAnUpload({ diz: null, user });
    expect(user.uploads).toBe(3);
    expect(user.bytesUpload).toBe(100 + Buffer.byteLength('payload'));
  });

  it('a held FTP upload counts nothing but still raises today\'s limit', async () => {
    const user = { username: 'Knut', secLevel: 20, uploads: 2, bytesUpload: 100, byteLimit: 1_000, todaysBytesLimit: 1_000 };
    await acceptAnUpload({ diz: null, user, outcome: { status: 'hold' } });
    expect(user.uploads).toBe(2);
    expect(user.bytesUpload).toBe(100);
    expect(user.todaysBytesLimit).toBe(1_000 + Buffer.byteLength('payload'));
  });
});
