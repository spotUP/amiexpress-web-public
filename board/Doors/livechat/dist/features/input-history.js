"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInputHistory = createInputHistory;
/** `picking` is the message picker's flag: while it owns Up/Down, history stays out. */
function createInputHistory(s, ib, picking = () => false) {
    const h = [];
    let hi = -1;
    let si = '';
    let eid = null;
    const max = 100;
    const getEntry = () => {
        if (hi === -1)
            return null;
        const idx = h.length - 1 - hi;
        return h[idx] || null;
    };
    s.key(['up'], () => {
        const f = s.getFocused();
        if (f !== ib)
            return;
        if (picking())
            return;
        // Up on an empty line enters message pick mode (message-picker.ts).
        if (hi === -1 && !(ib.getValue() || ''))
            return;
        if (h.length === 0)
            return;
        if (hi === -1)
            si = ib.getValue() || '';
        if (hi < h.length - 1) {
            hi++;
            const e = getEntry();
            if (e) {
                eid = e.id;
                ib.setValue(e.text);
                ib.setLabel(` [EDITING] `);
            }
            s.render();
        }
    });
    s.key(['down'], () => {
        const f = s.getFocused();
        if (f !== ib)
            return;
        if (picking())
            return;
        if (hi === -1)
            return;
        hi--;
        if (hi === -1) {
            ib.setValue(si);
            eid = null;
            ib.setLabel(' Message ');
        }
        else {
            const e = getEntry();
            if (e) {
                eid = e.id;
                ib.setValue(e.text);
            }
        }
        s.render();
    });
    return {
        add: (id, text) => {
            h.push({ id, text });
            if (h.length > max)
                h.shift();
            hi = -1;
            si = '';
            eid = null;
        },
        /** The server named a sent line: its entry (and an edit in progress) take the server id. */
        rekey: (from, to) => {
            for (const e of h)
                if (e.id === from)
                    e.id = to;
            if (eid === from)
                eid = to;
        },
        getEditingId: () => eid,
        /** The id of the last line this user sent (a stored id once the server has acked it), or null. */
        lastId: () => (h.length ? h[h.length - 1].id : null),
        reset: () => {
            hi = -1;
            si = '';
            eid = null;
            ib.setLabel(' Message ');
        }
    };
}
