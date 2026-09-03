"use strict";
/**
 * MISSION mode - the sysop's editor.
 *
 * The reference ships an editor and this door shipped a JSON file, so a
 * sysop who wanted a mission of their own had to leave the board, find the
 * file and know the schema. This is that editor, in the door.
 *
 * Two screens, both lists, because that is what this door already uses:
 * the pack (its missions, plus a row to add one) and one mission (its
 * fields). Cycled fields step with LEFT/RIGHT; typed ones ask.
 *
 * Nothing is written until S. The rules live in core/mission-edit.ts, and
 * every save goes through parseMissionPack (core/mission-store.ts), so the
 * editor cannot produce a pack the game would refuse to load.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.showMissionEditor = showMissionEditor;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const mission_edit_1 = require("../core/mission-edit");
const mission_store_1 = require("../core/mission-store");
/** Ask for one line of text. Resolves null when the sysop backs out. */
function ask(screen, title, current) {
    return new Promise((resolve) => {
        const box = (0, blessed_helpers_1.createBox)({
            parent: screen,
            top: 'center',
            left: 'center',
            width: 52,
            height: 7,
            border: { type: 'line' },
            label: ` ${title} `,
            style: { bg: 'black', border: { fg: 'cyan' } },
            fixed: true,
            tags: true,
            content: `\n {white-fg}Type a value and press ENTER. ESC keeps "${current}".{/white-fg}`,
        });
        const input = screen.program
            ? require('@amiexpress/bbs-door-sdk/engines/ui/blessed').Textbox
            : null;
        const field = new input({
            parent: box,
            bottom: 1,
            left: 2,
            width: 46,
            height: 1,
            inputOnFocus: true,
            style: { bg: 'blue', fg: 'white' },
        });
        const done = (value) => {
            field.destroy();
            box.destroy();
            screen.render();
            resolve(value);
        };
        field.setValue(current);
        field.focus();
        screen.render();
        field.key(['escape'], () => done(null));
        field.on('submit', (value) => done(value ?? ''));
    });
}
/** Tell the sysop something and wait for a key. */
function say(screen, title, message) {
    return new Promise((resolve) => {
        const box = (0, blessed_helpers_1.createBox)({
            parent: screen,
            top: 'center',
            left: 'center',
            width: 56,
            height: 8,
            border: { type: 'line' },
            label: ` ${title} `,
            style: { bg: 'black', border: { fg: 'cyan' } },
            fixed: true,
            tags: true,
            keys: true,
            content: `\n {white-fg}${message}{/white-fg}\n\n {yellow-fg}Any key.{/yellow-fg}`,
        });
        box.focus();
        screen.render();
        box.key(['escape', 'enter', 'return', 'space', 'q'], () => {
            box.destroy();
            screen.render();
            resolve();
        });
    });
}
/** One mission's fields. Returns the edited mission, or null on ESC. */
function editMission(screen, mission) {
    return new Promise((resolve) => {
        let working = { ...mission, modifiers: { ...mission.modifiers } };
        const rows = () => mission_edit_1.MISSION_FIELDS.map((spec) => {
            const value = (0, mission_edit_1.fieldValue)(working, spec.field);
            const arrows = spec.kind === 'choice' ? '<   >' : '     ';
            return ` ${spec.label.padEnd(14, ' ')}${arrows.slice(0, 2)}${value.padEnd(22, ' ')}${arrows.slice(2)}`;
        });
        const box = (0, blessed_helpers_1.createBox)({
            parent: screen,
            top: 'center',
            left: 'center',
            width: 56,
            height: mission_edit_1.MISSION_FIELDS.length + 6,
            border: { type: 'line' },
            label: ` EDIT - ${mission.name} `,
            style: { bg: 'black', border: { fg: 'cyan' } },
            fixed: true,
            tags: true,
        });
        const list = (0, blessed_helpers_1.createList)({
            parent: box,
            top: 1,
            left: 1,
            width: 52,
            height: mission_edit_1.MISSION_FIELDS.length,
            keys: true,
            vi: true,
            mouse: true,
            style: { selected: { bg: 'blue', fg: 'white' }, item: { fg: 'white' } },
            items: rows(),
        });
        const help = (0, blessed_helpers_1.createBox)({
            parent: box,
            bottom: 1,
            left: 1,
            width: 52,
            height: 2,
            tags: true,
            style: { bg: 'black', fg: 'white' },
        });
        const repaint = () => {
            const at = list.selected ?? 0;
            list.setItems(rows());
            list.select(at);
            const spec = mission_edit_1.MISSION_FIELDS[at];
            help.setContent(` {cyan-fg}${spec?.help ?? ''}{/cyan-fg}\n`
                + ` {yellow-fg}LEFT/RIGHT{/yellow-fg} change  {yellow-fg}ENTER{/yellow-fg} type  {yellow-fg}ESC{/yellow-fg} back`);
            screen.render();
        };
        const done = (result) => {
            list.destroy();
            help.destroy();
            box.destroy();
            screen.render();
            resolve(result);
        };
        const step = (direction) => {
            const spec = mission_edit_1.MISSION_FIELDS[list.selected ?? 0];
            if (!spec)
                return true;
            if (spec.kind === 'choice') {
                working = (0, mission_edit_1.cycleField)(working, spec.field, direction);
                repaint();
            }
            // Consumed either way: this List reads LEFT and RIGHT as page-up and
            // page-down, which would throw the highlight across the form.
            return true;
        };
        const type = async () => {
            const spec = mission_edit_1.MISSION_FIELDS[list.selected ?? 0];
            if (!spec)
                return;
            if (spec.kind === 'choice') {
                step(1);
                return;
            }
            const typed = await ask(screen, spec.label, (0, mission_edit_1.fieldValue)(working, spec.field));
            if (typed === null) {
                repaint();
                return;
            }
            const result = (0, mission_edit_1.setField)(working, spec.field, typed);
            if ('error' in result) {
                await say(screen, 'NOT SAVED', result.error);
            }
            else {
                working = result.mission;
            }
            list.focus();
            repaint();
        };
        list.key(['right', 'l'], () => step(1));
        list.key(['left', 'h'], () => step(-1));
        list.on('select', () => { void type(); });
        list.key(['escape', 'q'], () => done(null));
        list.key(['s'], () => done(working));
        list.focus();
        repaint();
    });
}
/**
 * Edit a pack.
 *
 * `pack` is a starting point - the shipped pack is content and is never
 * written to, so a save always produces a sysop pack under the data
 * directory, named after the pack.
 */
async function showMissionEditor(screen, pack, dataDir) {
    // A copy: leaving without saving must leave the pack that is in play alone.
    const working = {
        name: pack.name,
        missions: pack.missions.map((mission) => ({ ...mission, modifiers: { ...mission.modifiers } })),
    };
    const result = {};
    for (;;) {
        const choice = await pickRow(screen, working);
        if (choice === null)
            return result;
        if (choice === 'name') {
            const typed = await ask(screen, 'PACK NAME', working.name);
            if (typed && typed.trim())
                working.name = typed.trim().slice(0, 30);
            continue;
        }
        if (choice === 'add') {
            const created = await editMission(screen, (0, mission_edit_1.blankMission)(working.missions.length));
            if (created)
                working.missions.push(created);
            continue;
        }
        if (choice === 'save') {
            try {
                result.savedTo = (0, mission_store_1.saveSysopPack)(dataDir, working);
                await say(screen, 'SAVED', `Written to ${result.savedTo}.\n Players will see it next time MISSIONS opens.`);
            }
            catch (error) {
                // The loader refused it. Say exactly what it said - the sysop is
                // still here and can fix it.
                await say(screen, 'NOT SAVED', error.message);
            }
            continue;
        }
        if (typeof choice === 'object' && 'remove' in choice) {
            if (working.missions.length <= 1) {
                await say(screen, 'NOT REMOVED', 'A pack needs at least one mission.');
                continue;
            }
            working.missions.splice(choice.remove, 1);
            continue;
        }
        if (typeof choice === 'object' && 'edit' in choice) {
            const edited = await editMission(screen, working.missions[choice.edit]);
            if (edited)
                working.missions[choice.edit] = edited;
        }
    }
}
/** The pack screen: its missions, and what can be done to them. */
function pickRow(screen, pack) {
    return new Promise((resolve) => {
        const rows = [
            ` {cyan-fg}Pack name{/cyan-fg}  ${pack.name}`,
            ...pack.missions.map((mission, index) => ` ${String(index + 1).padStart(2, ' ')}. ${mission.name.padEnd(22, ' ')}`
                + `${mission.objective} ${mission.objective === 'survive' ? '' : mission.norm}`),
            ' {green-fg}+ Add a mission{/green-fg}',
            ' {yellow-fg}S Save this pack{/yellow-fg}',
        ];
        const box = (0, blessed_helpers_1.createBox)({
            parent: screen,
            top: 'center',
            left: 'center',
            width: 56,
            height: Math.min(rows.length, 16) + 5,
            border: { type: 'line' },
            label: ` MISSION EDITOR - ${pack.name} `,
            style: { bg: 'black', border: { fg: 'cyan' } },
            fixed: true,
            tags: true,
        });
        const list = (0, blessed_helpers_1.createList)({
            parent: box,
            top: 1,
            left: 1,
            width: 52,
            height: Math.min(rows.length, 16),
            keys: true,
            vi: true,
            mouse: true,
            tags: true,
            style: { selected: { bg: 'blue', fg: 'white' }, item: { fg: 'white' } },
            items: rows,
        });
        const help = (0, blessed_helpers_1.createBox)({
            parent: box,
            bottom: 1,
            left: 1,
            width: 52,
            height: 1,
            tags: true,
            style: { bg: 'black', fg: 'white' },
            content: ' {yellow-fg}ENTER{/yellow-fg} edit  {yellow-fg}D{/yellow-fg} delete  '
                + '{yellow-fg}S{/yellow-fg} save  {yellow-fg}ESC{/yellow-fg} leave',
        });
        const done = (choice) => {
            list.destroy();
            help.destroy();
            box.destroy();
            screen.render();
            resolve(choice);
        };
        const missionAt = (index) => {
            const at = index - 1; // row 0 is the pack name
            return at >= 0 && at < pack.missions.length ? at : null;
        };
        list.on('select', () => {
            const at = list.selected ?? 0;
            if (at === 0)
                return done('name');
            const mission = missionAt(at);
            if (mission !== null)
                return done({ edit: mission });
            if (at === pack.missions.length + 1)
                return done('add');
            return done('save');
        });
        list.key(['d'], () => {
            const mission = missionAt(list.selected ?? 0);
            if (mission !== null)
                done({ remove: mission });
        });
        list.key(['s'], () => done('save'));
        list.key(['escape', 'q'], () => done(null));
        list.focus();
        screen.render();
    });
}
//# sourceMappingURL=mission-editor.js.map