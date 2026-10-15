/**
 * BBSLink reads its configuration from the door's own directory, not from
 * wherever the module happened to be loaded (Doors/bbslink/config.ts).
 *
 * The door resolved bbslink.cfg with `path.resolve(__dirname, 'bbslink.cfg')`.
 * In development the backend imports the door's `index.ts`, so __dirname is
 * Doors/bbslink and the file is found; in production it imports
 * `dist/index.js` (door.handler.ts), so __dirname is Doors/bbslink/dist, the
 * file is not there, and every launch died on
 * "syscode/authcode/schemecode missing from bbslink.cfg" - with the credentials
 * sitting one directory up the whole time.
 *
 * The same split is why a door's settings have to be resolved rather than
 * assumed: the admin writes Doors/<door>/settings.json, and the door has to
 * find it from both places.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadConfig, applyConfigText, defaultConfig } from '../../../../Doors/bbslink/config';

const MANIFEST = fs.readFileSync(
  path.join(__dirname, '../../../../Doors/bbslink/door.settings.json'),
  'utf8',
);

const CFG = [
  'TIMEOUT=5',
  'SYSCODE=uprough',
  'AUTHCODE=from-the-file',
  'SCHEMECODE=scheme-from-the-file',
  'DOORCODE=MENU',
  'lord=lord',
].join('\n');

describe('BBSLink configuration', () => {
  let doorDir: string;
  let distDir: string;

  const writeValues = (values: unknown) =>
    fs.writeFileSync(path.join(doorDir, 'settings.json'), JSON.stringify(values));

  beforeEach(() => {
    doorDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbslink-'));
    distDir = path.join(doorDir, 'dist');
    fs.mkdirSync(distDir);
    fs.writeFileSync(path.join(doorDir, 'bbslink.cfg'), CFG);
    fs.writeFileSync(path.join(doorDir, 'door.settings.json'), MANIFEST);
  });

  afterEach(() => fs.rmSync(doorDir, { recursive: true, force: true }));

  it('finds bbslink.cfg from the dist directory a production board runs it from', () => {
    const config = loadConfig(distDir);

    expect(config.syscode).toBe('uprough');
    expect(config.authcode).toBe('from-the-file');
    expect(config.schemecode).toBe('scheme-from-the-file');
  });

  it('lets what the sysop set in the admin win over the file', () => {
    writeValues({ syscode: 'from-the-admin', telnetPort: 2323 });

    const config = loadConfig(distDir);

    expect(config.syscode).toBe('from-the-admin');
    expect(config.telnetPort).toBe(2323);
  });

  it('does not let a declared default overwrite what the file set', () => {
    // The manifest declares timeout 10; bbslink.cfg says 5 and the sysop has
    // set nothing. The file has to win, or migrating a board to the admin
    // silently changes settings nobody touched.
    writeValues({ syscode: 'from-the-admin' });

    expect(loadConfig(distDir).timeout).toBe(5);
  });

  it('keeps taking per-game door codes from the file, which no manifest can declare', () => {
    expect(loadConfig(distDir, 'LORD').doorcode).toBe('lord');
  });

  it('runs on a board with no bbslink.cfg at all, on the admin alone', () => {
    fs.rmSync(path.join(doorDir, 'bbslink.cfg'));
    writeValues({ syscode: 's', authcode: 'a', schemecode: 'c' });

    const config = loadConfig(distDir);

    expect(config.syscode).toBe('s');
    expect(config.serverHost).toBe('games.bbslink.net');
  });

  it('reads the game codes and the fixed fields out of one file', () => {
    const config = defaultConfig();
    applyConfigText(CFG, config, 'LORD');

    expect(config).toMatchObject({ timeout: 5, syscode: 'uprough', doorcode: 'lord' });
  });
});
