"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.showTrainingConfig = showTrainingConfig;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const LEVELS = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900];
const LEVEL_DESCS = {
    0: 'Normal start',
    100: 'Moderate speed',
    200: 'Increased gravity',
    300: 'Fast',
    400: 'Very fast',
    500: 'High gravity',
    600: 'Near-20G',
    700: 'Near-20G',
    800: 'Near-20G',
    900: '20G mode!',
};
async function showTrainingConfig(screen) {
    const items = LEVELS.map(l => `Level ${l.toString().padStart(3, ' ')} - ${LEVEL_DESCS[l]}`);
    return new Promise((resolve) => {
        const box = (0, blessed_helpers_1.createBox)({
            parent: screen,
            top: 'center',
            left: 'center',
            width: 44,
            height: items.length + 4,
            border: { type: 'line' },
            label: ' TRAINING - SELECT START LEVEL ',
            style: { bg: 'black', border: { fg: 'cyan' } },
            fixed: true,
            tags: true,
        });
        const list = (0, blessed_helpers_1.createList)({
            parent: box,
            top: 1,
            left: 1,
            width: 40,
            height: items.length + 2,
            keys: true,
            vi: true,
            mouse: true,
            style: {
                selected: { bg: 'blue', fg: 'white' },
                item: { fg: 'white' },
            },
            items,
        });
        list.focus();
        screen.render();
        const done = (idx) => {
            list.destroy();
            box.destroy();
            screen.render();
            resolve({ startLevel: LEVELS[idx] });
        };
        list.key(['enter', 'return'], () => done(list.selected ?? 0));
        list.key(['escape'], () => done(0));
    });
}
//# sourceMappingURL=training-config.js.map