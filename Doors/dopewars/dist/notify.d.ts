import { DopewarsConfig } from './types';
export type NotifyEvent = {
    type: 'join';
    handle: string;
} | {
    type: 'leave';
    handle: string;
} | {
    type: 'busted';
    handle: string;
    location: string;
    drugsLost: number;
} | {
    type: 'attack';
    attacker: string;
    target: string;
    location: string;
} | {
    type: 'high_score';
    handle: string;
    score: number;
    turns: number;
} | {
    type: 'deal';
    handle: string;
    drug: string;
    amount: number;
    price: number;
    action: 'buy' | 'sell';
} | {
    type: 'price_spike';
    drug: string;
    location: string;
    cheap: boolean;
};
/**
 * Which announcements leave the board, and as what.
 *
 * A retirement with a new high score is a score; the rest are announcements
 * of the "something happened, come and look" kind. The board decides who
 * actually receives them - see sdk/core/announce.ts and the sysop's webhook
 * subscriptions - which is the whole point of routing through it.
 */
export declare class Notifier {
    private cfg;
    private announce;
    /**
     * `host` is the door's `ctx.bbs`. Without one - a test, a script - the
     * announcer is a no-op and the game plays on.
     */
    constructor(cfg: DopewarsConfig, host?: unknown);
    send(ev: NotifyEvent): void;
}
//# sourceMappingURL=notify.d.ts.map