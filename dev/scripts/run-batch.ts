#!/usr/bin/env node
import { runBatchFile } from '../../web/backend/src/services/batch-scheduler';
import * as path from 'path';

async function main() {
  const batchName = process.argv[2] || 'batch1';
  const nodeId = parseInt(process.argv[3] || '1', 10);

  const bbsRoot = process.env.BBS_ROOT || path.resolve(__dirname, '..', '..');
  const batchPath = path.join(bbsRoot, batchName);

  console.log(`Running batch file: ${batchPath} for node ${nodeId}`);

  await runBatchFile(batchPath, nodeId);

  console.log('Batch execution complete');
}

main().catch(err => {
  console.error('Error running batch:', err);
  process.exit(1);
});
