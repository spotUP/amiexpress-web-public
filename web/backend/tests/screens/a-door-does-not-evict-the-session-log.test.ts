/**
 * OPENING A DOOR DOES NOT ERASE THE SESSION LOG.
 *
 * "no typescript doors seem logged at all... or no doors at all" and "a lot of
 * stuff is still wiped from the scrollback" (the sysop, 2026-09-24, on
 * localhost).
 *
 * The log kept the last 5000 CHUNKS, and a chunk is whatever one `emit` wrote
 * - which for a blessed door is a handful of cells. A door repainting its
 * screen makes thousands of them a second, so opening one door pushed the
 * caller's entire login, menus and messages out of the log, and what was left
 * was a tail of cursor fragments that read as nothing once the escapes were
 * taken out.
 *
 * The budget is BYTES now, which is what was actually written, and generous
 * enough that a door costs a fraction of it.
 */
import { sessionLogManager } from '../../src/services/SessionLogManager';

const SESSION = 'a-session-with-a-door-in-it';

/** What a blessed door's repaint looks like on the wire: many tiny writes. */
function doorRepaint(cells: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < cells; i++) chunks.push(`\x1b[${(i % 24) + 1};${(i % 80) + 1}H#`);
  return chunks;
}

describe('a session log with a door in it', () => {
  beforeEach(() => {
    sessionLogManager.endSession(SESSION);
    sessionLogManager.startSession(SESSION, 'u1', 'spot', 1);
  });

  afterEach(() => sessionLogManager.endSession(SESSION));

  it('still holds what the caller saw before the door opened', () => {
    sessionLogManager.captureOutput(SESSION, 'WELCOME TO THE BOARD\r\n');
    for (const chunk of doorRepaint(20000)) sessionLogManager.captureOutput(SESSION, chunk);

    const log = sessionLogManager.getSessionLog(SESSION);
    expect(log?.output.join('')).toContain('WELCOME TO THE BOARD');
  });

  it('holds the door itself as well', () => {
    for (const chunk of doorRepaint(20000)) sessionLogManager.captureOutput(SESSION, chunk);

    const log = sessionLogManager.getSessionLog(SESSION);
    expect(log?.output.length).toBeGreaterThan(10000);
  });

  it('still has a ceiling, and drops the OLDEST when it is reached', () => {
    // Two megabytes of output, written as big chunks.
    const chunk = 'x'.repeat(64 * 1024);
    for (let i = 0; i < 40; i++) sessionLogManager.captureOutput(SESSION, `${i}:${chunk}`);

    const log = sessionLogManager.getSessionLog(SESSION);
    const held = log?.output ?? [];
    const bytes = held.join('').length;
    expect(bytes).toBeLessThanOrEqual(2 * 1024 * 1024 + chunk.length);
    // The newest survives; the oldest is what went. Compared as whole chunks,
    // because "10:" contains "0:" and a substring test would lie.
    expect(held.length).toBeLessThan(40);
    expect(held[held.length - 1].startsWith('39:')).toBe(true);
    expect(held[0].startsWith('0:')).toBe(false);
  });
});
