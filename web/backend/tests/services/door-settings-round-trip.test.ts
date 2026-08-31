/**
 * A door declares its settings; the sysop's values reach the door.
 *
 * The admin could edit six fields and a raw tooltype list per door, and the
 * only door that ever looked configurable was GWall - because a page had been
 * written by hand for it. This is the path that replaces that: declaration in
 * the door's own door.settings.json, values in settings.json beside it, and
 * the door reading them back through the SDK.
 *
 * The read-back goes through the SDK's own reader on purpose. The backend and
 * the door have to agree about defaults, types and unknown keys, and the way
 * to be sure of that is to write with one and read with the other - not to
 * assert the backend against itself.
 */

process.env.SKIP_DB_INIT = '1';

import fs from 'fs';
import os from 'os';
import path from 'path';
import { readDoorSettings } from '@amiexpress/bbs-door-sdk/settings';
import {
  readDoorSettingsView,
  writeDoorSettings,
  UnknownDoorSettingError,
} from '../../src/doors/door-settings.service';

const MANIFEST = {
  command: 'TESTDOOR',
  settings: [
    { key: 'server', label: 'Server', type: 'string', default: 'bbs.example.org' },
    { key: 'port', label: 'Port', type: 'number', default: 6667, min: 1, max: 65535 },
    { key: 'announce', label: 'Announce joins', type: 'boolean', default: true },
    { key: 'style', label: 'Style', type: 'choice', default: '4',
      choices: [{ value: '1', label: 'One' }, { value: '4', label: 'Four' }] },
    { key: 'password', label: 'Password', type: 'string', secret: true },
  ],
};

describe('door settings, admin to door', () => {
  let doorDir: string;

  beforeEach(() => {
    doorDir = fs.mkdtempSync(path.join(os.tmpdir(), 'door-settings-api-'));
    fs.writeFileSync(path.join(doorDir, 'door.settings.json'), JSON.stringify(MANIFEST));
  });

  afterEach(() => fs.rmSync(doorDir, { recursive: true, force: true }));

  it('shows the declaration with defaults before anything is set', () => {
    const view = readDoorSettingsView(doorDir)!;

    expect(view.manifest.settings).toHaveLength(5);
    expect(view.values.server).toBe('bbs.example.org');
    expect(view.values.port).toBe(6667);
    expect(fs.existsSync(path.join(doorDir, 'settings.json'))).toBe(false);
  });

  it('writes what the sysop set to settings.json, and the door reads it', () => {
    writeDoorSettings(doorDir, { server: 'wall.uprough.net', port: 6697, announce: false, style: '1' });

    const onDisk = JSON.parse(fs.readFileSync(path.join(doorDir, 'settings.json'), 'utf8'));
    expect(onDisk.server).toBe('wall.uprough.net');
    expect(onDisk.port).toBe(6697);

    // The door's own reader, not the admin's.
    expect(readDoorSettings(doorDir)).toEqual({
      server: 'wall.uprough.net', port: 6697, announce: false, style: '1',
    });
  });

  it('refuses a key the door does not declare, by name, and writes nothing', () => {
    expect(() => writeDoorSettings(doorDir, { server: 'x', nosuchkey: '1' }))
      .toThrow(UnknownDoorSettingError);
    expect(() => writeDoorSettings(doorDir, { nosuchkey: '1' }))
      .toThrow(/nosuchkey/);
    expect(fs.existsSync(path.join(doorDir, 'settings.json'))).toBe(false);
  });

  it('holds a number to the range the door declared', () => {
    expect(() => writeDoorSettings(doorDir, { port: 70000 })).toThrow(/at most 65535/);
    expect(() => writeDoorSettings(doorDir, { port: 0 })).toThrow(/at least 1/);
  });

  it('refuses a choice the door does not offer', () => {
    expect(() => writeDoorSettings(doorDir, { style: '99' })).toThrow(/must be one of: 1, 4/);
  });

  it('never returns a secret, but says it is set, and keeps it when the form sends it back empty', () => {
    writeDoorSettings(doorDir, { password: 'hunter2' });

    const view = readDoorSettingsView(doorDir)!;
    expect(view.values.password).toBe('');
    expect(view.secretsSet).toEqual(['password']);

    // The form was never given the secret, so an empty one means "unchanged".
    writeDoorSettings(doorDir, { password: '', server: 'other.example' });
    expect(readDoorSettings(doorDir).password).toBe('hunter2');
    expect(readDoorSettings(doorDir).server).toBe('other.example');
  });

  it('is null for a door that declares nothing, which is most of them', () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'plain-door-'));
    try {
      expect(readDoorSettingsView(plain)).toBeNull();
    } finally {
      fs.rmSync(plain, { recursive: true, force: true });
    }
  });
});
