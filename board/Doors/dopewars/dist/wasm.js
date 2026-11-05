"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DopewarsWasmBindings = void 0;
const wasm_loader_1 = require("@amiexpress/bbs-door-sdk/utils/wasm-loader");
class DopewarsWasmBindings {
    constructor(m) {
        this.m = m;
        const w = (name, ret, args) => m.cwrap(name, ret, args);
        this.fns = {
            setCallbacks: w('wasm_set_callbacks', null, ['number', 'number']),
            initGame: w('wasm_init_game', null, ['number', 'number', 'number', 'number', 'number']),
            addPlayer: w('wasm_add_player', 'number', ['number', 'string']),
            removePlayer: w('wasm_remove_player', null, ['number']),
            restorePlayerState: w('wasm_restore_player_state', null, ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number']),
            generateDrugs: w('wasm_generate_drugs', null, ['number']),
            randomOffer: w('wasm_random_offer', 'number', ['number']),
            buyDrug: w('wasm_buy_drug', null, ['number', 'number', 'number']),
            sellDrug: w('wasm_sell_drug', null, ['number', 'number', 'number']),
            movePlayer: w('wasm_move_player', null, ['number', 'number']),
            handleAnswer: w('wasm_handle_answer', null, ['number', 'string']),
            copsAttack: w('wasm_cops_attack', null, ['number']),
            attackPlayer: w('wasm_attack_player', null, ['number', 'number']),
            fire: w('wasm_fire', null, ['number']),
            withdrawFromCombat: w('wasm_withdraw_from_combat', null, ['number']),
            runFromCombat: w('wasm_run_from_combat', null, ['number', 'number']),
            spyPlayer: w('wasm_spy_player', null, ['number', 'number']),
            tipPlayer: w('wasm_tip_player', null, ['number', 'number']),
            sendHighScores: w('wasm_send_high_scores', null, ['number', 'number']),
            getPlayerState: w('wasm_get_player_state', 'string', ['number']),
            getMarket: w('wasm_get_market', 'string', ['number']),
            setDrugName: w('wasm_set_drug_name', null, ['number', 'string']),
            setDrugCheapStr: w('wasm_set_drug_cheap_str', null, ['number', 'string']),
            setLocationName: w('wasm_set_location_name', null, ['number', 'string']),
            getNumDrugs: w('wasm_get_num_drugs', 'number', []),
            getNumLocations: w('wasm_get_num_locations', 'number', []),
        };
    }
    static async load(doorDir) {
        const m = await (0, wasm_loader_1.loadDoorWasm)(doorDir, 'dopewars.js');
        return new DopewarsWasmBindings(m);
    }
    registerCallbacks(onEvent, onQuestion) {
        const eventPtr = this.m.addFunction(onEvent, 'viii');
        const questionPtr = this.m.addFunction(onQuestion, 'viii');
        this.fns.setCallbacks(eventPtr, questionPtr);
    }
    initGame(turns, cash, debt, debtInt, bankInt) {
        this.fns.initGame(turns, cash, debt, debtInt, bankInt);
    }
    addPlayer(userdataHandle, name) {
        return this.fns.addPlayer(userdataHandle, name);
    }
    removePlayer(idx) { this.fns.removePlayer(idx); }
    generateDrugs(idx) { this.fns.generateDrugs(idx); }
    randomOffer(idx) { return this.fns.randomOffer(idx); }
    buyDrug(idx, drug, amt) { this.fns.buyDrug(idx, drug, amt); }
    sellDrug(idx, drug, amt) { this.fns.sellDrug(idx, drug, amt); }
    movePlayer(idx, loc) { this.fns.movePlayer(idx, loc); }
    handleAnswer(idx, ans) { this.fns.handleAnswer(idx, ans); }
    copsAttack(idx) { this.fns.copsAttack(idx); }
    attackPlayer(a, t) { this.fns.attackPlayer(a, t); }
    fire(idx) { this.fns.fire(idx); }
    withdrawFromCombat(idx) { this.fns.withdrawFromCombat(idx); }
    runFromCombat(idx, loc) { this.fns.runFromCombat(idx, loc); }
    spyPlayer(spy, target) { this.fns.spyPlayer(spy, target); }
    tipPlayer(tipper, target) { this.fns.tipPlayer(tipper, target); }
    sendHighScores(idx, endGame) {
        this.fns.sendHighScores(idx, endGame ? 1 : 0);
    }
    getPlayerState(idx) {
        const json = this.fns.getPlayerState(idx);
        return JSON.parse(json ?? 'null');
    }
    getMarket(idx) {
        const json = this.fns.getMarket(idx);
        return JSON.parse(json ?? 'null');
    }
    restorePlayerState(idx, cash, debt, bank, health, coatSize, location, turn) {
        this.fns.restorePlayerState(idx, cash, debt, bank, health, coatSize, location, turn);
    }
    setDrugName(i, n) { this.fns.setDrugName(i, n); }
    setDrugCheapStr(i, s) { this.fns.setDrugCheapStr(i, s); }
    setLocationName(i, n) { this.fns.setLocationName(i, n); }
    getNumDrugs() { return this.fns.getNumDrugs(); }
    getNumLocations() { return this.fns.getNumLocations(); }
}
exports.DopewarsWasmBindings = DopewarsWasmBindings;
//# sourceMappingURL=wasm.js.map