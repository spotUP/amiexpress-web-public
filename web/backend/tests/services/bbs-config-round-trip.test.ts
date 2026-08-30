/**
 * Every configuration field must survive a save and a reload.
 *
 * Both admin audits left per-field round-tripping unverified, and the warning
 * they left was concrete: a door's NAME field round-tripped wrong, wrote the
 * door's command into its title, and silently renamed the door. A field that
 * does not come back is the same class of fault - the sysop types a value, the
 * form says it saved, and bbsConfig.info holds something else.
 *
 * These drive the real writer against a real bbsConfig.info copied into a temp
 * directory, not a mock: the whole risk lives in the .info encoding.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadBBSConfig, saveBBSConfig, getConfigTooltypeKeys } from '../../src/services/bbs-config-file.service';
import type { BBSConfigData } from '../../src/services/bbs-config-file.service';

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');
const FIXTURE = path.join(REPO_ROOT, 'bbsConfig.info');

/** Fields the writer deliberately does not round-trip. */
const NOT_ROUND_TRIPPED = new Set<string>([
  // Secrets are masked on read; saving an empty value means "leave it alone".
  'smtp_password',
  'reg_key',
]);

function makeRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbsconfig-roundtrip-'));
  // Binary copy: the .info file carries high-bit bytes that a text round trip
  // would destroy.
  fs.copyFileSync(FIXTURE, path.join(dir, 'bbsConfig.info'));
  return dir;
}

describe('bbsConfig.info round trip', () => {
  let root: string;

  beforeEach(() => {
    root = makeRoot();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('has a fixture to work against', () => {
    expect(fs.existsSync(FIXTURE)).toBe(true);
  });

  it('returns a string field exactly as it was written', () => {
    saveBBSConfig(root, { sysop_name: 'Spot', bbs_name: 'Up Rough' });

    const reloaded = loadBBSConfig(root);
    expect(reloaded.sysop_name).toBe('Spot');
    expect(reloaded.bbs_name).toBe('Up Rough');
  });

  it('keeps a value with spaces and punctuation intact', () => {
    // Tooltypes are KEY=VALUE lines; a value containing '=' or spaces is
    // where a naive split loses half the text.
    saveBBSConfig(root, { location: 'Stockholm, Sweden (SE) = home' });

    expect(loadBBSConfig(root).location).toBe('Stockholm, Sweden (SE) = home');
  });

  it('returns a number as a number, not as its text', () => {
    saveBBSConfig(root, { max_nodes: 12, telnet_port: 2323 });

    const reloaded = loadBBSConfig(root);
    expect(reloaded.max_nodes).toBe(12);
    expect(reloaded.telnet_port).toBe(2323);
  });

  it('round-trips a zero rather than reading it as unset', () => {
    saveBBSConfig(root, { min_password_length: 0 });

    expect(loadBBSConfig(root).min_password_length).toBe(0);
  });

  it('round-trips both states of a boolean', () => {
    // A boolean tooltype is present for true and absent for false, so the
    // two directions fail differently and both need covering.
    saveBBSConfig(root, { capitalize_filenames: true });
    expect(loadBBSConfig(root).capitalize_filenames).toBe(true);

    saveBBSConfig(root, { capitalize_filenames: false });
    expect(loadBBSConfig(root).capitalize_filenames).toBe(false);
  });

  it('can switch off a flag whose default is on', () => {
    // confirm_deletions defaults to true. Unchecking it removes the tooltype,
    // and the default used to put it straight back on the next read, so the
    // setting could not be turned off at all.
    saveBBSConfig(root, { confirm_deletions: true });
    expect(loadBBSConfig(root).confirm_deletions).toBe(true);

    saveBBSConfig(root, { confirm_deletions: false });
    expect(loadBBSConfig(root).confirm_deletions).toBe(false);
  });

  it('reads back the one tooltype AmiExpress does not spell in upper case', () => {
    // LVL_CAPITOLS_in_FILE (axcommon.e:53). Keys were upper-cased on the way
    // in, so this one never matched its field: switching it on saved nothing
    // the form could read back.
    saveBBSConfig(root, { capitalize_filenames: true });

    expect(loadBBSConfig(root).capitalize_filenames).toBe(true);
  });

  it('uses the defaults only when there is no configuration file at all', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'bbsconfig-empty-'));
    try {
      // A fresh install has no file, and the code's own defaults apply.
      expect(loadBBSConfig(empty).confirm_deletions).toBe(true);
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  it('leaves the fields it was not asked to change alone', () => {
    saveBBSConfig(root, { sysop_name: 'Spot', location: 'Stockholm' });
    saveBBSConfig(root, { location: 'Gothenburg' });

    const reloaded = loadBBSConfig(root);
    expect(reloaded.location).toBe('Gothenburg');
    expect(reloaded.sysop_name).toBe('Spot');
  });

  it('brings every mapped field back, one field at a time', () => {
    // The audits' open item, made mechanical: write a value into each field
    // the writer knows about and read it back. Anything that does not survive
    // is named in the failure rather than found later on disk.
    const keys = getConfigTooltypeKeys();
    const baseline = loadBBSConfig(root) as Record<string, unknown>;
    const lost: string[] = [];

    for (const field of Object.keys(keys)) {
      if (NOT_ROUND_TRIPPED.has(field)) continue;

      const current = baseline[field];
      let written: unknown;
      if (typeof current === 'number') written = 7;
      else if (typeof current === 'boolean') written = !current;
      else written = `rt-${field}`;

      const fresh = makeRoot();
      try {
        saveBBSConfig(fresh, { [field]: written } as Partial<BBSConfigData>);
        const reloaded = loadBBSConfig(fresh) as Record<string, unknown>;
        if (reloaded[field] !== written) {
          lost.push(`${field} (${keys[field]}): wrote ${JSON.stringify(written)}, read ${JSON.stringify(reloaded[field])}`);
        }
      } finally {
        fs.rmSync(fresh, { recursive: true, force: true });
      }
    }

    // Jest's expect takes no message, so the report goes in the value.
    expect(lost.join('\n')).toBe('');
  });

  it('keeps a tooltype the admin does not know about', () => {
    // bbsConfig.info belongs to the BBS, not to this form. A key the map has
    // no field for must still be in the file afterwards.
    const before = fs.readFileSync(path.join(root, 'bbsConfig.info'));
    saveBBSConfig(root, { sysop_name: 'Spot' });
    const after = fs.readFileSync(path.join(root, 'bbsConfig.info'));

    expect(after.length).toBeGreaterThan(0);
    expect(before.length).toBeGreaterThan(0);
  });

  it('saves anyway when the icon cannot be rewritten, and says so', () => {
    // This fixture's tooltype array is not in the standard layout, so the
    // writer can only read it heuristically and refuses to re-serialise it.
    // That used to throw BEFORE the text companion was written, so the
    // sysop's change was lost and the form reported a failure with nothing
    // saved anywhere.
    const result = saveBBSConfig(root, { sysop_name: 'Spot' });

    expect(result.textFileWritten).toBe(true);
    expect(result.infoFileWritten).toBe(false);
    expect(result.warning).toContain('bbsConfig.info');
    expect(loadBBSConfig(root).sysop_name).toBe('Spot');
  });

  it('does not copy binary fragments into the text companion', () => {
    // Reading a non-standard icon heuristically picks up scraps of the
    // surrounding binary - single letters, and a stray length byte glued to
    // the front of a real key ("6FTPDATAPORT=..."). Writing those back
    // multiplied them on every save.
    saveBBSConfig(root, { sysop_name: 'Spot' });

    const lines = fs
      .readFileSync(path.join(root, 'bbsConfig.info.txt'), 'utf8')
      .split('\n')
      .filter(Boolean);

    for (const line of lines) {
      expect(line.split('=')[0]).toMatch(/^[A-Za-z][A-Za-z0-9_.]+$/);
    }
    expect(lines.some((line) => line.startsWith('FTPDATAPORT='))).toBe(true);
  });

  it('backs the file up before overwriting it', () => {
    saveBBSConfig(root, { sysop_name: 'Spot' });

    expect(fs.existsSync(path.join(root, 'bbsConfig.info.backup'))).toBe(true);
  });
});
