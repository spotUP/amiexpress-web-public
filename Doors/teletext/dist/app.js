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
exports.TeletextApp = void 0;
/**
 * The teletext browser: pick a service, then browse it by page number.
 *
 * Painted as raw ANSI rather than through blessed, because a teletext page
 * is an exact 40x25 grid that the SDK already renders - a widget tree on top
 * of that would only be in the way.
 *
 * Almost nothing here is about teletext. The packet engine, the page graph,
 * the per-session renderer, the screen and the key reader all live in
 * sdk/teletext; this file is the caller's end of it - which key does what,
 * which view is up, and when the carousel turns.
 */
const store_1 = require("@amiexpress/bbs-door-sdk/teletext/store");
const screen_1 = require("@amiexpress/bbs-door-sdk/teletext/screen");
const library_1 = require("@amiexpress/bbs-door-sdk/teletext/library");
const telesoftware_1 = require("@amiexpress/bbs-door-sdk/teletext/telesoftware");
const emulator_url_1 = require("@amiexpress/bbs-door-sdk/beeb/emulator-url");
const proof_store_1 = require("@amiexpress/bbs-door-sdk/beeb/proof-store");
const path = __importStar(require("path"));
const settings_1 = require("./settings");
/**
 * Where the BEEB door records who has shown their ROMs.
 *
 * Read from here rather than duplicated: one record, one answer, whichever
 * door the caller came through.
 */
function beebProofFile() {
    return path.join(__dirname, '..', 'beeb', 'data', 'proven.json');
}
class TeletextApp {
    /**
     * @param root Which Teletext directory to browse. The door leaves this
     *   alone and gets the board's; a test passes its own, because a test
     *   that reads whatever packs happen to be installed is a test that
     *   breaks the day a sysop installs one.
     */
    constructor(session, root, proofFile) {
        this.services = [];
        /**
         * What the caller has typed to narrow the list.
         *
         * A board with the restoration archive installed has over a thousand
         * service packs on it - one per recovered broadcast day - and a flat
         * list of nineteen rows with no way down is no use at all. Typing
         * narrows; the arrows walk what is left.
         */
        this.pickerFilter = '';
        /** First row of the list that is on screen. */
        this.pickerTop = 0;
        this.loaded = null;
        this.view = 'picker';
        this.pickerAt = 0;
        this.page = 0x100;
        this.subpage = 0;
        this.reveal = false;
        this.held = false;
        this.digits = '';
        this.notice = '';
        this.carousel = null;
        this.closed = false;
        /** The program running on the board's BBC Micro, while one is. */
        this.running = null;
        this.onEmulatorClosed = () => this.onEmulatorReturn();
        this.session = session;
        this.root = root;
        this.beebProof = proofFile ?? beebProofFile();
        this.settings = (0, settings_1.loadSettings)();
        // The board tells a door which screen the caller chose. A teletext
        // session gets DECDHL and real sextants; everyone else gets the
        // approximation, because their font has no block graphics in it.
        const teletextMode = Boolean(session.bbsSession?.texttvMode);
        this.screen = new screen_1.TeletextScreen({
            write: data => session.socket.emit('ansi-output', data),
            rows: Number(session.bbsSession?.screenHeight),
            mode: teletextMode ? 'teletext' : 'ansi',
            mosaicStyle: teletextMode ? 'sextant' : this.settings.mosaicStyle,
        });
        this.keys = new screen_1.KeyStream({
            key: ch => this.handleKey(ch),
            escape: () => this.onEscape(),
            arrow: direction => this.onArrow(direction),
        });
    }
    // --- Lifecycle --------------------------------------------------------
    start() {
        this.services = (0, library_1.listServices)(this.root ?? (0, library_1.teletextRoot)());
        this.session.socket.on('emulator:closed', this.onEmulatorClosed);
        this.screen.begin();
        if (this.services.length === 0) {
            this.paintPicker();
            return;
        }
        const wanted = this.settings.defaultService;
        const direct = wanted ? this.services.find(s => s.id === wanted) : undefined;
        if (direct && this.openService(direct))
            return;
        if (wanted && !direct) {
            this.notice = `no service called ${wanted.toUpperCase()}`;
        }
        // A board with one pack installed has no list worth showing: open it.
        if (!this.notice && this.services.length === 1 && this.openService(this.services[0])) {
            return;
        }
        this.paintPicker();
    }
    stop() {
        this.closed = true;
        this.clearCarousel();
        this.keys.dispose();
        this.session.socket.off?.('emulator:closed', this.onEmulatorClosed);
        // A surface left open would outlive the door.
        if (this.running)
            this.session.socket.emit('emulator:close');
        this.screen.end();
    }
    handleInput(data) {
        if (this.closed)
            return;
        this.keys.feed(data);
    }
    // --- Input ------------------------------------------------------------
    handleKey(ch) {
        if (this.view === 'picker')
            return this.pickerKey(ch);
        return this.pageKey(ch);
    }
    onArrow(direction) {
        if (this.view === 'picker') {
            const shown = this.shown();
            if (direction === 'up')
                this.pickerAt = Math.max(0, this.pickerAt - 1);
            if (direction === 'down')
                this.pickerAt = Math.min(shown.length - 1, this.pickerAt + 1);
            this.scrollPickerIntoView();
            this.paintPicker();
            return;
        }
        if (direction === 'up')
            return this.stepSubpage(-1);
        if (direction === 'down')
            return this.stepSubpage(1);
        this.stepPage(direction === 'right' ? 1 : -1);
    }
    onEscape() {
        // ESC leaves the page for the service list, and leaves the list for the
        // board - the same shape as TEXTTV's index/quit pair.
        if (this.view === 'page' && this.services.length > 1) {
            this.view = 'picker';
            this.clearCarousel();
            this.paintPicker();
            return;
        }
        this.quit();
    }
    // --- The service list -------------------------------------------------
    pickerKey(ch) {
        if (ch === '\r' || ch === '\n') {
            const chosen = this.shown()[this.pickerAt];
            if (chosen)
                this.openService(chosen);
            return;
        }
        if (ch === 'q' || ch === 'Q')
            return this.quit();
        // Backspace and delete both arrive, depending on the terminal.
        if (ch === '\x7f' || ch === '\b') {
            this.pickerFilter = this.pickerFilter.slice(0, -1);
            this.pickerAt = 0;
            this.pickerTop = 0;
            this.paintPicker();
            return;
        }
        // Anything else printable narrows the list. Digits included: the packs
        // are named for the day they were broadcast, so "1993" is a useful
        // thing to type.
        if (ch >= ' ' && ch <= '~') {
            this.pickerFilter += ch;
            this.pickerAt = 0;
            this.pickerTop = 0;
            this.paintPicker();
        }
    }
    /** The services the filter leaves. */
    shown() {
        const wanted = this.pickerFilter.trim().toLowerCase();
        if (!wanted)
            return this.services;
        return this.services.filter(service => service.id.toLowerCase().includes(wanted) ||
            service.title.toLowerCase().includes(wanted));
    }
    /** How many list rows fit under the heading. */
    pickerRows() {
        return Math.max(1, this.screen.rows - 6);
    }
    scrollPickerIntoView() {
        const rows = this.pickerRows();
        if (this.pickerAt < this.pickerTop)
            this.pickerTop = this.pickerAt;
        if (this.pickerAt >= this.pickerTop + rows)
            this.pickerTop = this.pickerAt - rows + 1;
    }
    openService(summary) {
        try {
            this.loaded = (0, library_1.getService)(summary.dir);
        }
        catch (error) {
            this.notice = `${summary.id}: ${error.message}`;
            this.paintPicker();
            return false;
        }
        if (this.loaded.index.pageNumbers.length === 0) {
            // A pack whose every file failed is an empty pack, and saying so on
            // the list beats opening a black screen.
            this.notice = `${summary.id} holds no readable pages`;
            this.loaded = null;
            this.paintPicker();
            return false;
        }
        this.view = 'page';
        this.page = this.loaded.index.homePage;
        this.subpage = 0;
        this.digits = '';
        this.notice = '';
        this.screen.clear();
        this.paintPage();
        return true;
    }
    // --- The page view ----------------------------------------------------
    pageKey(ch) {
        // Page entry is 0-9 only. Teletext page numbers are hexadecimal and
        // services really do carry pages like 1A0, but a television remote had
        // no hex keys either - those pages are reached with the page step and
        // the coloured links, exactly as they were on air.
        if (ch >= '0' && ch <= '9')
            return this.typeDigit(ch);
        switch (ch) {
            case 'r':
            case 'R': {
                // The coloured keys keep their meaning; a telesoftware page simply
                // has somewhere better for RED to go than a link it does not carry.
                const program = this.programHere();
                return program ? this.runProgram(program) : this.follow('red');
            }
            case 'g':
            case 'G': return this.follow('green');
            case 'y':
            case 'Y': return this.follow('yellow');
            case 'c':
            case 'C': return this.follow('cyan');
            case 'h':
            case 'H': return this.goHome();
            case 'v':
            case 'V': return this.toggleReveal();
            case ' ': return this.toggleHold();
            case ',': return this.stepPage(-1);
            case '.': return this.stepPage(1);
            case '<': return this.stepSubpage(-1);
            case '>': return this.stepSubpage(1);
            case 'i':
            case 'I': return this.onEscape();
            case 'q':
            case 'Q': return this.quit();
            default: return;
        }
    }
    typeDigit(digit) {
        this.digits += digit;
        if (this.digits.length < 3) {
            this.paintStatus();
            return;
        }
        const wanted = (0, store_1.parsePageNumber)(this.digits);
        this.digits = '';
        if (wanted === null) {
            this.notice = 'pages run from 100 to 899';
            this.paintStatus();
            return;
        }
        this.goTo(wanted);
    }
    follow(key) {
        const target = (0, store_1.resolveFastext)(this.current(), key);
        if (target === null) {
            this.notice = `no ${key} link on this page`;
            this.paintStatus();
            return;
        }
        this.goTo(target);
    }
    goHome() {
        if (this.loaded)
            this.goTo(this.loaded.index.homePage);
    }
    goTo(page) {
        if (!this.loaded)
            return;
        if (!this.loaded.index.has(page)) {
            // On air a decoder would simply wait for a page that never comes.
            // Saying so is kinder, and a recovery is always missing pages.
            this.notice = `page ${(0, store_1.formatPageNumber)(page)} is not in this recovery`;
            this.paintStatus();
            return;
        }
        this.page = page;
        this.subpage = 0;
        this.notice = '';
        this.paintPage();
    }
    stepPage(delta) {
        if (this.view === 'picker' || !this.loaded)
            return;
        this.page =
            delta > 0 ? this.loaded.index.nextPage(this.page) : this.loaded.index.prevPage(this.page);
        this.subpage = 0;
        this.notice = '';
        this.paintPage();
    }
    stepSubpage(delta) {
        const page = this.current();
        if ((0, store_1.subpageCount)(page) < 2)
            return;
        this.subpage = (0, store_1.stepSubpage)(page, this.subpage, delta);
        // Stepping by hand holds the carousel: a caller reading subpage 2 does
        // not want it rotating out from under them.
        this.held = true;
        this.paintPage();
    }
    toggleReveal() {
        if (!this.settings.allowReveal) {
            this.notice = 'reveal is switched off on this board';
            this.paintStatus();
            return;
        }
        this.reveal = !this.reveal;
        this.paintPage();
    }
    toggleHold() {
        this.held = !this.held;
        this.paintPage();
    }
    quit() {
        this.stop();
        this.session.close();
    }
    // --- Painting ---------------------------------------------------------
    current() {
        return this.loaded ? this.loaded.index.get(this.page) : null;
    }
    /** The program broadcast on the page being looked at, if any. */
    programHere() {
        return (0, telesoftware_1.programOnPage)(this.loaded?.telesoftware, this.page);
    }
    paintPage() {
        const program = this.programHere();
        if (program)
            return this.paintProgram(program);
        const page = this.current();
        const subpage = (0, store_1.subpageAt)(page, this.subpage);
        if (!subpage) {
            this.notice = 'this page has no subpages';
            this.paintStatus();
            return;
        }
        this.screen.paint(subpage, { reveal: this.reveal });
        this.paintStatus();
        this.scheduleCarousel();
    }
    /**
     * A telesoftware page, shown as what it is.
     *
     * These pages were never meant to be looked at. Their rows carry a
     * program in the Redefinable Telesoftware Format, and painting them as
     * characters gives a screen of mojibake - which is exactly what it did,
     * and read as a rendering bug rather than as software.
     *
     * So the page is described instead of drawn, and the caller is offered
     * the thing the page was for.
     */
    paintProgram(program) {
        this.clearCarousel();
        this.screen.clear();
        this.screen.line(1, `TELESOFTWARE${' '.repeat(12)}P${(0, store_1.formatPageNumber)(this.page)}`, '\x1b[1;37m');
        this.screen.line(2, '-'.repeat(40), '\x1b[36m');
        this.screen.line(4, (0, screen_1.fit)(program.title.toUpperCase(), 40), '\x1b[1;33m');
        const blocks = `${program.blocks} block${program.blocks === 1 ? '' : 's'}`;
        this.screen.line(6, `Broadcast on this page in ${blocks}.`);
        this.screen.line(7, program.complete ? 'Every block was recovered.' : 'Some blocks are missing.');
        // Saying so is the point: one byte of this one was put back.
        if (program.repaired)
            this.screen.line(8, 'Its end marker was repaired.', '\x1b[0;36m');
        this.screen.line(9, 'On the BBC Micro it is:', '\x1b[0;36m');
        this.screen.line(10, (0, screen_1.fit)(program.command, 40), '\x1b[1;37m');
        if (!program.intact) {
            this.screen.line(12, 'The tape damaged this one: it loads', '\x1b[1;31m');
            this.screen.line(13, 'but will not run.', '\x1b[1;31m');
        }
        else if (program.kind === 'tokenised') {
            this.screen.line(12, 'PRESS RED TO PLAY IT', '\x1b[1;31m');
        }
        else {
            this.screen.line(12, 'PRESS RED TO LOAD IT', '\x1b[1;31m');
        }
        this.paintStatus();
    }
    /**
     * Hand the program to the board's BBC Micro, already typed in.
     *
     * AUTOTYPE RATHER THAN AUTOBOOT, and they are exclusive - jsbeeb takes
     * the first of autoboot, autochain, autorun, autotype that it finds, so a
     * URL carrying both boots the disc and ignores the program. Booting would
     * only reach the disc's catalogue; typing reaches THIS program, which is
     * the one the caller was reading about.
     */
    runProgram(program) {
        const disc = this.loaded?.telesoftware?.disc;
        if (!disc) {
            this.notice = 'this service has no disc to run it from';
            this.paintStatus();
            return;
        }
        /*
         * THE SAME GATE THE BEEB DOOR KEEPS, because a door that skipped it
         * would simply be the way round it. The board holds one copy of the
         * ROMs and hands them to nobody who has not shown their own, and this
         * is a second front door to the same machine.
         */
        if (!(0, proof_store_1.hasProved)(this.beebProof, this.session.user?.id)) {
            this.notice = 'run BEEB once and show your own ROMs first';
            this.paintStatus();
            return;
        }
        this.running = program;
        this.clearCarousel();
        this.session.socket.emit('emulator:open', {
            url: (0, emulator_url_1.emulatorUrl)({
                file: disc,
                autotype: `${program.command}\n`,
                token: this.session.bbs?.grantBeebRomAccess?.(),
            }),
            title: program.title,
            machine: 'BBC MICRO',
        });
        this.screen.clear();
        this.screen.line(1, 'TELESOFTWARE', '\x1b[1;37m');
        this.screen.line(2, '-'.repeat(40), '\x1b[36m');
        this.screen.line(4, (0, screen_1.fit)(`Loading ${program.title.toUpperCase()}...`, 40), '\x1b[1;33m');
        this.screen.line(6, 'Press SHIFT+ESC to come back');
        this.screen.line(7, 'to the page.');
        this.paintStatus();
    }
    onEmulatorReturn() {
        if (this.closed)
            return;
        this.running = null;
        this.paintPage();
    }
    paintStatus() {
        this.screen.status(this.view === 'picker' ? this.pickerBar() : this.pageBar());
    }
    pageBar() {
        if (this.notice)
            return `! ${this.notice}`;
        if (this.running)
            return `RUNNING ${this.running.file}  Q=Quit`;
        const program = this.programHere();
        if (program) {
            const verb = program.intact ? 'R=Run' : 'DAMAGED';
            return `P${(0, store_1.formatPageNumber)(this.page)} ${verb} H=Home Q=Quit`;
        }
        const page = this.current();
        const count = (0, store_1.subpageCount)(page);
        const parts = [];
        parts.push(this.digits ? `P${this.digits}_` : `P${(0, store_1.formatPageNumber)(this.page)}`);
        if (count > 1)
            parts.push(`${this.subpage + 1}/${count}${this.held ? ' HELD' : ''}`);
        // Only the coloured keys this page actually offers are advertised, so a
        // caller never presses a button that does nothing.
        const links = (0, store_1.fastextTargets)(page);
        const offered = ['red', 'green', 'yellow', 'cyan']
            .filter(key => links[key] !== undefined)
            .map(key => key[0].toUpperCase())
            .join('');
        if (offered)
            parts.push(offered);
        if (this.reveal)
            parts.push('REVEAL');
        parts.push('H=Home Q=Quit');
        return parts.join(' ');
    }
    pickerBar() {
        if (this.notice)
            return `! ${this.notice}`;
        if (this.services.length === 0)
            return 'Q=Quit';
        const shown = this.shown().length;
        const count = shown === this.services.length ? `${shown}` : `${shown}/${this.services.length}`;
        return `${count}  TYPE=Find ENTER=Open Q=Quit`;
    }
    paintPicker() {
        this.view = 'picker';
        this.screen.clear();
        this.screen.line(1, 'TELETEXT', '\x1b[1;37m');
        this.screen.line(2, '-'.repeat(40), '\x1b[36m');
        if (this.services.length === 0) {
            this.screen.line(4, 'No teletext services are installed.');
            this.screen.line(6, 'A service pack is a directory under');
            this.screen.line(7, (0, screen_1.fit)((0, library_1.teletextRoot)(), 40));
            this.screen.line(8, 'holding a service.json and a pages/');
            this.screen.line(9, 'folder of .t42 or .tti files.');
            this.paintStatus();
            return;
        }
        const shown = this.shown();
        if (this.pickerFilter) {
            this.screen.line(3, (0, screen_1.fit)(`Find: ${this.pickerFilter}_`, 40), '\x1b[1;33m');
        }
        if (shown.length === 0) {
            this.screen.line(5, 'Nothing matches that.');
            this.paintStatus();
            return;
        }
        const rows = this.pickerRows();
        for (let i = 0; i < rows; i++) {
            const at = this.pickerTop + i;
            const service = shown[at];
            if (!service)
                break;
            const marker = at === this.pickerAt ? '>' : ' ';
            const label = `${marker} ${service.title}`;
            const pages = `${service.fileCount}p`;
            const line = (0, screen_1.fit)(label, 40 - pages.length - 1).padEnd(40 - pages.length - 1) + ' ' + pages;
            this.screen.line(4 + i, line, at === this.pickerAt ? '\x1b[1;37m' : '\x1b[0;37m');
        }
        this.paintStatus();
    }
    // --- The carousel clock -----------------------------------------------
    scheduleCarousel() {
        this.clearCarousel();
        const page = this.current();
        if (this.held || this.view !== 'page' || (0, store_1.subpageCount)(page) < 2)
            return;
        const dwell = (0, store_1.dwellMsFor)(page, this.settings.dwellSeconds * 1000);
        this.carousel = setTimeout(() => {
            this.carousel = null;
            if (this.closed || this.view !== 'page')
                return;
            this.subpage = (0, store_1.stepSubpage)(this.current(), this.subpage, 1);
            this.paintPage();
        }, dwell);
    }
    clearCarousel() {
        if (this.carousel) {
            clearTimeout(this.carousel);
            this.carousel = null;
        }
    }
}
exports.TeletextApp = TeletextApp;
//# sourceMappingURL=app.js.map