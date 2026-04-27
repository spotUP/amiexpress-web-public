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
function centeredBox(screen, opts) {
    return blessed_1.default.box({
        parent: screen,
        top: 'center', left: 'center',
        border: { type: 'line' },
        tags: true,
        style: { border: { fg: 'yellow' }, fg: 'white', bg: 'black' },
        keys: true,
        ...opts,
    });
}
/* ─── Buy overlay ──────────────────────────────────────── */
function showBuyOverlay(screen, market, state, onBuy, onCancel) {
    const lines = market.prices.map((p, i) => `  {bold}${i + 1}.{/} ${p.name.padEnd(12)} {green-fg}$${Math.round(p.price).toLocaleString('en-US')}{/}`).join('\n');
    const box = centeredBox(screen, { width: 52, height: market.prices.length + 7, label: ' BUY ' });
    box.setContent(lines + '\n\n  Select number or {bold}[ESC]{/}:');
    let chosen = -1;
    let chosenName = '';
    let amtStr = '';
    let unbind;
    function cleanup() { unbind(); box.destroy(); screen.render(); }
    const escapeFn = () => { cleanup(); onCancel(); };
    const enterFn = () => {
        if (chosen >= 0 && amtStr) {
            const amt = parseInt(amtStr, 10);
            if (amt > 0) {
                cleanup();
                onBuy(chosen, amt);
            }
        }
    };
    const backspaceFn = () => {
        if (chosen >= 0 && amtStr) {
            amtStr = amtStr.slice(0, -1);
            box.setContent(lines + `\n\n  Buying {yellow-fg}${chosenName}{/}\n  Amount: ${amtStr || '_'}`);
            screen.render();
        }
    };
    const zeroFn = () => {
        if (chosen >= 0) {
            amtStr += '0';
            box.setContent(lines + `\n\n  Buying {yellow-fg}${chosenName}{/}\n  Amount: ${amtStr}_`);
            screen.render();
        }
    };
    const numBindings = [];
    for (let i = 0; i < Math.min(market.prices.length, 9); i++) {
        const digit = String(i + 1);
        const fn = () => {
            if (chosen < 0) {
                chosen = market.prices[i].index;
                chosenName = market.prices[i].name;
                box.setContent(lines + `\n\n  Buying {yellow-fg}${chosenName}{/}\n  Amount: _`);
                screen.render();
            }
            else {
                amtStr += digit;
                box.setContent(lines + `\n\n  Buying {yellow-fg}${chosenName}{/}\n  Amount: ${amtStr}_`);
                screen.render();
            }
        };
        numBindings.push([[digit], fn]);
    }
    unbind = (0, blessed_helpers_1.bindKeys)(screen, [
        [['escape'], escapeFn],
        [['enter'], enterFn],
        [['backspace'], backspaceFn],
        [['0'], zeroFn],
        ...numBindings,
    ]);
    box.focus();
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
    const lines = carrying.map((d, i) => `  {bold}${i + 1}.{/} ${(drugNameMap.get(d.index) ?? `Drug${d.index}`).padEnd(12)} {yellow-fg}${d.carried}{/} units`).join('\n');
    const box = centeredBox(screen, { width: 50, height: carrying.length + 7, label: ' SELL ' });
    box.setContent(lines + '\n\n  Select drug or {bold}[ESC]{/}:');
    let chosen = -1;
    let chosenName = '';
    let amtStr = '';
    let unbind;
    function cleanup() { unbind(); box.destroy(); screen.render(); }
    const escapeFn = () => { cleanup(); onCancel(); };
    const enterFn = () => {
        if (chosen >= 0 && amtStr) {
            const amt = parseInt(amtStr, 10);
            if (amt > 0) {
                cleanup();
                onSell(chosen, amt);
            }
        }
    };
    const backspaceFn = () => {
        if (chosen >= 0 && amtStr) {
            amtStr = amtStr.slice(0, -1);
            box.setContent(lines + `\n\n  Selling {yellow-fg}${chosenName}{/}\n  Amount: ${amtStr || '_'}`);
            screen.render();
        }
    };
    const zeroFn = () => {
        if (chosen >= 0) {
            amtStr += '0';
            box.setContent(lines + `\n\n  Selling {yellow-fg}${chosenName}{/}\n  Amount: ${amtStr}_`);
            screen.render();
        }
    };
    const numBindings = [];
    for (let i = 0; i < Math.min(carrying.length, 9); i++) {
        const digit = String(i + 1);
        const fn = () => {
            if (chosen < 0) {
                chosen = carrying[i].index;
                chosenName = drugNameMap.get(chosen) ?? `Drug${chosen}`;
                box.setContent(lines + `\n\n  Selling {yellow-fg}${chosenName}{/}\n  Amount: _`);
                screen.render();
            }
            else {
                amtStr += digit;
                box.setContent(lines + `\n\n  Selling {yellow-fg}${chosenName}{/}\n  Amount: ${amtStr}_`);
                screen.render();
            }
        };
        numBindings.push([[digit], fn]);
    }
    unbind = (0, blessed_helpers_1.bindKeys)(screen, [
        [['escape'], escapeFn],
        [['enter'], enterFn],
        [['backspace'], backspaceFn],
        [['0'], zeroFn],
        ...numBindings,
    ]);
    box.focus();
    screen.render();
}
/* ─── Jet overlay ──────────────────────────────────────── */
function showJetOverlay(screen, currentLocation, locationNames, onJet, onCancel) {
    const lines = locationNames.map((name, i) => `  {bold}${i + 1}.{/} ${name}${i === currentLocation ? ' {green-fg}(here){/}' : ''}`).join('\n');
    const box = centeredBox(screen, {
        width: 36, height: locationNames.length + 5, label: ' JET TO ',
    });
    box.setContent(lines + '\n\n  Choose or {bold}[ESC]{/}:');
    let unbind;
    function cleanup() { unbind(); box.destroy(); screen.render(); }
    const escapeFn = () => { cleanup(); onCancel(); };
    const locBindings = locationNames.map((_name, i) => {
        const fn = () => {
            if (i !== currentLocation) {
                cleanup();
                onJet(i);
            }
        };
        return [[String(i + 1)], fn];
    });
    unbind = (0, blessed_helpers_1.bindKeys)(screen, [
        [['escape'], escapeFn],
        ...locBindings,
    ]);
    box.focus();
    screen.render();
}
/* ─── Question overlay ─────────────────────────────────── */
function showQuestionOverlay(screen, question, onAnswer) {
    // Dopewars prompts carry a "YN^" or similar protocol prefix before "^" — strip it
    const raw = question.prompt || 'Continue?';
    const displayPrompt = raw.includes('^') ? raw.split('^').slice(1).join('^').trim() : raw.trim();
    const box = centeredBox(screen, { width: 62, height: 7, label: ' ACTION REQUIRED ' });
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
        : scores.map((s, i) => `  {bold}${String(i + 1).padStart(2)}.{/} ${s.bbsHandle.padEnd(16)} {green-fg}$${Math.round(s.score).toLocaleString('en-US').padStart(12)}{/}  (${s.turns} turns)`);
    const box = centeredBox(screen, {
        width: 62, height: Math.min(rows.length + 5, 22), label: ' HIGH SCORES ',
    });
    box.setContent(rows.join('\n') + '\n\n  {bold}[ESC]{/} or {bold}[Q]{/} to close');
    let unbind;
    function cleanup() { unbind(); box.destroy(); screen.render(); }
    const closeFn = () => { cleanup(); onClose(); };
    unbind = (0, blessed_helpers_1.bindKeys)(screen, [
        [['escape', 'q', 'Q'], closeFn],
    ]);
    box.focus();
    screen.render();
}
//# sourceMappingURL=actions.js.map