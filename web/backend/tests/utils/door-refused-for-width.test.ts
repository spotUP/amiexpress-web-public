import { doorRefusedForWidth } from '../../src/utils/door-min-columns.util';
const c64 = { petsciiMode: true, petsciiColumns: 40, screenWidth: 40 };
const ansi = { screenWidth: 80 };
test('an unmarked door is refused at 40 and runs at 80', () => {
  expect(doorRefusedForWidth({ type: 'XIM', toolTypes: {} } as any, c64)).toBe(true);
  expect(doorRefusedForWidth({ type: 'XIM', toolTypes: {} } as any, ansi)).toBe(false);
});
test('MIN_COLUMNS=40 or C64_ADAPT=40 opens it at 40', () => {
  expect(doorRefusedForWidth({ type: 'XIM', minColumns: 40, toolTypes: { MIN_COLUMNS: '40' } } as any, c64)).toBe(false);
  expect(doorRefusedForWidth({ type: 'XIM', toolTypes: { C64_ADAPT: '40' } } as any, c64)).toBe(false);
});
