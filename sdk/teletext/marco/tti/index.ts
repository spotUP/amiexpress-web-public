export { lexTti } from './ttiLexer';
export type { TtiRecord } from './ttiLexer';
export { parseTtiRecords } from './ttiParser';
export type { TtiPageGroup, TtiOutputLine, TtiParseResult } from './ttiParser';
export { mapTtiGroupToSubpage, mapTtiToService, encodePageFlags, encodeLanguageSubset } from './ttiMapper';
export { exportPageToTti, exportServiceToTti } from './ttiExporter';
export type { TtiExportOptions } from './ttiExporter';
export {
  ttiByteToTeletext,
  teletextByteToTti,
  decodeOLContent,
  encodeOLContent,
} from './ttiTranslations';
export { importT42, extractTeletextLines, t42ToTti } from './t42Import';
export type { T42ImportResult } from './t42Import';
export { exportServiceToT42, exportPageToT42 } from './t42Export';

/**
 * Convenience: parse a TTI string all the way to a TeletextService.
 */
import { lexTti } from './ttiLexer';
import { parseTtiRecords } from './ttiParser';
import { mapTtiToService } from './ttiMapper';
import type { TeletextService } from '../model/types';

export function importTti(
  ttiText: string,
  serviceId?: string,
  serviceTitle?: string,
): TeletextService {
  const records = lexTti(ttiText);
  const parsed = parseTtiRecords(records);
  return mapTtiToService(parsed, serviceId, serviceTitle);
}
