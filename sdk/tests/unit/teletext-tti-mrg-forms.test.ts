/**
 * MRG "Teletext Page Format" v1.1 forms the .tti reader and the edit.tf
 * frame must accept and keep:
 *   s.3   control codes as ESC + (code + 0x40) (edit.tf's own TTI export)
 *   s.2.6 OL rows past the 25-row frame (hidden row 25, packets X/26-X/28)
 */
import { decodeOLContent } from '../../teletext/marco/tti/ttiTranslations';
import { ttiToFrame, frameToTti } from '../../teletext/edittf-frame';
import { renderNativeTti } from '../../teletext/render-native';

const ESC = '\x1b';

describe('MRG s.3 Viewdata escape in OL payloads', () => {
  it('decodes ESC + (code + 0x40) as the control code', () => {
    // ESC A = alpha red (0x01), ESC W = mosaic white (0x17), ESC [ = ESC (0x1B)
    expect(decodeOLContent(`${ESC}AHi${ESC}W${ESC}[`)).toEqual([0x01, 0x48, 0x69, 0x17, 0x1b]);
  });

  it('decodes the same row identically in the +0x80 and escaped forms', () => {
    expect(decodeOLContent(`${ESC}M${ESC}CTITLE`)).toEqual(decodeOLContent('\x8d\x83TITLE'));
  });

  it('keeps a raw ESC that no MRG escape follows', () => {
    expect(decodeOLContent(`${ESC}a`)).toEqual([0x1b, 0x61]);
    expect(decodeOLContent(`x${ESC}`)).toEqual([0x78, 0x1b]);
  });

  it('renders an edit.tf-style escaped page like its +0x80 twin', () => {
    const escaped = renderNativeTti(`PN,10000\r\nOL,1,${ESC}A${ESC}MRED\r\n`);
    const high = renderNativeTti('PN,10000\r\nOL,1,\x81\x8dRED\r\n');
    expect(escaped).not.toBeNull();
    expect(escaped).toEqual(high);
  });

  it('puts escaped controls into the editor frame as control cells', () => {
    const { cells } = ttiToFrame(`PN,10000\nOL,3,${ESC}BG\n`);
    expect(Array.from(cells.subarray(120, 122))).toEqual([0x02, 0x47]);
  });
});

describe('OL rows past the frame survive the editor', () => {
  const packets = [
    'OL,25,hidden row twenty-five',
    'OL,26,@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklm',
    'OL,27,@QAAA~QBBB~QCCC~QDDD~Q@@@~Q@@@~',
    'OL,28,@AB@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
  ];
  const text = ['DE,t', 'PN,10000', 'SC,0000', 'OL,1,\x81TOP', ...packets, 'FL,100,200,300,400,8ff,100', ''].join('\n');

  it('keeps OL,25..28 byte-exact and writes them after the frame rows', () => {
    const { cells, meta } = ttiToFrame(text);
    const written = frameToTti(cells, meta);
    const lines = written.split('\n');
    for (const p of packets) expect(lines).toContain(p);
    expect(lines.indexOf('OL,1,\x81TOP')).toBeLessThan(lines.indexOf(packets[0]));
    expect(frameToTti(ttiToFrame(written).cells, ttiToFrame(written).meta)).toBe(written);
  });

  it('never draws them as screen rows', () => {
    const { cells } = ttiToFrame(text);
    const visible = String.fromCharCode(...Array.from(cells));
    expect(visible).not.toContain('hidden');
    expect(visible).not.toContain('ABCDEF');
  });
});
