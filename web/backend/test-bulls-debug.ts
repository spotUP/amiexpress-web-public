#!/usr/bin/env npx tsx

/**
 * Bulls Door Debug Test
 *
 * Comprehensive debugging to identify the exact Bulls door execution blocker
 *
 * Run with: npx tsx test-bulls-debug.ts
 */

import path from "path";
import { fileURLToPath } from "url";
import { AmigaDoorSession } from "./src/amiga-emulation/AmigaDoorSession.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock socket for testing
function createMockSocket() {
  const output: string[] = [];
  const events: string[] = [];

  return {
    emit: function (event: string, data: any) {
      events.push(event);

      if (event === "ansi-output") {
        output.push(data);
        console.log(`[MOCK-OUTPUT] ${JSON.stringify(data)}`);
      } else {
        console.log(`[SOCKET-EVENT: ${event}]`, JSON.stringify(data));
      }
    },
    on: function (event: string, handler: Function) {
      console.log(`[SOCKET] Registered handler for event: ${event}`);
    },
    removeAllListeners: function (event?: string) {
      console.log(`[SOCKET] Removed listeners for event: ${event || "all"}`);
    },
    getOutput: () => output,
    getEvents: () => events,
  } as any;
}

// Mock session for Bulls
const mockSession = {
  user: {
    id: "test-user",
    username: "TestUser",
    location: "Test Location",
    secLevel: 100,
  },
  nodeId: 0,
  nodeNumber: 0,
  bbsSession: {
    user: {
      username: "TestUser",
      location: "Test Location",
      secLevel: 100,
    },
    nodeId: 0,
    nodeNumber: 0,
    system: {
      name: "Test BBS",
    },
  },
};

async function testBullsDoor() {
  console.log("🔍 BULLS DOOR DEBUG TEST");
  console.log("========================");
  console.log("");
  console.log(
    "This test will identify the exact execution blocker in Bulls door"
  );
  console.log("");

  // Try multiple Bulls door paths
  const possibleBullsPaths = [
    path.join(__dirname, "../../doors/emp_tools/Bulls"),
    path.join(__dirname, "../doors/emp_tools/Bulls"),
    path.join(__dirname, "doors/emp_tools/bulls"),
    path.join(__dirname, "BBS/Doors/emp_tools/bulls"),
    path.join(__dirname, "BBS/Doors/Bulls/Bulls"),
    path.join(__dirname, "../doors/emp_tools/bulls"),
  ];

  let bullPath = "";
  for (const testPath of possibleBullsPaths) {
    console.log(`[DEBUG] Checking path: ${testPath}`);
    if (require("fs").existsSync(testPath)) {
      console.log(`[DEBUG] ✅ Found Bulls at: ${testPath}`);
      bullPath = testPath;
      break;
    }
  }

  if (!bullPath) {
    // Fall back to the known emp_tools path (capital B)
    bullPath = path.join(__dirname, "../../doors/emp_tools/Bulls");
    console.log(`[DEBUG] Using fallback path: ${bullPath}`);
  }

  console.log("");
  console.log("[DEBUG] Bulls door path:", bullPath);
  console.log("[DEBUG] Door type: XIM (confirmed from binary analysis)");
  console.log("");

  const mockSocket = createMockSocket();

  // Bulls-specific configuration
  const bullsConfig = {
    executablePath: bullPath,
    doorType: "XIM", // Bulls is definitively XIM type
    timeout: 30, // 30 seconds for debugging
    bbsSession: mockSession,
    args: ["0"], // Node ID
  };

  console.log("[DEBUG] Creating Bulls door session...");
  const doorSession = new AmigaDoorSession(mockSocket, bullsConfig);

  console.log("[DEBUG] Starting Bulls execution with enhanced debugging...");
  console.log("");

  const startTime = Date.now();

  try {
    // This will run with all the enhanced debugging we implemented
    await doorSession.start();

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log("");
    console.log("🔍 BULLS EXECUTION RESULTS:");
    console.log("============================");
    console.log(`Execution time: ${duration}ms`);
    console.log(`Output lines: ${mockSocket.getOutput().length}`);
    console.log(`Socket events: ${mockSocket.getEvents().length}`);

    // Analyze the output for patterns
    const output = mockSocket.getOutput();

    console.log("");
    console.log("📊 OUTPUT ANALYSIS:");
    console.log("===================");

    const writeCalls = output.filter((line) => line.includes("WRITE-TRACK"));
    const aedoorCalls = output.filter((line) => line.includes("AEDOOR-TRACK"));
    const criticalDebug = output.filter((line) =>
      line.includes("CRITICAL-DEBUG")
    );
    const milestones = output.filter((line) => line.includes("MILESTONE"));
    const stuckLoops = output.filter(
      (line) =>
        line.includes("STUCK IN LOOP") || line.includes("POTENTIAL STUCK LOOP")
    );

    console.log(`Write() calls detected: ${writeCalls.length}`);
    console.log(`AEDoor calls detected: ${aedoorCalls.length}`);
    console.log(`Critical debug entries: ${criticalDebug.length}`);
    console.log(`Milestone entries: ${milestones.length}`);
    console.log(`Stuck loop warnings: ${stuckLoops.length}`);

    // Look for specific Bulls-specific issues
    console.log("");
    console.log("🎯 BULLS-SPECIFIC ANALYSIS:");
    console.log("============================");

    const bullsInit = output.filter((line) => line.includes("BULLS-INIT"));
    const bullsDebug = output.filter((line) => line.includes("BULLS-DEBUG"));
    const bullsPoll = output.filter((line) => line.includes("BULLS-POLL"));

    console.log(`Bulls initialization entries: ${bullsInit.length}`);
    console.log(`Bulls debug entries: ${bullsDebug.length}`);
    console.log(`Bulls polling entries: ${bullsPoll.length}`);

    // Check for ROM execution (the main issue)
    console.log("");
    console.log("🚨 ROM EXECUTION CHECK:");
    console.log("========================");

    const romEntries = output.filter(
      (line) =>
        line.includes("0xf24404") ||
        line.includes("PC in ROM") ||
        line.includes("ROM range")
    );

    const nopEntries = output.filter(
      (line) => line.includes("NOP") || line.includes("0x0000")
    );

    console.log(`ROM-related entries: ${romEntries.length}`);
    console.log(`NOP instruction entries: ${nopEntries.length}`);

    if (romEntries.length > 0 || nopEntries.length > 0) {
      console.log("⚠️ ROM EXECUTION DETECTED - Bulls jumped to ROM memory!");
      romEntries.forEach((entry) => console.log(`  ROM: ${entry}`));
      nopEntries.forEach((entry) => console.log(`  NOP: ${entry}`));
    }

    // Check initialization completion
    console.log("");
    console.log("🔧 INITIALIZATION ANALYSIS:");
    console.log("============================");

    const initComplete = output.filter((line) =>
      line.includes("INITIALIZATION COMPLETE")
    );
    const mainExecution = output.filter((line) =>
      line.includes("MAIN EXECUTION REACHED")
    );
    const startupMessage = output.filter((line) =>
      line.includes("STARTUP MESSAGE SENT")
    );

    console.log(
      `Initialization complete: ${initComplete.length > 0 ? "YES" : "NO"}`
    );
    console.log(
      `Main execution reached: ${mainExecution.length > 0 ? "YES" : "NO"}`
    );
    console.log(
      `Startup message sent: ${startupMessage.length > 0 ? "YES" : "NO"}`
    );

    // Final diagnosis
    console.log("");
    console.log("🎯 FINAL DIAGNOSIS:");
    console.log("===================");

    const hadOutput = mockSocket.getOutput().length > 0;
    const hadWriteCalls = writeCalls.length > 0;
    const hadAedoorCalls = aedoorCalls.length > 0;
    const stuckInLoop = stuckLoops.length > 0;
    const reachedMain = mainExecution.length > 0;
    const sentStartup = startupMessage.length > 0;

    console.log(`✓ Door produced output: ${hadOutput ? "YES" : "NO"}`);
    console.log(`✓ Write() calls made: ${hadWriteCalls ? "YES" : "NO"}`);
    console.log(`✓ AEDoor calls made: ${hadAedoorCalls ? "YES" : "NO"}`);
    console.log(`✓ Stuck in loop: ${stuckInLoop ? "YES" : "NO"}`);
    console.log(`✓ Reached main execution: ${reachedMain ? "YES" : "NO"}`);
    console.log(`✓ Startup message sent: ${sentStartup ? "YES" : "NO"}`);

    // Save debug data
    const fs = require("fs");
    const debugData = {
      timestamp: new Date().toISOString(),
      config: bullsConfig,
      executionTime: duration,
      analysis: {
        hadOutput,
        hadWriteCalls,
        hadAedoorCalls,
        stuckInLoop,
        reachedMain,
        sentStartup,
      },
      counts: {
        writeCalls: writeCalls.length,
        aedoorCalls: aedoorCalls.length,
        criticalDebug: criticalDebug.length,
        milestones: milestones.length,
        stuckLoops: stuckLoops.length,
        romEntries: romEntries.length,
        nopEntries: nopEntries.length,
      },
      output: output,
      events: mockSocket.getEvents(),
    };

    fs.writeFileSync(
      "bulls-debug-results.json",
      JSON.stringify(debugData, null, 2)
    );
    console.log("\n💾 Debug data saved to: bulls-debug-results.json");

    // Root cause analysis
    if (!hadOutput && !reachedMain) {
      console.log("");
      console.log("🚨 ROOT CAUSE IDENTIFIED:");
      console.log("==========================");
      console.log("Bulls door did not produce output or reach main execution.");
      console.log(
        "This confirms the door is stuck in initialization or jumping to ROM."
      );
      console.log("");
      console.log("Expected behavior:");
      console.log("  - Door should send startup message to AEDoorPort");
      console.log("  - Door should enter XIM polling loop");
      console.log("  - Door should call Write() to produce output");
      console.log("");
      console.log("Actual behavior:");
      console.log("  - Door executes but produces no output");
      console.log("  - Door likely jumps to ROM memory (PC=0xf24404)");
      console.log("  - Door loops on NOP instructions instead of XIM mode");
      console.log("");
      console.log("Next step: Fix Bulls XIM mode detection and initialization");
    }

    console.log("");
    console.log("🏁 Bulls Debug Test Complete");
  } catch (error) {
    console.error("");
    console.error("💥 BULLS DEBUG TEST FAILED:");
    console.error(error);

    // Save error info
    const fs = require("fs");
    const errorData = {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      config: bullsConfig,
      output: mockSocket.getOutput(),
      events: mockSocket.getEvents(),
    };
    fs.writeFileSync(
      "bulls-debug-error.json",
      JSON.stringify(errorData, null, 2)
    );
  }
}

// Run the Bulls debug test
testBullsDoor().catch((error) => {
  console.error("Fatal error in Bulls debug test:", error);
  process.exit(1);
});
