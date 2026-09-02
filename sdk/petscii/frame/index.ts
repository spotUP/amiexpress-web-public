/**
 * C64 door adapter frame pipeline (strategy plan 2026-09-02-c64-door-adapter):
 * FrameReconstructor (ANSI -> 80x25 cells) -> adaptFrame (80 -> 40 columns)
 * -> renderDiff (40x25 cells -> ANSI for AnsiToPetsciiTransducer).
 * Pure TypeScript. Package export and emitter wiring arrive with Phase 3.
 */
export * from './types';
export { FrameReconstructor, type FrameReconstructorOptions } from './ansi-screen';
export { renderDiff, renderFrame, cupTo } from './frame-render';
export * from './classify';
export * from './adapt';
