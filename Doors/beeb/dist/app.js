"use strict";
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
const screen_1 = require("@amiexpress/bbs-door-sdk/teletext/screen");
const library_1 = require("./library");
const ROWS = 22;
class BeebApp {
    constructor(session, startDir) {
        this.titles = [];
        this.roms = { missing: [], mismatched: [] };
        this.at = 0;
        this.top = 0;
        this.running = null;
        this.closed = false;
        this.onEmulatorClosed = () => this.onReturn();
        this.session = session;
        this.startDir = startDir;
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
        if (this.at >= this.top + ROWS)
            this.top = this.at - ROWS + 1;
        this.paint();
    }
    handleKey(ch) {
        if (this.running)
            return; // the surface has the caller; wait for it back
        if (ch === 'q' || ch === 'Q')
            return this.quit();
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
    launchSelected() {
        const title = this.titles[this.at];
        if (!title)
            return;
        this.launch(title, (0, library_1.urlFor)(title));
    }
    launchBare() {
        this.launch(null, (0, library_1.bareUrl)());
    }
    launch(title, url) {
        this.running = title ?? { file: '', name: 'BASIC', kind: 'disc', bytes: 0 };
        this.session.socket.emit('emulator:open', {
            url,
            title: title ? title.name : 'no disc - BASIC',
            machine: 'BBC MICRO',
        });
        this.write(`\x1b[2J\x1b[H\x1b[36mRunning \x1b[1;37m${this.running.name}\x1b[0;36m in the browser.\x1b[0m\r\n\r\n` +
            `Close the emulator to come back here.\r\n`);
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
        out += `\x1b[36m${'-'.repeat(60)}\x1b[0m\r\n`;
        if (this.roms.missing.length > 0) {
            // There is no open-source BBC ROM - Acorn never allowed one - so an
            // unconfigured board is the normal case, and a black screen with no
            // explanation is the unhelpful one.
            out += '\x1b[33mThis board is missing BBC ROMs.\x1b[0m\r\n\r\n';
            out += `Missing from ${short((0, library_1.romsDir)(this.startDir))}:\r\n`;
            for (const name of this.roms.missing)
                out += `  \x1b[31m${name}\x1b[0m\r\n`;
            out += `\r\nThe emulator needs all ${library_1.REQUIRED_ROMS.length}: ${library_1.REQUIRED_ROMS.join(', ')}.\r\n`;
            out += 'They are Acorn copyright and are not shipped with the board.\r\n';
            out += 'See Beeb/README.md.\r\n\r\n';
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
            out += `\r\nThis board emulates a Model B with the 8271 controller,\r\n`;
            out += `so it needs DFS ${library_1.EXPECTED_DFS_VERSION}x. A 2.2x or later DFS is for the\r\n`;
            out += `1770 controller and cannot drive discs here - the machine\r\n`;
            out += `boots, then every disc command fails.\r\n\r\n`;
        }
        if (this.titles.length === 0) {
            out += `No software found in ${short((0, library_1.softwareDir)(this.startDir))}\r\n`;
            out += 'Put .ssd, .dsd or .uef files there and they appear here.\r\n\r\n';
        }
        else {
            const visible = this.titles.slice(this.top, this.top + ROWS);
            visible.forEach((title, row) => {
                const index = this.top + row;
                const chosen = index === this.at;
                const marker = chosen ? '\x1b[1;37m>' : ' ';
                const size = title.bytes > 0 ? `${Math.round(title.bytes / 1024)}K` : '';
                out += `${marker}${String(row + 1).padStart(2)} ${pad(title.name, 40)} ${title.kind === 'tape' ? 'tape' : 'disc'} ${size.padStart(5)}\x1b[0m\r\n`;
            });
            if (this.titles.length > ROWS) {
                out += `\x1b[36m   ${this.titles.length} titles\x1b[0m\r\n`;
            }
            out += '\r\n';
        }
        out += '\x1b[0;44;37m ENTER runs   B for BASIC   Q quits \x1b[0m\r\n';
        this.write(out);
    }
    write(data) {
        this.session.socket.emit('ansi-output', data);
    }
}
exports.BeebApp = BeebApp;
function pad(text, width) {
    return text.length <= width ? text.padEnd(width) : text.slice(0, width - 1) + '.';
}
function short(dir) {
    return dir.length <= 52 ? dir : '...' + dir.slice(-49);
}
//# sourceMappingURL=app.js.map