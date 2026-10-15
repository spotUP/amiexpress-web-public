/**
 * The telnet door reads the file it tells the sysop to create.
 *
 * Its empty menu says "Create Doors/telnet/telnetdoor.cfg", and it looked for
 * that file at process.cwd() + Doors/telnet/telnetdoor.cfg. The backend's cwd
 * on the board is /app/web/backend, so the path named something that has never
 * existed: a sysop who followed the instruction exactly still got the empty
 * menu, with no error to explain it.
 *
 * Third door with this shape today - BBSLink read its credentials from
 * __dirname (which is dist/ in production) and the BBSLink wall from cwd. The
 * SDK's resolveDoorRoot is the one answer to "where is this door's own
 * directory", from either.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadConfig } from '../../../../Doors/telnet/config';

const CFG = [
  '[Uprough]',
  'SERVERHOST=bbs.uprough.net',
  'TELNETPORT=2323',
  '',
  '[Another]',
  'SERVERHOST=bbs.example.org',
].join('\n');

describe('the telnet door configuration', () => {
  let doorDir: string;
  let distDir: string;

  beforeEach(() => {
    doorDir = fs.mkdtempSync(path.join(os.tmpdir(), 'telnet-door-'));
    distDir = path.join(doorDir, 'dist');
    fs.mkdirSync(distDir);
    fs.writeFileSync(path.join(doorDir, 'package.json'), '{"name":"telnet-door"}');
  });

  afterEach(() => fs.rmSync(doorDir, { recursive: true, force: true }));

  it('reads telnetdoor.cfg from the door directory when it runs from dist', () => {
    fs.writeFileSync(path.join(doorDir, 'telnetdoor.cfg'), CFG);

    const configs = loadConfig(distDir);

    expect(configs.map(c => `${c.serverHost}:${c.telnetPort}`)).toEqual([
      'bbs.uprough.net:2323',
      'bbs.example.org:23',
    ]);
  });

  it('reads it from the door directory in development too', () => {
    fs.writeFileSync(path.join(doorDir, 'telnetdoor.cfg'), CFG);

    expect(loadConfig(doorDir)).toHaveLength(2);
  });

  it('offers an empty menu, not a crash, when the sysop has written no file', () => {
    expect(loadConfig(distDir)).toEqual([]);
  });
});
