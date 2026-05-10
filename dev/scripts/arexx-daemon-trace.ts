/**
 * Daemon dispatch-arm tracer for native AREXX bring-up.
 *
 * Boots rexxMastService to ready, then PutMsg's a real RexxMsg into
 * the REXX/AREXX port and gives the daemon CPU time WITHOUT the
 * bridged TS interpreter taking over. Logs every PC value in the
 * daemon's task — first 256 unique PCs — so we can identify where
 * the dispatch loop wedges, what memory it touches, and what register
 * state it sees.
 *
 * Goal: find the actual blocking instruction in the daemon's
 * post-Wait dispatch arm, not the (debunked) "uninitialised
 * libBase+0xB8" theory in the original handoff comment.
 *
 * Usage from web/backend:
 *   SKIP_DB_INIT=1 BBS_DATA_DIR=/path/to/repo \
 *     npx tsx ../../dev/scripts/arexx-daemon-trace.ts
 */

import * as path from 'path';

process.env.BBS_DATA_DIR = process.env.BBS_DATA_DIR || path.resolve(__dirname, '../..');
process.env.SKIP_DB_INIT = '1';

import { config } from '../../web/backend/src/config';
import { rexxMastService } from '../../web/backend/src/services/arexx/rexxmast-service';
import { _resetNativeAREXXDetectionCache } from '../../web/backend/src/services/arexx/native-engine';

async function main() {
  config.set('dataDir', process.env.BBS_DATA_DIR);
  _resetNativeAREXXDetectionCache();
  rexxMastService._reset();

  console.log('[trace] starting RexxMast service…');
  const ok = await rexxMastService.start();
  if (!ok) {
    console.error('[trace] start failed:', rexxMastService.getStatus().lastError);
    process.exit(1);
  }
  const ready = await rexxMastService.runUntilReady(5_000_000);
  if (!ready) {
    console.error('[trace] runUntilReady failed:', rexxMastService.getStatus());
    process.exit(2);
  }
  console.log('[trace] daemon ready, status:', rexxMastService.getStatus());

  // Reach into the service for the emulator + libs. Dev script — direct access fine.
  const svc: any = rexxMastService;
  const emu = svc.emulator;
  const exec = svc.execLibrary;
  const rsl = svc.rexxSysLib;

  // Find the AREXX port the daemon registered.
  const findPort = (name: string): number =>
    typeof exec.findPortByName === 'function'
      ? exec.findPortByName(name) >>> 0
      : (exec.publicPorts?.get?.(name.toLowerCase()) >>> 0) || 0;
  const rexxPortAddr = findPort('AREXX') || findPort('REXX');
  console.log('[trace] AREXX port =', '0x' + rexxPortAddr.toString(16));
  if (!rexxPortAddr) {
    console.error('[trace] no port — daemon never registered AddPort');
    process.exit(3);
  }

  // Read the daemon's task addr from mp_SigTask in the port.
  const sigTask = emu.readMemory32(rexxPortAddr + 16) >>> 0;
  const sigBit  = emu.readMemory(rexxPortAddr + 15) & 0xff;
  console.log('[trace] daemon task =', '0x' + sigTask.toString(16), 'sigBit =', sigBit);

  // Build a RexxMsg with a trivial RETURN 0 script.
  const replyPort = svc.status.hostPortAddr >>> 0;
  const msgAddr = rsl.createRexxMsg(replyPort, 0, 0);
  console.log('[trace] msgAddr =', '0x' + msgAddr.toString(16));

  const scriptText = 'RETURN 42';
  const MEMF_PUBLIC_CLEAR = 0x10001;
  const stage = exec.allocMem(scriptText.length + 1, MEMF_PUBLIC_CLEAR);
  for (let i = 0; i < scriptText.length; i++) {
    emu.writeMemory(stage + i, scriptText.charCodeAt(i) & 0xff);
  }
  emu.writeMemory(stage + scriptText.length, 0);
  const arg0 = rsl.createArgstring(stage, scriptText.length);
  emu.writeMemory32(msgAddr + 40, arg0);     // rm_Args[0]
  // rm_Action = RXCOMM (0x01000000). With this binary the daemon
  // treats rm_Args[0] as a script NAME (not inline source) regardless
  // of RXFB_STRING — the inline-string path needs daemon-driven rexxc
  // integration which is out of scope for the diagnostic. Result1=500
  // ("program not found") is the expected daemon response when the
  // dispatch ABI is working but the file lookup misses.
  emu.writeMemory32(msgAddr + 28, 0x01000000);

  // PutMsg into the AREXX port (signals the daemon).
  exec.putMsg(rexxPortAddr, msgAddr);
  console.log('[trace] PutMsg complete');

  // Now drive the daemon. Switch the active task context to the
  // daemon by setting PC/SP/regs to its saved task state.
  const { CPURegister: CPU } = require('../../web/backend/src/amiga-emulation/cpu/MoiraEmulator');

  // tc_SPReg @ task+54, tc_SPLower/SPUpper just for context. We trust
  // the runUntilReady path already left PC parked at the daemon's
  // Wait return point — which is correct because runUntilReady drives
  // the emulator until AddPort finishes and the daemon is parked at
  // a Wait LVO trap.
  const startPC = emu.getRegister(CPU.PC) >>> 0;
  console.log('[trace] resuming daemon at PC =', '0x' + startPC.toString(16));

  // Seen-PCs map; cap at 256 unique to bound output.
  const seen = new Set<number>();
  const order: number[] = [];
  const counts = new Map<number, number>();
  const libraryTraps = svc.libraryTraps;

  // Breakpoint at the action-dispatch read: PC 0x25A4 is
  // `move.l 0x1c(a2), d2` — the daemon reading rm_Action from
  // what it thinks is our msg. Dump A2 + 64 bytes around it.
  const BREAK_PC = 0x25A4;
  let bpFired = 0;
  const bpSnapshots: any[] = [];

  // rexxc starts at 0x4008 (HunkLoader load address for RXC). Once
  // PC crosses into RXC's region, switch to "rexxc-debug" mode:
  // log every LVO trap address rexxc hits so we can identify the
  // first unimplemented LVO that blocks startup.
  const REXXC_BASE = 0x4008;
  const REXXC_END  = 0x40000; // generous upper bound for rexxc code
  let inRexxc = false;
  const rexxcLvoTrace: { cycle: number; pc: number; trap: number; from: number }[] = [];
  let lastRexxcPC = 0;

  const TRACE_CYCLES = 200_000;
  let cycles = 0;
  let lastPC = 0;
  let stuckCount = 0;
  while (cycles < TRACE_CYCLES) {
    const pc = emu.getRegister(CPU.PC) >>> 0;
    if (pc === lastPC) {
      stuckCount++;
      if (stuckCount > 10) {
        console.log('[trace] stuck at PC=0x' + pc.toString(16), '— same instruction 10× in a row');
        break;
      }
    } else {
      stuckCount = 0;
      lastPC = pc;
    }
    if (!seen.has(pc) && order.length < 256) {
      seen.add(pc);
      order.push(pc);
    }
    counts.set(pc, (counts.get(pc) || 0) + 1);

    // rexxc-debug tracking. The first PC ≥ 0x4008 inside RXC's
    // loaded region marks rexxc taking control via the CreateProc
    // PC-switch trampoline. From that cycle onward, record every
    // LVO trap rexxc hits.
    if (!inRexxc && pc >= REXXC_BASE && pc < REXXC_END) {
      inRexxc = true;
      console.log(`[trace] *** rexxc TOOK CONTROL at cycle ${cycles}, PC=0x${pc.toString(16)} ***`);
    }
    if (inRexxc && libraryTraps?.isTrapAddress?.(pc)) {
      rexxcLvoTrace.push({ cycle: cycles, pc, trap: pc, from: lastRexxcPC });
    }
    if (inRexxc) lastRexxcPC = pc;

    if (pc === BREAK_PC && bpFired < 5) {
      const a2 = emu.getRegister(10) >>> 0; // A2
      const d0 = emu.getRegister(0) >>> 0;
      const a0 = emu.getRegister(8) >>> 0;
      const a1 = emu.getRegister(9) >>> 0;
      const sp = emu.getRegister(CPU.A7) >>> 0;
      const dump: number[] = [];
      for (let i = 0; i < 64; i += 4) {
        dump.push(emu.readMemory32((a2 + i) >>> 0) >>> 0);
      }
      bpSnapshots.push({
        cycle: cycles, pc, a2, d0, a0, a1, sp,
        dump,
        ourMsg: msgAddr,
        portHead: emu.readMemory32(rexxPortAddr + 0x14) >>> 0,
        portTail: emu.readMemory32(rexxPortAddr + 0x18) >>> 0,
        portTailPred: emu.readMemory32(rexxPortAddr + 0x1c) >>> 0,
      });
      bpFired++;
    }
    if (libraryTraps && libraryTraps.isTrapAddress(pc)) {
      if (!libraryTraps.handleTrap(pc)) {
        try { emu.executeInstruction(); } catch (e: any) {
          console.log('[trace] fault at trap PC=0x' + pc.toString(16), e?.message || e);
          break;
        }
      }
    } else {
      try { emu.executeInstruction(); } catch (e: any) {
        console.log('[trace] fault at PC=0x' + pc.toString(16), e?.message || e);
        break;
      }
    }
    cycles++;
  }

  console.log('\n[trace] ran', cycles, 'cycles');
  console.log('[trace] unique PCs seen:', order.length);
  console.log('[trace] final PC =', '0x' + emu.getRegister(CPU.PC).toString(16));
  console.log('[trace] final SP =', '0x' + emu.getRegister(CPU.A7).toString(16));

  // Top 10 most-executed PCs — identifies the inner loop body.
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  console.log('\n[trace] HOT PCs (top 10 — inner loop body):');
  const libBaseTop = svc.status.rexxSysLibBase >>> 0;
  const mastBaseTop = svc.status.rexxMastBase >>> 0;
  for (let i = 0; i < Math.min(sorted.length, 10); i++) {
    const [pc, n] = sorted[i];
    let region = 'UNKNOWN';
    if (pc >= libBaseTop && pc < libBaseTop + 0x10000) region = `rexxsyslib + 0x${(pc - libBaseTop).toString(16)}`;
    else if (pc >= mastBaseTop && pc < mastBaseTop + 0x10000) region = `RexxMast + 0x${(pc - mastBaseTop).toString(16)}`;
    else if (pc >= 0xF80000) region = 'Kickstart ROM';
    else if (pc >= 0x100000 && pc < 0x200000) region = 'high-RAM stack/trampoline';
    else if (pc >= 0x70000 && pc < 0x80000) region = 'exec.library LVO trap';
    console.log(`  ${i.toString().padStart(2)}: 0x${pc.toString(16).padStart(8, '0')}  ×${n.toString().padStart(6)}  (${region})`);
  }

  // Action-dispatch breakpoint snapshots — the smoking gun for our
  // rm_Action wedge.
  console.log('\n[trace] BREAKPOINT SNAPSHOTS at PC=0x25A4 (move.l 0x1c(a2), d2):');
  console.log('[trace] our msg addr =', '0x' + msgAddr.toString(16));
  for (let i = 0; i < bpSnapshots.length; i++) {
    const s = bpSnapshots[i];
    console.log(`\n  --- snapshot ${i} (cycle ${s.cycle}) ---`);
    console.log(`  A2 = 0x${s.a2.toString(16)}  ${s.a2 === s.ourMsg ? '✓ MATCHES OUR MSG' : '✗ DIFFERS FROM OUR MSG'}`);
    console.log(`  D0 = 0x${s.d0.toString(16)}  A0 = 0x${s.a0.toString(16)}  A1 = 0x${s.a1.toString(16)}  SP = 0x${s.sp.toString(16)}`);
    console.log(`  AREXX port: head=0x${s.portHead.toString(16)} tail=0x${s.portTail.toString(16)} tailpred=0x${s.portTailPred.toString(16)}`);
    console.log(`  Memory at A2 (msg layout daemon will read):`);
    const fields = [
      'mln_Succ  ', 'mln_Pred  ', 'ln_Succ/Type', 'ln_Pri/N  ',
      'mn_ReplyP ', 'mn_Length ', 'rm_TaskBlk', 'rm_LibBase',
      'rm_Action ', 'rm_Result1', 'rm_Result2', 'rm_Args[0]',
      'rm_Args[1]', 'rm_Args[2]', 'rm_Args[3]', 'rm_Args[4]',
    ];
    for (let j = 0; j < s.dump.length; j++) {
      const off = j * 4;
      console.log(
        `    +0x${off.toString(16).padStart(2, '0')}  ` +
        `${fields[j]}  =  0x${s.dump[j].toString(16).padStart(8, '0')}`,
      );
    }
  }

  // rexxc LVO trace — what library calls did rexxc make once it took
  // control? Aggregate counts per LVO trap address so we can identify
  // the inner loop / first unimplemented LVO.
  if (rexxcLvoTrace.length > 0) {
    console.log(`\n[trace] rexxc made ${rexxcLvoTrace.length} LVO calls.`);
    const lvoCounts = new Map<number, number>();
    for (const t of rexxcLvoTrace) {
      lvoCounts.set(t.trap, (lvoCounts.get(t.trap) || 0) + 1);
    }
    const sortedLvos = Array.from(lvoCounts.entries()).sort((a, b) => b[1] - a[1]);
    console.log('[trace] rexxc LVO call histogram:');
    for (const [trap, n] of sortedLvos) {
      let lib = 'unknown';
      let lvo = 'unknown';
      // exec.library trampolines live at ExecBase (0x80000) + negative LVO.
      // dos.library trampolines live at DOSBase (0xB0000) + negative LVO.
      if (trap >= 0x70000 && trap < 0x80000) {
        lib = 'exec.library';
        lvo = '-' + (0x80000 - trap).toString();
      } else if (trap >= 0xA0000 && trap < 0xB0000) {
        lib = 'dos.library';
        lvo = '-' + (0xB0000 - trap).toString();
      } else if (trap >= 0x1FF000 && trap < 0x200000) {
        lib = 'rexxsyslib';
        lvo = '-' + (0x200000 - trap).toString();
      }
      console.log(`  trap=0x${trap.toString(16)}  count=${n}  ${lib} LVO ${lvo}`);
    }
    console.log('[trace] rexxc first 10 LVO calls (entry sequence):');
    for (let i = 0; i < Math.min(rexxcLvoTrace.length, 10); i++) {
      const t = rexxcLvoTrace[i];
      console.log(`  cycle ${t.cycle.toString().padStart(6)}: trap=0x${t.trap.toString(16)}  from PC=0x${t.from.toString(16)}`);
    }
  } else if (inRexxc) {
    console.log('\n[trace] rexxc took control but did NOT call any LVOs before faulting/exiting.');
  } else {
    console.log('\n[trace] rexxc did NOT take control during this run.');
  }

  console.log('\n[trace] PC trace (first 64):');
  for (let i = 0; i < Math.min(order.length, 64); i++) {
    const pc = order[i];
    let region = 'UNKNOWN';
    const libBase = svc.status.rexxSysLibBase >>> 0;
    const mastBase = svc.status.rexxMastBase >>> 0;
    if (pc >= libBase && pc < libBase + 0x10000) region = `rexxsyslib + 0x${(pc - libBase).toString(16)}`;
    else if (pc >= mastBase && pc < mastBase + 0x10000) region = `RexxMast + 0x${(pc - mastBase).toString(16)}`;
    else if (pc >= 0xF80000) region = 'Kickstart ROM';
    else if (pc >= 0x1000000) region = 'high-RAM trampoline';
    console.log(`  ${i.toString().padStart(3)}: 0x${pc.toString(16).padStart(8, '0')}  (${region})`);
  }

  // Did the script run? Check the reply port for our msg.
  const rmMsgList = replyPort + 0x14;
  const head = emu.readMemory32(rmMsgList) >>> 0;
  const tail = emu.readMemory32(rmMsgList + 8) >>> 0;
  console.log('\n[trace] reply port head=0x' + head.toString(16),
              'tailpred=0x' + tail.toString(16));
  if (head === msgAddr || tail === msgAddr) {
    console.log('[trace] OUR MESSAGE IS BACK ON THE REPLY PORT — daemon completed dispatch!');
    console.log('[trace] rm_Result1 =', emu.readMemory32(msgAddr + 32) >>> 0);
  } else {
    console.log('[trace] message did NOT come back to reply port — dispatch incomplete');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('[trace] fatal:', err);
  process.exit(99);
});
