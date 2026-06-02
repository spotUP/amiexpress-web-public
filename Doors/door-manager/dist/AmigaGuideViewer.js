"use strict";
/**
 * AmigaGuide viewer — full command support.
 *
 * Global:  @database @$VER @author @(c) @font @width @height @help @index
 *          @toc @macro @rem @remark @master @wordwrap @smartwrap
 * Node:    @node @endnode @next @prev @toc @help @title @keywords
 *          @onopen @onclose @wordwrap @smartwrap
 * Inline:  @{b}/@{ub}  @{i}/@{ui}  @{u}/@{uu}
 *          @{fg <col>}/@{bg <col>}  @{pard}
 *          @{jleft}/@{jright}/@{jcenter}
 *          @{lindent N}/@{rindent N}/@{pari N}
 *          @{settabs N…}/@{cleartabs}/@{tab N}/@{line}/@{clear}
 *          @{"text" link/alink/system/rx/rxs "target"}
 *          @{macroname}
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAmigaGuide = parseAmigaGuide;
exports.showAmigaGuideViewer = showAmigaGuideViewer;
const DISPLAY_WIDTH = 80;
// ─── Parser / Renderer ────────────────────────────────────────────────────────
const AMIGA_COLOURS = {
    text: 'white', shine: 'white', shadow: 'grey', fill: 'blue',
    filltext: 'white', background: 'black', highlight: 'yellow',
    black: 'black', white: 'white', grey: 'grey', gray: 'grey',
    red: 'red', green: 'green', blue: 'blue', cyan: 'cyan',
    magenta: 'magenta', yellow: 'yellow', orange: 'yellow', brown: 'yellow',
};
function mapColour(name) { return AMIGA_COLOURS[name.toLowerCase()] ?? 'white'; }
function stripBlessedTags(s) {
    return s.replace(/\{[^}]+\}/g, '').replace(/\\([{}])/g, '$1');
}
function padToWidth(text, width, align) {
    const visible = stripBlessedTags(text).length;
    const pad = Math.max(0, width - visible);
    if (align === 'center') {
        const l = Math.floor(pad / 2);
        return ' '.repeat(l) + text + ' '.repeat(pad - l);
    }
    if (align === 'right')
        return ' '.repeat(pad) + text;
    return text;
}
function renderNodeContent(rawLines, macros) {
    const links = [];
    let align = 'left';
    let lindent = 0;
    let rindent = 0;
    let tabStops = [];
    let col = 0; // current column position for tab expansion
    function expandMacros(s) {
        // Replace @{macroname} with expansion
        return s.replace(/@\{(\w+)\}/g, (_, name) => macros.get(name.toLowerCase()) ?? '');
    }
    function renderInline(line) {
        line = expandMacros(line);
        let out = '';
        let i = 0;
        let lineCol = lindent;
        while (i < line.length) {
            if (line[i] !== '@') {
                const ch = line[i++];
                if (ch === '{') {
                    out += '\\{';
                    lineCol++;
                }
                else if (ch === '}') {
                    out += '\\}';
                    lineCol++;
                }
                else {
                    out += ch;
                    lineCol++;
                }
                continue;
            }
            // @ followed by {
            if (line[i + 1] !== '{') {
                out += '@';
                i++;
                lineCol++;
                continue;
            }
            const close = line.indexOf('}', i + 2);
            if (close === -1) {
                out += '@';
                i++;
                lineCol++;
                continue;
            }
            const inner = line.slice(i + 2, close).trim();
            i = close + 1;
            // Link types
            const linkMatch = inner.match(/^"([^"]*?)"\s+(link|alink|system|rx|rxs)\s+"?([^"}]+)"?/i);
            if (linkMatch) {
                const [, display, kind, target] = linkMatch;
                const isExternal = target.includes('/');
                const linkKind = (kind.toLowerCase() === 'link' ? 'link'
                    : kind.toLowerCase() === 'alink' ? 'alink'
                        : kind.toLowerCase().startsWith('rx') ? 'rx'
                            : 'system');
                const idx = links.length + 1;
                links.push({ text: display, target, kind: isExternal ? 'external' : linkKind });
                const typeTag = linkKind === 'rx' ? '{grey-fg}[rx]{/grey-fg}' : linkKind === 'system' ? '{grey-fg}[sys]{/grey-fg}' : '';
                out += `{yellow-fg}[${idx}]{/yellow-fg} {cyan-fg}${display.replace(/[{}]/g, '')}{/cyan-fg}${typeTag}`;
                lineCol += 4 + display.length;
                continue;
            }
            // Simple formatting
            if (/^b$/i.test(inner)) {
                out += '{bold}';
                continue;
            }
            if (/^ub$/i.test(inner)) {
                out += '{/bold}';
                continue;
            }
            if (/^u$/i.test(inner)) {
                out += '{underline}';
                continue;
            }
            if (/^uu$/i.test(inner)) {
                out += '{/underline}';
                continue;
            }
            if (/^i$/i.test(inner)) {
                out += '{underline}';
                continue;
            } // italic → underline
            if (/^ui$/i.test(inner)) {
                out += '{/underline}';
                continue;
            }
            if (/^pard$/i.test(inner)) {
                out += '{/bold}{/underline}';
                align = 'left';
                lindent = 0;
                rindent = 0;
                continue;
            }
            // Colours
            const fgM = inner.match(/^fg\s+(\w+)/i);
            if (fgM) {
                out += `{${mapColour(fgM[1])}-fg}`;
                continue;
            }
            const bgM = inner.match(/^bg\s+(\w+)/i);
            if (bgM) {
                out += `{${mapColour(bgM[1])}-bg}`;
                continue;
            }
            // Justification
            if (/^jleft$/i.test(inner)) {
                align = 'left';
                continue;
            }
            if (/^jright$/i.test(inner)) {
                align = 'right';
                continue;
            }
            if (/^jcenter$/i.test(inner)) {
                align = 'center';
                continue;
            }
            // Indentation
            const liM = inner.match(/^lindent\s+(\d+)/i);
            if (liM) {
                lindent = parseInt(liM[1], 10);
                continue;
            }
            const riM = inner.match(/^rindent\s+(\d+)/i);
            if (riM) {
                rindent = parseInt(riM[1], 10);
                continue;
            }
            const piM = inner.match(/^pari\s+(\d+)/i);
            if (piM) { /* first-line indent — treat as lindent */
                lindent = parseInt(piM[1], 10);
                continue;
            }
            // Tabs
            if (/^settabs/i.test(inner)) {
                tabStops = inner.replace(/^settabs\s*/i, '').split(/\s+/).map(Number).filter(n => !isNaN(n));
                continue;
            }
            if (/^cleartabs$/i.test(inner)) {
                tabStops = [];
                continue;
            }
            const tabM = inner.match(/^tab\s+(\d+)/i);
            if (tabM) {
                const target = parseInt(tabM[1], 10);
                const spaces = Math.max(1, target - lineCol);
                out += ' '.repeat(spaces);
                lineCol += spaces;
                continue;
            }
            // Line / clear
            if (/^line$/i.test(inner)) {
                out += '\n';
                lineCol = lindent;
                continue;
            }
            if (/^clear$/i.test(inner)) {
                continue;
            } // clear to EOL — skip
            // Unknown — skip silently
        }
        let result = out;
        if (lindent > 0)
            result = ' '.repeat(lindent) + result;
        if (align !== 'left')
            result = padToWidth(result, DISPLAY_WIDTH - rindent, align);
        return result;
    }
    const rendered = rawLines.map(l => renderInline(l)).join('\n');
    return { rendered, links };
}
function parseAmigaGuide(raw) {
    const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        .replace(/[^\x09\x0a\x20-\x7e]/g, '');
    const lines = text.split('\n');
    const nodes = new Map();
    const macros = new Map();
    let dbTitle = '';
    let firstNode = '';
    let globalToc;
    let globalHelp;
    let inNode = false;
    let nodeName = '';
    let nodeTitle = '';
    let nodeNext;
    let nodePrev;
    let nodeToc;
    let nodeHelp;
    let nodeLines = [];
    function commitNode() {
        if (!inNode)
            return;
        const { rendered, links } = renderNodeContent(nodeLines, macros);
        const key = nodeName.toLowerCase();
        nodes.set(key, { name: nodeName, title: nodeTitle || nodeName, rendered, links, next: nodeNext, prev: nodePrev, toc: nodeToc ?? globalToc, help: nodeHelp ?? globalHelp });
        if (!firstNode)
            firstNode = key;
    }
    for (const line of lines) {
        // Skip comment lines
        if (/^;/.test(line))
            continue;
        if (!inNode) {
            // Global commands
            const dbM = line.match(/^@database\s+"?([^"\n]+)"?/i);
            if (dbM) {
                dbTitle = dbM[1].trim();
                continue;
            }
            const macroM = line.match(/^@macro\s+(\w+)\s+(.*)/i);
            if (macroM) {
                macros.set(macroM[1].toLowerCase(), macroM[2].trim());
                continue;
            }
            const tocM = line.match(/^@toc\s+"?([^"\s]+)"?/i);
            if (tocM) {
                globalToc = tocM[1];
                continue;
            }
            const helpM = line.match(/^@help\s+"?([^"\s]+)"?/i);
            if (helpM) {
                globalHelp = helpM[1];
                continue;
            }
            // Ignore: @$VER @author @(c) @font @width @height @master @index @wordwrap @smartwrap
            if (/^@(\$VER|author|\(c\)|font|width|height|master|index|wordwrap|smartwrap)/i.test(line))
                continue;
        }
        // @node
        const nodeM = line.match(/^@node\s+"?([^"\s]+)"?\s*(?:"([^"]*)")?/i);
        if (nodeM) {
            commitNode();
            inNode = true;
            nodeName = nodeM[1];
            nodeTitle = nodeM[2] ?? nodeM[1];
            nodeLines = [];
            nodeNext = nodePrev = nodeToc = nodeHelp = undefined;
            continue;
        }
        if (/^@endnode/i.test(line)) {
            commitNode();
            inNode = false;
            nodeLines = [];
            continue;
        }
        if (inNode) {
            const nextM = line.match(/^@next\s+"?([^"\s]+)"?/i);
            if (nextM) {
                nodeNext = nextM[1];
                continue;
            }
            const prevM = line.match(/^@prev\s+"?([^"\s]+)"?/i);
            if (prevM) {
                nodePrev = prevM[1];
                continue;
            }
            const tocM = line.match(/^@toc\s+"?([^"\s]+)"?/i);
            if (tocM) {
                nodeToc = tocM[1];
                continue;
            }
            const helpM = line.match(/^@help\s+"?([^"\s]+)"?/i);
            if (helpM) {
                nodeHelp = helpM[1];
                continue;
            }
            const ttlM = line.match(/^@title\s+"?([^"]+)"?/i);
            if (ttlM) {
                nodeTitle = ttlM[1].trim();
                continue;
            }
            // Ignore node-level non-content commands
            if (/^@(keywords|onopen|onclose|wordwrap|smartwrap|rem|remark)/i.test(line))
                continue;
            nodeLines.push(line);
        }
    }
    commitNode();
    if (!firstNode && nodes.size > 0)
        firstNode = nodes.keys().next().value ?? '';
    return { dbTitle, nodes, firstNode, globalToc, globalHelp };
}
// ─── Blessed UI ───────────────────────────────────────────────────────────────
function showAmigaGuideViewer(screen, raw, title, onDone) {
    const { Panel, ScrollableBox } = require('@amiexpress/bbs-door-sdk/engines/ui/blessed');
    const doc = parseAmigaGuide(raw);
    if (doc.nodes.size === 0)
        return showPlainViewer(screen, raw, title, onDone);
    const history = [];
    let currentKey = doc.firstNode;
    const header = new Panel({ parent: screen, top: 0, left: 0, width: '100%', height: 3, tags: true, style: { fg: 'white', bg: 'blue', border: { fg: 'blue' } } });
    const contentPanel = new Panel({ parent: screen, top: 3, left: 0, width: '100%', height: '100%-6', tags: true, style: { border: { fg: 'cyan' } } });
    const contentBox = new ScrollableBox({ parent: contentPanel, top: 1, left: 1, width: '100%-2', height: '100%-2', tags: true, scrollable: true, alwaysScroll: true, style: { fg: 'white' } });
    const footer = new Panel({ parent: screen, bottom: 0, left: 0, width: '100%', height: 3, tags: true, style: { fg: 'white', bg: 'blue', border: { fg: 'blue' } } });
    function navigate(target) {
        const key = target.toLowerCase();
        if (doc.nodes.has(key)) {
            history.push(currentKey);
            render(key);
        }
        else { /* cross-doc or unknown — ignore */ }
    }
    function render(key) {
        currentKey = key;
        const node = doc.nodes.get(key);
        if (!node)
            return;
        header.setContent(`{center}{cyan-fg}${(doc.dbTitle || title).replace(/[{}]/g, '')}{/cyan-fg}  {white-fg}${node.title.replace(/[{}]/g, '')}{/white-fg}{/center}`);
        let content = node.rendered;
        if (node.links.length > 0) {
            content += '\n\n{grey-fg}' + '─'.repeat(40) + '{/grey-fg}\n';
            node.links.forEach((l, i) => {
                const kind = l.kind !== 'link' && l.kind !== 'alink' ? ` {grey-fg}(${l.kind}){/grey-fg}` : '';
                content += `{yellow-fg}[${i + 1}]{/yellow-fg} {cyan-fg}${l.text.replace(/[{}]/g, '')}{/cyan-fg}${kind}\n`;
            });
        }
        contentBox.setContent(content);
        contentBox.scrollTo(0);
        const parts = [];
        if (history.length > 0)
            parts.push('{yellow-fg}B{/yellow-fg}ack');
        if (node.help || doc.globalHelp)
            parts.push('{yellow-fg}H{/yellow-fg}elp');
        if (node.toc)
            parts.push('{yellow-fg}C{/yellow-fg}ontents');
        if (node.prev)
            parts.push('{yellow-fg}P{/yellow-fg}rev');
        if (node.next)
            parts.push('{yellow-fg}N{/yellow-fg}ext');
        if (node.links.length > 0)
            parts.push(`{yellow-fg}1-${Math.min(9, node.links.length)}{/yellow-fg}=Link`);
        parts.push('{yellow-fg}↑↓{/yellow-fg}PgUp/Dn');
        parts.push('{yellow-fg}Q{/yellow-fg} Close');
        footer.setContent(`{center}${parts.join('  ')}{/center}`);
        screen.render();
    }
    function close() {
        screen.unkey(['b', 'B', 'n', 'N', 'p', 'P', 'c', 'C', 'h', 'H', 'q', 'Q', 'escape'], onKey);
        screen.unkey(['up', 'down', 'pageup', 'pagedown'], onScroll);
        screen.unkey(['1', '2', '3', '4', '5', '6', '7', '8', '9'], onNum);
        header.destroy();
        contentPanel.destroy();
        footer.destroy();
        onDone();
        screen.render();
    }
    function onKey(ch, key) {
        const node = doc.nodes.get(currentKey);
        const k = (ch || '').toLowerCase();
        const kn = (key?.name ?? '').toLowerCase();
        if (k === 'b') {
            if (history.length > 0)
                render(history.pop());
            return;
        }
        if (k === 'n' && node?.next) {
            navigate(node.next);
            return;
        }
        if (k === 'p' && node?.prev) {
            navigate(node.prev);
            return;
        }
        if (k === 'c' && node?.toc) {
            navigate(node.toc);
            return;
        }
        if (k === 'h') {
            const h = node?.help ?? doc.globalHelp;
            if (h)
                navigate(h);
            return;
        }
        if (k === 'q' || kn === 'escape') {
            close();
            return;
        }
    }
    function onScroll(_, key) {
        const n = key?.name ?? '';
        if (n === 'up')
            contentBox.scroll(-1);
        else if (n === 'down')
            contentBox.scroll(1);
        else if (n === 'pageup')
            contentBox.scroll(-20);
        else if (n === 'pagedown')
            contentBox.scroll(20);
        screen.render();
    }
    function onNum(ch) {
        const n = parseInt(ch, 10);
        const node = doc.nodes.get(currentKey);
        if (node && n >= 1 && n <= node.links.length)
            navigate(node.links[n - 1].target);
    }
    screen.key(['b', 'B', 'n', 'N', 'p', 'P', 'c', 'C', 'h', 'H', 'q', 'Q', 'escape'], onKey);
    screen.key(['up', 'down', 'pageup', 'pagedown'], onScroll);
    screen.key(['1', '2', '3', '4', '5', '6', '7', '8', '9'], onNum);
    render(currentKey);
}
function showPlainViewer(screen, raw, title, onDone) {
    const { Panel, ScrollableBox } = require('@amiexpress/bbs-door-sdk/engines/ui/blessed');
    const content = raw.replace(/[^\x09\x0a\x20-\x7e]/g, '').replace(/[{}]/g, (c) => `\\${c}`);
    const panel = new Panel({ parent: screen, top: 0, left: 0, width: '100%', height: '100%-3', label: ` ${title} `, tags: true, style: { border: { fg: 'cyan' } } });
    const box = new ScrollableBox({ parent: panel, top: 1, left: 1, width: '100%-2', height: '100%-2', tags: false, scrollable: true, alwaysScroll: true, content });
    const hint = new Panel({ parent: screen, bottom: 0, left: 0, width: '100%', height: 3, tags: true, content: '{center}[Q/ESC] Close  [↑/↓/PgUp/PgDn] Scroll{/center}', style: { fg: 'white', bg: 'blue', border: { fg: 'blue' } } });
    function close() {
        screen.unkey(['q', 'Q', 'escape'], close);
        screen.unkey(['up', 'down', 'pageup', 'pagedown'], scroll);
        panel.destroy();
        hint.destroy();
        onDone();
        screen.render();
    }
    function scroll(_, key) {
        const n = key?.name ?? '';
        if (n === 'up')
            box.scroll(-1);
        else if (n === 'down')
            box.scroll(1);
        else if (n === 'pageup')
            box.scroll(-20);
        else if (n === 'pagedown')
            box.scroll(20);
        screen.render();
    }
    screen.key(['q', 'Q', 'escape'], close);
    screen.key(['up', 'down', 'pageup', 'pagedown'], scroll);
    screen.render();
}
//# sourceMappingURL=AmigaGuideViewer.js.map