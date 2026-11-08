/**
 * The web board runs LIVECHAT68 in its 68K emulator, whose AmiSSL bridge is
 * untrusted: it must resolve to Tls=0, AllowPlainHttp=1, Port=80 (recorded
 * exemption, WEB_BOARD_DOOR_OVERRIDES), while the door's own defaults stay
 * Tls=1 / Port=443 for a real Amiga. Booleans must render as 1/0 (atoi).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { renderDoorCfg } from '../../src/doors/door-settings.service';

const repoDoor = path.resolve(__dirname, '..', '..', '..', '..', 'board', 'Doors', 'LIVECHAT68');

function stage(name: string, stored?: Record<string, unknown>): string {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lc68-')), name);
  fs.mkdirSync(dir);
  fs.copyFileSync(path.join(repoDoor, 'door.settings.json'), path.join(dir, 'door.settings.json'));
  if (stored) fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(stored));
  return dir;
}

function cfgOf(dir: string): string {
  renderDoorCfg(dir);
  return fs.readFileSync(path.join(dir, 'LIVECHAT.cfg'), 'utf8');
}

describe('LIVECHAT68 plain-HTTP exemption', () => {
  it('web board resolves to Tls=0, AllowPlainHttp=1, Port=80, even over stale stored TLS values', () => {
    const cfg = cfgOf(stage('LIVECHAT68', { tls: true, port: 443, allowPlainHttp: false }));
    expect(cfg).toMatch(/^Tls=0$/m);
    expect(cfg).toMatch(/^AllowPlainHttp=1$/m);
    expect(cfg).toMatch(/^Port=80$/m);
  });

  it('any other directory keeps the door defaults (TLS on, 443)', () => {
    const cfg = cfgOf(stage('SOMEOTHER'));
    expect(cfg).toMatch(/^Tls=1$/m);
    expect(cfg).toMatch(/^AllowPlainHttp=0$/m);
    expect(cfg).toMatch(/^Port=443$/m);
  });
});
