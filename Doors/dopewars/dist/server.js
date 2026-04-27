"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DopewarsServer = void 0;
const events_1 = require("events");
const wasm_1 = require("./wasm");
const db_1 = require("./db");
const notify_1 = require("./notify");
const SERVER_KEY = Symbol.for('dopewars-server');
class DopewarsServer extends events_1.EventEmitter {
    constructor() {
        super(...arguments);
        this.playerIndex = new Map();
        this.pendingEvents = [];
        this.pendingQuestions = [];
        this.initialised = false;
    }
    static getInstance() {
        const g = global;
        if (!g[SERVER_KEY]) {
            g[SERVER_KEY] = new DopewarsServer();
        }
        return g[SERVER_KEY];
    }
    async init(doorDir, cfg) {
        if (this.initialised)
            return;
        this.initialised = true;
        this.doorDir = doorDir;
        this.cfg = cfg;
        this.db = (0, db_1.openDb)(doorDir);
        this.notifier = new notify_1.Notifier(cfg);
        this.wasm = await wasm_1.DopewarsWasmBindings.load(doorDir);
        this.wasm.registerCallbacks((_userdata, code, json) => {
            try {
                const parsed = JSON.parse(json);
                this.pendingEvents.push({ code, msg: parsed.msg ?? '' });
            }
            catch { /* ignore malformed JSON */ }
        }, (_userdata, code, json) => {
            try {
                const parsed = JSON.parse(json);
                this.pendingQuestions.push({ code, prompt: parsed.prompt ?? '' });
            }
            catch { /* ignore */ }
        });
        /* Note: pendingEvents/pendingQuestions are cleared in beginAction() before each
         * WASM call. WASM is single-threaded so calls are serialised — no true race —
         * but concurrent async JS actions could interleave. Each action method clears
         * and drains these synchronously around the WASM call, which is safe as long
         * as WASM callbacks fire synchronously (they do in Emscripten). */
        this.wasm.initGame(cfg.numTurns, cfg.startCash, cfg.startDebt, cfg.debtInterest, cfg.bankInterest);
        for (const row of (0, db_1.getActivePlayers)(this.db)) {
            const idx = this.wasm.addPlayer(0, row.bbs_handle);
            this.playerIndex.set(row.id, idx);
            this.wasm.generateDrugs(idx); // repopulate market prices after server restart
        }
    }
    async shutdown() {
        this.db?.close();
    }
    /* ─── Player management ──────────────────────────────────── */
    async joinGame(id, name) {
        if (this.playerIndex.has(id)) {
            return this.wasm.getPlayerState(this.playerIndex.get(id));
        }
        const idx = this.wasm.addPlayer(0, name);
        this.playerIndex.set(id, idx);
        const state = this.wasm.getPlayerState(idx);
        (0, db_1.upsertPlayer)(this.db, { ...state, id, bbsHandle: name });
        this.wasm.generateDrugs(idx);
        this.notifier.send({ type: 'join', handle: name });
        this.emit('presence:' + state.location, await this.getPlayersAt(state.location));
        return { ...state, id, name };
    }
    async leaveGame(id) {
        const idx = this.playerIndex.get(id);
        const row = (0, db_1.getPlayerById)(this.db, id);
        if (idx !== undefined) {
            const state = this.wasm.getPlayerState(idx);
            this.wasm.removePlayer(idx);
            this.playerIndex.delete(id);
            this.emit('presence:' + state.location, await this.getPlayersAt(state.location));
        }
        (0, db_1.deactivatePlayer)(this.db, id);
        if (row)
            this.notifier.send({ type: 'leave', handle: row.bbs_handle });
    }
    async getActivePlayers() {
        return (0, db_1.getActivePlayers)(this.db).map((r) => ({
            id: r.id, name: r.bbs_handle, location: r.location,
            health: r.health, turn: r.turn,
        }));
    }
    async getPlayersAt(location) {
        return (0, db_1.getPlayersAt)(this.db, location);
    }
    async getHighScores() {
        return (0, db_1.getHighScores)(this.db);
    }
    /* ─── Action helpers ─────────────────────────────────────── */
    getIdx(id) {
        const idx = this.playerIndex.get(id);
        if (idx === undefined)
            throw new Error(`Player ${id} not in WASM`);
        return idx;
    }
    beginAction() {
        this.pendingEvents = [];
        this.pendingQuestions = [];
    }
    async finishAction(id, ok = true, error) {
        const idx = this.getIdx(id);
        const newState = this.wasm.getPlayerState(idx);
        const row = (0, db_1.getPlayerById)(this.db, id);
        (0, db_1.upsertPlayer)(this.db, { ...newState, id, bbsHandle: row?.bbs_handle ?? id });
        const events = [...this.pendingEvents];
        const questions = [...this.pendingQuestions];
        this.emit('state:' + id, newState);
        this.emit('presence:' + newState.location, await this.getPlayersAt(newState.location));
        return { ok, error, events, questions, newState };
    }
    /* ─── Actions ────────────────────────────────────────────── */
    async buyDrug(id, drugIndex, amount) {
        this.beginAction();
        this.wasm.buyDrug(this.getIdx(id), drugIndex, amount);
        return this.finishAction(id);
    }
    async sellDrug(id, drugIndex, amount) {
        this.beginAction();
        this.wasm.sellDrug(this.getIdx(id), drugIndex, amount);
        const result = await this.finishAction(id);
        const row = (0, db_1.getPlayerById)(this.db, id);
        if (row && amount >= 10) {
            this.notifier.send({
                type: 'deal', handle: row.bbs_handle,
                drug: `Drug#${drugIndex}`, amount, price: 0, action: 'sell',
            });
        }
        return result;
    }
    async jetTo(id, location) {
        this.beginAction();
        this.wasm.movePlayer(this.getIdx(id), location);
        return this.finishAction(id);
    }
    async handleAnswer(id, answer) {
        this.beginAction();
        this.wasm.handleAnswer(this.getIdx(id), answer);
        return this.finishAction(id);
    }
    async spy(id, targetId) {
        this.beginAction();
        const targetIdx = this.playerIndex.get(targetId);
        if (targetIdx === undefined) {
            const state = this.wasm.getPlayerState(this.getIdx(id));
            return { ok: false, error: 'Target not in game', events: [], questions: [], newState: state };
        }
        this.wasm.spyPlayer(this.getIdx(id), targetIdx);
        return this.finishAction(id);
    }
    async sendTip(id, targetId) {
        this.beginAction();
        const targetIdx = this.playerIndex.get(targetId);
        if (targetIdx === undefined) {
            const state = this.wasm.getPlayerState(this.getIdx(id));
            return { ok: false, error: 'Target not in game', events: [], questions: [], newState: state };
        }
        this.wasm.tipPlayer(this.getIdx(id), targetIdx);
        return this.finishAction(id);
    }
    async fight(id) {
        this.beginAction();
        this.wasm.fire(this.getIdx(id));
        return this.finishAction(id);
    }
    async runFrom(id, toLocation) {
        this.beginAction();
        this.wasm.runFromCombat(this.getIdx(id), toLocation);
        return this.finishAction(id);
    }
    async surrender(id) {
        this.beginAction();
        this.wasm.withdrawFromCombat(this.getIdx(id));
        return this.finishAction(id);
    }
    async endGame(id) {
        const idx = this.getIdx(id);
        const state = this.wasm.getPlayerState(idx);
        const row = (0, db_1.getPlayerById)(this.db, id);
        const score = state.cash + state.bank - state.debt;
        (0, db_1.insertHighScore)(this.db, id, row?.bbs_handle ?? id, score, state.turn);
        this.wasm.sendHighScores(idx, true);
        if (row) {
            this.notifier.send({
                type: 'high_score', handle: row.bbs_handle, score, turns: state.turn,
            });
        }
        this.beginAction();
        return this.finishAction(id);
    }
    async getPlayerState(id) {
        const row = (0, db_1.getPlayerById)(this.db, id);
        const state = this.wasm.getPlayerState(this.getIdx(id));
        return { ...state, id, name: row?.bbs_handle ?? id };
    }
    async getMarket(id) {
        return this.wasm.getMarket(this.getIdx(id));
    }
}
exports.DopewarsServer = DopewarsServer;
//# sourceMappingURL=server.js.map