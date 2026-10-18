/**
 * The parked-session question must not wrap mid-word on an 80-column screen:
 * the first sentence ends its line, the question sits on its own, and a long
 * activity name is cut so no line passes 79 visible characters.
 */
jest.mock('../../src/index', () => ({}));
jest.mock('../../src/server/session-parking', () => ({
  isParked: (s: { parked?: boolean }) => s.parked === true,
  moveParkedTo: jest.fn(), endParkedSessionsFor: jest.fn(), endLiveSession: jest.fn(),
}));
jest.mock('../../src/utils/who-table.util', () => ({
  whoEntry: () => ({ action: 'Browsing the Very Long Door Named After A Location In Another Country' }),
}));

import { parkedChoicePrompt } from '../../src/services/parked-session-choice';

const lines = (text: string) => text.split('\r\n').filter((l) => l.length > 0);

describe('parkedChoicePrompt line width', () => {
  for (const parked of [false, true]) {
    it(`no line passes 79 columns for a long activity (${parked ? 'parked' : 'open in another window'})`, () => {
      const text = parkedChoicePrompt({ nodeId: 12, parked } as never, true);
      for (const l of lines(text)) expect(l.length).toBeLessThanOrEqual(79);
      expect(lines(text).pop()).toBe('[R]esume it here or [E]nd it and log in fresh? ');
    });
  }

  it('the open-window sentence ends its line', () => {
    const text = parkedChoicePrompt({ nodeId: 3, parked: false } as never, true);
    expect(text).toContain('in another window.\r\n[R]esume');
  });
});
