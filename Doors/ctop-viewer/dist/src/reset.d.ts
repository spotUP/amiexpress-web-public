import { type CtopHeader, type CtopPeriod, type CtopSchedule } from '@amiexpress/bbs-door-sdk/formats/ctop-data';
export interface ResetOutcome {
    /** The header written back, whether or not anything else changed. */
    header: CtopHeader;
    /** The period that just ended - what the mail and the bulletin describe. */
    ended: CtopPeriod;
    /** True when the record holder changed hands. */
    newRecord: boolean;
    /** True when the file did not exist and this call created it. */
    created: boolean;
}
/** The data file, or an empty period when there is not one yet. */
export declare function readCtopFile(dataPath: string): CtopPeriod | null;
/**
 * Conftop I's record holder, imported once when a conference's file is
 * created (ctop.e:490-506).
 *
 * The old file kept the name at byte 214 and the totals straight after it,
 * with the byte count as a plain long rather than packed decimal. A board
 * that never ran Conftop I has no such file and keeps `NONE`.
 */
export declare function importLegacyRecord(conferenceDir: string): Pick<CtopHeader, 'topUpName' | 'topUpBytes' | 'topUpFiles'> | null;
/** Has the period this file describes come to an end? */
export declare function resetIsDue(dataPath: string, today?: number): boolean;
/**
 * Roll the period, and write the new header back.
 *
 * The records are DROPPED, which is the reset: the Amiga reopens the file
 * with `MODE_NEWFILE` and writes ninety-six bytes into it (ctop.e:565-576).
 */
export declare function performReset(conferenceDir: string, dataFile: string, schedule: CtopSchedule, today?: number): ResetOutcome;
//# sourceMappingURL=reset.d.ts.map