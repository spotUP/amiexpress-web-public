/**
 * A door's manifest must model EVERY key in the cfg it claims.
 *
 * `renderDoorCfg` does not edit a legacy cfg - it REWRITES it, one line per
 * setting that declares a `cfgKey`, and `renderAllDoorCfgs` runs at every
 * boot for every manifest with a `cfgFile`. So a key the manifest forgets is
 * not merely un-editable: it is deleted from the door's config the next time
 * the board starts, and the door falls back to whatever it defaults to.
 *
 * That is a quiet, delayed failure - the admin looks right, the door breaks a
 * reboot later - so it is worth a test rather than care. This compares each
 * manifest against the cfg file shipped beside it and fails on any key the
 * manifest does not carry.
 *
 * Comments are a known and accepted loss: the renderer writes none, and the
 * explanation belongs in the setting's `help` where the admin shows it rather
 * than in a file nobody opens. Hence the second test - a key whose comment
 * carried real knowledge has to carry it in `help` instead.
 */
import * as fs from 'fs';
import * as path from 'path';

const DOORS_ROOT = path.resolve(__dirname, '../../../../Doors');

interface Manifest {
  command: string;
  cfgFile?: string;
  cfgFormat?: string;
  settings: Array<{ key: string; cfgKey?: string; help?: string; label: string }>;
}

/** Every door shipping a manifest that REWRITES a plain Key=value cfg. */
function keyValueDoors(): Array<{ door: string; manifest: Manifest; cfg: string }> {
  return fs
    .readdirSync(DOORS_ROOT)
    .map(door => ({ door, file: path.join(DOORS_ROOT, door, 'door.settings.json') }))
    .filter(({ file }) => fs.existsSync(file))
    .map(({ door, file }) => ({ door, manifest: JSON.parse(fs.readFileSync(file, 'utf8')) as Manifest }))
    .filter(({ manifest }) => !!manifest.cfgFile && manifest.cfgFormat !== 'empire')
    .map(({ door, manifest }) => ({ door, manifest, cfg: path.join(DOORS_ROOT, door, manifest.cfgFile!) }))
    .filter(({ cfg }) => fs.existsSync(cfg));
}

/** The keys a cfg actually carries - `;` and `#` start comments in these. */
function cfgKeys(file: string): string[] {
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith(';') && !line.startsWith('#'))
    .map(line => line.split('=')[0].trim())
    .filter(Boolean);
}

const cases = keyValueDoors();

describe('a door manifest that rewrites a legacy cfg', () => {
  it('is being applied to some door at all', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it.each(cases)('models every key in $door', ({ manifest, cfg }) => {
    const declared = new Set(
      manifest.settings.map(s => s.cfgKey).filter(Boolean).map(k => k!.toLowerCase()),
    );
    const onDisk = cfgKeys(cfg);
    const missing = onDisk.filter(k => !declared.has(k.toLowerCase()));

    // A key here is one the next reboot would delete from the door's config.
    expect(missing).toEqual([]);
  });

  it.each(cases)('declares no key $door does not use', ({ manifest, cfg }) => {
    // The other direction: a cfgKey the door never reads is a field that
    // looks like it does something and does not.
    const onDisk = new Set(cfgKeys(cfg).map(k => k.toLowerCase()));
    const invented = manifest.settings
      .map(s => s.cfgKey)
      .filter(Boolean)
      .map(k => k!)
      .filter(k => !onDisk.has(k.toLowerCase()));

    expect(invented).toEqual([]);
  });

  it.each(cases)('defaults to what $door is already configured with', ({ manifest, cfg }) => {
    /*
     * The renderer writes the DEFAULT for any key the sysop has not set, so a
     * manifest whose defaults disagree with the file silently reconfigures
     * the door at the next boot - on a board where nobody has opened the
     * form, the act of adding the manifest changes the door's behaviour.
     *
     * This is the check that makes adding a manifest to a working door safe.
     */
    const onDisk = new Map(
      fs.readFileSync(cfg, 'utf8')
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l && !l.startsWith(';') && !l.startsWith('#') && l.includes('='))
        .map(l => [l.slice(0, l.indexOf('=')).trim().toLowerCase(), l.slice(l.indexOf('=') + 1).trim()]),
    );

    const drifted = manifest.settings
      .filter(s => s.cfgKey && onDisk.has(s.cfgKey.toLowerCase()))
      .map(s => ({
        key: s.cfgKey!,
        file: onDisk.get(s.cfgKey!.toLowerCase()),
        manifest: String((s as { default?: unknown }).default ?? ''),
      }))
      .filter(row => row.file !== row.manifest);

    expect(drifted).toEqual([]);
  });

  it.each(cases)('keeps a commented key\'s explanation in $door', ({ manifest, cfg }) => {
    // The renderer writes no comments, so an explanation that lived above a
    // key in the file has to survive as `help` or it is simply lost.
    const source = fs.readFileSync(cfg, 'utf8').split(/\r?\n/);
    const explained = new Set<string>();
    source.forEach((line, i) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) return;
      const previous = (source[i - 1] ?? '').trim();
      if (previous.startsWith(';') || previous.startsWith('#')) {
        explained.add(trimmed.split('=')[0].trim().toLowerCase());
      }
    });

    const helpless = manifest.settings
      .filter(s => s.cfgKey && explained.has(s.cfgKey.toLowerCase()) && !s.help)
      .map(s => s.cfgKey);

    expect(helpless).toEqual([]);
  });
});
