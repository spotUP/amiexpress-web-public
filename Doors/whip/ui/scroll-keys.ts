/**
 * Arrow/wheel scrolling for plain scrollable panes (2026-09-10).
 *
 * No widget in this SDK port binds arrow keys to scrolling, so a
 * scrollable box with keys:true still sits still (achievements,
 * leaderboard) unless the door drives it - the timeline drives its
 * own scrollTo per selection. One helper instead of a third copy:
 * arrows step, PageUp/PageDown jump, Home/End bound the ends, the
 * wheel follows the arrows.
 */
export function bindBoxScroll(
  screen: {
    on: (event: string, handler: (ch: unknown, key: any) => void) => void;
    off: (event: string, handler: (ch: unknown, key: any) => void) => void;
  },
  box: { scrollTo: (n: number) => void; getScroll: () => number; getScrollHeight: () => number; on: (event: string, handler: () => void) => void },
  opts?: { step?: number; page?: number }
): () => void {
  const step = opts?.step ?? 3;
  const page = opts?.page ?? 10;
  const max = () => Math.max(0, box.getScrollHeight());
  const to = (n: number) => box.scrollTo(Math.max(0, Math.min(max(), n)));
  const keyHandler = (_ch: unknown, key: any) => {
    switch (key?.name) {
      case 'up': to(box.getScroll() - step); break;
      case 'down': to(box.getScroll() + step); break;
      case 'pageup': to(box.getScroll() - page); break;
      case 'pagedown': to(box.getScroll() + page); break;
      case 'home': to(0); break;
      case 'end': to(max()); break;
      default: return;
    }
  };
  const wheelUp = () => to(box.getScroll() - step);
  const wheelDown = () => to(box.getScroll() + step);
  screen.on('keypress', keyHandler);
  box.on('wheelup', wheelUp);
  box.on('wheeldown', wheelDown);
  // The screen outlives the pane (one Screen per door visit), so a
  // leftover handler would scroll a destroyed box under the next
  // screen. Screens call the returned unbind in cleanup.
  return () => screen.off('keypress', keyHandler);
}
