│           ;-- section.HUNK_HEADER:
│           ;-- d0:
│           ;-- d1:
│           ;-- d2:
│           ;-- d3:
│           ;-- d4:
│           ;-- d5:
│           ;-- d6:
│           ;-- d7:
│           ;-- a0:
│           ;-- a1:
│           ;-- a2:
│           ;-- a3:
│           ;-- a4:
│           ;-- a5:
│           ;-- fp0:
│           ;-- fp1:
│           ;-- fp2:
│           ;-- fp3:
│           ;-- fp4:
│           ;-- fp5:
│           ;-- fp6:
│           ;-- fp7:
│           ;-- sr:
│           ;-- ccr:
│           ;-- sfc:
│           ;-- dfc:
│           ;-- usp:
│           ;-- vbr:
│           ;-- cacr:
│           ;-- caar:
│           ;-- msp:
│           ;-- isp:
│           ;-- tc:
│           ;-- itt0:
│           ;-- itt1:
│           ;-- dtt0:
│           ;-- dtt1:
│           ;-- mmusr:
│           ;-- urp:
│           ;-- srp:
│           ;-- fpcr:
│           ;-- fpsr:
│           ;-- fpiar:
│           ; XREFS: CALL 0x000000f2  CALL 0x00000146  CALL 0x0000014e  
│           ; XREFS: CALL 0x00000160  CALL 0x00000192  CODE 0x000001a4  
│           ; XREFS: CALL 0x000001c8  CALL 0x000001f0  CALL 0x00000212  
│           ; XREFS: CALL 0x0000028e  CALL 0x0000029a  CALL 0x000002a6  
│           ; XREFS: CALL 0x00000308  CALL 0x0000031a  CALL 0x00000322  
│           0x00000000      000003f3       ori.b 0xf3, d0              ; [00] -r-x section size 1128 named HUNK_HEADER
│           0x00000004      00000000       ori.b 0x0, d0
│           0x00000008      00000001       ori.b 0x1, d0
│           0x0000000c      00000000       ori.b 0x0, d0
│           0x00000010      00000000       ori.b 0x0, d0
│           0x00000014      00000103       ori.b 0x3, d0
│           0x00000018      000003e9       ori.b 0xe9, d0
│           0x0000001c      00000103       ori.b 0x3, d0
            ;-- pc:
┌ 4: entry0 ();
│           0x00000020      70ff           moveq 0xff, d0
└           0x00000022      4e75           rts
            0x00000024      4afc           illegal 0x4afc
            0x00000026      00000004       ori.b 0x4, d0
            0x0000002a      0000040c       ori.b 0xc, d0
            0x0000002e      8002           or.b d2, d0
            0x00000030      0900           btst.l d4, d0
            0x00000032      0000001e       ori.b 0x1e, d0
            0x00000036      00000033       ori.b 0x33, d0
            0x0000003a      0000005e       ori.b 0x5e, d0
            0x0000003e      4145           invalid
            0x00000040      446f6f72       neg.w 0x6f72(a7)
            0x00000044      2e6c6962       movea.l 0x6962(a4), a7
            0x00000048      7261           moveq 0x61, d1
            0x0000004a      7279           moveq 0x79, d1
            0x0000004c      00245645       ori.b 0x45, -(a4)
            0x00000050      523a           invalid
            0x00000052      2041           movea.l d1, a0
            0x00000054      4544           invalid
        ┌─< 0x00000056      6f6f           ble.b 0xc7
        │   0x00000058      724c           moveq 0x4c, d1
       ┌──< 0x0000005a      6962           bvs.b 0xbe
       ││   0x0000005c      20322e37       move.l 0x37(a2, d2.l), d0
       ││   0x00000060      20283138       move.l 0x3138(a0), d0
       ││   0x00000064      204d           movea.l a5, a0
       ││   0x00000066      6179           bsr.b 0xe1
       ││   0x00000068      2031393936..   move.l ([0x36290d0a, a1, d3.l]), d0
       ││   0x00000070      00646f73       ori.w 0x6f73, -(a4)
       ││   0x00000074      2e6c6962       movea.l 0x6962(a4), a7
       ││   0x00000078      7261           moveq 0x61, d1
       ││   0x0000007a      7279           moveq 0x79, d1
       ││   0x0000007c      00000000       ori.b 0x0, d0
       ││   0x00000080      00300000006e   ori.b 0x0, 0x6e(a0, d0.w)
       ││   0x00000086      000000a0       ori.b 0xa0, d0
       ││   0x0000008a      000000c0       ori.b 0xc0, d0
       ││   0x0000008e      ffff           invalid
       ││   0x00000090      007200800096   ori.w 0x80, -0x6a(a2, d0.w)
       ││   0x00000096      00de           invalid
       ││   0x00000098      00e2           invalid
       ││   0x0000009a      01ea0264       bset.b d0, 0x264(a2)
       ││   0x0000009e      02440224       andi.w 0x224, d4
       ││   0x000000a2      0234029e02a4   andi.b 0x9e, -0x5c(a4, d0.w)
       ││   0x000000a8      02aa02c203..   andi.l 0x2c20300, 0x306(a2)
       ││   0x000000b0      030c0312       movep.w 0x312(a4), d1
       ││   0x000000b4      0318           btst.l d1, (a0)+
       ││   0x000000b6      03320348       btst.l d1, (a2, invalid.w)
       ││   0x000000ba      0362           bchg.b d1, -(a2)
       ││   0x000000bc      0370ffffa0..   bchg.b d1, ([0xa00c0900])
        │   0x000000c4      800a           invalid
        │   0x000000c6      0000001e       ori.b 0x1e, d0
            0x000000ca      a00e           invalid
            0x000000cc      06009014       addi.b 0x14, d0
            0x000000d0      00029016       ori.b 0x16, d2
            0x000000d4      00078018       ori.b 0x18, d7
            0x000000d8      00000033       ori.b 0x33, d0
            0x000000dc      00000000       ori.b 0x0, d0
            0x000000e0      2f0d           move.l a5, -(a7)
            0x000000e2      2a40           movea.l d0, a5
            0x000000e4      2b4e0022       move.l a6, 0x22(a5)
            0x000000e8      2b48002a       move.l a0, 0x2a(a5)
            0x000000ec      43faff83       lea.l 0x71(pc), a1
            0x000000f0      7000           moveq 0x0, d0
            0x000000f2      4eaefdd8       jsr -0x228(a6)              ; fcn.00000170-0x170
            0x000000f6      2b400026       move.l d0, 0x26(a5)
            0x000000fa      200d           move.l a5, d0
            0x000000fc      2a5f           movea.l (a7)+, a5
            0x000000fe      4e75           rts
            0x00000100      526e0020       addq.w 0x1, 0x20(a6)
            0x00000104      08ae0003000e   bclr.b 0x3, 0xe(a6)
            0x0000010a      200e           move.l a6, d0
            0x0000010c      4e75           rts
            0x0000010e      7000           moveq 0x0, d0
            0x00000110      536e0020       subq.w 0x1, 0x20(a6)
            0x00000114      660c           bne.b 0x122
            0x00000116      082e0003000e   btst.b 0x3, 0xe(a6)
            0x0000011c      6704           beq.b 0x122
            0x0000011e      61000004       bsr.w fcn.00000124
            ; CODE XREFS from entry0 @ +0xf4(x), +0xfc(x)
            0x00000122      4e75           rts
            ; CALL XREF from entry0 @ +0xfe(x)
┌ 72: fcn.00000124 ();
│           0x00000124      48e72006       movem.l d2/a5-a6, -(a7)
│           0x00000128      2a4e           movea.l a6, a5
│           0x0000012a      2c6d0022       movea.l 0x22(a5), a6
│           0x0000012e      4a6d0020       tst.w 0x20(a5)
│           0x00000132      6700000c       beq.w 0x140
│           0x00000136      08ed0003000e   bset.b 0x3, 0xe(a5)
│           0x0000013c      7000           moveq 0x0, d0
│           0x0000013e      6026           bra.b 0x166
│           ; CODE XREF from fcn.00000124 @ 0x132(x)
│           0x00000140      242d002a       move.l 0x2a(a5), d2
│           0x00000144      224d           movea.l a5, a1
│           0x00000146      4eaeff04       jsr -0xfc(a6)               ; fcn.00000170-0x170
│           0x0000014a      226d0026       movea.l 0x26(a5), a1
│           0x0000014e      4eaefe62       jsr -0x19e(a6)              ; fcn.00000170-0x170
│           0x00000152      7000           moveq 0x0, d0
│           0x00000154      224d           movea.l a5, a1
│           0x00000156      302d0010       move.w 0x10(a5), d0
│           0x0000015a      93c0           suba.l d0, a1
│           0x0000015c      d06d0012       add.w 0x12(a5), d0
│           0x00000160      4eaeff2e       jsr -0xd2(a6)               ; fcn.00000170-0x170
│           0x00000164      2002           move.l d2, d0
│           ; CODE XREF from fcn.00000124 @ 0x13e(x)
│           0x00000166      4cdf6004       movem.l (a7)+, d2/a5-a6
└           0x0000016a      4e75           rts
            0x0000016c      7000           moveq 0x0, d0
            0x0000016e      4e75           rts
            ; CALL XREFS from fcn.000002f2 @ +0x102(x), +0x110(x)
┌ 316: fcn.00000170 ();
│           0x00000170      48e77f3e       movem.l d1-d7/a2-a6, -(a7)
│           0x00000174      2a6e0022       movea.l 0x22(a6), a5
│           0x00000178      2a6d0114       movea.l 0x114(a5), a5
│           0x0000017c      2e2d00cc       move.l 0xcc(a5), d7
│           0x00000180      2a4e           movea.l a6, a5
│           0x00000182      2c6d0022       movea.l 0x22(a5), a6
│           0x00000186      203c00000146   move.l 0x146, d0
│           0x0000018c      223c00010001   move.l 0x10001, d1
│           0x00000192      4eaeff3a       jsr -0xc6(a6)
│           0x00000196      4a80           tst.l d0
│           0x00000198      660e           bne.b 0x1a8
│           0x0000019a      2c6d0026       movea.l 0x26(a5), a6
│           0x0000019e      7232           moveq 0x32, d1
│           0x000001a0      487affe0       pea.l 0x182(pc)
│           0x000001a4      4eeeff3a       jmp -0xc6(a6)
│           ; CODE XREF from fcn.00000170 @ 0x198(x)
│           0x000001a8      2840           movea.l d0, a4
│           0x000001aa      41fa0266       lea.l 0x412(pc), a0
│           0x000001ae      43ec000c       lea.l 0xc(a4), a1
│           ; CODE XREF from fcn.00000170 @ 0x1b4(x)
│           0x000001b2      12d8           move.b (a0)+, (a1)+
│           0x000001b4      66fc           bne.b 0x1b2
│           0x000001b6      2047           movea.l d7, a0
│           0x000001b8      1358ffff       move.b (a0)+, -0x1(a1)
│           0x000001bc      0c100030       cmpi.b 0x30, (a0)
│           0x000001c0      6502           bcs.b 0x1c4
│           0x000001c2      1290           move.b (a0), (a1)
│           ; CODE XREF from fcn.00000170 @ 0x1c0(x)
│           0x000001c4      43ec000c       lea.l 0xc(a4), a1
│           0x000001c8      4eaefe7a       jsr -0x186(a6)
│           0x000001cc      29400000       move.l d0, 0x0(a4)
│           0x000001d0      670000cc       beq.w 0x29e
│           0x000001d4      41fa0247       lea.l 0x41d(pc), a0
│           0x000001d8      43ec000c       lea.l 0xc(a4), a1
│           ; CODE XREF from fcn.00000170 @ 0x1de(x)
│           0x000001dc      12d8           move.b (a0)+, (a1)+
│           0x000001de      66fc           bne.b 0x1dc
│           0x000001e0      2047           movea.l d7, a0
│           0x000001e2      1358ffff       move.b (a0)+, -0x1(a1)
│           0x000001e6      0c100030       cmpi.b 0x30, (a0)
│           0x000001ea      6502           bcs.b 0x1ee
│           0x000001ec      1290           move.b (a0), (a1)
│           ; CODE XREF from fcn.00000170 @ 0x1ea(x)
│           0x000001ee      70ff           moveq 0xff, d0
│           0x000001f0      4eaefeb6       jsr -0x14a(a6)
│           0x000001f4      43ec0024       lea.l 0x24(a4), a1
│           0x000001f8      1340000f       move.b d0, 0xf(a1)
│           0x000001fc      236e01140010   move.l 0x114(a6), 0x10(a1)
│           0x00000202      29490004       move.l a1, 0x4(a4)
│           0x00000206      42290009       clr.b 0x9(a1)
│           0x0000020a      41ec000c       lea.l 0xc(a4), a0
│           0x0000020e      2348000a       move.l a0, 0xa(a1)
│           0x00000212      4eaefe9e       jsr -0x162(a6)
│           0x00000216      45ec0046       lea.l 0x46(a4), a2
│           0x0000021a      294a0008       move.l a2, 0x8(a4)
│           0x0000021e      256c0004000e   move.l 0x4(a4), 0xe(a2)
│           0x00000224      357c01000012   move.w 0x100, 0x12(a2)
│           0x0000022a      7000           moveq 0x0, d0
│           0x0000022c      7230           moveq 0x30, d1
│           0x0000022e      2047           movea.l d7, a0
│           0x00000230      1018           move.b (a0)+, d0
│           0x00000232      9001           sub.b d1, d0
│           0x00000234      b210           cmp.b (a0), d1
│           0x00000236      650a           bcs.b 0x242
│           0x00000238      c0fc000a       mulu.w 0xa, d0
│           0x0000023c      1e10           move.b (a0), d7
│           0x0000023e      9e01           sub.b d1, d7
│           0x00000240      d007           add.b d7, d0
│           ; CODE XREF from fcn.00000170 @ 0x236(x)
│           0x00000242      254000e4       move.l d0, 0xe4(a2)
│           0x00000246      41ec000c       lea.l 0xc(a4), a0
│           0x0000024a      43ea0014       lea.l 0x14(a2), a1
│           ; CODE XREF from fcn.00000170 @ 0x250(x)
│           0x0000024e      12d8           move.b (a0)+, (a1)+
│           0x00000250      66fc           bne.b 0x24e
│           0x00000252      226c0008       movea.l 0x8(a4), a1
│           0x00000256      41e900dc       lea.l 0xdc(a1), a0
│           0x0000025a      2948001c       move.l a0, 0x1c(a4)
│           0x0000025e      41e90014       lea.l 0x14(a1), a0
│           0x00000262      29480020       move.l a0, 0x20(a4)
│           0x00000266      224c           movea.l a4, a1
│           0x00000268      7001           moveq 0x1, d0
│           0x0000026a      2c4d           movea.l a5, a6
│           0x0000026c      61000084       bsr.w fcn.000002f2
│           0x00000270      200c           move.l a4, d0
│           0x00000272      4cdf7cfe       movem.l (a7)+, d1-d7/a2-a6
│           0x00000276      4e75           rts
            0x00000278      48e77f3e       movem.l d1-d7/a2-a6, -(a7)
            0x0000027c      7002           moveq 0x2, d0
            0x0000027e      61000072       bsr.w fcn.000002f2
            ; CODE XREF from fcn.000002f2 @ +0x108(x)
            0x00000282      2a4e           movea.l a6, a5
            0x00000284      2849           movea.l a1, a4
            0x00000286      2c6d0022       movea.l 0x22(a5), a6
            0x0000028a      226c0004       movea.l 0x4(a4), a1
            0x0000028e      4eaefe98       jsr -0x168(a6)              ; fcn.00000170-0x170
            0x00000292      226d0004       movea.l 0x4(a5), a1
            0x00000296      1029000f       move.b 0xf(a1), d0
            0x0000029a      4eaefeb0       jsr -0x150(a6)              ; fcn.00000170-0x170
│           ; CODE XREF from fcn.00000170 @ 0x1d0(x)
│           0x0000029e      224c           movea.l a4, a1
│           0x000002a0      203c00000146   move.l 0x146, d0
│           0x000002a6      4eaeff2e       jsr -0xd2(a6)
│           0x000002aa      7000           moveq 0x0, d0
│           0x000002ac      4cdf7cfe       movem.l (a7)+, d1-d7/a2-a6
│           0x000002b0      4e75           rts
            ; CALL XREFS from fcn.000002f2 @ +0x82(x), +0x8c(x)
┌ 16: fcn.000002b2 ();
│           0x000002b2      48e7004a       movem.l a1/a4/a6, -(a7)
│           0x000002b6      2849           movea.l a1, a4
│           0x000002b8      226c0008       movea.l 0x8(a4), a1
│           0x000002bc      234100dc       move.l d1, 0xdc(a1)
└           0x000002c0      6036           bra.b 0x2f8                 ; fcn.000002f2+0x6
            ; CALL XREFS from fcn.000002f2 @ +0x48(x), +0x98(x), +0xaa(x), +0xb0(x), +0xb6(x)
┌ 38: fcn.000002c2 ();
│           0x000002c2      48e7004a       movem.l a1/a4/a6, -(a7)
│           0x000002c6      2849           movea.l a1, a4
│           0x000002c8      226c0008       movea.l 0x8(a4), a1
│           0x000002cc      234100dc       move.l d1, 0xdc(a1)
│           0x000002d0      600a           bra.b 0x2dc
            ; CALL XREFS from fcn.000002f2 @ +0x9e(x), +0xa4(x), +0xe6(x)
┌ 10: fcn.000002d2 ();
│           0x000002d2      48e7004a       movem.l a1/a4/a6, -(a7)
│           0x000002d6      2849           movea.l a1, a4
└           0x000002d8      226c0008       movea.l 0x8(a4), a1
│           ; CODE XREF from fcn.000002c2 @ 0x2d0(x)
│           0x000002dc      43e90014       lea.l 0x14(a1), a1
│           0x000002e0      2208           move.l a0, d1
│           0x000002e2      670a           beq.b 0x2ee
│           0x000002e4      323c00c6       move.w 0xc6, d1
│           ; CODE XREF from fcn.000002c2 @ 0x2ea(x)
│           0x000002e8      12d8           move.b (a0)+, (a1)+
│           0x000002ea      57c9fffc       dbeq d1, 0x2e8
│           ; CODE XREF from fcn.000002c2 @ 0x2e2(x)
│           0x000002ee      4211           clr.b (a1)
└           0x000002f0      6006           bra.b 0x2f8                 ; fcn.000002f2+0x6
            ; CALL XREF from fcn.00000170 @ 0x26c(x)
            ; CALL XREF from fcn.00000170 @ +0x10e(x)
            ; CODE XREF from fcn.000002f2 @ +0x11c(x)
┌ 58: fcn.000002f2 ();
│           0x000002f2      48e7004a       movem.l a1/a4/a6, -(a7)
│           0x000002f6      2849           movea.l a1, a4
│           ; CODE XREF from fcn.000002b2 @ 0x2c0(x)
│           ; CODE XREF from fcn.000002c2 @ 0x2f0(x)
│           0x000002f8      206c0000       movea.l 0x0(a4), a0
│           0x000002fc      226c0008       movea.l 0x8(a4), a1
│           0x00000300      234000e0       move.l d0, 0xe0(a1)
│           0x00000304      2c6e0022       movea.l 0x22(a6), a6
│           0x00000308      4eaefe92       jsr -0x16e(a6)              ; fcn.00000170-0x170
│           0x0000030c      206c0004       movea.l 0x4(a4), a0
│           0x00000310      7200           moveq 0x0, d1
│           0x00000312      1228000f       move.b 0xf(a0), d1
│           0x00000316      7001           moveq 0x1, d0
│           0x00000318      e3a0           asl.l d1, d0
│           0x0000031a      4eaefec2       jsr -0x13e(a6)              ; fcn.00000170-0x170
│           0x0000031e      206c0004       movea.l 0x4(a4), a0
│           0x00000322      4eaefe8c       jsr -0x174(a6)              ; fcn.00000170-0x170
│           0x00000326      4cdf5200       movem.l (a7)+, a1/a4/a6
└           0x0000032a      4e75           rts
            0x0000032c      2029001c       move.l 0x1c(a1), d0
            0x00000330      4e75           rts
            0x00000332      20290020       move.l 0x20(a1), d0
            0x00000336      4e75           rts
            0x00000338      7005           moveq 0x5, d0
            0x0000033a      6186           bsr.b fcn.000002c2
            0x0000033c      2069001c       movea.l 0x1c(a1), a0
            0x00000340      70ff           moveq 0xff, d0
            0x00000342      b090           cmp.l (a0), d0
            0x00000344      6706           beq.b 0x34c
            0x00000346      20290020       move.l 0x20(a1), d0
            0x0000034a      4e75           rts
            ; CODE XREF from fcn.000002f2 @ +0x52(x)
            0x0000034c      7000           moveq 0x0, d0
            0x0000034e      4e75           rts
            0x00000350      48e70118       movem.l d7/a3-a4, -(a7)
            0x00000354      2849           movea.l a1, a4
            0x00000356      7e01           moveq 0x1, d7
            0x00000358      ce01           and.b d1, d7
            0x0000035a      2648           movea.l a0, a3
            ; CODE XREF from fcn.000002f2 @ +0x86(x)
            0x0000035c      224c           movea.l a4, a1
            0x0000035e      303c00c6       move.w 0xc6, d0
            0x00000362      206c0020       movea.l 0x20(a4), a0
            ; CODE XREF from fcn.000002f2 @ +0x76(x)
            0x00000366      10db           move.b (a3)+, (a0)+
            0x00000368      57c8fffc       dbeq d0, 0x366
            0x0000036c      670c           beq.b 0x37a
            0x0000036e      4210           clr.b (a0)
            0x00000370      7004           moveq 0x4, d0
            0x00000372      7200           moveq 0x0, d1
            0x00000374      6100ff3c       bsr.w fcn.000002b2
            0x00000378      60e2           bra.b 0x35c
            ; CODE XREF from fcn.000002f2 @ +0x7a(x)
            0x0000037a      7004           moveq 0x4, d0
            0x0000037c      2207           move.l d7, d1
            0x0000037e      6100ff32       bsr.w fcn.000002b2
            0x00000382      4cdf1880       movem.l (a7)+, d7/a3-a4
            0x00000386      4e75           rts
            0x00000388      7004           moveq 0x4, d0
            0x0000038a      6000ff36       bra.w fcn.000002c2
            0x0000038e      7007           moveq 0x7, d0
            0x00000390      6000ff40       bra.w fcn.000002d2
            0x00000394      7008           moveq 0x8, d0
            0x00000396      6000ff3a       bra.w fcn.000002d2
            0x0000039a      7200           moveq 0x0, d1
            0x0000039c      6000ff24       bra.w fcn.000002c2
            0x000003a0      7201           moveq 0x1, d1
            0x000003a2      6000ff1e       bra.w fcn.000002c2
            0x000003a6      7000           moveq 0x0, d0
            0x000003a8      6100ff18       bsr.w fcn.000002c2
            0x000003ac      2069001c       movea.l 0x1c(a1), a0
            0x000003b0      70ff           moveq 0xff, d0
            0x000003b2      b090           cmp.l (a0), d0
            0x000003b4      6706           beq.b 0x3bc
            0x000003b6      20290020       move.l 0x20(a1), d0
            0x000003ba      4e75           rts
            ; CODE XREF from fcn.000002f2 @ +0xc2(x)
            0x000003bc      7000           moveq 0x0, d0
            0x000003be      4e75           rts
            0x000003c0      2f09           move.l a1, -(a7)
            0x000003c2      22690020       movea.l 0x20(a1), a1
            0x000003c6      303c00c6       move.w 0xc6, d0
            ; CODE XREF from fcn.000002f2 @ +0xda(x)
            0x000003ca      10d9           move.b (a1)+, (a0)+
            0x000003cc      57c8fffc       dbeq d0, 0x3ca
            0x000003d0      4210           clr.b (a0)
            0x000003d2      225f           movea.l (a7)+, a1
            0x000003d4      4e75           rts
            0x000003d6      7006           moveq 0x6, d0
            0x000003d8      6100fef8       bsr.w fcn.000002d2
            0x000003dc      2069001c       movea.l 0x1c(a1), a0
            0x000003e0      2010           move.l (a0), d0
            0x000003e2      6b0a           bmi.b 0x3ee
            0x000003e4      20690020       movea.l 0x20(a1), a0
            0x000003e8      7000           moveq 0x0, d0
            0x000003ea      1010           move.b (a0), d0
            0x000003ec      7200           moveq 0x0, d1
            ; CODE XREF from fcn.000002f2 @ +0xf0(x)
            0x000003ee      4e75           rts
            0x000003f0      48e77f3e       movem.l d1-d7/a2-a6, -(a7)
            0x000003f4      6100fd7a       bsr.w fcn.00000170
            0x000003f8      2240           movea.l d0, a1
            0x000003fa      6000fe86       bra.w 0x282
            0x000003fe      48e77f3e       movem.l d1-d7/a2-a6, -(a7)
            0x00000402      6100fd6c       bsr.w fcn.00000170
            0x00000406      2240           movea.l d0, a1
            0x00000408      7002           moveq 0x2, d0
            0x0000040a      487afe70       pea.l 0x27c(pc)
            0x0000040e      6000fee2       bra.w fcn.000002f2
            0x00000412      4145           invalid
            0x00000414      446f6f72       neg.w 0x6f72(a7)
            0x00000418      506f7274       addq.w 0x8, 0x7274(a7)
            0x0000041c      00446f6f       ori.w 0x6f6f, d4
            0x00000420      7252           moveq 0x52, d1
            0x00000422      6570           bcs.b 0x494
            0x00000424      6c79           bge.b 0x49f
            0x00000426      506f7274       addq.w 0x8, 0x7274(a7)
            0x0000042a      00000000       ori.b 0x0, d0
            0x0000042e      03ec0000       bset.b d1, 0x0(a4)
            0x00000432      000a           invalid
            0x00000434      00000000       ori.b 0x0, d0
            0x00000438      00000006       ori.b 0x6, d0
            0x0000043c      0000000a       ori.b 0xa, d0
            0x00000440      00000012       ori.b 0x12, d0
            0x00000444      00000016       ori.b 0x16, d0
            0x00000448      0000001a       ori.b 0x1a, d0
            0x0000044c      00000062       ori.b 0x62, d0
            0x00000450      00000066       ori.b 0x66, d0
            0x00000454      0000006a       ori.b 0x6a, d0
            0x00000458      000000a6       ori.b 0xa6, d0
            0x0000045c      000000b8       ori.b 0xb8, d0
            0x00000460      00000000       ori.b 0x0, d0
            0x00000464      000003f2       ori.b 0xf2, d0
            0x00000468      ffff           invalid
            0x0000046a      ffff           invalid
            0x0000046c      ffff           invalid
            0x0000046e      ffff           invalid
            0x00000470      ffff           invalid
            0x00000472      ffff           invalid
            0x00000474      ffff           invalid
            0x00000476      ffff           invalid
            0x00000478      ffff           invalid
            0x0000047a      ffff           invalid
            0x0000047c      ffff           invalid
            0x0000047e      ffff           invalid
            0x00000480      ffff           invalid
            0x00000482      ffff           invalid
            0x00000484      ffff           invalid
            0x00000486      ffff           invalid
            0x00000488      ffff           invalid
            0x0000048a      ffff           invalid
            0x0000048c      ffff           invalid
            0x0000048e      ffff           invalid
            0x00000490      ffff           invalid
            0x00000492      ffff           invalid
            0x00000494      ffff           invalid
            0x00000496      ffff           invalid
            0x00000498      ffff           invalid
            0x0000049a      ffff           invalid
            0x0000049c      ffff           invalid
            0x0000049e      ffff           invalid
            0x000004a0      ffff           invalid
            0x000004a2      ffff           invalid
            0x000004a4      ffff           invalid
            0x000004a6      ffff           invalid
            0x000004a8      ffff           invalid
            0x000004aa      ffff           invalid
            0x000004ac      ffff           invalid
            0x000004ae      ffff           invalid
            0x000004b0      ffff           invalid
            0x000004b2      ffff           invalid
            0x000004b4      ffff           invalid
            0x000004b6      ffff           invalid
            0x000004b8      ffff           invalid
            0x000004ba      ffff           invalid
            0x000004bc      ffff           invalid
            0x000004be      ffff           invalid
            0x000004c0      ffff           invalid
            0x000004c2      ffff           invalid
            0x000004c4      ffff           invalid
            0x000004c6      ffff           invalid
            0x000004c8      ffff           invalid
            0x000004ca      ffff           invalid
            0x000004cc      ffff           invalid
            0x000004ce      ffff           invalid
            0x000004d0      ffff           invalid
            0x000004d2      ffff           invalid
            0x000004d4      ffff           invalid
            0x000004d6      ffff           invalid
            0x000004d8      ffff           invalid
            0x000004da      ffff           invalid
            0x000004dc      ffff           invalid
            0x000004de      ffff           invalid
            0x000004e0      ffff           invalid
            0x000004e2      ffff           invalid
            0x000004e4      ffff           invalid
            0x000004e6      ffff           invalid
            0x000004e8      ffff           invalid
            0x000004ea      ffff           invalid
            0x000004ec      ffff           invalid
            0x000004ee      ffff           invalid
            0x000004f0      ffff           invalid
            0x000004f2      ffff           invalid
            0x000004f4      ffff           invalid
            0x000004f6      ffff           invalid
            0x000004f8      ffff           invalid
            0x000004fa      ffff           invalid
            0x000004fc      ffff           invalid
            0x000004fe      ffff           invalid
            0x00000500      ffff           invalid
            0x00000502      ffff           invalid
            0x00000504      ffff           invalid
            0x00000506      ffff           invalid
            0x00000508      ffff           invalid
            0x0000050a      ffff           invalid
            0x0000050c      ffff           invalid
            0x0000050e      ffff           invalid
            0x00000510      ffff           invalid
            0x00000512      ffff           invalid
            0x00000514      ffff           invalid
            0x00000516      ffff           invalid
            0x00000518      ffff           invalid
            0x0000051a      ffff           invalid
            0x0000051c      ffff           invalid
            0x0000051e      ffff           invalid
            0x00000520      ffff           invalid
            0x00000522      ffff           invalid
            0x00000524      ffff           invalid
            0x00000526      ffff           invalid
            0x00000528      ffff           invalid
            0x0000052a      ffff           invalid
            0x0000052c      ffff           invalid
            0x0000052e      ffff           invalid
            0x00000530      ffff           invalid
            0x00000532      ffff           invalid
            0x00000534      ffff           invalid
            0x00000536      ffff           invalid
            0x00000538      ffff           invalid
            0x0000053a      ffff           invalid
            0x0000053c      ffff           invalid
            0x0000053e      ffff           invalid
            0x00000540      ffff           invalid
            0x00000542      ffff           invalid
            0x00000544      ffff           invalid
            0x00000546      ffff           invalid
            0x00000548      ffff           invalid
            0x0000054a      ffff           invalid
            0x0000054c      ffff           invalid
            0x0000054e      ffff           invalid
            0x00000550      ffff           invalid
            0x00000552      ffff           invalid
            0x00000554      ffff           invalid
            0x00000556      ffff           invalid
            0x00000558      ffff           invalid
            0x0000055a      ffff           invalid
            0x0000055c      ffff           invalid
            0x0000055e      ffff           invalid
            0x00000560      ffff           invalid
            0x00000562      ffff           invalid
            0x00000564      ffff           invalid
            0x00000566      ffff           invalid
            0x00000568      ffff           invalid
            0x0000056a      ffff           invalid
            0x0000056c      ffff           invalid
            0x0000056e      ffff           invalid
            0x00000570      ffff           invalid
            0x00000572      ffff           invalid
            0x00000574      ffff           invalid
            0x00000576      ffff           invalid
            0x00000578      ffff           invalid
            0x0000057a      ffff           invalid
            0x0000057c      ffff           invalid
            0x0000057e      ffff           invalid
            0x00000580      ffff           invalid
            0x00000582      ffff           invalid
            0x00000584      ffff           invalid
            0x00000586      ffff           invalid
            0x00000588      ffff           invalid
            0x0000058a      ffff           invalid
            0x0000058c      ffff           invalid
            0x0000058e      ffff           invalid
            0x00000590      ffff           invalid
            0x00000592      ffff           invalid
            0x00000594      ffff           invalid
            0x00000596      ffff           invalid
            0x00000598      ffff           invalid
            0x0000059a      ffff           invalid
            0x0000059c      ffff           invalid
            0x0000059e      ffff           invalid
            0x000005a0      ffff           invalid
            0x000005a2      ffff           invalid
            0x000005a4      ffff           invalid
            0x000005a6      ffff           invalid
