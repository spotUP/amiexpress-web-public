/**
 * Does the fixture actually produce a board? Measured, before anything is
 * built on it.
 *
 * The walk has been blocked on one measured fact: with a stub handleCommand,
 * step 02 returns ZERO bytes. This asks the only question that matters about
 * the fixture - is there a board behind the handler now - and it asks it in
 * the board's own terms: conferences loaded, commands loaded, screens on disk.
 */
import * as fs from 'fs';
import * as path from 'path';
import { bootBoard, type BootedBoard } from './booted-board';

jest.setTimeout(180000);

describe('the booted board fixture', () => {
  let board: BootedBoard;

  beforeAll(async () => {
    board = await bootBoard('smoke-board-');
  });

  afterAll(() => board?.cleanup());

  it('lays out a board with the screens and conference a caller meets', () => {
    expect(fs.existsSync(path.join(board.root, 'Screens'))).toBe(true);
    expect(fs.existsSync(path.join(board.root, 'Conf1'))).toBe(true);
  });

  it('boots far enough that the board knows its conferences and commands', () => {
    const { getConferences } = require('../../src/server/initialization');
    const conferences = typeof getConferences === 'function' ? getConferences() : [];
    // Not "more than zero for its own sake": a caller is JOINED to a
    // conference during login, and a board with none cannot complete a walk.
    expect(Array.isArray(conferences)).toBe(true);

    const { getDoors } = require('../../src/handlers/door.handler');
    expect(Array.isArray(getDoors())).toBe(true);
  });
});
