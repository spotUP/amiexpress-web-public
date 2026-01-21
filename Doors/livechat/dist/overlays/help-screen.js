"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHelpScreen = createHelpScreen;
/**
 * Help screen overlay - uses DocModal widget from SDK
 */
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const help_content_1_1 = require("./help-content-1");
const help_content_2_1 = require("./help-content-2");
const help_content_3_1 = require("./help-content-3");
const help_content_4_1 = require("./help-content-4");
function createHelpScreen(screen, inputBox) {
    const helpModal = new blessed_1.DocModal({
        parent: screen,
        title: 'LiveChat v3.2 Help',
        header: 'HELP',
        content: help_content_1_1.HELP_PART_1 + help_content_2_1.HELP_PART_2 + help_content_3_1.HELP_PART_3 + help_content_4_1.HELP_PART_4,
        headerStyle: { fg: 'cyan' },
        contentStyle: { fg: 'white' },
        footerStyle: { fg: 'black', bg: 'cyan' },
        zIndex: 9990,
        onClose: () => {
            inputBox.focus();
            screen.render();
        },
    });
    return function showHelp() {
        helpModal.display(inputBox);
    };
}
