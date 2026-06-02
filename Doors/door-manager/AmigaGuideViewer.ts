/**
 * AmigaGuide viewer for the DOORMAN blessed UI.
 *
 * Parses AmigaGuide hypertext (.guide) documents into named nodes,
 * renders inline markup to blessed tags, and provides node navigation
 * (links, Next/Prev/Toc, history stack).
 *
 * Reference: http://www.lysator.liu.se/amiga/code/guide/amigaguide.guide
 */

// ─── Parser ───────────────────────────────────────────────────────────────────

export interface AgLink {
  text: string;
  target: string;
}

export interface AgNode {
  name: string;
  title: string;
  rendered: string;    // blessed-tagged content
  links: AgLink[];
  next?: string;
  prev?: string;
  toc?: string;
}

export interface AgDocument {
  dbTitle: string;
  nodes: Map<string, AgNode>;
  firstNode: string;
}

export function parseAmigaGuide(raw: string): AgDocument {
  // Normalise line endings, strip high-bit chars
  const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .replace(/[^\x09\x0a\x20-\x7e]/g, '');

  const lines = text.split('\n');
  const nodes = new Map<string, AgNode>();
  let dbTitle = '';
  let firstNode = '';

  // ── Inline renderer ──────────────────────────────────────────────────────
  function renderLine(line: string, links: AgLink[]): string {
    let out = '';
    let i = 0;
    while (i < line.length) {
      if (line[i] === '@' && line[i + 1] === '{') {
        const close = line.indexOf('}', i + 2);
        if (close === -1) { out += line[i++]; continue; }
        const inner = line.slice(i + 2, close).trim();
        i = close + 1;

        // Link: @{"display text" link "NodeName"}
        const linkMatch = inner.match(/^"([^"]*?)"\s+(?:link|alink)\s+"?([^"}\s]+)"?/i);
        if (linkMatch) {
          const [, display, target] = linkMatch;
          const idx = links.length + 1;
          links.push({ text: display, target });
          out += `{yellow-fg}[${idx}] ${display}{/yellow-fg}`;
          continue;
        }

        // Bold
        if (/^b$/i.test(inner)) { out += '{bold}'; continue; }
        if (/^ub$/i.test(inner)) { out += '{/bold}'; continue; }
        // Underline
        if (/^u$/i.test(inner)) { out += '{underline}'; continue; }
        if (/^uu$/i.test(inner)) { out += '{/underline}'; continue; }
        // Italic (approximate with underline since BBS has no italic)
        if (/^i$/i.test(inner)) { out += '{underline}'; continue; }
        if (/^ui$/i.test(inner)) { out += '{/underline}'; continue; }
        // Foreground colour
        const fgMatch = inner.match(/^fg\s+(\w+)/i);
        if (fgMatch) {
          const col = mapAmigaColour(fgMatch[1]);
          if (col) { out += `{${col}-fg}`; } continue;
        }
        // Background colour
        const bgMatch = inner.match(/^bg\s+(\w+)/i);
        if (bgMatch) {
          const col = mapAmigaColour(bgMatch[1]);
          if (col) { out += `{${col}-bg}`; } continue;
        }
        // Justification, indent, tabs — skip
        if (/^(j|lindent|pindent|rindent|settabs|cleartabs|line|clear)/i.test(inner)) continue;
        // Unknown — skip
      } else {
        // Escape blessed curly braces in plain text
        const ch = line[i++];
        if (ch === '{') out += '\\{';
        else if (ch === '}') out += '\\}';
        else out += ch;
      }
    }
    return out;
  }

  function mapAmigaColour(name: string): string | null {
    const map: Record<string, string> = {
      text: 'white', shine: 'white', shadow: 'grey', fill: 'blue',
      filltext: 'white', background: 'black', highlight: 'yellow',
      black: 'black', white: 'white', grey: 'grey', gray: 'grey',
      red: 'red', green: 'green', blue: 'blue', cyan: 'cyan',
      magenta: 'magenta', yellow: 'yellow', orange: 'yellow',
    };
    return map[name.toLowerCase()] ?? null;
  }

  // ── Split into nodes ─────────────────────────────────────────────────────
  let currentName: string | null = null;
  let currentTitle = '';
  let nodeLines: string[] = [];
  let nodeNext: string | undefined;
  let nodePrev: string | undefined;
  let nodeToc: string | undefined;

  function commitNode() {
    if (!currentName) return;
    const links: AgLink[] = [];
    const rendered = nodeLines.map(l => renderLine(l, links)).join('\n');
    nodes.set(currentName.toLowerCase(), {
      name: currentName,
      title: currentTitle || currentName,
      rendered,
      links,
      next: nodeNext,
      prev: nodePrev,
      toc: nodeToc,
    });
    if (!firstNode) firstNode = currentName.toLowerCase();
  }

  for (const line of lines) {
    // Global commands (outside nodes)
    if (currentName === null) {
      const dbMatch = line.match(/^@database\s+"?([^"]+)"?/i);
      if (dbMatch) { dbTitle = dbMatch[1].trim(); continue; }
    }

    // @node
    const nodeMatch = line.match(/^@node\s+"?([^"\s]+)"?\s*(?:"([^"]*)")?/i);
    if (nodeMatch) {
      commitNode();
      currentName = nodeMatch[1];
      currentTitle = nodeMatch[2] ?? nodeMatch[1];
      nodeLines = [];
      nodeNext = nodePrev = nodeToc = undefined;
      continue;
    }

    if (/^@endnode/i.test(line)) {
      commitNode();
      currentName = null;
      nodeLines = [];
      continue;
    }

    if (currentName !== null) {
      // Node-level navigation commands
      const nextMatch = line.match(/^@next\s+"?([^"\s]+)"?/i);
      if (nextMatch) { nodeNext = nextMatch[1]; continue; }
      const prevMatch = line.match(/^@prev\s+"?([^"\s]+)"?/i);
      if (prevMatch) { nodePrev = prevMatch[1]; continue; }
      const tocMatch = line.match(/^@toc\s+"?([^"\s]+)"?/i);
      if (tocMatch) { nodeToc = tocMatch[1]; continue; }
      const titleMatch = line.match(/^@title\s+"?([^"]+)"?/i);
      if (titleMatch) { currentTitle = titleMatch[1].trim(); continue; }
      // Skip other block-level @ commands
      if (/^@(?:wordwrap|smartwrap|rem|remark|keywords|master|index|help|width|height|font|macro|onopen|onclose)/i.test(line)) continue;

      nodeLines.push(line);
    }
  }
  commitNode();

  if (!firstNode && nodes.size > 0) firstNode = nodes.keys().next().value ?? '';

  return { dbTitle, nodes, firstNode };
}

// ─── Blessed UI ───────────────────────────────────────────────────────────────

export function showAmigaGuideViewer(
  screen: any,
  raw: string,
  title: string,
  onDone: () => void
): void {
  const { Panel, ScrollableBox } = require('@amiexpress/bbs-door-sdk/engines/ui/blessed');
  const doc = parseAmigaGuide(raw);

  if (doc.nodes.size === 0) {
    // Fallback: not a valid guide, show raw stripped text
    return showPlainViewer(screen, raw, title, onDone);
  }

  const history: string[] = [];
  let selectedLink = 0;

  function nodeKey(name: string): string { return name.toLowerCase(); }

  function navigate(target: string): void {
    const key = nodeKey(target);
    if (doc.nodes.has(key)) {
      history.push(currentKey);
      render(key);
    }
  }

  let currentKey = doc.firstNode;

  // Layout
  const headerPanel = new Panel({
    parent: screen, top: 0, left: 0, width: '100%', height: 3,
    tags: true, style: { fg: 'white', bg: 'blue', border: { fg: 'blue' } },
  } as any);

  const contentPanel = new Panel({
    parent: screen, top: 3, left: 0, width: '100%', height: '100%-6',
    tags: true, style: { border: { fg: 'cyan' } },
  } as any);

  const contentBox = new ScrollableBox({
    parent: contentPanel, top: 1, left: 1, width: '100%-2', height: '100%-2',
    tags: true, scrollable: true, alwaysScroll: true,
    style: { fg: 'white' },
  } as any);

  const footerPanel = new Panel({
    parent: screen, bottom: 0, left: 0, width: '100%', height: 3,
    tags: true, style: { fg: 'white', bg: 'blue', border: { fg: 'blue' } },
  } as any);

  function render(key: string): void {
    currentKey = key;
    selectedLink = 0;
    const node = doc.nodes.get(key);
    if (!node) return;

    (headerPanel as any).setContent(
      `{center}{cyan-fg}${doc.dbTitle || title}{/cyan-fg}  {white-fg}${node.title}{/white-fg}{/center}`
    );

    let content = node.rendered;
    if (node.links.length > 0) {
      content += '\n\n{grey-fg}' + '─'.repeat(40) + '{/grey-fg}\n';
      node.links.forEach((l, i) => {
        content += `{yellow-fg}[${i + 1}]{/yellow-fg} ${l.text.replace(/[{}]/g, '')}\n`;
      });
    }
    (contentBox as any).setContent(content);
    (contentBox as any).scrollTo(0);

    const parts: string[] = [];
    if (history.length > 0) parts.push('{yellow-fg}B{/yellow-fg}ack');
    if (node.toc) parts.push('{yellow-fg}C{/yellow-fg}ontents');
    if (node.prev) parts.push('{yellow-fg}P{/yellow-fg}rev');
    if (node.next) parts.push('{yellow-fg}N{/yellow-fg}ext');
    if (node.links.length > 0) parts.push(`{yellow-fg}1-${node.links.length}{/yellow-fg} Follow link`);
    parts.push('{yellow-fg}↑/↓{/yellow-fg} Scroll');
    parts.push('{yellow-fg}Q{/yellow-fg} Close');
    (footerPanel as any).setContent(`{center}${parts.join('  ')}{/center}`);

    screen.render();
  }

  render(currentKey);

  function closeViewer(): void {
    (screen as any).unkey(['b', 'B', 'n', 'N', 'p', 'P', 'c', 'C', 'q', 'Q', 'escape'], keyHandler);
    (screen as any).unkey(['up', 'down', 'pageup', 'pagedown'], scrollHandler);
    (screen as any).unkey(['1','2','3','4','5','6','7','8','9'], numHandler);
    (headerPanel as any).destroy();
    (contentPanel as any).destroy();
    (footerPanel as any).destroy();
    onDone();
    screen.render();
  }

  function keyHandler(_: any, key: any) {
    const name = (key?.name ?? '').toLowerCase();
    const ch = (_ as string) ?? '';
    const node = doc.nodes.get(currentKey);

    if (ch === 'b' || ch === 'B') {
      if (history.length > 0) render(history.pop()!);
      return;
    }
    if ((ch === 'n' || ch === 'N') && node?.next) { navigate(node.next); return; }
    if ((ch === 'p' || ch === 'P') && node?.prev) { navigate(node.prev); return; }
    if ((ch === 'c' || ch === 'C') && node?.toc) { navigate(node.toc); return; }
    if (ch === 'q' || ch === 'Q' || name === 'escape') { closeViewer(); return; }
  }

  function scrollHandler(_: any, key: any) {
    const name = key?.name ?? '';
    if (name === 'up') (contentBox as any).scroll(-1);
    else if (name === 'down') (contentBox as any).scroll(1);
    else if (name === 'pageup') (contentBox as any).scroll(-20);
    else if (name === 'pagedown') (contentBox as any).scroll(20);
    screen.render();
  }

  function numHandler(ch: string) {
    const n = parseInt(ch, 10);
    const node = doc.nodes.get(currentKey);
    if (node && n >= 1 && n <= node.links.length) {
      navigate(node.links[n - 1].target);
    }
  }

  (screen as any).key(['b','B','n','N','p','P','c','C','q','Q','escape'], keyHandler);
  (screen as any).key(['up','down','pageup','pagedown'], scrollHandler);
  (screen as any).key(['1','2','3','4','5','6','7','8','9'], numHandler);
}

function showPlainViewer(screen: any, raw: string, title: string, onDone: () => void): void {
  const { Panel, ScrollableBox } = require('@amiexpress/bbs-door-sdk/engines/ui/blessed');
  const content = raw.replace(/[^\x09\x0a\x20-\x7e]/g, '')
    .replace(/[{}]/g, (c) => `\\${c}`);
  const panel = new Panel({
    parent: screen, top: 0, left: 0, width: '100%', height: '100%-3',
    label: ` ${title} `, tags: true, style: { border: { fg: 'cyan' } },
  } as any);
  const box = new ScrollableBox({
    parent: panel, top: 1, left: 1, width: '100%-2', height: '100%-2',
    tags: false, scrollable: true, alwaysScroll: true, content,
  } as any);
  const hint = new Panel({
    parent: screen, bottom: 0, left: 0, width: '100%', height: 3,
    tags: true, content: '{center}[Q/ESC] Close  [↑/↓/PgUp/PgDn] Scroll{/center}',
    style: { fg: 'white', bg: 'blue', border: { fg: 'blue' } },
  } as any);
  function close() {
    (screen as any).unkey(['q','Q','escape'], close);
    (screen as any).unkey(['up','down','pageup','pagedown'], scroll);
    (panel as any).destroy(); (hint as any).destroy(); onDone(); screen.render();
  }
  function scroll(_: any, key: any) {
    const n = key?.name ?? '';
    if (n === 'up') (box as any).scroll(-1);
    else if (n === 'down') (box as any).scroll(1);
    else if (n === 'pageup') (box as any).scroll(-20);
    else if (n === 'pagedown') (box as any).scroll(20);
    screen.render();
  }
  (screen as any).key(['q','Q','escape'], close);
  (screen as any).key(['up','down','pageup','pagedown'], scroll);
  screen.render();
}
