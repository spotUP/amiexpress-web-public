#!/usr/bin/env node

const path = require("path");

/**
 * Bulls Door Ultimate Debug Test
 *
 * Captures comprehensive execution data to identify the exact blocker
 * in Bulls door XIM mode execution.
 */

const { AmigaDoorSession } = require("./src/amiga-emulation/AmigaDoorSession");
const { Server } = require("socket.io");
const express = require("express");
const http = require("http");

// Create a mock Express app and HTTP server for Socket.io
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Mock BBS session data
const mockBbsSession = {
  nodeId: 0,
  user: {
    username: "TestUser",
    location: "Test Location",
    secLevel: 100,
  },
  nodeNumber: 0,
  system: {
    name: "Test BBS",
    location: "Test Location",
  },
};

let debugLog = [];
let outputLog = [];
let errorLog = [];

// Mock socket that captures all events
function createMockSocket() {
  const socket = {
    _events: {},
    connected: true,

    on: function (event, callback) {
      this._events[event] = callback;
      console.log(`[MOCK-SOCKET] Registered event listener: ${event}`);
    },

    emit: function (event, data) {
      console.log(
        `[MOCK-SOCKET] Emit: ${event}`,
        JSON.stringify(data, null, 2)
      );

      if (event === "ansi-output") {
        outputLog.push(data);
        console.log(`[MOCK-OUTPUT] ${data}`);
      } else if (event === "door:status") {
        console.log(`[DOOR-STATUS] ${data.status}`);
      } else if (event === "door:error") {
        errorLog.push(data);
        console.log(`[DOOR-ERROR] ${data.message}`);
      }
    },

    disconnect: function () {
      console.log("[MOCK-SOCKET] Disconnected");
      this.connected = false;
    },
  };

  return socket;
}

// Bull-specific door configuration
const bullsConfig = {
  executablePath: path.join(__dirname, "../../doors/emp_tools/Bulls"),
  doorType: "XIM", // Bulls should be XIM type
  timeout: 30, // 30 seconds for debugging
  bbsSession: mockBbsSession,
  args: ["0"], // Node ID argument
};

async function runBullsUltimateDebug() {
  console.log("🔍 BULLS DOOR ULTIMATE DEBUG SESSION");
  console.log("====================================");
  console.log(`Executable: ${bullsConfig.executablePath}`);
  console.log(`Door Type: ${bullsConfig.doorType}`);
  console.log(`Timeout: ${bullsConfig.timeout}s`);
  console.log(`Node ID: ${bullsConfig.bbsSession.nodeId}`);
  console.log();

  try {
    // Capture original console methods
    const originalLog = console.log;
    const originalError = console.error;

    // Override console methods to capture everything
    console.log = function (...args) {
      const message = args.join(" ");
      debugLog.push({ type: "log", message, timestamp: Date.now() });
      originalLog.apply(console, args);
    };

    console.error = function (...args) {
      const message = args.join(" ");
      debugLog.push({ type: "error", message, timestamp: Date.now() });
      originalError.apply(console, args);
    };

    const mockSocket = createMockSocket();
    const doorSession = new AmigaDoorSession(mockSocket, bullsConfig);

    console.log("[DEBUG-TEST] Starting Bulls door execution...");
    console.log(
      "[DEBUG-TEST] Enhanced debugging enabled - capturing all execution data"
    );

    const startTime = Date.now();

    // Start the door execution
    await doorSession.start();

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log("\n🔍 BULLS DEBUG SESSION COMPLETE");
    console.log("================================");
    console.log(`Execution time: ${duration}ms`);
    console.log(`Debug log entries: ${debugLog.length}`);
    console.log(`Output log entries: ${outputLog.length}`);
    console.log(`Error log entries: ${errorLog.length}`);

    // Analyze the debug log
    console.log("\n📊 EXECUTION ANALYSIS:");
    console.log("======================");

    const writeCalls = debugLog.filter((entry) =>
      entry.message.includes("[WRITE-TRACK]")
    );
    const aedoorCalls = debugLog.filter((entry) =>
      entry.message.includes("[AEDOOR-TRACK]")
    );
    const criticalDebug = debugLog.filter((entry) =>
      entry.message.includes("[CRITICAL-DEBUG]")
    );
    const pathTrack = debugLog.filter((entry) =>
      entry.message.includes("[PATH-TRACK]")
    );
    const milestone = debugLog.filter((entry) =>
      entry.message.includes("[MILESTONE]")
    );

    console.log(`Write() calls: ${writeCalls.length}`);
    console.log(`AEDoor calls: ${aedoorCalls.length}`);
    console.log(`Critical debug entries: ${criticalDebug.length}`);
    console.log(`Path tracking entries: ${pathTrack.length}`);
    console.log(`Milestone entries: ${milestone.length}`);

    // Look for stuck points
    console.log("\n🚨 STUCK POINT ANALYSIS:");
    console.log("=========================");

    const stuckLoopEntries = debugLog.filter(
      (entry) =>
        entry.message.includes("POTENTIAL STUCK LOOP") ||
        entry.message.includes("STUCK IN LOOP")
    );

    const progressEntries = debugLog.filter((entry) =>
      entry.message.includes("PROGRESS: Iteration")
    );

    if (stuckLoopEntries.length > 0) {
      console.log("⚠️ STUCK LOOPS DETECTED:");
      stuckLoopEntries.forEach((entry) => {
        console.log(
          `  ${new Date(entry.timestamp).toISOString()}: ${entry.message}`
        );
      });
    }

    if (progressEntries.length > 0) {
      console.log("📊 PROGRESS MILESTONES:");
      progressEntries.slice(-5).forEach((entry) => {
        console.log(
          `  ${new Date(entry.timestamp).toISOString()}: ${entry.message}`
        );
      });
    }

    // Look for ROM execution (the main issue)
    console.log("\n🎯 ROM EXECUTION ANALYSIS:");
    console.log("==========================");

    const romEntries = debugLog.filter(
      (entry) =>
        entry.message.includes("0xf24404") ||
        entry.message.includes("PC in ROM") ||
        entry.message.includes("ROM range")
    );

    const nopEntries = debugLog.filter(
      (entry) =>
        entry.message.includes("NOP") || entry.message.includes("0x0000")
    );

    console.log(`ROM-related entries: ${romEntries.length}`);
    console.log(`NOP instruction entries: ${nopEntries.length}`);

    // Look for initialization completion
    console.log("\n🔧 INITIALIZATION ANALYSIS:");
    console.log("============================");

    const initComplete = debugLog.filter((entry) =>
      entry.message.includes("INITIALIZATION COMPLETE")
    );

    const mainExecution = debugLog.filter((entry) =>
      entry.message.includes("MAIN EXECUTION REACHED")
    );

    const startupMessage = debugLog.filter((entry) =>
      entry.message.includes("STARTUP MESSAGE SENT")
    );

    console.log(`Initialization complete: ${initComplete.length}`);
    console.log(`Main execution reached: ${mainExecution.length}`);
    console.log(`Startup messages sent: ${startupMessage.length}`);

    // Look for AEDoorPort issues
    console.log("\n🔌 PORT ANALYSIS:");
    console.log("==================");

    const portEntries = debugLog.filter(
      (entry) =>
        entry.message.includes("AEDoorPort") ||
        entry.message.includes("reply port") ||
        entry.message.includes("CreatePort")
    );

    console.log(`Port-related entries: ${portEntries.length}`);

    const createPortErrors = debugLog.filter(
      (entry) =>
        entry.message.includes("Couldn't create reply port") ||
        entry.message.includes("create reply port")
    );

    console.log(`CreatePort errors: ${createPortErrors.length}`);
    createPortErrors.forEach((entry) => {
      console.log(`  ${entry.message}`);
    });

    // Look for PC patterns that indicate the issue
    console.log("\n🎮 PC PATTERN ANALYSIS:");
    console.log("========================");

    const pcTracking = debugLog.filter((entry) => {
      const msg = entry.message;
      return (
        msg.includes("PC=") &&
        (msg.includes("0x1") ||
          msg.includes("0xf") ||
          msg.includes("Iteration"))
      );
    });

    console.log(`PC tracking entries: ${pcTracking.length}`);

    // Find the most recent PCs
    const recentPCs = pcTracking.slice(-10);
    console.log("Recent PC activity:");
    recentPCs.forEach((entry) => {
      console.log(`  ${entry.message}`);
    });

    // Look for the exact iteration where things go wrong
    console.log("\n🔍 EXECUTION TIMELINE:");
    console.log("=======================");

    const timelineEntries = debugLog.filter((entry) => {
      const msg = entry.message;
      return (
        msg.includes("Iteration") ||
        msg.includes("MILESTONE") ||
        msg.includes("PROGRESS") ||
        msg.includes("CRITICAL-DEBUG")
      );
    });

    console.log("Key timeline events:");
    timelineEntries.slice(-20).forEach((entry) => {
      const time = new Date(entry.timestamp).toISOString().substr(11, 12);
      console.log(`  ${time}: ${entry.message.substring(0, 100)}...`);
    });

    // Final summary
    console.log("\n📋 FINAL SUMMARY:");
    console.log("==================");

    const hadErrors = errorLog.length > 0;
    const hadOutput = outputLog.length > 0;
    const stuckInLoop = stuckLoopEntries.length > 0;
    const reachedMain = mainExecution.length > 0;
    const sentStartup = startupMessage.length > 0;

    console.log(`✓ Errors encountered: ${hadErrors ? "YES" : "NO"}`);
    console.log(`✓ Output generated: ${hadOutput ? "YES" : "NO"}`);
    console.log(`✓ Stuck in loop: ${stuckInLoop ? "YES" : "NO"}`);
    console.log(`✓ Reached main execution: ${reachedMain ? "YES" : "NO"}`);
    console.log(`✓ Startup message sent: ${sentStartup ? "YES" : "NO"}`);

    // Save debug data for analysis
    const debugData = {
      timestamp: new Date().toISOString(),
      config: bullsConfig,
      executionTime: duration,
      summary: {
        debugEntries: debugLog.length,
        outputEntries: outputLog.length,
        errorEntries: errorLog.length,
        writeCalls: writeCalls.length,
        aedoorCalls: aedoorCalls.length,
        stuckLoops: stuckLoopEntries.length,
        hadErrors,
        hadOutput,
        stuckInLoop,
        reachedMain,
        sentStartup,
      },
      debugLog: debugLog,
      outputLog: outputLog,
      errorLog: errorLog,
    };

    // Write debug data to file
    const fs = require("fs");
    fs.writeFileSync(
      "tmp/bulls-ultimate-debug.json",
      JSON.stringify(debugData, null, 2)
    );
    console.log("\n💾 Debug data saved to: tmp/bulls-ultimate-debug.json");

    if (!hadOutput && !reachedMain) {
      console.log("\n🚨 ROOT CAUSE IDENTIFIED:");
      console.log("Bulls door did not produce output or reach main execution.");
      console.log(
        "This confirms the door is stuck in initialization or jumping to ROM."
      );
      console.log(
        "Expected: Door should send startup message and enter XIM loop."
      );
      console.log(
        "Actual: Door executes but produces no output, suggesting ROM execution."
      );
    }
  } catch (error) {
    console.error("\n💥 DEBUG SESSION FAILED:");
    console.error(error);

    // Save error info
    const fs = require("fs");
    const errorData = {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      config: bullsConfig,
    };
    fs.writeFileSync(
      "tmp/bulls-debug-error.json",
      JSON.stringify(errorData, null, 2)
    );
  }
}

// Run the debug session
runBullsUltimateDebug()
  .then(() => {
    console.log("\n🏁 Bulls Ultimate Debug Session Complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Fatal error in debug session:", error);
    process.exit(1);
  });
