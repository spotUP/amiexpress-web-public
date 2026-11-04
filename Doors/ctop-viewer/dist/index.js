"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
/**
 * CTOP - Conference Top Uploaders, ported from Conftop-II.
 *
 * The Amiga door is `Doors/Conftop/ctop`, a 68K binary by REbEL/QTX whose
 * source is in `~/Code/Reference/AmiExpressEDoorSources/
 * Conftop-II/ctop.e`. It was served to a C64 caller through the board's frame
 * adapter, which takes an eighty-column screen apart row by row - and a table
 * IS its columns, so what a C64 got was not a table. The sysop asked for the
 * same treatment GL got: "so it should be fixed like we did with the others
 * add a proper c64 view to conftop" (2026-09-22).
 *
 * THREE SCREENS, as every door on this board owes:
 *   80 columns - byte for byte what the 68K painted, pinned to a capture of
 *                the real binary (`tests/doors/ctop`)
 *   wider      - the same table with the surplus spent on the two fields the
 *                Amiga was cutting off, the handle and the location
 *   40 columns - its own layout: rank, handle, files, bytes, and a footer
 *                that keeps both record holders
 *
 * AND THE PERIOD STILL ROLLS. The 68K door is the only thing on this board
 * that ends a week and names its winner, so the port carries that too - see
 * `src/reset.ts`, which is why this is a port and not a viewer.
 */
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const path = __importStar(require("path"));
const art_1 = require("./src/art");
const settings_1 = require("./src/settings");
const reset_1 = require("./src/reset");
const narrow_1 = require("./src/narrow");
const wide_1 = require("./src/wide");
const ctop_data_1 = require("@amiexpress/bbs-door-sdk/formats/ctop-data");
exports.metadata = {
    name: 'Conference Top Uploaders',
    version: '1.0.0',
    description: 'The conference upload table, drawn for 40, 80 and wider screens',
    author: 'REbEL/QTX (Amiga), ported to TypeScript',
    command: 'CTOP',
};
/** This door's own directory, for a `Conftop.header` the sysop put beside it. */
const DOOR_ROOT = __dirname;
/** The caller's screen, as the board's one width source reports it. */
function columnsOf(ctx) {
    const session = ctx.bbsSession;
    const width = Number(session?.screenWidth ?? 80);
    return Number.isFinite(width) && width > 0 ? width : 80;
}
/** How many rows the caller's screen has. */
function rowsOf(ctx) {
    const session = ctx.bbsSession;
    const rows = Number(session?.screenHeight ?? 25);
    return Number.isFinite(rows) && rows > 0 ? rows : 25;
}
/** The conference this caller is in, and what the board calls it. */
function conferenceOf(ctx) {
    const session = ctx.bbsSession;
    return {
        number: Number(session?.currentConf ?? 1) || 1,
        name: session?.currentConfName ?? '',
    };
}
/**
 * The table as text, for the mail and the bulletin.
 *
 * Eighty columns without the pens: a message read in the editor, or a
 * bulletin a sysop may open in a text editor, has no use for them.
 */
function plainTable(screen) {
    return (0, wide_1.renderWideTable)(screen, true, 80)
        .map(line => line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ''))
        .join('\n');
}
const door = new bbs_door_sdk_1.ServerDoor(exports.metadata);
door.onStart(async (ctx) => {
    const { socket, bbs } = ctx;
    if (!socket) {
        console.error('[ctop] Socket missing from context');
        return;
    }
    const write = (line) => { socket.emit('ansi-output', line + '\r\n'); };
    try {
        if (!bbs?.getConferencePath || !bbs.readTooltypes) {
            write('\x1b[31mThis board cannot tell the door which conference it is in.\x1b[0m');
            return;
        }
        const conference = conferenceOf(ctx);
        const conferenceDir = bbs.getConferencePath(conference.number);
        const settings = (0, settings_1.loadCtopSettings)((candidate) => {
            const tooltypes = bbs.readTooltypes(candidate);
            return Object.keys(tooltypes).length > 0 ? tooltypes : null;
        }, conferenceDir);
        if (!settings.installed) {
            // Exactly what the Amiga door says, and for the same reason: no
            // `Conftop.info` in the conference means the sysop has not put the
            // table here (ctop.e:1136).
            write('Conference Top Uploaders is not installed in this conference.');
            return;
        }
        const columns = columnsOf(ctx);
        const narrow = columns <= narrow_1.NARROW_WIDTH;
        const dataPath = path.join(conferenceDir, settings.dataFile);
        const today = (0, ctop_data_1.toAmigaDays)(new Date());
        if ((0, reset_1.resetIsDue)(dataPath, today)) {
            write((0, reset_1.readCtopFile)(dataPath) ? 'Resetting Conference Top Uploaders...' : 'Creating datafile...');
            const outcome = (0, reset_1.performReset)(conferenceDir, settings.dataFile, settings.schedule, today);
            /*
             * The final table goes out before the slate is wiped from the screen's
             * point of view: the mail and the bulletin describe the period that
             * ENDED, which is the one nobody can read off the file any more.
             */
            const ended = {
                period: outcome.ended,
                conferenceName: settings.conferenceName || conference.name,
                today,
                rows: settings.rows,
                skipEmpty: settings.skipEmpty,
                minLimit: settings.minLimit,
                showResetDate: settings.showResetDate,
            };
            if (settings.mailUser) {
                write(`Sending message to: (${settings.mailUser})`);
                await bbs.sendMessage(settings.mailUser, settings.subject, plainTable(ended));
            }
            if (settings.bullFile) {
                // `BBS:Bulletins/bull7.txt` is a board-relative path with a volume
                // name on it; the board's own writer takes it from there.
                const bulletin = settings.bullFile.replace(/^[A-Za-z0-9_]+:/, '');
                write(`Writing bulletin to: (${settings.bullFile})`);
                await bbs.writeFile(bulletin, plainTable(ended));
            }
        }
        const data = (0, reset_1.readCtopFile)(dataPath)
            ?? (0, ctop_data_1.aggregateCtop)((0, ctop_data_1.decodeCtopHeader)(Buffer.alloc(96)), []);
        const screen = {
            period: data,
            conferenceName: settings.conferenceName || conference.name,
            today,
            rows: settings.rows,
            skipEmpty: settings.skipEmpty,
            minLimit: settings.minLimit,
            showResetDate: settings.showResetDate,
        };
        const art = (0, art_1.loadCtopArt)([conferenceDir, DOOR_ROOT], narrow) ?? art_1.NO_ART;
        const lines = narrow
            ? (0, narrow_1.renderNarrowScreen)(screen, art, rowsOf(ctx))
            : (0, wide_1.renderWideScreen)(screen, art, columns);
        /*
         * ONE WRITE. Every line is already built to the caller's width, so the
         * screen goes out as a single emit rather than one per row - a forty-
         * column caller on a modem reads the difference.
         */
        socket.emit('ansi-output', lines.map(line => line + '\r\n').join(''));
    }
    catch (error) {
        write(`\x1b[31mCTOP: ${error.message}\x1b[0m`);
    }
});
exports.default = door;
//# sourceMappingURL=index.js.map