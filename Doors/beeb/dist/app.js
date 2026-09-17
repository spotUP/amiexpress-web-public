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
exports.BeebApp = void 0;
/**
 * BEEB - pick something off the board and run it on a BBC Micro.
 *
 * The door itself is an ordinary character-cell list. The emulator is not:
 * a BBC Micro in MODE 1 is a 320x256 bitmap, and no arrangement of
 * character cells is that. So when a caller picks a title the door asks the
 * browser for a real surface (`emulator:open`) and waits for it to come
 * back (`emulator:closed`).
 *
 * The board refuses this door to a caller who has no browser before any of
 * this runs - CLIENT_ONLY in the .info, handled by door-min-columns.util -
 * so there is no capability check here to drift out of step with that one.
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const screen_1 = require("@amiexpress/bbs-door-sdk/teletext/screen");
const rom_proof_1 = require("@amiexpress/bbs-door-sdk/beeb/rom-proof");
const proof_store_1 = require("@amiexpress/bbs-door-sdk/beeb/proof-store");
const library_1 = require("./library");
/**
 * What the caller's screen can hold, not what this door assumed.
 *
 * A teletext session is 40 columns; an ANSI one is usually 80. This door
 * drew a 60-character rule and a 40-character name column either way, so
 * every row wrapped on a teletext screen and the listing came apart.
 */
const NARROWEST = 40;
/** marker, index, the two gaps, the kind and the size columns. */
const FIXED_COLUMNS = 15;
class BeebApp {
    constructor(session, startDir, proofFile) {
        this.titles = [];
        this.roms = { missing: [], mismatched: [] };
        this.at = 0;
        this.top = 0;
        /** An upload is being taken and checked; keys wait. */
        this.busy = false;
        /** One line of feedback over the listing. */
        this.message = '';
        this.running = null;
        this.closed = false;
        this.onEmulatorClosed = () => this.onReturn();
        this.session = session;
        this.startDir = startDir;
        this.proofPath = proofFile ?? path.join(__dirname, '..', 'data', 'proven.json');
        // The board tells a door how wide the caller's screen is. A teletext
        // session reports 40, and everything below is laid out from it.
        const declaredWidth = Number(session.bbsSession?.screenWidth);
        this.width = Number.isFinite(declaredWidth) && declaredWidth >= NARROWEST
            ? Math.min(declaredWidth, 80)
            : 80;
        const declaredRows = Number(session.bbsSession?.screenHeight);
        const height = Number.isFinite(declaredRows) && declaredRows >= 10 ? declaredRows : 24;
        this.rows = Math.max(6, height - 8);
        this.keys = new screen_1.KeyStream({
            key: ch => this.handleKey(ch),
            escape: () => this.quit(),
            arrow: direction => this.onArrow(direction),
        });
    }
    start() {
        this.titles = (0, library_1.listTitles)(this.startDir);
        this.roms = (0, library_1.checkRoms)(this.startDir);
        this.session.socket.on('emulator:closed', this.onEmulatorClosed);
        this.paint();
    }
    stop() {
        this.closed = true;
        this.keys.dispose();
        this.session.socket.off?.('emulator:closed', this.onEmulatorClosed);
        // A surface left open would outlive the door.
        if (this.running)
            this.session.socket.emit('emulator:close');
        this.write('\x1b[?25h\x1b[0m\r\n');
    }
    handleInput(data) {
        if (!this.closed)
            this.keys.feed(data);
    }
    // --- Keys -------------------------------------------------------------
    onArrow(direction) {
        if (this.running || this.titles.length === 0)
            return;
        if (direction === 'up')
            this.at = Math.max(0, this.at - 1);
        if (direction === 'down')
            this.at = Math.min(this.titles.length - 1, this.at + 1);
        if (this.at < this.top)
            this.top = this.at;
        if (this.at >= this.top + this.rows)
            this.top = this.at - this.rows + 1;
        this.paint();
    }
    handleKey(ch) {
        if (this.busy)
            return; // an upload is being checked; one at a time
        if (this.running)
            return; // the surface has the caller; wait for it back
        if (ch === 'q' || ch === 'Q')
            return this.quit();
        if (ch === 'u' || ch === 'U')
            return void this.proveRoms();
        if (ch === 'b' || ch === 'B')
            return this.launchBare();
        if (ch === '\r' || ch === '\n')
            return this.launchSelected();
        if (ch >= '1' && ch <= '9') {
            const index = this.top + Number(ch) - 1;
            if (index < this.titles.length) {
                this.at = index;
                this.launchSelected();
            }
        }
    }
    // --- Running ----------------------------------------------------------
    /** Has THIS caller shown a copy of the ROMs? */
    proved() {
        return (0, proof_store_1.hasProved)(this.proofPath, this.session.user?.id);
    }
    /**
     * Ask the caller to show their own copy of the ROMs.
     *
     * The board holds one copy and ships none - Acorn's ROMs are not ours to
     * hand out - so everybody shows theirs once, the sysop included. The
     * upload is read, checked and deleted; what is kept is the fact that they
     * showed it.
     */
    async proveRoms() {
        const ask = this.session.bbs?.requestArchiveUpload;
        if (!ask) {
            this.notice('This board cannot take an upload from here.');
            return false;
        }
        this.busy = true;
        this.write(`\x1b[2J\x1b[H\x1b[1;37mYOUR OWN ROMS\x1b[0m\r\n\r\n` +
            `This board keeps one copy of the BBC ROMs and\r\n` +
            `gives out none. Show a copy of your own once\r\n` +
            `and the machine is yours from then on.\r\n\r\n` +
            `Send a .zip holding:\r\n` +
            library_1.REQUIRED_ROMS.map((rom) => `  ${rom}\r\n`).join('') +
            `\r\nThe file is checked and then deleted.\r\n`);
        let uploaded = null;
        try {
            uploaded = await ask.call(this.session.bbs);
            const result = (0, rom_proof_1.verifyRomArchive)(uploaded.path, (0, library_1.romsDir)(this.startDir));
            if (!result.proven) {
                const why = [
                    ...result.missing.map(rom => `missing ${rom}`),
                    ...result.problems,
                ].slice(0, 4);
                this.busy = false;
                this.notice(`Not accepted: ${why.join('; ')}`);
                return false;
            }
            (0, proof_store_1.recordProof)(this.proofPath, String(this.session.user?.id ?? ''), {
                at: new Date().toISOString(),
                seeded: result.seeded || undefined,
            });
            this.busy = false;
            this.notice(result.seeded
                ? 'Accepted - and yours are now the board\u2019s copy.'
                : 'Accepted. The BBC Micro is yours.');
            return true;
        }
        catch (error) {
            this.busy = false;
            this.notice(`Upload stopped: ${error.message}`);
            return false;
        }
        finally {
            // Never kept, whatever happened.
            if (uploaded) {
                try {
                    fs.unlinkSync(uploaded.path);
                }
                catch { /* already gone */ }
            }
        }
    }
    /** A one-line message over the listing. */
    notice(text) {
        this.message = text;
        this.paint();
    }
    launchSelected() {
        const title = this.titles[this.at];
        if (!title)
            return;
        void this.launch(title);
    }
    launchBare() {
        void this.launch(null);
    }
    async launch(title) {
        // Nobody reaches the machine without having shown the ROMs first.
        if (!this.proved() && !(await this.proveRoms()))
            return;
        const token = this.session.bbs?.grantBeebRomAccess?.();
        const url = title ? (0, library_1.urlFor)(title, { token }) : (0, library_1.bareUrl)(token);
        this.running = title ?? { file: '', name: 'BASIC', kind: 'disc', bytes: 0 };
        this.session.socket.emit('emulator:open', {
            url,
            title: title ? title.name : 'no disc - BASIC',
            machine: 'BBC MICRO',
        });
        this.write(`\x1b[2J\x1b[H\x1b[36mRunning \x1b[1;37m${this.running.name}\x1b[0;36m in the browser.\x1b[0m\r\n\r\n` +
            `Press SHIFT+ESC to come back here.\r\n`);
    }
    onReturn() {
        if (this.closed)
            return;
        this.running = null;
        this.paint();
    }
    quit() {
        this.stop();
        this.session.close();
    }
    // --- Painting ---------------------------------------------------------
    paint() {
        let out = '\x1b[2J\x1b[H\x1b[?25l';
        out += '\x1b[1;37mBBC MICRO\x1b[0m\r\n';
        out += `\x1b[36m${'-'.repeat(this.width)}\x1b[0m\r\n`;
        if (this.roms.missing.length > 0) {
            // There is no open-source BBC ROM - Acorn never allowed one - so an
            // unconfigured board is the normal case, and a black screen with no
            // explanation is the unhelpful one.
            out += '\x1b[33mThis board is missing BBC ROMs.\x1b[0m\r\n\r\n';
            out += `Missing from ${short((0, library_1.romsDir)(this.startDir), this.width)}:\r\n`;
            for (const name of this.roms.missing)
                out += `  \x1b[31m${name}\x1b[0m\r\n`;
            out += '\r\n';
            for (const row of wrap(`The emulator needs all ${library_1.REQUIRED_ROMS.length}: ${library_1.REQUIRED_ROMS.join(', ')}. ` +
                'They are Acorn copyright and are not shipped with the board. See Beeb/README.md.', this.width))
                out += `${row}\r\n`;
            out += '\r\n';
        }
        if (this.roms.mismatched.length > 0) {
            // A ROM filed under the wrong name boots to BASIC and then cannot
            // read a disc - the error the caller sees is "File not found", which
            // points at nothing useful.
            out += '\x1b[33mA ROM is not what its filename says.\x1b[0m\r\n\r\n';
            for (const bad of this.roms.mismatched) {
                out += `  ${bad.file}\r\n`;
                out += `    expected \x1b[36m${bad.expected}\x1b[0m, the file says \x1b[31m${bad.found}\x1b[0m\r\n`;
            }
            out += '\r\n';
            for (const row of wrap(`This board emulates a Model B with the 8271 controller, so it needs DFS ` +
                `${library_1.EXPECTED_DFS_VERSION}x. A 2.2x or later DFS is for the 1770 controller and ` +
                'cannot drive discs here - the machine boots, then every disc command fails.', this.width))
                out += `${row}\r\n`;
            out += '\r\n';
        }
        if (this.titles.length === 0) {
            out += `No software found in ${short((0, library_1.softwareDir)(this.startDir), this.width)}\r\n`;
            for (const row of wrap('Put .ssd, .dsd or .uef files there and they appear here.', this.width)) {
                out += `${row}\r\n`;
            }
            out += '\r\n';
        }
        else {
            const visible = this.titles.slice(this.top, this.top + this.rows);
            visible.forEach((title, row) => {
                const index = this.top + row;
                const chosen = index === this.at;
                const marker = chosen ? '\x1b[1;37m>' : ' ';
                const size = title.bytes > 0 ? `${Math.round(title.bytes / 1024)}K` : '';
                const nameWidth = Math.max(8, this.width - FIXED_COLUMNS);
                out += `${marker}${String(row + 1).padStart(2)} ${pad(title.name, nameWidth)} ${title.kind === 'tape' ? 'tape' : 'disc'} ${size.padStart(5)}\x1b[0m\r\n`;
            });
            if (this.titles.length > this.rows) {
                out += `\x1b[36m   ${this.titles.length} titles\x1b[0m\r\n`;
            }
            out += '\r\n';
        }
        if (this.message) {
            out += `\x1b[1;33m${(0, screen_1.fit)(this.message, this.width)}\x1b[0m\r\n`;
            this.message = '';
        }
        // Saying it plainly beats a caller pressing ENTER and being asked for a
        // file they were not expecting to need.
        const proved = this.proved();
        const bar = this.width >= 60
            ? proved
                ? ' ENTER runs   B for BASIC   Q quits '
                : ' ENTER runs (shows your ROMs first)   U uploads   Q quits '
            : proved
                ? ' ENTER=run  B=BASIC  Q=quit '
                : ' ENTER=run  U=your ROMs  Q=quit ';
        out += `\x1b[0;44;37m${bar}\x1b[0m\r\n`;
        this.write(out);
    }
    write(data) {
        this.session.socket.emit('ansi-output', data);
    }
}
exports.BeebApp = BeebApp;
function pad(text, width) {
    return text.length <= width ? text.padEnd(width) : text.slice(0, Math.max(0, width - 1)) + '.';
}
/**
 * Break prose to the caller's width.
 *
 * The setup screen's sentences were written to look right at 80 columns
 * and were 59 characters long, so on a 40-column teletext session the one
 * screen a new board always shows was the one that wrapped.
 */
function wrap(text, width) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
        if (!line)
            line = word;
        else if (line.length + 1 + word.length <= width)
            line += ` ${word}`;
        else {
            lines.push(line);
            line = word;
        }
    }
    if (line)
        lines.push(line);
    return lines;
}
/** A path, cut from the FRONT: the end of it is the part worth reading. */
function short(dir, width) {
    const room = Math.max(8, width - 14);
    return dir.length <= room ? dir : '...' + dir.slice(-(room - 3));
}
//# sourceMappingURL=app.js.map