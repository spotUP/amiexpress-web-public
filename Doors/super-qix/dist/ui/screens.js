/**
 * Super Qix - UI Screens
 * Neo-blessed screen definitions for menus, overlays, and game chrome
 */
import blessed from "@amiexpress/bbs-door-sdk/engines/ui/blessed";
import { MENU_OPTIONS } from "../game/constants";
/**
 * Screen Manager - handles all UI screens
 */
export class ScreenManager {
    constructor(screen, parent) {
        this.activeOverlay = null;
        this.screen = screen;
        this.parent = parent;
    }
    clearOverlay() {
        if (this.activeOverlay) {
            this.activeOverlay.destroy();
            this.activeOverlay = null;
        }
    }
    createTitleScreen(menuSelection) {
        this.clearOverlay();
        const content = [
            "{magenta-fg}",
            "   ____  _   _ ____  _____ ____  ",
            "  / ___|| | | |  _ \\| ____|  _ \\ ",
            "  \\___ \\| | | | |_) |  _| | |_) |",
            "   ___) | |_| |  __/| |___|  _ < ",
            "  |____/ \\___/|_|   |_____|_| \\_\\",
            "         ___  _____  __",
            "        / _ \\|_ _\\ \\/ /",
            "       | | | || | \\  / ",
            "       | |_| || | /  \\ ",
            "        \\__\\_\\___/_/\\_\\",
            "{/}",
            "",
            "{white-fg}Classic 1987 Taito Arcade Game{/}",
            "",
        ];
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
            width: 45,
            height: content.length + 2,
            tags: true,
            border: { type: "line", fg: "magenta" },
            style: {
                fg: "white",
                bg: "black",
                // focus: { border: { fg: 'cyan' } },
                // hover: { border: { fg: 'cyan' } }
            },
            content: content.join("\n"),
        });
        this.screen.render();
    }
    createHighscoresScreen(highscores) {
        this.clearOverlay();
        const content = [
            "{yellow-fg}HIGH SCORES{/}",
            "",
            "{white-fg}RANK  NAME   SCORE     LVL  MAX%{/}",
            "{gray-fg}----  ----  --------   ---  ----{/}",
        ];
        highscores.slice(0, 10).forEach((score, index) => {
            const rank = (index + 1).toString().padStart(2, " ");
            const name = score.name.padEnd(4, " ");
            const scoreStr = score.score.toString().padStart(8, " ");
            const level = score.level.toString().padStart(2, " ");
            const percent = (score.maxPercent || 75).toString().padStart(3, " ");
            content.push(`{cyan-fg}${rank}.{/}   {white-fg}${name}{/}  {yellow-fg}${scoreStr}{/}   {green-fg}${level}{/}  {magenta-fg}${percent}%{/}`);
        });
        content.push("");
        content.push("{gray-fg}Press any key to return{/}");
        this.activeOverlay = blessed.box({
            parent: this.parent,
            top: "center",
            left: "center",
            width: 45,
            height: content.length + 2,
            tags: true,
            border: { type: "line", fg: "yellow" },
            style: {
                fg: "white",
                bg: "black",
                // focus: { border: { fg: 'cyan' } },
                // hover: { border: { fg: 'cyan' } }
            },
            content: content.join("\n"),
        });
        this.screen.render();
    }
    createHelpScreen() {
        this.clearOverlay();
        const content = [
            "{yellow-fg}HOW TO PLAY{/}",
            "",
            "{cyan-fg}OBJECTIVE:{/}",
            "Claim 75%+ of the playfield by drawing",
            "lines that enclose areas without the Qix.",
            "",
            "{cyan-fg}ENEMIES:{/}",
            "{magenta-fg}*{/} Qix - Bounces in unclaimed area",
            "{red-fg}+{/} Sparx - Patrols the borders",
            "{yellow-fg}~{/} Fuse - Burns if you stop drawing",
            "",
            "{cyan-fg}POWER-UPS:{/}",
            "S=Speed, H=Shield, F=Freeze, W=Warp",
            "Letters spell word for auto-complete!",
            "",
            "{white-fg}CONTROLS:{/}",
            "Arrow Keys - Move marker",
            "Z          - Slow Draw (2x points)",
            "X          - Fast Draw",
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
            tags: true,
            border: { type: "line", fg: "cyan" },
            style: {
                fg: "white",
                bg: "black",
                // focus: { border: { fg: 'yellow' } },
                // hover: { border: { fg: 'yellow' } }
            },
            content: content.join("\n"),
        });
        this.screen.render();
    }
    createPauseScreen() {
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
            tags: true,
            border: { type: "line", fg: "yellow" },
            style: {
                fg: "white",
                bg: "black",
                // focus: { border: { fg: 'cyan' } },
                // hover: { border: { fg: 'cyan' } }
            },
            content: content.join("\n"),
        });
        this.screen.render();
    }
    createGameOverScreen(score, level, maxPercent) {
        this.clearOverlay();
        const content = [
            "{red-fg}GAME OVER{/}",
            "",
            `{white-fg}Final Score: {yellow-fg}${score}{/}`,
            `{white-fg}Level Reached: {cyan-fg}${level}{/}`,
            `{white-fg}Max Claimed: {green-fg}${maxPercent}%{/}`,
            "",
            "{gray-fg}Press ENTER to continue{/}",
        ];
        this.activeOverlay = blessed.box({
            parent: this.parent,
            top: "center",
            left: "center",
            width: 35,
            height: content.length + 2,
            tags: true,
            border: { type: "line", fg: "red" },
            style: {
                fg: "white",
                bg: "black",
                // focus: { border: { fg: 'cyan' } },
                // hover: { border: { fg: 'cyan' } }
            },
            content: content.join("\n"),
        });
        this.screen.render();
    }
    createNameEntryScreen(score, level, currentName) {
        this.clearOverlay();
        const displayName = currentName.padEnd(3, "_");
        const content = [
            "{yellow-fg}NEW HIGH SCORE!{/}",
            "",
            `{white-fg}Score: {yellow-fg}${score}{/}`,
            `{white-fg}Level: {cyan-fg}${level}{/}`,
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
            tags: true,
            border: { type: "line", fg: "yellow" },
            style: {
                fg: "white",
                bg: "black",
                // focus: { border: { fg: 'cyan' } },
                // hover: { border: { fg: 'cyan' } }
            },
            content: content.join("\n"),
        });
        this.screen.render();
    }
    createLevelCompleteScreen(level, score, percent, bonus) {
        this.clearOverlay();
        const content = [
            "{green-fg}LEVEL COMPLETE!{/}",
            "",
            `{white-fg}Level: {cyan-fg}${level}{/}`,
            `{white-fg}Claimed: {green-fg}${percent}%{/}`,
            `{white-fg}Score: {yellow-fg}${score}{/}`,
            `{white-fg}Bonus: {yellow-fg}+${bonus}{/}`,
            "",
            "{gray-fg}Press any key to continue{/}",
        ];
        this.activeOverlay = blessed.box({
            parent: this.parent,
            top: "center",
            left: "center",
            width: 35,
            height: content.length + 2,
            tags: true,
            border: { type: "line", fg: "green" },
            style: {
                fg: "white",
                bg: "black",
                // focus: { border: { fg: 'cyan' } },
                // hover: { border: { fg: 'cyan' } }
            },
            content: content.join("\n"),
        });
        this.screen.render();
    }
    formatHUD(score, level, lives, percent, effects) {
        const scoreStr = score.toString().padStart(8, "0");
        const livesStr = "*".repeat(Math.min(lives, 10));
        const percentStr = Math.floor(percent).toString().padStart(2, " ");
        let hud = `{yellow-fg}SCORE: ${scoreStr}{/}  {cyan-fg}LVL: ${level}{/}  {green-fg}CLAIMED: ${percentStr}%{/}  {red-fg}LIVES: ${livesStr}{/}`;
        for (const effect of effects) {
            hud += `  {magenta-fg}[${effect}]{/}`;
        }
        return hud;
    }
    formatFooter(state, letterDisplay = "") {
        let controls = "";
        switch (state) {
            case "menu":
                controls = "{gray-fg}Up/Down: Select | Enter: Confirm | Q: Quit{/}";
                break;
            case "playing":
                controls =
                    "{gray-fg}Arrows: Move | Z: Slow Draw | X: Fast Draw | P: Pause | Q: Quit{/}";
                break;
            case "paused":
                controls = "{gray-fg}P: Resume | Q: Quit to Menu{/}";
                break;
            case "gameover":
            case "enterName":
                controls = "{gray-fg}Enter: Continue | Esc: Menu{/}";
                break;
            default:
                controls = "{gray-fg}Press any key to continue{/}";
        }
        if (letterDisplay) {
            controls += `  {green-fg}Letters: ${letterDisplay}{/}`;
        }
        return controls;
    }
}
/**
 * ASCII Art assets
 */
export const ASCII_ART = {
    logo: [
        "   ____  _   _ ____  _____ ____  ",
        "  / ___|| | | |  _ \\| ____|  _ \\ ",
        "  \\___ \\| | | | |_) |  _| | |_) |",
        "   ___) | |_| |  __/| |___|  _ < ",
        "  |____/ \\___/|_|   |_____|_| \\_\\",
        "         ___  _____  __",
        "        / _ \\|_ _\\ \\/ /",
        "       | | | || | \\  / ",
        "       | |_| || | /  \\ ",
        "        \\__\\_\\___/_/\\_\\",
    ].join("\n"),
    marker: "@",
    qix: "*",
    sparx: "+",
    superSparx: "X",
    fuse: "~",
    border: "#",
    unclaimed: ".",
    claimed: " ",
    stixFast: "-",
    stixSlow: "=",
};
