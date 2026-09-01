/**
 * Every door type gets a badge that says something true.
 *
 * Reported from the live board on 2026-08-31: DayDream doors drew as `[??]`
 * in DOORMAN's installed list while the detail pane beside them said
 * `Type: DD`. The badge was a lookup table with `?? '??'` behind it, and DD
 * was simply not in it - nor were AIM, MCI, AEM, SUP, IIM, or the lower-cased
 * `python` the registry produces.
 *
 * The rule now: a map only for the types whose badge is NOT their first two
 * letters, and the type's own first two characters for everything else. A
 * door type added next year shows what it is instead of `??`.
 */
import { typeBadge } from '../../../../Doors/door-manager/type-badge';

it('badges DayDream doors DD, not ??', () => {
  expect(typeBadge('DD')).toBe('DD');
});

it('badges the types that are not their own first two letters', () => {
  // A TypeScript door is TS, not TY; an XIM is 68, because what matters to
  // the sysop is that it is a 68K binary.
  expect(typeBadge('TS')).toBe('TS');
  expect(typeBadge('typescript')).toBe('TS');
  expect(typeBadge('SDK')).toBe('TS');
  expect(typeBadge('XIM')).toBe('68');
  expect(typeBadge('AIM')).toBe('68');
  expect(typeBadge('AREXX')).toBe('RX');
  expect(typeBadge('arexx')).toBe('RX');
  expect(typeBadge('python')).toBe('PY');
});

it('falls back to the type itself rather than ??', () => {
  // The types that were missing from the old map, and the ones nobody has
  // written yet.
  expect(typeBadge('SIM')).toBe('SI');
  expect(typeBadge('TIM')).toBe('TI');
  expect(typeBadge('FIM')).toBe('FI');
  expect(typeBadge('IIM')).toBe('II');
  expect(typeBadge('MCI')).toBe('MC');
  expect(typeBadge('AEM')).toBe('AE');
  expect(typeBadge('SUP')).toBe('SU');
  expect(typeBadge('NEWKIND')).toBe('NE');
});

it('is always exactly two characters, so the list stays in its columns', () => {
  for (const type of ['DD', 'TS', 'XIM', 'python', 'MCI', 'NEWKIND', 'x']) {
    expect(typeBadge(type).length).toBeLessThanOrEqual(2);
  }
});

it('says ?? only when there is no type at all', () => {
  expect(typeBadge('')).toBe('??');
  expect(typeBadge(undefined as unknown as string)).toBe('??');
});
