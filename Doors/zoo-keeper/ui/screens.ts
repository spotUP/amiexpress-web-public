/**
 * Zoo Keeper - UI Screens
 * Neo-blessed screen definitions for menus, overlays, and game chrome
 */

import blessed from "@amiexpress/bbs-door-sdk/engines/ui/blessed";
import { ZooKeeperData, HighScore } from "../game/types";
import { MENU_OPTIONS, COLORS } from "../game/constants";

type Screen = ReturnType<typeof blessed.screen>;
type Box = ReturnType<typeof blessed.box>;

/**
 * Screen Manager - handles all UI screens
 */
export class ScreenManager {
  private screen: Screen;
  private parent: Box;
  private activeOverlay: Box | null = null;

  constructor(screen: Screen, parent: Box) {
    this.screen = screen;
    this.parent = parent;
  }

  /**
   * Clear any active overlay
   */
  clearOverlay(): void {
    if (this.activeOverlay) {
      this.activeOverlay.destroy();
      this.activeOverlay = null;
    }
  }

  /**
   * Create title screen with ASCII art logo
   */
  createTitleScreen(menuSelection: number): void {
    this.clearOverlay();

    const content = [
      "{yellow-fg}",
      "  ______   ___    ___   ",
      " |___  /  / _ \\  / _ \\  ",
      "    / /  | | | || | | | ",
      "   / /   | |_| || |_| | ",
      "  / /__   \\___/  \\___/  ",
      " /_____|               ",
      "  _  __                            ",
      " | |/ / ___   ___  _ __   ___  _ __ ",
      " | ' / / _ \\ / _ \\| '_ \\ / _ \\| '__|",
      " | . \\|  __/|  __/| |_) |  __/| |   ",
      " |_|\\_\\\\___| \\___|| .__/ \\___||_|   ",
      "                  |_|              ",
      "{/}",
      "",
      "{white-fg}Classic 1982 Taito Arcade Game{/}",
      "",
    ];

    // Add menu options
    MENU_OPTIONS.forEach((option, index) => {
      const selected = index === menuSelection;
      const prefix = selected ? "{cyan-fg}> " : "{white-fg}  ";
      const suffix = selected ? "{/}" : "{/}";
      content.push(`${prefix}${option}${suffix}`);
    });

    this.activeOverlay = blessed.box({
      parent: this.parent,
      top: "center",
      left: "center",
      width: 50,
      height: content.length + 2,
      fixed: true,
      tags: true,
      border: { type: "line", fg: "yellow" },
      style: {
        fg: "white",
        bg: "black",
      },
      content: content.join("\n"),
    });

    this.screen.render();
  }

  /**
   * Create high scores screen
   */
  createHighscoresScreen(highscores: HighScore[]): void {
    this.clearOverlay();

    const content = [
      "{yellow-fg}HIGH SCORES{/}",
      "",
      "{white-fg}RANK  NAME   SCORE     LEVEL{/}",
      "{gray-fg}----  ----  --------   -----{/}",
    ];

    highscores.slice(0, 10).forEach((score, index) => {
      const rank = (index + 1).toString().padStart(2, " ");
      const name = score.name.padEnd(4, " ");
      const scoreStr = score.score.toString().padStart(8, " ");
      const level = score.level.toString().padStart(2, " ");
      content.push(
        `{cyan-fg}${rank}.{/}   {white-fg}${name}{/}  {yellow-fg}${scoreStr}{/}   {green-fg}${level}{/}`
      );
    });

    content.push("");
    content.push("{gray-fg}Press any key to return{/}");

    this.activeOverlay = blessed.box({
      parent: this.parent,
      top: "center",
      left: "center",
      width: 40,
      height: content.length + 2,
      fixed: true,
      tags: true,
      border: { type: "line", fg: "yellow" },
      style: {
        fg: "white",
        bg: "black",
      },
      content: content.join("\n"),
    });

    this.screen.render();
  }

  /**
   * Create help screen
   */
  createHelpScreen(): void {
    this.clearOverlay();

    const content = [
      "{yellow-fg}HOW TO PLAY{/}",
      "",
      "{cyan-fg}ZOO STAGE:{/}",
      "Run around the perimeter to build walls.",
      "Keep the animals contained inside!",
      "Collect the NET to capture escaped animals.",
      "",
      "{cyan-fg}PLATFORM STAGE:{/}",
      "Jump up the platforms to rescue Zelda!",
      "Avoid the coconuts thrown by the monkey.",
      "",
      "{cyan-fg}STAMPEDE STAGE:{/}",
      "Jump over the charging animals!",
      "Reach the top for an extra life.",
      "",
      "{white-fg}CONTROLS:{/}",
      "Arrow Keys - Move",
      "Space      - Jump",
      "P          - Pause",
      "Q          - Quit",
      "",
      "{gray-fg}Press any key to return{/}",
    ];

    this.activeOverlay = blessed.box({
      parent: this.parent,
      top: "center",
      left: "center",
      width: 50,
      height: content.length + 2,
      fixed: true,
      tags: true,
      border: { type: "line", fg: "cyan" },
      style: {
        fg: "white",
        bg: "black",
      },
      content: content.join("\n"),
    });

    this.screen.render();
  }

  /**
   * Create pause screen overlay
   */
  createPauseScreen(): void {
    this.clearOverlay();

    const content = [
      "{yellow-fg}PAUSED{/}",
      "",
      "{white-fg}Press P to resume{/}",
      "{gray-fg}Press Q to quit{/}",
    ];

    this.activeOverlay = blessed.box({
      parent: this.parent,
      top: "center",
      left: "center",
      width: 30,
      height: content.length + 2,
      fixed: true,
      tags: true,
      border: { type: "line", fg: "yellow" },
      style: {
        fg: "white",
        bg: "black",
      },
      content: content.join("\n"),
    });

    this.screen.render();
  }

  /**
   * Create game over screen
   */
  createGameOverScreen(score: number, level: number): void {
    this.clearOverlay();

    const content = [
      "{red-fg}GAME OVER{/}",
      "",
      `{white-fg}Final Score: {yellow-fg}${score}{/}`,
      `{white-fg}Level Reached: {cyan-fg}${level}{/}`,
      "",
      "{gray-fg}Press ENTER to continue{/}",
    ];

    this.activeOverlay = blessed.box({
      parent: this.parent,
      top: "center",
      left: "center",
      width: 35,
      height: content.length + 2,
      fixed: true,
      tags: true,
      border: { type: "line", fg: "red" },
      style: {
        fg: "white",
        bg: "black",
      },
      content: content.join("\n"),
    });

    this.screen.render();
  }

  /**
   * Create name entry screen for high scores
   */
  createNameEntryScreen(score: number, currentName: string): void {
    this.clearOverlay();

    const displayName = currentName.padEnd(3, "_");

    const content = [
      "{yellow-fg}NEW HIGH SCORE!{/}",
      "",
      `{white-fg}Score: {yellow-fg}${score}{/}`,
      "",
      "{cyan-fg}Enter your initials:{/}",
      "",
      `{white-fg}[ ${displayName} ]{/}`,
      "",
      "{gray-fg}Press ENTER when done{/}",
    ];

    this.activeOverlay = blessed.box({
      parent: this.parent,
      top: "center",
      left: "center",
      width: 35,
      height: content.length + 2,
      fixed: true,
      tags: true,
      border: { type: "line", fg: "yellow" },
      style: {
        fg: "white",
        bg: "black",
      },
      content: content.join("\n"),
    });

    this.screen.render();
  }

  /**
   * Create stage transition screen
   */
  createTransitionScreen(message: string): void {
    this.clearOverlay();

    const content = [
      "",
      `{yellow-fg}${message}{/}`,
      "",
      "{white-fg}GET READY!{/}",
      "",
    ];

    this.activeOverlay = blessed.box({
      parent: this.parent,
      top: "center",
      left: "center",
      width: Math.max(message.length + 10, 30),
      height: content.length + 2,
      fixed: true,
      tags: true,
      border: { type: "line", fg: "cyan" },
      style: {
        fg: "white",
        bg: "black",
      },
      content: content.join("\n"),
    });

    this.screen.render();
  }

  /**
   * Create level complete screen
   */
  createLevelCompleteScreen(
    level: number,
    score: number,
    timeBonus: number
  ): void {
    this.clearOverlay();

    const content = [
      "{green-fg}LEVEL COMPLETE!{/}",
      "",
      `{white-fg}Level: {cyan-fg}${level}{/}`,
      `{white-fg}Score: {yellow-fg}${score}{/}`,
      `{white-fg}Time Bonus: {yellow-fg}+${timeBonus}{/}`,
      "",
      "{gray-fg}Press any key to continue{/}",
    ];

    this.activeOverlay = blessed.box({
      parent: this.parent,
      top: "center",
      left: "center",
      width: 35,
      height: content.length + 2,
      fixed: true,
      tags: true,
      border: { type: "line", fg: "green" },
      style: {
        fg: "white",
        bg: "black",
      },
      content: content.join("\n"),
    });

    this.screen.render();
  }

  /**
   * Create animal legend (shown during gameplay)
   */
  createAnimalLegend(): string {
    return [
      "{gray-fg}Animals:{/}",
      "{gray-fg}E{/}=Elephant {green-fg}S{/}=Snake {yellow-fg}C{/}=Camel",
      "{gray-fg}R{/}=Rhino {yellow-fg}M{/}=Moose {yellow-fg}L{/}=Lion",
    ].join("\n");
  }

  /**
   * Create bonus item legend
   */
  createBonusLegend(): string {
    return [
      "{gray-fg}Bonus:{/}",
      "{yellow-fg}B{/}=Beer {green-fg}C{/}=Clover {green-fg}W{/}=Melon",
      "{white-fg}S{/}=Sundae {red-fg}T{/}=Strawberry {yellow-fg}Y{/}=Trophy",
      "{green-fg}${/}=Money {cyan-fg}N{/}=NET",
    ].join("\n");
  }

  /**
   * Format HUD content
   */
  formatHUD(
    score: number,
    level: number,
    lives: number,
    hasNet: boolean = false
  ): string {
    const scoreStr = score.toString().padStart(8, "0");
    const livesStr = "*".repeat(Math.min(lives, 10));
    const netIndicator = hasNet ? " {magenta-fg}[NET]{/}" : "";

    return `{yellow-fg}SCORE: ${scoreStr}{/}  {cyan-fg}LEVEL: ${level}{/}  {red-fg}LIVES: ${livesStr}{/}${netIndicator}`;
  }

  /**
   * Format footer content based on game state
   */
  formatFooter(state: string): string {
    switch (state) {
      case "menu":
        return "{gray-fg}Up/Down: Select | Enter: Confirm | Q: Quit{/}";
      case "playing":
      case "platform":
      case "stampede":
        return "{gray-fg}Arrow Keys: Move | Space: Jump | P: Pause | Q: Quit{/}";
      case "paused":
        return "{gray-fg}P: Resume | Q: Quit to Menu{/}";
      case "gameover":
      case "enterName":
        return "{gray-fg}Enter: Continue | Esc: Menu{/}";
      default:
        return "{gray-fg}Press any key to continue{/}";
    }
  }
}

/**
 * ASCII Art assets
 */
export const ASCII_ART = {
  // Main logo (compact version)
  logo: [
    "  ______   ___    ___   ",
    " |___  /  / _ \\  / _ \\  ",
    "    / /  | | | || | | | ",
    "   / /   | |_| || |_| | ",
    "  / /__   \\___/  \\___/  ",
    " /_____|               ",
    "  _  __                ",
    " | |/ / ___   ___  _ __",
    " | ' / / _ \\ / _ \\| '__|",
    " | . \\|  __/|  __/| |   ",
    " |_|\\_\\\\___| \\___||_|   ",
  ].join("\n"),

  // Zeke sprite frames
  zeke: {
    right: "@>",
    left: "<@",
    up: "@^",
    down: "@v",
    jump: "@*",
  },

  // Animal sprites
  animals: {
    elephant: "E",
    snake: "S",
    camel: "C",
    rhino: "R",
    moose: "M",
    lion: "L",
  },

  // Tree for platform stage
  tree: [
    "    ^^^^^    ",
    "   *******   ",
    "  *********  ",
    "     |||     ",
    "     |||     ",
    "     |||     ",
  ].join("\n"),

  // Zelda sprite
  zelda: "Z",

  // Monkey sprite
  monkey: "m",

  // Wall thickness characters
  wall: {
    broken: " ",
    weak: ".",
    medium: "+",
    strong: "#",
  },
};
