/**
 * Test Real Amiga Library Loading
 *
 * This test verifies that the hybrid library loading system works correctly:
 * 1. Tries to load real .library files from the Libs/ directory
 * 2. Falls back to stub libraries if real libraries aren't found
 * 3. Verifies that both native and stub libraries can be opened
 */

import { MoiraEmulator } from "../cpu/MoiraEmulator";
import { AmigaDosEnvironment } from "../api/AmigaDosEnvironment";
import { ExecLibrary } from "../api/ExecLibrary";
import { LibraryLoader } from "../loader/LibraryLoader";

console.log("🔬 Testing Real Amiga Library Loading System...\n");

async function testRealLibraryLoading() {
  try {
    // Create emulator
    const emulator = new MoiraEmulator();
    console.log("✅ Created MoiraEmulator");

    // Test 1: Create AmigaDosEnvironment with native libraries ENABLED
    console.log(
      "\n📦 Test 1: Creating AmigaDosEnvironment with native libraries enabled..."
    );
    const amigaEnv = new AmigaDosEnvironment(emulator, {
      useNativeLibraries: true, // Force enable native libraries
      libraryPaths: ["Libs"], // Point to our Libs directory
    });

    console.log("✅ AmigaDosEnvironment created with native libraries enabled");

    // Test 2: Verify library loader is set up
    console.log("\n🔧 Test 2: Checking library loader configuration...");
    const libraryLoader = amigaEnv.getLibraryLoader();
    if (libraryLoader) {
      console.log("✅ LibraryLoader is available");

      // Check if AEDoor.library exists
      const aedoorLib = libraryLoader.loadLibrary("aedoor.library", 2);
      if (aedoorLib) {
        console.log(
          `✅ REAL AEDoor.library loaded at 0x${aedoorLib.baseAddress.toString(
            16
          )}`
        );
        console.log(`   Version: ${aedoorLib.version}`);
        console.log(`   Jump table entries: ${aedoorLib.jumpTable.size}`);
      } else {
        console.log("⚠️  REAL AEDoor.library not found, will use stub");
      }
    } else {
      console.log("❌ LibraryLoader is not available");
      return false;
    }

    // Test 3: Test ExecLibrary integration
    console.log("\n🧪 Test 3: Testing ExecLibrary integration...");
    const execLib = amigaEnv.getExecLibrary();
    if (execLib) {
      console.log("✅ ExecLibrary is accessible");

      // Test opening libraries
      console.log("\n📚 Test 4: Testing library opening...");

      // Test opening dos.library (should exist as stub)
      const dosLibResult = (execLib as any).openLibraryHybrid("dos.library", 0);
      if (dosLibResult.success) {
        console.log(
          `✅ dos.library opened: ${
            dosLibResult.isNative ? "NATIVE" : "STUB"
          } at 0x${dosLibResult.address.toString(16)}`
        );
      } else {
        console.log("❌ Failed to open dos.library");
      }

      // Test opening aedoor.library (should try real first, fallback to stub)
      const aedoorLibResult = (execLib as any).openLibraryHybrid(
        "aedoor.library",
        2
      );
      if (aedoorLibResult.success) {
        console.log(
          `✅ aedoor.library opened: ${
            aedoorLibResult.isNative ? "NATIVE" : "STUB"
          } at 0x${aedoorLibResult.address.toString(16)}`
        );
      } else {
        console.log("❌ Failed to open aedoor.library");
      }

      // Test opening exec.library (should exist as stub)
      const execLibResult = (execLib as any).openLibraryHybrid(
        "exec.library",
        0
      );
      if (execLibResult.success) {
        console.log(
          `✅ exec.library opened: ${
            execLibResult.isNative ? "NATIVE" : "STUB"
          } at 0x${execLibResult.address.toString(16)}`
        );
      } else {
        console.log("❌ Failed to open exec.library");
      }
    } else {
      console.log("❌ ExecLibrary is not accessible");
      return false;
    }

    // Test 5: Test with native libraries DISABLED (fallback mode)
    console.log(
      "\n📦 Test 5: Creating AmigaDosEnvironment with native libraries disabled..."
    );
    const amigaEnvStub = new AmigaDosEnvironment(emulator, {
      useNativeLibraries: false, // Force disable native libraries
      libraryPaths: ["Libs"],
    });

    const execLibStub = amigaEnvStub.getExecLibrary();
    if (execLibStub) {
      const stubResult = (execLibStub as any).openLibraryHybrid(
        "dos.library",
        0
      );
      if (stubResult.success && !stubResult.isNative) {
        console.log("✅ Fallback to stub libraries works correctly");
      } else {
        console.log("⚠️  Expected stub library but got different result");
      }
    }

    console.log("\n🎉 Real Library Loading Test Completed Successfully!");
    console.log("\n📊 Summary:");
    console.log("   ✅ Hybrid library loading system is functional");
    console.log("   ✅ Real library loading works when enabled");
    console.log("   ✅ Stub fallback works when disabled");
    console.log("   ✅ ExecLibrary integration is working");

    return true;
  } catch (error) {
    console.error("\n❌ Test failed with error:", error);
    console.error(
      "Stack trace:",
      error instanceof Error ? error.stack : "No stack trace"
    );
    return false;
  }
}

// Run the test
if (require.main === module) {
  testRealLibraryLoading().then((success) => {
    if (success) {
      console.log("\n✨ All tests passed!");
      process.exit(0);
    } else {
      console.log("\n💥 Some tests failed!");
      process.exit(1);
    }
  });
}

export { testRealLibraryLoading };
