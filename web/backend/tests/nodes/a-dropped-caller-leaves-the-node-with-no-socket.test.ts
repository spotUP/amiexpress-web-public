/**
 * express.e dropDTR 795-834 and resetSystem 843-907: when a caller is dropped
 * the node's myNode entry gets netSocket:=-1 (express.e:803-808, 861-866) and,
 * while a caller is on, offHook is FALSE (express.e:825-830, 899-904 - ACP only
 * hands connections to nodes with offHook=FALSE, ACP.e:3724).
 * The serial half (CloseSerial, ATZ, setBaud, rePurge) has no web equivalent:
 * the web node has no modem; the browser/telnet socket close is the hang-up.
 * KEPT divergence: an emptied slot reads offHook TRUE (ACP.e:2321 initial
 * value) where express.e leaves FALSE; only ACP reads that field, doors read netSocket.
 */
import { MulticomManager } from '../../src/nodes/MulticomManager';
import { MULTICOM_MY_NODE_ARRAY } from '../../src/amiga-emulation/memory-map';

const SIZE = 124;
const at = (node: number) => MULTICOM_MY_NODE_ARRAY + node * SIZE;

function byteEmulator() {
  const mem = new Map<number, number>();
  const rd = (a: number) => mem.get(a) ?? 0;
  const wr = (a: number, v: number) => { mem.set(a, v & 0xff); };
  return {
    readMemory: rd, writeMemory: wr,
    readMemory16: (a: number) => (rd(a) << 8) | rd(a + 1),
    writeMemory16: (a: number, v: number) => { wr(a, v >> 8); wr(a + 1, v); },
    readMemory32: (a: number) => ((rd(a) << 24) | (rd(a + 1) << 16) | (rd(a + 2) << 8) | rd(a + 3)) >>> 0,
    writeMemory32: (a: number, v: number) => { wr(a, v >>> 24); wr(a + 1, v >>> 16); wr(a + 2, v >>> 8); wr(a + 3, v); },
  } as any;
}

describe('dropping a caller (dropDTR / resetSystem)', () => {
  it('a caller on a node has a socket and offHook FALSE; clearing it sets netSocket to -1', () => {
    const manager = new MulticomManager();
    const emu = byteEmulator();
    manager.initializeInEmulator(emu, 's1', 1);
    manager.updateNode(1, 'spot', 'Uprough', 3);

    expect(emu.readMemory32(at(1) + 0x20) | 0).toBeGreaterThanOrEqual(0);
    expect(emu.readMemory32(at(1) + 0x28)).toBe(0);

    manager.clearNode(1);

    expect(emu.readMemory32(at(1) + 0x20) | 0).toBe(-1);
    expect(emu.readMemory(at(1))).toBe(0); // handle emptied
  });
});
