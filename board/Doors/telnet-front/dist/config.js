"use strict";
/**
 * What the login screen says about this board.
 *
 * Two things a sysop cannot otherwise set, both wrong on this board until
 * they could:
 *
 *   - the ADDRESS. With BBS_IP unset the door walked the machine's network
 *     interfaces and printed the first non-internal IPv4 it found - inside a
 *     container that is 172.18.0.2, a private address on a docker bridge that
 *     nobody outside can dial. Every user saw it.
 *   - the NODE COUNT. MAX_NODES is unset in the container, so the screen
 *     listed 8 nodes on a board whose own bbsConfig.info says 32.
 *
 * Layered lowest first: the defaults here, the environment variables the door
 * has always read, then what the sysop set in the admin. Only keys actually
 * set come from the last layer, so a declared default cannot overwrite an
 * environment a board is deliberately using.
 */
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
exports.MAX_NODES_CEILING = void 0;
exports.defaultConfig = defaultConfig;
exports.firstExternalIPv4 = firstExternalIPv4;
exports.loadConfig = loadConfig;
exports.boardAddress = boardAddress;
const os = __importStar(require("os"));
// The narrow subpath, not the package root: reading a JSON file has no
// business loading the SDK's audio engine.
const settings_1 = require("@amiexpress/bbs-door-sdk/settings");
/**
 * What this BBS runs: NodeStatusManager.MAX_NODES = 255.
 *
 * The Amiga's own limit is 32 (axcommon.e:28) and this door capped there at
 * first, which would have hidden every node above 32 on a board configured
 * for 255. The 68K paths that do carry the Amiga limit enforce it themselves.
 */
exports.MAX_NODES_CEILING = 255;
function defaultConfig() {
    // Look at every node the board can have. The screen prints the ones in
    // use, so scanning more costs a loop, not rows.
    return { bbsAddress: '', maxNodes: exports.MAX_NODES_CEILING };
}
/** The machine's first non-internal IPv4, which is a last resort, not an answer. */
function firstExternalIPv4(interfaces = os.networkInterfaces()) {
    for (const name of Object.keys(interfaces)) {
        for (const addr of interfaces[name] ?? []) {
            if (addr.family === 'IPv4' && !addr.internal)
                return addr.address;
        }
    }
    return 'localhost';
}
function loadConfig(startDir, env = process.env) {
    const config = defaultConfig();
    if (env.BBS_IP)
        config.bbsAddress = env.BBS_IP;
    if (env.MAX_NODES) {
        const fromEnv = parseInt(env.MAX_NODES, 10);
        if (Number.isFinite(fromEnv))
            config.maxNodes = fromEnv;
    }
    const overrides = (0, settings_1.readDoorSettingOverrides)(startDir);
    if (typeof overrides.bbsAddress === 'string' && overrides.bbsAddress !== '') {
        config.bbsAddress = overrides.bbsAddress;
    }
    if (typeof overrides.maxNodes === 'number')
        config.maxNodes = overrides.maxNodes;
    config.maxNodes = Math.min(exports.MAX_NODES_CEILING, Math.max(1, Math.round(config.maxNodes)));
    return config;
}
/** What to print. Falls back to the machine only when nobody has said. */
function boardAddress(config) {
    return config.bbsAddress !== '' ? config.bbsAddress : firstExternalIPv4();
}
