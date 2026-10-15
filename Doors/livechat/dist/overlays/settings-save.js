"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveSettings = saveSettings;
function saveSettings(state, checkboxes, updateStatusBar) {
    state.prefs.showLogins = checkboxes.showLogins.isChecked();
    state.prefs.showFileActivity = checkboxes.showFileActivity.isChecked();
    state.prefs.showDoorActivity = checkboxes.showDoorActivity.isChecked();
    state.prefs.showMessages = checkboxes.showMessages.isChecked();
    state.prefs.showSystemAnnouncements = checkboxes.showAnnouncements.isChecked();
    state.prefs.notificationSound = !checkboxes.muteSounds.isChecked();
    state.prefs.mentionSound = !checkboxes.muteSounds.isChecked();
    state.prefs.showTimestamps = checkboxes.timestamps.isChecked();
    state.prefs.muteAllEvents = !(state.prefs.showLogins ||
        state.prefs.showFileActivity ||
        state.prefs.showDoorActivity ||
        state.prefs.showMessages ||
        state.prefs.showSystemAnnouncements);
    updateStatusBar();
}
