import { HunkLoader } from "../loader/HunkLoader";
import { MoiraEmulator } from "../cpu/MoiraEmulator";
import * as fs from "fs";
import * as path from "path";

const doorRelativePaths = [
  "doors/who/Count",
  "doors/who/NI",
  "doors/who/who",
  "doors/emp_tools/Bulls",
];

const repoRoot = path.resolve(__dirname, "../../../../..");

async function testDoorBinaries() {
  console.log("=== Amiga HUNK Loader Door Test ===");

  for (const relativePath of doorRelativePaths) {
    const doorPath = path.join(repoRoot, relativePath);
    if (!fs.existsSync(doorPath)) {
      console.error(`[HUNK-TEST] Missing binary: ${relativePath}`);
      continue;
    }

    console.log(`\n[HUNK-TEST] Inspecting ${relativePath}`);
    const binary = fs.readFileSync(doorPath);
    console.log(`[HUNK-TEST]   Binary size: ${binary.length} bytes`);

    const loader = new HunkLoader();
    let hunkFile;

    try {
      hunkFile = loader.parse(binary);
    } catch (error) {
      console.error(`[HUNK-TEST]   Parsing failed:`, error);
      continue;
    }

    console.log(
      `[HUNK-TEST]   Parsed ${hunkFile.segments.length} segments, entry=0x${hunkFile.entryPoint.toString(16)}`
    );
    hunkFile.segments.forEach((segment, index) => {
      console.log(
        `  Segment ${index}: ${segment.type} ${segment.size} bytes @ 0x${segment.address.toString(16)}`
      );
    });

    const emulator = new MoiraEmulator();
    try {
      await emulator.initialize();
      loader.load(emulator, hunkFile);
      console.log(`[HUNK-TEST]   Loaded into emulator memory`);

      const entryBytes = [];
      for (let i = 0; i < 6; i++) {
        entryBytes.push(
          emulator.readMemory(hunkFile.entryPoint + i)
        );
      }
      console.log(
        `[HUNK-TEST]   Entry bytes: ${entryBytes.map((b) => b.toString(16).padStart(2, "0")).join(" ")}`
      );
    } catch (error) {
      console.error(`[HUNK-TEST]   Loading failed:`, error);
    } finally {
      emulator.cleanup();
    }
  }

  console.log("\n=== HUNK Loader door test complete ===");
}

testDoorBinaries().catch((error) => {
  console.error("[HUNK-TEST] Unhandled error:", error);
  process.exitCode = 1;
});
