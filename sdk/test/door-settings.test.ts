/**
 * A door declares what it can be configured with; the sysop's values go over
 * the defaults.
 *
 * The admin could edit six fields and a raw tooltype list per door, and the
 * only door that ever looked configurable was GWall - because a page had been
 * written by hand for it. Fourteen doors export a `metadata` object that
 * nothing reads. This is the declaration the admin can actually render.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readDoorSettings, readDoorSettingOverrides, readManifest, resolveDoorRoot, DoorSettingsError } from '../core/settings';

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

describe('door settings', () => {
  let doorDir: string;

  const writeManifest = (manifest: unknown) =>
    fs.writeFileSync(path.join(doorDir, 'door.settings.json'), JSON.stringify(manifest));
  const writeValues = (values: unknown) =>
    fs.writeFileSync(path.join(doorDir, 'settings.json'), JSON.stringify(values));

  beforeEach(() => { doorDir = fs.mkdtempSync(path.join(os.tmpdir(), 'door-settings-')); });
  afterEach(() => { fs.rmSync(doorDir, { recursive: true, force: true }); });

  it('gives a door with no manifest nothing, which is not an error', () => {
    expect(readManifest(doorDir)).toBeNull();
    expect(readDoorSettings(doorDir)).toEqual({});
  });

  it('falls back to the declared defaults when the sysop has set nothing', () => {
    writeManifest(MANIFEST);

    expect(readDoorSettings(doorDir)).toEqual({
      server: 'bbs.example.org', port: 6667, announce: true, style: '4',
    });
  });

  it('lets the sysop value win', () => {
    writeManifest(MANIFEST);
    writeValues({ server: 'wall.uprough.net', port: 6697, announce: false, style: '1' });

    expect(readDoorSettings(doorDir)).toEqual({
      server: 'wall.uprough.net', port: 6697, announce: false, style: '1',
    });
  });

  it('ignores a key the door does not declare', () => {
    writeManifest(MANIFEST);
    writeValues({ server: 'x.example', removedLastRelease: 'whatever' });

    expect(readDoorSettings(doorDir)).not.toHaveProperty('removedLastRelease');
  });

  it('does not hand a door a string where it declared a number', () => {
    writeManifest(MANIFEST);
    writeValues({ port: '6697' });

    expect(readDoorSettings(doorDir).port).toBe(6697);
  });

  it('refuses a choice the door does not offer, and uses the default', () => {
    writeManifest(MANIFEST);
    writeValues({ style: '99' });

    expect(readDoorSettings(doorDir).style).toBe('4');
  });

  it('keeps running on a values file someone broke by hand', () => {
    writeManifest(MANIFEST);
    fs.writeFileSync(path.join(doorDir, 'settings.json'), '{ this is not json');

    expect(readDoorSettings(doorDir).port).toBe(6667);
  });

  it('names the door and the fault when the manifest is wrong', () => {
    writeManifest({ command: 'TESTDOOR', settings: [{ key: 'style', label: 'Style', type: 'choice' }] });

    expect(() => readManifest(doorDir)).toThrow(DoorSettingsError);
    expect(() => readManifest(doorDir)).toThrow(/style.*choice with no choices/);
  });

  it('rejects the same key declared twice', () => {
    writeManifest({ command: 'T', settings: [
      { key: 'port', label: 'A', type: 'number' },
      { key: 'port', label: 'B', type: 'number' },
    ] });

    expect(() => readManifest(doorDir)).toThrow(/declares port twice/);
  });

  // The backend imports a door's index.ts in development and its
  // dist/index.js in production (door.handler.ts), so the SAME
  // readDoorSettings(__dirname) call arrives from two different directories
  // while the admin only ever writes to one of them.
  describe('a compiled door asking from its dist directory', () => {
    let distDir: string;

    beforeEach(() => {
      distDir = path.join(doorDir, 'dist');
      fs.mkdirSync(distDir);
    });

    it('finds the declaration and the values the admin wrote one level up', () => {
      writeManifest(MANIFEST);
      writeValues({ server: 'wall.uprough.net' });

      expect(resolveDoorRoot(distDir)).toBe(doorDir);
      expect(readDoorSettings(distDir).server).toBe('wall.uprough.net');
    });

    it('reads nothing from a directory whose door has no declaration', () => {
      expect(readDoorSettings(distDir)).toEqual({});
      expect(resolveDoorRoot(distDir)).toBe(distDir);
    });

    it('prefers a declaration in the directory it was given', () => {
      writeManifest(MANIFEST);
      fs.writeFileSync(path.join(distDir, 'door.settings.json'), JSON.stringify({
        command: 'INNER', settings: [{ key: 'server', label: 'Server', type: 'string', default: 'inner' }],
      }));

      expect(readDoorSettings(distDir).server).toBe('inner');
    });
  });

  // A door migrating off its own config file layers defaults -> old file ->
  // what the sysop set. A default that came back as a "value" would silently
  // overwrite the old file.
  describe('overrides only', () => {
    it('returns just the keys the sysop actually set', () => {
      writeManifest(MANIFEST);
      writeValues({ port: 6697 });

      expect(readDoorSettingOverrides(doorDir)).toEqual({ port: 6697 });
    });

    it('is empty when the sysop has set nothing, defaults and all', () => {
      writeManifest(MANIFEST);

      expect(readDoorSettingOverrides(doorDir)).toEqual({});
      expect(readDoorSettings(doorDir).port).toBe(6667);
    });

    it('treats an empty secret as unset, the way the admin sends it back', () => {
      writeManifest(MANIFEST);
      writeValues({ password: '', server: 'wall.uprough.net' });

      expect(readDoorSettingOverrides(doorDir)).toEqual({ server: 'wall.uprough.net' });
    });
  });
});
