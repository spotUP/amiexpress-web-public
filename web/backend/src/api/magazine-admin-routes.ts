/**
 * WEB_MAGAZINE_ADMIN routes - the front page of THE UNKNOWN FREQUENCY, edited
 * from the admin.
 *
 * Sysop-only, mounted behind the same two guards as every other board-file
 * writer (`mountMagazineAdmin`). The MAG door's sysop mode edits the same
 * `Magazine/frontpage.json`; both go through the SDK's one writer
 * (`writeFrontFile`) and the SDK's one set of edits (`normalizeFront` and
 * friends), so neither can leave a file the other would not.
 *
 *   GET /stories/front     every article, newest first, and the front page order
 *   GET /stories/:id       one article's body, for the preview
 *   PUT /front             { ids } - normalised, written, then the pages rebuilt
 *
 * A story is listed only if it is an ARTICLE (`isArticle`): the predicate the
 * publisher gives a page by and the reader lists by.
 */
import path from 'path';
import express, { Application, Request, RequestHandler, Response } from 'express';
import {
  DESK_LABEL,
  MAGAZINE_DIR,
  MAGAZINE_FRONTPAGE_FILE,
  MAGAZINE_STORIES_DIR,
  isArticle,
  normalizeFront,
  sourceName,
  storyOrigin,
  type Story,
} from '@amiexpress/bbs-door-sdk/formats/magazine';
import { writeFrontFile } from '@amiexpress/bbs-door-sdk/formats/magazine-front-file';
import * as fs from 'fs';
import { loadStories } from '../services/magazine';

export interface MagazineAdminDeps {
  /** The board's root; the magazine is `<root>/Magazine`. */
  boardRoot: () => string;
  /** Recompose the pages from the stories and the front page on disk. */
  republish: () => void;
  log?: (line: string) => void;
}

/** A story id is a hash; anything else is not a file name we will build. */
const STORY_ID = /^[A-Za-z0-9_-]{1,64}$/;

export interface AdminStory {
  id: string;
  headline: string;
  desk: string;
  deskLabel: string;
  /** The site, never an address. */
  source: string;
  date: string;
  bodyLength: number;
  origin: 'feed' | 'authored';
}

function articles(magazineDir: string, log: (l: string) => void): Story[] {
  return loadStories(path.join(magazineDir, MAGAZINE_STORIES_DIR), log)
    .filter(isArticle)
    .sort((a, b) => b.date.localeCompare(a.date));
}

function readFront(magazineDir: string): string[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(magazineDir, MAGAZINE_FRONTPAGE_FILE), 'utf8'));
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function toAdminStory(s: Story): AdminStory {
  return {
    id: s.id,
    headline: s.headline,
    desk: s.desk,
    deskLabel: DESK_LABEL[s.desk] ?? s.desk,
    source: sourceName(s.source),
    date: s.date,
    bodyLength: s.body?.length ?? 0,
    origin: storyOrigin(s),
  };
}

export function createMagazineAdminRouter(deps: MagazineAdminDeps): ReturnType<typeof express.Router> {
  const router = express.Router();
  const log = deps.log ?? (() => {});
  const dir = (): string => path.join(deps.boardRoot(), MAGAZINE_DIR);

  const fail = (res: Response, what: string, error: unknown): void => {
    console.error(`[MagazineAdmin] ${what} failed:`, error);
    res.status(500).json({ success: false, message: `Failed to ${what}` });
  };

  router.get('/stories/front', (_req: Request, res: Response) => {
    try {
      const list = articles(dir(), log);
      // A front page id whose story is no longer an article is not shown; the
      // file is only rewritten by a save, never by a read.
      const front = normalizeFront(readFront(dir()), list.map((s) => s.id));
      res.json({ success: true, data: { stories: list.map(toAdminStory), front } });
    } catch (error) {
      fail(res, 'load the magazine', error);
    }
  });

  router.get('/stories/:id', (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!STORY_ID.test(id)) {
      res.status(400).json({ success: false, message: 'not a story id' });
      return;
    }
    try {
      const story = articles(dir(), log).find((s) => s.id === id);
      if (!story) {
        res.status(404).json({ success: false, message: 'no such article' });
        return;
      }
      res.json({ success: true, data: { ...toAdminStory(story), body: story.body ?? '', summary: story.summary } });
    } catch (error) {
      fail(res, 'load the article', error);
    }
  });

  router.put('/front', (req: Request, res: Response) => {
    const ids = (req.body ?? {}).ids;
    if (!Array.isArray(ids) || !ids.every((x) => typeof x === 'string')) {
      res.status(400).json({ success: false, message: 'ids must be an array of story ids' });
      return;
    }
    let front: string[];
    try {
      front = normalizeFront(ids, articles(dir(), log).map((s) => s.id));
      writeFrontFile(dir(), front);
    } catch (error) {
      fail(res, 'save the front page', error);
      return;
    }
    // The file is the truth and is already written. A republish that fails
    // leaves the pages one tick behind; say so rather than call it a success.
    try {
      deps.republish();
    } catch (error) {
      console.error('[MagazineAdmin] republish failed:', error);
      res.status(500).json({
        success: false,
        message: 'The front page was saved, but the teletext pages did not rebuild',
        data: { front },
      });
      return;
    }
    res.json({ success: true, data: { front } });
  });

  return router;
}

/** The one place the guards are attached, so a test drives exactly what the board mounts. */
export function mountMagazineAdmin(
  app: Application,
  guards: RequestHandler[],
  deps: MagazineAdminDeps,
): void {
  app.use('/api/config/magazine', ...guards, createMagazineAdminRouter(deps));
}
