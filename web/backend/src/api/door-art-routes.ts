/**
 * Door art, on the ARTIST lane.
 *
 * Level 100 is this board's ANSI artists (sysop, 2026-09-14), and the admin
 * offers them Screens and nothing else - which is where the Studio lists a
 * door's art beside the screen files. These three endpoints were mounted
 * under `/api/config`, behind `requireSysop()`, so the Studio drew the cards
 * and every artist who clicked one got a 403: the people who draw the art
 * could not reach it.
 *
 * They live here instead, mounted at `requireLevel(100)` beside
 * `/api/screens` and `/api/themes`. What an artist can reach through them is
 * exactly the art: every call is scoped to the sections a door's manifest
 * DECLARES as art, so a setting, a bulletin row and a conference mask are
 * all as far out of reach as they were when this was sysop-only.
 */
import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

import { config } from '../config';
import { getSystemTime } from '../utils/date-time.util';

/** The envelope every admin API answers in. */
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  timestamp: string;
}
import {
  doorDirectoryFor,
  listDoorArtSections,
  readDoorArtSections,
  readDoorArtVariant,
  writeDoorArtSection,
  writeDoorArtVariant,
} from '../doors/door-settings.service';
import { isArtVariant, ART_VARIANTS, readVariant } from '../doors/door-art-variants';

/** One registered door, as far as this router is concerned. */
export interface ArtDoor {
  command: string;
  name?: string;
  location?: string;
}

/**
 * `getDoors` is injectable for the same reason the file shadow's readers
 * are: the real one lives behind a `require` of door.handler, which boots
 * the board, and a route test has no business starting a BBS to ask which
 * doors have a logo.
 */
export function createDoorArtRouter(opts: { getDoors?: () => ArtDoor[] } = {}): Router {
  const router = Router();
  const doors = (): ArtDoor[] => {
    if (opts.getDoors) return opts.getDoors();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../handlers/door.handler').getDoors();
  };

  /**
   * The directory a door's art lives in, for READ and WRITE as well as the
   * listing: a registered command's directory, else the Doors/ directory whose
   * manifest names this command. The listing already joined the doors nobody
   * types (QuickNew, the multi-check file checker); without this the Studio
   * showed the card and every open or save of it answered 404.
   */
  const artDoorDirFor = (command: string): string | null => {
    const door = doors().find((d) => String(d.command).toUpperCase() === command);
    if (door) return doorDirectoryFor(config.get('dataDir'), door);
    try {
      const doorsRoot = path.join(config.get('dataDir'), 'Doors');
      for (const entry of fs.readdirSync(doorsRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const doorDir = path.join(doorsRoot, entry.name);
        const manifestPath = path.join(doorDir, 'door.settings.json');
        if (!fs.existsSync(manifestPath)) continue;
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { command?: string };
          if ((manifest.command || entry.name).toUpperCase() === command) return doorDir;
        } catch {
          continue;
        }
      }
    } catch {
      /* no Doors directory */
    }
    return null;
  };

  const sendResponse = <T>(res: Response, data: T, message?: string) => {
    const response: ApiResponse<T> = {
      success: true,
      data,
      message,
      timestamp: getSystemTime().toISOString(),
    };
    res.json(response);
  };

  const handleError = (res: Response, error: unknown) => {
console.error('Door art API error:', error);
    const message = error instanceof Error ? error.message : 'An error occurred';
    // A value that names something outside the door is the CALLER's mistake,
    // not the board's: it arrives from a settings form and must read as 400,
    // or a traversal attempt looks to the admin exactly like a broken server.
    const badValue = message.includes('outside this door')
                  || message.includes('not a file inside')
                  || message.includes('link out of');
    const statusCode = message.includes('not found') || message.includes('No door') ? 404
                     : badValue ? 400
                     : message.includes('at most') || message.includes('must be') ? 400
                     : 500;
    res.status(statusCode).json({
      success: false,
      message,
      timestamp: getSystemTime().toISOString(),
    });
  };

  /**
   * GET /api/door-art
   *
   * Every door's Studio-editable art sections (door, file, section, label,
   * live line counts — no bodies). The ANSI Studio door-art tab lists these
   * beside the door files it already shows. Doors without artSections are
   * absent, never errors: most doors have none.
   */
  router.get('/', async (req: Request, res: Response) => {
    /*
     * Which narrow drawings exist travels with the list, so the Screen
     * Designer's cards can say "not drawn for this format" without asking
     * every door for its bodies first.
     */
    const artRoot = path.join(config.get('dataDir'), 'Screens');
    const listWithVariants = (doorDir: string, command: string) =>
      listDoorArtSections(doorDir, command).map(section => ({
        ...section,
        variants: Object.fromEntries(ART_VARIANTS.map(variant =>
          [variant, readVariant(artRoot, command, section.section, variant) !== null])),
      }));

    try {
      const out: Array<Record<string, unknown>> = [];
      const seen = new Set<string>();
      for (const door of doors()) {
        try {
          const doorDir = doorDirectoryFor(config.get('dataDir'), door);
          if (!doorDir) continue;
          const sections = listWithVariants(doorDir, door.command);
          if (sections.length === 0) continue;
          seen.add(door.command.toUpperCase());
          out.push({
            command: door.command,
            name: door.name || door.command,
            sections,
          });
        } catch {
          continue; // no manifest or no art: not an error, just absent
        }
      }

      /*
       * AND THE DOORS NOBODY TYPES.
       *
       * `getDoors()` is the list of registered COMMANDS, and art is not a
       * command's property - it is a door directory's. QuickNew is a logoff
       * batch utility with no `Commands/BBSCmd` icon at all, and its config
       * holds the templates that ARE the new-files screen; without this it
       * declared its art, the manifest was valid, the service listed it, and
       * the Studio showed nothing, because the enumeration never reached it.
       *
       * So the registered doors are joined by any door DIRECTORY whose
       * manifest declares art. Registered ones win - they carry the display
       * name - and a directory with no manifest, or no art in it, is skipped
       * exactly as before.
       */
      const registered = new Set(doors().map(d => String(d.command).toUpperCase()));
      try {
        const doorsRoot = path.join(config.get('dataDir'), 'Doors');
        for (const entry of fs.readdirSync(doorsRoot, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          const doorDir = path.join(doorsRoot, entry.name);
          if (!fs.existsSync(path.join(doorDir, 'door.settings.json'))) continue;
          try {
            const manifest = JSON.parse(
              fs.readFileSync(path.join(doorDir, 'door.settings.json'), 'utf8')
            ) as { command?: string };
            const command = (manifest.command || entry.name).toUpperCase();
            // A registered command is that door's, art or none: the old 68K
            // Bulls tools still name B, but B is the Bulletins door now, and
            // the card listed under B opened B's own directory and failed.
            if (seen.has(command) || registered.has(command)) continue;
            const sections = listWithVariants(doorDir, command);
            if (sections.length === 0) continue;
            seen.add(command);
            out.push({ command, name: entry.name, sections });
          } catch {
            continue; // an unreadable manifest is not an error here either
          }
        }
      } catch {
        // no Doors directory: nothing to add
      }

      sendResponse(res, out);
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * GET /api/door-art/:command
   *
   * Art blocks the ANSI Studio edits: sections living inside a door's config
   * file (Bulls' Title logo in Bulls.CFG), where no screen path can name
   * them. 404 when the door declares no art sections.
   */  router.get('/:command', async (req: Request, res: Response) => {
    try {
      const command = String(req.params.command).toUpperCase();
      const doorDir = artDoorDirFor(command);
      if (!doorDir) return res.status(404).json({ success: false, message: `No door ${command}` });

      // The board's Screens directory: where the narrow drawings live, and
      // how a section knows whether one has been made for it.
      const artRoot = path.join(config.get('dataDir'), 'Screens');
      const variant = req.query?.variant;
      if (isArtVariant(variant)) {
        const { file, section } = req.query as { file?: string; section?: string };
        if (!file || !section) {
          return handleError(res, new Error('A variant read needs ?file= and ?section='));
        }
        return sendResponse(res, readDoorArtVariant(doorDir, artRoot, command, file, section, variant));
      }
      sendResponse(res, readDoorArtSections(doorDir, command, artRoot));
    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * PUT /api/door-art/:command
   *
   * Replaces one art section body ({ file, section, content: base64 }).
   * Limits come from the manifest (the door's DOC numbers); settings rows,
   * comments and delimiters survive.
   */
  router.put('/:command', async (req: any, res: Response) => {
    try {
      const command = String(req.params.command).toUpperCase();
      const doorDir = artDoorDirFor(command);
      if (!doorDir) return res.status(404).json({ success: false, message: `No door ${command}` });

      const { file, section, content, variant } = req.body ?? {};
      if (typeof file !== 'string' || typeof section !== 'string' || typeof content !== 'string') {
        return handleError(res, new Error('Expected { file, section, content } with string values'));
      }
      if (variant !== undefined && !isArtVariant(variant)) {
        return handleError(res, new Error(`variant must be one of ${ART_VARIANTS.join(', ')} when given`));
      }
      // A variant is the BOARD's file and is capped at the caller's forty
      // columns; the wide art is the door's own and keeps its DOC numbers.
      const updated = variant
        ? writeDoorArtVariant(
            doorDir,
            path.join(config.get('dataDir'), 'Screens'),
            command,
            file,
            section,
            variant,
            content,
          )
        : writeDoorArtSection(doorDir, file, section, content, command);
      sendResponse(res, updated, `${command} art saved`);
    } catch (error) {
      handleError(res, error);
    }
  });

  return router;
}
