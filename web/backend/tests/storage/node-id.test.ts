/**
 * Task 12 review, findings 2 and 3, and the re-review's Blocker A: the
 * bare-host node-id fallback used when nobody sets `BBS_STORAGE_NODE_ID`
 * (and `HOSTNAME` is not set either - see `storage/index.ts#defaultNodeId`
 * for where `HOSTNAME` sits ahead of this).
 *
 * The old pid-only fallback had two bugs at once: a restart got a new pid
 * and therefore a new cache directory, orphaning every pending upload the
 * previous run staged (finding 2); and two processes on one bare host got
 * the SAME value whenever `HOSTNAME` happened to be set, which
 * CONFIGURATION.md says must never happen (finding 3). `claimNodeSlot`
 * fixes both: a slot survives a restart of the same process lineage (its
 * former occupant's pid is dead, so it is reclaimed) and stays distinct for
 * two processes alive at once (a live pid holds its slot, so a second
 * claimant moves on).
 *
 * Blocker A (re-review): the first fix pass left the claim unmemoised, so
 * calling it twice in the SAME process - which `refreshStorageContext` now
 * does on every admin save - read its own prior claim back as "held by a
 * live pid" and moved to the next slot every time, abandoning the previous
 * slot (and anything still staged under it) on the very first save after
 * boot. `claimNodeSlot` now memoises per (process, board root).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { claimNodeSlot } from '../../src/storage/node-id';

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'node-id-'));
}

describe('claimNodeSlot', () => {
  it('claims slot 1 on a fresh board root', () => {
    const root = tmpRoot();
    expect(claimNodeSlot(root)).toBe('1');
  });

  it('records this process as the slot owner', () => {
    const root = tmpRoot();
    claimNodeSlot(root);
    const owner = fs.readFileSync(path.join(root, 'Storage', 'nodes', '1.pid'), 'utf8').trim();
    expect(owner).toBe(String(process.pid));
  });

  it('reclaims the same slot a dead process left behind - a restart keeps its cache directory', () => {
    const root = tmpRoot();
    const lockDir = path.join(root, 'Storage', 'nodes');
    fs.mkdirSync(lockDir, { recursive: true });
    // A pid nothing alive holds - the same stand-in file-cache.test.ts uses
    // for "definitely dead".
    fs.writeFileSync(path.join(lockDir, '1.pid'), '999999');

    expect(claimNodeSlot(root)).toBe('1');
    expect(fs.readFileSync(path.join(lockDir, '1.pid'), 'utf8').trim()).toBe(String(process.pid));
  });

  it('moves to the next slot when the current one is held by a live process - two instances never collide', () => {
    const root = tmpRoot();
    const lockDir = path.join(root, 'Storage', 'nodes');
    fs.mkdirSync(lockDir, { recursive: true });
    // This very test process - unambiguously alive.
    fs.writeFileSync(path.join(lockDir, '1.pid'), String(process.pid));

    expect(claimNodeSlot(root)).toBe('2');
  });

  it('reclaims a lock file that cannot be read as a pid at all, rather than blocking the slot forever', () => {
    const root = tmpRoot();
    const lockDir = path.join(root, 'Storage', 'nodes');
    fs.mkdirSync(lockDir, { recursive: true });
    fs.writeFileSync(path.join(lockDir, '1.pid'), 'not-a-pid');

    expect(claimNodeSlot(root)).toBe('1');
  });

  it('review Blocker A: memoises the claim - two calls for the same board root in this process return the SAME slot', () => {
    const root = tmpRoot();

    const a = claimNodeSlot(root);
    const b = claimNodeSlot(root);

    expect(a).toBe(b);
    // Only one lock file exists - the second call never touched disk again.
    expect(fs.readdirSync(path.join(root, 'Storage', 'nodes'))).toEqual(['1.pid']);
  });

  it('review Blocker A: different board roots still get independent claims - memoisation is keyed by root, not global', () => {
    const rootA = tmpRoot();
    const rootB = tmpRoot();

    expect(claimNodeSlot(rootA)).toBe('1');
    expect(claimNodeSlot(rootB)).toBe('1');
  });

  it('never leaves a lock file observable as empty or partial to a racing claimant', () => {
    // A regression test for the open('wx')-then-write() race: the fix writes
    // the pid to a private temp file and hard-links it into place, so
    // `lockPath` is never anything but "absent" or "fully written". This
    // asserts the end state a correct implementation produces; the race
    // itself only manifests under genuine concurrency, which a synchronous
    // single-threaded test cannot force deterministically.
    const root = tmpRoot();
    claimNodeSlot(root);

    const lockPath = path.join(root, 'Storage', 'nodes', '1.pid');
    expect(fs.readFileSync(lockPath, 'utf8').trim()).toBe(String(process.pid));
    // No leftover temp scratch from the link-and-unlink sequence.
    const entries = fs.readdirSync(path.join(root, 'Storage', 'nodes'));
    expect(entries).toEqual(['1.pid']);
  });
});
