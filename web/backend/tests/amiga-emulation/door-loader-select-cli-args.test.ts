/**
 * Regression: parameterized FIM (FAME BBS) doors must still receive their
 * node number on the CLI.
 *
 * Background: DoorLoader.setupCpuRegisters and AmigaDoorSession's
 * setupCliEnvironment each independently gated the "ignore config.args,
 * pass node-number-only" rule on `doorType === 'XIM'`. XIM doors ride
 * their runtime parameters on XIM messages (cmd 113/152) rather than the
 * CLI (express.e:4231 runDoor). FIM doors (FAME BBS protocol) follow the
 * identical rule via their own channel (NR_GetArgument1-4/NR_GetFullArg,
 * FIM commands 87-91 — see fim-protocol.ts), but the condition wasn't
 * extended to FIM: a parameterized FIM door (e.g. door catalog config.args
 * = ["force", "node", "online"]) fell into the `else if (configArgs.length
 * > 0)` branch and got THOSE verbatim as CLI args instead of its node
 * number — losing NODENR entirely.
 *
 * Fix: DoorLoader.selectCliArgs is now the single source of truth for both
 * call sites.
 */

import { DoorLoader } from '../../src/amiga-emulation/DoorLoader';

describe('DoorLoader.selectCliArgs', () => {
  test('XIM door: config.args ignored, node number only', () => {
    expect(DoorLoader.selectCliArgs('XIM', ['S', 'U'], 3)).toEqual(['3']);
  });

  test('FIM door: config.args ignored, node number only (was previously losing NODENR)', () => {
    expect(DoorLoader.selectCliArgs('FIM', ['force', 'node', 'online'], 5)).toEqual(['5']);
  });

  test('FIM door with no explicit config.args: node number only', () => {
    expect(DoorLoader.selectCliArgs('FIM', [], 2)).toEqual(['2']);
  });

  test('doorType is case-insensitive', () => {
    expect(DoorLoader.selectCliArgs('fim', ['x'], 9)).toEqual(['9']);
    expect(DoorLoader.selectCliArgs('xim', ['x'], 9)).toEqual(['9']);
  });

  test('non-XIM/FIM door (SIM): explicit config.args preserved', () => {
    expect(DoorLoader.selectCliArgs('SIM', ['A', 'B'], 1)).toEqual(['A', 'B']);
  });

  test('non-XIM/FIM door with no config.args: node number fallback', () => {
    expect(DoorLoader.selectCliArgs('TIM', [], 7)).toEqual(['7']);
  });
});
