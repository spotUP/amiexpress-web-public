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
import { TeletextScreen, KeyStream, type ArrowKey } from '@amiexpress/bbs-door-sdk/teletext/screen';

import {
  newMatch,
  takeTurn,
  adjustAim,
  activeWorm,
  activePlayerId,
  teamWorms,
  teamHp,
  toView,
  fromView,
  type Match,
  type MatchView,
} from './game';
import { matchPage, resultPage, messagePage, type FieldView, type HudView } from './render';
import { WormsNet, STATE_EVENT, INPUT_EVENT, HELLO_EVENT, type LobbySummary } from './net';
import { loadSettings, type WormsSettings } from './settings';
import type { Point, Worm } from './physics';

export interface DoorSession {
  socket: { emit(event: string, data: string): void };
  bbsSession: Record<string, unknown>;
  user?: { id?: number | string; username?: string };
  close(): void;
  achievement?(type: string, opts?: { value?: number; key?: string }): boolean;
}

type View = 'menu' | 'lobby' | 'aim' | 'shot' | 'over';
type Role = 'hotseat' | 'host' | 'guest';

interface StatePacket {
  view: View;
  match: MatchView;
  message: string;
}

interface InputPacket {
  from: string;
  angle?: number;
  power?: number;
  facing?: -1 | 1;
  fire?: boolean;
}

export class WormsApp {
  private readonly session: DoorSession;
  private readonly settings: WormsSettings;
  private readonly screen: TeletextScreen;
  private readonly keys: KeyStream;
  private readonly net: WormsNet | null;
  private readonly seed: number | undefined;

  private view: View = 'menu';
  private role: Role = 'hotseat';
  private match: Match | null = null;
  /** What a guest was last sent. A guest never owns a match. */
  private mirror: StatePacket | null = null;
  private message = '';
  private menuAt = 0;
  private lobbies: LobbySummary[] = [];
  private closed = false;

  /**
   * @param seed Fixes the landscape and the wind rolls. A match is worth
   *   being able to replay, and a test that fires two hundred shots at a
   *   randomly generated landscape is a test that fails on the days the
   *   landscape happens to be kind.
   */
  constructor(session: DoorSession, net?: WormsNet | null, seed?: number) {
    this.session = session;
    this.seed = seed;
    this.settings = loadSettings();

    const teletextMode = Boolean(session.bbsSession?.texttvMode);
    this.screen = new TeletextScreen({
      write: data => session.socket.emit('ansi-output', data),
      rows: Number(session.bbsSession?.screenHeight),
      mode: teletextMode ? 'teletext' : 'ansi',
    });

    this.keys = new KeyStream({
      key: ch => this.handleKey(ch),
      escape: () => this.onEscape(),
      arrow: direction => this.onArrow(direction),
    });

    this.net =
      net !== undefined
        ? net
        : this.settings.allowNetwork
          ? safely(() => new WormsNet({ user: session.user, bbsSession: session.bbsSession as never }))
          : null;
  }

  // --- Lifecycle --------------------------------------------------------

  start(): void {
    this.screen.begin();
    this.paintMenu();
  }

  stop(): void {
    this.closed = true;
    this.keys.dispose();
    this.net?.dispose();
    this.screen.end();
  }

  handleInput(data: string): void {
    if (!this.closed) this.keys.feed(data);
  }

  // --- Menu -------------------------------------------------------------

  private menuItems(): string[] {
    const items = ['Hotseat - two teams, one keyboard'];
    if (this.net) {
      items.push('Host a match for another caller');
      items.push('Join a match');
    }
    items.push('Leave');
    return items;
  }

  private paintMenu(): void {
    this.view = 'menu';
    const items = this.menuItems();
    const lines = ['', ...items.map((item, at) => `${at === this.menuAt ? '>' : ' '} ${item}`)];
    if (this.message) lines.push('', this.message);
    lines.push(
      '',
      'Two teams take turns. Set an angle and',
      'a power and fire. The wind pushes the',
      'shell. Last team standing wins.',
    );
    this.screen.paint(messagePage('WORMS', lines, 'yellow'));
    this.screen.status('Arrows choose  ENTER picks  Q=Quit');
  }

  private chooseMenu(): void {
    const item = this.menuItems()[this.menuAt] ?? '';
    if (item.startsWith('Hotseat')) return this.startHotseat();
    if (item.startsWith('Host')) return void this.startHost();
    if (item.startsWith('Join')) return void this.showLobbies();
    this.quit();
  }

  // --- Starting a match -------------------------------------------------

  private startHotseat(): void {
    this.role = 'hotseat';
    this.match = newMatch({
      seed: this.seed,
      wormsPerTeam: this.settings.wormsPerTeam,
      hp: this.settings.startingHealth,
      teams: ['RED', 'BLUE'],
    });
    this.message = '';
    this.paintMatch();
  }

  private async startHost(): Promise<void> {
    if (!this.net) return;
    this.role = 'host';
    try {
      await this.net.host();
    } catch (error) {
      this.message = `could not host: ${(error as Error).message}`;
      return this.paintMenu();
    }

    this.net.on(INPUT_EVENT, payload => this.onGuestInput(payload as InputPacket));
    // The hello is what actually starts the match. Lobby membership events
    // are a secondary trigger: they are the broker's business and their
    // timing is not this door's to rely on, whereas a guest that has said
    // hello is definitely listening.
    this.net.on(HELLO_EVENT, () => this.onOpponentReady());
    this.net.onLobbyChange(() => this.onOpponentReady());

    this.view = 'lobby';
    this.screen.paint(
      messagePage('WAITING', [
        'Your match is open.',
        '',
        'Another caller can pick "Join a match"',
        'from this door and take the other side.',
        '',
        'Q leaves and closes it.',
      ], 'cyan'),
    );
    this.screen.status('Waiting for an opponent  Q=Quit');
  }

  private onOpponentReady(): void {
    if (this.role !== 'host' || !this.net) return;

    // A second hello for a match already under way is a guest that missed
    // the first packet - answer it with the state rather than a new match.
    if (this.match) {
      this.broadcast();
      return;
    }

    this.match = newMatch({
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

  private async showLobbies(): Promise<void> {
    if (!this.net) return;
    this.lobbies = await safelyAsync(() => this.net!.open(), []);
    if (this.lobbies.length === 0) {
      this.message = 'no matches are open right now';
      return this.paintMenu();
    }
    await this.joinMatch(this.lobbies[0]);
  }

  private async joinMatch(summary: LobbySummary): Promise<void> {
    if (!this.net) return;
    this.role = 'guest';
    this.net.on(STATE_EVENT, payload => this.onHostState(payload as StatePacket));
    try {
      await this.net.join(summary.id);
    } catch (error) {
      this.message = `could not join: ${(error as Error).message}`;
      return this.paintMenu();
    }
    // The listener went on before the join, because in-process the host can
    // answer inside the same tick and a listener registered afterwards
    // would miss the only state packet it was ever going to be sent.
    this.net.send(HELLO_EVENT, { from: this.net.playerId });

    this.view = 'lobby';
    this.screen.paint(messagePage('JOINED', ['Waiting for the host to start.'], 'cyan'));
    this.screen.status('Q=Quit');
  }

  // --- Network --------------------------------------------------------

  private broadcast(): void {
    if (this.role !== 'host' || !this.net || !this.match) return;
    const packet: StatePacket = {
      view: this.view,
      match: toView(this.match),
      message: this.message,
    };
    this.net.send(STATE_EVENT, packet);
  }

  private onGuestInput(packet: InputPacket): void {
    if (this.role !== 'host' || !this.match || this.match.over) return;
    // The guest plays team two and only on its own turn. A packet arriving
    // out of turn is ignored rather than argued with.
    if (this.match.turn !== 1) return;

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
    if (packet.fire) this.fire();
  }

  private onHostState(packet: StatePacket): void {
    if (this.role !== 'guest' || !packet?.match) return;
    this.mirror = packet;
    this.message = packet.message ?? '';
    this.view = packet.view === 'lobby' ? 'aim' : packet.view;
    this.paintMirror();
  }

  private sendAim(): void {
    if (this.role !== 'guest' || !this.net || !this.mirror) return;
    this.net.send(INPUT_EVENT, {
      from: this.net.playerId,
      angle: this.mirror.match.aim.angle,
      power: this.mirror.match.aim.power,
      facing: this.mirror.match.aim.facing,
    } satisfies InputPacket);
  }

  // --- Playing ----------------------------------------------------------

  private myTurn(): boolean {
    if (this.role === 'hotseat') return true;
    if (this.role === 'host') return this.match ? this.match.turn === 0 : false;
    return this.mirror ? this.mirror.match.turn === 1 : false;
  }

  private onArrow(direction: ArrowKey): void {
    if (this.view === 'menu') {
      const items = this.menuItems();
      if (direction === 'up') this.menuAt = (this.menuAt + items.length - 1) % items.length;
      if (direction === 'down') this.menuAt = (this.menuAt + 1) % items.length;
      this.paintMenu();
      return;
    }
    if (this.view !== 'aim' || !this.myTurn()) return;

    const change =
      direction === 'up'
        ? { angle: 2 }
        : direction === 'down'
          ? { angle: -2 }
          : { facing: (direction === 'right' ? 1 : -1) as -1 | 1 };
    this.changeAim(change);
  }

  private handleKey(ch: string): void {
    if (ch === 'q' || ch === 'Q') return this.quit();

    switch (this.view) {
      case 'menu':
        if (ch === '\r' || ch === '\n' || ch === ' ') this.chooseMenu();
        return;
      case 'aim':
        if (!this.myTurn()) return;
        if (ch === '+' || ch === '.') return this.changeAim({ power: 1 });
        if (ch === '-' || ch === ',') return this.changeAim({ power: -1 });
        if (ch === ' ' || ch === '\r' || ch === '\n') return this.requestFire();
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
          if (this.role === 'hotseat') return this.startHotseat();
          this.paintMenu();
        }
        return;
      default:
        return;
    }
  }

  private changeAim(change: { angle?: number; power?: number; facing?: -1 | 1 }): void {
    if (this.role === 'guest') {
      if (!this.mirror) return;
      const aim = this.mirror.match.aim;
      aim.angle = clamp(aim.angle + (change.angle ?? 0), 0, 90);
      aim.power = clamp(aim.power + (change.power ?? 0), 1, 10);
      if (change.facing) aim.facing = change.facing;
      this.paintMirror();
      this.sendAim();
      return;
    }
    if (!this.match) return;
    adjustAim(this.match, change);
    this.paintMatch();
    this.broadcast();
  }

  private requestFire(): void {
    if (this.role === 'guest') {
      if (this.net && this.mirror) this.net.send(INPUT_EVENT, { from: this.net.playerId, fire: true });
      return;
    }
    this.fire();
  }

  private fire(): void {
    if (!this.match) return;
    const shooter = activeWorm(this.match);
    const outcome = takeTurn(this.match);
    if (!outcome || !shooter) return;

    this.message = describe(outcome, this.match);
    this.view = this.match.over ? 'over' : 'shot';

    if (this.match.over) {
      const winner = this.match.winner === null ? null : this.match.teams[this.match.winner].name;
      this.session.achievement?.('teletext_worms_match', { value: this.match.turnsTaken });
      this.screen.paint(
        resultPage(winner, [
          `${this.match.turnsTaken} turns.`,
          '',
          ...this.match.teams.map(
            (team, at) => `${team.name.padEnd(6)} ${teamWorms(this.match!, at).length} left, ${teamHp(this.match!, at)} health`,
          ),
        ]),
      );
      this.screen.status(winner ? `${winner} wins  SPACE=Again  Q=Quit` : 'A draw  SPACE=Again  Q=Quit');
    } else {
      this.paintMatch({ arc: outcome.shot.path, impact: outcome.shot.impact });
      this.screen.status(`${this.message}  SPACE=Next  Q=Quit`);
    }
    this.broadcast();
  }

  // --- Painting ---------------------------------------------------------

  private paintMatch(overlay: { arc?: Point[] | null; impact?: Point | null } = {}): void {
    const match = this.match;
    if (!match) return;
    if (this.view === 'menu' || this.view === 'lobby') this.view = 'aim';

    const field: FieldView = {
      terrain: match.terrain,
      worms: match.worms,
      arc: overlay.arc ?? null,
      impact: overlay.impact ?? null,
    };
    this.screen.paint(matchPage(field, this.hudFor(match.teams.map(t => t.name), match.worms, match.turn, match.wind, match.aim)));
    if (this.view === 'aim') this.screen.status(this.aimBar(match.turn, match.teams[match.turn].name));
  }

  private paintMirror(): void {
    const mirror = this.mirror;
    if (!mirror) return;
    const { terrain, worms } = fromView(mirror.match);
    const field: FieldView = {
      terrain,
      worms,
      arc: mirror.view === 'shot' ? mirror.match.lastPath : null,
      impact: mirror.view === 'shot' ? mirror.match.lastImpact : null,
    };
    this.screen.paint(
      matchPage(
        field,
        this.hudFor(mirror.match.teams.map(t => t.name), worms, mirror.match.turn, mirror.match.wind, mirror.match.aim),
      ),
    );
    if (mirror.view === 'over') {
      const winner = mirror.match.winner === null ? null : mirror.match.teams[mirror.match.winner].name;
      this.screen.paint(resultPage(winner, [`${mirror.match.turnsTaken} turns.`]));
      this.screen.status(winner ? `${winner} wins  Q=Quit` : 'A draw  Q=Quit');
      return;
    }
    this.screen.status(
      mirror.view === 'shot'
        ? `${this.message}  SPACE=Next  Q=Quit`
        : this.aimBar(mirror.match.turn, mirror.match.teams[mirror.match.turn].name),
    );
  }

  private hudFor(
    names: string[],
    worms: readonly Worm[],
    turn: number,
    wind: number,
    aim: { angle: number; power: number; facing: -1 | 1 },
  ): HudView {
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

  private aimBar(turn: number, name: string): string {
    if (!this.myTurn()) return `${name} is aiming  Q=Quit`;
    return `${name}  arrows aim  +/- power  SPACE fires`;
  }

  private onEscape(): void {
    if (this.view === 'menu') return this.quit();
    this.message = '';
    this.match = null;
    this.mirror = null;
    this.role = 'hotseat';
    this.paintMenu();
  }

  private quit(): void {
    this.stop();
    this.session.close();
  }
}

function describe(outcome: ReturnType<typeof takeTurn>, match: Match): string {
  if (!outcome) return '';
  if (outcome.shot.ending === 'offfield') return 'out of the field';
  const hurt = [...outcome.blast, ...outcome.falls].reduce((total, d) => total + d.amount, 0);
  if (outcome.killed.length > 0) {
    const names = outcome.killed.map(id => match.teams[Number(id.split('-')[0])]?.name ?? '?');
    return `${outcome.killed.length} down (${names.join(' ')})`;
  }
  if (hurt > 0) return `${hurt} damage`;
  return outcome.shot.ending === 'worm' ? 'a glancing hit' : 'missed';
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function safely<T>(make: () => T): T | null {
  try {
    return make();
  } catch (error) {
    console.error('[TeletextWorms] network unavailable:', (error as Error).message);
    return null;
  }
}

async function safelyAsync<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.error('[TeletextWorms]', (error as Error).message);
    return fallback;
  }
}

export { activePlayerId };
