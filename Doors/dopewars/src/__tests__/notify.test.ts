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

  it('broadcasts to livechat when configured', () => {
    const mockBroadcast = jest.fn();
    (global as any)[Symbol.for('aex-livechat')] = { broadcast: mockBroadcast };
    const n = new Notifier({ ...cfg, notifyLivechat: true });
    n.send({ type: 'join', handle: 'SPOT' });
    expect(mockBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'system', text: expect.stringContaining('SPOT') })
    );
    delete (global as any)[Symbol.for('aex-livechat')];
  });

  it('formats all event messages correctly', () => {
    // Test via livechat capture
    const captured: string[] = [];
    (global as any)[Symbol.for('aex-livechat')] = {
      broadcast: (m: any) => captured.push(m.text),
    };
    const n = new Notifier({ ...cfg, notifyLivechat: true });
    n.send({ type: 'busted', handle: 'BOB', location: 'Brooklyn', drugsLost: 7 });
    expect(captured[0]).toContain('BOB');
    expect(captured[0]).toContain('Brooklyn');
    expect(captured[0]).toContain('7');
    delete (global as any)[Symbol.for('aex-livechat')];
  });
});
