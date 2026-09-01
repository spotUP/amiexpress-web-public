/**
 * The feed says what happened, in words.
 *
 * It used to print the board's own shorthand with punctuation around it:
 * "U in conference 2", "entered FROGGER", "Tetris.ans (3.3 KB)". Reading any
 * of those needed you to know that U is upload and that conference 2 is Amiga
 * Elite.
 *
 * The cases below are the sysop's own examples, kept as the assertions.
 */

import { describe, expect, it } from 'vitest';
import {
  describeCommand,
  describeDoorActivity,
  describeTransfer,
} from '../pages/activity-phrasing';

describe('a command', () => {
  it('says what the user did, in the conference they did it in', () => {
    expect(describeCommand('U', 'Amiga Elite')).toBe('Started an upload in Amiga Elite');
  });

  it('names the conference a join went TO, without saying "in"', () => {
    // "Joined Amiga Elite" - not "Joined in Amiga Elite".
    expect(describeCommand('J', 'Amiga Elite')).toBe('Joined Amiga Elite');
  });

  it('still reads when the conference is unknown', () => {
    expect(describeCommand('J', undefined)).toBe('Joined a conference');
    expect(describeCommand('R', undefined)).toBe('Read messages');
  });

  // Most commands are not about a conference at all, and appending one would
  // be noise: "Logged off in Amiga Elite" is worse than "Logged off".
  it('leaves the conference off a command that has nothing to do with one', () => {
    expect(describeCommand('G', 'Amiga Elite')).toBe('Logged off');
    expect(describeCommand('O', 'Amiga Elite')).toBe('Paged the sysop');
  });

  // A door command, or one a sysop added, has no entry. The letter is still
  // better than an empty line.
  it('falls back to the command itself when it does not know it', () => {
    expect(describeCommand('ZZ', 'Amiga Elite')).toBe('ZZ in Amiga Elite');
    expect(describeCommand('ZZ', undefined)).toBe('ZZ');
  });

  it('is case-insensitive about the command', () => {
    expect(describeCommand('j', 'Amiga Elite')).toBe('Joined Amiga Elite');
  });

  it('says nothing for no command', () => {
    expect(describeCommand(undefined, 'Amiga Elite')).toBe('');
  });
});

describe('a door', () => {
  it('is played, when the board knows it is a game', () => {
    expect(describeDoorActivity('FROGGER', 'entered', true)).toBe('Started a game of FROGGER');
    expect(describeDoorActivity('FROGGER', 'exited', true)).toBe('Stopped playing FROGGER');
  });

  // Calling DOORMAN or LINKWALL "a game" reads worse than the shorthand did,
  // so a door the board cannot vouch for is opened and left, not played.
  it('is opened and left, when it is not', () => {
    expect(describeDoorActivity('DOORMAN', 'entered', false)).toBe('Opened DOORMAN');
    expect(describeDoorActivity('DOORMAN', 'exited', false)).toBe('Left DOORMAN');
  });

  it('survives a door with no name', () => {
    expect(describeDoorActivity(undefined, 'entered', false)).toBe('Opened a door');
  });
});

describe('a transfer', () => {
  it('says where the file went', () => {
    expect(describeTransfer('upload', 'Tetris.ans', '3.3 KB', 'Amiga Elite'))
      .toBe('Uploaded Tetris.ans to Amiga Elite (3.3 KB)');
  });

  it('says where a download came FROM', () => {
    expect(describeTransfer('download', 'Tetris.ans', '3.3 KB', 'Amiga Elite'))
      .toBe('Downloaded Tetris.ans from Amiga Elite (3.3 KB)');
  });

  it('drops the area when it is not known, rather than saying "to undefined"', () => {
    expect(describeTransfer('upload', 'Tetris.ans', '3.3 KB', undefined))
      .toBe('Uploaded Tetris.ans (3.3 KB)');
  });

  it('drops the size when it is not known', () => {
    expect(describeTransfer('upload', 'Tetris.ans', undefined, 'Amiga Elite'))
      .toBe('Uploaded Tetris.ans to Amiga Elite');
  });
});
