"use strict";
/**
 * Helper utility to bridge classic SDK doors (Door class) with the runDoor()
 * interface used by the TypeScript door runtime.
 *
 * The helper wires Door events to the provided Socket.IO connection and
 * translates raw text input into the KeyEvent objects expected by the SDK.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDoorWithSession = void 0;
/**
 * Execute a Door instance inside the TypeScript door runtime.
 */
async function runDoorWithSession(door, doorSession) {
    const { socket } = doorSession;
    const bbsSession = doorSession.bbsSession;
    const mappedUser = mapUser(doorSession);
    return new Promise((resolve, reject) => {
        let finished = false;
        const cleanup = () => {
            if (finished) {
                return;
            }
            finished = true;
            if (bbsSession && bbsSession.doorInputHandler === handleInput) {
                delete bbsSession.doorInputHandler;
            }
            socket.off('disconnect', handleSocketDisconnect);
            door.off('output', handleDoorOutput);
            door.pause();
        };
        const finish = () => {
            cleanup();
            resolve();
        };
        const handleDoorOutput = (payload) => {
            if (typeof payload === 'string') {
                logChunk('[runDoorWithSession] output string', payload);
                socket.emit('ansi-output', payload);
                return;
            }
            if (!payload) {
                return;
            }
            if (!payload.user || payload.user.id === mappedUser.id) {
                logChunk('[runDoorWithSession] output event', payload.text || '');
                socket.emit('ansi-output', payload.text);
            }
        };
        const handleInput = (data) => {
            const events = decodeInput(data);
            for (const event of events) {
                door.sendInput(mappedUser.id, event);
            }
        };
        const handleSocketDisconnect = () => {
            door.disconnect(mappedUser.id);
        };
        door.on('output', handleDoorOutput);
        if (bbsSession) {
            bbsSession.doorInputHandler = handleInput;
        }
        socket.once('disconnect', handleSocketDisconnect);
        door.onDisconnect((user) => {
            if (user.id === mappedUser.id) {
                finish();
            }
        });
        try {
            door.start();
            door.connect(mappedUser);
        }
        catch (error) {
            cleanup();
            reject(error);
        }
    });
}
exports.runDoorWithSession = runDoorWithSession;
function mapUser(session) {
    const rawUser = session.user || {};
    const bbsSession = session.bbsSession || {};
    const numericId = typeof rawUser.id === 'number'
        ? rawUser.id
        : parseInt(rawUser.id || rawUser.userId || '1', 10) || 1;
    return {
        id: numericId,
        name: rawUser.username || rawUser.name || rawUser.alias || `User ${numericId}`,
        node: bbsSession.nodeId || 1,
        securityLevel: rawUser.secLevel ?? rawUser.securityLevel ?? 0,
        timeLeft: bbsSession.timeRemaining || rawUser.timeLeft || 0,
        graphicsMode: bbsSession.ansiEnabled === false ? 'ASCII' : 'ANSI',
        termWidth: bbsSession.screenWidth || rawUser.termWidth || 80,
        termHeight: bbsSession.screenHeight || rawUser.termHeight || 24,
        data: {},
    };
}
const SPECIAL_KEYS = {
    '\u001b[A': { key: 'ArrowUp', code: 38 },
    '\u001b[B': { key: 'ArrowDown', code: 40 },
    '\u001b[C': { key: 'ArrowRight', code: 39 },
    '\u001b[D': { key: 'ArrowLeft', code: 37 },
    '\u001bOP': { key: 'F1', code: 112 },
    '\u001bOQ': { key: 'F2', code: 113 },
    '\u001bOR': { key: 'F3', code: 114 },
    '\u001bOS': { key: 'F4', code: 115 },
};
function decodeInput(data) {
    const events = [];
    for (let i = 0; i < data.length; i++) {
        const char = data[i];
        const code = data.charCodeAt(i);
        if (char === '\r') {
            events.push(createKeyEvent('Enter', 13));
            if (data[i + 1] === '\n') {
                i++;
            }
            continue;
        }
        if (char === '\n') {
            events.push(createKeyEvent('Enter', 13));
            continue;
        }
        if (char === '\t') {
            events.push(createKeyEvent('Tab', 9));
            continue;
        }
        if (code === 8 || code === 127) {
            events.push(createKeyEvent('Backspace', 8));
            continue;
        }
        if (char === '\u001b') {
            const remaining = data.slice(i);
            const seqMatch = /^(?:\u001b(?:\[[0-9;]*[A-Za-z]|O[A-Z]))/.exec(remaining);
            if (seqMatch) {
                const seq = seqMatch[0];
                const special = SPECIAL_KEYS[seq];
                const event = special || translateCSI(seq);
                if (event) {
                    events.push(createKeyEvent(event.key, event.code));
                    i += seq.length - 1;
                    continue;
                }
            }
            events.push(createKeyEvent('Escape', 27));
            continue;
        }
        if (code >= 32 && code <= 126) {
            events.push({
                key: char,
                code,
                ctrl: false,
                alt: false,
                shift: char !== char.toLowerCase() && char === char.toUpperCase(),
            });
            continue;
        }
        if (code < 32) {
            const mappedKey = String.fromCharCode(code + 64);
            events.push({
                key: mappedKey,
                code,
                ctrl: true,
                alt: false,
                shift: false,
            });
        }
    }
    return events;
}
function createKeyEvent(key, code, options = {}) {
    return {
        key,
        code,
        ctrl: options.ctrl ?? false,
        alt: options.alt ?? false,
        shift: options.shift ?? false,
    };
}
function translateCSI(seq) {
    if (!seq.startsWith('\u001b['))
        return null;
    const content = seq.slice(2, -1);
    const final = seq[seq.length - 1];
    if (final === '~') {
        if (content === '2')
            return { key: 'Insert', code: 45 };
        if (content === '3')
            return { key: 'Delete', code: 46 };
        if (content === '5')
            return { key: 'PageUp', code: 33 };
        if (content === '6')
            return { key: 'PageDown', code: 34 };
    }
    else if (final === 'F') {
        return { key: 'End', code: 35 };
    }
    else if (final === 'H') {
        return { key: 'Home', code: 36 };
    }
    return null;
}
function logChunk(prefix, text) {
    const preview = text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\r/g, '\\r').replace(/\n/g, '\\n').slice(0, 120);
    console.log(`${prefix} len=${text.length} preview="${preview}"`);
}
