import { parseInfoFile } from '../utils/amiga-command-parser.util';
const result = parseInfoFile('~/Code/AmiExpress/amiexpress-web/Doors/AquaScan/AquaScan.info');
console.log('Parsed tooltypes from AquaScan.info:');
for (const [key, value] of result) {
  console.log('  ' + key + ' = ' + value);
}
console.log('Total:', result.size, 'tooltypes');
