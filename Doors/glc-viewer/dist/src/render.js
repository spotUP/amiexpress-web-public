"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderGlcScreen = renderGlcScreen;
/**
 * What GLCViewer puts on the wire, as a list of lines.
 *
 * PURE on purpose: no socket, no fetch, no door context. Byte parity with the
 * 68K original is the whole point of this door's first phase, and parity is
 * only testable if the bytes can be produced without a network and a 68000.
 *
 * Every piece of art and every row template comes from `art.generated.ts`,
 * which is lifted out of `GLCViewer.e` itself. Nothing here retypes a logo.
 */
const art_generated_1 = require("./art.generated");
const estringf_1 = require("./estringf");
/** The form feed `StringF(tempStr,'\c',12)` puts in front of everything. */
const FORM_FEED = '\x0c';
/**
 * `CENTRENAME`: pad to 21 and shuffle right one space at a time.
 *
 * `GLCViewer.e:166-172` trims the value, then repeats `StrAdd(x,' ')` followed
 * by `StringF(x,' \s',x)` until it is 21 long - a space on the right and then
 * a space on the LEFT, so a short name drifts to the middle two characters at
 * a time. Reproduced rather than replaced by a centring helper, because the
 * two differ by a space on every odd-length name.
 */
function centreLikeE(value) {
    let out = value.trim();
    while (out.length < 21) {
        out = out + ' ';
        out = ' ' + out;
    }
    return out;
}
/** A stat field, clamped the way E clamps it before the footer is built. */
function clamp(value, width, ceiling) {
    return value.length > width ? ceiling : value;
}
/** Every line of the screen, in order, without their line terminators. */
function renderGlcScreen(screen) {
    const style = screen.style >= 1 && screen.style <= 4 ? screen.style : 1;
    const firstPair = style === 1 || style === 3;
    const logo = screen.logo && screen.logo.length > 0
        ? screen.logo
        : (firstPair ? art_generated_1.LOGO_STYLE_1_3 : art_generated_1.LOGO_STYLE_2_4);
    const banner = firstPair ? art_generated_1.BANNER_1_3 : art_generated_1.BANNER_2_4;
    const columns = firstPair
        ? (screen.showLocation ? art_generated_1.COLUMNS_LOCATION_1_3 : art_generated_1.COLUMNS_BBS_1_3)
        : (screen.showLocation ? art_generated_1.COLUMNS_LOCATION_2_4 : art_generated_1.COLUMNS_BBS_2_4);
    const lines = [];
    // The clear is PREPENDED to the first logo line, not sent on its own: E
    // builds both into `tempStr` and transmits it once.
    lines.push((screen.screenClear ? FORM_FEED : '') + logo[0]);
    for (let i = 1; i < logo.length; i++)
        lines.push(logo[i]);
    lines.push(banner);
    lines.push(columns);
    lines.push(art_generated_1.RULER_TOP);
    for (const call of screen.calls) {
        const name = screen.showLocation ? call.Location : call.Bbsname;
        lines.push((0, estringf_1.formatE)(art_generated_1.ROW_TEMPLATE, [
            call.Username,
            screen.centreName ? centreLikeE(name) : name,
            call.Dateon,
            call.Timeon,
            call.Timeoff,
            call.Actions,
            (0, estringf_1.transferField)(call.Upload),
            (0, estringf_1.transferField)(call.Download),
        ]));
    }
    lines.push(art_generated_1.RULER_BOTTOM);
    for (const line of art_generated_1.LEGEND)
        lines.push(line);
    lines.push(art_generated_1.RULE_PLAIN);
    // E clamps each stat to its field WIDTH by replacing it with all-nines,
    // rather than letting StringF cut it - `999` means "more than fits", and a
    // truncated `1234` would have read as `123`.
    const y = screen.yesterday;
    const p = screen.previousDay;
    const r = screen.records;
    const stats = {
        yCalls: clamp(y.calls, 3, '999'),
        yCps: clamp(y.topcps, 5, '99999'),
        yUp: clamp(y.uploads, 7, '9999999'),
        yDown: clamp(y.downloads, 7, '9999999'),
        pCalls: clamp(p.calls, 3, '999'),
        pCps: clamp(p.topcps, 5, '99999'),
        pUp: clamp(p.uploads, 7, '9999999'),
        pDown: clamp(p.downloads, 7, '9999999'),
    };
    if (style === 1 || style === 2) {
        lines.push((0, estringf_1.formatE)(art_generated_1.FOOTER_1_2[0], [y.statdate, stats.yCalls, stats.yCps, stats.yUp, stats.yDown]));
        lines.push((0, estringf_1.formatE)(art_generated_1.FOOTER_1_2[1], [p.statdate, stats.pCalls, stats.pCps, stats.pUp, stats.pDown]));
        lines.push((0, estringf_1.formatE)(art_generated_1.FOOTER_1_2[2], [r.recordcalls, r.calls, r.mostcalled]));
    }
    else {
        lines.push((0, estringf_1.formatE)(art_generated_1.FOOTER_3_4[0], [y.statdate, stats.yCalls, r.calls, r.mostcalled]));
        lines.push((0, estringf_1.formatE)(art_generated_1.FOOTER_3_4[1], [p.statdate, stats.pCalls, r.calls2, r.secondmostcalled]));
        lines.push((0, estringf_1.formatE)(art_generated_1.FOOTER_3_4[2], [r.recordcalls, r.calls3, r.thirdmostcalled]));
    }
    lines.push(art_generated_1.RULE_FINAL);
    return lines;
}
//# sourceMappingURL=render.js.map