/**
 * What the editor shows must be what the editor writes back.
 *
 * The GET had a private parser that skipped valueless tooltypes,
 * parenthesised ones and empty values. The PUT read the file with the REAL
 * parser and then replaced the whole tooltype array with the rows the editor
 * had sent - so everything the editor could not see was deleted on save. On
 * this board that is 795 of 1,190 .info files losing tooltypes on any save.
 *
 * The round trip is the contract: GET a file, PUT the same array straight
 * back, and the file's tooltypes must be unchanged.
 */

process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import request from 'supertest';
import { infoEditorRouter } from '../../src/api/info-editor-routes';
import { parseInfoFile } from '../../src/utils/info-file.util';
import { config as appConfig } from '../../src/config';

/** A real binary icon: DiskObject, tooltype array, then the image bytes. */
function binaryIcon(tooltypes: string[]): Buffer {
  const diskObject = Buffer.alloc(78);
  diskObject.writeUInt16BE(0xe310, 0);
  diskObject.writeUInt16BE(1, 2);
  diskObject.writeUInt16BE(24, 12);
  diskObject.writeUInt16BE(22, 14);

  const entries: Buffer[] = [];
  for (const entry of tooltypes) {
    const str = Buffer.from(entry + '\0', 'latin1');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(str.length, 0);
    entries.push(len, str);
  }
  const count = Buffer.alloc(4);
  count.writeUInt32BE((tooltypes.length + 1) * 4, 0);

  return Buffer.concat([diskObject, count, ...entries, Buffer.from('IMAGE-BYTES')]);
}

/** Every tooltype in the file, rendered the way it is stored. */
function onDisk(filePath: string): string[] {
  return parseInfoFile(filePath).tooltypes.map(tt => tt.originalLine);
}

describe('the .info editor round trip', () => {
  let app: express.Application;
  let root: string;
  let previousDataDir: string;

  /** The shapes the old GET could not see, each one a real file's content. */
  const CONTENT = [
    'NAME=dRE!WAll v2.0',      // ordinary
    'MULTINODE',               // valueless: skipped, then deleted
    '(ACS.DOWNLOAD)',          // parenthesised: skipped, then deleted
    '!STACK=8192',             // bang-commented
    'BANNER=',                 // empty value: skipped, then deleted
    '#RESIDENT=1',             // Amiga prefix character
  ];

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/info', infoEditorRouter);
  });

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'info-editor-'));
    previousDataDir = appConfig.get('dataDir');
    appConfig.set('dataDir', root);
    fs.mkdirSync(path.join(root, 'Commands', 'BBSCmd'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Commands', 'BBSCmd', 'wall.info'), binaryIcon(CONTENT));
  });

  afterEach(() => {
    appConfig.set('dataDir', previousDataDir);
    fs.rmSync(root, { recursive: true, force: true });
  });

  const REL = 'Commands/BBSCmd/wall.info';
  const FILE = () => path.join(root, REL);

  it('shows every tooltype the file holds, not only the ones with values', async () => {
    const res = await request(app).get(`/api/info/file?path=${REL}`);

    expect(res.status).toBe(200);
    const keys = res.body.data.tooltypes.map((t: { key: string }) => t.key);
    expect(keys).toEqual(['NAME', 'MULTINODE', 'ACS.DOWNLOAD', 'STACK', 'BANNER', 'RESIDENT']);
  });

  it('leaves the file unchanged when the editor sends back what it was given', async () => {
    const before = onDisk(FILE());

    const got = await request(app).get(`/api/info/file?path=${REL}`);
    const put = await request(app)
      .put('/api/info/file')
      .send({ path: REL, tooltypes: got.body.data.tooltypes });

    expect(put.status).toBe(200);
    expect(onDisk(FILE())).toEqual(before);
  });

  it('keeps the icon image through a save', async () => {
    const got = await request(app).get(`/api/info/file?path=${REL}`);
    await request(app)
      .put('/api/info/file')
      .send({ path: REL, tooltypes: got.body.data.tooltypes });

    expect(fs.readFileSync(FILE()).includes(Buffer.from('IMAGE-BYTES'))).toBe(true);
  });

  it('keeps a disabled tooltype in the syntax the file used', async () => {
    // express.e reads the PARENTHESISED form; rewriting it as !NAME would
    // change what the BBS sees.
    const got = await request(app).get(`/api/info/file?path=${REL}`);
    await request(app)
      .put('/api/info/file')
      .send({ path: REL, tooltypes: got.body.data.tooltypes });

    expect(onDisk(FILE())).toContain('(ACS.DOWNLOAD)');
    expect(onDisk(FILE())).toContain('!STACK=8192');
  });

  it('drops the blank row the Add Tooltype button starts with', async () => {
    // One empty row used to write the entry "=", after which the file stopped
    // parsing and every later save fell through to the sidecar.
    const got = await request(app).get(`/api/info/file?path=${REL}`);
    const withBlank = [
      ...got.body.data.tooltypes,
      { key: '', value: '', commented: false, originalLine: '' },
    ];

    const put = await request(app).put('/api/info/file').send({ path: REL, tooltypes: withBlank });

    expect(put.status).toBe(200);
    expect(onDisk(FILE())).not.toContain('=');

    // The entry is written as a length-prefixed "=\0". Nothing reads it, the
    // tooltype-array scanner rejects it as an entry, and it sits in the
    // sysop's icon forever.
    const BLANK_ENTRY = Buffer.from([0x00, 0x00, 0x00, 0x02, 0x3d, 0x00]);
    expect(fs.readFileSync(FILE()).includes(BLANK_ENTRY)).toBe(false);
    expect(parseInfoFile(FILE()).isBinary).toBe(true);

    const second = await request(app)
      .put('/api/info/file')
      .send({ path: REL, tooltypes: [{ key: 'NAME', value: 'still here', commented: false }] });
    expect(second.status).toBe(200);
  });

  it('reports a failure as a failure and leaves the file alone', async () => {
    // A file whose tooltype array cannot be located is read heuristically and
    // cannot be re-serialised. That used to write a `.tooltypes.txt` sidecar
    // nothing reads and reply "saved successfully".
    const opaque = path.join(root, 'Commands', 'BBSCmd', 'broken.info');
    const bytes = Buffer.concat([
      Buffer.from([0xe3, 0x10, 0x00, 0x01]),
      Buffer.alloc(200),
      Buffer.from([0xff, 0xfe, 0xfd]),
      Buffer.from('SOMETHING=here\0', 'latin1'),
    ]);
    fs.writeFileSync(opaque, bytes);

    const res = await request(app)
      .put('/api/info/file')
      .send({ path: 'Commands/BBSCmd/broken.info', tooltypes: [{ key: 'A', value: 'b', commented: false }] });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(fs.readFileSync(opaque).equals(bytes)).toBe(true);
    expect(fs.existsSync(opaque + '.tooltypes.txt')).toBe(false);
  });
  it('finds a command whose file is not spelled the way the caller asked', async () => {
    // 63 of the 155 files in Commands/BBSCmd are lower or mixed case. The GET
    // tested existence case-insensitively and then read case-sensitively, so
    // this worked on macOS and never on the Linux container.
    const res = await request(app).get('/api/info/file?path=Commands/BBSCmd/WALL.info');

    expect(res.status).toBe(200);
    expect(res.body.data.tooltypes.map((t: { key: string }) => t.key)).toContain('NAME');
  });

  it('writes to that same file rather than reporting it missing', async () => {
    const got = await request(app).get('/api/info/file?path=Commands/BBSCmd/WALL.info');
    const put = await request(app)
      .put('/api/info/file')
      .send({ path: 'Commands/BBSCmd/WALL.info', tooltypes: got.body.data.tooltypes });

    expect(put.status).toBe(200);
    // No second file under the caller's spelling. macOS resolves the case in
    // the filesystem and cannot fail this; the Linux container can, which is
    // where the bug lived.
    const dir = path.join(root, 'Commands', 'BBSCmd');
    expect(fs.readdirSync(dir).filter(f => f.endsWith('.info'))).toEqual(['wall.info']);
  });
});
