/**
 * Card Lobby - Dialog Manager
 * Handles all modal dialogs, windows, and prompts
 */

import blessed, { Screen, Box, Button, List, ScrollableBox, DocModal } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { calculateDialogWidth } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox, createList, createButton, createText, createTextbox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { UnoColor, HouseRule } from '../lib/uno-engine';
import {
  type DoorSession,
  type LobbyState,
  type PlayerProfile,
  type CardPreferences,
  type LeaderboardMode,
  UI_THEME,
  ACHIEVEMENTS,
  LOBBY_BULLETINS,
  WEEKLY_BULLETIN_NUMBER,
  WEEK_MS,
  pad,
  formatChips,
  buildWeeklyBulletin,
} from '../lib';
import { showCardStyleDialog } from './CardStyleDialog';
import { showThemeDialog } from './ThemeDialog';
import type { Theme } from '@amiexpress/bbs-door-sdk/engines/ui/theme';

/** Where the games-won page gets its rows (managers/Scores.ts). */
export interface GameScoreSource {
  gamesPlayed(): string[];
  table(gameId: string, limit?: number): Array<{ username: string; won: number; played: number }>;
}

/**
 * What a game is called on the board.
 *
 * The id is what the table stores and the name is what a caller reads; a game
 * this map has not heard of prints its id rather than nothing, so a game
 * added later appears on the board the day it records a result.
 */
const GAME_TITLES: Record<string, string> = {
  skitgubbe: 'Skitgubbe (vandtia)',
  'skitgubbe-trick': 'Skitgubbe (trick-taking)',
  uno: 'UNO',
  'uno-house': 'UNO (house rules)',
  patience: 'Patience',
};

export class DialogManager {
  private screen: Screen;
  private overlayShade: Box;
  private modalActive = false;
  private leaderboardMode: LeaderboardMode | 'games' = 'weekly';

  constructor(screen: Screen, overlayShade: Box) {
    this.screen = screen;
    this.overlayShade = overlayShade;
  }

  setModalActive(value: boolean): void {
    console.log('[DialogManager] setModalActive:', value, '(was:', this.modalActive + ')');
    this.modalActive = value;
  }

  isModalActive(): boolean {
    return this.modalActive;
  }

  showProfileWindow(profile: PlayerProfile | null): void {
    if (!profile) return;
    const stats = profile.stats;
    const lines = [
      `Player: ${profile.username}`,
      '',
      `Chips: ${profile.wallet.chips}`,
      `Lifetime Earned: ${profile.wallet.lifetimeEarned}`,
      `Hands: ${stats.handsPlayed}  Wins: ${stats.wins}  Losses: ${stats.losses}`,
      `Net: ${formatChips(stats.net)}  Biggest Pot: ${stats.biggestPot}`,
      `Best Streak: ${stats.bestWinStreak}`,
    ];
    this.showTextWindow('Player Profile', lines.join('\n'));
  }

  showAchievementsWindow(profile: PlayerProfile | null): void {
    if (!profile) return;
    const lines: string[] = [];
    lines.push(`Unlocked: ${profile.achievements.length}/${ACHIEVEMENTS.length}`);
    lines.push('');
    ACHIEVEMENTS.forEach((achievement) => {
      const unlocked = profile?.achievements.includes(achievement.id);
      const status = unlocked ? '[X]' : '[ ]';
      lines.push(`${status} ${achievement.name} - ${achievement.description}`);
    });
    this.showTextWindow('Achievements', lines.join('\n'));
  }

  /**
   * The board of who is doing well - and, on its fourth page, of who WINS.
   *
   * "skitgubbe can have a highscore list that tracks games won same for uno
   * etc" (sysop, 2026-09-16). It is a page of this rather than a screen of
   * its own: the three pages here already answer "how is everyone doing", and
   * a second leaderboard in another menu is how a caller ends up not knowing
   * where to look. The chips pages measure a hand that PAID; the games page
   * measures a game somebody WON, which is the only measure a social game
   * has.
   */
  showLeaderboardWindow(
    profiles: Record<string, PlayerProfile>,
    games?: GameScoreSource,
  ): void {
    const content = (): string => (this.leaderboardMode === 'games'
      ? this.buildGameScoreContent(games)
      : this.buildLeaderboardContent(profiles));
    this.showTextWindow('Leaderboard', content(), {
      footer: 'Keys: 1 Daily  2 Weekly  3 All-Time  4 Games Won',
      onKey: (key) => {
        if (key === '1') this.leaderboardMode = 'daily';
        if (key === '2') this.leaderboardMode = 'weekly';
        if (key === '3') this.leaderboardMode = 'all';
        if (key === '4') this.leaderboardMode = 'games';
        return content();
      },
    });
  }

  /** Games won, per game, best first. */
  buildGameScoreContent(games?: GameScoreSource): string {
    const lines: string[] = ['Mode: GAMES WON', ''];
    const played = games?.gamesPlayed() ?? [];

    if (played.length === 0) {
      lines.push('Nobody has finished a game yet.');
      lines.push('');
      lines.push('A game counts when it ENDS - the Skitgubbe is decided, or');
      lines.push('somebody goes out first at UNO. Hands of poker are on the');
      lines.push('other three pages, where the chips are.');
      return lines.join('\n');
    }

    for (const gameId of played) {
      lines.push(`{cyan-fg}${GAME_TITLES[gameId] ?? gameId}{/}`);
      lines.push('RANK NAME           WON  PLAYED');
      lines.push('---- -------------- ---- ------');
      games?.table(gameId, 5).forEach((row, index) => {
        lines.push(
          `${String(index + 1).padEnd(4)} ${row.username.slice(0, 14).padEnd(14)} `
          + `${String(row.won).padStart(4)} ${String(row.played).padStart(6)}`,
        );
      });
      lines.push('');
    }
    return lines.join('\n');
  }

  buildLeaderboardContent(profiles: Record<string, PlayerProfile>): string {
    const modeLabel = this.leaderboardMode === 'all' ? 'ALL-TIME' : this.leaderboardMode.toUpperCase();
    const rows = Object.values(profiles)
      .map((profile) => {
        const stats = this.leaderboardMode === 'daily'
          ? profile.stats.daily
          : this.leaderboardMode === 'weekly'
            ? profile.stats.weekly
            : { hands: profile.stats.handsPlayed, wins: profile.stats.wins, net: profile.stats.net };
        return {
          username: profile.username,
          wins: stats.wins,
          hands: stats.hands,
          net: stats.net,
        };
      })
      .filter((row) => row.hands > 0 || row.wins > 0)
      .sort((a, b) => b.net - a.net)
      .slice(0, 10);

    const lines: string[] = [];
    lines.push(`Mode: ${modeLabel}`);
    lines.push('');
    lines.push('RANK NAME           WINS  HANDS  NET');
    lines.push('---- -------------- ----- ------ -----');

    if (rows.length === 0) {
      lines.push('No stats yet. Play a hand to get on the board.');
    } else {
      rows.forEach((row, index) => {
        const line =
          pad(String(index + 1), 4) +
          ' ' +
          pad(row.username, 14) +
          ' ' +
          pad(String(row.wins), 5) +
          ' ' +
          pad(String(row.hands), 6) +
          ' ' +
          pad(formatChips(row.net), 5);
        lines.push(line);
      });
    }

    return lines.join('\n');
  }

  /**
   * Pick how cards are drawn. The panel lives in CardStyleDialog: it
   * stays open while the player cycles settings, and reports each change
   * through `onChange` so the board behind redraws as they go.
   */
  async showCardStyleWindow(
    profile: PlayerProfile | null,
    unicodeCapable: boolean,
    onChange?: (preferences: CardPreferences) => void,
  ): Promise<CardPreferences | null> {
    if (!profile) return null;
    return showCardStyleDialog(
      {
        screen: this.screen,
        overlayShade: this.overlayShade,
        setModalActive: (value) => this.setModalActive(value),
        isModalActive: () => this.isModalActive(),
      },
      profile.cards ?? {},
      unicodeCapable,
      onChange,
    );
  }

  /**
   * The theme panel. Same host, same shade sequence as the card style panel
   * above - see managers/ThemeDialog.ts for what happens when the shade is
   * left down.
   */
  async showThemeWindow(bbs: unknown, onApply: (theme: Theme) => void): Promise<void> {
    await showThemeDialog(
      {
        screen: this.screen,
        overlayShade: this.overlayShade,
        setModalActive: (value) => this.setModalActive(value),
        isModalActive: () => this.isModalActive(),
      },
      bbs,
      onApply,
    );
  }

  async showBulletinsWindow(session: DoorSession): Promise<void> {
    // Only offer bulletins that are actually on the board. The list was
    // built from a hardcoded table, so a board with no bulletins - which
    // is every board until the weekly one is first written - offered one
    // anyway and answered "Bulletin not found." (sysop, 2026-09-02:
    // "there is no bulletin posted either so it cant display it").
    // THE LOBBY'S OWN BULLETINS, and nothing else.
    //
    // I briefly made this list every bull*.txt on the board. That is wrong
    // and the sysop said so: "why would i want to read bulletins not related
    // to the cardlobby in the cardlobby? makes no sense". The board's own
    // bulletins have a command at the menu; a door's viewer is for what the
    // door itself posts. Only a bulletin that EXISTS is offered, so the empty
    // state says the lobby has not written one yet instead of opening a
    // reader onto "Bulletin not found." (2026-09-02).
    const available: Array<{ entry: typeof LOBBY_BULLETINS[number]; content: string }> = [];
    for (const entry of LOBBY_BULLETINS) {
      const content = await this.readBulletin(entry.number, session);
      if (content && content.trim()) available.push({ entry, content });
    }

    if (available.length === 0) {
      // Say what actually makes one appear. The old wording promised a
      // bulletin "once a week of play has gone by", which was never the
      // rule and is certainly not it now: the lobby writes its leaderboard
      // as soon as somebody has played, and then at most once a week after
      // that. A caller who has been told to wait a week does not know that
      // dealing one hand is what fills this window.
      this.showTextWindow('Bulletins', 'No bulletins have been posted yet.\n\n'
        + 'The lobby posts its leaderboard once somebody has played a hand,\n'
        + 'and refreshes it at most once a week after that.');
      return;
    }

    const entries = available.map(({ entry }) => `#${entry.number} ${entry.title}`);
    const selection = await this.showListDialog('Bulletins', entries);
    if (selection === null) return;

    const chosen = available[selection];
    if (!chosen) return;

    this.showTextWindow(`Bulletin #${chosen.entry.number}`, chosen.content);
  }

  async readBulletin(number: number, session: DoorSession): Promise<string | null> {
    if (!session.bbs?.readFile) return null;
    const content = await session.bbs.readFile(`Bulletins/bull${number}.txt`);
    if (!content) return null;
    return content.replace(/\r\n/g, '\n');
  }

  async writeWeeklyBulletinIfNeeded(lobby: LobbyState | null, profiles: Record<string, PlayerProfile>, session: DoorSession): Promise<void> {
    if (!lobby) return;
    const now = Date.now();
    if (now - lobby.lastBulletinAt < WEEK_MS) return;

    // Nothing to report is not a bulletin. The builder keeps only players
    // with a hand or a win this week, so on a lobby nobody has played in
    // this would post a header over an empty table - which reads as a
    // broken bulletin rather than an empty one.
    const played = Object.values(profiles).some(
      (p) => (p?.stats?.weekly?.hands ?? 0) > 0 || (p?.stats?.weekly?.wins ?? 0) > 0,
    );
    if (!played) return;

    const content = buildWeeklyBulletin(lobby, profiles);
    if (session.bbs?.writeFile) {
      await session.bbs.writeFile(`Bulletins/bull${WEEKLY_BULLETIN_NUMBER}.txt`, content);
      lobby.lastBulletinAt = now;
    }
  }

  /**
   * A scrollable window of text: profiles, achievements, the leaderboard, a
   * bulletin.
   *
   * This used to be a Box, a ScrollableBox and a footer Box assembled here,
   * with its own escape handling - and the escape handling did not work,
   * because focus never reached the widget the keys were bound to
   * ("i can't exit them", 2026-09-02). DocModal is the SDK's answer to the
   * same problem: it traps focus, closes on ESC/Q/F1, restores the focus it
   * took, and lays itself out for a small screen.
   */
  showTextWindow(title: string, content: string, opts?: { footer?: string; onKey?: (key: string) => string | void }): void {
    if (this.modalActive) return;
    this.modalActive = true;

    /**
     * A window, not a takeover.
     *
     * DocModal defaults to the whole terminal - right for a door's help
     * screen, wrong for a seven-line player profile, which swallowed the
     * menu bar with it: "the player profile page has no menus or if its a
     * dialog it covers it" (sysop, 2026-09-14). The box takes the room its
     * content needs, on the SDK's dialog ladder, and leaves the bar on row
     * 0 and the status bar on the last row where they are.
     */
    const screenWidth = Number(this.screen.width) || 80;
    const screenHeight = Number(this.screen.height) || 25;
    const lines = content.split('\n').length;
    const room = Math.max(5, screenHeight - 3);
    // Border top and bottom, the footer, and a line of air.
    const height = Math.min(room, lines + 4);
    const top = Math.max(1, Math.floor((screenHeight - height) / 2));

    const modal = new DocModal({
      parent: this.screen as any,
      top,
      left: 'center',
      width: calculateDialogWidth(screenWidth),
      height,
      title,
      content,
      // ESC and Q are what the SDK closes on, and nobody guesses that: the
      // sysop sat in a bulletin pressing ENTER and SPACE while the door -
      // which gates every one of its own keys on modalActive - did nothing
      // at all in reply, which reads as a frozen door rather than a modal
      // wanting a different key (live log, 2026-09-02). A read-only window
      // has no other use for Enter or Space, so they close it too.
      closeKeys: ['enter', 'return', 'space'],
      footerText: opts?.footer ?? '[ESC/Q/ENTER] Close   [Up/Down/PgUp/PgDn] Scroll',
      contentStyle: { fg: UI_THEME.ink, bg: UI_THEME.windowBg },
      footerStyle: { fg: UI_THEME.accent, bg: UI_THEME.windowBg },
      onClose: () => {
        this.modalActive = false;
        this.screen.render();
      },
    } as any);

    // The leaderboard switches between daily, weekly and all-time in place.
    if (opts?.onKey) {
      (modal as any).key(['1', '2', '3'], (ch: string) => {
        const next = opts.onKey?.(ch);
        if (typeof next === 'string') modal.setContent(next);
        this.screen.render();
      });
    }

    modal.display();
    this.screen.render();
  }

  async showListDialog(title: string, items: string[]): Promise<number | null> {
    console.log('[DialogManager] showListDialog called:', { title, itemCount: items.length });

    if (this.modalActive) {
      console.log('[DialogManager] BLOCKED - modalActive is true');
      return null;
    }

    console.log('[DialogManager] Setting modalActive = true');
    this.modalActive = true;

    console.log('[DialogManager] Showing overlayShade...');
    console.log('[DialogManager] overlayShade.hidden BEFORE:', this.overlayShade.hidden);
    console.log('[DialogManager] overlayShade.visible BEFORE:', (this.overlayShade as any).visible);
    console.log('[DialogManager] overlayShade.z BEFORE:', (this.overlayShade as any).z);

    this.overlayShade.show();

    console.log('[DialogManager] overlayShade.hidden AFTER:', this.overlayShade.hidden);
    console.log('[DialogManager] overlayShade.visible AFTER:', (this.overlayShade as any).visible);
    console.log('[DialogManager] overlayShade.z AFTER:', (this.overlayShade as any).z);

    return new Promise((resolve) => {
      console.log('[DialogManager] Creating List element...');
      const list = new List({
        parent: this.overlayShade,
        top: 'center',
        left: 'center',
        // From the screen, never a constant. Sixty columns is wider than a
        // PETSCII caller's whole screen and wider than a narrow window, and
        // a box drawn past the edge leaves its right-hand border behind as
        // a stray glyph - the sysop's screenshot of a lone "]" (2026-09-13).
        width: calculateDialogWidth(this.screen.width || 80),
        height: Math.min(16, Math.max(8, (this.screen.height || 25) - 6)),
        border: { type: 'ascii' },
        label: ` ${title} `,
        style: {
          border: UI_THEME.windowBorder,
          bg: UI_THEME.windowBg,
          fg: UI_THEME.ink,
          selected: { fg: UI_THEME.highlightInk, bg: UI_THEME.highlightBg },
        } as any,
        items,
        keys: true,
        mouse: true,
        vi: true,
      });

      console.log('[DialogManager] List created');
      console.log('[DialogManager] List.hidden:', list.hidden);
      console.log('[DialogManager] List.visible:', (list as any).visible);
      console.log('[DialogManager] List.z:', (list as any).z);
      console.log('[DialogManager] List.parent === overlayShade:', list.parent === this.overlayShade);

      // Dump element tree for debugging
      console.log('[DialogManager] === Element Tree ===');
      console.log('[DialogManager] Screen children:', this.screen.children.map((c: any) => ({
        type: c.type,
        z: c.z,
        hidden: c.hidden,
        visible: c.visible
      })));

      // Find overlayShade's parent
      const desktop = this.screen.children.find((c: any) =>
        c.children && c.children.some((child: any) => child === this.overlayShade)
      );
      if (desktop) {
        console.log('[DialogManager] Desktop children:', (desktop as any).children.map((c: any) => ({
          type: c.type,
          z: c.z,
          hidden: c.hidden,
          visible: c.visible
        })));
      }

      console.log('[DialogManager] OverlayShade children:', this.overlayShade.children.map((c: any) => ({
        type: c.type,
        z: c.z,
        hidden: c.hidden,
        visible: c.visible
      })));

      const cleanup = (value: number | null): void => {
        console.log('[DialogManager] Cleanup called with value:', value);
        list.destroy();
        this.overlayShade.hide();
        this.modalActive = false;
        this.screen.render();
        resolve(value);
      };

      list.on('select', (_: any, index: number) => cleanup(index));
      list.key(['escape', 'q'], () => cleanup(null));

      console.log('[DialogManager] Focusing list...');

      // Ensure dialog stays on top and focused
      this.overlayShade.setFront();
      list.setFront();
      list.focus();

      console.log('[DialogManager] List focused');
      console.log('[DialogManager] List.focused:', (list as any).focused);

      console.log('[DialogManager] Rendering screen...');
      this.screen.render();
      console.log('[DialogManager] Screen rendered');
      console.log('[DialogManager] showListDialog setup complete - waiting for user interaction');
    });
  }

  async showPromptDialog(title: string, text: string, value: string): Promise<string | null> {
    if (this.modalActive) return null;
    this.modalActive = true;

    return new Promise((resolve) => {
      this.overlayShade.show();
      const prompt = blessed.prompt({
        parent: this.screen as any,
        title: ` ${title} `,
        text,
        value,
        border: { type: 'ascii' },
        style: { fg: UI_THEME.ink, bg: UI_THEME.windowBg, border: { fg: UI_THEME.windowBorder.fg } },
      });

      const cleanup = (result: string | null): void => {
        prompt.destroy();
        this.overlayShade.hide();
        this.modalActive = false;
        this.screen.render();
        resolve(result);
      };

      // Ensure prompt stays on top and focused
      this.overlayShade.setFront();
      prompt.setFront();

      prompt.showInput(text, value, (err, result) => {
        if (err) {
          cleanup(null);
          return;
        }
        cleanup(result ?? null);
      });

      this.screen.render();
    });
  }

  async showYesNoDialog(title: string, text: string): Promise<boolean | null> {
    if (this.modalActive) return null;
    this.modalActive = true;

    return new Promise((resolve) => {
      this.overlayShade.show();
      const question = blessed.question({
        parent: this.screen as any,
        title: ` ${title} `,
        text,
        border: { type: 'ascii' },
        style: { fg: UI_THEME.ink, bg: UI_THEME.windowBg, border: { fg: UI_THEME.windowBorder.fg } },
      });

      const cleanup = (value: boolean | null): void => {
        question.destroy();
        this.overlayShade.hide();
        this.modalActive = false;
        this.screen.render();
        resolve(value);
      };

      // Ensure question dialog stays on top and focused
      this.overlayShade.setFront();
      question.setFront();

      question.once('answer', (answer: boolean) => cleanup(answer));
      question.ask(text);
      this.screen.render();
    });
  }

  async showMessageDialog(title: string, text: string): Promise<void> {
    if (this.modalActive) return;
    this.modalActive = true;

    return new Promise((resolve) => {
      this.overlayShade.show();
      const message = blessed.message({
        parent: this.screen as any,
        title: ` ${title} `,
        text,
        border: { type: 'ascii' },
        style: { fg: UI_THEME.ink, bg: UI_THEME.windowBg, border: { fg: UI_THEME.windowBorder.fg } },
      });

      const cleanup = (): void => {
        message.destroy();
        this.overlayShade.hide();
        this.modalActive = false;
        this.screen.render();
        resolve();
      };

      // Ensure message stays on top
      this.overlayShade.setFront();
      message.setFront();

      message.display(text, cleanup);
      this.screen.render();
    });
  }

  // ============================================================================
  // UNO DIALOGS
  // ============================================================================

  async showColorSelectionDialog(): Promise<UnoColor | null> {
    return new Promise<UnoColor | null>((resolve) => {
      if (this.modalActive) {
        resolve(null);
        return;
      }

      this.modalActive = true;
      this.overlayShade.show();

      const dialogWidth = 40;
      const dialogHeight = 12;

      const dialog = createBox({
        parent: this.screen,
        top: 'center',
        left: 'center',
        width: dialogWidth,
        height: dialogHeight,
        label: ' Choose Color ',
        border: 'line',
        shadow: true,
        style: { fg: UI_THEME.ink, bg: UI_THEME.windowBg, border: { fg: UI_THEME.windowBorder.fg } },
      });

      const buttonWidth = 12;
      const buttonHeight = 3;
      const startY = 2;
      const spacing = 1;

      const colors: Array<{ color: UnoColor; label: string; fg: string; bg: string }> = [
        { color: 'R', label: 'RED', fg: 'white', bg: 'red' },
        { color: 'G', label: 'GREEN', fg: 'black', bg: 'green' },
        { color: 'B', label: 'BLUE', fg: 'white', bg: 'blue' },
        { color: 'Y', label: 'YELLOW', fg: 'black', bg: 'yellow' },
      ];

      const cleanup = (result: UnoColor | null): void => {
        dialog.destroy();
        this.overlayShade.hide();
        this.modalActive = false;
        this.screen.render();
        resolve(result);
      };

      colors.forEach((colorDef, index) => {
        const button = createButton({
          parent: dialog,
          top: startY + (index * (buttonHeight + spacing)),
          left: 'center',
          width: buttonWidth,
          height: buttonHeight,
          content: colorDef.label,
          align: 'center',
          valign: 'middle',
          style: {
            fg: colorDef.fg,
            bg: colorDef.bg,
            hover: { fg: 'white', bg: colorDef.bg },
            focus: { fg: 'white', bg: colorDef.bg },
          },
          mouse: true,
        });

        button.on('press', () => cleanup(colorDef.color));
      });

      dialog.key(['escape', 'q'], () => cleanup(null));
      dialog.focus();
      this.screen.render();
    });
  }

  async showHouseRuleCreationDialog(): Promise<HouseRule | null> {
    return new Promise<HouseRule | null>((resolve) => {
      if (this.modalActive) {
        resolve(null);
        return;
      }

      this.modalActive = true;
      this.overlayShade.show();

      const dialogWidth = 60;
      const dialogHeight = 20;

      const dialog = createBox({
        parent: this.screen,
        top: 'center',
        left: 'center',
        width: dialogWidth,
        height: dialogHeight,
        label: ' Create House Rule ',
        border: 'line',
        shadow: true,
        style: { fg: UI_THEME.ink, bg: UI_THEME.windowBg, border: { fg: UI_THEME.windowBorder.fg } },
      });

      createText({
        parent: dialog,
        top: 1,
        left: 2,
        content: 'Rule Number (1-5):',
        style: { fg: UI_THEME.accent },
      });

      const numberInput = createTextbox({
        parent: dialog,
        top: 2,
        left: 2,
        width: 10,
        height: 1,
        inputOnFocus: true,
        style: { fg: UI_THEME.statusBar.fg, bg: UI_THEME.statusBar.bg },
      });

      createText({
        parent: dialog,
        top: 4,
        left: 2,
        content: 'Rule Name:',
        style: { fg: UI_THEME.accent },
      });

      const nameInput = createTextbox({
        parent: dialog,
        top: 5,
        left: 2,
        width: dialogWidth - 4,
        height: 1,
        inputOnFocus: true,
        style: { fg: UI_THEME.statusBar.fg, bg: UI_THEME.statusBar.bg },
      });

      createText({
        parent: dialog,
        top: 7,
        left: 2,
        content: 'Description:',
        style: { fg: UI_THEME.accent },
      });

      const descInput = createTextbox({
        parent: dialog,
        top: 8,
        left: 2,
        width: dialogWidth - 4,
        height: 3,
        inputOnFocus: true,
        style: { fg: UI_THEME.statusBar.fg, bg: UI_THEME.statusBar.bg },
      });

      const cleanup = (result: HouseRule | null): void => {
        dialog.destroy();
        this.overlayShade.hide();
        this.modalActive = false;
        this.screen.render();
        resolve(result);
      };

      const submitBtn = createButton({
        parent: dialog,
        bottom: 2,
        left: 'center',
        width: 12,
        height: 3,
        content: 'Create',
        align: 'center',
        valign: 'middle',
        style: {
          fg: 'white',
          bg: 'green',
          hover: { fg: 'white', bg: 'light-green' },
          focus: { fg: 'white', bg: 'light-green' },
        },
        mouse: true,
      });

      submitBtn.on('press', () => {
        const number = parseInt(numberInput.getValue(), 10);
        const name = nameInput.getValue().trim();
        const description = descInput.getValue().trim();

        if (number < 1 || number > 5 || isNaN(number)) {
          cleanup(null);
          return;
        }

        if (!name || !description) {
          cleanup(null);
          return;
        }

        cleanup({
          number: number as 1 | 2 | 3 | 4 | 5,
          name,
          description,
          createdBy: 'current-user',  // This should be replaced with actual user ID
          createdAt: Date.now(),
        });
      });

      dialog.key(['escape', 'q'], () => cleanup(null));
      numberInput.focus();
      this.screen.render();
    });
  }

  async showHouseRulesListDialog(activeRules: HouseRule[]): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.modalActive) {
        resolve();
        return;
      }

      this.modalActive = true;
      this.overlayShade.show();

      const dialogWidth = 70;
      const dialogHeight = 25;

      const dialog = createBox({
        parent: this.screen,
        top: 'center',
        left: 'center',
        width: dialogWidth,
        height: dialogHeight,
        label: ' Active House Rules ',
        border: 'line',
        shadow: true,
        style: { fg: UI_THEME.ink, bg: UI_THEME.windowBg, border: { fg: UI_THEME.windowBorder.fg } },
      });

      const content: string[] = [];
      content.push('{cyan-fg}House Rules at this table:{/}\n');

      if (activeRules.length === 0) {
        content.push('{gray-fg}No house rules active yet.{/}');
        content.push('');
        content.push('Play a House Rules card (1-5) to create a rule!');
      } else {
        activeRules.forEach((rule) => {
          content.push(`{yellow-fg}[${rule.number}]{/} {white-fg}${rule.name}{/}`);
          content.push(`    ${rule.description}`);
          content.push('');
        });
      }

      const scrollBox = blessed.scrollablebox({
        parent: dialog,
        top: 1,
        left: 1,
        right: 1,
        bottom: 4,
        content: content.join('\n'),
        tags: true,
        scrollable: true,
        alwaysScroll: true,
        mouse: true,
        keys: true,
        vi: true,
        scrollbar: true,
        style: { fg: UI_THEME.ink, bg: UI_THEME.windowBg },
      });

      const cleanup = (): void => {
        dialog.destroy();
        this.overlayShade.hide();
        this.modalActive = false;
        this.screen.render();
        resolve();
      };

      const closeBtn = createButton({
        parent: dialog,
        bottom: 1,
        left: 'center',
        width: 12,
        height: 3,
        content: 'Close',
        align: 'center',
        valign: 'middle',
        style: {
          fg: 'white',
          bg: 'blue',
          hover: { fg: 'white', bg: 'light-blue' },
          focus: { fg: 'white', bg: 'light-blue' },
        },
        mouse: true,
      });

      closeBtn.on('press', cleanup);
      dialog.key(['escape', 'q', 'enter'], cleanup);
      closeBtn.focus();
      this.screen.render();
    });
  }
}
