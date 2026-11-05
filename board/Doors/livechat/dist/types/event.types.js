"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EVENT_PREFIXES = void 0;
/** Event format prefixes */
exports.EVENT_PREFIXES = {
    user_login: '-->',
    user_logout: '<--',
    upload_start: '[UL]',
    upload_complete: '[UL]',
    download_start: '[DL]',
    download_complete: '[DL]',
    door_enter: '[DOOR]',
    door_exit: '[DOOR]',
    new_message: '[MSG]',
    page_sysop: '[PAGE]',
    conference_join: '[CONF]',
    node_activity: '[NODE]',
    system_announcement: '***'
};
