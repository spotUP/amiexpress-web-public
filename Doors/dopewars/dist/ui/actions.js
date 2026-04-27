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
    box.setContent('  {bold}[B]{/}uy  {bold}[S]{/}ell  {bold}[J]{/}et  ' +
        '{bold}[K]{/}bank  {bold}[L]{/}oan  {bold}[G]{/}uns  ' +
        '{bold}[D]{/}oc  {bold}[A]{/}ttack  {bold}[H]{/}iscores  {bold}[Q]{/}uit');
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
/* ─── Amount input ─────────────────────────────────────────
 * Shows current amount, left/right to adjust by 1,
 * up/down by 10, digits to type directly, backspace to delete.
 * Returns the chosen amount via Promise (0 = cancelled).
 */
function showAmountInput(screen, label, max, onConfirm, onBack) {
    let amount = 1;
    let typing = false; // once user types a digit, replace rather than adjust
    const box = overlay(screen, {
        width: 44, height: 7,
        label: ` ${label} `,
    });
    function render() {
        const canAfford = max > 0 ? `  (max ${max})` : '';
        box.setContent(`\n  Amount: {bold}{yellow-fg}${amount}{/}{/}${canAfford}\n\n` +
            `  {bold}←/→{/} ±1   {bold}↑/↓{/} ±10   digits to type\n` +
            `  {bold}[Enter]{/} confirm   {bold}[ESC]{/} back`);
        screen.render();
    }
    let unbind;
    const leftFn = () => { amount = Math.max(1, amount - 1); typing = false; render(); };
    const rightFn = () => { amount = Math.min(max || 9999, amount + 1); typing = false; render(); };
    const upFn = () => { amount = Math.min(max || 9999, amount + 10); typing = false; render(); };
    const downFn = () => { amount = Math.max(1, amount - 10); typing = false; render(); };
    const backspaceFn = () => {
        const s = String(amount).slice(0, -1);
        amount = s.length ? parseInt(s, 10) : 1;
        render();
    };
    const enterFn = () => {
        if (amount >= 1) {
            unbind();
            box.destroy();
            screen.render();
            onConfirm(amount);
        }
    };
    const escapeFn = () => { unbind(); box.destroy(); screen.render(); onBack(); };
    const digitBindings = [];
    for (let d = 0; d <= 9; d++) {
        const digit = String(d);
        const fn = () => {
            if (!typing) {
                amount = d;
                typing = true;
            }
            else {
                const n = parseInt(String(amount) + digit, 10);
                amount = n;
            }
            if (max > 0 && amount > max)
                amount = max;
            if (amount < 1 && digit !== '0')
                amount = d;
            render();
        };
        digitBindings.push([[digit], fn]);
    }
    unbind = (0, blessed_helpers_1.bindKeys)(screen, [
        [['left'], leftFn],
        [['right'], rightFn],
        [['up'], upFn],
        [['down'], downFn],
        [['backspace'], backspaceFn],
        [['enter'], enterFn],
        [['escape'], escapeFn],
        ...digitBindings,
    ]);
    box.focus();
    render();
}
/* ─── Buy overlay ──────────────────────────────────────── */
function showBuyOverlay(screen, market, state, onBuy, onCancel) {
    const items = market.prices.map(p => `${p.name.padEnd(12)} $${Math.round(p.price).toLocaleString('en-US')}`);
    const listBox = overlay(screen, {
        width: 40, height: Math.min(items.length + 4, 18), label: ' BUY — ↑↓ navigate, Enter select ',
    });
    const list = (0, blessed_helpers_1.createList)({
        parent: listBox,
        top: 0, left: 0,
        width: '100%-2', height: '100%-2',
        style: { selected: { bg: 'blue', fg: 'white' } },
        keys: true, vi: true, mouse: true,
        items,
    });
    let unbindEsc;
    function cleanup() {
        unbindEsc();
        list.removeAllListeners('select');
        listBox.destroy();
        screen.render();
    }
    const escapeFn = () => { cleanup(); onCancel(); };
    unbindEsc = (0, blessed_helpers_1.bindKeys)(screen, [[['escape'], escapeFn]]);
    list.on('select', (_item, index) => {
        const p = market.prices[index];
        if (!p)
            return;
        cleanup();
        const coatFree = state.coatSize - state.drugs.reduce((s, d) => s + d.carried, 0);
        const maxAmt = Math.min(coatFree, Math.floor(state.cash / p.price)) || 0;
        showAmountInput(screen, `Buy ${p.name}`, maxAmt, (amount) => onBuy(p.index, amount), () => showBuyOverlay(screen, market, state, onBuy, onCancel));
    });
    list.focus();
    screen.render();
}
/* ─── Sell overlay ─────────────────────────────────────── */
function showSellOverlay(screen, state, market, onSell, onCancel) {
    const carrying = state.drugs.filter(d => d.carried > 0);
    if (carrying.length === 0) {
        onCancel();
        return;
    }
    const drugNameMap = new Map(market.prices.map(p => [p.index, p.name]));
    const items = carrying.map(d => `${(drugNameMap.get(d.index) ?? `Drug${d.index}`).padEnd(12)} ${d.carried} units`);
    const listBox = overlay(screen, {
        width: 40, height: Math.min(items.length + 4, 18), label: ' SELL — ↑↓ navigate, Enter select ',
    });
    const list = (0, blessed_helpers_1.createList)({
        parent: listBox,
        top: 0, left: 0,
        width: '100%-2', height: '100%-2',
        style: { selected: { bg: 'blue', fg: 'white' } },
        keys: true, vi: true, mouse: true,
        items,
    });
    let unbindEsc;
    function cleanup() {
        unbindEsc();
        list.removeAllListeners('select');
        listBox.destroy();
        screen.render();
    }
    const escapeFn = () => { cleanup(); onCancel(); };
    unbindEsc = (0, blessed_helpers_1.bindKeys)(screen, [[['escape'], escapeFn]]);
    list.on('select', (_item, index) => {
        const d = carrying[index];
        if (!d)
            return;
        cleanup();
        const name = drugNameMap.get(d.index) ?? `Drug${d.index}`;
        showAmountInput(screen, `Sell ${name}`, d.carried, (amount) => onSell(d.index, amount), () => showSellOverlay(screen, state, market, onSell, onCancel));
    });
    list.focus();
    screen.render();
}
/* ─── Jet overlay ──────────────────────────────────────── */
function showJetOverlay(screen, currentLocation, locationNames, onJet, onCancel) {
    const items = locationNames.map((name, i) => i === currentLocation ? `${name} (here)` : name);
    const listBox = overlay(screen, {
        width: 36, height: Math.min(items.length + 4, 16), label: ' JET TO — ↑↓ navigate, Enter select ',
    });
    const list = (0, blessed_helpers_1.createList)({
        parent: listBox,
        top: 0, left: 0,
        width: '100%-2', height: '100%-2',
        style: { selected: { bg: 'blue', fg: 'white' } },
        keys: true, vi: true, mouse: true,
        items,
    });
    // Pre-select current location
    list.select(currentLocation);
    let unbindEsc;
    function cleanup() {
        unbindEsc();
        list.removeAllListeners('select');
        listBox.destroy();
        screen.render();
    }
    const escapeFn = () => { cleanup(); onCancel(); };
    unbindEsc = (0, blessed_helpers_1.bindKeys)(screen, [[['escape'], escapeFn]]);
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
    // Dopewars prefixes prompts with protocol info before "^" — strip it
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