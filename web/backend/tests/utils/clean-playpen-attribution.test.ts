/**
 * Regression: cleanPlayPen must not brand another caller's leftovers with the
 * current caller's slot.
 *
 * Live bug (2026-09-08): a caller was offered "resume?" for files he had never
 * uploaded. The node playpen is a persistent per-node directory and NOTHING
 * ever empties it (every touchpoint is mkdirSync recursive), so junk from an
 * earlier, hard-dropped session sits there indefinitely. cleanPlayPen then
 * moved EVERY file it found to <conf>/PartUpload/<name>@<slot> using the
 * CURRENTLY logged-on user's slot - stamping someone else's file as his.
 * resumeStuff's own @slot filter is correct; the stamp was the lie.
 *
 * It only began to bite when cleanPlayPen got its first caller (post-upload),
 * which is why the playpen had quietly accumulated files for a long time.
 *
 * Fix: claim only what THIS session created - a file whose mtime predates the
 * caller's logon is not his, and is left in the playpen rather than branded.
 */

process.env.SKIP_DB_INIT = 'true';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let confDir: string;

// cleanPlayPen resolves the conference dir through this helper (a lazy
// require inside the function), so the test points it at a temp dir.
jest.mock('../../src/utils/file-hold.util', () => ({
  getConferenceDir: () => confDir,
}));

import { cleanPlayPen } from '../../src/utils/clean-playpen.util';

const SLOT = 7;

function makeConfig() {
  return {
    get: (key: string) => {
      if (key === 'ownPartFiles') return false;
      if (key === 'dataDir') return confDir;
      return undefined;
    },
  };
}

describe('cleanPlayPen - only claims files this session created', () => {
  let root: string;
  let playpen: string;
  let nowSec: number;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'playpen-attr-'));
    confDir = path.join(root, 'Conf1');
    playpen = path.join(root, 'Node0', 'Playpen');
    fs.mkdirSync(confDir, { recursive: true });
    fs.mkdirSync(playpen, { recursive: true });
    nowSec = Math.floor(Date.now() / 1000);
  });

  afterEach(() => {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  });

  function session(): any {
    // Logged on one minute ago.
    return { user: { slotNumber: SLOT }, nodeId: 0, currentConf: 1, logonTime: nowSec - 60 };
  }

  it('leaves a file that predates this logon in the playpen, unbranded', async () => {
    const stale = path.join(playpen, 'SOMEONE-ELSE.LHA');
    fs.writeFileSync(stale, 'not mine');
    // Dropped by an earlier session, an hour before this caller logged on.
    const old = nowSec - 3600;
    fs.utimesSync(stale, old, old);

    await cleanPlayPen(playpen, session(), makeConfig());

    const partUpload = path.join(confDir, 'PartUpload');
    const filed = fs.existsSync(partUpload) ? fs.readdirSync(partUpload) : [];
    expect(filed).not.toContain(`SOMEONE-ELSE.LHA@${SLOT}`);
    // Left where it was - skipped, never deleted.
    expect(fs.existsSync(stale)).toBe(true);
  });

  it("still files the caller's own aborted upload from this session", async () => {
    const mine = path.join(playpen, 'MINE.LHA');
    fs.writeFileSync(mine, 'my partial');
    // Written during this session (after logon).
    fs.utimesSync(mine, nowSec, nowSec);

    await cleanPlayPen(playpen, session(), makeConfig());

    const partUpload = path.join(confDir, 'PartUpload');
    expect(fs.readdirSync(partUpload)).toContain(`MINE.LHA@${SLOT}`);
    expect(fs.existsSync(mine)).toBe(false);
  });

  it('separates the two when both sit in the same playpen', async () => {
    const stale = path.join(playpen, 'THEIRS.LHA');
    const mine = path.join(playpen, 'OURS.LHA');
    fs.writeFileSync(stale, 'theirs');
    fs.writeFileSync(mine, 'ours');
    fs.utimesSync(stale, nowSec - 7200, nowSec - 7200);
    fs.utimesSync(mine, nowSec, nowSec);

    await cleanPlayPen(playpen, session(), makeConfig());

    const filed = fs.readdirSync(path.join(confDir, 'PartUpload'));
    expect(filed).toContain(`OURS.LHA@${SLOT}`);
    expect(filed).not.toContain(`THEIRS.LHA@${SLOT}`);
    expect(fs.existsSync(stale)).toBe(true);
  });
});
