"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bindCombatKeys = bindCombatKeys;
const LOCATION_NAMES = [
    'Brooklyn', 'Bronx', 'Ghetto', 'Central Park',
    'Manhattan', 'Coney Island', 'Battery Park', 'Queens',
];
function bindCombatKeys(screen, handlers) {
    let awaitingRunDest = false;
    const fightFn = () => { if (!awaitingRunDest)
        handlers.onFight(); };
    const surrenderFn = () => { if (!awaitingRunDest)
        handlers.onSurrender(); };
    const runFn = () => {
        awaitingRunDest = true;
        // location keys 1-8 become active for destination selection
    };
    const locFns = [];
    LOCATION_NAMES.forEach((_name, i) => {
        const fn = () => {
            if (awaitingRunDest) {
                awaitingRunDest = false;
                unbind();
                handlers.onRun(i);
            }
        };
        locFns.push(fn);
        screen.key([String(i + 1)], fn);
    });
    screen.key(['f', 'F'], fightFn);
    screen.key(['s', 'S'], surrenderFn);
    screen.key(['r', 'R'], runFn);
    function unbind() {
        screen.unkey(['f', 'F'], fightFn);
        screen.unkey(['s', 'S'], surrenderFn);
        screen.unkey(['r', 'R'], runFn);
        LOCATION_NAMES.forEach((_name, i) => screen.unkey([String(i + 1)], locFns[i]));
    }
    return unbind;
}
//# sourceMappingURL=combat.js.map