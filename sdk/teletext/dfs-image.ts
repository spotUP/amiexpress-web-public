/**
 * Writing an Acorn DFS disc image, so a recovered program can be loaded.
 *
 * Telesoftware arrives as a byte-stream, and the emulator loads discs. This
 * builds the .ssd that bridges them: a standard DFS single-sided image with
 * a two-sector catalogue followed by the files.
 *
 * The layout is the one every BBC disc uses, and this board already reads
 * it - the catalogue parser that identified Thrust.ssd's boot option and
 * five files reads what this writes.
 */

/** DFS sectors are 256 bytes and the catalogue is the first two of them. */
export const SECTOR_BYTES = 256;
const CATALOGUE_SECTORS = 2;
/** A 40-track single-sided disc. 80 tracks would be 800. */
export const DEFAULT_SECTORS = 400;
/** DFS allows 31 files and no more. */
export const MAX_FILES = 31;

export interface DfsFile {
  /** Up to seven characters. Longer names are cut. */
  name: string;
  /** Single character, '$' for the root directory. */
  directory?: string;
  load?: number;
  exec?: number;
  locked?: boolean;
  data: Uint8Array;
}

export interface DfsOptions {
  /** Up to twelve characters. */
  title?: string;
  /** 0 none, 1 *LOAD, 2 *RUN, 3 *EXEC - what Shift+Break does. */
  bootOption?: 0 | 1 | 2 | 3;
  sectors?: number;
}

export class DfsError extends Error {}

/**
 * Build a .ssd image.
 *
 * Files are laid out in the order given, each starting on a sector
 * boundary, because DFS addresses files by start sector and length.
 */
export function buildDfsImage(files: readonly DfsFile[], options: DfsOptions = {}): Uint8Array {
  if (files.length > MAX_FILES) {
    throw new DfsError(`a DFS disc holds ${MAX_FILES} files, not ${files.length}`);
  }

  const sectors = options.sectors ?? DEFAULT_SECTORS;
  const image = new Uint8Array(sectors * SECTOR_BYTES);
  const title = (options.title ?? '').slice(0, 12).padEnd(12, ' ');

  // Catalogue: sector 0 holds the names, sector 1 the addresses, and the
  // twelve title characters are split across both.
  for (let i = 0; i < 8; i++) image[i] = title.charCodeAt(i);
  for (let i = 0; i < 4; i++) image[SECTOR_BYTES + i] = title.charCodeAt(8 + i);

  image[SECTOR_BYTES + 4] = 0; // cycle number
  image[SECTOR_BYTES + 5] = files.length * 8;
  image[SECTOR_BYTES + 6] =
    (((options.bootOption ?? 0) & 3) << 4) | ((sectors >> 8) & 3);
  image[SECTOR_BYTES + 7] = sectors & 0xff;

  let sector = CATALOGUE_SECTORS;
  files.forEach((file, index) => {
    const at = 8 + index * 8;
    const name = file.name.slice(0, 7).padEnd(7, ' ');
    for (let i = 0; i < 7; i++) image[at + i] = name.charCodeAt(i);
    image[at + 7] = (file.directory ?? '$').charCodeAt(0) | (file.locked ? 0x80 : 0);

    const load = file.load ?? 0x1900;
    const exec = file.exec ?? 0x1900;
    const length = file.data.length;
    const needed = Math.ceil(length / SECTOR_BYTES);
    if ((sector + needed) * SECTOR_BYTES > image.length) {
      throw new DfsError(`${file.name} does not fit: the disc holds ${sectors} sectors`);
    }

    const to = SECTOR_BYTES + at;
    image[to + 0] = load & 0xff;
    image[to + 1] = (load >> 8) & 0xff;
    image[to + 2] = exec & 0xff;
    image[to + 3] = (exec >> 8) & 0xff;
    image[to + 4] = length & 0xff;
    image[to + 5] = (length >> 8) & 0xff;
    // The spare bits of every address live together in one byte.
    image[to + 6] =
      (((exec >> 16) & 3) << 6) |
      (((length >> 16) & 3) << 4) |
      (((load >> 16) & 3) << 2) |
      ((sector >> 8) & 3);
    image[to + 7] = sector & 0xff;

    image.set(file.data, sector * SECTOR_BYTES);
    sector += needed;
  });

  return image;
}

/** How many sectors a set of files needs, catalogue included. */
export function sectorsFor(files: readonly DfsFile[]): number {
  return files.reduce(
    (total, file) => total + Math.ceil(file.data.length / SECTOR_BYTES),
    CATALOGUE_SECTORS,
  );
}
