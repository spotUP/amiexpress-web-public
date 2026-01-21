/**
 * Card Lobby - Dialog Manager
 * Handles all modal dialogs, windows, and prompts
 */

import blessed, { Screen, Box, Button, List, ScrollableBox } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox, createList, createButton, createText } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { UnoColor, HouseRule } from '../lib/uno-engine';
import {
  type DoorSession,
  type LobbyState,
  type PlayerProfile,
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

export class DialogManager {
  private screen: Screen;
  private overlayShade: Box;
  private modalActive = false;
  private leaderboardMode: LeaderboardMode = 'weekly';

  constructor(screen: Screen, overlayShade: Box) {
    this.screen = screen;
    this.overlayShade = overlayShade;
  }

  setModalActive(value: boolean): void {
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

  showLeaderboardWindow(profiles: Record<string, PlayerProfile>): void {
    const content = this.buildLeaderboardContent(profiles);
    this.showTextWindow('Leaderboard', content, {
      footer: 'Keys: 1 Daily  2 Weekly  3 All-Time',
      onKey: (key) => {
        if (key === '1') this.leaderboardMode = 'daily';
        if (key === '2') this.leaderboardMode = 'weekly';
        if (key === '3') this.leaderboardMode = 'all';
        return this.buildLeaderboardContent(profiles);
      },
    });
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

  async showBulletinsWindow(session: DoorSession): Promise<void> {
    const entries = LOBBY_BULLETINS.map((entry) => `#${entry.number} ${entry.title}`);
    const selection = await this.showListDialog('Bulletins', entries);
    if (selection === null) return;

    const entry = LOBBY_BULLETINS[selection];
    if (!entry) return;

    const content = await this.readBulletin(entry.number, session);
    this.showTextWindow(`Bulletin #${entry.number}`, content || 'Bulletin not found.');
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

    const content = buildWeeklyBulletin(lobby, profiles);
    if (session.bbs?.writeFile) {
      await session.bbs.writeFile(`Bulletins/bull${WEEKLY_BULLETIN_NUMBER}.txt`, content);
      lobby.lastBulletinAt = now;
    }
  }

  showTextWindow(title: string, content: string, opts?: { footer?: string; onKey?: (key: string) => string | void }): void {
    if (this.modalActive) return;
    this.modalActive = true;

    this.overlayShade.show();
    
    const container = new Box({
      parent: this.overlayShade,
      top: 'center',
      left: 'center',
      width: 70,
      height: 18,
      border: { type: 'ascii' },
      label: ` ${title} `,
      style: { border: UI_THEME.windowBorder, bg: 'black' },
    });

    const textBottom = opts?.footer ? 2 : 1;
    const text = new ScrollableBox({
      parent: container,
      top: 0,
      left: 0,
      right: 0,
      bottom: textBottom,
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      mouse: true,
      content,
      style: { fg: 'white', bg: 'black' },
      scrollbar: {
        ch: ' ',
        style: { bg: 'blue' }
      }
    });

    if (opts?.footer) {
      new Box({
        parent: container,
        bottom: 0,
        left: 0,
        right: 0,
        height: 1,
        content: opts.footer,
        style: { fg: UI_THEME.accent },
        tags: true
      });
    }

    const cleanup = (): void => {
      container.destroy();
      this.overlayShade.hide();
      this.modalActive = false;
      this.screen.render();
    };

    container.key(['escape', 'q'], cleanup);
    text.key(['escape', 'q'], cleanup); // Ensure text widget also handles it
    
    container.key(['1', '2', '3'], (ch: string) => {
      if (!opts?.onKey) return;
      const next = opts.onKey(ch);
      if (typeof next === 'string') {
        text.setContent(next);
        this.screen.render();
      }
    });

    text.focus();
    this.screen.render();
  }

  async showListDialog(title: string, items: string[]): Promise<number | null> {
    if (this.modalActive) return null;
    this.modalActive = true;

    this.overlayShade.show();

    return new Promise((resolve) => {
      const list = new List({
        parent: this.overlayShade,
        top: 'center',
        left: 'center',
        width: 60,
        height: 16,
        border: { type: 'ascii' },
        label: ` ${title} `,
        style: {
          border: UI_THEME.windowBorder,
          bg: 'black',
          fg: 'white',
          selected: { fg: 'black', bg: UI_THEME.highlightBg },
        } as any,
        items,
        keys: true,
        mouse: true,
        vi: true,
      });

      const cleanup = (value: number | null): void => {
        list.destroy();
        this.overlayShade.hide();
        this.modalActive = false;
        this.screen.render();
        resolve(value);
      };

      list.on('select', (_: any, index: number) => cleanup(index));
      list.key(['escape', 'q'], () => cleanup(null));
      list.focus();
      this.screen.render();
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
        style: { fg: 'white', bg: 'black', border: { fg: UI_THEME.windowBorder.fg } },
      });

      const cleanup = (result: string | null): void => {
        prompt.destroy();
        this.overlayShade.hide();
        this.modalActive = false;
        this.screen.render();
        resolve(result);
      };

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
        style: { fg: 'white', bg: 'black', border: { fg: UI_THEME.windowBorder.fg } },
      });

      const cleanup = (value: boolean | null): void => {
        question.destroy();
        this.overlayShade.hide();
        this.modalActive = false;
        this.screen.render();
        resolve(value);
      };

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
        style: { fg: 'white', bg: 'black', border: { fg: UI_THEME.windowBorder.fg } },
      });

      const cleanup = (): void => {
        message.destroy();
        this.overlayShade.hide();
        this.modalActive = false;
        this.screen.render();
        resolve();
      };

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
        style: { fg: 'white', bg: 'black', border: { fg: UI_THEME.windowBorder.fg } },
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
        style: { fg: 'white', bg: 'black', border: { fg: UI_THEME.windowBorder.fg } },
      });

      createText({
        parent: dialog,
        top: 1,
        left: 2,
        content: 'Rule Number (1-5):',
        style: { fg: 'cyan' },
      });

      const numberInput = blessed.textbox({
        parent: dialog,
        top: 2,
        left: 2,
        width: 10,
        height: 1,
        inputOnFocus: true,
        style: { fg: 'white', bg: 'blue' },
      });

      createText({
        parent: dialog,
        top: 4,
        left: 2,
        content: 'Rule Name:',
        style: { fg: 'cyan' },
      });

      const nameInput = blessed.textbox({
        parent: dialog,
        top: 5,
        left: 2,
        width: dialogWidth - 4,
        height: 1,
        inputOnFocus: true,
        style: { fg: 'white', bg: 'blue' },
      });

      createText({
        parent: dialog,
        top: 7,
        left: 2,
        content: 'Description:',
        style: { fg: 'cyan' },
      });

      const descInput = blessed.textbox({
        parent: dialog,
        top: 8,
        left: 2,
        width: dialogWidth - 4,
        height: 3,
        inputOnFocus: true,
        style: { fg: 'white', bg: 'blue' },
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
        style: { fg: 'white', bg: 'black', border: { fg: UI_THEME.windowBorder.fg } },
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
        scrollbar: {
          ch: ' ',
          style: { bg: 'blue' },
        },
        style: { fg: 'white', bg: 'black' },
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
