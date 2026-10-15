"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TEAM_COLORS = exports.FIELD_CELL_COLS = exports.FIELD_CELL_ROWS = exports.FIELD_TOP_ROW = void 0;
exports.matchPage = matchPage;
exports.resultPage = resultPage;
exports.messagePage = messagePage;
/**
 * The match, drawn as a teletext page.
 *
 * Four rows of read-out and twenty rows of battlefield: 40 cells of block
 * graphics at 2x3 pixels each is 80 by 60, which is the whole resolution
 * this game has.
 *
 * Colour costs a cell. A mosaic colour is a spacing attribute, so every
 * change of colour along a row takes a character position with it - which
 * is why teletext pictures have those little gaps in them, and why this
 * draws each row as a few long runs rather than colouring cell by cell.
 * The gap falls on the cell where the run starts, so worms are drawn last
 * and the gap lands on terrain rather than on a worm.
 */
const compose_1 = require("@amiexpress/bbs-door-sdk/teletext/compose");
const physics_1 = require("./physics");
/** The page row the battlefield starts on. Everything above is read-out. */
exports.FIELD_TOP_ROW = 4;
exports.FIELD_CELL_ROWS = physics_1.FIELD_HEIGHT / 3;
exports.FIELD_CELL_COLS = physics_1.FIELD_WIDTH / 2;
exports.TEAM_COLORS = ['red', 'cyan'];
const TERRAIN_COLOR = 'green';
const ARC_COLOR = 'yellow';
const LAYER_COLORS = {
    [1 /* Layer.Terrain */]: TERRAIN_COLOR,
    [2 /* Layer.Arc */]: ARC_COLOR,
    [3 /* Layer.Team0 */]: exports.TEAM_COLORS[0],
    [4 /* Layer.Team1 */]: exports.TEAM_COLORS[1],
};
function matchPage(field, hud) {
    const page = new compose_1.PageBuilder();
    drawHud(page, hud);
    drawField(page, field);
    return page.subpage();
}
function drawHud(page, hud) {
    page.write(0, 0, 'WORMS', { fg: 'yellow' });
    page.write(0, 8, windText(hud.wind), { fg: 'white' });
    hud.teams.forEach((team, at) => {
        const col = at === 0 ? 0 : 20;
        const mine = hud.turn === at;
        page.write(1, col, `${mine ? '>' : ' '}${team.name.slice(0, 6).padEnd(6)}`, {
            fg: exports.TEAM_COLORS[at],
        });
        page.write(1, col + 8, `${String(team.hp).padStart(3)} x${team.worms}`, {
            fg: mine ? 'white' : 'green',
        });
    });
    page.write(2, 0, `ANGLE ${String(hud.angle).padStart(2)}  POWER ${String(hud.power).padStart(2)}  ${hud.facing < 0 ? '<<' : '>>'}`, { fg: 'white' });
    if (hud.message)
        page.write(3, 0, hud.message.slice(0, 39), { fg: 'yellow' });
}
function drawField(page, field) {
    const { terrain } = field;
    // One byte per pixel saying which layer owns it, so the run painter below
    // only has to read one array.
    const layers = new Uint8Array(physics_1.FIELD_WIDTH * physics_1.FIELD_HEIGHT);
    for (let y = 0; y < physics_1.FIELD_HEIGHT; y++) {
        for (let x = 0; x < physics_1.FIELD_WIDTH; x++) {
            if (x < terrain.width && y < terrain.height && terrain.solid[y * terrain.width + x] === 1) {
                layers[y * physics_1.FIELD_WIDTH + x] = 1 /* Layer.Terrain */;
            }
        }
    }
    for (const point of field.arc ?? []) {
        mark(layers, point.x, point.y, 2 /* Layer.Arc */);
    }
    if (field.impact) {
        // A little starburst, so the landing reads as an explosion rather than
        // as the arc simply stopping.
        const { x, y } = field.impact;
        for (const [dx, dy] of [[0, 0], [-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, 1], [-1, 1], [1, -1]]) {
            mark(layers, x + dx, y + dy, 2 /* Layer.Arc */);
        }
    }
    // Worms last: the colour run that carries a worm starts on the cell
    // before it, so the attribute's gap falls on terrain instead of on the
    // worm itself.
    for (const worm of field.worms) {
        if (worm.hp <= 0)
            continue;
        const layer = worm.team === 0 ? 3 /* Layer.Team0 */ : 4 /* Layer.Team1 */;
        mark(layers, worm.x, worm.y, layer);
        mark(layers, worm.x, worm.y - 1, layer);
        mark(layers, worm.x - 1, worm.y, layer);
        mark(layers, worm.x + 1, worm.y, layer);
    }
    for (let cellRow = 0; cellRow < exports.FIELD_CELL_ROWS; cellRow++) {
        paintRow(page, layers, cellRow);
    }
}
function mark(layers, x, y, layer) {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= physics_1.FIELD_WIDTH || py >= physics_1.FIELD_HEIGHT)
        return;
    const at = py * physics_1.FIELD_WIDTH + px;
    if (layers[at] < layer)
        layers[at] = layer;
}
/**
 * One row of the battlefield, as runs of a single colour.
 *
 * A cell's colour is whichever layer is highest anywhere in it, and a run
 * ends when that changes. The attribute sits on the first cell of the run,
 * which is why the cell it replaces is drawn empty.
 */
function paintRow(page, layers, cellRow) {
    const patterns = [];
    const colours = [];
    for (let cellCol = 0; cellCol < exports.FIELD_CELL_COLS; cellCol++) {
        let pattern = 0;
        let top = 0 /* Layer.None */;
        for (let sub = 0; sub < 6; sub++) {
            const x = cellCol * 2 + (sub % 2);
            const y = cellRow * 3 + Math.floor(sub / 2);
            const layer = layers[y * physics_1.FIELD_WIDTH + x];
            if (layer !== 0 /* Layer.None */) {
                pattern |= 1 << sub;
                if (layer > top)
                    top = layer;
            }
        }
        patterns.push(pattern);
        colours.push(top);
    }
    const row = exports.FIELD_TOP_ROW + cellRow;
    let at = 0;
    while (at < exports.FIELD_CELL_COLS) {
        // Empty cells need no colour and no attribute; skip to the next drawn
        // one so a blank sky costs nothing.
        if (colours[at] === 0 /* Layer.None */) {
            at++;
            continue;
        }
        const colour = colours[at];
        let end = at;
        while (end < exports.FIELD_CELL_COLS && (colours[end] === colour || colours[end] === 0 /* Layer.None */))
            end++;
        // The attribute takes the first cell of the run, so start one cell
        // earlier where there is room.
        const start = at > 0 ? at - 1 : at;
        const run = patterns.slice(start + 1, end);
        page.writeMosaic(row, start, run, { fg: LAYER_COLORS[colour] });
        at = end;
    }
}
function windText(wind) {
    if (wind === 0)
        return 'WIND  0';
    const arrows = '<'.repeat(Math.max(0, -wind)) + '>'.repeat(Math.max(0, wind));
    return `WIND ${arrows}`;
}
/** The page shown when a match ends. */
function resultPage(winner, summary) {
    const page = new compose_1.PageBuilder().write(1, 0, winner ? `${winner.slice(0, 12)} WINS` : 'A DRAW', { fg: winner ? 'green' : 'yellow', doubleHeight: true });
    summary.slice(0, 12).forEach((line, at) => page.write(5 + at, 0, line.slice(0, 39), { fg: 'white' }));
    page.write(20, 0, 'SPACE plays again. Q leaves.', { fg: 'green' });
    return page.subpage();
}
/** A plain page, for menus and errors. */
function messagePage(title, lines, color = 'white') {
    const page = new compose_1.PageBuilder().write(1, 0, title.slice(0, 18), { fg: color, doubleHeight: true });
    lines.slice(0, 16).forEach((line, at) => page.write(4 + at, 0, line.slice(0, 39), { fg: 'white' }));
    return page.subpage();
}
//# sourceMappingURL=render.js.map