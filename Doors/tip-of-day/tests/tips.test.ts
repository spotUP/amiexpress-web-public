/**
 * Tip pickers: unseen-first per kind, weighted across kinds, fallback on
 * empty. Pure choice over injected data - no screen, no storage.
 */
import assert from 'node:assert';
import { pickTip, FALLBACK_TIP, type TipWeights } from '../tips';
import type { DoorEntry } from '../catalog';

const WEIGHTS: TipWeights = { door: 5, fact: 3, howto: 2, event: 1 };
const EMPTY_FACTS = { conferences: [], doorsInstalled: 0 };

const CATALOG: DoorEntry[] = [
  { name: 'whip', command: 'WHIP', description: 'Demo-scene projects', author: 'AmiExpress Team', inHouse: true },
  { name: 'arkanoid', command: 'ARKANOID', description: 'Arkanoid clone', author: 'AmiExpress Team', inHouse: true },
];

export async function doorSpotlightNamesTheCommand(): Promise<void> {
  const tip = pickTip(CATALOG, EMPTY_FACTS, [], new Set(), { ...WEIGHTS, fact: 0, howto: 0, event: 0 }, () => 0);
  assert.strictEqual(tip.kind, 'door');
  assert.ok(tip.command === 'WHIP' || tip.command === 'ARKANOID');
  assert.ok(tip.id.startsWith('door:'));
}

export async function unseenFirstCyclesTheCatalog(): Promise<void> {
  const seen = new Set(['door:WHIP', 'door:ARKANOID']);
  const tip = pickTip(CATALOG, EMPTY_FACTS, [], seen, { ...WEIGHTS, fact: 0, howto: 0, event: 0 }, () => 0);
  // Nothing fresh: repeats beat silence.
  assert.strictEqual(tip.kind, 'door');
  const fresh = pickTip(CATALOG, EMPTY_FACTS, [], new Set(['door:WHIP']), { ...WEIGHTS, fact: 0, howto: 0, event: 0 }, () => 0.99);
  assert.strictEqual(fresh.id, 'door:ARKANOID');
}

export async function factsDegradeGracefully(): Promise<void> {
  const tip = pickTip([], { conferences: [{ name: 'Amiga' }], doorsInstalled: 40 }, [], new Set(), { ...WEIGHTS, door: 0, howto: 0, event: 0 }, () => 0);
  assert.strictEqual(tip.kind, 'fact');
  assert.ok(tip.body.includes('Amiga') || tip.title.includes('40') || tip.body.includes('40'));
}

export async function emptyWorldFallsBack(): Promise<void> {
  const tip = pickTip([], EMPTY_FACTS, [], new Set(), WEIGHTS, () => 0.5);
  assert.deepStrictEqual(tip, FALLBACK_TIP);
}

export async function zeroWeightDisablesKind(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const tip = pickTip(CATALOG, { conferences: [{ name: 'X' }], doorsInstalled: 1 }, [], new Set(), { door: 0, fact: 1, howto: 0, event: 0 }, Math.random);
    assert.strictEqual(tip.kind, 'fact');
  }
}
