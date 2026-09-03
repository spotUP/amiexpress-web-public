"use strict";
/**
 * Minimal test runner for the RIP BROWSER door.
 *
 * Same pattern as WHIP, LiveChat, CARD LOBBY and VOICE CHAT: dependency-free
 * async functions plus node assert, run via tsx (`npm test`). A test fails by
 * throwing.
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
/* eslint-disable no-console */
const TEST_MODULES = ['./footer.test'];
const realLog = console.log;
console.log = () => { };
(async () => {
    let passed = 0;
    const failures = [];
    for (const mod of TEST_MODULES) {
        const tests = await Promise.resolve(`${mod}`).then(s => __importStar(require(s)));
        for (const [name, fn] of Object.entries(tests)) {
            if (typeof fn !== 'function')
                continue;
            try {
                await fn();
                passed++;
                realLog(`  [OK] ${mod.replace('./', '')} :: ${name}`);
            }
            catch (error) {
                failures.push({ name: `${mod} :: ${name}`, error });
                realLog(`  [FAIL] ${mod.replace('./', '')} :: ${name}`);
                realLog(`         ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
    realLog(`\n${passed} passed, ${failures.length} failed`);
    process.exit(failures.length > 0 ? 1 : 0);
})().catch(e => {
    realLog('Test runner crashed:', e);
    process.exit(1);
});
//# sourceMappingURL=run-tests.js.map