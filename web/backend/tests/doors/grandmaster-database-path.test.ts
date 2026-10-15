/**
 * The chess games are on the volume, not in the container.
 *
 * GRANDMASTER opened its database at process.cwd() + data/grandmaster.db. The
 * backend's cwd on the board is /app/web/backend, which lives on the
 * container's own filesystem - not the /app/data volume - and a deploy
 * replaces that container. Every saved game, rating and match history would
 * have been thrown away several times a day, silently, with the file simply
 * absent afterwards.
 *
 * Nothing was lost: no grandmaster.db exists on the board, so the door had
 * never written one there to lose.
 *
 * Doors/dopewars/data/dopewars.db is the same shape done right, and it has
 * survived on the volume since August.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { defaultDatabasePath } from '../../../../Doors/grandmaster/server/database/connection';

describe('the GRANDMASTER database path', () => {
  let doorDir: string;

  beforeEach(() => {
    doorDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grandmaster-'));
    fs.writeFileSync(path.join(doorDir, 'package.json'), '{"name":"grandmaster-door"}');
  });

  afterEach(() => fs.rmSync(doorDir, { recursive: true, force: true }));

  it('is inside the door, from the compiled tree a board runs', () => {
    const compiled = path.join(doorDir, 'dist', 'server', 'database');
    fs.mkdirSync(compiled, { recursive: true });

    expect(defaultDatabasePath(compiled)).toBe(path.join(doorDir, 'data', 'grandmaster.db'));
  });

  it('is the same place from the source tree in development', () => {
    const source = path.join(doorDir, 'server', 'database');
    fs.mkdirSync(source, { recursive: true });

    expect(defaultDatabasePath(source)).toBe(path.join(doorDir, 'data', 'grandmaster.db'));
  });

  it('never lands outside the door directory', () => {
    const compiled = path.join(doorDir, 'dist', 'server', 'database');
    fs.mkdirSync(compiled, { recursive: true });

    expect(defaultDatabasePath(compiled).startsWith(doorDir + path.sep)).toBe(true);
  });
});
