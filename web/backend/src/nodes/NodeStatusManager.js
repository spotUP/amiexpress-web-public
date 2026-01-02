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
class NodeStatusManager {
    constructor() {
        this.nodes = new Map();
        this.MAX_NODES = 255; // AmiExpress supports up to 255 nodes
        this.multiPortAddress = 0;
        this.singlePortAddresses = new Map();
        this.nameAddresses = new Map(); // node -> name string address
    }
    /**
     * Initialize node status structures in emulator memory
     *
     * This creates the "multiPort" semaphore that WHO doors search for.
     * The structure contains node information for all active nodes.
     *
     * @param emulator - The Moira emulator instance
     * @param execLibrary - The ExecLibrary instance for semaphore registration
     * @param baseAddress - Base address for semaphore structure (default: 0xB0000)
     */
    initializeInEmulator(emulator, execLibrary, baseAddress = 0xB0000) {
        console.log('[NodeStatusManager] Initializing multiPort semaphore structure...');
        this.multiPortAddress = baseAddress;
        // Initialize all nodes as inactive
        for (let i = 0; i < this.MAX_NODES; i++) {
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
        let currentAddr = baseAddress + 0x1000; // Offset from multiPort
        const nameStringAddresses = [];
        for (let i = 0; i < this.MAX_NODES; i++) {
            this.singlePortAddresses.set(i, currentAddr);
            // Allocate space for semaphore name string (e.g., "AEServer.0")
            const nameStr = `AEServer.${i}`;
            const nameAddr = currentAddr + 0x180; // Store name at end of structure
            // Write semaphore name string
            for (let j = 0; j < nameStr.length; j++) {
                emulator.writeMemory(nameAddr + j, nameStr.charCodeAt(j));
            }
            emulator.writeMemory(nameAddr + nameStr.length, 0); // Null terminator
            nameStringAddresses.push(nameAddr);
            this.nameAddresses.set(i, nameAddr); // Save for later updates
            this.writeSinglePortToMemory(emulator, i, currentAddr, nameAddr);
            currentAddr += 0x200; // 512 bytes per node (plenty of space)
        }
        // Register all AEServer semaphores with ExecLibrary
        console.log('[NodeStatusManager] Registering AEServer semaphores...');
        for (let i = 0; i < this.MAX_NODES; i++) {
            const semaphoreAddr = this.singlePortAddresses.get(i);
            execLibrary.addSemaphore(semaphoreAddr);
        }
        console.log(`[NodeStatusManager] MultiPort at 0x${this.multiPortAddress.toString(16)}`);
        console.log(`[NodeStatusManager] Node status structures initialized and registered`);
    }
    /**
     * Write singlePort structure to emulator memory
     *
     * Structure (from axcommon.e):
     *   +0:   semi (semaphore header, 46 bytes)
     *          +0: ln_Succ (4 bytes)
     *          +4: ln_Pred (4 bytes)
     *          +8: ln_Name (4 bytes) - pointer to semaphore name string
     *          +12: ln_Type (1 byte)
     *          +13: ln_Pri (1 byte)
     *          +14-45: rest of semaphore structure
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
    writeSinglePortToMemory(emulator, nodeId, address, nameAddr) {
        const node = this.nodes.get(nodeId);
        if (!node)
            return;
        // Write semaphore header (Node structure + semaphore fields)
        // Clear the entire semaphore header
        for (let i = 0; i < 46; i++) {
            emulator.writeMemory(address + i, 0);
        }
        // Write ln_Name pointer (offset +8) - points to "AEServer.%d" string
        emulator.writeMemory32(address + 8, nameAddr);
        // Write ln_Type (offset +12) - NT_SIGNALSEM = 15
        emulator.writeMemory(address + 12, 15);
        // Write MinList header (14 bytes)
        for (let i = 0; i < 14; i++) {
            emulator.writeMemory(address + 46 + i, 0);
        }
        // Write multiCom flag (4 bytes)
        emulator.writeMemory32(address + 60, 1); // Multicom enabled
        // Write semiName (20 bytes) - e.g., "AENode0"
        const semiName = `AENode${nodeId}`;
        for (let i = 0; i < semiName.length && i < 19; i++) {
            emulator.writeMemory(address + 64 + i, semiName.charCodeAt(i));
        }
        emulator.writeMemory(address + 64 + semiName.length, 0); // Null terminator
        // Write status (4 bytes)
        emulator.writeMemory32(address + 84, node.status);
        // Write handle (31 bytes)
        for (let i = 0; i < node.handle.length && i < 30; i++) {
            emulator.writeMemory(address + 88 + i, node.handle.charCodeAt(i));
        }
        emulator.writeMemory(address + 88 + node.handle.length, 0);
        // Write location (31 bytes)
        for (let i = 0; i < node.location.length && i < 30; i++) {
            emulator.writeMemory(address + 119 + i, node.location.charCodeAt(i));
        }
        emulator.writeMemory(address + 119 + node.location.length, 0);
        // Write misc1 (100 bytes)
        for (let i = 0; i < node.misc1.length && i < 99; i++) {
            emulator.writeMemory(address + 150 + i, node.misc1.charCodeAt(i));
        }
        emulator.writeMemory(address + 150 + node.misc1.length, 0);
        // Write misc2 (first byte is chat availability flag)
        emulator.writeMemory(address + 250, node.misc2);
        for (let i = 1; i < 100; i++) {
            emulator.writeMemory(address + 250 + i, 0);
        }
        // Write baud (10 bytes)
        for (let i = 0; i < node.baud.length && i < 9; i++) {
            emulator.writeMemory(address + 350 + i, node.baud.charCodeAt(i));
        }
        emulator.writeMemory(address + 350 + node.baud.length, 0);
        console.log(`[NodeStatusManager] Node ${nodeId} singlePort at 0x${address.toString(16)}: ${node.handle || '(inactive)'}`);
    }
    /**
     * Update node status and refresh emulator memory
     */
    updateNode(emulator, nodeId, updates) {
        const node = this.nodes.get(nodeId);
        if (!node) {
            console.warn(`[NodeStatusManager] Node ${nodeId} not found`);
            return;
        }
        // Apply updates
        Object.assign(node, updates);
        // Write updated structure to emulator memory
        const address = this.singlePortAddresses.get(nodeId);
        const nameAddr = this.nameAddresses.get(nodeId);
        if (address && nameAddr) {
            this.writeSinglePortToMemory(emulator, nodeId, address, nameAddr);
        }
        console.log(`[NodeStatusManager] Updated node ${nodeId}: ${node.handle} - ${NodeStatus[node.status]}`);
    }
    /**
     * Get singlePort address for a specific node
     */
    getSinglePortAddress(nodeId) {
        return this.singlePortAddresses.get(nodeId) || 0;
    }
    /**
     * Get multiPort address (contains array of all nodes)
     */
    getMultiPortAddress() {
        return this.multiPortAddress;
    }
    /**
     * Get current node information
     */
    getNodeInfo(nodeId) {
        return this.nodes.get(nodeId);
    }
    /**
     * Get all active nodes
     */
    getActiveNodes() {
        return Array.from(this.nodes.values()).filter(node => node.status !== NodeStatus.ENV_NOTACTIVE);
    }
}
exports.NodeStatusManager = NodeStatusManager;
// Export singleton instance
exports.nodeStatusManager = new NodeStatusManager();
