/**
 * express.e expands a `*` in a name - " Expand: <name> Correct " - unless the
 * board's icon says NO_WILDCARD_EXPANSION (ACP.e:2663). This board never
 * loaded the toggle, so it was always off and the wildcard lookup ported with
 * the message system could not happen.
 */
import { togglesFromBoardConfig, ToggleFlags } from '../../src/utils/acs.util';

describe('the USEWILDCARDS toggle', () => {
  it('is on for a board that says nothing about it', () => {
    expect(togglesFromBoardConfig({})[ToggleFlags.USEWILDCARDS]).toBe(true);
  });
  it('is off when the board says NO_WILDCARD_EXPANSION', () => {
    expect(togglesFromBoardConfig({ no_wildcard_expansion: true })[ToggleFlags.USEWILDCARDS]).toBe(false);
  });
  it('leaves CREDITBYKB as it was read', () => {
    expect(togglesFromBoardConfig({ credit_by_kb: true })[ToggleFlags.CREDITBYKB]).toBe(true);
  });
});
