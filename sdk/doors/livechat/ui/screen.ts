/** Neo-blessed screen factory */
export function createScreen(blessed: any) {
  return blessed.screen({
    smartCSR: true,
    title: 'LiveChat v2.0',
    fullUnicode: true,
    dockBorders: true,
    autoPadding: true
  });
}

/** Top bar component */
export function createTopBar(blessed: any, screen: any, content: string) {
  return blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    content,
    style: { fg: 'white', bg: 'blue', bold: true }
  });
}

/** Status bar component */
export function createStatusBar(blessed: any, screen: any) {
  return blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: ' Tab:Switch | Up/Dn:Navigate | Enter:Select | /:Commands | Esc:Menu | Q:Quit',
    style: { fg: 'black', bg: 'cyan' }
  });
}

/** Format top bar content */
export function formatTopBar(username: string, nodeId: number, channel: string, status: string): string {
  return ` LiveChat v2.0 | @${username} | Node ${nodeId} | ${status} | #${channel} | F1=Help`;
}
