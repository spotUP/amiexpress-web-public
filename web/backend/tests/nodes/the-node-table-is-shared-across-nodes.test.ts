/**
 * The MULTICOM node table is ONE block of public memory on the Amiga
 * (ACP.e:2307-2354): what a door on node 1 writes there - its time in chat,
 * its chat request in node 2's stats - is what a door on node 2 reads. This
 * port runs one emulator per node, each with its own copy, so NodeChat on two
 * nodes never saw each other (CHAT1, 2026-10-05). MulticomManager now passes a
 * door's writes on to every other node's emulator, and gives a door that
 * starts later the table as the others left it.
 */
import { MulticomManager } from '../../src/nodes/MulticomManager';
import { MULTICOM_MY_NODE_ARRAY, MULTICOM_SINGLE_PORTS } from '../../src/amiga-emulation/memory-map';

const MY_NODE_ARRAY_BASE = MULTICOM_MY_NODE_ARRAY;
const MY_NODE_SIZE = 124;
const SINGLE_PORTS_BASE = MULTICOM_SINGLE_PORTS;
const SINGLE_PORT_SIZE = 512;
const tOf = (node: number) => MY_NODE_ARRAY_BASE + node * MY_NODE_SIZE + 0x70;

/** A big-endian, byte-addressed emulator memory. */
function byteEmulator() {
  const mem = new Map<number, number>();
  const rd = (a: number) => mem.get(a) ?? 0;
  const wr = (a: number, v: number) => { mem.set(a, v & 0xff); };
  return {
    readMemory: rd,
    writeMemory: wr,
    readMemory16: (a: number) => (rd(a) << 8) | rd(a + 1),
    writeMemory16: (a: number, v: number) => { wr(a, v >> 8); wr(a + 1, v); },
    readMemory32: (a: number) => ((rd(a) << 24) | (rd(a + 1) << 16) | (rd(a + 2) << 8) | rd(a + 3)) >>> 0,
    writeMemory32: (a: number, v: number) => { wr(a, v >>> 24); wr(a + 1, v >>> 16); wr(a + 2, v >>> 8); wr(a + 3, v); },
  } as any;
}

describe('the MULTICOM table is shared between nodes', () => {
  it("passes a door's write on to the other nodes, and to a door that starts later", () => {
    const manager = new MulticomManager();
    const node1 = byteEmulator();
    const node2 = byteEmulator();
    manager.initializeInEmulator(node1, 'chat-node1', 1);
    manager.initializeInEmulator(node2, 'chat-node2', 2);

    // NodeChat on node 1 stamps its time in chat.
    node1.writeMemory32(tOf(1), 0x6a1b2c3d);
    manager.syncFromEmulator(node1, 1_000_000);

    expect(node2.readMemory32(tOf(1))).toBe(0x6a1b2c3d);

    const node3 = byteEmulator();
    manager.initializeInEmulator(node3, 'chat-node3', 3);
    expect(node3.readMemory32(tOf(1))).toBe(0x6a1b2c3d);
  });

  it("keeps each emulator's own .s link and port internals out of it", () => {
    const manager = new MulticomManager();
    const rtw = byteEmulator();
    const chat = byteEmulator();
    manager.initializeInEmulator(rtw, 'rtw', 1, 8);   // RTW: links only 8 nodes
    manager.initializeInEmulator(chat, 'chat', 2);

    chat.writeMemory32(SINGLE_PORTS_BASE + 2 * SINGLE_PORT_SIZE + 4, 0x12230c); // chat's own port
    manager.syncFromEmulator(chat, 1_000_000);

    expect(rtw.readMemory32(MY_NODE_ARRAY_BASE + 20 * MY_NODE_SIZE + 0x74)).toBe(0);
    expect(rtw.readMemory32(SINGLE_PORTS_BASE + 2 * SINGLE_PORT_SIZE + 4)).toBe(0);
  });

  it("does not reset a chatting door's time when the board updates that node", () => {
    const manager = new MulticomManager();
    const node1 = byteEmulator();
    const node2 = byteEmulator();
    manager.initializeInEmulator(node1, 'a', 1);
    manager.initializeInEmulator(node2, 'b', 2);
    node1.writeMemory32(tOf(1), 0x01020304);
    manager.syncFromEmulator(node1, 1_000_000);

    manager.updateNode(1, 'spot', 'Uprough', 3);

    expect(node2.readMemory32(tOf(1))).toBe(0x01020304);
  });
});
