import { Notifier, NotifyEvent } from '../notify';
import { DopewarsConfig } from '../types';

const cfg: DopewarsConfig = {
  numTurns: 30, startCash: 2000, startDebt: 5500,
  debtInterest: 10, bankInterest: 5,
  notifyLivechat: false,
};

describe('Notifier', () => {
  it('does not throw when no discord webhook configured', () => {
    const n = new Notifier(cfg);
    expect(() => n.send({ type: 'join', handle: 'SPOT' })).not.toThrow();
  });

  it('handles all 7 event types without throwing', () => {
    const n = new Notifier(cfg);
    const events: NotifyEvent[] = [
      { type: 'join',        handle: 'X' },
      { type: 'leave',       handle: 'X' },
      { type: 'busted',      handle: 'X', location: 'Brooklyn', drugsLost: 3 },
      { type: 'attack',      attacker: 'A', target: 'B', location: 'Bronx' },
      { type: 'high_score',  handle: 'X', score: 99000, turns: 28 },
      { type: 'deal',        handle: 'X', drug: 'Cocaine', amount: 5, price: 18000, action: 'buy' },
      { type: 'price_spike', drug: 'Heroin', location: 'Manhattan', cheap: true },
    ];
    events.forEach(ev => expect(() => n.send(ev)).not.toThrow());
  });

  it('announces through the board rather than a global symbol', () => {
    // It used to reach LiveChat by looking up Symbol.for('aex-livechat') on
    // the global object, and Discord by POSTing to a URL of its own - so a
    // sysop could neither filter it nor stop it, and the board's PII policy
    // never saw it. It goes through ctx.bbs now (sdk/core/announce.ts).
    const seen: Array<{ type: string; message: string }> = [];
    const host = { emitCustomEvent: (type: string, message: string) => { seen.push({ type, message }); } };

    const n = new Notifier({ ...cfg, notifyLivechat: true }, host);
    n.send({ type: 'join', handle: 'SPOT' });

    expect(seen).toHaveLength(1);
    expect(seen[0].type).toBe('dopewars_join');
    expect(seen[0].message).toContain('SPOT');
  });

  it('sends a retirement as a score, which is what the board routes to webhooks', () => {
    const seen: Array<{ type: string; message: string; data?: any }> = [];
    const host = {
      emitCustomEvent: (type: string, message: string, data?: any) => { seen.push({ type, message, data }); },
    };

    const n = new Notifier({ ...cfg, notifyLivechat: true }, host);
    n.send({ type: 'high_score', handle: 'SPOT', score: 99000, turns: 28 });

    expect(seen[0].type).toBe('score');
    expect(seen[0].data.score).toBe(99000);
    expect(seen[0].data.turns).toBe(28);
  });

  it('formats all event messages correctly', () => {
    const seen: string[] = [];
    const host = { emitCustomEvent: (_t: string, message: string) => { seen.push(message); } };

    const n = new Notifier({ ...cfg, notifyLivechat: true }, host);
    n.send({ type: 'busted', handle: 'BOB', location: 'Brooklyn', drugsLost: 7 });

    expect(seen[0]).toContain('BOB');
    expect(seen[0]).toContain('Brooklyn');
    expect(seen[0]).toContain('7');
  });

  it('stays quiet when the board switched announcements off', () => {
    const seen: string[] = [];
    const host = { emitCustomEvent: (_t: string, m: string) => { seen.push(m); } };

    const n = new Notifier({ ...cfg, notifyLivechat: false }, host);
    n.send({ type: 'join', handle: 'SPOT' });

    expect(seen).toEqual([]);
  });

  it('is harmless without a host at all', () => {
    // A test, a script, an older board: the game plays on.
    const n = new Notifier(cfg);
    expect(() => n.send({ type: 'attack', attacker: 'A', target: 'B', location: 'Bronx' })).not.toThrow();
  });
});
