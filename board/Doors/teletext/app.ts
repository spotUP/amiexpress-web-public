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
import {
  parsePageNumber,
  formatPageNumber,
  FIRST_PAGE,
  LAST_PAGE,
  resolveFastext,
  fastextTargets,
  subpageAt,
  subpageCount,
  stepSubpage,
  dwellMsFor,
  type FastextKey,
} from '@amiexpress/bbs-door-sdk/teletext/store';
import { PageSearch, rangeSpace } from '@amiexpress/bbs-door-sdk/teletext/page-search';
import {
  TeletextScreen,
  KeyStream,
  fit,
  type ArrowKey,
} from '@amiexpress/bbs-door-sdk/teletext/screen';
import {
  listServices,
  getService,
  loadCatalogue,
  teletextRoot,
  type LoadedService,
  type ServiceSummary,
} from '@amiexpress/bbs-door-sdk/teletext/library';
import {
  programOnPage,
  type TelesoftwareListing,
} from '@amiexpress/bbs-door-sdk/teletext/telesoftware';
import { emulatorUrl } from '@amiexpress/bbs-door-sdk/beeb/emulator-url';
import { hasProved, beebProofFile } from '@amiexpress/bbs-door-sdk/beeb/proof-store';
import {
  playableOnly,
  type Catalogue,
  type CatalogueEntry,
} from '@amiexpress/bbs-door-sdk/teletext/catalogue';
import * as path from 'path';
import { loadSettings, type TeletextSettings } from './settings';

export interface DoorSession {
  socket: {
    emit(event: string, data?: unknown): void;
    on(event: string, handler: (...args: unknown[]) => void): void;
    off?(event: string, handler: (...args: unknown[]) => void): void;
  };
  bbsSession: Record<string, unknown>;
  user?: { username?: string; id?: string | number };
  /** The board's grant for fetching the BBC ROMs, for a proved caller. */
  bbs?: { grantBeebRomAccess?(): string };
  close(): void;
}

type View = 'index' | 'picker' | 'page';

// Where the BEEB door records who has shown their ROMs. Resolved by the
// SDK from the board root: one record, one answer, whichever door the
// caller came through.

export class TeletextApp {
  private readonly session: DoorSession;
  private readonly settings: TeletextSettings;
  private readonly screen: TeletextScreen;
  private readonly keys: KeyStream;
  private readonly root: string | undefined;
  /** Where the BEEB door records who has shown their ROMs. */
  private readonly beebProof: string;

  private services: ServiceSummary[] = [];
  /**
   * What the caller has typed to narrow the list.
   *
   * A board with the restoration archive installed has over a thousand
   * service packs on it - one per recovered broadcast day - and a flat
   * list of nineteen rows with no way down is no use at all. Typing
   * narrows; the arrows walk what is left.
   */
  private pickerFilter = '';
  /** The board's quicklink list, and where the caller is in it. */
  private catalogue: CatalogueEntry[] = [];
  private indexAt = 0;
  private indexTop = 0;
  /** First row of the list that is on screen. */
  private pickerTop = 0;
  private loaded: LoadedService | null = null;
  private view: View = 'picker';
  private pickerAt = 0;
  private page = 0x100;
  private subpage = 0;
  private reveal = false;
  private held = false;
  private notice = '';
  private readonly search: PageSearch;
  private carousel: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  /** The program running on the board's BBC Micro, while one is. */
  private running: TelesoftwareListing | null = null;
  private readonly onEmulatorClosed = () => this.onEmulatorReturn();

  /**
   * @param root Which Teletext directory to browse. The door leaves this
   *   alone and gets the board's; a test passes its own, because a test
   *   that reads whatever packs happen to be installed is a test that
   *   breaks the day a sysop installs one.
   */
  constructor(session: DoorSession, root?: string, proofFile?: string) {
    this.session = session;
    this.root = root;
    this.beebProof = proofFile ?? beebProofFile(__dirname);
    this.settings = loadSettings();

    // The board tells a door which screen the caller chose. A teletext
    // session gets DECDHL and real sextants; everyone else gets the
    // approximation, because their font has no block graphics in it.
    const teletextMode = Boolean(session.bbsSession?.texttvMode);
    this.screen = new TeletextScreen({
      write: data => session.socket.emit('ansi-output', data),
      rows: Number(session.bbsSession?.screenHeight),
      mode: teletextMode ? 'teletext' : 'ansi',
      mosaicStyle: teletextMode ? 'sextant' : this.settings.mosaicStyle,
    });

    /*
     * Page entry and the fake carousel search are the SDK's, shared with MAG:
     * the door says what its header counter is, how to put the header back
     * and what landing on a page means. The width is the board's column
     * model, so a 40-column session gets the static line, not the roll.
     */
    this.search = new PageSearch({
      space: rangeSpace(FIRST_PAGE, LAST_PAGE, formatPageNumber),
      width: Number(session.bbsSession?.screenWidth) || 80,
      parse: parsePageNumber,
      exists: page => Boolean(this.loaded?.index.has(page)),
      current: () => this.page,
      header: text => this.screen.counter(text),
      restore: () => this.paintPage(),
      land: page => this.goTo(page),
    });

    this.keys = new KeyStream({
      key: ch => this.handleKey(ch),
      escape: () => this.onEscape(),
      arrow: direction => this.onArrow(direction),
    });
  }

  // --- Lifecycle --------------------------------------------------------

  start(): void {
    const root = this.root ?? teletextRoot();
    this.services = listServices(root);
    this.session.socket.on('emulator:closed', this.onEmulatorClosed);
    this.screen.begin();

    if (this.services.length === 0) {
      this.paintPicker();
      return;
    }

    /*
     * OPEN ON WHAT THERE IS TO PLAY.
     *
     * A board with the restoration archive installed carries fifteen
     * hundred recovered broadcast days, and the handful holding a game are
     * scattered across years and networks behind page numbers nobody could
     * remember - Bamboozle on 152, a quiz hidden at 30A, sixteen BBC
     * programs on Ceefax 704 to 719. Landing on a service list and wishing
     * the caller luck is not a browser, it is a filing cabinet.
     */
    const catalogue: Catalogue | null = loadCatalogue(root);
    this.catalogue = catalogue ? playableOnly(catalogue.entries) : [];
    if (this.catalogue.length > 0 && !this.settings.defaultService) {
      this.view = 'index';
      this.paintIndex();
      return;
    }

    const wanted = this.settings.defaultService;
    const direct = wanted ? this.services.find(s => s.id === wanted) : undefined;
    if (direct && this.openService(direct)) return;

    if (wanted && !direct) {
      this.notice = `no service called ${wanted.toUpperCase()}`;
    }

    // A board with one pack installed has no list worth showing: open it.
    if (!this.notice && this.services.length === 1 && this.openService(this.services[0])) {
      return;
    }

    this.paintPicker();
  }

  stop(): void {
    this.closed = true;
    this.clearCarousel();
    this.search.dispose();
    this.keys.dispose();
    this.session.socket.off?.('emulator:closed', this.onEmulatorClosed);
    // A surface left open would outlive the door.
    if (this.running) this.session.socket.emit('emulator:close');
    this.screen.end();
  }

  handleInput(data: string): void {
    if (this.closed) return;
    this.keys.feed(data);
  }

  // --- Input ------------------------------------------------------------

  private handleKey(ch: string): void {
    // In a page the digits are a page number, and while one is being typed or
    // searched for the keys that would leave it belong to the search first.
    if (this.view === 'page' && this.search.feed(searchKey(ch))) {
      // The carousel must not repaint the page over the counter. A cancel or
      // a landing has already repainted the page, which restarts it.
      if (this.search.active) this.clearCarousel();
      return;
    }
    if (this.view === 'index') return this.indexKey(ch);
    if (this.view === 'picker') return this.pickerKey(ch);
    return this.pageKey(ch);
  }

  private onArrow(direction: ArrowKey): void {
    if (this.view === 'page' && this.search.active && this.search.feed(direction)) return;
    if (this.view === 'index') {
      if (direction === 'up') this.indexAt = Math.max(0, this.indexAt - 1);
      if (direction === 'down') this.indexAt = Math.min(this.catalogue.length - 1, this.indexAt + 1);
      const rows = this.indexRows();
      if (this.indexAt < this.indexTop) this.indexTop = this.indexAt;
      if (this.indexAt >= this.indexTop + rows) this.indexTop = this.indexAt - rows + 1;
      this.paintIndex();
      return;
    }
    if (this.view === 'picker') {
      const shown = this.shown();
      if (direction === 'up') this.pickerAt = Math.max(0, this.pickerAt - 1);
      if (direction === 'down') this.pickerAt = Math.min(shown.length - 1, this.pickerAt + 1);
      this.scrollPickerIntoView();
      this.paintPicker();
      return;
    }
    if (direction === 'up') return this.stepSubpage(-1);
    if (direction === 'down') return this.stepSubpage(1);
    this.stepPage(direction === 'right' ? 1 : -1);
  }

  private onEscape(): void {
    if (this.view === 'page' && this.search.active && this.search.feed('escape')) return;
    this.search.dispose();
    // ESC walks back the way the caller came: a page returns to whichever
    // list opened it, and a list leaves the door.
    if (this.view === 'page' && this.catalogue.length > 0) {
      this.view = 'index';
      this.clearCarousel();
      this.paintIndex();
      return;
    }
    if (this.view === 'page' && this.services.length > 1) {
      this.view = 'picker';
      this.clearCarousel();
      this.paintPicker();
      return;
    }
    if (this.view === 'picker' && this.catalogue.length > 0) {
      this.view = 'index';
      this.paintIndex();
      return;
    }
    this.quit();
  }

  // --- The quicklink list -----------------------------------------------

  private indexRows(): number {
    return Math.max(1, this.screen.rows - 6);
  }

  private indexKey(ch: string): void {
    if (ch === '\r' || ch === '\n') return this.openEntry(this.catalogue[this.indexAt]);
    if (ch === 'q' || ch === 'Q') return this.quit();
    if (ch === 's' || ch === 'S') {
      this.view = 'picker';
      this.paintPicker();
      return;
    }
    // 1-9 picks straight off the visible page, the way a teletext index does.
    if (ch >= '1' && ch <= '9') {
      const at = this.indexTop + Number(ch) - 1;
      if (at < this.catalogue.length) {
        this.indexAt = at;
        this.openEntry(this.catalogue[at]);
      }
    }
  }

  /** Open the service a quicklink names, on the page it names. */
  private openEntry(entry: CatalogueEntry | undefined): void {
    if (!entry) return;
    const summary = this.services.find(service => service.id === entry.service);
    if (!summary) {
      this.notice = `${entry.service} is no longer installed`;
      this.paintIndex();
      return;
    }
    if (!this.openService(summary)) return;
    // openService lands on the pack's home page; the quicklink is more
    // specific than that.
    if (entry.page !== this.page) this.goTo(entry.page);
  }

  private paintIndex(): void {
    this.view = 'index';
    this.screen.clear();
    this.screen.line(1, 'TELETEXT GAMES', '\x1b[1;37m');
    this.screen.line(2, '-'.repeat(40), '\x1b[36m');

    const rows = this.indexRows();
    for (let i = 0; i < rows; i++) {
      const at = this.indexTop + i;
      const entry = this.catalogue[at];
      if (!entry) break;
      const chosen = at === this.indexAt;
      const number = i < 9 ? String(i + 1) : ' ';
      const where = formatPageNumber(entry.page);
      const label = fit(`${chosen ? '>' : ' '}${number} ${entry.label}`, 40 - where.length - 1);
      this.screen.line(
        4 + i,
        label.padEnd(40 - where.length - 1) + ' ' + where,
        chosen ? '\x1b[1;37m' : entry.kind === 'game' ? '\x1b[0;33m' : '\x1b[0;36m',
      );
    }

    this.paintStatus();
  }

  private indexBar(): string {
    if (this.notice) return `! ${this.notice}`;
    const entry = this.catalogue[this.indexAt];
    const what = entry?.kind === 'program' ? entry.command ?? 'program' : 'ENTER=open';
    return `${this.indexAt + 1}/${this.catalogue.length} ${what}  S=All  Q=Quit`;
  }

  // --- The service list -------------------------------------------------

  private pickerKey(ch: string): void {
    if (ch === '\r' || ch === '\n') {
      const chosen = this.shown()[this.pickerAt];
      if (chosen) this.openService(chosen);
      return;
    }
    if (ch === 'q' || ch === 'Q') return this.quit();

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
  private shown(): ServiceSummary[] {
    const wanted = this.pickerFilter.trim().toLowerCase();
    if (!wanted) return this.services;
    return this.services.filter(
      service =>
        service.id.toLowerCase().includes(wanted) ||
        service.title.toLowerCase().includes(wanted),
    );
  }

  /** How many list rows fit under the heading. */
  private pickerRows(): number {
    return Math.max(1, this.screen.rows - 6);
  }

  private scrollPickerIntoView(): void {
    const rows = this.pickerRows();
    if (this.pickerAt < this.pickerTop) this.pickerTop = this.pickerAt;
    if (this.pickerAt >= this.pickerTop + rows) this.pickerTop = this.pickerAt - rows + 1;
  }

  private openService(summary: ServiceSummary): boolean {
    try {
      this.loaded = getService(summary.dir);
    } catch (error) {
      this.notice = `${summary.id}: ${(error as Error).message}`;
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

    this.search.dispose();
    this.view = 'page';
    this.page = this.loaded.index.homePage;
    this.subpage = 0;
    this.notice = '';
    this.screen.clear();
    this.paintPage();
    return true;
  }

  // --- The page view ----------------------------------------------------

  private pageKey(ch: string): void {
    // Page entry (0-9 only) is handled before this, in handleKey. Teletext
    // page numbers are hexadecimal and services really do carry pages like
    // 1A0, but a television remote had no hex keys either - those pages are
    // reached with the page step and the coloured links, exactly as they
    // were on air.
    switch (ch) {
      case 'r': case 'R': {
        // The coloured keys keep their meaning; a telesoftware page simply
        // has somewhere better for RED to go than a link it does not carry.
        const program = this.programHere();
        return program ? this.runProgram(program) : this.follow('red');
      }
      case 'g': case 'G': return this.follow('green');
      case 'y': case 'Y': return this.follow('yellow');
      case 'c': case 'C': return this.follow('cyan');
      case 'h': case 'H': return this.goHome();
      case 'v': case 'V': return this.toggleReveal();
      case ' ': return this.toggleHold();
      case ',': return this.stepPage(-1);
      case '.': return this.stepPage(1);
      case '<': return this.stepSubpage(-1);
      case '>': return this.stepSubpage(1);
      case 'i': case 'I': return this.onEscape();
      case 'q': case 'Q': return this.quit();
      default: return;
    }
  }

  private follow(key: FastextKey): void {
    const target = resolveFastext(this.current(), key);
    if (target === null) {
      this.notice = `no ${key} link on this page`;
      this.paintStatus();
      return;
    }
    this.goTo(target);
  }

  private goHome(): void {
    if (this.loaded) this.goTo(this.loaded.index.homePage);
  }

  private goTo(page: number): void {
    if (!this.loaded) return;
    if (!this.loaded.index.has(page)) {
      // On air a decoder would simply wait for a page that never comes.
      // Saying so is kinder, and a recovery is always missing pages.
      this.notice = `page ${formatPageNumber(page)} is not in this recovery`;
      this.paintStatus();
      return;
    }
    this.page = page;
    this.subpage = 0;
    this.notice = '';
    this.paintPage();
  }

  private stepPage(delta: number): void {
    if (this.view === 'picker' || !this.loaded) return;
    this.page =
      delta > 0 ? this.loaded.index.nextPage(this.page) : this.loaded.index.prevPage(this.page);
    this.subpage = 0;
    this.notice = '';
    this.paintPage();
  }

  private stepSubpage(delta: number): void {
    const page = this.current();
    if (subpageCount(page) < 2) return;
    this.subpage = stepSubpage(page, this.subpage, delta);
    // Stepping by hand holds the carousel: a caller reading subpage 2 does
    // not want it rotating out from under them.
    this.held = true;
    this.paintPage();
  }

  private toggleReveal(): void {
    if (!this.settings.allowReveal) {
      this.notice = 'reveal is switched off on this board';
      this.paintStatus();
      return;
    }
    this.reveal = !this.reveal;
    this.paintPage();
  }

  private toggleHold(): void {
    this.held = !this.held;
    this.paintPage();
  }

  private quit(): void {
    this.stop();
    this.session.close();
  }

  // --- Painting ---------------------------------------------------------

  private current() {
    return this.loaded ? this.loaded.index.get(this.page) : null;
  }

  /** The program broadcast on the page being looked at, if any. */
  private programHere(): TelesoftwareListing | null {
    return programOnPage(this.loaded?.telesoftware, this.page);
  }

  private paintPage(): void {
    const program = this.programHere();
    if (program) return this.paintProgram(program);

    const page = this.current();
    const subpage = subpageAt(page, this.subpage);
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
  private paintProgram(program: TelesoftwareListing): void {
    this.clearCarousel();
    this.screen.clear();
    this.screen.line(1, `TELESOFTWARE${' '.repeat(12)}P${formatPageNumber(this.page)}`, '\x1b[1;37m');
    this.screen.line(2, '-'.repeat(40), '\x1b[36m');
    this.screen.line(4, fit(program.title.toUpperCase(), 40), '\x1b[1;33m');

    const blocks = `${program.blocks} block${program.blocks === 1 ? '' : 's'}`;
    this.screen.line(6, `Broadcast on this page in ${blocks}.`);
    this.screen.line(7, program.complete ? 'Every block was recovered.' : 'Some blocks are missing.');
    // Saying so is the point: one byte of this one was put back.
    if (program.repaired) this.screen.line(8, 'Its end marker was repaired.', '\x1b[0;36m');

    this.screen.line(9, 'On the BBC Micro it is:', '\x1b[0;36m');
    this.screen.line(10, fit(program.command, 40), '\x1b[1;37m');

    if (!program.intact) {
      this.screen.line(12, 'The tape damaged this one: it loads', '\x1b[1;31m');
      this.screen.line(13, 'but will not run.', '\x1b[1;31m');
    } else if (program.kind === 'tokenised') {
      this.screen.line(12, 'PRESS RED TO PLAY IT', '\x1b[1;31m');
    } else {
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
  private runProgram(program: TelesoftwareListing): void {
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
    if (!hasProved(this.beebProof, this.session.user?.id)) {
      this.notice = 'run BEEB once and show your own ROMs first';
      this.paintStatus();
      return;
    }

    this.running = program;
    this.clearCarousel();
    this.session.socket.emit('emulator:open', {
      url: emulatorUrl({
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
    this.screen.line(4, fit(`Loading ${program.title.toUpperCase()}...`, 40), '\x1b[1;33m');
    this.screen.line(6, 'Press SHIFT+ESC to come back');
    this.screen.line(7, 'to the page.');
    this.paintStatus();
  }

  private onEmulatorReturn(): void {
    if (this.closed) return;
    this.running = null;
    this.paintPage();
  }

  private paintStatus(): void {
    if (this.view === 'index') return this.screen.status(this.indexBar());
    this.screen.status(this.view === 'picker' ? this.pickerBar() : this.pageBar());
  }

  private pageBar(): string {
    if (this.notice) return `! ${this.notice}`;
    if (this.running) return `RUNNING ${this.running.file}  Q=Quit`;

    const program = this.programHere();
    if (program) {
      const verb = program.intact ? 'R=Run' : 'DAMAGED';
      return `P${formatPageNumber(this.page)} ${verb} H=Home Q=Quit`;
    }

    const page = this.current();
    const count = subpageCount(page);
    const parts: string[] = [];
    parts.push(`P${formatPageNumber(this.page)}`);
    if (count > 1) parts.push(`${this.subpage + 1}/${count}${this.held ? ' HELD' : ''}`);

    // Only the coloured keys this page actually offers are advertised, so a
    // caller never presses a button that does nothing.
    const links = fastextTargets(page);
    const offered = (['red', 'green', 'yellow', 'cyan'] as const)
      .filter(key => links[key] !== undefined)
      .map(key => key[0].toUpperCase())
      .join('');
    if (offered) parts.push(offered);
    if (this.reveal) parts.push('REVEAL');
    parts.push('H=Home Q=Quit');
    return parts.join(' ');
  }

  private pickerBar(): string {
    if (this.notice) return `! ${this.notice}`;
    if (this.services.length === 0) return 'Q=Quit';
    const shown = this.shown().length;
    const count = shown === this.services.length ? `${shown}` : `${shown}/${this.services.length}`;
    return `${count}  TYPE=Find ENTER=Open Q=Quit`;
  }

  private paintPicker(): void {
    this.view = 'picker';
    this.screen.clear();
    this.screen.line(1, 'TELETEXT', '\x1b[1;37m');
    this.screen.line(2, '-'.repeat(40), '\x1b[36m');

    if (this.services.length === 0) {
      this.screen.line(4, 'No teletext services are installed.');
      this.screen.line(6, 'A service pack is a directory under');
      this.screen.line(7, fit(teletextRoot(), 40));
      this.screen.line(8, 'holding a service.json and a pages/');
      this.screen.line(9, 'folder of .t42 or .tti files.');
      this.paintStatus();
      return;
    }

    const shown = this.shown();
    if (this.pickerFilter) {
      this.screen.line(3, fit(`Find: ${this.pickerFilter}_`, 40), '\x1b[1;33m');
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
      if (!service) break;
      const marker = at === this.pickerAt ? '>' : ' ';
      const label = `${marker} ${service.title}`;
      const pages = `${service.fileCount}p`;
      const line = fit(label, 40 - pages.length - 1).padEnd(40 - pages.length - 1) + ' ' + pages;
      this.screen.line(4 + i, line, at === this.pickerAt ? '\x1b[1;37m' : '\x1b[0;37m');
    }

    this.paintStatus();
  }

  // --- The carousel clock -----------------------------------------------

  private scheduleCarousel(): void {
    this.clearCarousel();
    const page = this.current();
    if (this.held || this.view !== 'page' || subpageCount(page) < 2) return;

    const dwell = dwellMsFor(page, this.settings.dwellSeconds * 1000);
    this.carousel = setTimeout(() => {
      this.carousel = null;
      if (this.closed || this.view !== 'page') return;
      this.subpage = stepSubpage(this.current(), this.subpage, 1);
      this.paintPage();
    }, dwell);
  }

  private clearCarousel(): void {
    if (this.carousel) {
      clearTimeout(this.carousel);
      this.carousel = null;
    }
  }
}

/** The key as the page-number machine reads it. */
function searchKey(ch: string): string {
  if (ch === '\x7f' || ch === '\b') return 'backspace';
  if (ch === '\r' || ch === '\n') return 'enter';
  return ch;
}
