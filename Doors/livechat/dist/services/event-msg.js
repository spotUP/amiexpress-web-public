"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEventMessage = getEventMessage;
/** Get event message text */
function getEventMessage(e) {
    const d = e.details;
    switch (e.type) {
        case 'user_login': return { msg: `${e.username} has logged in (Node ${e.nodeId})`, c: 'green' };
        case 'user_logout': return { msg: `${e.username} has logged off`, c: 'red' };
        case 'upload_start': return { msg: `${e.username} started uploading "${d.filename}"`, c: 'cyan' };
        case 'upload_complete': return { msg: `${e.username} uploaded "${d.filename}" to ${d.area}`, c: 'cyan' };
        case 'download_start': return { msg: `${e.username} is downloading "${d.filename}"`, c: 'yellow' };
        case 'download_complete': return { msg: `${e.username} downloaded "${d.filename}"`, c: 'yellow' };
        case 'door_enter': return { msg: `${e.username} entered ${d.doorName}`, c: 'magenta' };
        case 'door_exit': return { msg: `${e.username} left ${d.doorName}`, c: 'magenta' };
        case 'new_message': return { msg: `New message in "${d.conference}" by ${e.username}`, c: 'blue' };
        case 'page_sysop': return { msg: `${e.username} is paging the Sysop`, c: 'yellow' };
        case 'conference_join': return { msg: `${e.username} joined ${d.conference}`, c: 'green' };
        case 'node_activity': return { msg: `Node ${e.nodeId} is ${d.status}`, c: d.status === 'active' ? 'green' : 'red' };
        case 'system_announcement': return { msg: d.message, c: 'yellow' };
        default: return { msg: JSON.stringify(d), c: 'gray' };
    }
}
