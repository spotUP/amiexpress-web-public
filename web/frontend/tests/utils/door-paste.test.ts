/**
 * A paste into a game-mode door sends its text, line breaks as Enter (CR).
 * See packages/terminal/src/utils/door-paste.ts (sysop, 2026-11-06:
 * "i still cant copy or paste").
 */
import { describe, it, expect } from 'vitest';
import { doorPasteText, DOOR_PASTE_MAX } from '../../../../packages/terminal/src/utils/door-paste';

describe('doorPasteText', () => {
  it('turns LF and CRLF into CR', () => {
    expect(doorPasteText('a\nb\r\nc')).toBe('a\rb\rc');
  });
  it('sends nothing for an empty clipboard', () => {
    expect(doorPasteText('')).toBeNull();
    expect(doorPasteText(undefined)).toBeNull();
  });
  it('caps a huge paste', () => {
    expect(doorPasteText('x'.repeat(DOOR_PASTE_MAX + 10))!.length).toBe(DOOR_PASTE_MAX);
  });
});
