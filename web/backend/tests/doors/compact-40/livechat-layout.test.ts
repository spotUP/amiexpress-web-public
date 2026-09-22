/**
 * LIVECHAT AT FORTY COLUMNS.
 *
 * The door's geometry is one pure function - `Doors/livechat/ui/layout-solver`
 * - and it already yields the sidebar on a narrow window. It could not yield
 * it far enough for a C64: at forty columns the sidebar clamps to sixteen,
 * the chat panel keeps twenty-four, and the log inside it is twenty-one
 * columns of broken words. `MIN_CHAT_WIDTH` is what holds it there, and it
 * is the right rule on an eighty-column screen.
 *
 * So at the compact tier the two stop sharing the row. Whichever one the
 * caller asked for owns the screen, and F2 swaps them. This drives the
 * solver at the three widths the skill asks for: forty, the fixed eighty,
 * and a wide terminal.
 */
import {
  solveLayout,
  MIN_CHAT_WIDTH,
  type LayoutConstants,
} from '../../../../../Doors/livechat/ui/layout-solver';

/** The door's own chrome, from server.ts. */
const CHROME: LayoutConstants = {
  menuHeight: 1,
  statusHeight: 1,
  inputHeight: 3,
  emojiButtonWidth: 4,
};

const request = (width: number, height: number, sidebarVisible: boolean) => ({
  width,
  height,
  sidebarVisible,
  sidebarWidth: 20,
  sidebarDock: 'left',
});

describe('LiveChat on a 40x25 C64 screen', () => {
  it('gives the chat the whole width when the lists are down', () => {
    const solved = solveLayout(request(40, 25, false), CHROME);

    expect(solved.sidebar).toBeNull();
    expect(solved.chatHidden).toBe(false);
    expect(solved.chat.left).toBe(0);
    expect(solved.chat.width).toBe(40);
    // Border columns and the scrollbar, and nothing else.
    expect(solved.chatLog.width).toBe(37);
  });

  it('gives the lists the whole width when they are up, and hides the chat', () => {
    const solved = solveLayout(request(40, 25, true), CHROME);

    expect(solved.sidebar).not.toBeNull();
    expect(solved.sidebar!.left).toBe(0);
    expect(solved.sidebar!.width).toBe(40);
    expect(solved.chatHidden).toBe(true);
  });

  /*
   * The rule this pins is not "wide enough". A docked sidebar at forty
   * leaves the chat twenty-four columns, which clears `MIN_CHAT_WIDTH` and
   * is still the broken screen. A chat that is DRAWN at forty has all forty.
   */
  it('never squeezes the chat log into a column of broken words', () => {
    for (const visible of [true, false]) {
      const solved = solveLayout(request(40, 25, visible), CHROME);
      if (!solved.chatHidden) {
        expect(solved.chat.width).toBe(40);
        expect(solved.chat.width).toBeGreaterThan(MIN_CHAT_WIDTH);
      }
    }
  });

  it('keeps every panel inside the forty columns the caller has', () => {
    for (const visible of [true, false]) {
      const solved = solveLayout(request(40, 25, visible), CHROME);
      if (solved.sidebar) {
        expect(solved.sidebar.left + solved.sidebar.width).toBeLessThanOrEqual(40);
      }
      if (!solved.chatHidden) {
        expect(solved.chat.left + solved.chat.width).toBeLessThanOrEqual(40);
      }
      expect(solved.input.width).toBeLessThanOrEqual(40);
      expect(solved.statusBar.width).toBe(40);
    }
  });
});

describe('LiveChat on the screens it has always drawn', () => {
  it('80 columns: the sidebar is docked beside the chat, exactly as before', () => {
    const solved = solveLayout(request(80, 24, true), CHROME);

    expect(solved.chatHidden).toBe(false);
    expect(solved.sidebar).not.toBeNull();
    expect(solved.sidebar!.width).toBe(20);
    expect(solved.chat.left).toBe(20);
    expect(solved.chat.width).toBe(60);
    expect(solved.chatLog.width).toBe(57);
  });

  it('132 columns: the chat grows and the sidebar keeps its width', () => {
    const solved = solveLayout(request(132, 40, true), CHROME);

    expect(solved.chatHidden).toBe(false);
    expect(solved.sidebar!.width).toBe(20);
    expect(solved.chat.width).toBe(112);
  });
});
