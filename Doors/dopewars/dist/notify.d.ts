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
export declare class Notifier {
    private cfg;
    constructor(cfg: DopewarsConfig);
    send(ev: NotifyEvent): void;
}
//# sourceMappingURL=notify.d.ts.map