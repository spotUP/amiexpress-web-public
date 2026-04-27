import * as https from 'https';
import * as http from 'http';
import { DopewarsConfig } from './types';

export type NotifyEvent =
  | { type: 'join';        handle: string }
  | { type: 'leave';       handle: string }
  | { type: 'busted';      handle: string; location: string; drugsLost: number }
  | { type: 'attack';      attacker: string; target: string; location: string }
  | { type: 'high_score';  handle: string; score: number; turns: number }
  | { type: 'deal';        handle: string; drug: string; amount: number; price: number; action: 'buy' | 'sell' }
  | { type: 'price_spike'; drug: string; location: string; cheap: boolean };

function formatMessage(ev: NotifyEvent): string {
  switch (ev.type) {
    case 'join':
      return `[DOPEWARS] ${ev.handle} entered the streets`;
    case 'leave':
      return `[DOPEWARS] ${ev.handle} left the streets`;
    case 'busted':
      return `[DOPEWARS] ${ev.handle} was busted in ${ev.location}! Lost ${ev.drugsLost} units`;
    case 'attack':
      return `[DOPEWARS] ${ev.attacker} attacked ${ev.target} in ${ev.location}!`;
    case 'high_score':
      return `[DOPEWARS] ${ev.handle} retired with $${ev.score.toLocaleString()} in ${ev.turns} turns — NEW HIGH SCORE!`;
    case 'deal':
      return `[DOPEWARS] ${ev.handle} ${ev.action === 'buy' ? 'bought' : 'sold'} ${ev.amount} ${ev.drug} @ $${ev.price.toLocaleString()}`;
    case 'price_spike':
      return `[DOPEWARS] ${ev.cheap ? 'Cheap' : 'Expensive'} ${ev.drug} spotted in ${ev.location}!`;
  }
}

function postDiscord(webhookUrl: string, message: string): void {
  if (!webhookUrl) return;
  try {
    const body = JSON.stringify({ content: message });
    const url = new URL(webhookUrl);
    const isHttps = url.protocol === 'https:';
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = (isHttps ? https : http).request(options, () => {});
    req.on('error', () => {});
    req.write(body);
    req.end();
  } catch {
    // fire-and-forget — never throw
  }
}

function postLivechat(message: string): void {
  try {
    const livechat = (global as any)[Symbol.for('aex-livechat')];
    if (livechat && typeof livechat.broadcast === 'function') {
      livechat.broadcast({ type: 'system', text: message });
    }
  } catch {
    // livechat not available — silent ignore
  }
}

export class Notifier {
  constructor(private cfg: DopewarsConfig) {}

  send(ev: NotifyEvent): void {
    const msg = formatMessage(ev);
    if (this.cfg.discordWebhook) postDiscord(this.cfg.discordWebhook, msg);
    if (this.cfg.notifyLivechat) postLivechat(msg);
  }
}
