/**
 * Import keeps row 24 and the enhancement packets (EN 300 706 s.9.3.1,
 * s.9.4): from TTI (OL,24 and vbit2's OL,26/28/29 form) and from T42
 * (packets 24, 26, 28 and the magazine's M/29).
 */
import { importTti, importT42, exportPageToTti } from '../../teletext/marco/tti/index';
import { addParity, hammingEncode84 } from '../../teletext/marco/compile/hamming';
import { hammingEncode2418 } from '../../teletext/hamming2418';
import { packetToTtiContent, tripletValue, type Triplet } from '../../teletext/enhancement';
import { compileRow } from '../../teletext/marco/compile/index';

const END: Triplet = { address: 63, mode: 0x1f, data: 0 };
const SET_ROW_1: Triplet = { address: 41, mode: 0x04, data: 0 };
const COLOUR_AT_5: Triplet = { address: 5, mode: 0x00, data: 0x02 };

function rowText(subpageRow: Parameters<typeof compileRow>[0]): string {
  return String.fromCharCode(...compileRow(subpageRow).bytes40);
}

describe('TTI import keeps row 24 and OL,26-29', () => {
  const x26 = packetToTtiContent({ packet: 26, designation: 0, triplets: [SET_ROW_1, COLOUR_AT_5, END] });
  const x28 = packetToTtiContent({ packet: 28, designation: 0, triplets: [{ address: 1, mode: 2, data: 3 }] });
  const tti = ['PN,10000', 'SC,0000', 'PS,8000', 'OL,1,HELLO', 'OL,24,FASTEXT ROW', `OL,26,${x26}`, `OL,28,${x28}`, 'OL,27,Ignored'].join('\n');
  const subpage = importTti(tti).pages[0].subpages[0];

  it('keeps OL,24 as row 24', () => {
    expect(subpage.rows[24]?.index).toBe(24);
    expect(rowText(subpage.rows[24]).trimEnd()).toBe('FASTEXT ROW');
  });

  it('parses OL,26 and OL,28 into packets', () => {
    const [p26, p28] = subpage.enhancement ?? [];
    expect(p26.packet).toBe(26);
    expect(p26.triplets.slice(0, 3)).toEqual([SET_ROW_1, COLOUR_AT_5, END]);
    expect(p28.packet).toBe(28);
    expect(p28.triplets[0]).toEqual({ address: 1, mode: 2, data: 3 });
  });

  it('a page without them has 24 rows and no packets', () => {
    const plain = importTti('PN,10000\nOL,1,HELLO').pages[0].subpages[0];
    expect(plain.rows).toHaveLength(24);
    expect(plain.enhancement).toBeUndefined();
  });

  it('exports row 24 back', () => {
    const page = importTti(tti).pages[0];
    expect(exportPageToTti(page)).toMatch(/^OL,24,FASTEXT ROW/m);
  });
});

describe('T42 import keeps packets 24, 26, 28 and M/29', () => {
  const MAG = 1;

  function address(packet: number): number[] {
    return [hammingEncode84(MAG | ((packet & 1) << 3)), hammingEncode84(packet >> 1)];
  }
  function displayPacket(packet: number, text: string): number[] {
    const data = Array.from({ length: 40 }, (_, i) => addParity(i < text.length ? text.charCodeAt(i) : 0x20));
    return [...address(packet), ...data];
  }
  function header(page: number): number[] {
    const ham = [page & 0xf, page >> 4, 0, 0, 0, 0, 0, 0].map(hammingEncode84);
    const text = Array.from({ length: 32 }, () => addParity(0x20));
    return [...address(0), ...ham, ...text];
  }
  function enhancementPacket(packet: number, designation: number, triplets: Triplet[]): number[] {
    const data = [hammingEncode84(designation)];
    for (let i = 0; i < 13; i++) data.push(...hammingEncode2418(tripletValue(triplets[i] ?? END)));
    return [...address(packet), ...data];
  }

  const buffer = Uint8Array.from([
    ...enhancementPacket(29, 0, [{ address: 7, mode: 1, data: 9 }]),
    ...header(0x23),
    ...displayPacket(1, 'HELLO'),
    ...displayPacket(24, 'FASTEXT ROW'),
    ...enhancementPacket(26, 0, [SET_ROW_1, COLOUR_AT_5]),
    ...enhancementPacket(28, 0, [{ address: 1, mode: 2, data: 3 }]),
  ]);
  const subpage = importT42(buffer).pages[0].subpages[0];

  it('keeps packet 24 as row 24', () => {
    expect(rowText(subpage.rows[24]).trimEnd()).toBe('FASTEXT ROW');
  });

  it('decodes X/26, X/28 and the magazine M/29 with Hamming 24/18', () => {
    const byPacket = new Map((subpage.enhancement ?? []).map((p) => [p.packet, p]));
    expect(byPacket.get(26)?.triplets.slice(0, 3)).toEqual([SET_ROW_1, COLOUR_AT_5, END]);
    expect(byPacket.get(28)?.triplets[0]).toEqual({ address: 1, mode: 2, data: 3 });
    expect(byPacket.get(29)?.triplets[0]).toEqual({ address: 7, mode: 1, data: 9 });
  });
});
