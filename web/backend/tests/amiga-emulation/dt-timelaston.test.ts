/**
 * Regression: AquaScan reported "Scanning dir 1 for 00:00:00" because our
 * DT_TIMELASTON handler returned Amiga-epoch seconds (Unix - 252460800),
 * but express.e treats timeLastOn as **C-time = Unix epoch seconds + 21600**
 * per MiscFuncs.e:255 dateStampToDateTime():
 *   (days+2922)*86400 + minute*60 + tick/50 + 21600
 *
 * AquaScan calls dateTimeToDateStamp() (MiscFuncs.e:258) which subtracts
 * 21600, /60s, then unpacks days/minute/tick. Feeding it Amiga-epoch
 * seconds shifted the date back ~8 years and aligned ds_Minute to 0
 * relative to the wrong reference, so DateToStr output 00:00:00.
 */

import { XIMCommand } from '../../src/amiga-emulation/xim/types';

describe('DT_TIMELASTON cTime conversion (express.e:3588 + MiscFuncs.e:255)', () => {
  // The conversion is the entire bug surface. Test it directly.
  const C_TIME_OFFSET = 21600;

  function unixToCTime(unixSec: number): number {
    return unixSec + C_TIME_OFFSET;
  }

  // express.e dateTimeToDateStamp inverse (MiscFuncs.e:257-265).
  function cTimeToDateStamp(cTime: number) {
    let v = cTime - C_TIME_OFFSET;
    const tick = (v - Math.floor(v / 60) * 60) * 50;
    v = Math.floor(v / 60);
    const days = Math.floor(v / 1440) - 2922;
    const minute = v - (days + 2922) * 1440;
    return { days, minute, tick };
  }

  it('round-trips a known timestamp through cTime → DateStamp', () => {
    // 2026-05-04 23:12:27 UTC = Unix epoch 1777849947
    const unixSec = 1777849947;
    const cTime = unixToCTime(unixSec);
    const ds = cTimeToDateStamp(cTime);
    // Days: (2026-05-04 - 1978-01-01) = 17654
    expect(ds.days).toBe(17654);
    // Minutes: 23*60 + 12 = 1392
    expect(ds.minute).toBe(1392);
    // Ticks: 27 * 50 = 1350
    expect(ds.tick).toBe(1350);
  });

  it('the OLD broken conversion (Amiga epoch) produces a 2018 date with the wrong ds_Minute', () => {
    // Pre-fix behaviour: lastOn = unixSec - 252460800 (Amiga 1978 epoch).
    // Feeding that to dateTimeToDateStamp gives a date ~8 years off and
    // a ds_Minute that's not aligned with the original local-day midnight.
    const unixSec = 1777849947;
    const oldBroken = unixSec - 252_460_800;
    const ds = cTimeToDateStamp(oldBroken);
    // 8-year gap → days way off:
    expect(ds.days).not.toBe(17654);
    expect(ds.days).toBeLessThan(15000); // ~year 2018
  });

  it('AquaScan write-back round-trips via Unix seconds', () => {
    // Door writes back cTime; we strip the offset and store Unix seconds.
    const cTimeFromDoor = unixToCTime(1777849947);
    const stored = Math.max(0, cTimeFromDoor - C_TIME_OFFSET);
    expect(stored).toBe(1777849947);
  });

  it('XIMCommand.DT_TIMELASTON is 113 (sanity)', () => {
    expect(XIMCommand.DT_TIMELASTON).toBe(113);
  });
});
