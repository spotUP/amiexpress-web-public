import * as path from 'path';
import { loadDoorWasm, WasmModule } from '@amiexpress/bbs-door-sdk/utils/wasm-loader';
import { PlayerState, MarketState } from './types';

type EventCb    = (userdata: number, code: number, json: string) => void;
type QuestionCb = (userdata: number, code: number, json: string) => void;

export class DopewarsWasmBindings {
  private m: WasmModule;
  private fns: {
    setCallbacks:       (onEvent: number, onQuestion: number) => void;
    initGame:           (turns: number, cash: number, debt: number, di: number, bi: number) => void;
    addPlayer:          (userdata: number, name: string) => number;
    removePlayer:       (idx: number) => void;
    generateDrugs:      (idx: number) => void;
    randomOffer:        (idx: number) => number;
    buyDrug:            (idx: number, drug: number, amount: number) => void;
    sellDrug:           (idx: number, drug: number, amount: number) => void;
    movePlayer:         (idx: number, location: number) => void;
    handleAnswer:       (idx: number, answer: string) => void;
    copsAttack:         (idx: number) => void;
    attackPlayer:       (attacker: number, target: number) => void;
    fire:               (idx: number) => void;
    withdrawFromCombat: (idx: number) => void;
    runFromCombat:      (idx: number, loc: number) => void;
    spyPlayer:          (spy: number, target: number) => void;
    tipPlayer:          (tipper: number, target: number) => void;
    sendHighScores:     (idx: number, endGame: number) => void;
    getPlayerState:     (idx: number) => string;
    getMarket:          (idx: number) => string;
    setDrugName:        (index: number, name: string) => void;
    setDrugCheapStr:    (index: number, str: string)  => void;
    setLocationName:    (index: number, name: string) => void;
    getNumDrugs:        () => number;
    getNumLocations:    () => number;
  };

  private constructor(m: WasmModule) {
    this.m = m;
    const w = (name: string, ret: string | null, args: string[]) =>
      m.cwrap(name, ret, args);

    this.fns = {
      setCallbacks:       w('wasm_set_callbacks',        null,     ['number','number']),
      initGame:           w('wasm_init_game',            null,     ['number','number','number','number','number']),
      addPlayer:          w('wasm_add_player',           'number', ['number','string']),
      removePlayer:       w('wasm_remove_player',        null,     ['number']),
      generateDrugs:      w('wasm_generate_drugs',       null,     ['number']),
      randomOffer:        w('wasm_random_offer',         'number', ['number']),
      buyDrug:            w('wasm_buy_drug',             null,     ['number','number','number']),
      sellDrug:           w('wasm_sell_drug',            null,     ['number','number','number']),
      movePlayer:         w('wasm_move_player',          null,     ['number','number']),
      handleAnswer:       w('wasm_handle_answer',        null,     ['number','string']),
      copsAttack:         w('wasm_cops_attack',          null,     ['number']),
      attackPlayer:       w('wasm_attack_player',        null,     ['number','number']),
      fire:               w('wasm_fire',                 null,     ['number']),
      withdrawFromCombat: w('wasm_withdraw_from_combat', null,     ['number']),
      runFromCombat:      w('wasm_run_from_combat',      null,     ['number','number']),
      spyPlayer:          w('wasm_spy_player',           null,     ['number','number']),
      tipPlayer:          w('wasm_tip_player',           null,     ['number','number']),
      sendHighScores:     w('wasm_send_high_scores',     null,     ['number','number']),
      getPlayerState:     w('wasm_get_player_state',     'string', ['number']),
      getMarket:          w('wasm_get_market',           'string', ['number']),
      setDrugName:        w('wasm_set_drug_name',        null,     ['number','string']),
      setDrugCheapStr:    w('wasm_set_drug_cheap_str',   null,     ['number','string']),
      setLocationName:    w('wasm_set_location_name',    null,     ['number','string']),
      getNumDrugs:        w('wasm_get_num_drugs',        'number', []),
      getNumLocations:    w('wasm_get_num_locations',    'number', []),
    } as typeof this.fns;
  }

  static async load(doorDir: string): Promise<DopewarsWasmBindings> {
    const m = await loadDoorWasm(doorDir, 'dopewars.js');
    return new DopewarsWasmBindings(m);
  }

  registerCallbacks(onEvent: EventCb, onQuestion: QuestionCb): void {
    const eventPtr    = this.m.addFunction(onEvent,    'viii');
    const questionPtr = this.m.addFunction(onQuestion, 'viii');
    this.fns.setCallbacks(eventPtr, questionPtr);
  }

  initGame(turns: number, cash: number, debt: number, debtInt: number, bankInt: number): void {
    this.fns.initGame(turns, cash, debt, debtInt, bankInt);
  }

  addPlayer(userdataHandle: number, name: string): number {
    return this.fns.addPlayer(userdataHandle, name);
  }

  removePlayer(idx: number): void        { this.fns.removePlayer(idx); }
  generateDrugs(idx: number): void       { this.fns.generateDrugs(idx); }
  randomOffer(idx: number): number       { return this.fns.randomOffer(idx); }
  buyDrug(idx: number, drug: number, amt: number): void  { this.fns.buyDrug(idx, drug, amt); }
  sellDrug(idx: number, drug: number, amt: number): void { this.fns.sellDrug(idx, drug, amt); }
  movePlayer(idx: number, loc: number): void { this.fns.movePlayer(idx, loc); }
  handleAnswer(idx: number, ans: string): void { this.fns.handleAnswer(idx, ans); }
  copsAttack(idx: number): void          { this.fns.copsAttack(idx); }
  attackPlayer(a: number, t: number): void { this.fns.attackPlayer(a, t); }
  fire(idx: number): void                { this.fns.fire(idx); }
  withdrawFromCombat(idx: number): void  { this.fns.withdrawFromCombat(idx); }
  runFromCombat(idx: number, loc: number): void { this.fns.runFromCombat(idx, loc); }
  spyPlayer(spy: number, target: number): void  { this.fns.spyPlayer(spy, target); }
  tipPlayer(tipper: number, target: number): void { this.fns.tipPlayer(tipper, target); }
  sendHighScores(idx: number, endGame: boolean): void {
    this.fns.sendHighScores(idx, endGame ? 1 : 0);
  }

  getPlayerState(idx: number): PlayerState {
    const json = this.fns.getPlayerState(idx);
    return JSON.parse(json ?? 'null');
  }

  getMarket(idx: number): MarketState {
    const json = this.fns.getMarket(idx);
    return JSON.parse(json ?? 'null');
  }

  setDrugName(i: number, n: string): void      { this.fns.setDrugName(i, n); }
  setDrugCheapStr(i: number, s: string): void  { this.fns.setDrugCheapStr(i, s); }
  setLocationName(i: number, n: string): void  { this.fns.setLocationName(i, n); }
  getNumDrugs(): number                         { return this.fns.getNumDrugs(); }
  getNumLocations(): number                     { return this.fns.getNumLocations(); }
}
