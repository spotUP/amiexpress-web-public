"use strict";
/**
 * Where the .RIP files are: `RIPgraphics` under the BBS root.
 *
 * This was the absolute path of one developer's checkout -
 * ~/Code/amiexpress-web/RIPgraphics - which cannot exist on the
 * board, a Linux container with no /Users at all. The graphics have been in
 * /app/data/bbs/RIPgraphics the whole time while the door told every user who
 * opened it "Directory not found".
 *
 * RIPgraphics is not inside the door, so this is the BBS root rather than the
 * door root: resolveBbsRoot prefers BBS_DATA_DIR, which the container sets,
 * and otherwise walks up to the directory holding Commands/BBSCmd.
 *
 * Its own module so a test can check the path without importing the door,
 * which pulls in the whole SDK.
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
exports.RIP_GRAPHICS_DIRNAME = void 0;
exports.ripGraphicsDir = ripGraphicsDir;
const path = __importStar(require("path"));
const settings_1 = require("@amiexpress/bbs-door-sdk/settings");
exports.RIP_GRAPHICS_DIRNAME = 'RIPgraphics';
function ripGraphicsDir(startDir = __dirname) {
    return path.join((0, settings_1.resolveBbsRoot)(startDir), exports.RIP_GRAPHICS_DIRNAME);
}
//# sourceMappingURL=paths.js.map