"use strict";
/**
 * AmigaGuide viewer for the DOORMAN blessed UI.
 *
 * Wraps web/backend/src/amigaguide/AmigaGuideParser.ts in a blessed UI
 * with node navigation and keyboard-selectable links.
 *
 * Keys:
 *   ↑/↓/PgUp/PgDn — scroll content
 *   Tab / ↓ (in link area) — cycle through links
 *   Enter — follow selected link
 *   1-9 — follow link by number
 *   B — back,  N — next,  P — prev,  C — contents,  H — help
 *   Q / ESC — close
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.showAmigaGuideViewer = showAmigaGuideViewer;
const path = __importStar(require("path"));
const door_theme_1 = require("./door-theme");
function getParser() {
    const candidates = [
        path.resolve(__dirname, '../../../web/backend/src/amigaguide/AmigaGuideParser'),
        path.resolve(__dirname, '../../../../web/backend/src/amigaguide/AmigaGuideParser'),
        path.resolve(__dirname, '../../../../../web/backend/src/amigaguide/AmigaGuideParser'),
    ];
    for (const p of candidates) {
        try {
            return require(p);
        }
        catch { /* try next */ }
    }
    for (const key of Object.keys(require.cache)) {
        if (key.includes('AmigaGuideParser'))
            return require.cache[key]?.exports ?? null;
    }
    return null;
}
function showAmigaGuideViewer(screen, raw, title, onDone) {
    const { Panel, ScrollableBox } = require('@amiexpress/bbs-door-sdk/engines/ui/blessed');
    const parserMod = getParser();
    if (!parserMod?.AmigaGuideParser)
        return showPlainViewer(screen, raw, title, onDone);
    const parser = new parserMod.AmigaGuideParser();
    const doc = parser.parse(raw);
    if (!doc.nodes.size)
        return showPlainViewer(screen, raw, title, onDone);
    const history = [];
    let currentNode = doc.mainNode || doc.nodes.keys().next().value;
    let selectedLink = 0; // 0 = none selected, 1+ = link index
    const header = new Panel({ parent: screen, top: 0, left: 0, width: '100%', height: 3, tags: true, style: { fg: door_theme_1.T.ink, bg: door_theme_1.T.bar, border: { fg: door_theme_1.T.accentAlt } } });
    const contentPanel = new Panel({ parent: screen, top: 3, left: 0, width: '100%', height: '100%-6', tags: true, style: { border: { fg: door_theme_1.T.accent } } });
    const contentBox = new ScrollableBox({ parent: contentPanel, top: 1, left: 1, width: '100%-2', height: '100%-2', tags: true, scrollable: true, alwaysScroll: true, style: { fg: door_theme_1.T.ink } });
    const footer = new Panel({ parent: screen, bottom: 0, left: 0, width: '100%', height: 3, tags: true, style: { fg: door_theme_1.T.ink, bg: door_theme_1.T.bar, border: { fg: door_theme_1.T.accentAlt } } });
    function navigate(target) {
        const key = target.toLowerCase();
        if (doc.nodes.has(key)) {
            history.push(currentNode);
            currentNode = key;
            selectedLink = 0;
            render();
        }
    }
    function render() {
        const node = doc.nodes.get(currentNode);
        if (!node)
            return;
        const nav = parser.getNavigationInfo(currentNode);
        const { lines, links } = parser.renderNode(currentNode, 80, 99999, 0);
        header.setContent(`{center}{${door_theme_1.T.accent}-fg}${(doc.database || title).replace(/[{}]/g, '')}{/${door_theme_1.T.accent}-fg}  {${door_theme_1.T.ink}-fg}${node.title.replace(/[{}]/g, '')}{/${door_theme_1.T.ink}-fg}{/center}`);
        let content = lines.join('\n');
        if (links.length > 0) {
            content += '\n\n\x1b[90m' + '─'.repeat(40) + '\x1b[0m\n';
            links.forEach((l, i) => {
                const num = i + 1;
                const isSelected = selectedLink === num;
                const linkText = l.text.replace(/^["']|["']$/g, '').replace(/[{}]/g, '').trim();
                if (isSelected) {
                    content += `\x1b[30;43m [${num}] ${linkText} \x1b[0m\n`;
                }
                else {
                    content += `\x1b[33m[${num}]\x1b[0m \x1b[36m${linkText}\x1b[0m\n`;
                }
            });
        }
        contentBox.setContent(content);
        if (selectedLink > 0 && links.length > 0) {
            // Scroll to show the selected link (it's after the main content)
            const totalLines = lines.length + 2 + links.length;
            const linkLine = lines.length + 2 + selectedLink - 1;
            contentBox.scrollTo(Math.max(0, linkLine - 5));
        }
        const parts = [];
        if (history.length > 0)
            parts.push(`{${door_theme_1.T.warn}-fg}B{/${door_theme_1.T.warn}-fg}ack`);
        if (nav.help)
            parts.push(`{${door_theme_1.T.warn}-fg}H{/${door_theme_1.T.warn}-fg}elp`);
        if (nav.toc)
            parts.push(`{${door_theme_1.T.warn}-fg}C{/${door_theme_1.T.warn}-fg}ontents`);
        if (nav.prev)
            parts.push(`{${door_theme_1.T.warn}-fg}P{/${door_theme_1.T.warn}-fg}rev`);
        if (nav.next)
            parts.push(`{${door_theme_1.T.warn}-fg}N{/${door_theme_1.T.warn}-fg}ext`);
        if (links.length > 0) {
            parts.push(`{${door_theme_1.T.warn}-fg}Tab{/${door_theme_1.T.warn}-fg}=Cycle links`);
            parts.push(`{${door_theme_1.T.warn}-fg}Enter{/${door_theme_1.T.warn}-fg}=Follow`);
        }
        parts.push(`{${door_theme_1.T.warn}-fg}↑↓PgUp/Dn{/${door_theme_1.T.warn}-fg}`);
        parts.push(`{${door_theme_1.T.warn}-fg}Q{/${door_theme_1.T.warn}-fg}`);
        footer.setContent(`{center}${parts.join('  ')}{/center}`);
        screen.render();
    }
    function close() {
        screen.unkey(['b', 'B', 'n', 'N', 'p', 'P', 'c', 'C', 'h', 'H', 'q', 'Q', 'escape'], onKey);
        screen.unkey(['up', 'down', 'pageup', 'pagedown'], onScroll);
        screen.unkey(['1', '2', '3', '4', '5', '6', '7', '8', '9'], onNum);
        screen.unkey(['tab'], onTab);
        screen.unkey(['enter', 'return', '\r', '\n'], onEnter);
        header.destroy();
        contentPanel.destroy();
        footer.destroy();
        onDone();
        screen.render();
    }
    function onKey(ch, key) {
        const nav = parser.getNavigationInfo(currentNode);
        const node = doc.nodes.get(currentNode);
        const k = (ch || '').toLowerCase();
        const kn = (key?.name ?? '').toLowerCase();
        if (k === 'b') {
            if (history.length > 0) {
                currentNode = history.pop();
                selectedLink = 0;
                render();
            }
            return;
        }
        if (k === 'n' && nav.next) {
            navigate(nav.next);
            return;
        }
        if (k === 'p' && nav.prev) {
            navigate(nav.prev);
            return;
        }
        if (k === 'c' && nav.toc) {
            navigate(nav.toc);
            return;
        }
        if (k === 'h' && nav.help) {
            navigate(nav.help);
            return;
        }
        if (k === 'q' || kn === 'escape') {
            close();
            return;
        }
    }
    function onScroll(_, key) {
        const node = doc.nodes.get(currentNode);
        const linkCount = node?.links?.length ?? 0;
        const n = key?.name ?? '';
        // If links are shown and we're navigating down, cycle links instead of scroll
        if (selectedLink > 0 && n === 'down' && selectedLink < linkCount) {
            selectedLink++;
            render();
            return;
        }
        if (selectedLink > 0 && n === 'up') {
            if (selectedLink > 1) {
                selectedLink--;
                render();
            }
            else {
                selectedLink = 0;
                render();
            }
            return;
        }
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
    function onTab() {
        const node = doc.nodes.get(currentNode);
        const linkCount = node?.links?.length ?? 0;
        if (linkCount === 0)
            return;
        selectedLink = selectedLink >= linkCount ? 1 : selectedLink + 1;
        render();
    }
    function onEnter() {
        const node = doc.nodes.get(currentNode);
        const links = node?.links ?? [];
        if (links.length === 0)
            return;
        // If no link selected, auto-select and follow link 1
        if (selectedLink < 1)
            selectedLink = 1;
        const link = parser.getLinkByIndex(currentNode, selectedLink);
        if (link)
            navigate(link.target);
    }
    function onNum(ch) {
        const n = parseInt(ch, 10);
        const link = parser.getLinkByIndex(currentNode, n);
        if (link) {
            selectedLink = n;
            navigate(link.target);
        }
    }
    screen.key(['b', 'B', 'n', 'N', 'p', 'P', 'c', 'C', 'h', 'H', 'q', 'Q', 'escape'], onKey);
    screen.key(['up', 'down', 'pageup', 'pagedown'], onScroll);
    screen.key(['1', '2', '3', '4', '5', '6', '7', '8', '9'], onNum);
    screen.key(['tab'], onTab);
    screen.key(['enter', 'return', '\r', '\n'], onEnter);
    render();
}
function showPlainViewer(screen, raw, title, onDone) {
    const { Panel, ScrollableBox } = require('@amiexpress/bbs-door-sdk/engines/ui/blessed');
    const content = raw.replace(/[^\x09\x0a\x20-\x7e]/g, '').replace(/[{}]/g, (c) => `\\${c}`);
    const panel = new Panel({ parent: screen, top: 0, left: 0, width: '100%', height: '100%-3', label: ` ${title} `, tags: true, style: { border: { fg: door_theme_1.T.accent } } });
    const box = new ScrollableBox({ parent: panel, top: 1, left: 1, width: '100%-2', height: '100%-2', tags: false, scrollable: true, alwaysScroll: true, content });
    const hint = new Panel({ parent: screen, bottom: 0, left: 0, width: '100%', height: 3, tags: true, content: '{center}[Q/ESC] Close  [↑/↓/PgUp/PgDn] Scroll{/center}', style: { fg: door_theme_1.T.ink, bg: door_theme_1.T.bar, border: { fg: door_theme_1.T.accentAlt } } });
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