/**
 * "What is Phantasm doing?" as something the page answers.
 *
 * The Activity feed answers "what happened". Getting from that to what one
 * caller is doing means scrolling and filtering, and every event type added
 * to the feed makes it worse - which is why more events alone would not have
 * been an improvement.
 *
 * This joins the two halves the page already holds: the node status, for what
 * each caller is doing RIGHT NOW, and the event stream, for the last thing
 * they actually did.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { whoIsDoingWhat } from '../pages/who-is-doing-what';

const NODE = {
  nodeId: 2,
  online: true,
  username: 'Phantasm',
  location: 'nEVERLaND',
  currentActivity: 'door_running',
};

describe('who is doing what', () => {
  it('says what a caller is doing now, in words', () => {
    const [caller] = whoIsDoingWhat([NODE], []);

    expect(caller.username).toBe('Phantasm');
    expect(caller.doing).toBe('In a door');
    expect(caller.nodeId).toBe(2);
  });

  it('adds the last thing they actually did', () => {
    const [caller] = whoIsDoingWhat([NODE], [
      { username: 'Phantasm', timestamp: 200, detail: 'Started a game of FROGGER' },
      { username: 'Phantasm', timestamp: 100, detail: 'Joined Amiga Elite' },
    ]);

    expect(caller.lastDetail).toBe('Started a game of FROGGER');
    expect(caller.lastAt).toBe(200);
  });

  // The feed is newest-first, but the join must not depend on that.
  it('takes the newest event whatever order the feed is in', () => {
    const [caller] = whoIsDoingWhat([NODE], [
      { username: 'Phantasm', timestamp: 100, detail: 'older' },
      { username: 'Phantasm', timestamp: 300, detail: 'newest' },
      { username: 'Phantasm', timestamp: 200, detail: 'middle' },
    ]);

    expect(caller.lastDetail).toBe('newest');
  });

  it('matches a caller to their events regardless of case', () => {
    const [caller] = whoIsDoingWhat([NODE], [
      { username: 'PHANTASM', timestamp: 1, detail: 'Read messages' },
    ]);

    expect(caller.lastDetail).toBe('Read messages');
  });

  // A node with no user is a connection that has not logged in - the same
  // rule listOnlineNodes uses on the server.
  it('leaves out a node with nobody on it', () => {
    const rows = whoIsDoingWhat(
      [NODE, { nodeId: 3, online: true }, { nodeId: 4, online: false, username: 'Ghost' }],
      [],
    );

    expect(rows.map(r => r.username)).toEqual(['Phantasm']);
  });

  it('still lists a caller the feed has never seen', () => {
    const [caller] = whoIsDoingWhat([NODE], []);

    expect(caller.username).toBe('Phantasm');
    expect(caller.lastDetail).toBeUndefined();
  });

  it('puts whoever did something most recently first', () => {
    const rows = whoIsDoingWhat(
      [
        { nodeId: 1, online: true, username: 'Older', currentActivity: 'waiting' },
        { nodeId: 2, online: true, username: 'Newer', currentActivity: 'waiting' },
      ],
      [
        { username: 'Older', timestamp: 100, detail: 'a' },
        { username: 'Newer', timestamp: 900, detail: 'b' },
      ],
    );

    expect(rows.map(r => r.username)).toEqual(['Newer', 'Older']);
  });

  // A caller with no events must not jump about between renders.
  it('orders callers the feed has not seen by node', () => {
    const rows = whoIsDoingWhat(
      [
        { nodeId: 5, online: true, username: 'Five' },
        { nodeId: 1, online: true, username: 'One' },
      ],
      [],
    );

    expect(rows.map(r => r.username)).toEqual(['One', 'Five']);
  });

  it('survives having no data at all', () => {
    expect(whoIsDoingWhat(undefined, undefined)).toEqual([]);
  });

  // The join is worth nothing if the page does not render it.
  it('is rendered by the Activity page', () => {
    const page = readFileSync(
      resolve(__dirname, '..', 'pages', 'ActivityPage.tsx'),
      'utf8',
    );

    expect(page).toContain('whoIsDoingWhat(');
    expect(page).toContain('On the board now');
  });

  // "At the menu" says nothing about whether someone is reading it or went to
  // make tea twenty minutes ago, and that is most of what a sysop wants from a
  // who's-online list. The node status carries it and the panel showed
  // neither this nor the time remaining.
  it('carries when the caller last did anything', () => {
    const [caller] = whoIsDoingWhat(
      [{ ...NODE, lastActivity: '2026-09-01T18:30:00.000Z', timeRemaining: 45 }],
      [],
    );

    expect(caller.lastActivityAt).toBe(Date.parse('2026-09-01T18:30:00.000Z'));
    expect(caller.timeRemaining).toBe(45);
  });

  it('survives a missing or unparseable timestamp rather than showing NaN', () => {
    expect(whoIsDoingWhat([NODE], [])[0].lastActivityAt).toBeUndefined();
    expect(
      whoIsDoingWhat([{ ...NODE, lastActivity: 'not a date' }], [])[0].lastActivityAt,
    ).toBeUndefined();
  });

  it('is rendered by the page', () => {
    const page = readFileSync(
      resolve(__dirname, '..', 'pages', 'ActivityPage.tsx'),
      'utf8',
    );

    expect(page).toContain('caller.lastActivityAt');
    expect(page).toContain('caller.timeRemaining');
  });
});
