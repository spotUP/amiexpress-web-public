export interface DrugPrice {
    index: number;
    name: string;
    price: number;
    cheap: boolean;
    expensive: boolean;
}
export interface InventoryItem {
    index: number;
    carried: number;
    totalValue: number;
}
export interface GunItem {
    index: number;
    carried: number;
}
export interface PlayerState {
    id: string;
    name: string;
    location: number;
    cash: number;
    debt: number;
    bank: number;
    health: number;
    coatSize: number;
    turn: number;
    totalTurns: number;
    eventNum: number;
    flags: number;
    inCombat: boolean;
    drugs: InventoryItem[];
    guns: GunItem[];
}
export interface MarketState {
    location: number;
    prices: DrugPrice[];
    drugNames: Record<number, string>;
}
export interface GameEvent {
    code: number;
    msg: string;
    isGlobal?: boolean;
}
export interface GameQuestion {
    code: number;
    prompt: string;
}
export interface ActionResult {
    ok: boolean;
    error?: string;
    events: GameEvent[];
    questions: GameQuestion[];
    newState: PlayerState;
}
export interface PlayerSummary {
    id: string;
    name: string;
    location: number;
    health: number;
    turn: number;
}
export interface HighScore {
    id: number;
    playerId: string;
    bbsHandle: string;
    score: number;
    turns: number;
    achievedAt: string;
}
export interface GameTheme {
    title: string;
    /** Drug names in C canonical order (indices 0–11) */
    drugNames: string[];
    /** Sparse: only drugs with a cheap-event string override */
    drugCheapStrings: Partial<Record<number, string>>;
    /** Location names in C canonical order (indices 0–7) */
    locationNames: string[];
}
export interface DopewarsConfig {
    numTurns: number;
    startCash: number;
    startDebt: number;
    debtInterest: number;
    bankInterest: number;
    discordWebhook?: string;
    notifyLivechat: boolean;
    theme?: GameTheme;
}
//# sourceMappingURL=types.d.ts.map