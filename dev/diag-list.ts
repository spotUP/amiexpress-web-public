import { readDirFile } from '../web/backend/src/utils/dir-file-reader.util';

(async () => {
  const entries = await readDirFile('Conf2/DIR1');
  const target = entries.find(entry => entry.filename.startsWith('BK-S10UP'));
  if (!target) {
    console.log('not found');
    return;
  }
  console.log('Total raw lines:', target.rawLines.length);
  for (let i = 0; i < target.rawLines.length; i++) {
    console.log(`${i}: ${JSON.stringify(target.rawLines[i])}`);
  }
  console.log('Description aggregated:', target.description);
})();
