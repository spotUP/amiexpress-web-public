"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HELP_PART_3 = void 0;
const door_theme_1 = require("../door-theme");
/** Help content part 3: Tips and About */
exports.HELP_PART_3 = `
{bold}{${door_theme_1.T.ok}-fg}--- TIPS ---{/${door_theme_1.T.ok}-fg}{/bold}

{${door_theme_1.T.accentAlt}-fg}*{/${door_theme_1.T.accentAlt}-fg} Use @username to mention someone
{${door_theme_1.T.accentAlt}-fg}*{/${door_theme_1.T.accentAlt}-fg} Use **text** for bold
{${door_theme_1.T.accentAlt}-fg}*{/${door_theme_1.T.accentAlt}-fg} Use *text* for italic
{${door_theme_1.T.accentAlt}-fg}*{/${door_theme_1.T.accentAlt}-fg} Press F2/F3 to maximize chat area
{${door_theme_1.T.accentAlt}-fg}*{/${door_theme_1.T.accentAlt}-fg} Scroll wheel works everywhere
{${door_theme_1.T.accentAlt}-fg}*{/${door_theme_1.T.accentAlt}-fg} Right-click for context menus

{bold}{${door_theme_1.T.ok}-fg}--- ABOUT ---{/${door_theme_1.T.ok}-fg}{/bold}

LiveChat v3.2 is built with neo-blessed,
a full-featured terminal UI library.

Features 25+ widget types including:
- Menu bars, trees, tables
- Dialogs, prompts, questions
- Progress bars, loading spinners
- Checkboxes, radio buttons
- Scrollable text areas
- Drawing canvas (whiteboard)
- File manager browser
- Semi-transparent overlays
- Password input boxes`;
