/**
 * A fresh puzzle-bobble game, in the state the door starts it in.
 *
 * Lifted out of index.ts so the tests can build a real game without
 * importing the door - importing index.ts constructs a blessed Screen and
 * a Door, neither of which belongs in a unit test. One definition, two
 * callers.
 */
import { PuzzleBobbleData } from './types';
export declare function createInitialGameData(): PuzzleBobbleData;
