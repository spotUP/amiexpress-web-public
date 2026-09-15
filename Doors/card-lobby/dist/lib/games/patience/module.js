"use strict";
/**
 * PATIENCE at a lobby table.
 *
 * One seat, no bots, no stake - a solitaire is the caller against the pack.
 * The lobby's seat-filling already does the right thing with a one-seat
 * table (it fills `maxPlayers - humans` bots, which is none), so nothing had
 * to be special-cased for it.
 *
 * Every game this module serves comes from a `.game` file under `games/`, so
 * ANOTHER SOLITAIRE IS A TEXT FILE: drop one in, add its catalogue entry, and
 * the door deals it. The module's `ids` are read from that directory at
 * startup rather than listed here, which is what keeps that promise honest.
 *
 * KEYS. A move is two picks: the pile you take from, then the pile it goes
 * to. Numbers name the piles in the order the board prints them, `C` turns
 * the stock, and `X` sends the picked card to a foundation if it will go -
 * the move a player makes a hundred times a game.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PatienceGameModule = exports.PATIENCE_PREFIX = void 0;
exports.findGamesDirectory = findGamesDirectory;
exports.loadGameDefinitions = loadGameDefinitions;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const parser_1 = require("./parser");
const engine_1 = require("./engine");
/** `patience-klondike` and the rest; the prefix keeps them together in the lobby. */
exports.PATIENCE_PREFIX = 'patience-';
/**
 * Where the `.game` files live.
 *
 * The door runs from `dist/`, so this walks up until it finds the directory
 * rather than counting `..`s - the count differs between the source tree and
 * the built one, and getting it wrong means a lobby that offers games it
 * cannot deal.
 */
function findGamesDirectory(start = __dirname) {
    let at = start;
    for (let depth = 0; depth < 8; depth += 1) {
        const candidate = path.join(at, 'games');
        try {
            if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
                if (fs.readdirSync(candidate).some((name) => name.endsWith('.game')))
                    return candidate;
            }
        }
        catch { /* keep walking */ }
        const parent = path.dirname(at);
        if (parent === at)
            break;
        at = parent;
    }
    return null;
}
/** Every definition the door can deal, by catalogue id. */
function loadGameDefinitions(directory = findGamesDirectory()) {
    const games = new Map();
    if (!directory)
        return games;
    for (const file of fs.readdirSync(directory).sort()) {
        if (!file.endsWith('.game'))
            continue;
        try {
            const definition = (0, parser_1.parseGameDefinition)(fs.readFileSync(path.join(directory, file), 'utf8'));
            games.set(`${exports.PATIENCE_PREFIX}${definition.name}`, definition);
        }
        catch (error) {
            // A broken file must not take the door down with it - the others are
            // still playable, and the reason is worth printing once.
            console.warn(`[card-lobby] ${file} could not be read: ${error instanceof Error ? error.message : error}`);
        }
    }
    return games;
}
class PatienceGameModule {
    constructor(host, games = loadGameDefinitions()) {
        this.host = host;
        this.usesPokerEngine = false;
        this.hintKind = 'patience';
        /** The pile a move is taking FROM, once the caller has picked one. */
        this.selectedPileId = null;
        this.games = games;
        this.ids = [...games.keys()];
    }
    definitionFor(table) {
        return this.games.get(table.gameId);
    }
    // ------------------------------------------------------------------
    // State
    // ------------------------------------------------------------------
    load(table) {
        const definition = this.definitionFor(table);
        if (!definition || !table.hand)
            return null;
        try {
            return engine_1.PatienceEngine.deserialize(definition, table.hand.snapshot);
        }
        catch (error) {
            this.host.pushNotice(`Failed to restore the game: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return null;
        }
    }
    save(table, engine, startedAt) {
        table.hand = {
            snapshot: engine.serialize(),
            beforeStacks: {},
            startedAt: startedAt ?? table.hand?.startedAt ?? Date.now(),
            updatedAt: Date.now(),
        };
        table.updatedAt = Date.now();
    }
    currentTable() {
        const tableId = this.host.currentProfile?.currentTableId;
        return tableId ? this.host.findTableById(tableId) ?? null : null;
    }
    /** The piles as the board prints them, which is what a number key names. */
    boardOrder(engine) {
        const order = { tableau: 0, waste: 1, cell: 2, foundation: 3, stock: 4 };
        return [...engine.state.piles].sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9) || a.index - b.index);
    }
    // ------------------------------------------------------------------
    // Playing
    // ------------------------------------------------------------------
    async start(table) {
        const definition = this.definitionFor(table);
        if (!definition) {
            this.host.pushNotice(`${table.gameName} has no definition file.`);
            return;
        }
        await this.host.reloadState();
        const fresh = this.host.findTableById(table.id);
        if (!fresh)
            return;
        if (fresh.hand) {
            this.host.pushNotice('A game is already dealt. L leaves it.');
            return;
        }
        const engine = new engine_1.PatienceEngine(definition);
        this.selectedPileId = null;
        this.save(fresh, engine, Date.now());
        this.host.updateTableStatus(fresh);
        this.host.pushEvent(`${definition.title} dealt at table #${fresh.id}.`);
        await this.host.persistState();
        this.host.updateAllPanels();
    }
    /**
     * A number key names a pile in board order. The first pick is the pile a
     * card leaves; the second is where it goes.
     */
    selectCard(index) {
        const table = this.currentTable();
        if (!table)
            return;
        const engine = this.load(table);
        if (!engine)
            return;
        const piles = this.boardOrder(engine);
        const pile = piles[index];
        if (!pile)
            return;
        if (this.selectedPileId === null) {
            if (pile.cards.length === 0) {
                this.host.pushNotice('That pile is empty.');
                return;
            }
            this.selectedPileId = pile.id;
            const top = pile.cards[pile.cards.length - 1];
            this.host.pushNotice(`${top.faceUp ? (0, engine_1.cardId)(top) : 'A face-down card'} picked. Now the pile it goes to.`);
            this.host.updateAllPanels();
            return;
        }
        if (this.selectedPileId === pile.id) {
            this.selectedPileId = null;
            this.host.pushNotice('Pick cancelled.');
            this.host.updateAllPanels();
            return;
        }
        this.moveTo(table, engine, pile.id);
    }
    /**
     * Move as many cards as the rules allow - the longest run that will go,
     * which is what a player means by dragging a column.
     */
    moveTo(table, engine, toId) {
        const fromId = this.selectedPileId;
        if (!fromId)
            return;
        const most = engine.maxLift(fromId, toId);
        let moved = false;
        for (let count = most; count >= 1; count -= 1) {
            if (engine.canMove(fromId, toId, count)) {
                const result = engine.move(fromId, toId, count);
                this.host.pushEvent(result.message);
                moved = true;
                break;
            }
        }
        if (!moved) {
            this.host.pushNotice('That card cannot go there.');
            return;
        }
        this.selectedPileId = null;
        this.finish(table, engine);
    }
    finish(table, engine) {
        this.save(table, engine);
        if (engine.state.won) {
            this.host.pushEvent(`${engine.state.title} is out in ${engine.state.moves} moves!`);
            this.host.pushNotice('Out! Press D to deal another.');
            table.lastHand = {
                board: [], hands: {}, pot: 0,
                winners: [{
                        userId: this.host.currentProfile?.userId ?? '',
                        username: this.host.currentProfile?.username ?? 'you',
                        amount: 0,
                    }],
                playedAt: Date.now(),
            };
            this.host.clearTableHand(table);
            this.host.updateTableStatus(table);
        }
        void this.host.persistState();
        this.host.updateAllPanels();
    }
    /** X: send the picked pile's top card home, if a foundation will take it. */
    primaryAction() {
        const table = this.currentTable();
        if (!table)
            return;
        this.host.runAction(async () => {
            await this.host.reloadState();
            const fresh = this.host.findTableById(table.id);
            if (!fresh)
                return;
            const engine = this.load(fresh);
            if (!engine) {
                this.host.pushNotice('No game dealt. Press D to deal.');
                return;
            }
            const sources = this.selectedPileId
                ? [this.selectedPileId]
                : this.boardOrder(engine).filter((pile) => pile.type !== 'foundation').map((pile) => pile.id);
            for (const fromId of sources) {
                const foundation = engine.state.piles
                    .find((pile) => pile.type === 'foundation' && engine.canMove(fromId, pile.id, 1));
                if (!foundation)
                    continue;
                engine.move(fromId, foundation.id, 1);
                this.selectedPileId = null;
                this.host.pushEvent(`Home to ${foundation.id}.`);
                this.finish(fresh, engine);
                return;
            }
            this.host.pushNotice('Nothing will go home yet.');
        });
    }
    /** C: turn the stock, or take the waste back under it. */
    secondaryAction() {
        const table = this.currentTable();
        if (!table)
            return;
        this.host.runAction(async () => {
            await this.host.reloadState();
            const fresh = this.host.findTableById(table.id);
            if (!fresh)
                return;
            const engine = this.load(fresh);
            if (!engine)
                return;
            const result = engine.turnStock();
            if (!result.success) {
                this.host.pushNotice(result.message);
                return;
            }
            this.selectedPileId = null;
            this.host.pushEvent(result.message);
            this.finish(fresh, engine);
        });
    }
    tertiaryAction() {
        this.selectedPileId = null;
        this.host.pushNotice('Pick cancelled.');
        this.host.updateAllPanels();
    }
    /** Left and right step the pick along the board. */
    moveSelection(delta) {
        const table = this.currentTable();
        if (!table)
            return;
        const engine = this.load(table);
        if (!engine)
            return;
        const piles = this.boardOrder(engine);
        const at = piles.findIndex((pile) => pile.id === this.selectedPileId);
        const next = at < 0
            ? (delta >= 0 ? 0 : piles.length - 1)
            : ((at + delta) % piles.length + piles.length) % piles.length;
        this.selectedPileId = piles[next]?.id ?? null;
        this.host.updateAllPanels();
    }
    render(painter, table) {
        painter.renderPatienceGameView(table);
    }
    /** A solitaire has no players and no hand: it has piles and columns. */
    panelTitles(table) {
        return {
            board: 'Foundations and stock',
            players: this.definitionFor(table)?.title ?? 'Patience',
            hand: 'Columns',
        };
    }
    updateActionButtons(table) {
        const engine = this.load(table);
        const stock = engine?.pileOfType('stock');
        this.host.labelPatienceButtons(Boolean(engine), Boolean(stock));
    }
    /** The keys, for the panel that keeps them (lib/games/types.ts). */
    activityLines(table) {
        const engine = this.load(table);
        if (!engine)
            return ['{cyan-fg}D{/} deals'];
        const piles = this.boardOrder(engine);
        const picked = piles.findIndex((pile) => pile.id === this.selectedPileId);
        const lines = [
            picked >= 0
                ? `{cyan-fg}From ${picked + 1}{/} - now the number of the pile it goes to`
                : '{cyan-fg}1-9{/} pick a pile  {cyan-fg}X{/} send home  {cyan-fg}C{/} turn stock',
        ];
        if (picked >= 0) {
            const destinations = engine.destinationsFor(this.selectedPileId, engine.maxLift(this.selectedPileId));
            const numbered = destinations
                .map((id) => piles.findIndex((pile) => pile.id === id) + 1)
                .filter((n) => n > 0)
                .sort((a, b) => a - b);
            lines.push(numbered.length > 0
                ? `Will take it: ${numbered.map((n) => `{green-fg}${n}{/}`).join(' ')}`
                : '{yellow-fg}Nothing will take it{/} - R cancels');
        }
        lines.push(`Moves ${engine.state.moves}`);
        return lines;
    }
}
exports.PatienceGameModule = PatienceGameModule;
