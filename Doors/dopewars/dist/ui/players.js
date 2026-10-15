"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderPlayers = renderPlayers;
const door_theme_1 = require("../door-theme");
function renderPlayers(box, players, selfId) {
    const others = players.filter(p => p.id !== selfId);
    if (others.length === 0) {
        box.setContent('  ---');
        return;
    }
    const txt = others
        .map(p => `{${door_theme_1.T.accentAlt}-fg}${p.name}{/} ({${p.health > 50 ? 'green' : 'red'}-fg}${p.health}hp{/})`)
        .join('  ');
    box.setContent('  ' + txt);
}
//# sourceMappingURL=players.js.map