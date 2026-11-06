"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldShowEvent = shouldShowEvent;
/** Check if event should be shown based on user preferences */
function shouldShowEvent(event, prefs) {
    if (prefs.muteAllEvents)
        return false;
    switch (event.type) {
        case 'user_login':
        case 'user_logout':
            return prefs.showLogins;
        case 'upload_start':
        case 'upload_complete':
        case 'download_start':
        case 'download_complete':
            return prefs.showFileActivity;
        case 'door_enter':
        case 'door_exit':
            return prefs.showDoorActivity;
        case 'new_message':
        case 'page_sysop':
        case 'conference_join':
        case 'node_activity':
            return prefs.showMessages;
        case 'system_announcement':
            return prefs.showSystemAnnouncements;
        default:
            return true; // Show unknown events by default
    }
}
