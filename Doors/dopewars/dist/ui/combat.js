"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bindCombatKeys = bindCombatKeys;
const actions_1 = require("./actions");
function bindCombatKeys(screen, handlers, ctx) {
    const fightFn = () => handlers.onFight();
    const surrenderFn = () => handlers.onSurrender();
    const runFn = () => {
        (0, actions_1.showJetOverlay)(screen, ctx.currentLocation, ctx.locationNames, (loc) => { unbind(); handlers.onRun(loc); }, () => { } // cancel: stay in combat, keep keys bound
        );
    };
    screen.key(['f', 'F'], fightFn);
    screen.key(['s', 'S'], surrenderFn);
    screen.key(['r', 'R'], runFn);
    function unbind() {
        screen.unkey(['f', 'F'], fightFn);
        screen.unkey(['s', 'S'], surrenderFn);
        screen.unkey(['r', 'R'], runFn);
    }
    return unbind;
}
//# sourceMappingURL=combat.js.map