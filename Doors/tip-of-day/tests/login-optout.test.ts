/**
 * The tip at login can be turned off, and back on only by the caller.
 */
import assert from 'node:assert';
import { loginChoice, answerKey } from '../login-optout';

export async function aCallerWhoNeverChoseSeesTheTipAtLogin(): Promise<void> {
  const c = loginChoice('TIPLOGIN', null);
  assert.strictEqual(c.show, true);
  assert.deepStrictEqual(c.hints[0], { key: 'N', does: 'never at login' });
}

export async function nTurnsItOffAndTheNextLoginShowsNothing(): Promise<void> {
  const stored = answerKey('n', null);
  assert.strictEqual(stored, false);
  assert.strictEqual(loginChoice('TIPLOGIN', stored!).show, false);
}

export async function typingTipStillShowsItAndOffersItBack(): Promise<void> {
  const c = loginChoice('TIP', false);
  assert.strictEqual(c.show, true);
  assert.deepStrictEqual(c.hints[0], { key: 'L', does: 'show at login again' });
  assert.strictEqual(answerKey('L', false), true);
  assert.strictEqual(loginChoice('TIPLOGIN', true).show, true);
}

export async function anyOtherKeyOnlyContinues(): Promise<void> {
  assert.strictEqual(answerKey('space', null), undefined);
  assert.strictEqual(answerKey('l', null), undefined);     // already on
  assert.strictEqual(answerKey('n', false), undefined);    // already off
}
