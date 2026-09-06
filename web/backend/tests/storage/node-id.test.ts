/**
 * Task 12 review, findings 2 and 3: the node-id fallback used when nobody
 * sets `BBS_STORAGE_NODE_ID`.
 *
 * The old fallback (`HOSTNAME` then the bare pid) had two bugs at once: a
 * restart got a new pid and therefore a new cache directory, orphaning
 * every pending upload the previous run staged (finding 2); and two
 * processes on one bare host with `HOSTNAME` set got the SAME value and
 * therefore the SAME directory, which CONFIGURATION.md says must never
 * happen (finding 3). `claimNodeSlot` fixes both: a slot survives a restart
 * of the same process lineage (its former occupant's pid is dead, so it is
 * reclaimed) and stays distinct for two processes alive at once (a live pid
 * holds its slot, so a second claimant moves on).
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

  it('two sequential calls with no prior state simulate two concurrent instances and get different slots', () => {
    const root = tmpRoot();

    const a = claimNodeSlot(root);
    const b = claimNodeSlot(root);

    expect(a).not.toBe(b);
  });
});
