import { EventEmitter } from 'events';
import { DopewarsServer } from '../server';

/* ─── Mock wasm.ts ─────────────────────────────────────── */
const mockWasm = {
  registerCallbacks: jest.fn(),
  initGame:          jest.fn(),
  addPlayer:         jest.fn().mockReturnValue(0),
  removePlayer:      jest.fn(),
  generateDrugs:     jest.fn(),
  getPlayerState:    jest.fn().mockReturnValue({
    id: 'SPOT', name: 'SPOT',
    location: 0, cash: 2000, debt: 5500, bank: 0,
    health: 100, coatSize: 100, turn: 0, totalTurns: 30,
    eventNum: 0, flags: 0, inCombat: false, drugs: [], guns: [],
  }),
  getMarket:          jest.fn().mockReturnValue({ location: 0, prices: [] }),
  buyDrug:            jest.fn(),
  sellDrug:           jest.fn(),
  movePlayer:         jest.fn(),
  handleAnswer:       jest.fn(),
  fire:               jest.fn(),
  runFromCombat:      jest.fn(),
  withdrawFromCombat: jest.fn(),
  spyPlayer:          jest.fn(),
  tipPlayer:          jest.fn(),
  sendHighScores:     jest.fn(),
  setDrugName:        jest.fn(),
  setDrugCheapStr:    jest.fn(),
  setLocationName:    jest.fn(),
  getNumDrugs:        jest.fn().mockReturnValue(12),
  getNumLocations:    jest.fn().mockReturnValue(8),
};

jest.mock('../wasm', () => ({
  DopewarsWasmBindings: { load: jest.fn() },
}));

/* ─── Mock db.ts ───────────────────────────────────────── */
jest.mock('../db', () => ({
  openDb:           jest.fn().mockReturnValue({ close: jest.fn() }),
  getActivePlayers: jest.fn().mockReturnValue([]),
  upsertPlayer:     jest.fn(),
  getPlayerById:    jest.fn().mockReturnValue({ id: 'SPOT', bbs_handle: 'SPOT' }),
  getPlayersAt:     jest.fn().mockReturnValue([]),
  deactivatePlayer: jest.fn(),
  insertHighScore:  jest.fn(),
  getHighScores:    jest.fn().mockReturnValue([]),
  upsertCombat:     jest.fn(),
  deleteCombat:     jest.fn(),
}));

/* ─── Mock notify.ts ───────────────────────────────────── */
jest.mock('../notify', () => ({
  Notifier: jest.fn().mockReturnValue({ send: jest.fn() }),
}));

const cfg = {
  numTurns: 30, startCash: 2000, startDebt: 5500,
  debtInterest: 10, bankInterest: 5, notifyLivechat: false,
};

beforeEach(() => {
  delete (global as any)[Symbol.for('dopewars-server')];
  jest.clearAllMocks();
  // Re-apply default mock return values after clearAllMocks
  mockWasm.addPlayer.mockReturnValue(0);
  mockWasm.getPlayerState.mockReturnValue({
    id: 'SPOT', name: 'SPOT',
    location: 0, cash: 2000, debt: 5500, bank: 0,
    health: 100, coatSize: 100, turn: 0, totalTurns: 30,
    eventNum: 0, flags: 0, inCombat: false, drugs: [], guns: [],
  });
  mockWasm.getMarket.mockReturnValue({ location: 0, prices: [] });
  const { getActivePlayers, getPlayerById, getPlayersAt, getHighScores } = require('../db');
  getActivePlayers.mockReturnValue([]);
  getPlayerById.mockReturnValue({ id: 'SPOT', bbs_handle: 'SPOT' });
  getPlayersAt.mockReturnValue([]);
  getHighScores.mockReturnValue([]);
  const { DopewarsWasmBindings } = require('../wasm');
  DopewarsWasmBindings.load.mockResolvedValue(mockWasm);
});

async function makeServer(): Promise<DopewarsServer> {
  const s = DopewarsServer.getInstance();
  await s.init('/tmp', cfg);
  return s;
}

describe('DopewarsServer', () => {
  it('is a singleton', async () => {
    const a = DopewarsServer.getInstance();
    const b = DopewarsServer.getInstance();
    expect(a).toBe(b);
  });

  it('initialises WASM and restores active players', async () => {
    const { getActivePlayers } = require('../db');
    getActivePlayers.mockReturnValue([{ id: 'A', bbs_handle: 'ALICE' }]);
    const s = await makeServer();
    expect(mockWasm.addPlayer).toHaveBeenCalledWith(0, 'ALICE');
  });

  it('joinGame adds player to WASM and DB', async () => {
    const { upsertPlayer } = require('../db');
    const s = await makeServer();
    await s.joinGame('SPOT', 'SPOT');
    expect(mockWasm.addPlayer).toHaveBeenCalledWith(0, 'SPOT');
    expect(upsertPlayer).toHaveBeenCalled();
  });

  it('buyDrug delegates to wasm and persists state', async () => {
    const { upsertPlayer } = require('../db');
    const s = await makeServer();
    await s.joinGame('SPOT', 'SPOT');
    const result = await s.buyDrug('SPOT', 2, 5);
    expect(mockWasm.buyDrug).toHaveBeenCalledWith(0, 2, 5);
    expect(result.ok).toBe(true);
    expect(upsertPlayer).toHaveBeenCalled();
  });

  it('emits state event after action', async () => {
    const s = await makeServer();
    await s.joinGame('SPOT', 'SPOT');
    const listener = jest.fn();
    s.on('state:SPOT', listener);
    await s.buyDrug('SPOT', 0, 1);
    expect(listener).toHaveBeenCalled();
  });

  it('leaveGame deactivates player in DB', async () => {
    const { deactivatePlayer } = require('../db');
    const s = await makeServer();
    await s.joinGame('SPOT', 'SPOT');
    await s.leaveGame('SPOT');
    expect(deactivatePlayer).toHaveBeenCalled();
  });

  it('throws if action called for unknown player', async () => {
    const s = await makeServer();
    await expect(s.buyDrug('NOBODY', 0, 1)).rejects.toThrow();
  });

  it('spy returns error when target not in game', async () => {
    const s = await makeServer();
    await s.joinGame('SPOT', 'SPOT');
    const result = await s.spy('SPOT', 'GHOST');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not in game');
  });

  it('applies theme drug and location names via WASM exports', async () => {
    const { JAMAICA_THEME } = require('../config/jamaica');
    const s = DopewarsServer.getInstance();
    await s.init('/tmp', { ...cfg, theme: JAMAICA_THEME });
    expect(mockWasm.setDrugName).toHaveBeenCalledWith(0, 'Sensimilla');
    expect(mockWasm.setDrugName).toHaveBeenCalledWith(11, 'Collie Weed');
    expect(mockWasm.setLocationName).toHaveBeenCalledWith(0, 'Trench Town');
    expect(mockWasm.setLocationName).toHaveBeenCalledWith(3, 'New Kingston');
    expect(mockWasm.setDrugCheapStr).toHaveBeenCalledWith(11, expect.stringContaining('Collie Weed'));
  });

  it('getTitle returns theme title', async () => {
    const { JAMAICA_THEME } = require('../config/jamaica');
    const s = DopewarsServer.getInstance();
    await s.init('/tmp', { ...cfg, theme: JAMAICA_THEME });
    expect(s.getTitle()).toBe('GANJA WARS');
  });

  it('getLocationNames returns theme location names', async () => {
    const { JAMAICA_THEME } = require('../config/jamaica');
    const s = DopewarsServer.getInstance();
    await s.init('/tmp', { ...cfg, theme: JAMAICA_THEME });
    expect(s.getLocationNames()[0]).toBe('Trench Town');
  });
});
