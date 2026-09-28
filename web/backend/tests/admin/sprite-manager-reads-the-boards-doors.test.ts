/**
 * The Sprite Manager lists the sprites of the board's own doors.
 *
 * It found Doors/ by walking up from its own source file, then guessed
 * cwd/Doors and web/Doors. On the live board the code runs from
 * /app/web/backend and the doors live in the volume (BBS_DATA_DIR=
 * /app/data/bbs), so the admin page listed nothing (sysop, 2026-09-07:
 * "loads NO sprites"). It reads boardRoot()/Doors now, as the door runner
 * does.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SpriteManagerHandler } from '../../src/handlers/admin/sprite-manager.handler';

function response() {
  const res: any = { body: undefined, code: 200 };
  res.json = (b: unknown) => { res.body = b; return res; };
  res.status = (c: number) => { res.code = c; return res; };
  return res;
}

const saved = process.env.BBS_DATA_DIR;
let board: string;

beforeEach(() => {
  board = fs.mkdtempSync(path.join(os.tmpdir(), 'sprite-board-'));
  const sprites = path.join(board, 'Doors', 'pengo', 'sprites');
  fs.mkdirSync(sprites, { recursive: true });
  fs.writeFileSync(path.join(sprites, 'penguin.sprite.json'), JSON.stringify({ animations: { walk: [] } }));
  process.env.BBS_DATA_DIR = board;
});
afterEach(() => {
  if (saved === undefined) delete process.env.BBS_DATA_DIR; else process.env.BBS_DATA_DIR = saved;
  fs.rmSync(board, { recursive: true, force: true });
});

it("lists the doors and sprites under the board's data directory", async () => {
  const handler = new SpriteManagerHandler();

  const doors = response();
  await handler.listDoors({} as any, doors);
  expect(doors.body).toEqual({ doors: ['pengo'] });

  const sprites = response();
  await handler.listSprites({ params: { door: 'pengo' } } as any, sprites);
  expect(sprites.body.sprites.map((s: any) => s.file)).toEqual(['penguin.sprite.json']);
});
