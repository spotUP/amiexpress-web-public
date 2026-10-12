/**
 * amiscan's virus database has to be kept current, in a folder the board owns
 * (amiscan docs/bbs.md: `amiscan -update`, daily, as the board's user, with
 * -libs so nothing else changes the board under it).
 *
 * The binary is a shell script that records its arguments: proof the updater
 * RAN it with -update and the board's own -libs folder.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  amiscanLibsDir,
  startAmiscanUpdates,
  updateAmiscanParts,
  defaultAmiscanUpdateDeps,
} from '../../src/services/amiscan-update.service';

describe('the amiscan parts updater', () => {
  let dir: string;
  let record: string;
  let binary: string;
  const lines: string[] = [];

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amiscan-update-'));
    record = path.join(dir, 'args');
    binary = path.join(dir, 'fake-checker-bin');
    lines.length = 0;
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const deps = (extra: object = {}) => ({
    ...defaultAmiscanUpdateDeps(),
    binary,
    libsDir: path.join(dir, 'AmiScan'),
    log: (l: string) => lines.push(l),
    ...extra,
  });

  it('runs amiscan -update -libs <board folder> and logs one line', async () => {
    fs.writeFileSync(binary, `#!/bin/sh\necho "$@" > '${record}'\n`, { mode: 0o755 });

    expect(await updateAmiscanParts(deps())).toBe('updated');

    expect(fs.readFileSync(record, 'utf8').trim()).toBe(`-update -libs ${path.join(dir, 'AmiScan')}`);
    expect(fs.existsSync(path.join(dir, 'AmiScan'))).toBe(true);
    expect(lines).toHaveLength(1);
  });

  it('survives a failing update with one warning line', async () => {
    fs.writeFileSync(binary, '#!/bin/sh\necho "no network" >&2\nexit 3\n', { mode: 0o755 });

    expect(await updateAmiscanParts(deps())).toBe('failed');

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('no network');
  });

  it('does nothing and starts no timer when the binary is not installed', async () => {
    expect(await updateAmiscanParts(deps())).toBe('absent');
    expect(startAmiscanUpdates(deps())).toBeNull();
    expect(lines).toEqual([]);
  });

  it('keeps its parts under the board root', () => {
    expect(path.basename(amiscanLibsDir())).toBe('AmiScan');
  });
});
