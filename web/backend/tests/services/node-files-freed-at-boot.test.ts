/**
 * A restart frees every node.
 *
 * `node<n>.user` is written at login and deleted at logoff, and since
 * `one account, one node` landed it is also what the board reads to refuse a
 * second simultaneous login (services/user-already-online.ts, express.e:29715
 * `checkUserOnLine`). A clean logoff removes the record. A process that DIES -
 * a deploy, a crash, a container restart - cannot, and the record then
 * outlives the session it describes and refuses the caller it belongs to.
 *
 * Live, 2026-09-07: "i cant login with my sysop user it says i am already
 * logged in but i am not". Twenty-one stale records on the board, sysop on
 * nine nodes and spot on four, the oldest six days old.
 *
 * A booted Amiga has every node free. So does this one, from now on.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * `userAlreadyOnNode` asks the SINGLETON node-file manager, which is bound to
 * the real board directory at import time. The class itself is left real -
 * `releaseAllNodes` is what is under test - and only that singleton is
 * pointed at this suite's temporary board, the same way
 * tests/screens/one-account-one-node.test.ts does it.
 */
jest.mock('../../src/services/NodeFileManager', () => {
  const actual = jest.requireActual('../../src/services/NodeFileManager');
  return {
    ...actual,
    nodeFileManager: {
      readNodeUserFile: (nodeId: number) => {
        const fsMod = require('fs');
        const pathMod = require('path');
        const file = pathMod.join(process.env.FREED_NODES_ROOT as string, `node${nodeId}.user`);
        if (!fsMod.existsSync(file)) return null;
        return { name: fsMod.readFileSync(file).toString('latin1').split('\0')[0] };
      },
    },
  };
});

import { NodeFileManager } from '../../src/services/NodeFileManager';
import { userAlreadyOnNode } from '../../src/services/user-already-online';

let root: string;
let manager: NodeFileManager;

/** A node<n>.user record, in the fixed-width shape NodeFileManager writes. */
function claimNode(nodeId: number, name: string): void {
  const buffer = Buffer.alloc(512);
  buffer.write(name, 0, 'latin1');
  fs.writeFileSync(path.join(root, `node${nodeId}.user`), buffer);
  fs.writeFileSync(path.join(root, `node${nodeId}.userkeys`), Buffer.alloc(64));
}

const stillClaimed = (): string[] =>
  fs.readdirSync(root).filter((f) => /^node\d+\.user(keys)?$/i.test(f)).sort();

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'freed-nodes-'));
  process.env.FREED_NODES_ROOT = root;
  for (const n of [1, 2, 3, 4]) fs.mkdirSync(path.join(root, `Node${n}`), { recursive: true });
  manager = new NodeFileManager(root);
});

afterEach(() => {
  delete process.env.FREED_NODES_ROOT;
  fs.rmSync(root, { recursive: true, force: true });
});

describe('the board frees every node it finds claimed', () => {
  it('removes the record AND the keys file of every claimed node', () => {
    claimNode(1, 'sysop');
    claimNode(3, 'spot');
    claimNode(4, 'sysop');

    expect(manager.releaseAllNodes()).toEqual([1, 3, 4]);
    expect(stillClaimed()).toEqual([]);
  });

  it('is a no-op on a board where nobody was online', () => {
    expect(manager.releaseAllNodes()).toEqual([]);
    expect(stillClaimed()).toEqual([]);
  });

  it('leaves everything else in the board directory alone', () => {
    claimNode(2, 'sysop');
    fs.writeFileSync(path.join(root, 'user.data'), 'the user file');
    fs.writeFileSync(path.join(root, 'node2.info'), 'a node icon');
    fs.writeFileSync(path.join(root, 'nodex.user'), 'not a node record');

    manager.releaseAllNodes();

    expect(fs.existsSync(path.join(root, 'user.data'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'node2.info'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'nodex.user'))).toBe(true);
  });

  it('does not throw on a board directory that is not there yet', () => {
    const missing = new NodeFileManager(path.join(root, 'no-such-board'));
    expect(() => missing.releaseAllNodes()).not.toThrow();
    expect(missing.releaseAllNodes()).toEqual([]);
  });

  /**
   * The point of the sweep, end to end: the rule that refused the login is
   * asked before and after, against the same board directory.
   */
  it('lets the account that was stuck log in again', () => {
    claimNode(1, 'sysop');
    claimNode(2, 'Sysop'); // the same account, as the record's own casing has it
    claimNode(3, 'spot');

    // Before: the caller on node 4 is refused, naming the node that holds him.
    expect(userAlreadyOnNode(root, 'sysop', 4)).toBe(1);
    expect(userAlreadyOnNode(root, 'spot', 4)).toBe(3);

    manager.releaseAllNodes();

    expect(userAlreadyOnNode(root, 'sysop', 4)).toBeNull();
    expect(userAlreadyOnNode(root, 'spot', 4)).toBeNull();
  });
});
