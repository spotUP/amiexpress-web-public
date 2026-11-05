"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activePlayerId = exports.WormsApp = void 0;
/**
 * WORMS - the caller's end of it.
 *
 * Views, keys, and which side of a two-caller match this is. The physics
 * are in physics.ts, the turn order in game.ts, and the drawing in
 * render.ts; what is decided here is only what happens when somebody
 * presses a key.
 *
 * In a two-caller match the HOST owns the match object and nobody else
 * does. The guest sends what it wants to do and draws the picture it is
 * sent back. That is a deliberate choice over running the simulation on
 * both sides: two copies of a physics loop agreeing forever is a promise
 * no turn-based game needs to make.
 */
const screen_1 = require("@amiexpress/bbs-door-sdk/teletext/screen");
const game_1 = require("./game");
Object.defineProperty(exports, "activePlayerId", { enumerable: true, get: function () { return game_1.activePlayerId; } });
const render_1 = require("./render");
const net_1 = require("./net");
const settings_1 = require("./settings");
class WormsApp {
    /**
     * @param seed Fixes the landscape and the wind rolls. A match is worth
     *   being able to replay, and a test that fires two hundred shots at a
     *   randomly generated landscape is a test that fails on the days the
     *   landscape happens to be kind.
     */
    constructor(session, net, seed) {
        this.view = 'menu';
        this.role = 'hotseat';
        this.match = null;
        /** What a guest was last sent. A guest never owns a match. */
        this.mirror = null;
        this.message = '';
        this.menuAt = 0;
        this.lobbies = [];
        this.closed = false;
        this.session = session;
        this.seed = seed;
        this.settings = (0, settings_1.loadSettings)();
        const teletextMode = Boolean(session.bbsSession?.texttvMode);
        this.screen = new screen_1.TeletextScreen({
            write: data => session.socket.emit('ansi-output', data),
            rows: Number(session.bbsSession?.screenHeight),
            mode: teletextMode ? 'teletext' : 'ansi',
        });
        this.keys = new screen_1.KeyStream({
            key: ch => this.handleKey(ch),
            escape: () => this.onEscape(),
            arrow: direction => this.onArrow(direction),
        });
        this.net =
            net !== undefined
                ? net
                : this.settings.allowNetwork
                    ? safely(() => new net_1.WormsNet({ user: session.user, bbsSession: session.bbsSession }))
                    : null;
    }
    // --- Lifecycle --------------------------------------------------------
    start() {
        this.screen.begin();
        this.paintMenu();
    }
    stop() {
        this.closed = true;
        this.keys.dispose();
        this.net?.dispose();
        this.screen.end();
    }
    handleInput(data) {
        if (!this.closed)
            this.keys.feed(data);
    }
    // --- Menu -------------------------------------------------------------
    menuItems() {
        const items = ['Hotseat - two teams, one keyboard'];
        if (this.net) {
            items.push('Host a match for another caller');
            items.push('Join a match');
        }
        items.push('Leave');
        return items;
    }
    paintMenu() {
        this.view = 'menu';
        const items = this.menuItems();
        const lines = ['', ...items.map((item, at) => `${at === this.menuAt ? '>' : ' '} ${item}`)];
        if (this.message)
            lines.push('', this.message);
        lines.push('', 'Two teams take turns. Set an angle and', 'a power and fire. The wind pushes the', 'shell. Last team standing wins.');
        this.screen.paint((0, render_1.messagePage)('WORMS', lines, 'yellow'));
        this.screen.status('Arrows choose  ENTER picks  Q=Quit');
    }
    chooseMenu() {
        const item = this.menuItems()[this.menuAt] ?? '';
        if (item.startsWith('Hotseat'))
            return this.startHotseat();
        if (item.startsWith('Host'))
            return void this.startHost();
        if (item.startsWith('Join'))
            return void this.showLobbies();
        this.quit();
    }
    // --- Starting a match -------------------------------------------------
    startHotseat() {
        this.role = 'hotseat';
        this.match = (0, game_1.newMatch)({
            seed: this.seed,
            wormsPerTeam: this.settings.wormsPerTeam,
            hp: this.settings.startingHealth,
            teams: ['RED', 'BLUE'],
        });
        this.message = '';
        this.paintMatch();
    }
    async startHost() {
        if (!this.net)
            return;
        this.role = 'host';
        try {
            await this.net.host();
        }
        catch (error) {
            this.message = `could not host: ${error.message}`;
            return this.paintMenu();
        }
        this.net.on(net_1.INPUT_EVENT, payload => this.onGuestInput(payload));
        // The hello is what actually starts the match. Lobby membership events
        // are a secondary trigger: they are the broker's business and their
        // timing is not this door's to rely on, whereas a guest that has said
        // hello is definitely listening.
        this.net.on(net_1.HELLO_EVENT, () => this.onOpponentReady());
        this.net.onLobbyChange(() => this.onOpponentReady());
        this.view = 'lobby';
        this.screen.paint((0, render_1.messagePage)('WAITING', [
            'Your match is open.',
            '',
            'Another caller can pick "Join a match"',
            'from this door and take the other side.',
            '',
            'Q leaves and closes it.',
        ], 'cyan'));
        this.screen.status('Waiting for an opponent  Q=Quit');
    }
    onOpponentReady() {
        if (this.role !== 'host' || !this.net)
            return;
        // A second hello for a match already under way is a guest that missed
        // the first packet - answer it with the state rather than a new match.
        if (this.match) {
            this.broadcast();
            return;
        }
        this.match = (0, game_1.newMatch)({
            seed: this.seed,
            wormsPerTeam: this.settings.wormsPerTeam,
            hp: this.settings.startingHealth,
            teams: ['RED', 'BLUE'],
            playerIds: [this.net.playerId, null],
        });
        this.message = 'opponent joined';
        this.paintMatch();
        this.broadcast();
    }
    async showLobbies() {
        if (!this.net)
            return;
        this.lobbies = await safelyAsync(() => this.net.open(), []);
        if (this.lobbies.length === 0) {
            this.message = 'no matches are open right now';
            return this.paintMenu();
        }
        await this.joinMatch(this.lobbies[0]);
    }
    async joinMatch(summary) {
        if (!this.net)
            return;
        this.role = 'guest';
        this.net.on(net_1.STATE_EVENT, payload => this.onHostState(payload));
        try {
            await this.net.join(summary.id);
        }
        catch (error) {
            this.message = `could not join: ${error.message}`;
            return this.paintMenu();
        }
        // The listener went on before the join, because in-process the host can
        // answer inside the same tick and a listener registered afterwards
        // would miss the only state packet it was ever going to be sent.
        this.net.send(net_1.HELLO_EVENT, { from: this.net.playerId });
        this.view = 'lobby';
        this.screen.paint((0, render_1.messagePage)('JOINED', ['Waiting for the host to start.'], 'cyan'));
        this.screen.status('Q=Quit');
    }
    // --- Network --------------------------------------------------------
    broadcast() {
        if (this.role !== 'host' || !this.net || !this.match)
            return;
        const packet = {
            view: this.view,
            match: (0, game_1.toView)(this.match),
            message: this.message,
        };
        this.net.send(net_1.STATE_EVENT, packet);
    }
    onGuestInput(packet) {
        if (this.role !== 'host' || !this.match || this.match.over)
            return;
        // The guest plays team two and only on its own turn. A packet arriving
        // out of turn is ignored rather than argued with.
        if (this.match.turn !== 1)
            return;
        if (packet.angle !== undefined || packet.power !== undefined || packet.facing !== undefined) {
            this.match.aim = {
                angle: packet.angle ?? this.match.aim.angle,
                power: packet.power ?? this.match.aim.power,
                facing: packet.facing ?? this.match.aim.facing,
            };
            this.paintMatch();
            this.broadcast();
            return;
        }
        if (packet.fire)
            this.fire();
    }
    onHostState(packet) {
        if (this.role !== 'guest' || !packet?.match)
            return;
        this.mirror = packet;
        this.message = packet.message ?? '';
        this.view = packet.view === 'lobby' ? 'aim' : packet.view;
        this.paintMirror();
    }
    sendAim() {
        if (this.role !== 'guest' || !this.net || !this.mirror)
            return;
        this.net.send(net_1.INPUT_EVENT, {
            from: this.net.playerId,
            angle: this.mirror.match.aim.angle,
            power: this.mirror.match.aim.power,
            facing: this.mirror.match.aim.facing,
        });
    }
    // --- Playing ----------------------------------------------------------
    myTurn() {
        if (this.role === 'hotseat')
            return true;
        if (this.role === 'host')
            return this.match ? this.match.turn === 0 : false;
        return this.mirror ? this.mirror.match.turn === 1 : false;
    }
    onArrow(direction) {
        if (this.view === 'menu') {
            const items = this.menuItems();
            if (direction === 'up')
                this.menuAt = (this.menuAt + items.length - 1) % items.length;
            if (direction === 'down')
                this.menuAt = (this.menuAt + 1) % items.length;
            this.paintMenu();
            return;
        }
        if (this.view !== 'aim' || !this.myTurn())
            return;
        const change = direction === 'up'
            ? { angle: 2 }
            : direction === 'down'
                ? { angle: -2 }
                : { facing: (direction === 'right' ? 1 : -1) };
        this.changeAim(change);
    }
    handleKey(ch) {
        if (ch === 'q' || ch === 'Q')
            return this.quit();
        switch (this.view) {
            case 'menu':
                if (ch === '\r' || ch === '\n' || ch === ' ')
                    this.chooseMenu();
                return;
            case 'aim':
                if (!this.myTurn())
                    return;
                if (ch === '+' || ch === '.')
                    return this.changeAim({ power: 1 });
                if (ch === '-' || ch === ',')
                    return this.changeAim({ power: -1 });
                if (ch === ' ' || ch === '\r' || ch === '\n')
                    return this.requestFire();
                return;
            case 'shot':
                if (ch === ' ' || ch === '\r' || ch === '\n') {
                    this.message = '';
                    this.view = 'aim';
                    this.role === 'guest' ? this.paintMirror() : this.paintMatch();
                    this.broadcast();
                }
                return;
            case 'over':
                if (ch === ' ' || ch === '\r' || ch === '\n') {
                    if (this.role === 'hotseat')
                        return this.startHotseat();
                    this.paintMenu();
                }
                return;
            default:
                return;
        }
    }
    changeAim(change) {
        if (this.role === 'guest') {
            if (!this.mirror)
                return;
            const aim = this.mirror.match.aim;
            aim.angle = clamp(aim.angle + (change.angle ?? 0), 0, 90);
            aim.power = clamp(aim.power + (change.power ?? 0), 1, 10);
            if (change.facing)
                aim.facing = change.facing;
            this.paintMirror();
            this.sendAim();
            return;
        }
        if (!this.match)
            return;
        (0, game_1.adjustAim)(this.match, change);
        this.paintMatch();
        this.broadcast();
    }
    requestFire() {
        if (this.role === 'guest') {
            if (this.net && this.mirror)
                this.net.send(net_1.INPUT_EVENT, { from: this.net.playerId, fire: true });
            return;
        }
        this.fire();
    }
    fire() {
        if (!this.match)
            return;
        const shooter = (0, game_1.activeWorm)(this.match);
        const outcome = (0, game_1.takeTurn)(this.match);
        if (!outcome || !shooter)
            return;
        this.message = describe(outcome, this.match);
        this.view = this.match.over ? 'over' : 'shot';
        if (this.match.over) {
            const winner = this.match.winner === null ? null : this.match.teams[this.match.winner].name;
            this.session.achievement?.('teletext_worms_match', { value: this.match.turnsTaken });
            this.screen.paint((0, render_1.resultPage)(winner, [
                `${this.match.turnsTaken} turns.`,
                '',
                ...this.match.teams.map((team, at) => `${team.name.padEnd(6)} ${(0, game_1.teamWorms)(this.match, at).length} left, ${(0, game_1.teamHp)(this.match, at)} health`),
            ]));
            this.screen.status(winner ? `${winner} wins  SPACE=Again  Q=Quit` : 'A draw  SPACE=Again  Q=Quit');
        }
        else {
            this.paintMatch({ arc: outcome.shot.path, impact: outcome.shot.impact });
            this.screen.status(`${this.message}  SPACE=Next  Q=Quit`);
        }
        this.broadcast();
    }
    // --- Painting ---------------------------------------------------------
    paintMatch(overlay = {}) {
        const match = this.match;
        if (!match)
            return;
        if (this.view === 'menu' || this.view === 'lobby')
            this.view = 'aim';
        const field = {
            terrain: match.terrain,
            worms: match.worms,
            arc: overlay.arc ?? null,
            impact: overlay.impact ?? null,
        };
        this.screen.paint((0, render_1.matchPage)(field, this.hudFor(match.teams.map(t => t.name), match.worms, match.turn, match.wind, match.aim)));
        if (this.view === 'aim')
            this.screen.status(this.aimBar(match.turn, match.teams[match.turn].name));
    }
    paintMirror() {
        const mirror = this.mirror;
        if (!mirror)
            return;
        const { terrain, worms } = (0, game_1.fromView)(mirror.match);
        const field = {
            terrain,
            worms,
            arc: mirror.view === 'shot' ? mirror.match.lastPath : null,
            impact: mirror.view === 'shot' ? mirror.match.lastImpact : null,
        };
        this.screen.paint((0, render_1.matchPage)(field, this.hudFor(mirror.match.teams.map(t => t.name), worms, mirror.match.turn, mirror.match.wind, mirror.match.aim)));
        if (mirror.view === 'over') {
            const winner = mirror.match.winner === null ? null : mirror.match.teams[mirror.match.winner].name;
            this.screen.paint((0, render_1.resultPage)(winner, [`${mirror.match.turnsTaken} turns.`]));
            this.screen.status(winner ? `${winner} wins  Q=Quit` : 'A draw  Q=Quit');
            return;
        }
        this.screen.status(mirror.view === 'shot'
            ? `${this.message}  SPACE=Next  Q=Quit`
            : this.aimBar(mirror.match.turn, mirror.match.teams[mirror.match.turn].name));
    }
    hudFor(names, worms, turn, wind, aim) {
        return {
            teams: names.map((name, at) => ({
                name,
                hp: worms.filter(w => w.team === at && w.hp > 0).reduce((total, w) => total + w.hp, 0),
                worms: worms.filter(w => w.team === at && w.hp > 0).length,
            })),
            turn,
            wind,
            angle: aim.angle,
            power: aim.power,
            facing: aim.facing,
            message: this.message || undefined,
        };
    }
    aimBar(turn, name) {
        if (!this.myTurn())
            return `${name} is aiming  Q=Quit`;
        return `${name}  arrows aim  +/- power  SPACE fires`;
    }
    onEscape() {
        if (this.view === 'menu')
            return this.quit();
        this.message = '';
        this.match = null;
        this.mirror = null;
        this.role = 'hotseat';
        this.paintMenu();
    }
    quit() {
        this.stop();
        this.session.close();
    }
}
exports.WormsApp = WormsApp;
function describe(outcome, match) {
    if (!outcome)
        return '';
    if (outcome.shot.ending === 'offfield')
        return 'out of the field';
    const hurt = [...outcome.blast, ...outcome.falls].reduce((total, d) => total + d.amount, 0);
    if (outcome.killed.length > 0) {
        const names = outcome.killed.map(id => match.teams[Number(id.split('-')[0])]?.name ?? '?');
        return `${outcome.killed.length} down (${names.join(' ')})`;
    }
    if (hurt > 0)
        return `${hurt} damage`;
    return outcome.shot.ending === 'worm' ? 'a glancing hit' : 'missed';
}
function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
}
function safely(make) {
    try {
        return make();
    }
    catch (error) {
        console.error('[TeletextWorms] network unavailable:', error.message);
        return null;
    }
}
async function safelyAsync(run, fallback) {
    try {
        return await run();
    }
    catch (error) {
        console.error('[TeletextWorms]', error.message);
        return fallback;
    }
}
//# sourceMappingURL=app.js.map