/**
 * LiveChat runs on what the sysop set, and on its own defaults when they set
 * nothing (Doors/livechat/settings.ts).
 *
 * Every knob the manifest declares has to reach something: the default channel
 * is the one users are auto-joined to, the one the door creates on an empty
 * board and the one they may not leave; the sidebar width and the reconnect
 * limit are read where server.ts used to hold a literal; sound effects switch
 * the AudioService off for the whole board.
 *
 * The manifest is read here as well, so a key renamed in one file and not the
 * other fails a test rather than becoming a setting that does nothing.
 */

import * as fs from 'fs';
import * as path from 'path';
import { applySettings, DEFAULT_SETTINGS } from '../../../../Doors/livechat/settings';

const DOOR_DIR = path.join(__dirname, '../../../../Doors/livechat');
const manifest = JSON.parse(fs.readFileSync(path.join(DOOR_DIR, 'door.settings.json'), 'utf8'));

describe('LiveChat settings', () => {
  it('declares exactly the keys the door reads', () => {
    const declared = manifest.settings.map((s: { key: string }) => s.key).sort();

    expect(declared).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  });

  it('declares the door as the command the board registered', () => {
    expect(manifest.command).toBe('LIVECHAT');
  });

  it('ships defaults that match what the door ran with before it declared any', () => {
    const fromManifest = Object.fromEntries(
      manifest.settings.map((s: { key: string; default: unknown }) => [s.key, s.default]),
    );

    expect(fromManifest).toEqual(DEFAULT_SETTINGS);
  });

  it('runs on the shipped defaults when the sysop has set nothing', () => {
    expect(applySettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('takes the sysop values', () => {
    expect(applySettings({
      defaultChannel: 'uprough',
      soundEffects: false,
      sidebarWidth: 22,
      reconnectAttempts: 7,
    })).toEqual({
      defaultChannel: 'uprough',
      soundEffects: false,
      sidebarWidth: 22,
      reconnectAttempts: 7,
    });
  });

  it('refuses a sidebar width that would leave no room for the channel list', () => {
    expect(applySettings({ sidebarWidth: 0 }).sidebarWidth).toBe(8);
    expect(applySettings({ sidebarWidth: 900 }).sidebarWidth).toBe(40);
  });

  it('keeps at least one reconnect attempt, and not nine hundred', () => {
    expect(applySettings({ reconnectAttempts: 0 }).reconnectAttempts).toBe(1);
    expect(applySettings({ reconnectAttempts: 900 }).reconnectAttempts).toBe(10);
  });

  it('falls back to general when the channel name is blank', () => {
    expect(applySettings({ defaultChannel: '   ' }).defaultChannel).toBe('general');
  });
});
