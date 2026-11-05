/**
 * A REFUSED ACCOUNT IS TOLD SO, NOT SENT ROUND AGAIN.
 *
 * The admin's route guard answers "allow, or send them to Screens". Every
 * Content destination is wrapped in it except Screens itself - because Screens
 * IS the fallback, and guarding the fallback with that rule sends a refused
 * account to the place that just refused them, for ever.
 *
 * Leaving it unguarded is how the page came to decide its own access, with a
 * `secLevel < 255` fork inside it choosing between two different tools. The
 * screens rework removes that fork, so the route has to be guarded, so the
 * loop has to be answered first.
 *
 * Three outcomes, not two: allow, redirect, and refuse-with-a-reason.
 */
import { describe, expect, it } from 'vitest';

import {
  routeAccess,
  routeKeyOf,
  levelRequired,
  FALLBACK_ROUTE,
} from '../src/components/AppShell/route-access';

/** No live table: every answer comes from the compiled-in nav floors. */
const NONE: Record<string, number> = {};

describe('reading the route out of the path', () => {
  it('takes the segment after /admin/', () => {
    expect(routeKeyOf('/admin/screens')).toBe('screens');
    expect(routeKeyOf('/admin/operator-chat/personas')).toBe('operator-chat');
  });

  it('answers the empty string for the index, which is the Overview', () => {
    expect(routeKeyOf('/admin')).toBe('');
    expect(routeKeyOf('/admin/')).toBe('');
  });
});

describe('a sysop', () => {
  it('opens everything', () => {
    for (const key of ['', 'screens', 'nodes', 'users', 'health']) {
      expect(routeAccess(key, 255, NONE)).toEqual({ kind: 'allow' });
    }
  });
});

describe('an artist at level 100', () => {
  it('opens Screens', () => {
    expect(routeAccess('screens', 100, NONE)).toEqual({ kind: 'allow' });
  });

  it('is sent to Screens from a sysop destination', () => {
    expect(routeAccess('users', 100, NONE)).toEqual({
      kind: 'redirect',
      to: '/admin/screens',
    });
  });

  it('is sent to Screens from the Overview, whose data is sysop-only', () => {
    expect(routeAccess('', 100, NONE)).toEqual({ kind: 'redirect', to: '/admin/screens' });
  });
});

describe('an account below every floor', () => {
  it('is REFUSED on Screens rather than redirected to it', () => {
    // The loop: level 99 is under Screens' own floor, and Screens is where a
    // refusal sends you.
    const access = routeAccess('screens', 99, NONE);
    expect(access.kind).toBe('refuse');
    expect(access.kind === 'refuse' && access.reason.length).toBeGreaterThan(0);
  });

  it('is refused anywhere else too, instead of being bounced into a refusal', () => {
    const access = routeAccess('users', 99, NONE);
    expect(access.kind).toBe('refuse');
  });

  it('never answers redirect when the fallback would refuse them', () => {
    for (const key of ['', 'screens', 'users', 'nodes', 'logs']) {
      expect(routeAccess(key, 99, NONE).kind).not.toBe('redirect');
    }
  });
});

describe('the live permission table wins over the compiled floor', () => {
  it('opens a destination a sysop lowered', () => {
    expect(routeAccess('logs', 100, { logs: 100 })).toEqual({ kind: 'allow' });
  });

  it('closes one a sysop raised', () => {
    expect(routeAccess('screens', 100, { screens: 255 }).kind).toBe('refuse');
  });

  it('reports the level it used', () => {
    expect(levelRequired('screens', { screens: 150 })).toBe(150);
    expect(levelRequired('screens', NONE)).toBe(100);
  });

  it('a raised fallback stops being a redirect target', () => {
    // Screens raised to 255 means a level-100 account has nowhere to go, and
    // saying so beats sending them somewhere that will refuse them.
    expect(routeAccess('users', 100, { screens: 255 }).kind).toBe('refuse');
  });
});

describe('the fallback is the one the guard actually uses', () => {
  it('is Screens', () => {
    expect(FALLBACK_ROUTE).toBe('screens');
  });
});
