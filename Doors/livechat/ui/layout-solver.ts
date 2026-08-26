/**
 * Where every panel goes, for any terminal size.
 *
 * The layout used to be plain subtraction - content height is the screen
 * height minus the menu minus the footer, chat width is the screen width
 * minus the sidebar - which is correct only while the screen is big enough
 * for all of it. Resize the browser to an awkward shape and those
 * subtractions go to zero or negative, and a panel handed a negative height
 * does not shrink, it draws over its neighbours. Reported 2026-08-26: "the
 * layout is easy to break by not resizing it aspect correct", and "in many
 * cases the input panel is not drawn" - the chat panel was covering it.
 *
 * So this does not compute sizes, it SOLVES them: the footer and the input
 * are reserved first because a chat you cannot type into is not a chat, the
 * sidebar yields next because it is the optional part, and nothing is ever
 * handed a size below one. Whatever is left over goes to the chat log.
 *
 * Pure, so every shape of window can be checked in a test instead of by
 * dragging a browser corner.
 */

export interface LayoutConstants {
  menuHeight: number;
  statusHeight: number;
  inputHeight: number;
  emojiButtonWidth: number;
}

export interface LayoutRequest {
  width: number;
  height: number;
  /** Whether the user wants the sidebar at all. */
  sidebarVisible: boolean;
  sidebarWidth: number;
  sidebarDock: string;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SolvedLayout {
  /** Rows between the menu bar and the footer. Never below one. */
  contentHeight: number;
  /** Null when there is no room for it, whatever the user asked for. */
  sidebar: Rect | null;
  chat: Rect;
  /** Inner log area, inside the chat panel's border. */
  chatLog: { width: number; height: number };
  input: { width: number; height: number };
  /** Zero when the window is too short to afford them. */
  statusHeight: number;
  menuHeight: number;
  emojiButton: { left: number; visible: boolean };
  statusBar: { width: number };
  /** Chat panel columns below which the sidebar is dropped. */
  usable: boolean;
}

/**
 * Narrowest chat panel worth keeping.
 *
 * Below this the sidebar goes, because a two-column chat log is not a
 * degraded chat window, it is a broken one.
 */
export const MIN_CHAT_WIDTH = 24;

/** Narrowest sidebar worth showing; thinner than this and it is noise. */
export const MIN_SIDEBAR_WIDTH = 8;

/** The layout is not usable below this - everything still gets valid geometry. */
export const MIN_USABLE_WIDTH = 20;
export const MIN_USABLE_HEIGHT = 6;

function atLeastOne(n: number): number {
  return Math.max(1, Math.floor(n));
}

export function solveLayout(request: LayoutRequest, constants: LayoutConstants): SolvedLayout {
  const width = atLeastOne(request.width);
  const height = atLeastOne(request.height);

  // The footer is reserved BEFORE anything else. A chat you cannot type into
  // is not a chat, so when the window is too short it is the content that
  // loses its rows, not the input box.
  //
  // But the content cannot go below one row, so on a REALLY short window
  // something has to give or the footer overlaps it - measured at 80x5: the
  // content ended on row 2 while the input anchored at row 1. The footer
  // shrinks instead, in order of how little it is missed: the input loses
  // its border rows first, then the status line goes, then the menu bar.
  let inputHeight = constants.inputHeight;
  let statusHeight = constants.statusHeight;
  let menuHeight = constants.menuHeight;

  const needed = () => menuHeight + statusHeight + inputHeight + 1;

  if (needed() > height) inputHeight = Math.max(1, height - menuHeight - statusHeight - 1);
  if (needed() > height) statusHeight = 0;
  if (needed() > height) menuHeight = 0;

  const contentHeight = atLeastOne(height - menuHeight - statusHeight - inputHeight);

  // The sidebar is the part that yields. It is clamped to whatever leaves the
  // chat panel a usable width, and dropped entirely when that leaves nothing
  // worth showing.
  let sidebarWidth = 0;
  if (request.sidebarVisible && (request.sidebarDock === 'left' || request.sidebarDock === 'right')) {
    const affordable = width - MIN_CHAT_WIDTH;
    const clamped = Math.min(Math.floor(request.sidebarWidth), affordable);
    sidebarWidth = clamped >= MIN_SIDEBAR_WIDTH ? clamped : 0;
  }

  const dockedLeft = request.sidebarDock === 'left';

  const sidebar: Rect | null = sidebarWidth > 0
    ? {
        left: dockedLeft ? 0 : width - sidebarWidth,
        top: menuHeight,
        width: sidebarWidth,
        height: contentHeight,
      }
    : null;

  const chatWidth = atLeastOne(width - sidebarWidth);
  const chat: Rect = {
    left: sidebar && dockedLeft ? sidebarWidth : 0,
    top: menuHeight,
    width: chatWidth,
    height: contentHeight,
  };

  // chatWidth - 3, not - 2: the panel's two border columns plus one column
  // for the scrollbar, which Element draws at the log's own last column.
  const chatLog = {
    width: atLeastOne(chatWidth - 3),
    height: atLeastOne(contentHeight - 2),
  };

  // The emoji button gives up its corner rather than push the input to
  // nothing - on a very narrow window, typing matters more than the button.
  const emojiFits = width - constants.emojiButtonWidth >= MIN_CHAT_WIDTH;

  return {
    contentHeight,
    sidebar,
    chat,
    chatLog,
    input: {
      width: atLeastOne(emojiFits ? width - constants.emojiButtonWidth : width),
      height: inputHeight,
    },
    statusHeight,
    menuHeight,
    emojiButton: {
      left: Math.max(0, width - constants.emojiButtonWidth),
      visible: emojiFits,
    },
    statusBar: { width },
    usable: width >= MIN_USABLE_WIDTH && height >= MIN_USABLE_HEIGHT,
  };
}
