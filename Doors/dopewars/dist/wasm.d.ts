import { PlayerState, MarketState } from './types';
type EventCb = (userdata: number, code: number, json: string) => void;
type QuestionCb = (userdata: number, code: number, json: string) => void;
export declare class DopewarsWasmBindings {
    private m;
    private fns;
    private constructor();
    static load(doorDir: string): Promise<DopewarsWasmBindings>;
    registerCallbacks(onEvent: EventCb, onQuestion: QuestionCb): void;
    initGame(turns: number, cash: number, debt: number, debtInt: number, bankInt: number): void;
    addPlayer(userdataHandle: number, name: string): number;
    removePlayer(idx: number): void;
    generateDrugs(idx: number): void;
    randomOffer(idx: number): number;
    buyDrug(idx: number, drug: number, amt: number): void;
    sellDrug(idx: number, drug: number, amt: number): void;
    movePlayer(idx: number, loc: number): void;
    handleAnswer(idx: number, ans: string): void;
    copsAttack(idx: number): void;
    attackPlayer(a: number, t: number): void;
    fire(idx: number): void;
    withdrawFromCombat(idx: number): void;
    runFromCombat(idx: number, loc: number): void;
    spyPlayer(spy: number, target: number): void;
    tipPlayer(tipper: number, target: number): void;
    sendHighScores(idx: number, endGame: boolean): void;
    getPlayerState(idx: number): PlayerState;
    getMarket(idx: number): MarketState;
}
export {};
//# sourceMappingURL=wasm.d.ts.map