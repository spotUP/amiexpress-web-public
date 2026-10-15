/**
 * The BBSLink wall finds its credentials.
 *
 * It read `process.cwd() + Doors/bbslink/bbslink.cfg` and three BBSLINK_*
 * environment variables. The backend's cwd on the board is /app/web/backend,
 * so that path named a file that has never existed, and nothing sets those
 * variables - so every launch died on "syscode missing from bbslink.cfg" with
 * the real file sitting in the BBS data directory the whole time.
 *
 * The wall and the BBSLINK door share one BBSLink account, so the codes are
 * found wherever the sysop put them: the shared cfg, BBSLINK's own settings,
 * or the wall's.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadConfig, applyConfigText, defaultConfig } from '../../../../Doors/bbslinkwall/config';

const WALL_MANIFEST = fs.readFileSync(
  path.join(__dirname, '../../../../Doors/bbslinkwall/door.settings.json'), 'utf8');
const BBSLINK_MANIFEST = fs.readFileSync(
  path.join(__dirname, '../../../../Doors/bbslink/door.settings.json'), 'utf8');

describe('the BBSLink wall configuration', () => {
  let doorsDir: string;
  let wallDir: string;
  let wallDist: string;
  let bbslinkDir: string;

  beforeEach(() => {
    doorsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wall-'));
    wallDir = path.join(doorsDir, 'bbslinkwall');
    wallDist = path.join(wallDir, 'dist');
    bbslinkDir = path.join(doorsDir, 'bbslink');
    fs.mkdirSync(wallDist, { recursive: true });
    fs.mkdirSync(bbslinkDir);
    fs.writeFileSync(path.join(wallDir, 'door.settings.json'), WALL_MANIFEST);
    fs.writeFileSync(path.join(bbslinkDir, 'door.settings.json'), BBSLINK_MANIFEST);
  });

  afterEach(() => fs.rmSync(doorsDir, { recursive: true, force: true }));

  const writeSharedCfg = (text: string) =>
    fs.writeFileSync(path.join(bbslinkDir, 'bbslink.cfg'), text);
  const writeValues = (dir: string, values: unknown) =>
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(values));

  it('reads the shared bbslink.cfg from the dist directory a board runs it from', () => {
    writeSharedCfg('SYSCODE=uprough\nAUTHCODE=from-the-file\nSCHEMECODE=scheme\nTIMEOUT=5\n');

    const config = loadConfig(wallDist);

    expect(config.syscode).toBe('uprough');
    expect(config.authcode).toBe('from-the-file');
    expect(config.timeout).toBe(5);
  });

  it('takes the codes the sysop set on the BBSLINK door, one account for both', () => {
    writeValues(bbslinkDir, { syscode: 'from-bbslink', authcode: 'a', schemecode: 's' });

    const config = loadConfig(wallDist);

    expect(config.syscode).toBe('from-bbslink');
    expect(config.authcode).toBe('a');
  });

  it('lets the wall have its own account when a board wants one', () => {
    writeValues(bbslinkDir, { syscode: 'from-bbslink' });
    writeValues(wallDir, { syscode: 'wall-only' });

    expect(loadConfig(wallDist).syscode).toBe('wall-only');
  });

  it('does not let a declared default overwrite the shared file', () => {
    writeSharedCfg('SYSCODE=uprough\nTIMEOUT=5\n');
    writeValues(bbslinkDir, { syscode: 'uprough' });

    expect(loadConfig(wallDist).timeout).toBe(5);
  });

  it('runs on the defaults when a board has set nothing at all', () => {
    const config = loadConfig(wallDist);

    expect(config).toMatchObject({ serverHost: 'games.bbslink.net', httpPort: 80, timeout: 10 });
    expect(config.syscode).toBe('');
  });

  it('reads the fixed fields out of the shared file', () => {
    const config = defaultConfig();
    applyConfigText('SERVERHOST=wall.example.net\nHTTPPORT=8080\n', config);

    expect(config).toMatchObject({ serverHost: 'wall.example.net', httpPort: 8080 });
  });
});
