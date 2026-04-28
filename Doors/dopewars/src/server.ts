import { EventEmitter } from 'events';
import * as path from 'path';
import Database from 'better-sqlite3';
import { DopewarsWasmBindings } from './wasm';
import {
  openDb, upsertPlayer, getActivePlayers, getPlayerById,
  getPlayersAt, deactivatePlayer, insertHighScore,
  getHighScores, upsertCombat, deleteCombat,
} from './db';
import { Notifier } from './notify';
import {
  ActionResult, PlayerState, MarketState,
  PlayerSummary, HighScore, DopewarsConfig, GameEvent, GameQuestion, GameTheme,
} from './types';

const SERVER_KEY = Symbol.for('dopewars-server');

const DEFAULT_LOCATION_NAMES = [
  'Bronx', 'Ghetto', 'Central Park', 'Manhattan',
  'Coney Island', 'Brooklyn', 'Queens', 'Staten Island',
];

export class DopewarsServer extends EventEmitter {
  private wasm!: DopewarsWasmBindings;
  private db!: Database.Database;
  private notifier!: Notifier;
  private cfg!: DopewarsConfig;
  private doorDir!: string;
  private playerIndex = new Map<string, number>();
  private pendingEvents:    GameEvent[]    = [];
  private pendingQuestions: GameQuestion[] = [];
  private initialised = false;

  static getInstance(): DopewarsServer {
    const g = global as any;
    if (!g[SERVER_KEY]) {
      g[SERVER_KEY] = new DopewarsServer();
    }
    return g[SERVER_KEY];
  }

  async init(doorDir: string, cfg: DopewarsConfig): Promise<void> {
    if (this.initialised) return;
    this.initialised = true;
    this.doorDir  = doorDir;
    this.cfg      = cfg;
    this.db       = openDb(doorDir);
    this.notifier = new Notifier(cfg);
    this.wasm     = await DopewarsWasmBindings.load(doorDir);

    this.wasm.registerCallbacks(
      (_userdata: number, code: number, json: string) => {
        try {
          const parsed = JSON.parse(json);
          this.pendingEvents.push({ code, msg: parsed.msg ?? '' });
        } catch { /* ignore malformed JSON */ }
      },
      (_userdata: number, code: number, json: string) => {
        try {
          const parsed = JSON.parse(json);
          this.pendingQuestions.push({ code, prompt: parsed.prompt ?? '' });
        } catch { /* ignore */ }
      }
    );
    /* Note: pendingEvents/pendingQuestions are cleared in beginAction() before each
     * WASM call. WASM is single-threaded so calls are serialised — no true race —
     * but concurrent async JS actions could interleave. Each action method clears
     * and drains these synchronously around the WASM call, which is safe as long
     * as WASM callbacks fire synchronously (they do in Emscripten). */

    this.wasm.initGame(
      cfg.numTurns, cfg.startCash, cfg.startDebt,
      cfg.debtInterest, cfg.bankInterest
    );

    if (cfg.theme) this.applyTheme(cfg.theme);

    for (const row of getActivePlayers(this.db)) {
      const idx = this.wasm.addPlayer(0, row.bbs_handle);
      this.playerIndex.set(row.id, idx);
      this.wasm.generateDrugs(idx);  // repopulate market prices after server restart
    }
  }

  /* ─── Theme ─────────────────────────────────────────────── */

  private applyTheme(theme: GameTheme): void {
    const numDrugs     = this.wasm.getNumDrugs();
    const numLocations = this.wasm.getNumLocations();
    const drugCount    = Math.min(theme.drugNames.length, numDrugs);
    const locCount     = Math.min(theme.locationNames.length, numLocations);

    for (let i = 0; i < drugCount; i++) {
      this.wasm.setDrugName(i, theme.drugNames[i]!);
    }
    for (const [indexStr, str] of Object.entries(theme.drugCheapStrings)) {
      const i = Number(indexStr);
      if (i >= 0 && i < numDrugs && str) this.wasm.setDrugCheapStr(i, str);
    }
    for (let i = 0; i < locCount; i++) {
      this.wasm.setLocationName(i, theme.locationNames[i]!);
    }
  }

  getTitle(): string {
    return this.cfg.theme?.title ?? 'DOPEWARS';
  }

  getLocationNames(): string[] {
    return this.cfg.theme?.locationNames ?? DEFAULT_LOCATION_NAMES;
  }

  async shutdown(): Promise<void> {
    this.db?.close();
  }

  /* ─── Player management ──────────────────────────────────── */

  async joinGame(id: string, name: string): Promise<PlayerState> {
    if (this.playerIndex.has(id)) {
      return this.wasm.getPlayerState(this.playerIndex.get(id)!);
    }
    const idx = this.wasm.addPlayer(0, name);
    this.playerIndex.set(id, idx);
    const state = this.wasm.getPlayerState(idx);
    upsertPlayer(this.db, { ...state, id, bbsHandle: name });
    this.wasm.generateDrugs(idx);
    this.notifier.send({ type: 'join', handle: name });
    this.emit('presence:' + state.location, await this.getPlayersAt(state.location));
    return { ...state, id, name };
  }

  async leaveGame(id: string): Promise<void> {
    const idx = this.playerIndex.get(id);
    const row = getPlayerById(this.db, id);
    if (idx !== undefined) {
      const state = this.wasm.getPlayerState(idx);
      this.wasm.removePlayer(idx);
      this.playerIndex.delete(id);
      this.emit('presence:' + state.location, await this.getPlayersAt(state.location));
    }
    deactivatePlayer(this.db, id);
    if (row) this.notifier.send({ type: 'leave', handle: row.bbs_handle });
  }

  async getActivePlayers(): Promise<PlayerSummary[]> {
    return getActivePlayers(this.db).map((r: any) => ({
      id: r.id, name: r.bbs_handle, location: r.location,
      health: r.health, turn: r.turn,
    }));
  }

  async getPlayersAt(location: number): Promise<PlayerSummary[]> {
    return getPlayersAt(this.db, location);
  }

  async getHighScores(): Promise<HighScore[]> {
    return getHighScores(this.db);
  }

  /* ─── Action helpers ─────────────────────────────────────── */

  private getIdx(id: string): number {
    const idx = this.playerIndex.get(id);
    if (idx === undefined) throw new Error(`Player ${id} not in WASM`);
    return idx;
  }

  private beginAction(): void {
    this.pendingEvents    = [];
    this.pendingQuestions = [];
  }

  private async finishAction(id: string, ok = true, error?: string): Promise<ActionResult> {
    const idx      = this.getIdx(id);
    const newState = this.wasm.getPlayerState(idx);
    const row      = getPlayerById(this.db, id);
    upsertPlayer(this.db, { ...newState, id, bbsHandle: row?.bbs_handle ?? id });
    const events    = [...this.pendingEvents];
    const questions = [...this.pendingQuestions];
    this.emit('state:' + id, newState);
    this.emit('presence:' + newState.location, await this.getPlayersAt(newState.location));
    return { ok, error, events, questions, newState };
  }

  /* ─── Actions ────────────────────────────────────────────── */

  async buyDrug(id: string, drugIndex: number, amount: number): Promise<ActionResult> {
    this.beginAction();
    this.wasm.buyDrug(this.getIdx(id), drugIndex, amount);
    return this.finishAction(id);
  }

  async sellDrug(id: string, drugIndex: number, amount: number): Promise<ActionResult> {
    this.beginAction();
    this.wasm.sellDrug(this.getIdx(id), drugIndex, amount);
    const result = await this.finishAction(id);
    const row = getPlayerById(this.db, id);
    if (row && amount >= 10) {
      this.notifier.send({
        type: 'deal', handle: row.bbs_handle,
        drug: `Drug#${drugIndex}`, amount, price: 0, action: 'sell',
      });
    }
    return result;
  }

  async jetTo(id: string, location: number): Promise<ActionResult> {
    this.beginAction();
    this.wasm.movePlayer(this.getIdx(id), location);
    return this.finishAction(id);
  }

  async handleAnswer(id: string, answer: string): Promise<ActionResult> {
    this.beginAction();
    this.wasm.handleAnswer(this.getIdx(id), answer);
    return this.finishAction(id);
  }

  async spy(id: string, targetId: string): Promise<ActionResult> {
    this.beginAction();
    const targetIdx = this.playerIndex.get(targetId);
    if (targetIdx === undefined) {
      const state = this.wasm.getPlayerState(this.getIdx(id));
      return { ok: false, error: 'Target not in game', events: [], questions: [], newState: state };
    }
    this.wasm.spyPlayer(this.getIdx(id), targetIdx);
    return this.finishAction(id);
  }

  async sendTip(id: string, targetId: string): Promise<ActionResult> {
    this.beginAction();
    const targetIdx = this.playerIndex.get(targetId);
    if (targetIdx === undefined) {
      const state = this.wasm.getPlayerState(this.getIdx(id));
      return { ok: false, error: 'Target not in game', events: [], questions: [], newState: state };
    }
    this.wasm.tipPlayer(this.getIdx(id), targetIdx);
    return this.finishAction(id);
  }

  async fight(id: string): Promise<ActionResult> {
    this.beginAction();
    this.wasm.fire(this.getIdx(id));
    return this.finishAction(id);
  }

  async runFrom(id: string, toLocation: number): Promise<ActionResult> {
    this.beginAction();
    this.wasm.runFromCombat(this.getIdx(id), toLocation);
    return this.finishAction(id);
  }

  async surrender(id: string): Promise<ActionResult> {
    this.beginAction();
    this.wasm.withdrawFromCombat(this.getIdx(id));
    return this.finishAction(id);
  }

  async endGame(id: string): Promise<ActionResult> {
    const idx   = this.getIdx(id);
    const state = this.wasm.getPlayerState(idx);
    const row   = getPlayerById(this.db, id);
    const score = state.cash + state.bank - state.debt;
    insertHighScore(this.db, id, row?.bbs_handle ?? id, score, state.turn);
    this.wasm.sendHighScores(idx, true);
    if (row) {
      this.notifier.send({
        type: 'high_score', handle: row.bbs_handle, score, turns: state.turn,
      });
    }
    this.beginAction();
    return this.finishAction(id);
  }

  async getPlayerState(id: string): Promise<PlayerState> {
    const row = getPlayerById(this.db, id);
    const state = this.wasm.getPlayerState(this.getIdx(id));
    return { ...state, id, name: row?.bbs_handle ?? id };
  }

  async getMarket(id: string): Promise<MarketState> {
    const raw = this.wasm.getMarket(this.getIdx(id));
    // Only expose drugs available at this location (price > 0)
    return { ...raw, prices: raw.prices.filter(p => p.price > 0) };
  }
}
