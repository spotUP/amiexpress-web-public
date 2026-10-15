"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInputHistory = createInputHistory;
function createInputHistory(s, ib) {
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
        getEditingId: () => eid,
        reset: () => {
            hi = -1;
            si = '';
            eid = null;
            ib.setLabel(' Message ');
        }
    };
}
