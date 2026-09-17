/**
 * Writing a DFS disc image.
 *
 * Every assertion reads the catalogue back the way a BBC would: the two
 * catalogue sectors, then the file at the start sector it names. A writer
 * checked only against itself proves nothing, so the layout here is the one
 * documented by the format and the one this board's own parser already
 * reads off real 1980s discs.
 */
import { buildDfsImage, sectorsFor, SECTOR_BYTES, MAX_FILES, DfsError } from '../../teletext/dfs-image';

interface CatalogueEntry {
  name: string;
  directory: string;
  locked: boolean;
  length: number;
  startSector: number;
  load: number;
  exec: number;
}

/** Read a DFS catalogue, as a decoder would. */
function readCatalogue(image: Uint8Array) {
  const title = String.fromCharCode(...image.subarray(0, 8), ...image.subarray(256, 260)).trim();
  const count = image[256 + 5] / 8;
  const bootOption = (image[256 + 6] >> 4) & 3;
  const sectors = ((image[256 + 6] & 3) << 8) | image[256 + 7];
  const files: CatalogueEntry[] = [];
  for (let i = 0; i < count; i++) {
    const at = 8 + i * 8;
    const to = 256 + at;
    const spare = image[to + 6];
    files.push({
      name: String.fromCharCode(...image.subarray(at, at + 7)).trim(),
      directory: String.fromCharCode(image[at + 7] & 0x7f),
      locked: (image[at + 7] & 0x80) !== 0,
      load: image[to] | (image[to + 1] << 8) | (((spare >> 2) & 3) << 16),
      exec: image[to + 2] | (image[to + 3] << 8) | (((spare >> 6) & 3) << 16),
      length: image[to + 4] | (image[to + 5] << 8) | (((spare >> 4) & 3) << 16),
      startSector: image[to + 7] | ((spare & 3) << 8),
    });
  }
  return { title, bootOption, sectors, files };
}

const bytes = (text: string) => Uint8Array.from([...text].map(c => c.charCodeAt(0)));

describe('a disc image', () => {
  it('is whole sectors, and says how big it is', () => {
    const image = buildDfsImage([{ name: 'A', data: bytes('x') }], { sectors: 400 });
    expect(image.length).toBe(400 * SECTOR_BYTES);
    expect(readCatalogue(image).sectors).toBe(400);
  });

  it('carries a twelve character title across both catalogue sectors', () => {
    const image = buildDfsImage([], { title: 'CEEFAX 1985' });
    expect(readCatalogue(image).title).toBe('CEEFAX 1985');
  });

  it('names its files and where they start', () => {
    const image = buildDfsImage([
      { name: 'SNAKE', data: bytes('S'.repeat(300)) },
      { name: 'GOMOKU', data: bytes('G'.repeat(10)) },
    ]);
    const { files } = readCatalogue(image);
    expect(files.map(f => f.name)).toEqual(['SNAKE', 'GOMOKU']);
    expect(files[0].startSector).toBe(2);
    // 300 bytes is two sectors, so the next file follows at sector 4.
    expect(files[1].startSector).toBe(4);
    expect(files[0].length).toBe(300);
  });

  it('puts each file where its catalogue entry says', () => {
    const image = buildDfsImage([
      { name: 'FIRST', data: bytes('AAA') },
      { name: 'SECOND', data: bytes('BBB') },
    ]);
    for (const file of readCatalogue(image).files) {
      const at = file.startSector * SECTOR_BYTES;
      const content = String.fromCharCode(...image.subarray(at, at + file.length));
      expect(content).toBe(file.name === 'FIRST' ? 'AAA' : 'BBB');
    }
  });

  it('keeps addresses that need more than sixteen bits', () => {
    // Load and execution addresses carry two extra bits each, packed into
    // a byte they share with the length and the start sector.
    const image = buildDfsImage([{ name: 'HIGH', data: bytes('x'), load: 0x3ffff, exec: 0x2abcd }]);
    const [file] = readCatalogue(image).files;
    expect(file.load).toBe(0x3ffff);
    expect(file.exec).toBe(0x2abcd);
  });

  it('records the boot option and the locked flag', () => {
    const image = buildDfsImage([{ name: 'BOOT', data: bytes('x'), locked: true }], { bootOption: 3 });
    const read = readCatalogue(image);
    expect(read.bootOption).toBe(3);
    expect(read.files[0].locked).toBe(true);
  });

  it('cuts a name to the seven characters DFS allows', () => {
    const image = buildDfsImage([{ name: 'VERYLONGNAME', data: bytes('x') }]);
    expect(readCatalogue(image).files[0].name).toBe('VERYLON');
  });

  it('refuses more files than a DFS catalogue holds', () => {
    const many = [...Array(MAX_FILES + 1)].map((_unused, i) => ({ name: `F${i}`, data: bytes('x') }));
    expect(() => buildDfsImage(many)).toThrow(DfsError);
  });

  it('refuses to write past the end of the disc', () => {
    expect(() => buildDfsImage([{ name: 'BIG', data: new Uint8Array(200 * SECTOR_BYTES) }], { sectors: 40 }))
      .toThrow(/does not fit/);
  });

  it('counts the sectors a set of files needs, catalogue included', () => {
    expect(sectorsFor([])).toBe(2);
    expect(sectorsFor([{ name: 'A', data: new Uint8Array(SECTOR_BYTES + 1) }])).toBe(4);
  });
});
