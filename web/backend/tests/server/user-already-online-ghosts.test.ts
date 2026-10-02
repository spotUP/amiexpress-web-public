/**
 * Ghost sessions, pinned at the unit level (2026-09-10).
 *
 * Two compounding defects refused real callers:
 * 1. userSessions/socketToUser were written with raw numeric ids while
 *    every lookup and delete uses strings - Map(5) !== Map("5").
 * 2. userAlreadyOnNode reads node<n>.user disk files that only delete
 *    at clean logoff, so a fast re-login was refused against its OWN
 *    stale file from a missed teardown.
 *
 * These tests build a temp board (Node dirs + real node user files via
 * NodeFileManager) and assert: a name match with no live session behind
 * it is NOT a refusal (and the stale file is collected), while a match
 * with a live session still refuses, and the default (no predicate)
 * keeps the old disk-only behavior.
 */
process.env.SKIP_SERVER_START = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NodeFileManager } from '../../src/services/NodeFileManager';
import { userAlreadyOnNode } from '../../src/services/user-already-online';

let dir = '';
let mgr: NodeFileManager;

const user = (username: string): any => ({
  id: 7,
  username,
  password: '',
  secLevel: 10,
  timesOn: 1,
  // A logged-on User from the database carries its account date; the node
  // file is the user struct, which holds it (UserFileManager.userRecord).
  created: new Date(0),
});

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghost-'));
  // A board has Node<n>/ DIRS (what boardNodeIds scans) beside the
  // node<n>.user FILES (what the checker reads).
  fs.mkdirSync(path.join(dir, 'Node1'));
  fs.mkdirSync(path.join(dir, 'Node2'));
  mgr = new NodeFileManager(dir);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('userAlreadyOnNode ghost guard', () => {
  const live = () => true;
  const dead = () => false;
  const check = (name: string, except: number, isLive?: (n: number) => boolean, onStale?: (n: number) => void) =>
    userAlreadyOnNode(dir, name, except, isLive, onStale, mgr);

  test('a live match still refuses', () => {
    mgr.writeNodeUserFile(2, user('Infant'));
    expect(check('infant', 1, live)).toBe(2);
  });

  test('a stale file is not a refusal and gets collected', () => {
    mgr.writeNodeUserFile(2, user('Infant'));
    const collected: number[] = [];
    expect(check('infant', 1, dead, (n) => collected.push(n))).toBeNull();
    expect(collected).toEqual([2]);
  });

  test('without a predicate nothing changes (disk-only, as before)', () => {
    mgr.writeNodeUserFile(2, user('Infant'));
    expect(check('infant', 1)).toBe(2);
  });

  test('own node is still excluded', () => {
    mgr.writeNodeUserFile(1, user('Infant'));
    expect(check('infant', 1, live)).toBeNull();
  });

  test('the infant sequence: own stale file on another node does not refuse', () => {
    // Previous session died on node 2 without teardown; the caller is
    // back on node 1. Disk says Infant-on-2, no session backs it.
    mgr.writeNodeUserFile(2, user('Infant'));
    const liveSet = new Set<number>();
    expect(check('Infant', 1, (n) => liveSet.has(n))).toBeNull();
    // Default collection runs through the same store: the file is gone,
    // so the NEXT login does not trip over it either.
    expect(fs.existsSync(path.join(dir, 'node2.user'))).toBe(false);
  });
});
