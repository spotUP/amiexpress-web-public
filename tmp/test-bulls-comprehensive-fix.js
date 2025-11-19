#!/usr/bin/env node

/**
 * Comprehensive test for Bulls door execution with enhanced polling detection
 *
 * This test verifies that the Bulls door:
 * 1. Starts execution correctly
 * 2. Gets detected when stuck in polling loops
 * 3. Receives startup message to unblock execution
 * 4. Progresses to main execution code
 * 5. Makes Write() calls that produce output
 * 6. Calls AEDoor.library functions
 */

const path = require("path");
const {
  AmigaDoorSession,
} = require("../web/backend/dist/amiga-emulation/AmigaDoorSession");

// Mock socket for testing
class MockSocket {
  constructor() {
    this.events = {};
    this.connected = true;
  }

  on(event, callback) {
    if (!this.events[event]) this.events[event] = [];
    this.events[event].push(callback);
  }

  emit(event, data) {
    console.log(`[MOCK-SOCKET] ${event}:`, JSON.stringify(data, null, 2));

    // Track output events specifically and count bytes
    if (event === "ansi-output") {
      this.lastOutput = data;
      this.outputCount = (this.outputCount || 0) + 1;
      this.outputBytes = (this.outputBytes || 0) + data.length;
      console.log(
        `[TEST-RESULT] 📤 OUTPUT #${this.outputCount}: "${data}" (${data.length} bytes, total: ${this.outputBytes})`
      );
    }
  }

  // Simulate user disconnect
  disconnect() {
    this.connected = false;
  }
}

async function testBullsDoorComprehensive() {
  console.log("🧪 COMPREHENSIVE BULLS DOOR TEST");
  console.log("=====================================");

  const mockSocket = new MockSocket();

  // Allow overriding the door path/type via environment variables
  const defaultDoorPath = path.join(__dirname, "../doors/emp_tools/Bulls");
  const doorPath = process.env.DOOR_PATH
    ? path.resolve(process.env.DOOR_PATH)
    : defaultDoorPath;
  const doorType = process.env.DOOR_TYPE || "XIM";
  const nodeId = Number(process.env.DOOR_NODE || 0);
  const userName = process.env.DOOR_USER || "TestUser";

  const config = {
    executablePath: doorPath,
    doorType,
    timeout: 60,
    bbsSession: {
      nodeId,
      user: {
        username: userName,
        location: "Test City",
        secLevel: 100,
      },
    },
    args: process.env.DOOR_ARGS
      ? process.env.DOOR_ARGS.split(" ")
      : [nodeId.toString()], // Node ID argument
  };

  console.log(`📋 Test Configuration:`);
  console.log(`   Door: ${config.executablePath}`);
  console.log(`   Type: ${config.doorType}`);
  console.log(`   User: ${config.bbsSession.user.username}`);
  console.log("");

  const doorSession = new AmigaDoorSession(mockSocket, config);

  // Track test metrics
  const testMetrics = {
    startTime: Date.now(),
    iterations: 0,
    writeCalls: 0,
    aedoorCalls: 0,
    outputBytes: 0,
    reachedMainExecution: false,
    startupMessageSent: false,
    executionPath: [],
    errors: [],
  };

  // Monitor execution progress
  const originalRunLoop = doorSession.runExecutionLoop.bind(doorSession);
  doorSession.runExecutionLoop = async function () {
    console.log("[TEST-MONITOR] Door execution loop started");

    // Patch the iteration counter to track progress
    const originalExecuteInstruction = this.emulator?.executeInstruction?.bind(
      this.emulator
    );
    if (originalExecuteInstruction) {
      this.emulator.executeInstruction = function () {
        testMetrics.iterations++;

        // Log progress every 1000 iterations
        if (testMetrics.iterations % 1000 === 0) {
          const pc = this.getRegister(16);
          console.log(
            `[TEST-PROGRESS] Iteration ${
              testMetrics.iterations
            }, PC: 0x${pc.toString(16)}`
          );
        }

        return originalExecuteInstruction();
      }.bind(this.emulator);
    }

    // Monitor for Write() calls
    const originalCheckTrap =
      doorSession.checkAndHandleLibraryTrap.bind(doorSession);
    doorSession.checkAndHandleLibraryTrap = async function (pc) {
      const result = await originalCheckTrap(pc);

      // Track Write() calls at the correct PC addresses (DOS.library at 0x20000)
      if (pc === 0x1ffd0) {
        // DOS.Write() at PC=0x1ffd0 (offset -48 from DOS base at 0x20000)
        testMetrics.writeCalls++;
        console.log(
          `[TEST-TRACK] 📝 Write() call #${
            testMetrics.writeCalls
          } at PC=0x${pc.toString(16)}`
        );
      }

      if (pc >= 0xfe80 && pc <= 0xff80) {
        const a6 = this.emulator.getRegister(14);
        const offset = pc - a6;

        if (a6 === 0xff4000) {
          // AEDoor.library
          testMetrics.aedoorCalls++;
          const functionName = doorSession.getAEDoorFunctionName(offset);
          console.log(
            `[TEST-TRACK] 🔧 AEDoor call #${
              testMetrics.aedoorCalls
            }: ${functionName} at PC=0x${pc.toString(16)}`
          );
        }
      }

      // Track main execution reached
      const currentPC = this.emulator.getRegister(16);
      if (!testMetrics.reachedMainExecution && currentPC > 0x2000) {
        testMetrics.reachedMainExecution = true;
        console.log(
          `[TEST-MILESTONE] ✅ MAIN EXECUTION REACHED at iteration ${testMetrics.iterations}`
        );
      }

      // Track startup message sending
      if (this.sentInitialMessage && !testMetrics.startupMessageSent) {
        testMetrics.startupMessageSent = true;
        console.log(
          `[TEST-MILESTONE] ✅ STARTUP MESSAGE SENT at iteration ${testMetrics.iterations}`
        );
      }

      return result;
    }.bind(doorSession);

    return originalRunLoop();
  };

    try {
    console.log("🚀 Starting Bulls door execution...");
    console.log("");

    const inputSequence = (process.env.DOOR_INPUT_SEQUENCE || "\r\n")
      .split(",")
      .filter((part) => part.length > 0);
    inputSequence.forEach((input, index) => {
      setTimeout(() => {
        console.log(`[TEST-MONITOR] Sending simulated input: ${JSON.stringify(input)}`);
        mockSocket.emit("door:input", input);
      }, (index + 1) * 2000);
    });

    // Start the door session
    await doorSession.start();

    // Calculate test results
    const duration = Date.now() - testMetrics.startTime;
    const totalOutputBytes = mockSocket.outputBytes || 0;
    const success = totalOutputBytes > 0 && testMetrics.writeCalls > 0;

    console.log("");
    console.log("🏁 EXECUTION COMPLETED");
    console.log("======================");
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log(`🔄 Iterations: ${testMetrics.iterations}`);
    console.log(`📝 Write() calls: ${testMetrics.writeCalls}`);
    console.log(`🔧 AEDoor calls: ${testMetrics.aedoorCalls}`);
    console.log(`📤 Output bytes: ${testMetrics.outputBytes}`);
    console.log(
      `✅ Main execution reached: ${testMetrics.reachedMainExecution}`
    );
    console.log(`📨 Startup message sent: ${testMetrics.startupMessageSent}`);
    console.log("");

    if (success) {
      console.log("🎉 TEST PASSED: Bulls door produced output!");
      console.log(`   Output content: "${mockSocket.lastOutput || "N/A"}"`);
    } else {
      console.log("❌ TEST FAILED: Bulls door produced no output");
      console.log(
        "   This indicates the door is still stuck in initialization"
      );
    }

    console.log("");
    console.log("📊 FINAL ASSESSMENT:");
    if (testMetrics.writeCalls === 0) {
      console.log(
        "   • No Write() calls detected - door never reached output code"
      );
    }
    if (!testMetrics.reachedMainExecution) {
      console.log("   • Never reached main execution (PC > 0x2000)");
    }
    if (!testMetrics.startupMessageSent) {
      console.log(
        "   • Startup message was never sent - polling detection may need adjustment"
      );
    }
    if (testMetrics.iterations > 20000) {
      console.log(
        `   • Ran ${testMetrics.iterations} iterations without progress - likely stuck in loop`
      );
    }

    return success;
  } catch (error) {
    console.error("💥 TEST ERROR:", error.message);
    testMetrics.errors.push(error.message);

    console.log("");
    console.log("📊 FINAL ASSESSMENT:");
    console.log("   • Test encountered an error during execution");
    console.log("   • This may indicate a deeper implementation issue");

    return false;
  }
}

// Run the test
if (require.main === module) {
  testBullsDoorComprehensive()
    .then((success) => {
      console.log("");
      console.log(success ? "✅ TEST SUITE PASSED" : "❌ TEST SUITE FAILED");
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error("💥 UNEXPECTED ERROR:", error);
      process.exit(1);
    });
}

module.exports = { testBullsDoorComprehensive };
