"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderMarket = renderMarket;
function renderMarket(box, market) {
    const header = '{bold}' + 'Drug'.padEnd(11) + ' ' + 'Price'.padStart(8) + '  !{/}';
    const lines = [header];
    for (const p of market.prices) {
        const name = (p.name || `Drug${p.index}`).slice(0, 11).padEnd(11);
        const price = ('$' + Math.round(p.price).toLocaleString('en-US')).padStart(8);
        let trend = '--';
        if (p.cheap)
            trend = '{green-fg}!!{/}';
        if (p.expensive)
            trend = '{red-fg}**{/}';
        lines.push(`${name} ${price}  ${trend}`);
    }
    box.setContent(lines.join('\n'));
}
//# sourceMappingURL=market.js.map