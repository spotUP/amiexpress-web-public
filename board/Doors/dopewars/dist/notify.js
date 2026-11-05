"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Notifier = void 0;
const https = __importStar(require("https"));
const http = __importStar(require("http"));
const announce_1 = require("@amiexpress/bbs-door-sdk/core/announce");
function formatMessage(ev) {
    switch (ev.type) {
        case 'join':
            return `[DOPEWARS] ${ev.handle} entered the streets`;
        case 'leave':
            return `[DOPEWARS] ${ev.handle} left the streets`;
        case 'busted':
            return `[DOPEWARS] ${ev.handle} was busted in ${ev.location}! Lost ${ev.drugsLost} units`;
        case 'attack':
            return `[DOPEWARS] ${ev.attacker} attacked ${ev.target} in ${ev.location}!`;
        case 'high_score':
            return `[DOPEWARS] ${ev.handle} retired with $${ev.score.toLocaleString('en-US')} in ${ev.turns} turns — NEW HIGH SCORE!`;
        case 'deal':
            return `[DOPEWARS] ${ev.handle} ${ev.action === 'buy' ? 'bought' : 'sold'} ${ev.amount} ${ev.drug} @ $${ev.price.toLocaleString('en-US')}`;
        case 'price_spike':
            return `[DOPEWARS] ${ev.cheap ? 'Cheap' : 'Expensive'} ${ev.drug} spotted in ${ev.location}!`;
    }
}
function postDiscord(webhookUrl, message) {
    if (!webhookUrl)
        return;
    try {
        const body = JSON.stringify({ content: message });
        const url = new URL(webhookUrl);
        const isHttps = url.protocol === 'https:';
        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
        };
        const req = (isHttps ? https : http).request(options, () => { });
        req.on('error', () => { });
        req.write(body);
        req.end();
    }
    catch {
        // fire-and-forget — never throw
    }
}
/**
 * Which announcements leave the board, and as what.
 *
 * A retirement with a new high score is a score; the rest are announcements
 * of the "something happened, come and look" kind. The board decides who
 * actually receives them - see sdk/core/announce.ts and the sysop's webhook
 * subscriptions - which is the whole point of routing through it.
 */
class Notifier {
    /**
     * `host` is the door's `ctx.bbs`. Without one - a test, a script - the
     * announcer is a no-op and the game plays on.
     */
    constructor(cfg, host) {
        this.cfg = cfg;
        this.announce = (0, announce_1.createAnnouncer)(host);
    }
    send(ev) {
        const msg = formatMessage(ev);
        // Through the BOARD: LiveChat and whatever webhooks the sysop subscribed,
        // with the board's PII policy and per-door filters applied. This door used
        // to POST to a Discord URL of its own and shout into LiveChat through a
        // global symbol, which meant a sysop could neither filter it nor stop it.
        // notifyLivechat kept its meaning: a board that switched announcements
        // off stays quiet, it just is not a global symbol any more.
        if (this.cfg.notifyLivechat === false) {
            if (this.cfg.discordWebhook)
                postDiscord(this.cfg.discordWebhook, msg);
            return;
        }
        if (ev.type === 'high_score') {
            this.announce.score(ev.score, { turns: ev.turns, handle: ev.handle, message: msg });
        }
        else {
            this.announce.custom(`dopewars_${ev.type}`, msg, { ...ev });
        }
        // The old direct hook still fires while a board has one configured, so
        // nobody's Discord goes quiet on upgrade. DOPEWARS_DISCORD_WEBHOOK is
        // deprecated: a webhook subscribed to door_announcement or door_score with
        // a DOPEWARS filter does the same thing and obeys the board's rules.
        if (this.cfg.discordWebhook)
            postDiscord(this.cfg.discordWebhook, msg);
    }
}
exports.Notifier = Notifier;
//# sourceMappingURL=notify.js.map