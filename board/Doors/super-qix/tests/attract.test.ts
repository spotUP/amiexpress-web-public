/**
 * The attract mode.
 *
 * Asked for as "the arcade's, with a blinking 'press button' in place of
 * 'insert coin'". A BBS door has no coin slot - entering the door is the
 * coin - so the invitation asks for a key, and it blinks, because a still
 * line in an attract loop reads as a crashed door.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  attractScreen, nextPhase, invitePanel, pointTablePanel, rankingPanel,
  ATTRACT_ORDER, ATTRACT_FRAMES, ATTRACT_BLINK_FRAMES, ATTRACT_IDLE_FRAMES,
  AttractPhase,
} from '../game/attract';
import { CAPTURE_POINTS, EXTRA_LIFE_PERCENT } from '../game/constants';
import { SuperQixData } from '../game/types';

const WIDTH = 54;

/** Strip blessed colour tags, as the terminal sees it. */
function visible(line: string): string {
  return line.replace(/\{[^}]*\}/g, '');
}

function data(overrides: Partial<SuperQixData> = {}): SuperQixData {
  return {
    targetPercent: 75,
    highscores: [
      { name: 'SPOTUP', score: 32750, level: 6, maxPercent: 95, date: '2026-08-31' },
      { name: 'CAS', score: 30010, level: 5, maxPercent: 90, date: '1987-01-01' },
    ],
    ...overrides,
  } as SuperQixData;
}

/** The invitation blinks rather than sitting still. */
export async function theInvitationBlinks(): Promise<void> {
  const on = invitePanel(data(), WIDTH, true).map(visible).join('\n');
  const off = invitePanel(data(), WIDTH, false).map(visible).join('\n');

  assert.ok(/PRESS ANY KEY/.test(on), 'the invitation should be shown on the lit frame');
  assert.ok(!/PRESS ANY KEY/.test(off), 'and hidden on the dark one, or it is not blinking');
}

/** It says PRESS ANY KEY, not INSERT COIN - there is no coin slot. */
export async function theInvitationAsksForAKeyNotACoin(): Promise<void> {
  const lines = attractScreen('invite', data(), WIDTH, 0).map(visible).join('\n');

  assert.ok(/PRESS ANY KEY/.test(lines));
  assert.ok(!/COIN|CREDIT/i.test(lines), 'a BBS door has no coin slot');
}

/** The blink actually alternates as the frame counter advances. */
export async function theBlinkAlternatesOverTime(): Promise<void> {
  const seen = new Set<boolean>();
  for (let frame = 0; frame < ATTRACT_BLINK_FRAMES * 4; frame++) {
    seen.add(/PRESS ANY KEY/.test(attractScreen('invite', data(), WIDTH, frame).map(visible).join('\n')));
  }
  assert.strictEqual(seen.size, 2, 'the invitation must be seen both lit and dark');
}

/** The scoring panel is generated from the real constants, not typed out. */
export async function theScoringPanelComesFromTheRealFigures(): Promise<void> {
  const lines = pointTablePanel(WIDTH).map(visible).join('\n');

  assert.ok(lines.includes(String(CAPTURE_POINTS)), 'a sealed-in Gremlin is worth CAPTURE_POINTS');
  assert.ok(lines.includes(String(EXTRA_LIFE_PERCENT)), 'the extra-marker threshold should be shown');
}

/** The board's own high scores are shown, not the factory table. */
export async function theRankingShowsThisBoardsScores(): Promise<void> {
  const lines = rankingPanel(data().highscores, WIDTH).map(visible).join('\n');

  assert.ok(/SPOTUP/.test(lines), 'a full BBS handle should fit on the attract board');
  assert.ok(/32750/.test(lines));
}

/** An empty board says so rather than drawing an empty panel. */
export async function anEmptyBoardSaysNobodyHasPlayed(): Promise<void> {
  const lines = rankingPanel([], WIDTH).map(visible).join('\n');
  assert.ok(/NOBODY HAS PLAYED YET/.test(lines));
}

/** The cycle visits every panel and comes back round. */
export async function theCycleVisitsEveryPanelAndRepeats(): Promise<void> {
  const seen: AttractPhase[] = [];
  let phase: AttractPhase = ATTRACT_ORDER[0];
  for (let i = 0; i < ATTRACT_ORDER.length; i++) {
    seen.push(phase);
    phase = nextPhase(phase);
  }

  assert.deepStrictEqual(seen, ATTRACT_ORDER, 'every panel should be visited in order');
  assert.strictEqual(phase, ATTRACT_ORDER[0], 'and it should wrap round');

  for (const p of ATTRACT_ORDER) {
    assert.ok(ATTRACT_FRAMES[p] > 0, `${p} needs a duration`);
  }
}

/** Every panel carries the credit, and none of them claims Taito's notice. */
export async function everyPanelCreditsTheOriginalWithoutClaimingIt(): Promise<void> {
  for (const phase of ATTRACT_ORDER) {
    const lines = attractScreen(phase, data(), WIDTH, 0).map(visible).join('\n');
    assert.ok(/ORIGINAL BY TAITO 1987/.test(lines), `${phase} should carry the credit`);
    assert.ok(!/\(C\)|COPYRIGHT/i.test(lines), `${phase} must not stamp somebody else's notice on a port`);
  }
}

/** Nothing overflows the panel it is drawn in. */
export async function noPanelIsWiderThanItsBox(): Promise<void> {
  for (const phase of ATTRACT_ORDER) {
    for (const line of attractScreen(phase, data(), WIDTH, 0)) {
      assert.ok(
        visible(line).length <= WIDTH,
        `${phase} has a line of ${visible(line).length} columns in a ${WIDTH}-column panel: ` +
        JSON.stringify(visible(line))
      );
    }
  }
}

/**
 * ...and the door actually runs it.
 *
 * An attract mode nothing hands the screen to is a feature nobody can see -
 * the same shape of bug as GrandMaster's unwatchable solo games.
 */
export async function theDoorHandsAnIdleMenuToTheAttractLoop(): Promise<void> {
  const index = readFileSync(join(__dirname, '..', 'index.ts'), 'utf8');

  assert.ok(/function startAttract\(\)/.test(index), 'the door should have an attract loop');
  assert.ok(/startMenuIdle\(\)/.test(index), 'and arm an idle countdown on the menu');
  assert.ok(
    /menuIdleFrames >= ATTRACT_IDLE_FRAMES\) startAttract\(\)/.test(index),
    'the countdown should hand over to the attract loop'
  );
  assert.ok(
    /gameData\.state === "attract"\)\s*\{\s*\n\s*showMenu\(\);/.test(index),
    'any key during attract should return to the menu'
  );
  assert.ok(
    /function cleanup\(\): void \{\s*\n\s*stopAttract\(\);\s*\n\s*stopMenuIdle\(\);/.test(index),
    'and both loops must be torn down with the door, or they outlive the session'
  );
  assert.ok(ATTRACT_IDLE_FRAMES > 0, 'the idle delay must be positive');
}
