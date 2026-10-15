/**
 * The file-record rung: a 68K door's file listing, rendered the way the
 * board's own listing renders one.
 *
 * WHAT IT IS FOR. `F`, `FR` and `N` on this board are AquaScan, a 68K door,
 * and a C64 caller reaching it through the frame adapter gets whatever the
 * door painted for 80 columns, folded by the ladder. The board's OWN listing
 * at 40 columns prints a C*Base-native row from `Prompts/FILEVIEW.40`. Those
 * are two different screens for the same records, and the whole C64 file view
 * exists to make them one.
 *
 * SO THIS READS THE DOOR'S OUTPUT BACK. A DIR row printed by AquaScan has the
 * same grammar as the DIR file it came from - that grammar lives in
 * `sdk/petscii/frame/dir-grammar.ts` and BOTH sides use it, so they cannot
 * drift - and a row it recognises is re-rendered through the same interpreter
 * and the same layout the internal listing uses.
 *
 * WHAT IT DOES NOT DO. It never invents a record. A row the grammar declines
 * falls through to the ladder untouched, which is every non-listing screen the
 * door paints: menus, prompts, its own banner. And a LIST row needs nothing
 * from the file index - ordinal, size, marker, filename and date all come from
 * the row the door printed - so the rung is useful before the index has a
 * single entry in it.
 */
import type { Cell, Frame } from '@amiexpress/bbs-door-sdk/petscii/frame';
import {
  blankCell,
  dirSizeToBytes,
  isDirContinuationRow,
  parseDirRecordRow,
  renderFileRow,
} from '@amiexpress/bbs-door-sdk/petscii/frame';

import type { CompiledFileLayout } from '../services/file-layout.service';

/** The text of one frame row, without its trailing blanks. */
function rowText(frame: Frame, y: number): string {
  return frame.cells[y].map((c) => c.ch).join('').replace(/\s+$/, '');
}

/**
 * `~c0|`..`~c7|`, as the MCI dispatch maps them - VIC pens, not ANSI colours.
 * Kept beside the rung because THIS path has no MCI stage to ask.
 */
const MCI_PEN_VIC = [0, 2, 5, 7, 6, 4, 3, 1] as const;

/**
 * Turn a rendered row into cells, resolving the template's own colours.
 *
 * THERE IS NO MCI STAGE ON THIS PATH. The internal listing hands its rows to
 * `parseMciCodes` before the socket; the adapter builds CELLS, so a `~c7|`
 * left in the string would reach a C64 as the literal text `~c7|` - which is
 * exactly what it did until this test caught it, the third time that mistake
 * has been made in this lane.
 *
 * So the codes are resolved HERE, into attributes: `~cN|` switches the pen for
 * the cells that follow, every other MCI token is dropped, and a row with no
 * colour of its own inherits the source row's first non-blank cell - so a
 * listing a door painted in cyan stays cyan.
 */
function cellsFor(text: string, source: readonly Readonly<Cell>[], cols: number): Cell[] {
  const inherited = source.find((c) => c.ch !== ' ') ?? blankCell();
  const out: Cell[] = [];
  let pen = inherited.fg;

  const token = /~(\d*)([A-Za-z_][A-Za-z0-9_]*)\|/g;
  let last = 0;
  let match: RegExpExecArray | null;
  const push = (chunk: string) => {
    for (const ch of chunk) {
      if (out.length >= cols) return;
      out.push({ ...blankCell(), ...inherited, fg: pen, ch });
    }
  };

  while ((match = token.exec(text)) !== null) {
    push(text.slice(last, match.index));
    last = match.index + match[0].length;
    const code = match[2].toLowerCase();
    if (/^c[0-7]$/.test(code)) pen = MCI_PEN_VIC[Number(code[1])];
  }
  push(text.slice(last));

  while (out.length < cols) out.push({ ...blankCell(), ...inherited, fg: pen, ch: ' ' });
  return out;
}

export interface FileRecordRungOptions {
  layout: CompiledFileLayout;
  cols: number;
  /** Bumped per record so the ordinal a caller reads matches `FI <n>`. */
  nextOrdinal: () => number;
}

/**
 * The `blockRenderer` the adapter hands to `adaptRows`.
 *
 * One frame, one closure, one layout snapshot - taken by the caller before the
 * frame is adapted, so a sysop saving `FILEVIEW.40` mid-listing cannot split a
 * screen between two layouts.
 */
export function fileRecordRung(opts: FileRecordRungOptions) {
  return (frame: Frame, y: number): { rows: Cell[][]; consumed: number } | null => {
    const record = parseDirRecordRow(rowText(frame, y));
    if (!record) return null;

    // THE GRAMMAR ALONE IS TOO WEAK HERE, and the corpus proved it. On disk a
    // DIR file holds nothing but records, so a shape test - a marker at column
    // 13, a space at 12 - is enough for the reader. A DOOR paints anything:
    // `games`, `what` and `dRE!WAll` all have menu rows with a P where the
    // marker would be, and the rung claimed them and rendered a "record" made
    // of a menu.
    //
    // So a row this path accepts must also carry the two fields a record
    // cannot be without: a SIZE that is a number, and a DATE that has the
    // shape of one. Both are cheap, and a false positive here costs a caller a
    // row of his door.
    if (!/^\d+(KB?|MB?|GB?)?$/i.test(record.sizeText)) return null;
    if (record.dateText === '') return null;

    // The description block belongs to this record: consume it so the ladder
    // does not adapt it a second time on its own. A LIST row discards it,
    // and discarding is still consuming.
    let consumed = 1;
    while (y + consumed < frame.rows && isDirContinuationRow(rowText(frame, y + consumed))) {
      consumed++;
    }

    const rendered = renderFileRow(
      {
        num: opts.nextOrdinal(),
        name: record.filename,
        sizeBytes: dirSizeToBytes(record.sizeText),
        sizeText: record.sizeText,
        flag: record.marker,
        // A door's own listing cannot know what is new to THIS caller: the
        // flag is per caller and the door was given no new-since date. It
        // holds its column rather than claiming something untrue.
        isNew: false,
        date: record.dateText,
      },
      opts.layout.row,
      opts.cols,
    );

    return { rows: [cellsFor(rendered, frame.cells[y], opts.cols)], consumed };
  };
}
