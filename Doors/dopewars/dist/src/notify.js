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
            return `[DOPEWARS] ${ev.handle} retired with $${ev.score.toLocaleString()} in ${ev.turns} turns — NEW HIGH SCORE!`;
        case 'deal':
            return `[DOPEWARS] ${ev.handle} ${ev.action === 'buy' ? 'bought' : 'sold'} ${ev.amount} ${ev.drug} @ $${ev.price.toLocaleString()}`;
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
function postLivechat(message) {
    try {
        const livechat = global[Symbol.for('aex-livechat')];
        if (livechat && typeof livechat.broadcast === 'function') {
            livechat.broadcast({ type: 'system', text: message });
        }
    }
    catch {
        // livechat not available — silent ignore
    }
}
class Notifier {
    constructor(cfg) {
        this.cfg = cfg;
    }
    send(ev) {
        const msg = formatMessage(ev);
        if (this.cfg.discordWebhook)
            postDiscord(this.cfg.discordWebhook, msg);
        if (this.cfg.notifyLivechat)
            postLivechat(msg);
    }
}
exports.Notifier = Notifier;
//# sourceMappingURL=notify.js.map