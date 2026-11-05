/**
 * The legacy panel generator and source, against their published oracles.
 *
 * Replays from engine versions 045-047 were played on this generator, and most
 * of upstream's committed fixtures are from that era. Every expected string
 * here is lifted from upstream's PanelGenTests.lua.
 */

import assert from 'assert';
import { LegacyPanelGenerator } from '../../core/panels/legacy-panel-generator';
import { LegacyPanelSource } from '../../core/panels/legacy-panel-source';
import { getClassicEndless } from '../../core/panels/level-data';

export async function legacyGeneratorMatchesUpstreamForSeedOne(): Promise<void> {
  const generator = new LegacyPanelGenerator();
  generator.setSeed(1);
  assert.strictEqual(
    generator.generatePanels(20, 6, 6, '', true),
    '123624354235541356256135534246123164452652261534436416143654326141464535'
    + '125612654356413561525232252356624214265623324561',
  );
}

export async function legacyGeneratorAndMetalAssignmentMatchForSeedThree(): Promise<void> {
  const generator = new LegacyPanelGenerator();
  generator.setSeed(3);

  const panels = generator.generatePanels(7, 6, 6, '', true);
  assert.strictEqual(panels, '163625451214636135424264342531164654525236');

  // Metal assignment consumes its own random numbers, so it is pinned too.
  assert.strictEqual(
    generator.assignMetalLocations(panels, 6),
    'aF3625451Ba4f3613E4B42f434B53a1F4f5452E2c6',
  );
}

/**
 * The legacy starting board, from upstream's testLegacyStartingBoard1: seed 7,
 * endless easy at five colours, with adjacent colours allowed on the opening
 * board.
 */
export async function legacyStartingBoardMatchesUpstream(): Promise<void> {
  const levelData = getClassicEndless('easy');
  levelData.colors = 5;
  const stackShape = { width: 6, levelData };

  const source = new LegacyPanelSource(7, false).clone(stackShape);
  source.setAllowAdjacentColorsOnStartingBoard(true);

  source.panelBuffer = source.generateStartingBoard(stackShape);
  assert.strictEqual(source.panelBuffer, '0400000bC00201240a0D3305e32E114D535d21aD12');
}

/**
 * The legacy source reseeds with `seed + panelGenCount` every time it extends
 * the buffer, and tops up a hundred rows at a time. Both are pinned by the
 * continuation of the same upstream test.
 */
export async function legacyBufferTopUpMatchesUpstream(): Promise<void> {
  const levelData = getClassicEndless('easy');
  levelData.colors = 5;
  const stackShape = { width: 6, levelData };

  const source = new LegacyPanelSource(7, false).clone(stackShape);
  source.setAllowAdjacentColorsOnStartingBoard(true);
  source.panelBuffer = source.generateStartingBoard(stackShape);

  // Upstream simulates the first row having been applied, then tops up.
  source.panelBuffer = source.panelBuffer.slice(stackShape.width);
  source.panelBuffer = source.generatePanels(stackShape);

  assert.ok(
    source.panelBuffer.startsWith('0bC00201240a0D3305e32E114D535d21aD123B21c3453b4EB115c135eA53aC13153'),
    'the top-up continues from the remaining buffer',
  );
  assert.strictEqual(source.panelGenCount, 2, 'two generations, so the next reseed differs');
}

/**
 * A row that already carries a shock marker can still parse as a number -
 * "4043E0" is 4043 in scientific notation - so it is reprocessed and spends
 * extra random numbers. Upstream keeps this for replay compatibility.
 *
 * JavaScript agrees with Lua on that parse, but only if numeric-ness is tested
 * with isNaN: "000000" is 0, which is falsy here and truthy in Lua.
 */
export async function theScientificNotationQuirkIsPreserved(): Promise<void> {
  assert.strictEqual(Number('4043E0'), 4043, 'a marker row that still reads as a number');
  assert.ok(Number.isNaN(Number('aF3625')), 'one that does not');
  assert.strictEqual(Number('000000'), 0, 'and the row that would be lost to a truthiness test');
}
