/**
 * ONE DOOR'S EXIT MUST NOT WIPE ANOTHER DOOR'S LIVE PORT.
 *
 * `clearNode` zeroes a node's entry in every registered emulator, which is
 * right for the who-is-online view: a door showing the node list must stop
 * showing a caller who has gone.
 *
 * It is wrong for an emulator that IS that node. `singlePort` is where that
 * emulator's own door keeps its message port, and a wiped port does not make
 * the door fail - it makes it RETRY, for ever. The board fills with
 * `[ExecLibrary] Port not found: 0x...` (api/ExecLibrary.ts:5222), the node
 * never comes back, and every reconnect adds another spinner.
 *
 * That is how the sysop's board jammed on 2026-09-15 - "the whole bbs seems
 * jammed now". His GWall door was live on node 1 when the MultiTop logoff
 * batch, also node 1, finished and cleared node 1 in ALL emulators.
 *
 * Two sessions shared node 1 because `sessionId` fell back to
 * `session-<nodeId>`: every door on a node was one registry key, overwriting
 * the last. His log had six registrations, all `session-1`. That is fixed in
 * AmigaDoorSession (each door session now carries its own id); this pins the
 * invariant that makes the damage unreachable even when two sessions do share
 * a node.
 */
import { MulticomManager } from '../../src/nodes/MulticomManager';

const MY_NODE_ARRAY_BASE = 0x1E003A;
const SINGLE_PORTS_BASE = 0x1E1000;
const MY_NODE_SIZE = 124;
const SINGLE_PORT_SIZE = 512;

/** The address a door's own port occupies for `nodeId`. */
const singlePortOf = (nodeId: number) => SINGLE_PORTS_BASE + nodeId * SINGLE_PORT_SIZE;
const myNodeOf = (nodeId: number) => MY_NODE_ARRAY_BASE + nodeId * MY_NODE_SIZE;

/** An emulator that records every byte written, so a wipe is visible. */
function fakeEmulator() {
  const mem = new Map<number, number>();
  return {
    mem,
    writeMemory: (addr: number, value: number) => { mem.set(addr, value); },
    writeMemory16: (addr: number, value: number) => { mem.set(addr, value); },
    writeMemory32: (addr: number, value: number) => { mem.set(addr, value); },
    readMemory: (addr: number) => mem.get(addr) ?? 0,
    readMemory16: (addr: number) => mem.get(addr) ?? 0,
    readMemory32: (addr: number) => mem.get(addr) ?? 0,
    writeString: () => {},
    readString: () => '',
  } as any;
}

/** Registered as a live door on `nodeId`, with a port marked in its own slot. */
function aLiveDoorOn(manager: MulticomManager, sessionId: string, nodeId: number) {
  const emulator = fakeEmulator();
  manager.initializeInEmulator(emulator, sessionId, nodeId);
  // The door's port, written where ExecLibrary would keep it.
  const portAddr = singlePortOf(nodeId) + 4;
  emulator.writeMemory32(portAddr, 0x12230c);
  return { emulator, portAddr };
}

describe('one door exiting does not wipe another door on the same node', () => {
  it("keeps the live door's own port when another session on that node exits", () => {
    const manager = new MulticomManager();
    const live = aLiveDoorOn(manager, 'caller-gwall', 1);
    aLiveDoorOn(manager, 'batch-multitop', 1);

    // The batch finishes and clears node 1, naming itself as the caller.
    manager.clearNode(1, 'batch-multitop');

    // The caller's door is still running and its port must still be there.
    // Before the fix this read 0 and GWall span on "Port not found" for ever.
    expect(live.emulator.readMemory32(live.portAddr)).toBe(0x12230c);
  });

  it('still clears the node in the emulator that is exiting', () => {
    const manager = new MulticomManager();
    const leaving = aLiveDoorOn(manager, 'batch-multitop', 1);

    manager.clearNode(1, 'batch-multitop');

    expect(leaving.emulator.readMemory32(leaving.portAddr)).toBe(0);
  });

  it('still clears the node in emulators that are OTHER nodes, so who-is-online is right', () => {
    // The whole point of clearing everywhere: node 3's door must stop showing
    // node 1 as occupied.
    const manager = new MulticomManager();
    const onlooker = aLiveDoorOn(manager, 'caller-node3', 3);
    const marker = myNodeOf(1);
    onlooker.emulator.writeMemory32(marker, 0xdeadbeef);

    manager.clearNode(1, 'batch-multitop');

    expect(onlooker.emulator.readMemory32(marker)).toBe(0);
  });
});
