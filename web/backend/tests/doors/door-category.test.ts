/**
 * What KIND of door it is, so the feed can say a game was played.
 *
 * Doors have declared `category` in their package.json for as long as they
 * have had one, and nothing ever read it - which is why the values are
 * inconsistent by hand: "Games", "game", "utility", "Utilities". Reading them
 * now means normalising them, not tidying the files, because a sysop's own
 * door may spell it either way.
 *
 * The point of the category is as much what it PREVENTS: calling DOORMAN or
 * LINKWALL "a game" would read worse than the shorthand it replaces.
 */

process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  doorCategoryAt,
  normaliseCategory,
  isGameCategory,
  clearDoorCategoryCache,
} from '../../src/doors/door-category';

const REPO = path.join(__dirname, '..', '..', '..', '..');

describe('a declared category', () => {
  it('reads the same however the door spelled it', () => {
    expect(normaliseCategory('Games')).toBe('game');
    expect(normaliseCategory('game')).toBe('game');
    expect(normaliseCategory('GAMES')).toBe('game');
    expect(normaliseCategory('Utilities')).toBe('utility');
    expect(normaliseCategory('utility')).toBe('utility');
  });

  it('keeps a category it does not know', () => {
    expect(normaliseCategory('Communication')).toBe('communication');
  });

  it('is nothing when the door declared nothing', () => {
    expect(normaliseCategory(undefined)).toBeNull();
    expect(normaliseCategory('   ')).toBeNull();
  });

  it('answers whether a door is played', () => {
    expect(isGameCategory('Games')).toBe(true);
    expect(isGameCategory('utility')).toBe(false);
    expect(isGameCategory(null)).toBe(false);
  });
});

describe('reading it off disk', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'door-cat-'));
    clearDoorCategoryCache();
  });

  afterEach(() => {
    clearDoorCategoryCache();
    fs.rmSync(root, { recursive: true, force: true });
  });

  function makeDoor(name: string, pkg: Record<string, unknown>): string {
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
    return dir;
  }

  it('finds it from the door directory', () => {
    const dir = makeDoor('frogger', { name: 'frogger', category: 'game' });

    expect(doorCategoryAt(dir)).toBe('game');
  });

  // `door.path` may name the executable rather than the directory, which is
  // the same reasoning ownDirectoryOf carries in door-registration-paths.
  it('finds it from a file inside the door', () => {
    const dir = makeDoor('pengo', { name: 'pengo', category: 'Games' });

    expect(doorCategoryAt(path.join(dir, 'index.ts'))).toBe('game');
  });

  // A 68K door has no package.json. That is not a failure: the feed says
  // "Opened", which is true.
  it('is nothing for a door with no manifest', () => {
    const dir = path.join(root, 'amiga-door');
    fs.mkdirSync(dir, { recursive: true });

    expect(doorCategoryAt(dir)).toBeNull();
  });

  it('survives a manifest it cannot parse', () => {
    const dir = path.join(root, 'broken');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), '{ not json');

    expect(doorCategoryAt(dir)).toBeNull();
  });

  it('says nothing for no path at all', () => {
    expect(doorCategoryAt(undefined)).toBeNull();
  });
});

describe('the doors this board ships', () => {
  // The feature is worth nothing if the games do not say so. FROGGER is the
  // sysop's own example and had no category at all until this landed.
  it('declares the arcade doors as games', () => {
    for (const door of ['frogger', 'pengo', 'galaga', 'joust', 'arkanoid', 'super-qix']) {
      const manifest = path.join(REPO, 'Doors', door, 'package.json');
      if (!fs.existsSync(manifest)) continue;

      const category = JSON.parse(fs.readFileSync(manifest, 'utf8')).category;
      expect(`${door}: ${normaliseCategory(category)}`).toBe(`${door}: game`);
    }
  });

  it('does not call a tool a game', () => {
    for (const door of ['door-manager', 'ansi-editor', 'rip-browser', 'bbslinkwall']) {
      const manifest = path.join(REPO, 'Doors', door, 'package.json');
      if (!fs.existsSync(manifest)) continue;

      const category = JSON.parse(fs.readFileSync(manifest, 'utf8')).category;
      expect(`${door}: ${isGameCategory(category)}`).toBe(`${door}: false`);
    }
  });
});

describe('the door event', () => {
  const handler = fs.readFileSync(
    path.join(REPO, 'web/backend/src/handlers/door.handler.ts'),
    'utf8',
  );

  // Both ends of a door session, or the feed says a game started and never
  // that it stopped.
  it('carries the category when a door is entered AND when it is left', () => {
    expect(handler.split('category: doorCategoryAt(door.path)').length - 1).toBe(2);
  });
});
