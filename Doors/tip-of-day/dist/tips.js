"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FALLBACK_TIP = void 0;
exports.pickTip = pickTip;
exports.FALLBACK_TIP = {
    id: 'fallback:hello',
    kind: 'howto',
    title: 'Welcome to the board',
    body: 'Type ? at the menu for the command list. Everything here answers to a single key.',
};
function doorTips(catalog) {
    return catalog.map((d) => ({
        id: `door:${d.command}`,
        kind: 'door',
        title: d.inHouse ? `Try ${d.command} — written here` : `Try ${d.command}`,
        body: d.inHouse
            ? `${d.description || 'A door written for this board.'} Run ${d.command} at the menu.`
            : `${d.description || 'A door on this board.'} (Ported — run ${d.command} at the menu.)`,
        command: d.command,
    }));
}
function factTips(facts) {
    const tips = [];
    if (facts.conferences.length > 0) {
        tips.push({
            id: 'fact:conferences',
            kind: 'fact',
            title: `${facts.conferences.length} conferences open`,
            body: `From ${facts.conferences[0].name} on — join one with J and say hello.`,
        });
    }
    if (facts.doorsInstalled > 0) {
        tips.push({
            id: 'fact:doors',
            kind: 'fact',
            title: `${facts.doorsInstalled} doors installed`,
            body: 'Games, tools, chat, art — the doors menu lists them all.',
        });
    }
    if (facts.newestFile) {
        tips.push({
            id: 'fact:newest',
            kind: 'fact',
            title: 'Fresh files',
            body: `Newest arrival: ${facts.newestFile}. Flag it with F, fetch it with D.`,
        });
    }
    if (typeof facts.openTasks === 'number' && facts.openTasks > 0) {
        tips.push({
            id: 'fact:tasks',
            kind: 'fact',
            title: `${facts.openTasks} open WHIP tasks`,
            body: 'The demo scene runs on this board — WHIP shows what needs hands.',
            command: 'WHIP',
        });
    }
    return tips;
}
function howtoTips(howtos) {
    return howtos.map((h) => ({ id: `howto:${h.id}`, kind: 'howto', title: h.title, body: h.body, command: h.command }));
}
/**
 * Weighted pick, unseen-first per kind. `rand` injects for tests; seen is
 * the caller's stored id set (rotation state lives in door storage, not
 * here). Returns FALLBACK_TIP when every source is empty.
 */
function pickTip(catalog, facts, howtos, seen, weights, rand = Math.random) {
    const pools = [
        { kind: 'door', weight: weights.door, tips: doorTips(catalog) },
        { kind: 'fact', weight: weights.fact, tips: factTips(facts) },
        { kind: 'howto', weight: weights.howto, tips: howtoTips(howtos) },
        { kind: 'event', weight: weights.event, tips: [] },
    ];
    // Unseen-first: a kind with only seen tips still counts (repeats beat
    // silence), but its pool is the seen ones only when nothing is fresh.
    const live = pools
        .map((p) => {
        const fresh = p.tips.filter((t) => !seen.has(t.id));
        return { ...p, tips: fresh.length > 0 ? fresh : p.tips };
    })
        .filter((p) => p.weight > 0 && p.tips.length > 0);
    if (live.length === 0)
        return exports.FALLBACK_TIP;
    const total = live.reduce((sum, p) => sum + p.weight, 0);
    let roll = rand() * total;
    for (const pool of live) {
        roll -= pool.weight;
        if (roll <= 0)
            return pool.tips[Math.floor(rand() * pool.tips.length)];
    }
    return live[live.length - 1].tips[0];
}
//# sourceMappingURL=tips.js.map