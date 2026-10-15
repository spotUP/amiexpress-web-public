/**
 * One account, one node (express.e:29715-29727).
 *
 * `checkUserOnLine(1)` refuses a second simultaneous login by the same
 * account: it logs "User <name> already on another node!", shows the board's
 * ONENODE screen, and hangs up. This port had NO such check - the same account
 * could hold as many of the 24 nodes as it could open connections.
 *
 * Driven against the NODE FILES, because those are what the rule reads and
 * what a real AmiExpress and every door read too.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { boardNodeIds, userAlreadyOnNode } from '../../src/services/user-already-online';

let root: string;

/** A node<n>.user record, in the fixed-width shape NodeFileManager writes. */
function nodeUser(nodeId: number, name: string): void {
  const buffer = Buffer.alloc(512);
  // The name is a NUL-padded C string at the start of the record; the reader
  // has to cope with the padding, which a raw === never would.
  buffer.write(name, 0, 'latin1');
  fs.writeFileSync(path.join(root, `node${nodeId}.user`), buffer);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'one-node-'));
  for (const n of [0, 1, 2, 3]) fs.mkdirSync(path.join(root, `Node${n}`), { recursive: true });
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

jest.mock('../../src/services/NodeFileManager', () => ({
  nodeFileManager: {
    readNodeUserFile: (nodeId: number) => {
      const fsMod = require('fs');
      const pathMod = require('path');
      const file = pathMod.join(process.env.ONE_NODE_ROOT as string, `node${nodeId}.user`);
      if (!fsMod.existsSync(file)) return null;
      return { name: fsMod.readFileSync(file).toString('latin1').split('\0')[0] };
    },
  },
}));

beforeEach(() => { process.env.ONE_NODE_ROOT = root; });

it('finds the board every node it has, from the directories', () => {
  expect(boardNodeIds(root)).toEqual([0, 1, 2, 3]);
});

it('refuses a caller who is already on another node', () => {
  nodeUser(2, 'spot');
  expect(userAlreadyOnNode(root, 'spot', 1)).toBe(2);
});

it('does not refuse a caller because of their OWN node', () => {
  // The record for the node being logged into is this same login.
  nodeUser(1, 'spot');
  expect(userAlreadyOnNode(root, 'spot', 1)).toBeNull();
});

it('compares names the way the rest of the board does', () => {
  nodeUser(3, 'SpOt');
  expect(userAlreadyOnNode(root, 'spot', 1)).toBe(3);
  // NUL padding is what a fixed-width binary record is full of; a raw
  // comparison answers "nobody is online" for every caller.
  expect(userAlreadyOnNode(root, 'spot ', 1)).toBe(3);
});

it('lets a different caller in', () => {
  nodeUser(2, 'lamer');
  expect(userAlreadyOnNode(root, 'spot', 1)).toBeNull();
});

it('lets everyone in on a board where nobody is online', () => {
  expect(userAlreadyOnNode(root, 'spot', 1)).toBeNull();
});

it('never refuses on an empty or unreadable record', () => {
  fs.writeFileSync(path.join(root, 'node2.user'), Buffer.alloc(512));
  expect(userAlreadyOnNode(root, 'spot', 1)).toBeNull();
});
