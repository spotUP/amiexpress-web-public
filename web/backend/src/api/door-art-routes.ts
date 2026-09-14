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
    const statusCode = message.includes('not found') || message.includes('No door') ? 404
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
    try {
      const out: Array<Record<string, unknown>> = [];
      for (const door of doors()) {
        try {
          const doorDir = doorDirectoryFor(config.get('dataDir'), door);
          if (!doorDir) continue;
          const sections = listDoorArtSections(doorDir, door.command);
          if (sections.length === 0) continue;
          out.push({
            command: door.command,
            name: door.name || door.command,
            sections,
          });
        } catch {
          continue; // no manifest or no art: not an error, just absent
        }
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
      const door = doors().find((d) => String(d.command).toUpperCase() === command);
      if (!door) return res.status(404).json({ success: false, message: `No door ${command}` });

      const doorDir = doorDirectoryFor(config.get('dataDir'), door);
      if (!doorDir) return res.status(404).json({ success: false, message: `${command} has no directory on disk` });

      // The board's Screens directory: where the narrow drawings live, and
      // how a section knows whether one has been made for it.
      const artRoot = path.join(config.get('dataDir'), 'Screens');
      const variant = req.query?.variant;
      if (variant === 'c64' || variant === 'ttx') {
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
      const door = doors().find((d) => String(d.command).toUpperCase() === command);
      if (!door) return res.status(404).json({ success: false, message: `No door ${command}` });

      const doorDir = doorDirectoryFor(config.get('dataDir'), door);
      if (!doorDir) return res.status(404).json({ success: false, message: `${command} has no directory on disk` });

      const { file, section, content, variant } = req.body ?? {};
      if (typeof file !== 'string' || typeof section !== 'string' || typeof content !== 'string') {
        return handleError(res, new Error('Expected { file, section, content } with string values'));
      }
      if (variant !== undefined && variant !== 'c64' && variant !== 'ttx') {
        return handleError(res, new Error("variant must be 'c64' or 'ttx' when given"));
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
