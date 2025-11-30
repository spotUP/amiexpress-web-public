import path from "path";
import { runBatchFile } from "../services/batch-scheduler";
import { config } from "../config";

async function main(): Promise<void> {
  const batchArg = process.argv[2];
  if (!batchArg) {
    console.error("Usage: tsx src/scripts/run-batch.ts <path-to-batch-file> [nodeId]");
    process.exit(1);
  }

  const nodeId = parseInt(process.argv[3] || "1", 10) || 1;

  // Ensure config is loaded so assign resolution works
  config.getConfig();

  const batchPath = path.resolve(process.cwd(), batchArg);
  console.log(`[run-batch] Running batch file: ${batchPath} (node ${nodeId})`);

  await runBatchFile(batchPath, nodeId);

  console.log("[run-batch] Batch completed");
}

main().catch((err) => {
  console.error("[run-batch] Error:", err);
  process.exit(1);
});
