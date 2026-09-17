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
  resolveFastext,
  fastextTargets,
  subpageAt,
  subpageCount,
  stepSubpage,
  dwellMsFor,
  type FastextKey,
} from '@amiexpress/bbs-door-sdk/teletext/store';
import {
  TeletextScreen,
  KeyStream,
  fit,
  type ArrowKey,
} from '@amiexpress/bbs-door-sdk/teletext/screen';
import {
  listServices,
  getService,
  teletextRoot,
  type LoadedService,
  type ServiceSummary,
} from '@amiexpress/bbs-door-sdk/teletext/library';
import {
  programOnPage,
  type TelesoftwareListing,
} from '@amiexpress/bbs-door-sdk/teletext/telesoftware';
import { emulatorUrl } from '@amiexpress/bbs-door-sdk/beeb/emulator-url';
import { loadSettings, type TeletextSettings } from './settings';

export interface DoorSession {
  socket: {
    emit(event: string, data?: unknown): void;
    on(event: string, handler: (...args: unknown[]) => void): void;
    off?(event: string, handler: (...args: unknown[]) => void): void;
  };
  bbsSession: Record<string, unknown>;
  user?: { username?: string };
  close(): void;
}

type View = 'picker' | 'page';

export class TeletextApp {
  private readonly session: DoorSession;
  private readonly settings: TeletextSettings;
  private readonly screen: TeletextScreen;
  private readonly keys: KeyStream;
  private readonly root: string | undefined;

  private services: ServiceSummary[] = [];
  private loaded: LoadedService | null = null;
  private view: View = 'picker';
  private pickerAt = 0;
  private page = 0x100;
  private subpage = 0;
  private reveal = false;
  private held = false;
  private digits = '';
  private notice = '';
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
  constructor(session: DoorSession, root?: string) {
    this.session = session;
    this.root = root;
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

    this.keys = new KeyStream({
      key: ch => this.handleKey(ch),
      escape: () => this.onEscape(),
      arrow: direction => this.onArrow(direction),
    });
  }

  // --- Lifecycle --------------------------------------------------------

  start(): void {
    this.services = listServices(this.root ?? teletextRoot());
    this.session.socket.on('emulator:closed', this.onEmulatorClosed);
    this.screen.begin();

    if (this.services.length === 0) {
      this.paintPicker();
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
    if (this.view === 'picker') return this.pickerKey(ch);
    return this.pageKey(ch);
  }

  private onArrow(direction: ArrowKey): void {
    if (this.view === 'picker') {
      if (direction === 'up') this.pickerAt = Math.max(0, this.pickerAt - 1);
      if (direction === 'down') this.pickerAt = Math.min(this.services.length - 1, this.pickerAt + 1);
      this.paintPicker();
      return;
    }
    if (direction === 'up') return this.stepSubpage(-1);
    if (direction === 'down') return this.stepSubpage(1);
    this.stepPage(direction === 'right' ? 1 : -1);
  }

  private onEscape(): void {
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

  private pickerKey(ch: string): void {
    if (ch === '\r' || ch === '\n') {
      const chosen = this.services[this.pickerAt];
      if (chosen) this.openService(chosen);
      return;
    }
    if (ch >= '1' && ch <= '9') {
      const chosen = this.services[Number(ch) - 1];
      if (chosen) {
        this.pickerAt = Number(ch) - 1;
        this.openService(chosen);
      }
      return;
    }
    if (ch === 'q' || ch === 'Q') this.quit();
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

  private pageKey(ch: string): void {
    // Page entry is 0-9 only. Teletext page numbers are hexadecimal and
    // services really do carry pages like 1A0, but a television remote had
    // no hex keys either - those pages are reached with the page step and
    // the coloured links, exactly as they were on air.
    if (ch >= '0' && ch <= '9') return this.typeDigit(ch);

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

  private typeDigit(digit: string): void {
    this.digits += digit;
    if (this.digits.length < 3) {
      this.paintStatus();
      return;
    }
    const wanted = parsePageNumber(this.digits);
    this.digits = '';
    if (wanted === null) {
      this.notice = 'pages run from 100 to 899';
      this.paintStatus();
      return;
    }
    this.goTo(wanted);
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

    this.running = program;
    this.clearCarousel();
    this.session.socket.emit('emulator:open', {
      url: emulatorUrl({ file: disc, autotype: `${program.command}\n` }),
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
    parts.push(this.digits ? `P${this.digits}_` : `P${formatPageNumber(this.page)}`);
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
    return 'ENTER=Open  1-9=Pick  Q=Quit';
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

    this.services.forEach((service, at) => {
      const row = 4 + at;
      if (row >= this.screen.rows - 1) return;
      const marker = at === this.pickerAt ? '>' : ' ';
      const label = `${marker}${at + 1} ${service.title}`;
      const pages = `${service.fileCount}p`;
      const line = fit(label, 40 - pages.length - 1).padEnd(40 - pages.length - 1) + ' ' + pages;
      this.screen.line(row, line, at === this.pickerAt ? '\x1b[1;37m' : '\x1b[0;37m');
    });

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
