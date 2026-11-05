/**
 * The door driven through its real keys.
 *
 * Hotseat is exercised end to end; the two-caller path is exercised by
 * running two apps in one process against the board's in-process lobby
 * broker, which is what two callers on one board actually are.
 */
import * as assert from 'assert';
import { WormsApp, type DoorSession } from '../app';
import { WormsNet } from '../net';

class FakeTerminal {
  readonly chunks: string[] = [];
  closed = false;
  readonly achievements: string[] = [];

  session(id: number): DoorSession {
    return {
      socket: { emit: (_event: string, data: string) => { this.chunks.push(data); } },
      bbsSession: { texttvMode: true, screenHeight: 25, nodeId: id },
      user: { id, username: `caller${id}` },
      close: () => { this.closed = true; },
      achievement: type => { this.achievements.push(type); return true; },
    };
  }

  get text(): string {
    return this.chunks
      .join('')
      .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
      .replace(/\x1b#[0-9]/g, '');
  }

  forget(): void {
    this.chunks.length = 0;
  }
}

function type(app: WormsApp, keys: string): void {
  for (const key of keys) app.handleInput(key);
}

/**
 * Open the door with no network at all, so the menu is hotseat and quit.
 *
 * The seed fixes the landscape and the wind. Without it the match is
 * generated from Math.random, and a test that fires a fixed sequence of
 * shots at a random landscape passes or fails on the weather.
 */
function openLocal(seed = 55): { term: FakeTerminal; app: WormsApp } {
  const term = new FakeTerminal();
  const app = new WormsApp(term.session(1), null, seed);
  app.start();
  return { term, app };
}

/** Long enough for the key reader's escape grace period to expire. */
const settle = () => new Promise(resolve => setTimeout(resolve, 120));

export async function theMenuOffersHotseat(): Promise<void> {
  const { term, app } = openLocal();
  assert.ok(term.text.includes('WORMS'), term.text.slice(0, 120));
  assert.ok(term.text.includes('Hotseat'));
  app.stop();
}

export async function hotseatStartsAMatchWithBothTeams(): Promise<void> {
  const { term, app } = openLocal();
  term.forget();
  type(app, '\r');
  assert.ok(term.text.includes('RED') && term.text.includes('BLUE'), term.text.slice(0, 200));
  assert.ok(term.text.includes('ANGLE'), 'and the aim read-out');
  assert.ok(term.text.includes('WIND'));
  app.stop();
}

export async function arrowsAimAndPlusMinusSetPower(): Promise<void> {
  const { term, app } = openLocal();
  type(app, '\r');
  term.forget();
  app.handleInput('\x1b[A');
  assert.ok(term.text.includes('ANGLE 47'), term.text.slice(0, 120));
  app.handleInput('\x1b[B');
  app.handleInput('\x1b[B');
  assert.ok(term.text.includes('ANGLE 43'));

  term.forget();
  type(app, '+');
  assert.ok(term.text.includes('POWER  7'), term.text.slice(0, 120));
  type(app, '-');
  type(app, '-');
  assert.ok(term.text.includes('POWER  5'));
  app.stop();
}

export async function arrowsAlsoTurnTheWormAround(): Promise<void> {
  const { term, app } = openLocal();
  type(app, '\r');
  term.forget();
  app.handleInput('\x1b[D');
  assert.ok(term.text.includes('<<'), 'facing left');
  app.handleInput('\x1b[C');
  assert.ok(term.text.includes('>>'), 'facing right');
  app.stop();
}

export async function firingHandsTheTurnToTheOtherTeam(): Promise<void> {
  const { term, app } = openLocal();
  type(app, '\r');
  term.forget();
  type(app, ' ');
  // The shot page says what happened and waits.
  assert.ok(/SPACE=Next/.test(term.text), term.text.slice(-200));
  term.forget();
  type(app, ' ');
  // Blue is up: the marker moved.
  const blueLine = term.text.split('\n').find(line => line.includes('BLUE')) ?? '';
  assert.ok(blueLine.indexOf('>') >= 0, `expected blue to be marked: ${blueLine}`);
  app.stop();
}

export async function aMatchCanBePlayedToTheEnd(): Promise<void> {
  // Both sides aim at each other at full power and fire until somebody
  // wins - which is what a match is. On this seed it resolves in ten
  // turns; the cap is only there so a regression cannot hang the suite.
  const { term, app } = openLocal(55);
  type(app, '\r');
  let red = true;
  for (let turn = 0; turn < 60 && !term.text.includes('WINS') && !term.text.includes('A DRAW'); turn++) {
    app.handleInput(red ? '\x1b[C' : '\x1b[D'); // face the enemy
    type(app, '++++');                            // full power
    type(app, '\x1b[B\x1b[B\x1b[B\x1b[B\x1b[B'); // flatten the arc
    type(app, ' ');                               // fire
    type(app, ' ');                               // acknowledge
    red = !red;
  }
  assert.ok(
    term.text.includes('WINS') || term.text.includes('A DRAW'),
    'a match of random shots still ends',
  );
  assert.ok(term.achievements.includes('teletext_worms_match'), 'and the board hears about it');
  app.stop();
}

export async function escapeGoesBackToTheMenu(): Promise<void> {
  const { term, app } = openLocal();
  type(app, '\r');
  term.forget();
  app.handleInput('\x1b');
  await settle();
  assert.ok(term.text.includes('Hotseat'), 'back at the menu');
  app.stop();
}

export async function quitClosesTheDoor(): Promise<void> {
  const { term, app } = openLocal();
  type(app, 'q');
  assert.strictEqual(term.closed, true);
  app.stop();
}

export async function twoCallersOnOneBoardPlayEachOther(): Promise<void> {
  // Two door instances in one process is exactly what two callers are, and
  // the in-process lobby broker is what joins them.
  const hostTerm = new FakeTerminal();
  const guestTerm = new FakeTerminal();
  const hostNet = new WormsNet({ user: { id: 1, username: 'host' }, nodeId: 1 });
  const guestNet = new WormsNet({ user: { id: 2, username: 'guest' }, nodeId: 2 });

  const host = new WormsApp(hostTerm.session(1), hostNet);
  const guest = new WormsApp(guestTerm.session(2), guestNet);
  host.start();
  guest.start();

  // Host picks "Host a match".
  host.handleInput('\x1b[B');
  type(host, '\r');
  await settle();
  assert.ok(hostTerm.text.includes('WAITING'), hostTerm.text.slice(0, 200));

  // Guest picks "Join a match".
  guest.handleInput('\x1b[B');
  guest.handleInput('\x1b[B');
  type(guest, '\r');
  await settle();

  assert.ok(
    hostTerm.text.includes('ANGLE') || hostTerm.text.includes('RED'),
    `the host should be in the match: ${hostTerm.text.slice(-200)}`,
  );
  assert.ok(
    guestTerm.text.includes('ANGLE') && guestTerm.text.includes('RED'),
    `the guest should be shown the host's match: ${guestTerm.text.slice(-200)}`,
  );

  // And the guest's own turn is blue's, not red's.
  assert.ok(/is aiming|arrows aim/.test(guestTerm.text), guestTerm.text.slice(-120));

  host.stop();
  guest.stop();
}
