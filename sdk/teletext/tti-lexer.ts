/**
 * TTI record lexer, vendored from TheMarco/teletext (Marco van Hylckama
 * Vlieg, CC BY 4.0 - https://github.com/TheMarco/teletext, src/tti/ttiLexer.ts).
 *
 * There were TWO copies of this in the tree - this file and
 * `marco/tti/ttiLexer.ts` - identical but for their headers, each with its own
 * consumer. One vendored file cannot be vendored twice: a fix applied to one
 * copy silently left the other behind. The vendored copy lives under `marco/`
 * with the rest of the upstream tree; this path stays because it is the name
 * the SDK's own index exports, and it now points at that one copy.
 *
 * Used here to DETECT native packet-level .tti screens (edit.tf / wxTED /
 * Marco family: DE/PN/OL/FL records) apart from this board's ANSI .ttx
 * screens. Full packet parsing and rendering land separately; the lexer alone
 * decides which reader.
 */
export { lexTti } from './marco/tti/ttiLexer';
export type { TtiRecord } from './marco/tti/ttiLexer';
