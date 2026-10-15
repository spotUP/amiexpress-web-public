"use strict";
/**
 * The requesters.
 *
 * A PETSCII screen is forty columns by twenty-five rows, which is the whole
 * of a C64's glass - so there is nowhere to put a permanent toolbar without
 * taking a row of the art. Everything that is not the canvas appears over it,
 * does its job and goes away. That is the sprite studio's own rule
 * (`Doors/sprite-editor/studio.ts`), and at forty columns it stops being a
 * preference.
 *
 * `screen.dialogOpen` is set HERE, around the await, and nowhere else. A call
 * site only awaits a promise. The fork base carries the scars of the other
 * arrangement: four separate leaks where a new consumer opened a requester
 * and forgot to arm the guard.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.promptText = promptText;
exports.chooseFrom = chooseFrom;
exports.notice = notice;
exports.helpScreen = helpScreen;
exports.confirm = confirm;
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const door_theme_1 = require("./door-theme");
/** A requester never wider than the glass it sits on. */
function requesterWidth(screen, wanted) {
    return Math.min(wanted, Math.max(20, screen.width - 2));
}
/** A centred single-line prompt. Resolves the trimmed value, or null on Escape. */
function promptText(screen, title, initial = '') {
    screen.dialogOpen = true;
    return new Promise((resolve) => {
        const box = new blessed_1.Box({
            parent: screen,
            top: 'center', left: 'center', width: requesterWidth(screen, 38), height: 3,
            label: ` ${title} `,
            tags: true,
            border: { type: 'line' },
            style: { border: { fg: door_theme_1.T.accent }, fg: door_theme_1.T.ink, bg: door_theme_1.T.ground },
        });
        const input = new blessed_1.Textbox({
            parent: box,
            top: 0, left: 1, width: '100%-2', height: 1,
            value: initial,
            mouse: true,
            style: { fg: door_theme_1.T.ink, focus: { fg: door_theme_1.T.accent } },
        });
        const finish = (value) => {
            input.destroy();
            box.destroy();
            screen.dialogOpen = false;
            screen.render();
            resolve(value);
        };
        input.on('submit', (value) => {
            const trimmed = (value ?? '').trim();
            if (!trimmed)
                return; // an empty name is not a name; stay open
            finish(trimmed);
        });
        input.on('cancel', () => finish(null));
        box.setFront();
        input.focus();
        screen.render();
    });
}
/** A list to pick from. Resolves the chosen index, or null on Escape. */
function chooseFrom(screen, title, items) {
    screen.dialogOpen = true;
    return new Promise((resolve) => {
        const height = Math.min(screen.height - 2, Math.max(3, items.length + 2));
        const list = new blessed_1.List({
            parent: screen,
            top: 'center', left: 'center',
            width: requesterWidth(screen, 36), height,
            label: ` ${title} `,
            items: items.length > 0 ? items : ['(nothing here yet)'],
            interactive: items.length > 0,
            keys: true, mouse: true, vi: false,
            border: { type: 'line' },
            style: {
                border: { fg: door_theme_1.T.accent },
                item: { fg: door_theme_1.T.ink },
                selected: { fg: door_theme_1.T.ground, bg: door_theme_1.T.accent },
            },
        });
        const finish = (index) => {
            list.destroy();
            screen.dialogOpen = false;
            screen.render();
            resolve(index);
        };
        list.on('select', (_item, index) => finish(items.length > 0 ? index : null));
        list.key(['escape'], () => finish(null));
        list.setFront();
        list.focus();
        screen.render();
    });
}
/** A message to read and dismiss. */
function notice(screen, title, message) {
    screen.dialogOpen = true;
    return new Promise((resolve) => {
        const box = new blessed_1.Box({
            parent: screen,
            top: 'center', left: 'center',
            width: requesterWidth(screen, 36), height: 5,
            label: ` ${title} `,
            content: message,
            tags: false,
            border: { type: 'line' },
            style: { border: { fg: door_theme_1.T.accent }, fg: door_theme_1.T.ink, bg: door_theme_1.T.ground },
        });
        const finish = () => {
            box.destroy();
            screen.dialogOpen = false;
            screen.render();
            resolve();
        };
        box.key(['escape', 'enter', 'space'], finish);
        box.setFront();
        box.focus();
        screen.render();
    });
}
/**
 * A FULL PAGE OF HELP, which is the first thing this door shows.
 *
 * "petscii edit needs a help screen when it starts" (the sysop, 2026-09-23).
 * Nothing on the canvas says which key draws a corner or picks a colour, and
 * the answer is a C64's own chords rather than anything a caller can guess
 * from an empty screen - so the door opens by saying so, once, and F1 says it
 * again whenever it is asked.
 *
 * It takes the whole glass on purpose: at forty columns a bordered box inside
 * a box would leave thirty-four columns for two columns of key names.
 */
function helpScreen(screen, lines) {
    screen.dialogOpen = true;
    return new Promise((resolve) => {
        const box = new blessed_1.Box({
            parent: screen,
            top: 0, left: 0, width: screen.width, height: screen.height,
            content: lines.join('\n'),
            tags: false,
            style: { fg: door_theme_1.T.ink, bg: door_theme_1.T.ground },
        });
        const finish = () => {
            box.destroy();
            screen.dialogOpen = false;
            screen.render();
            resolve();
        };
        box.key(['escape', 'enter', 'space', 'f1'], finish);
        box.setFront();
        box.focus();
        screen.render();
    });
}
/** A yes/no for something that cannot be taken back. */
function confirm(screen, message) {
    screen.dialogOpen = true;
    return new Promise((resolve) => {
        const finish = (result) => {
            // hide() before destroy(): ConfirmModal traps focus, and Element.hide()
            // is what releases the trap - but only while the widget is not yet
            // destroyed.
            modal.hide();
            modal.destroy();
            screen.dialogOpen = false;
            screen.render();
            resolve(result);
        };
        const modal = new blessed_1.ConfirmModal({
            parent: screen,
            message,
            confirmColor: 'red',
            cancelColor: 'green',
            style: { border: { fg: door_theme_1.T.warn } },
            onConfirm: () => finish(true),
            onCancel: () => finish(false),
        });
        modal.display();
    });
}
