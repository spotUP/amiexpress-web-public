/**
 * The sysop's mission editor.
 *
 * The reference ships one (mission.c:182-265 is its file format); this door
 * shipped a JSON file and a sysop who had to leave the board to write a
 * mission. The parts worth pinning are the ones a screen cannot be trusted
 * with: that a saved pack is one the GAME will load, that the editor cannot
 * write a mission nobody could finish, and that only a sysop is offered it.
 */

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  MISSION_FIELDS,
  blankMission,
  cycleField,
  fieldValue,
  setField,
} from '../core/mission-edit';
import { listPacks, saveSysopPack, packFileName, sysopPackDir } from '../core/mission-store';
import { parseMissionPack } from '../core/mission-pack';
import { pickMission } from '../ui/mission-briefing';
import type { Mission, MissionPack } from '../core/mission-types';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gm-missions-'));
}

function pack(missions: Mission[], name = 'MY PACK'): MissionPack {
  return { name, missions };
}

export async function aNewMissionIsAlreadyPlayable(): Promise<void> {
  // The blank a sysop starts from has to be one the loader accepts: an
  // editor whose first act is to create an invalid row is one nobody can use.
  const created = blankMission(0);
  const parsed = parseMissionPack(JSON.parse(JSON.stringify(pack([created]))));

  assert.strictEqual(parsed.missions.length, 1);
  assert.strictEqual(parsed.missions[0].objective, 'lines');
  assert.ok(parsed.missions[0].norm > 0, 'and it asks the player for something');
}

export async function choosingSurviveGivesItTheClockItNeeds(): Promise<void> {
  // SURVIVE is the one objective that cannot end without a time limit, and
  // the loader rejects it - so cycling onto it has to bring one.
  let mission = blankMission(0);
  while (mission.objective !== 'survive') mission = cycleField(mission, 'objective', 1);

  assert.ok(mission.timeLimitSeconds > 0, 'survive came with a clock');
  parseMissionPack(JSON.parse(JSON.stringify(pack([mission]))));   // throws if not
}

export async function aFieldRefusesWhatItCannotHold(): Promise<void> {
  const mission = blankMission(0);

  const tooBig = setField(mission, 'timeLimitSeconds', '99999');
  assert.ok('error' in tooBig, 'a limit past the range is refused');

  const notANumber = setField(mission, 'norm', 'lots');
  assert.ok('error' in notANumber, 'and so is a word');

  const nameless = setField(mission, 'name', '   ');
  assert.ok('error' in nameless, 'a mission needs a name');

  const good = setField(mission, 'norm', '25');
  assert.ok('mission' in good && good.mission.norm === 25);

  // Refused, not clamped: a sysop who typed 99999 meant something, and
  // storing 3600 quietly is how a pack stops saying what its author thinks.
  assert.ok(!String((tooBig as { error: string }).error).includes('3600 set'));
}

export async function surviveCannotHaveItsClockTakenAway(): Promise<void> {
  let mission = blankMission(0);
  while (mission.objective !== 'survive') mission = cycleField(mission, 'objective', 1);

  const zeroed = setField(mission, 'timeLimitSeconds', '0');
  assert.ok('error' in zeroed, 'the one mission that needs a clock keeps it');
}

export async function everyFieldReadsBackAsSomething(): Promise<void> {
  const mission = blankMission(0);
  for (const spec of MISSION_FIELDS) {
    const shown = fieldValue(mission, spec.field);
    assert.strictEqual(typeof shown, 'string', `${spec.field} has a value to show`);
    assert.ok(!shown.includes('undefined'), `${spec.field} does not read as undefined`);
  }
}

export async function aSavedPackIsOneTheGameWillLoad(): Promise<void> {
  const dir = tempDir();
  const doorRoot = tempDir();

  const mine = pack([blankMission(0), blankMission(1)], 'SYSOP NIGHT');
  const file = saveSysopPack(dir, mine);

  assert.strictEqual(path.basename(file), packFileName('SYSOP NIGHT'));
  assert.ok(file.startsWith(sysopPackDir(dir)), 'written under the data directory');

  // The proof that matters: read it back the way the door does.
  const found = listPacks(doorRoot, dir);
  assert.deepStrictEqual(found.problems, []);
  assert.strictEqual(found.packs.length, 1);
  assert.strictEqual(found.packs[0].origin, 'sysop');
  assert.strictEqual(found.packs[0].pack.name, 'SYSOP NIGHT');
  assert.strictEqual(found.packs[0].pack.missions.length, 2);
}

export async function aPackTheGameWouldRefuseIsNotWritten(): Promise<void> {
  const dir = tempDir();
  const broken = pack([{ ...blankMission(0), objective: 'teleport' as never }]);

  assert.throws(() => saveSysopPack(dir, broken), /objective/,
    'the loader refuses it here, where the sysop can still fix it');

  const written = fs.existsSync(sysopPackDir(dir)) ? fs.readdirSync(sysopPackDir(dir)) : [];
  assert.deepStrictEqual(written, [], 'and nothing was left on disk');
}

export async function aHalfWrittenPackNeverBecomesThePack(): Promise<void> {
  // Written to a temporary and renamed, so a reader never sees half a file.
  const dir = tempDir();
  saveSysopPack(dir, pack([blankMission(0)], 'ONE'));
  const leftovers = fs.readdirSync(sysopPackDir(dir)).filter((name) => name.endsWith('.tmp'));
  assert.deepStrictEqual(leftovers, [], 'no temporary file survives the save');
}

export async function aBadPackDoesNotTakeMissionModeAway(): Promise<void> {
  const dir = tempDir();
  const doorRoot = tempDir();

  saveSysopPack(dir, pack([blankMission(0)], 'GOOD'));
  fs.writeFileSync(path.join(sysopPackDir(dir), 'broken.json'), '{ not json', 'utf8');

  const found = listPacks(doorRoot, dir);
  assert.strictEqual(found.packs.length, 1, 'the good pack is still offered');
  assert.strictEqual(found.problems.length, 1, 'and the bad one is reported, not hidden');
  assert.ok(found.problems[0].includes('broken.json'));
}

export async function onlyASysopIsOfferedTheEditor(): Promise<void> {
  // Driven through the real pick loop: the select screen answers 'edit', and
  // the loop must only act on it when an editor was supplied - which app.ts
  // does only for a sysop.
  const mine = pack([blankMission(0)]);
  let edits = 0;

  const asPlayer = await pickMission(mine, () => null, {
    select: async () => 'edit',
    brief: async () => true,
    // No edit handler: this is what a player's call looks like.
  });
  assert.strictEqual(asPlayer, null, 'a player asking for the editor gets nowhere');

  const asSysop = await pickMission(mine, () => null, {
    select: async (p) => (edits === 0 ? 'edit' : p.missions[0]),
    brief: async () => true,
    edit: async (p) => { edits += 1; return p; },
  });
  assert.strictEqual(edits, 1, 'the sysop reached the editor');
  assert.strictEqual(asSysod(asSysop), mine.missions[0].id, 'and came back to the list');
}

function asSysod(mission: Mission | null): string {
  return mission ? mission.id : '';
}

export async function theEditedPackIsWhatTheListShowsNext(): Promise<void> {
  const original = pack([blankMission(0)], 'BEFORE');
  const edited = pack([blankMission(0), blankMission(1)], 'AFTER');
  const seen: string[] = [];

  await pickMission(original, () => null, {
    select: async (p) => {
      seen.push(p.name);
      return seen.length === 1 ? 'edit' : p.missions[0];
    },
    brief: async () => true,
    edit: async () => edited,
  });

  assert.deepStrictEqual(seen, ['BEFORE', 'AFTER'],
    'the list came back showing what was saved, not what was there before');
}
