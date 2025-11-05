"use strict";
/**
 * NodeStatusManager - Maintains shared node status for WHO doors
 *
 * AmiExpress WHO doors (like RTW) access node information via a shared
 * semaphore structure called "multiPort". This manager maintains that
 * structure and makes it available to doors via FindPort().
 *
 * Reference: AmiExpress-Sources/axcommon.e lines 584-605
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.nodeStatusManager = exports.NodeStatusManager = exports.NodeStatus = void 0;
/**
 * Node status codes (from express.e)
 */
var NodeStatus;
(function (NodeStatus) {
    NodeStatus[NodeStatus["ENV_NOTACTIVE"] = -1] = "ENV_NOTACTIVE";
    NodeStatus[NodeStatus["ENV_IDLE"] = 0] = "ENV_IDLE";
    NodeStatus[NodeStatus["ENV_DOWNLOADING"] = 1] = "ENV_DOWNLOADING";
    NodeStatus[NodeStatus["ENV_UPLOADING"] = 2] = "ENV_UPLOADING";
    NodeStatus[NodeStatus["ENV_DOORS"] = 3] = "ENV_DOORS";
    NodeStatus[NodeStatus["ENV_MAIL"] = 4] = "ENV_MAIL";
    NodeStatus[NodeStatus["ENV_STATS"] = 5] = "ENV_STATS";
    NodeStatus[NodeStatus["ENV_ACCOUNT"] = 6] = "ENV_ACCOUNT";
    NodeStatus[NodeStatus["ENV_ZOOM"] = 7] = "ENV_ZOOM";
    NodeStatus[NodeStatus["ENV_FILES"] = 8] = "ENV_FILES";
    NodeStatus[NodeStatus["ENV_BULLETINS"] = 9] = "ENV_BULLETINS";
    NodeStatus[NodeStatus["ENV_VIEWING"] = 10] = "ENV_VIEWING";
    NodeStatus[NodeStatus["ENV_ACCOUNTSEQ"] = 11] = "ENV_ACCOUNTSEQ";
    NodeStatus[NodeStatus["ENV_LOGOFF"] = 12] = "ENV_LOGOFF";
    NodeStatus[NodeStatus["ENV_SYSOP"] = 13] = "ENV_SYSOP";
    NodeStatus[NodeStatus["ENV_SHELL"] = 14] = "ENV_SHELL";
    NodeStatus[NodeStatus["ENV_EMACS"] = 15] = "ENV_EMACS";
    NodeStatus[NodeStatus["ENV_JOIN"] = 16] = "ENV_JOIN";
    NodeStatus[NodeStatus["ENV_CHAT"] = 17] = "ENV_CHAT";
    NodeStatus[NodeStatus["ENV_REQ_CHAT"] = 18] = "ENV_REQ_CHAT";
    NodeStatus[NodeStatus["ENV_CONNECT"] = 19] = "ENV_CONNECT";
    NodeStatus[NodeStatus["ENV_LOGGINGON"] = 20] = "ENV_LOGGINGON";
    NodeStatus[NodeStatus["ENV_AWAITCONNECT"] = 21] = "ENV_AWAITCONNECT";
    NodeStatus[NodeStatus["ENV_SCANNING"] = 22] = "ENV_SCANNING";
    NodeStatus[NodeStatus["ENV_SHUTDOWN"] = 23] = "ENV_SHUTDOWN";
    NodeStatus[NodeStatus["ENV_MULTICHAT"] = 24] = "ENV_MULTICHAT";
    NodeStatus[NodeStatus["ENV_SUSPEND"] = 25] = "ENV_SUSPEND";
    NodeStatus[NodeStatus["ENV_RESERVE"] = 26] = "ENV_RESERVE";
    NodeStatus[NodeStatus["ENV_ONLINEMSG"] = 27] = "ENV_ONLINEMSG"; // Online message
})(NodeStatus || (exports.NodeStatus = NodeStatus = {}));
/**
 * Manages node status information for WHO doors
 */
var NodeStatusManager = /** @class */ (function () {
    function NodeStatusManager() {
        this.nodes = new Map();
        this.MAX_NODES = 8; // AmiExpress supports up to 8 nodes
        this.multiPortAddress = 0;
        this.singlePortAddresses = new Map();
    }
    /**
     * Initialize node status structures in emulator memory
     *
     * This creates the "multiPort" semaphore that WHO doors search for.
     * The structure contains node information for all active nodes.
     *
     * @param emulator - The Moira emulator instance
     * @param baseAddress - Base address for semaphore structure (default: 0xB0000)
     */
    NodeStatusManager.prototype.initializeInEmulator = function (emulator, baseAddress) {
        if (baseAddress === void 0) { baseAddress = 0xB0000; }
        console.log('[NodeStatusManager] Initializing multiPort semaphore structure...');
        this.multiPortAddress = baseAddress;
        // Initialize all nodes as inactive
        for (var i = 0; i < this.MAX_NODES; i++) {
            this.nodes.set(i, {
                nodeId: i,
                status: NodeStatus.ENV_NOTACTIVE,
                handle: '',
                location: '',
                misc1: '',
                misc2: 0,
                baud: ''
            });
        }
        // Create singlePort structures for each node
        // Each singlePort is 300 bytes (approx)
        var currentAddr = baseAddress + 0x1000; // Offset from multiPort
        for (var i = 0; i < this.MAX_NODES; i++) {
            this.singlePortAddresses.set(i, currentAddr);
            this.writeSinglePortToMemory(emulator, i, currentAddr);
            currentAddr += 0x200; // 512 bytes per node (plenty of space)
        }
        console.log("[NodeStatusManager] MultiPort at 0x".concat(this.multiPortAddress.toString(16)));
        console.log("[NodeStatusManager] Node status structures initialized");
    };
    /**
     * Write singlePort structure to emulator memory
     *
     * Structure (from axcommon.e):
     *   +0:   semi (semaphore header, 46 bytes)
     *   +46:  list (14 bytes)
     *   +60:  multiCom (4 bytes)
     *   +64:  semiName (20 bytes)
     *   +84:  status (4 bytes)
     *   +88:  handle (31 bytes)
     *   +119: location (31 bytes)
     *   +150: misc1 (100 bytes)
     *   +250: misc2 (100 bytes)
     *   +350: baud (10 bytes)
     */
    NodeStatusManager.prototype.writeSinglePortToMemory = function (emulator, nodeId, address) {
        var node = this.nodes.get(nodeId);
        if (!node)
            return;
        // Write semaphore header (simplified - just structure, no real semaphore)
        // ss structure: ln_Node (14 bytes) + rest of Semaphore structure
        for (var i = 0; i < 46; i++) {
            emulator.writeMemory(address + i, 0);
        }
        // Write MinList header (14 bytes)
        for (var i = 0; i < 14; i++) {
            emulator.writeMemory(address + 46 + i, 0);
        }
        // Write multiCom flag (4 bytes)
        emulator.writeMemory32(address + 60, 1); // Multicom enabled
        // Write semiName (20 bytes) - e.g., "AENode0"
        var semiName = "AENode".concat(nodeId);
        for (var i = 0; i < semiName.length && i < 19; i++) {
            emulator.writeMemory(address + 64 + i, semiName.charCodeAt(i));
        }
        emulator.writeMemory(address + 64 + semiName.length, 0); // Null terminator
        // Write status (4 bytes)
        emulator.writeMemory32(address + 84, node.status);
        // Write handle (31 bytes)
        for (var i = 0; i < node.handle.length && i < 30; i++) {
            emulator.writeMemory(address + 88 + i, node.handle.charCodeAt(i));
        }
        emulator.writeMemory(address + 88 + node.handle.length, 0);
        // Write location (31 bytes)
        for (var i = 0; i < node.location.length && i < 30; i++) {
            emulator.writeMemory(address + 119 + i, node.location.charCodeAt(i));
        }
        emulator.writeMemory(address + 119 + node.location.length, 0);
        // Write misc1 (100 bytes)
        for (var i = 0; i < node.misc1.length && i < 99; i++) {
            emulator.writeMemory(address + 150 + i, node.misc1.charCodeAt(i));
        }
        emulator.writeMemory(address + 150 + node.misc1.length, 0);
        // Write misc2 (first byte is chat availability flag)
        emulator.writeMemory(address + 250, node.misc2);
        for (var i = 1; i < 100; i++) {
            emulator.writeMemory(address + 250 + i, 0);
        }
        // Write baud (10 bytes)
        for (var i = 0; i < node.baud.length && i < 9; i++) {
            emulator.writeMemory(address + 350 + i, node.baud.charCodeAt(i));
        }
        emulator.writeMemory(address + 350 + node.baud.length, 0);
        console.log("[NodeStatusManager] Node ".concat(nodeId, " singlePort at 0x").concat(address.toString(16), ": ").concat(node.handle || '(inactive)'));
    };
    /**
     * Update node status and refresh emulator memory
     */
    NodeStatusManager.prototype.updateNode = function (emulator, nodeId, updates) {
        var node = this.nodes.get(nodeId);
        if (!node) {
            console.warn("[NodeStatusManager] Node ".concat(nodeId, " not found"));
            return;
        }
        // Apply updates
        Object.assign(node, updates);
        // Write updated structure to emulator memory
        var address = this.singlePortAddresses.get(nodeId);
        if (address) {
            this.writeSinglePortToMemory(emulator, nodeId, address);
        }
        console.log("[NodeStatusManager] Updated node ".concat(nodeId, ": ").concat(node.handle, " - ").concat(NodeStatus[node.status]));
    };
    /**
     * Get singlePort address for a specific node
     */
    NodeStatusManager.prototype.getSinglePortAddress = function (nodeId) {
        return this.singlePortAddresses.get(nodeId) || 0;
    };
    /**
     * Get multiPort address (contains array of all nodes)
     */
    NodeStatusManager.prototype.getMultiPortAddress = function () {
        return this.multiPortAddress;
    };
    /**
     * Get current node information
     */
    NodeStatusManager.prototype.getNodeInfo = function (nodeId) {
        return this.nodes.get(nodeId);
    };
    /**
     * Get all active nodes
     */
    NodeStatusManager.prototype.getActiveNodes = function () {
        return Array.from(this.nodes.values()).filter(function (node) { return node.status !== NodeStatus.ENV_NOTACTIVE; });
    };
    return NodeStatusManager;
}());
exports.NodeStatusManager = NodeStatusManager;
// Export singleton instance
exports.nodeStatusManager = new NodeStatusManager();
