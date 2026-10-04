/**
 * "Uploads no longer get their FILE_ID.DIZ" (sysop, 2026-10-04).
 *
 * The board runs SysCmd EXAMINE on every upload (express.e:19579), which is
 * File Description. Its config says `Depack_ZIP: Unzip -o %P file_id.diz` and
 * `Depack_LHA: Lha e %P file_id.diz %W`, and the door runs that line through
 * dos.library System() - LVO -606, SystemTagList. Captured with
 * DEBUG_LIBRARY_TRAPS=1 on the real FileDescription020.x before the fix:
 *
 *   Scanning file (Test.zip) for included description...
 *   [LibraryTraps] *** INTERCEPTED: dos.library.ReadItem() at PC=0xafda2 ***
 *   [FileManager] Open: "BBS:Node1/Work/file_id.diz" ... (NOT FOUND ...)
 *
 * 0xafda2 is dosBase-606. A "ReadItem" stub had been filed at -606 (ReadItem
 * is -810), and LibraryTraps keeps the LAST vector per trap address, so the
 * stub replaced SystemTagList: RC 0, nothing ran, no FILE_ID - for ZIP and
 * LHA alike. After the fix the same run logs
 * `SystemTagList("Unzip -o BBS:Node1/Playpen/Test.zip file_id.diz")` and the
 * door prints "Found!".
 *
 * The door binary is not in the repository, so this pins the unit that
 * decided: the vector tables LibraryTraps installs.
 */
import { DOS_VECTORS, EXEC_VECTORS } from '../../src/amiga-emulation/api/library-vectors';
import type { LibraryVector } from '../../src/amiga-emulation/api/library-vectors';
import {
  DOS_LVO_NAMES,
  EXEC_LVO_NAMES,
} from '../../src/amiga-emulation/constants/lvo-names.generated';

/** What LibraryTraps does: one trap per address, the later vector wins. */
function installedAt(vectors: LibraryVector[], offset: number): LibraryVector | undefined {
  const byOffset = new Map<number, LibraryVector>();
  for (const v of vectors) byOffset.set(v.offset, v);
  return byOffset.get(offset);
}

describe('a door that runs a shell command reaches System()', () => {
  it('runs the command File Description hands System() for a ZIP or LHA upload', () => {
    const vector = installedAt(DOS_VECTORS, -606);
    expect(vector?.name).toBe('SystemTagList');

    const lib = { SystemTagList: jest.fn() };
    const emu = { getRegister: jest.fn(() => 0) };
    vector!.handler(emu as never, lib as never);
    expect(lib.SystemTagList).toHaveBeenCalledTimes(1);
  });

  const tables: Array<[string, LibraryVector[], Record<number, string>]> = [
    ['dos.library', DOS_VECTORS, DOS_LVO_NAMES],
    ['exec.library', EXEC_VECTORS, EXEC_LVO_NAMES],
  ];

  it.each(tables)('%s gives no two vectors the same offset', (_lib, vectors) => {
    const seen = new Map<number, string>();
    const clashes: string[] = [];
    for (const v of vectors) {
      const prior = seen.get(v.offset);
      if (prior !== undefined) clashes.push(`${v.offset}: ${prior} / ${v.name}`);
      seen.set(v.offset, String(v.name));
    }
    expect(clashes).toEqual([]);
  });

  it.each(tables)('%s files every NDK function at its NDK offset', (_lib, vectors, ndk) => {
    const ndkOffsetOf = new Map<string, number>();
    for (const [offset, name] of Object.entries(ndk)) ndkOffsetOf.set(name, Number(offset));
    const misfiled: string[] = [];
    for (const v of vectors) {
      const want = v.name ? ndkOffsetOf.get(v.name) : undefined;
      if (want !== undefined && want !== v.offset) {
        misfiled.push(`${v.name} at ${v.offset}, NDK ${want} (${ndk[v.offset] ?? 'unnamed'} lives there)`);
      }
    }
    expect(misfiled).toEqual([]);
  });
});
