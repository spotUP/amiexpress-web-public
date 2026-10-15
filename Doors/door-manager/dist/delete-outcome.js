"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteOutcomeView = deleteOutcomeView;
const door_theme_1 = require("./door-theme");
function deleteOutcomeView(outcome) {
    if (!outcome.success) {
        return {
            kind: 'message',
            text: `\n\n{${door_theme_1.T.alert}-fg}Delete failed{/${door_theme_1.T.alert}-fg}\n\n${outcome.message ?? 'unknown error'}\n`,
        };
    }
    if (outcome.stillListed) {
        // The files went and the registration did not. Saying "deleted" over a
        // door that is still on screen is the report this check came from.
        return {
            kind: 'message',
            text: `\n\n{${door_theme_1.T.alert}-fg}Still registered{/${door_theme_1.T.alert}-fg}\n\n` +
                `The files were removed but ${outcome.command} is still in the door list.\n`,
        };
    }
    return { kind: 'showSelectedDoor' };
}
//# sourceMappingURL=delete-outcome.js.map