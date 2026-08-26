/**
 * The LiveChat layout holds at any window shape
 * (Doors/livechat/ui/layout-solver.ts).
 *
 * Reported 2026-08-26: "the layout is easy to break by not resizing it aspect
 * correct", and "in many cases the input panel is not drawn".
 *
 * The layout was plain subtraction - content height is the screen height
 * minus the menu minus the footer, chat width is the width minus the sidebar
 * - which is right only while the screen is big enough for all of it. At an
 * awkward shape those go to zero or negative, and a panel handed a negative
 * height does not shrink, it draws over its neighbours. That is why the input
 * box vanished: the chat panel was on top of it.
 *
 * The sizes are solved under constraints now, so this sweeps every shape a
 * browser window can be dragged into rather than checking the tidy ones.
 */

import {
  solveLayout,
  MIN_CHAT_WIDTH,
  MIN_SIDEBAR_WIDTH,
} from '../../../../Doors/livechat/ui/layout-solver';

const CONSTANTS = {
  menuHeight: 1,
  statusHeight: 1,
  inputHeight: 3,
  emojiButtonWidth: 6,
};

function solve(width: number, height: number, sidebarWidth = 15, sidebarVisible = true) {
  return solveLayout(
    { width, height, sidebarVisible, sidebarWidth, sidebarDock: 'left' },
    CONSTANTS
  );
}

/** Shapes a browser window actually gets dragged into. */
const SHAPES: [number, number][] = [
  [80, 24],    // the classic
  [200, 50],   // maximised
  [300, 8],    // a letterbox
  [240, 6],
  [30, 60],    // a column
  [20, 80],
  [12, 40],    // narrower than the sidebar
  [8, 8],      // absurd
  [1, 1],      // degenerate
  [40, 5],     // shorter than menu + footer
  [40, 4],
  [40, 1],
];

describe('every window shape', () => {
  for (const [width, height] of SHAPES) {
    describe(`${width}x${height}`, () => {
      const layout = solve(width, height);

      it('gives nothing a size below one', () => {
        const sizes = [
          layout.contentHeight,
          layout.chat.width,
          layout.chat.height,
          layout.chatLog.width,
          layout.chatLog.height,
          layout.input.width,
          layout.statusBar.width,
          ...(layout.sidebar ? [layout.sidebar.width, layout.sidebar.height] : []),
        ];

        expect(sizes.filter(s => s < 1)).toEqual([]);
      });

      it('puts nothing at a negative position', () => {
        const positions = [
          layout.chat.left,
          layout.chat.top,
          layout.emojiButton.left,
          ...(layout.sidebar ? [layout.sidebar.left, layout.sidebar.top] : []),
        ];

        expect(positions.filter(p => p < 0)).toEqual([]);
      });

      it('keeps the chat panel inside the window', () => {
        expect(layout.chat.left + layout.chat.width).toBeLessThanOrEqual(width);
      });

      it('leaves the footer its rows', () => {
        // The input box is what the chat panel used to cover. The content
        // must end above the footer, whatever the window does.
        const footerTop = height - (CONSTANTS.statusHeight + CONSTANTS.inputHeight);
        const contentBottom = layout.chat.top + layout.chat.height;

        if (height > CONSTANTS.menuHeight + CONSTANTS.statusHeight + CONSTANTS.inputHeight) {
          expect(contentBottom).toBeLessThanOrEqual(footerTop);
        }
      });
    });
  }
});

describe('what yields when space runs out', () => {
  it('drops the sidebar before squeezing the chat', () => {
    const layout = solve(MIN_CHAT_WIDTH + MIN_SIDEBAR_WIDTH - 1, 24);

    expect(layout.sidebar).toBeNull();
    expect(layout.chat.width).toBeGreaterThanOrEqual(MIN_CHAT_WIDTH);
  });

  it('keeps the sidebar when it fits', () => {
    const layout = solve(80, 24);

    expect(layout.sidebar).not.toBeNull();
    expect(layout.sidebar!.width).toBe(15);
    expect(layout.chat.left).toBe(15);
  });

  it('narrows the sidebar rather than dropping it, while it is still useful', () => {
    // 15 will not fit, but 10 will.
    const layout = solve(MIN_CHAT_WIDTH + 10, 24, 15);

    expect(layout.sidebar!.width).toBe(10);
    expect(layout.chat.width).toBe(MIN_CHAT_WIDTH);
  });

  it('gives the whole width to the chat when the sidebar is gone', () => {
    const layout = solve(30, 24, 15, false);

    expect(layout.sidebar).toBeNull();
    expect(layout.chat.left).toBe(0);
    expect(layout.chat.width).toBe(30);
  });

  it('gives up the emoji button before the input box', () => {
    // On a narrow window, typing matters more than the button.
    const narrow = solve(MIN_CHAT_WIDTH + 2, 24);

    expect(narrow.emojiButton.visible).toBe(false);
    expect(narrow.input.width).toBe(MIN_CHAT_WIDTH + 2);
  });

  it('keeps the emoji button when there is room', () => {
    const layout = solve(80, 24);

    expect(layout.emojiButton.visible).toBe(true);
    expect(layout.input.width).toBe(80 - CONSTANTS.emojiButtonWidth);
    expect(layout.emojiButton.left).toBe(80 - CONSTANTS.emojiButtonWidth);
  });
});

describe('a window too short for the chrome', () => {
  it('still gives the content a row', () => {
    // height 4 leaves nothing after menu + footer; the old arithmetic
    // produced -1 here, and a panel of height -1 draws over the footer.
    const layout = solve(80, 4);

    expect(layout.contentHeight).toBe(1);
    expect(layout.chat.height).toBe(1);
  });

  it('reports itself unusable without producing junk', () => {
    const layout = solve(8, 3);

    expect(layout.usable).toBe(false);
    expect(layout.chat.width).toBeGreaterThanOrEqual(1);
    expect(layout.chat.height).toBeGreaterThanOrEqual(1);
  });
});

describe('docking right', () => {
  const layout = solveLayout(
    { width: 80, height: 24, sidebarVisible: true, sidebarWidth: 15, sidebarDock: 'right' },
    CONSTANTS
  );

  it('puts the sidebar against the right edge', () => {
    expect(layout.sidebar!.left).toBe(80 - 15);
  });

  it('leaves the chat on the left', () => {
    expect(layout.chat.left).toBe(0);
    expect(layout.chat.width).toBe(80 - 15);
  });
});

describe('a floating sidebar', () => {
  it('does not take space from the chat', () => {
    const layout = solveLayout(
      { width: 80, height: 24, sidebarVisible: true, sidebarWidth: 15, sidebarDock: 'float' },
      CONSTANTS
    );

    expect(layout.sidebar).toBeNull();
    expect(layout.chat.width).toBe(80);
  });
});

describe('fractional sizes', () => {
  it('never emits a fractional position or size', () => {
    // A terminal cell is a whole cell; a half column is a rendering artefact.
    const layout = solve(80.6, 24.4);

    for (const n of [layout.chat.width, layout.chat.height, layout.chat.left, layout.contentHeight]) {
      expect(Number.isInteger(n)).toBe(true);
    }
  });
});
