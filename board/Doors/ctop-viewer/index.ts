/**
 * CTOP - Conference Top Uploaders, ported from Conftop-II.
 *
 * The Amiga door is `Doors/Conftop/ctop`, a 68K binary by REbEL/QTX whose
 * source is in `~/Code/Reference/AmiExpressEDoorSources/
 * Conftop-II/ctop.e`. It was served to a C64 caller through the board's frame
 * adapter, which takes an eighty-column screen apart row by row - and a table
 * IS its columns, so what a C64 got was not a table. The sysop asked for the
 * same treatment GL got: "so it should be fixed like we did with the others
 * add a proper c64 view to conftop" (2026-09-22).
 *
 * THREE SCREENS, as every door on this board owes:
 *   80 columns - byte for byte what the 68K painted, pinned to a capture of
 *                the real binary (`tests/doors/ctop`)
 *   wider      - the same table with the surplus spent on the two fields the
 *                Amiga was cutting off, the handle and the location
 *   40 columns - its own layout: rank, handle, files, bytes, and a footer
 *                that keeps both record holders
 *
 * AND THE PERIOD STILL ROLLS. The 68K door is the only thing on this board
 * that ends a week and names its winner, so the port carries that too - see
 * `src/reset.ts`, which is why this is a port and not a viewer.
 */
import { ServerDoor, DoorContext } from '@amiexpress/bbs-door-sdk';
import * as path from 'path';

import { loadCtopArt, NO_ART } from './src/art';
import { loadCtopSettings, type CtopSettings } from './src/settings';
import { performReset, readCtopFile, resetIsDue } from './src/reset';
import { NARROW_WIDTH, renderNarrowScreen } from './src/narrow';
import { renderWideScreen, renderWideTable, type CtopScreen } from './src/wide';
import { aggregateCtop, decodeCtopHeader, toAmigaDays } from '@amiexpress/bbs-door-sdk/formats/ctop-data';

export const metadata = {
  name: 'Conference Top Uploaders',
  version: '1.0.0',
  description: 'The conference upload table, drawn for 40, 80 and wider screens',
  author: 'REbEL/QTX (Amiga), ported to TypeScript',
  command: 'CTOP',
};

/** This door's own directory, for a `Conftop.header` the sysop put beside it. */
const DOOR_ROOT = __dirname;

/** The caller's screen, as the board's one width source reports it. */
function columnsOf(ctx: DoorContext): number {
  const session = (ctx as unknown as { bbsSession?: { screenWidth?: number } }).bbsSession;
  const width = Number(session?.screenWidth ?? 80);
  return Number.isFinite(width) && width > 0 ? width : 80;
}

/** How many rows the caller's screen has. */
function rowsOf(ctx: DoorContext): number {
  const session = (ctx as unknown as { bbsSession?: { screenHeight?: number } }).bbsSession;
  const rows = Number(session?.screenHeight ?? 25);
  return Number.isFinite(rows) && rows > 0 ? rows : 25;
}

/** The conference this caller is in, and what the board calls it. */
function conferenceOf(ctx: DoorContext): { number: number; name: string } {
  const session = (ctx as unknown as {
    bbsSession?: { currentConf?: number; currentConfName?: string };
  }).bbsSession;
  return {
    number: Number(session?.currentConf ?? 1) || 1,
    name: session?.currentConfName ?? '',
  };
}

/**
 * The table as text, for the mail and the bulletin.
 *
 * Eighty columns without the pens: a message read in the editor, or a
 * bulletin a sysop may open in a text editor, has no use for them.
 */
function plainTable(screen: CtopScreen): string {
  return renderWideTable(screen, true, 80)
    .map(line => line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ''))
    .join('\n');
}

const door = new ServerDoor(metadata);

door.onStart(async (ctx: DoorContext) => {
  const { socket, bbs } = ctx;
  if (!socket) {
    console.error('[ctop] Socket missing from context');
    return;
  }

  const write = (line: string): void => { socket.emit('ansi-output', line + '\r\n'); };

  try {
    if (!bbs?.getConferencePath || !bbs.readTooltypes) {
      write('\x1b[31mThis board cannot tell the door which conference it is in.\x1b[0m');
      return;
    }

    const conference = conferenceOf(ctx);
    const conferenceDir = bbs.getConferencePath(conference.number);
    const settings: CtopSettings = loadCtopSettings(
      (candidate) => {
        const tooltypes = bbs.readTooltypes!(candidate);
        return Object.keys(tooltypes).length > 0 ? tooltypes : null;
      },
      conferenceDir,
    );

    if (!settings.installed) {
      // Exactly what the Amiga door says, and for the same reason: no
      // `Conftop.info` in the conference means the sysop has not put the
      // table here (ctop.e:1136).
      write('Conference Top Uploaders is not installed in this conference.');
      return;
    }

    const columns = columnsOf(ctx);
    const narrow = columns <= NARROW_WIDTH;
    const dataPath = path.join(conferenceDir, settings.dataFile);
    const today = toAmigaDays(new Date());

    if (resetIsDue(dataPath, today)) {
      write(readCtopFile(dataPath) ? 'Resetting Conference Top Uploaders...' : 'Creating datafile...');
      const outcome = performReset(conferenceDir, settings.dataFile, settings.schedule, today);

      /*
       * The final table goes out before the slate is wiped from the screen's
       * point of view: the mail and the bulletin describe the period that
       * ENDED, which is the one nobody can read off the file any more.
       */
      const ended: CtopScreen = {
        period: outcome.ended,
        conferenceName: settings.conferenceName || conference.name,
        today,
        rows: settings.rows,
        skipEmpty: settings.skipEmpty,
        minLimit: settings.minLimit,
        showResetDate: settings.showResetDate,
      };

      if (settings.mailUser) {
        write(`Sending message to: (${settings.mailUser})`);
        await bbs.sendMessage(settings.mailUser, settings.subject, plainTable(ended));
      }
      if (settings.bullFile) {
        // `BBS:Bulletins/bull7.txt` is a board-relative path with a volume
        // name on it; the board's own writer takes it from there.
        const bulletin = settings.bullFile.replace(/^[A-Za-z0-9_]+:/, '');
        write(`Writing bulletin to: (${settings.bullFile})`);
        await bbs.writeFile(bulletin, plainTable(ended));
      }
    }

    const data = readCtopFile(dataPath)
      ?? aggregateCtop(decodeCtopHeader(Buffer.alloc(96)), []);
    const screen: CtopScreen = {
      period: data,
      conferenceName: settings.conferenceName || conference.name,
      today,
      rows: settings.rows,
      skipEmpty: settings.skipEmpty,
      minLimit: settings.minLimit,
      showResetDate: settings.showResetDate,
    };

    const art = loadCtopArt([conferenceDir, DOOR_ROOT], narrow) ?? NO_ART;
    const lines = narrow
      ? renderNarrowScreen(screen, art, rowsOf(ctx))
      : renderWideScreen(screen, art, columns);

    /*
     * ONE WRITE. Every line is already built to the caller's width, so the
     * screen goes out as a single emit rather than one per row - a forty-
     * column caller on a modem reads the difference.
     */
    socket.emit('ansi-output', lines.map(line => line + '\r\n').join(''));
  } catch (error) {
    write(`\x1b[31mCTOP: ${(error as Error).message}\x1b[0m`);
  }
});

export default door;
