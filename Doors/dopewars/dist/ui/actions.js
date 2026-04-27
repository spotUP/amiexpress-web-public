"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderActionBar = renderActionBar;
exports.showBuyOverlay = showBuyOverlay;
exports.showSellOverlay = showSellOverlay;
exports.showJetOverlay = showJetOverlay;
exports.showQuestionOverlay = showQuestionOverlay;
exports.showHighScores = showHighScores;
const blessed_1 = __importDefault(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
function renderActionBar(box, mode) {
    if (mode === 'combat') {
        box.setContent('  {bold}[F]{/}ight  {bold}[R]{/}un to...  {bold}[S]{/}urrender');
        return;
    }
    if (mode === 'question') {
        box.setContent('  Waiting for your answer...');
        return;
    }
    box.setContent('  {bold}[B]{/}uy  {bold}[S]{/}ell  {bold}[J]{/}et  {bold}[H]{/}iscores  {bold}[Q]{/}uit' +
        '    {grey-fg}bank/loan/guns triggered on arrival{/}');
}
function overlay(screen, opts) {
    return blessed_1.default.box({
        parent: screen,
        top: 'center', left: 'center',
        border: { type: 'line' },
        tags: true,
        style: { border: { fg: 'yellow' }, fg: 'white', bg: 'black' },
        ...opts,
    });
}
/* ─── Buy overlay ──────────────────────────────────────────
 * List navigation: up/down arrows.
 * Amount: [<] and [>] keys (left/right arrows), or type digits.
 * Enter to confirm, ESC to cancel.
 */
function showBuyOverlay(screen, market, state, onBuy, onCancel) {
    const coatFree = state.coatSize - state.drugs.reduce((s, d) => s + d.carried, 0);
    const box = overlay(screen, {
        width: 50,
        height: Math.min(market.prices.length, 12) + 6,
        label: ' BUY ',
    });
    const list = (0, blessed_helpers_1.createList)({
        parent: box,
        top: 0, left: 0,
        width: '100%-2',
        height: Math.min(market.prices.length, 12),
        style: { selected: { bg: 'blue', fg: 'white' } },
        keys: true, mouse: true,
        items: market.prices.map(p => `${p.name.padEnd(13)} ${('$' + Math.round(p.price).toLocaleString('en-US')).padStart(9)}`),
    });
    const statusBox = blessed_1.default.box({
        parent: box,
        bottom: 1, left: 0,
        width: '100%-2', height: 3,
        tags: true,
        style: { fg: 'white', bg: 'black' },
    });
    let amount = 1;
    let typing = false;
    function currentPrice() {
        const idx = list.selected ?? 0;
        return market.prices[idx]?.price ?? 0;
    }
    function maxAmount() {
        const price = currentPrice();
        const byMoney = price > 0 ? Math.floor(state.cash / price) : 9999;
        return Math.min(coatFree, byMoney);
    }
    function renderStatus() {
        const max = maxAmount();
        const price = currentPrice();
        const total = Math.round(price * amount);
        statusBox.setContent(`  Amount: {bold}{yellow-fg}${amount}{/}{/}  (max ${max})   Total: $${total.toLocaleString('en-US')}\n` +
            `  [<] less  [>] more  digits to type  [Enter] buy  [ESC] cancel`);
        screen.render();
    }
    function clampAmount() {
        const max = maxAmount();
        if (amount < 1)
            amount = 1;
        if (amount > max)
            amount = max;
    }
    let unbind;
    function cleanup() {
        unbind();
        list.removeAllListeners('select');
        box.destroy();
        screen.render();
    }
    const leftFn = () => { amount = Math.max(1, amount - 1); typing = false; renderStatus(); };
    const rightFn = () => { clampAmount(); amount = Math.min(maxAmount(), amount + 1); typing = false; renderStatus(); };
    const escapeFn = () => { cleanup(); onCancel(); };
    const enterFn = () => {
        clampAmount();
        if (amount >= 1) {
            const idx = list.selected ?? 0;
            const p = market.prices[idx];
            if (p) {
                cleanup();
                onBuy(p.index, amount);
            }
        }
    };
    const backspaceFn = () => {
        const s = String(amount).slice(0, -1);
        amount = s.length ? parseInt(s, 10) : 1;
        renderStatus();
    };
    // When list selection changes, reset amount
    list.on('action', () => { amount = 1; typing = false; renderStatus(); });
    const digitBindings = [];
    for (let d = 0; d <= 9; d++) {
        const digit = d;
        const fn = () => {
            if (!typing || amount === 0) {
                amount = digit;
                typing = true;
            }
            else {
                const n = parseInt(String(amount) + String(digit), 10);
                amount = n;
            }
            clampAmount();
            renderStatus();
        };
        digitBindings.push([[String(d)], fn]);
    }
    unbind = (0, blessed_helpers_1.bindKeys)(screen, [
        [['left'], leftFn],
        [['right'], rightFn],
        [['escape'], escapeFn],
        [['enter'], enterFn],
        [['backspace'], backspaceFn],
        ...digitBindings,
    ]);
    list.focus();
    renderStatus();
}
/* ─── Sell overlay ─────────────────────────────────────── */
function showSellOverlay(screen, state, market, onSell, onCancel) {
    const carrying = state.drugs.filter(d => d.carried > 0);
    if (carrying.length === 0) {
        onCancel();
        return;
    }
    const drugNameMap = new Map(market.prices.map(p => [p.index, p.name]));
    const box = overlay(screen, {
        width: 50,
        height: Math.min(carrying.length, 12) + 6,
        label: ' SELL ',
    });
    const list = (0, blessed_helpers_1.createList)({
        parent: box,
        top: 0, left: 0,
        width: '100%-2',
        height: Math.min(carrying.length, 12),
        style: { selected: { bg: 'blue', fg: 'white' } },
        keys: true, mouse: true,
        items: carrying.map(d => {
            const name = drugNameMap.get(d.index) ?? `Drug${d.index}`;
            return `${name.padEnd(13)} ${String(d.carried).padStart(4)} units`;
        }),
    });
    const statusBox = blessed_1.default.box({
        parent: box,
        bottom: 1, left: 0,
        width: '100%-2', height: 3,
        tags: true,
        style: { fg: 'white', bg: 'black' },
    });
    let amount = 1;
    let typing = false;
    function currentMax() {
        const idx = list.selected ?? 0;
        return carrying[idx]?.carried ?? 1;
    }
    function renderStatus() {
        const max = currentMax();
        statusBox.setContent(`  Amount: {bold}{yellow-fg}${amount}{/}{/}  (max ${max})\n` +
            `  [<] less  [>] more  digits to type  [Enter] sell  [ESC] cancel`);
        screen.render();
    }
    function clampAmount() {
        const max = currentMax();
        if (amount < 1)
            amount = 1;
        if (amount > max)
            amount = max;
    }
    let unbind;
    function cleanup() {
        unbind();
        list.removeAllListeners('select');
        box.destroy();
        screen.render();
    }
    const leftFn = () => { amount = Math.max(1, amount - 1); typing = false; renderStatus(); };
    const rightFn = () => { clampAmount(); amount = Math.min(currentMax(), amount + 1); typing = false; renderStatus(); };
    const escapeFn = () => { cleanup(); onCancel(); };
    const enterFn = () => {
        clampAmount();
        if (amount >= 1) {
            const idx = list.selected ?? 0;
            const d = carrying[idx];
            if (d) {
                cleanup();
                onSell(d.index, amount);
            }
        }
    };
    const backspaceFn = () => {
        const s = String(amount).slice(0, -1);
        amount = s.length ? parseInt(s, 10) : 1;
        renderStatus();
    };
    list.on('action', () => { amount = 1; typing = false; renderStatus(); });
    const digitBindings = [];
    for (let d = 0; d <= 9; d++) {
        const digit = d;
        const fn = () => {
            if (!typing || amount === 0) {
                amount = digit;
                typing = true;
            }
            else {
                amount = parseInt(String(amount) + String(digit), 10);
            }
            clampAmount();
            renderStatus();
        };
        digitBindings.push([[String(d)], fn]);
    }
    unbind = (0, blessed_helpers_1.bindKeys)(screen, [
        [['left'], leftFn],
        [['right'], rightFn],
        [['escape'], escapeFn],
        [['enter'], enterFn],
        [['backspace'], backspaceFn],
        ...digitBindings,
    ]);
    list.focus();
    renderStatus();
}
/* ─── Jet overlay ──────────────────────────────────────── */
function showJetOverlay(screen, currentLocation, locationNames, onJet, onCancel) {
    const items = locationNames.map((name, i) => i === currentLocation ? `${name} (here)` : name);
    const box = overlay(screen, {
        width: 36,
        height: Math.min(items.length, 12) + 4,
        label: ' JET TO ',
    });
    const list = (0, blessed_helpers_1.createList)({
        parent: box,
        top: 0, left: 0,
        width: '100%-2',
        height: Math.min(items.length, 12),
        style: { selected: { bg: 'blue', fg: 'white' } },
        keys: true, mouse: true,
        items,
    });
    const hint = blessed_1.default.box({
        parent: box,
        bottom: 1, left: 0,
        width: '100%-2', height: 1,
        tags: true,
        style: { fg: 'white', bg: 'black' },
        content: '  [Enter] jet   [ESC] cancel',
    });
    list.select(currentLocation);
    let unbind;
    function cleanup() {
        unbind();
        list.removeAllListeners('select');
        box.destroy();
        screen.render();
    }
    const escapeFn = () => { cleanup(); onCancel(); };
    unbind = (0, blessed_helpers_1.bindKeys)(screen, [[['escape'], escapeFn]]);
    list.on('select', (_item, index) => {
        if (index === currentLocation)
            return;
        cleanup();
        onJet(index);
    });
    list.focus();
    screen.render();
}
/* ─── Question overlay ─────────────────────────────────── */
function showQuestionOverlay(screen, question, onAnswer) {
    const raw = question.prompt || 'Continue?';
    const displayPrompt = raw.includes('^') ? raw.split('^').slice(1).join('^').trim() : raw.trim();
    const box = overlay(screen, { width: 62, height: 7, label: ' ACTION REQUIRED ' });
    box.setContent('\n  ' + displayPrompt + '\n\n  {bold}[Y]{/}es  {bold}[N]{/}o  {bold}[ESC]{/} = No');
    let unbind;
    function cleanup() { unbind(); box.destroy(); screen.render(); }
    const yesFn = () => { cleanup(); onAnswer('y'); };
    const noFn = () => { cleanup(); onAnswer('n'); };
    unbind = (0, blessed_helpers_1.bindKeys)(screen, [
        [['y', 'Y'], yesFn],
        [['n', 'N', 'escape'], noFn],
    ]);
    box.focus();
    screen.render();
}
/* ─── High scores overlay ──────────────────────────────── */
function showHighScores(screen, scores, onClose) {
    const rows = scores.length === 0
        ? ['  No scores yet.']
        : scores.map((s, i) => `  {bold}${String(i + 1).padStart(2)}.{/} ${s.bbsHandle.padEnd(16)} $${Math.round(s.score).toLocaleString('en-US').padStart(12)}  (${s.turns} turns)`);
    const box = overlay(screen, {
        width: 62, height: Math.min(rows.length + 5, 22), label: ' HIGH SCORES ',
    });
    box.setContent(rows.join('\n') + '\n\n  {bold}[ESC]{/} or {bold}[Q]{/} to close');
    let unbind;
    function cleanup() { unbind(); box.destroy(); screen.render(); }
    const closeFn = () => { cleanup(); onClose(); };
    unbind = (0, blessed_helpers_1.bindKeys)(screen, [[['escape', 'q', 'Q'], closeFn]]);
    box.focus();
    screen.render();
}
//# sourceMappingURL=actions.js.map