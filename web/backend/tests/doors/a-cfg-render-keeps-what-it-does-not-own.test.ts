/**
 * Rendering a door's legacy cfg must not delete the parts of it we do not
 * model.
 *
 * `renderDoorCfg` wrote `lines.join('\n')` and nothing else, so the manifest
 * became the whole truth of the file: every comment went, and so did every
 * key the manifest did not happen to declare. `renderAllDoorCfgs` runs at
 * EVERY boot for EVERY manifest with a `cfgFile`, so the loss lands later, on
 * a door nobody touched.
 *
 * It bit `Doors/DoorRepo/DoorRepo.cfg` on 2026-09-14, the first time that
 * door was given a manifest: a seven-line header explaining why its paths
 * must be AmigaDOS assigns, and a `KeepFailedDownloads=yes` flag belonging to
 * an open checksum investigation, were deleted from a tracked file - by the
 * very mechanism that flag's own comment warned about.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { renderDoorCfg } from '../../src/doors/door-settings.service';

/** A door directory with a manifest, saved values and a cfg already on disk. */
function doorWith(cfg: string | null, settings: unknown[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doorcfg-'));
  fs.writeFileSync(
    path.join(dir, 'door.settings.json'),
    JSON.stringify({ command: 'TESTDOOR', cfgFile: 'test.cfg', settings }, null, 2),
  );
  if (cfg !== null) fs.writeFileSync(path.join(dir, 'test.cfg'), cfg);
  return dir;
}

const read = (dir: string) => fs.readFileSync(path.join(dir, 'test.cfg'), 'utf8');

const HOST = { key: 'host', cfgKey: 'RepoHost', label: 'Host', type: 'string', default: 'bbs.uprough.net' };

describe('rendering a door cfg', () => {
  it('keeps the comments that explain the file', () => {
    const dir = doorWith(
      '# Paths use AmigaDOS assigns as the emulator resolves them.\nRepoHost=old.example\n',
      [HOST],
    );

    renderDoorCfg(dir);

    expect(read(dir)).toContain('# Paths use AmigaDOS assigns as the emulator resolves them.');
  });

  it('keeps a key the manifest does not model', () => {
    // The DoorRepo case exactly: a flag set for an open investigation, which
    // no manifest knew about, deleted at the next boot.
    const dir = doorWith('RepoHost=old.example\nKeepFailedDownloads=yes\n', [HOST]);

    renderDoorCfg(dir);

    expect(read(dir)).toContain('KeepFailedDownloads=yes');
  });

  it('still writes the value the manifest owns', () => {
    const dir = doorWith('RepoHost=old.example\n', [HOST]);

    renderDoorCfg(dir);

    expect(read(dir)).toContain('RepoHost=bbs.uprough.net');
    expect(read(dir)).not.toContain('old.example');
  });

  it('replaces a key where it stands, so the file keeps its shape', () => {
    // Rewriting in place rather than appending is what keeps a key under the
    // comment that explains it.
    const dir = doorWith(
      '# why the host matters\nRepoHost=old.example\n\n# trailing note\nOther=1\n',
      [HOST],
    );

    renderDoorCfg(dir);

    expect(read(dir).split('\n').slice(0, 2)).toEqual([
      '# why the host matters',
      'RepoHost=bbs.uprough.net',
    ]);
    expect(read(dir)).toContain('# trailing note');
  });

  it('adds a key the file has never carried', () => {
    const dir = doorWith('Other=1\n', [HOST]);

    renderDoorCfg(dir);

    expect(read(dir)).toContain('RepoHost=bbs.uprough.net');
    expect(read(dir)).toContain('Other=1');
  });

  it('writes a whole file when the door has none yet', () => {
    // A door being configured for the first time has nothing to preserve.
    const dir = doorWith(null, [HOST]);

    renderDoorCfg(dir);

    expect(read(dir)).toBe('RepoHost=bbs.uprough.net\n');
  });

  it('leaves a blank line alone', () => {
    const dir = doorWith('RepoHost=old.example\n\nOther=1\n', [HOST]);

    renderDoorCfg(dir);

    expect(read(dir)).toBe('RepoHost=bbs.uprough.net\n\nOther=1\n');
  });

  it('does not mistake a commented-out setting for one to replace', () => {
    // `;RepoHost=...` is prose. Treating it as the key would resurrect a
    // setting the sysop deliberately turned off.
    const dir = doorWith(';RepoHost=disabled.example\nOther=1\n', [HOST]);

    renderDoorCfg(dir);

    expect(read(dir)).toContain(';RepoHost=disabled.example');
    expect(read(dir)).toContain('RepoHost=bbs.uprough.net');
  });

  it('keeps the line endings the file already uses', () => {
    // An Amiga-authored cfg may be CRLF; rewriting it all as LF is a whole
    // -file diff for a one-value change.
    const dir = doorWith('RepoHost=old.example\r\nOther=1\r\n', [HOST]);

    renderDoorCfg(dir);

    expect(read(dir)).toBe('RepoHost=bbs.uprough.net\r\nOther=1\r\n');
  });
});
