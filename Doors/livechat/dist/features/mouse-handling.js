"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupMouseHandling = setupMouseHandling;
function setupMouseHandling(s, cm, hcm, stb, ssb, ib, cl, scm, ul, un, chl, ci, jsc) {
    s.on('mouse', (e) => {
        if (e.action !== 'mousedown')
            return;
        const x = e.x;
        const y = e.y;
        const iib = (el) => {
            const p = el._getCoords?.() || el.position;
            if (!p)
                return false;
            return x >= p.xi && x < p.xl && y >= p.yi && y < p.yl;
        };
        if (!cm.hidden && iib(cm))
            return;
        if (!cm.hidden)
            hcm();
        if (iib(stb)) {
            if (e.button === 'left') {
                const tp = stb._getCoords?.();
                if (tp) {
                    const rx = x - tp.xi;
                    if (rx < 7)
                        ssb('channels');
                    else
                        ssb('users');
                }
            }
            return;
        }
        if (iib(ib)) {
            if (e.button === 'left') {
                ib.focus();
                s.render();
            }
            return;
        }
        if (iib(cl)) {
            if (e.button === 'left') {
                cl.focus();
                s.render();
                scm(x, y, 'chat');
            }
            else if (e.button === 'right') {
                scm(x, y, 'chat');
            }
            return;
        }
        if (!ul.hidden && iib(ul)) {
            if (e.button === 'left' || e.button === 'right') {
                const sel = ul.selected;
                const its = ul.items || [];
                if (e.button === 'left') {
                    ul.focus();
                    s.render();
                }
                if (e.button === 'right' || (e.button === 'left' && sel !== undefined)) {
                    if (sel !== undefined && Array.isArray(its) && sel >= 0 && sel < its.length && its[sel]) {
                        const txt = typeof its[sel] === 'string' ? its[sel] : its[sel]?.content || '';
                        const m = txt.match(/^.\s+(\S+)/);
                        if (m) {
                            const tu = m[1];
                            if (tu && tu !== un)
                                scm(x, y, 'user', tu);
                        }
                    }
                }
            }
            return;
        }
        if (!chl.hidden && iib(chl)) {
            if (e.button === 'left' || e.button === 'right') {
                const sel = chl.selected;
                if (e.button === 'left') {
                    chl.focus();
                    s.render();
                }
                if (e.button === 'right' || (e.button === 'left' && sel !== undefined)) {
                    if (sel !== undefined && ci && Array.isArray(ci) && sel >= 0 && sel < ci.length && ci[sel]) {
                        scm(x, y, 'channel', ci[sel].name);
                    }
                }
            }
            return;
        }
    });
    cl.on('wheelup', () => { cl.scroll(-3); s.render(); });
    cl.on('wheeldown', () => { cl.scroll(3); s.render(); });
    ul.on('wheelup', () => { ul.scroll(-2); s.render(); });
    ul.on('wheeldown', () => { ul.scroll(2); s.render(); });
    chl.on('wheelup', () => { chl.up(2); setTimeout(jsc, 0); s.render(); });
    chl.on('wheeldown', () => { chl.down(2); setTimeout(jsc, 0); s.render(); });
}
