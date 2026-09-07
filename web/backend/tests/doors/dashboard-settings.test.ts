/**
 * The BBS dashboard runs on the refresh interval the sysop set, and on its own
 * default of 3 seconds when they set nothing (Doors/bbs-dashboard/settings.ts).
 *
 * The interval was a hardcoded 3000ms in `startAutoRefresh`, with the uptime
 * counter advancing by a matching hardcoded 3. Both now read `refreshSeconds`,
 * so the one knob moves both the repaint cadence and the uptime step.
 *
 * The manifest is read here as well, so a key renamed in one file and not the
 * other fails a test rather than becoming a setting that does nothing.
 */

import * as fs from 'fs';
import * as path from 'path';
import { applySettings, DEFAULT_SETTINGS } from '../../../../Doors/bbs-dashboard/settings';

const DOOR_DIR = path.join(__dirname, '../../../../Doors/bbs-dashboard');
const manifest = JSON.parse(fs.readFileSync(path.join(DOOR_DIR, 'door.settings.json'), 'utf8'));

describe('BBS dashboard settings', () => {
  it('declares exactly the keys the door reads', () => {
    const declared = manifest.settings.map((s: { key: string }) => s.key).sort();
    expect(declared).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  });

  it('declares the door as the command the board registered', () => {
    expect(manifest.command).toBe('DASHBOARD');
  });

  it('ships defaults that match what the door ran with before it declared any', () => {
    const fromManifest = Object.fromEntries(
      manifest.settings.map((s: { key: string; default: unknown }) => [s.key, s.default]),
    );
    expect(fromManifest).toEqual(DEFAULT_SETTINGS);
  });

  it('uses the default when nothing is set', () => {
    expect(applySettings({})).toEqual({ refreshSeconds: 3 });
  });

  it('takes a valid interval as given', () => {
    expect(applySettings({ refreshSeconds: 10 }).refreshSeconds).toBe(10);
  });

  it('clamps a zero or negative interval up to 1 - never a busy-loop', () => {
    expect(applySettings({ refreshSeconds: 0 }).refreshSeconds).toBe(1);
    expect(applySettings({ refreshSeconds: -5 }).refreshSeconds).toBe(1);
  });

  it('clamps an absurdly large interval down to 60', () => {
    expect(applySettings({ refreshSeconds: 999 }).refreshSeconds).toBe(60);
  });

  it('falls back to the default for a non-number a hand-edit could leave', () => {
    expect(applySettings({ refreshSeconds: 'soon' as unknown as number }).refreshSeconds).toBe(3);
  });

  it('rounds a fractional interval to whole seconds', () => {
    expect(applySettings({ refreshSeconds: 4.6 }).refreshSeconds).toBe(5);
  });

  it('stays within the range the manifest advertises', () => {
    const spec = manifest.settings.find((s: { key: string }) => s.key === 'refreshSeconds');
    expect(applySettings({ refreshSeconds: spec.min - 1 }).refreshSeconds).toBe(spec.min);
    expect(applySettings({ refreshSeconds: spec.max + 1 }).refreshSeconds).toBe(spec.max);
  });
});
