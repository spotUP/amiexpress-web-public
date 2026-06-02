/**
 * AmigaGuide viewer for the DOORMAN blessed UI.
 *
 * Thin adapter over web/backend/src/amigaguide/AmigaGuideParser.ts —
 * reuses the existing full-featured parser (macros, justification, all
 * inline commands) and renders into a blessed Panel+ScrollableBox.
 */

import * as path from 'path';

function getParser() {
  // Load from backend — require resolves relative to this file at runtime
  // (Doors/door-manager/dist/ → ../../../web/backend/src/amigaguide/)
  const candidates = [
    path.resolve(__dirname, '../../../web/backend/src/amigaguide/AmigaGuideParser'),
    path.resolve(__dirname, '../../../../web/backend/src/amigaguide/AmigaGuideParser'),
    path.resolve(__dirname, '../../../../../web/backend/src/amigaguide/AmigaGuideParser'),
  ];
  for (const p of candidates) {
    try { return require(p); } catch { /* try next */ }
  }
  // Also try require cache (already loaded by BBS server)
  for (const key of Object.keys(require.cache)) {
    if (key.includes('AmigaGuideParser')) return require.cache[key]?.exports ?? null;
  }
  return null;
}

export function showAmigaGuideViewer(screen: any, raw: string, title: string, onDone: () => void): void {
  const { Panel, ScrollableBox } = require('@amiexpress/bbs-door-sdk/engines/ui/blessed');

  const parserMod = getParser();
  if (!parserMod?.AmigaGuideParser) {
    return showPlainViewer(screen, raw, title, onDone);
  }

  const parser = new parserMod.AmigaGuideParser();
  const doc = parser.parse(raw);

  if (!doc.nodes.size) return showPlainViewer(screen, raw, title, onDone);

  const history: string[] = [];
  let currentNode: string = doc.mainNode || doc.nodes.keys().next().value;
  let scrollOffset = 0;

  // Layout
  const header = new Panel({ parent: screen, top: 0, left: 0, width: '100%', height: 3, tags: true, style: { fg: 'white', bg: 'blue', border: { fg: 'blue' } } } as any);
  const contentPanel = new Panel({ parent: screen, top: 3, left: 0, width: '100%', height: '100%-6', tags: true, style: { border: { fg: 'cyan' } } } as any);
  const contentBox = new ScrollableBox({ parent: contentPanel, top: 1, left: 1, width: '100%-2', height: '100%-2', tags: true, scrollable: true, alwaysScroll: true, style: { fg: 'white' } } as any);
  const footer = new Panel({ parent: screen, bottom: 0, left: 0, width: '100%', height: 3, tags: true, style: { fg: 'white', bg: 'blue', border: { fg: 'blue' } } } as any);

  function navigate(target: string): void {
    const key = target.toLowerCase();
    if (doc.nodes.has(key)) { history.push(currentNode); currentNode = key; scrollOffset = 0; render(); }
  }

  function render(): void {
    const node = doc.nodes.get(currentNode);
    if (!node) return;
    const nav = parser.getNavigationInfo(currentNode);

    (header as any).setContent(
      `{center}{cyan-fg}${(doc.database || title).replace(/[{}]/g, '')}{/cyan-fg}  {white-fg}${node.title.replace(/[{}]/g, '')}{/white-fg}{/center}`
    );

    // Use parser's own renderer (handles all formatting)
    const { lines, links } = parser.renderNode(currentNode, 80, 99999, 0);
    let content = lines.join('\n');

    if (links.length > 0) {
      content += '\n\n\x1b[90m' + '─'.repeat(40) + '\x1b[0m\n';
      links.forEach((l: any) => {
        content += `\x1b[33m[${l.index}]\x1b[0m \x1b[36m${l.text.replace(/[{}]/g, '')}\x1b[0m\n`;
      });
    }

    (contentBox as any).setContent(content);
    (contentBox as any).scrollTo(scrollOffset);

    const parts: string[] = [];
    if (history.length > 0) parts.push('{yellow-fg}B{/yellow-fg}ack');
    if (nav.help) parts.push('{yellow-fg}H{/yellow-fg}elp');
    if (nav.toc)  parts.push('{yellow-fg}C{/yellow-fg}ontents');
    if (nav.prev) parts.push('{yellow-fg}P{/yellow-fg}rev');
    if (nav.next) parts.push('{yellow-fg}N{/yellow-fg}ext');
    if (links.length > 0) parts.push(`{yellow-fg}1-${Math.min(9, links.length)}{/yellow-fg}=Link`);
    parts.push('{yellow-fg}↑↓PgUp/Dn{/yellow-fg} Scroll');
    parts.push('{yellow-fg}Q{/yellow-fg} Close');
    (footer as any).setContent(`{center}${parts.join('  ')}{/center}`);
    screen.render();
  }

  function close() {
    (screen as any).unkey(['b','B','n','N','p','P','c','C','h','H','q','Q','escape'], onKey);
    (screen as any).unkey(['up','down','pageup','pagedown'], onScroll);
    (screen as any).unkey(['1','2','3','4','5','6','7','8','9'], onNum);
    (header as any).destroy(); (contentPanel as any).destroy(); (footer as any).destroy();
    onDone(); screen.render();
  }

  function onKey(ch: string, key: any) {
    const nav = parser.getNavigationInfo(currentNode);
    const k = (ch || '').toLowerCase();
    const kn = (key?.name ?? '').toLowerCase();
    if (k === 'b') { if (history.length > 0) { currentNode = history.pop()!; scrollOffset = 0; render(); } return; }
    if (k === 'n' && nav.next) { navigate(nav.next); return; }
    if (k === 'p' && nav.prev) { navigate(nav.prev); return; }
    if (k === 'c' && nav.toc)  { navigate(nav.toc); return; }
    if (k === 'h' && nav.help) { navigate(nav.help); return; }
    if (k === 'q' || kn === 'escape') { close(); return; }
  }

  function onScroll(_: any, key: any) {
    const n = key?.name ?? '';
    if (n === 'up') (contentBox as any).scroll(-1);
    else if (n === 'down') (contentBox as any).scroll(1);
    else if (n === 'pageup') (contentBox as any).scroll(-20);
    else if (n === 'pagedown') (contentBox as any).scroll(20);
    screen.render();
  }

  function onNum(ch: string) {
    const n = parseInt(ch, 10);
    const link = parser.getLinkByIndex(currentNode, n);
    if (link) navigate(link.target);
  }

  (screen as any).key(['b','B','n','N','p','P','c','C','h','H','q','Q','escape'], onKey);
  (screen as any).key(['up','down','pageup','pagedown'], onScroll);
  (screen as any).key(['1','2','3','4','5','6','7','8','9'], onNum);
  render();
}

function showPlainViewer(screen: any, raw: string, title: string, onDone: () => void): void {
  const { Panel, ScrollableBox } = require('@amiexpress/bbs-door-sdk/engines/ui/blessed');
  const content = raw.replace(/[^\x09\x0a\x20-\x7e]/g, '').replace(/[{}]/g, (c) => `\\${c}`);
  const panel = new Panel({ parent: screen, top: 0, left: 0, width: '100%', height: '100%-3', label: ` ${title} `, tags: true, style: { border: { fg: 'cyan' } } } as any);
  const box = new ScrollableBox({ parent: panel, top: 1, left: 1, width: '100%-2', height: '100%-2', tags: false, scrollable: true, alwaysScroll: true, content } as any);
  const hint = new Panel({ parent: screen, bottom: 0, left: 0, width: '100%', height: 3, tags: true, content: '{center}[Q/ESC] Close  [↑/↓/PgUp/PgDn] Scroll{/center}', style: { fg: 'white', bg: 'blue', border: { fg: 'blue' } } } as any);
  function close() {
    (screen as any).unkey(['q','Q','escape'], close);
    (screen as any).unkey(['up','down','pageup','pagedown'], scroll);
    (panel as any).destroy(); (hint as any).destroy(); onDone(); screen.render();
  }
  function scroll(_: any, key: any) {
    const n = key?.name ?? '';
    if (n === 'up') (box as any).scroll(-1); else if (n === 'down') (box as any).scroll(1);
    else if (n === 'pageup') (box as any).scroll(-20); else if (n === 'pagedown') (box as any).scroll(20);
    screen.render();
  }
  (screen as any).key(['q','Q','escape'], close);
  (screen as any).key(['up','down','pageup','pagedown'], scroll);
  screen.render();
}
