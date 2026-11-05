/**
 * MISSION mode - the briefing.
 *
 * "we need a dialog that explains what to do in the mission before it starts"
 * (2026-09-02). The select screen gave a name and a one-line hint; the clock,
 * the starting speed, the garbage and the rule changes were all met for the
 * first time when the first piece fell.
 */

import assert from 'assert';
import * as path from 'path';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import {
  missionObjectiveText, missionConditions, missionBriefingLines, showMissionBriefing, pickMission,
} from '../ui/mission-briefing';
import { loadMissionPack } from '../core/mission-pack';
import { MISSION_OBJECTIVES, type Mission } from '../core/mission-types';

function mission(over: Partial<Mission> = {}): Mission {
  return {
    id: 't1', name: 'TEST', objective: 'lines', norm: 5,
    timeLimitSeconds: 0, startLevel: 0, garbageRows: 0, modifiers: {},
    ...over,
  };
}

export async function everyObjectiveSaysWhatToDoInWords(): Promise<void> {
  // A briefing that reads "Play." for an objective is worse than none: it
  // tells the player the door does not know what it asked of them.
  for (const objective of MISSION_OBJECTIVES) {
    const text = missionObjectiveText(mission({ objective, norm: 3, timeLimitSeconds: 60 }));
    assert.ok(text.length > 10, `${objective} needs a real sentence, got "${text}"`);
    assert.notStrictEqual(text, 'Play.', `${objective} has no wording of its own`);
    assert.ok(/[.!]$/.test(text), `${objective}: "${text}" should read as a sentence`);
  }
}

export async function theWordingCountsTheRightThing(): Promise<void> {
  assert.match(missionObjectiveText(mission({ objective: 'lines', norm: 5 })), /5 lines/);
  assert.match(missionObjectiveText(mission({ objective: 'double', norm: 1 })), /once/);
  assert.match(missionObjectiveText(mission({ objective: 'double', norm: 4 })), /4 times/);
  assert.match(missionObjectiveText(mission({ objective: 'level', norm: 100 })), /level 100/);
  assert.match(
    missionObjectiveText(mission({ objective: 'survive', timeLimitSeconds: 90 })),
    /90 seconds/
  );
  // The one rule a player will otherwise learn the hard way.
  assert.match(
    missionObjectiveText(mission({ objective: 'b2bTetris', norm: 3 })),
    /resets the count/
  );
}

export async function everyRuleTheMissionChangesIsListed(): Promise<void> {
  const conditions = missionConditions(mission({
    timeLimitSeconds: 120,
    startLevel: 300,
    garbageRows: 6,
    modifiers: { big: true, hideNext: true, hidden: 'SLOW', rollRoll: true },
  }));

  const joined = conditions.join(' | ');
  assert.match(joined, /2:00/, 'the clock, in minutes and seconds');
  assert.match(joined, /level 300/);
  assert.match(joined, /6 rows of garbage/);
  assert.match(joined, /BIG/);
  assert.match(joined, /HIDE NEXT/);
  assert.match(joined, /HIDDEN/);
  assert.match(joined, /ROLL ROLL/);
  assert.strictEqual(conditions.length, 7, 'one line each, nothing invented');
}

export async function aPlainMissionListsNoConditionsAtAll(): Promise<void> {
  assert.deepStrictEqual(missionConditions(mission()), [],
    'no clock, no speed, no garbage, no rules - so nothing to warn about');
}

export async function aSurviveMissionDoesNotRepeatItsClockAsALimit(): Promise<void> {
  // "Stay alive for 60 seconds" already IS the clock; listing it again as a
  // time limit reads as a second, contradictory rule.
  const conditions = missionConditions(mission({ objective: 'survive', timeLimitSeconds: 60 }));
  assert.ok(!conditions.some(c => /Time limit/.test(c)), conditions.join(' | '));
}

export async function theBriefingSaysWhetherItHasBeenCleared(): Promise<void> {
  const fresh = missionBriefingLines(mission(), null).join('\n');
  assert.match(fresh, /Not cleared yet/);

  const done = missionBriefingLines(mission(), { seconds: 75, date: '2026-09-02' }).join('\n');
  assert.match(done, /Cleared in 1:15/);
}

export async function everyShippedMissionBriefsCleanly(): Promise<void> {
  const pack = loadMissionPack(path.join(__dirname, '..', 'assets', 'missions', 'starter.json'));
  for (const m of pack.missions) {
    const lines = missionBriefingLines(m, null);
    const text = lines.join('\n');
    assert.ok(text.includes(m.name), `${m.id} must name itself`);
    assert.ok(!text.includes('Play.'), `${m.id} fell through to the default wording`);
    assert.ok(lines.length <= 18, `${m.id}'s briefing is ${lines.length} lines - too tall for 25 rows`);
  }
}

export async function enterStartsTheMissionAndEscapeGoesBack(): Promise<void> {
  // Through the real dialog: the keys a player will actually press.
  for (const [key, expected] of [['enter', true], ['escape', false]] as const) {
    const screen: any = new Screen({ title: 'briefing', width: 80, height: 25 });
    try {
      const answer = showMissionBriefing(screen, mission({ name: 'FIRST LINES' }), null);
      await new Promise(r => setTimeout(r, 20));
      screen.emit('keypress', undefined, { name: key });
      assert.strictEqual(await answer, expected, `${key} must answer ${expected}`);
    } finally { screen.destroy(); }
  }
}

export async function theBriefingCleansUpAfterItself(): Promise<void> {
  const screen: any = new Screen({ title: 'briefing', width: 80, height: 25 });
  try {
    const before = screen.children.length;
    const answer = showMissionBriefing(screen, mission(), null);
    await new Promise(r => setTimeout(r, 20));
    assert.ok(screen.children.length > before, 'the box is up while it is being read');

    screen.emit('keypress', undefined, { name: 'escape' });
    await answer;
    assert.strictEqual(screen.children.length, before, 'and gone once it is answered');

    // A second briefing must not see the first one's key handler.
    const second = showMissionBriefing(screen, mission(), null);
    await new Promise(r => setTimeout(r, 20));
    screen.emit('keypress', undefined, { name: 'enter' });
    assert.strictEqual(await second, true);
  } finally { screen.destroy(); }
}

// ---------------------------------------------------------------------------
// The flow: pick -> brief -> start, or back to the list.
// ---------------------------------------------------------------------------

function pack(): any {
  return { name: 'TEST', missions: [mission({ id: '01' }), mission({ id: '02', name: 'SECOND' })] };
}

export async function backingOutOfABriefingReturnsToTheList(): Promise<void> {
  // Not to the main menu: the player rejected the MISSION, not the mode.
  const picks = ['01', '02'];
  const seen: string[] = [];
  let briefings = 0;

  const chosen = await pickMission(
    pack(),
    () => null,
    {
      select: async (p: any) => {
        const id = picks.shift();
        return p.missions.find((m: any) => m.id === id) ?? null;
      },
      brief: async (m: any) => {
        seen.push(m.id);
        briefings++;
        return briefings > 1;      // back out of the first, start the second
      },
    }
  );

  assert.deepStrictEqual(seen, ['01', '02'], 'the list came back after the first briefing');
  assert.strictEqual(chosen?.id, '02', 'and the second choice is what starts');
}

export async function leavingTheListLeavesTheMode(): Promise<void> {
  let briefed = false;
  const chosen = await pickMission(
    pack(),
    () => null,
    { select: async () => null, brief: async () => { briefed = true; return true; } }
  );

  assert.strictEqual(chosen, null, 'quitting the list quits the mode');
  assert.strictEqual(briefed, false, 'and nothing is briefed on the way out');
}

export async function theBriefingIsToldWhetherThisPlayerClearedIt(): Promise<void> {
  const asked: string[] = [];
  let carried: any = 'not called';

  await pickMission(
    pack(),
    (id: string) => { asked.push(id); return { seconds: 42, date: '2026-09-02' }; },
    {
      select: async (p: any) => p.missions[0],
      brief: async (_m: any, clear: any) => { carried = clear; return true; },
    }
  );

  assert.deepStrictEqual(asked, ['01'], 'the record is asked about the mission that was picked');
  assert.strictEqual(carried?.seconds, 42, 'and the clear reaches the briefing');
}
