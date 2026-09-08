/**
 * A 68K/C door cannot read settings.json - it reads a plain `Key=value` file
 * beside its binary. Without a bridge, the admin door-settings form and the
 * door never meet: REQUESTS shipped configurable in the UI and still printed
 * "This door has no REQUESTS.cfg beside it" on the live board (2026-09-08).
 *
 * So a manifest may declare `cfgFile`, and each setting a `cfgKey`, and the
 * values are rendered to that file on save and at startup.
 */

process.env.SKIP_DB_INIT = 'true';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  writeDoorSettings,
  renderDoorCfg,
  renderAllDoorCfgs,
  MANIFEST_FILE,
} from '../../src/doors/door-settings.service';

function manifest(extra: Record<string, unknown> = {}) {
  return {
    command: 'REQUESTS',
    cfgFile: 'REQUESTS.cfg',
    settings: [
      { key: 'host', cfgKey: 'Host', label: 'Host', type: 'string', default: 'doors.uprough.net' },
      { key: 'port', cfgKey: 'Port', label: 'Port', type: 'number', default: 80 },
      { key: 'boardKey', cfgKey: 'BoardKey', label: 'Board key', type: 'string', secret: true, default: '' },
    ],
    ...extra,
  };
}

function cfgLines(doorDir: string): string[] {
  return fs
    .readFileSync(path.join(doorDir, 'REQUESTS.cfg'), 'utf8')
    .split('\n')
    .filter(Boolean);
}

describe('door cfg rendering - the bridge to a 68K door', () => {
  let root: string;
  let doorDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'doorcfg-'));
    doorDir = path.join(root, 'REQUESTS');
    fs.mkdirSync(doorDir, { recursive: true });
    fs.writeFileSync(path.join(doorDir, MANIFEST_FILE), JSON.stringify(manifest()));
  });

  afterEach(() => {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  });

  it('writes the cfg when settings are saved in the admin', () => {
    writeDoorSettings(doorDir, { host: 'doors.uprough.net', port: 80, boardKey: 'up.s3cret' });

    const lines = cfgLines(doorDir);
    expect(lines).toContain('Host=doors.uprough.net');
    expect(lines).toContain('Port=80');
    expect(lines).toContain('BoardKey=up.s3cret');
  });

  it('falls back to declared defaults so a fresh install is already configured', () => {
    // Nothing saved at all - the door must still get its Host and Port.
    const written = renderDoorCfg(doorDir);
    expect(written).not.toBeNull();

    const lines = cfgLines(doorDir);
    expect(lines).toContain('Host=doors.uprough.net');
    expect(lines).toContain('Port=80');
    expect(lines).toContain('BoardKey=');
  });

  it('keeps a stored secret when the form submits it blank', () => {
    writeDoorSettings(doorDir, { boardKey: 'up.s3cret' });
    // The admin form never echoes a secret back; a blank means "unchanged".
    writeDoorSettings(doorDir, { boardKey: '' });

    expect(cfgLines(doorDir)).toContain('BoardKey=up.s3cret');
  });

  it('writes the cfg 0600 - it carries the board secret', () => {
    writeDoorSettings(doorDir, { boardKey: 'up.s3cret' });
    const mode = fs.statSync(path.join(doorDir, 'REQUESTS.cfg')).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('does nothing for a door that declares no cfgFile', () => {
    const plain = path.join(root, 'PLAIN');
    fs.mkdirSync(plain);
    const m = manifest();
    delete (m as any).cfgFile;
    fs.writeFileSync(path.join(plain, MANIFEST_FILE), JSON.stringify(m));

    expect(renderDoorCfg(plain)).toBeNull();
    expect(fs.existsSync(path.join(plain, 'REQUESTS.cfg'))).toBe(false);
  });

  it('renderAllDoorCfgs sweeps every installed door at startup', () => {
    const second = path.join(root, 'OTHER');
    fs.mkdirSync(second);
    fs.writeFileSync(path.join(second, MANIFEST_FILE), JSON.stringify(manifest()));
    // A directory with no manifest at all must be skipped, not throw.
    fs.mkdirSync(path.join(root, 'NOTADOOR'));

    expect(renderAllDoorCfgs(root)).toBe(2);
    expect(fs.existsSync(path.join(doorDir, 'REQUESTS.cfg'))).toBe(true);
    expect(fs.existsSync(path.join(second, 'REQUESTS.cfg'))).toBe(true);
  });

  it('the shipped REQUESTS manifest renders the keys the C door parses', () => {
    // Guards the real file: achieve.c-style loaders read exactly these names.
    const shipped = path.join(__dirname, '..', '..', '..', '..', 'Doors', 'REQUESTS', MANIFEST_FILE);
    const parsed = JSON.parse(fs.readFileSync(shipped, 'utf8'));
    const keys = parsed.settings.map((s: any) => s.cfgKey);
    expect(parsed.cfgFile).toBe('REQUESTS.cfg');
    expect(keys).toEqual(expect.arrayContaining(['Host', 'Port', 'BoardKey', 'Timeout']));
  });
});
