/** Create chat log component */
export function createChatLog(blessed: any, screen: any) {
  return blessed.log({
    parent: screen,
    top: 2,
    left: 16,
    width: '100%-16',
    height: '100%-8',
    border: { type: 'line' },
    style: { fg: 'white', bg: 'black', border: { fg: 'cyan' } },
    scrollback: 1000,
    scrollbar: { ch: '|', style: { inverse: true } },
    tags: true,
    alwaysScroll: true
  });
}

/** Scroll log to bottom */
export function scrollToBottom(log: any): void {
  log.setScrollPerc(100);
}

/** Clear log content */
export function clearLog(log: any): void {
  log.setContent('');
}
