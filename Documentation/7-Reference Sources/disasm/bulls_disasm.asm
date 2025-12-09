            ;-- pc:
┌ 592: entry0 ();
│           0x00000024      48e77efe       movem.l d1-d6/a0-a6, -(a7)
│           0x00000028      2448           movea.l a0, a2
│           0x0000002a      2400           move.l d0, d2
│           0x0000002c      49f900000000   lea.l 0x0, a4
│           0x00000032      2c780004       movea.l 0x4, a6
│           0x00000036      47f900000984   lea.l 0x984, a3
│           0x0000003c      7200           moveq 0x0, d1
│           0x0000003e      203c000018d8   move.l 0x18d8, d0
│       ┌─< 0x00000044      6002           bra.b 0x48
│       │   ; CODE XREF from entry0 @ 0x48(x)
│      ┌──> 0x00000046      26c1           move.l d1, (a3)+
│      ││   ; CODE XREF from entry0 @ 0x44(x)
│      └└─> 0x00000048      51c8fffc       dbra d0, 0x46
│           0x0000004c      294f6c70       move.l a7, 0x6c70(a4)
│           0x00000050      294e098c       move.l a6, 0x98c(a4)
│           0x00000054      266e0114       movea.l 0x114(a6), a3
│           0x00000058      202b00ac       move.l 0xac(a3), d0
│       ┌─< 0x0000005c      670c           beq.b 0x6a
│       │   0x0000005e      e588           lsl.l 0x2, d0
│       │   0x00000060      2040           movea.l d0, a0
│       │   0x00000062      20280034       move.l 0x34(a0), d0
│       │   0x00000066      e588           lsl.l 0x2, d0
│      ┌──< 0x00000068      6006           bra.b 0x70
│      ││   ; CODE XREF from entry0 @ 0x5c(x)
│      │└─> 0x0000006a      200f           move.l a7, d0
│      │    0x0000006c      90ab003a       sub.l 0x3a(a3), d0
│      │    ; CODE XREF from entry0 @ 0x68(x)
│      └──> 0x00000070      220f           move.l a7, d1
│           0x00000072      9280           sub.l d0, d1
│           0x00000074      068100000080   addi.l 0x80, d1
│           0x0000007a      29416c6c       move.l d1, 0x6c6c(a4)
│           0x0000007e      b0ac0848       cmp.l 0x848(a4), d0
│       ┌─< 0x00000082      6454           bcc.b 0xd8
│       │   0x00000084      202c0848       move.l 0x848(a4), d0
│       │   0x00000088      068000000080   addi.l 0x80, d0
│       │   0x0000008e      294009a8       move.l d0, 0x9a8(a4)
│       │   0x00000092      223c00010001   move.l 0x10001, d1
│       │   0x00000098      4eaeff3a       jsr -0xc6(a6)               ; fcn.000030f0-0x30f0
│       │   0x0000009c      4a80           tst.l d0
│      ┌──< 0x0000009e      670001d2       beq.w 0x272
│      ││   0x000000a2      294009a4       move.l d0, 0x9a4(a4)
│      ││   0x000000a6      068000000080   addi.l 0x80, d0
│      ││   0x000000ac      29406c6c       move.l d0, 0x6c6c(a4)
│      ││   0x000000b0      d0ac0848       add.l 0x848(a4), d0
│      ││   0x000000b4      2200           move.l d0, d1
│      ││   0x000000b6      0c6e00240014   cmpi.w 0x24, 0x14(a6)
│     ┌───< 0x000000bc      6d18           blt.b 0xd6
│     │││   0x000000be      294009a0       move.l d0, 0x9a0(a4)
│     │││   0x000000c2      2941099c       move.l d1, 0x99c(a4)
│     │││   0x000000c6      92ac09a8       sub.l 0x9a8(a4), d1
│     │││   0x000000ca      41ec0998       lea.l 0x998(a4), a0
│     │││   0x000000ce      2081           move.l d1, (a0)
│     │││   0x000000d0      4eaefd24       jsr -0x2dc(a6)              ; fcn.000030f0-0x30f0
│    ┌────< 0x000000d4      6002           bra.b 0xd8
│    ││││   ; CODE XREF from entry0 @ 0xbc(x)
│    │└───> 0x000000d6      2e40           movea.l d0, a7
│    │ ││   ; CODE XREFS from entry0 @ 0x82(x), 0xd4(x)
│    └──└─> 0x000000d8      42ac6c84       clr.l 0x6c84(a4)
│      │    0x000000dc      7000           moveq 0x0, d0
│      │    0x000000de      223c00003000   move.l 0x3000, d1
│      │    0x000000e4      4eaefece       jsr -0x132(a6)              ; fcn.000030f0-0x30f0
│      │    0x000000e8      266e0114       movea.l 0x114(a6), a3
│      │    0x000000ec      43fa018a       lea.l 0x278(pc), a1
│      │    0x000000f0      7000           moveq 0x0, d0
│      │    0x000000f2      4eaefdd8       jsr -0x228(a6)              ; fcn.000030f0-0x30f0
│      │    0x000000f6      29400988       move.l d0, 0x988(a4)
│      │┌─< 0x000000fa      6606           bne.b 0x102
│      ││   0x000000fc      7064           moveq 0x64, d0
│     ┌───< 0x000000fe      600000ea       bra.w 0x1ea
│     │││   ; CODE XREF from entry0 @ 0xfa(x)
│     ││└─> 0x00000102      296b00986c80   move.l 0x98(a3), 0x6c80(a4)
│     ││    0x00000108      4aab00ac       tst.l 0xac(a3)
│     ││┌─< 0x0000010c      6700007e       beq.w 0x18c
│     │││   0x00000110      206b00ac       movea.l 0xac(a3), a0
│     │││   0x00000114      d1c8           adda.l a0, a0
│     │││   0x00000116      d1c8           adda.l a0, a0
│     │││   0x00000118      22680010       movea.l 0x10(a0), a1
│     │││   0x0000011c      d3c9           adda.l a1, a1
│     │││   0x0000011e      d3c9           adda.l a1, a1
│     │││   0x00000120      2002           move.l d2, d0
│     │││   0x00000122      7200           moveq 0x0, d1
│     │││   0x00000124      1219           move.b (a1)+, d1
│     │││   0x00000126      29496c74       move.l a1, 0x6c74(a4)
│     │││   0x0000012a      d081           add.l d1, d0
│     │││   0x0000012c      5e80           addq.l 0x7, d0
│     │││   0x0000012e      0240fffc       andi.w 0xfffc, d0
│     │││   0x00000132      29400994       move.l d0, 0x994(a4)
│     │││   0x00000136      48e74040       movem.l d1/a1, -(a7)
│     │││   0x0000013a      223c00010001   move.l 0x10001, d1
│     │││   0x00000140      4eaeff3a       jsr -0xc6(a6)               ; fcn.000030f0-0x30f0
│     │││   0x00000144      4cdf0202       movem.l (a7)+, d1/a1
│     │││   0x00000148      4a80           tst.l d0
│     │││   0x0000014a      6608           bne.b 0x154
│     │││   0x0000014c      7014           moveq 0x14, d0
│     │││   0x0000014e      2f00           move.l d0, -(a7)
│     │││   0x00000150      67000116       beq.w 0x268
│     │││   ; CODE XREF from entry0 @ 0x14a(x)
│     │││   0x00000154      2040           movea.l d0, a0
│     │││   0x00000156      29400990       move.l d0, 0x990(a4)
│     │││   0x0000015a      2002           move.l d2, d0
│     │││   0x0000015c      5380           subq.l 0x1, d0
│     │││   0x0000015e      d481           add.l d1, d2
│     │││   ; CODE XREF from entry0 @ 0x168(x)
│     │││   0x00000160      11b200002002   move.b (a2, d0.w), 0x2(a0, d2.w)
│     │││   0x00000166      5382           subq.l 0x1, d2
│     │││   0x00000168      51c8fff6       dbra d0, 0x160
│     │││   0x0000016c      11bc00202002   move.b 0x20, 0x2(a0, d2.w)
│     │││   0x00000172      5382           subq.l 0x1, d2
│     │││   0x00000174      11bc00222002   move.b 0x22, 0x2(a0, d2.w)
│     │││   ; CODE XREF from entry0 @ 0x180(x)
│     │││   0x0000017a      11b120002001   move.b (a1, d2.w), 0x1(a0, d2.w)
│     │││   0x00000180      51cafff8       dbra d2, 0x17a
│     │││   0x00000184      10bc0022       move.b 0x22, (a0)
│     │││   0x00000188      2f08           move.l a0, -(a7)
│     │││   0x0000018a      604a           bra.b 0x1d6
│     │││   ; CODE XREF from entry0 @ 0x10c(x)
│     ││└─> 0x0000018c      41eb005c       lea.l 0x5c(a3), a0
│     ││    0x00000190      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
│     ││    0x00000194      41eb005c       lea.l 0x5c(a3), a0
│     ││    0x00000198      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
│     ││    0x0000019c      29406c84       move.l d0, 0x6c84(a4)
│     ││    0x000001a0      2f00           move.l d0, -(a7)
│     ││    0x000001a2      2440           movea.l d0, a2
│     ││    0x000001a4      202a0024       move.l 0x24(a2), d0
│     ││    0x000001a8      6718           beq.b 0x1c2
│     ││    0x000001aa      2c6c0988       movea.l 0x988(a4), a6
│     ││    0x000001ae      2040           movea.l d0, a0
│     ││    0x000001b0      22280000       move.l 0x0(a0), d1
│     ││    0x000001b4      4eaeffa0       jsr -0x60(a6)               ; fcn.000030f0-0x30f0
│     ││    0x000001b8      29406c80       move.l d0, 0x6c80(a4)
│     ││    0x000001bc      2200           move.l d0, d1
│     ││    0x000001be      4eaeff82       jsr -0x7e(a6)               ; fcn.000030f0-0x30f0
│     ││    ; CODE XREF from entry0 @ 0x1a8(x)
│     ││    0x000001c2      206c6c84       movea.l 0x6c84(a4), a0
│     ││    0x000001c6      2f08           move.l a0, -(a7)
│     ││    0x000001c8      486c0984       pea.l 0x984(a4)
│     ││    0x000001cc      20680024       movea.l 0x24(a0), a0
│     ││    0x000001d0      296800046c74   move.l 0x4(a0), 0x6c74(a4)
│     ││    ; CODE XREF from entry0 @ 0x18a(x)
│     ││    0x000001d6      4eba2924       jsr fcn.00002afc(pc)
│     ││    0x000001da      4a80           tst.l d0
│     ││    0x000001dc      660c           bne.b 0x1ea
│     ││    0x000001de      4eba3618       jsr fcn.000037f8(pc)
│     ││    0x000001e2      7000           moveq 0x0, d0
│     ││    0x000001e4      6004           bra.b 0x1ea
      ││    ; CALL XREF from fcn.000037ec @ 0x37ee(x)
┌ 4: fcn.000001e6 ();
└     ││    0x000001e6      202f0004       move.l 0x4(a7), d0
│     ││    ; CODE XREFS from entry0 @ 0xfe(x), 0x1dc(x), 0x1e4(x)
│     └───> 0x000001ea      246c6c70       movea.l 0x6c70(a4), a2
│      │    0x000001ee      2500           move.l d0, -(a2)
│      │    0x000001f0      2c780004       movea.l 0x4, a6
│      │    0x000001f4      0c6e00240014   cmpi.w 0x24, 0x14(a6)
│      │    0x000001fa      6d12           blt.b 0x20e
│      │    0x000001fc      4aac0998       tst.l 0x998(a4)
│      │    0x00000200      670c           beq.b 0x20e
│      │    0x00000202      41ec0998       lea.l 0x998(a4), a0
│      │    0x00000206      59ac09a0       subq.l 0x4, 0x9a0(a4)
│      │    0x0000020a      4eaefd24       jsr -0x2dc(a6)              ; fcn.000030f0-0x30f0
│      │    ; CODE XREFS from entry0 @ 0x1fa(x), 0x200(x)
│      │    0x0000020e      2e4a           movea.l a2, a7
│      │    0x00000210      202c6c78       move.l 0x6c78(a4), d0
│      │    0x00000214      6704           beq.b 0x21a
│      │    0x00000216      2040           movea.l d0, a0
│      │    0x00000218      4e90           jsr (a0)                    ; fcn.00000009
│      │    ; CODE XREF from entry0 @ 0x214(x)
│      │    0x0000021a      4eba2902       jsr fcn.00002b1e(pc)
│      │    0x0000021e      202c09a8       move.l 0x9a8(a4), d0
│      │    0x00000222      670c           beq.b 0x230
│      │    0x00000224      226c09a4       movea.l 0x9a4(a4), a1
│      │    0x00000228      2c780004       movea.l 0x4, a6
│      │    0x0000022c      4eaeff2e       jsr -0xd2(a6)               ; fcn.000030f0-0x30f0
│      │    ; CODE XREF from entry0 @ 0x222(x)
│      │    0x00000230      4aac6c84       tst.l 0x6c84(a4)
│      │    0x00000234      6720           beq.b 0x256
│      │    0x00000236      2c6c0988       movea.l 0x988(a4), a6
│      │    0x0000023a      222c6c80       move.l 0x6c80(a4), d1
│      │    0x0000023e      6704           beq.b 0x244
│      │    0x00000240      4eaeffa6       jsr -0x5a(a6)               ; fcn.000030f0-0x30f0
│      │    ; CODE XREF from entry0 @ 0x23e(x)
│      │    0x00000244      2c780004       movea.l 0x4, a6
│      │    0x00000248      4eaeff7c       jsr -0x84(a6)               ; fcn.000030f0-0x30f0
│      │    0x0000024c      226c6c84       movea.l 0x6c84(a4), a1
│      │    0x00000250      4eaefe86       jsr -0x17a(a6)              ; fcn.000030f0-0x30f0
│      │    0x00000254      6012           bra.b 0x268
│      │    ; CODE XREF from entry0 @ 0x234(x)
│      │    0x00000256      2c780004       movea.l 0x4, a6
│      │    0x0000025a      202c0994       move.l 0x994(a4), d0
│      │    0x0000025e      6708           beq.b 0x268
│      │    0x00000260      226c0990       movea.l 0x990(a4), a1
│      │    0x00000264      4eaeff2e       jsr -0xd2(a6)               ; fcn.000030f0-0x30f0
│      │    ; CODE XREFS from entry0 @ 0x150(x), 0x254(x), 0x25e(x)
│      │    0x00000268      226c0988       movea.l 0x988(a4), a1
│      │    0x0000026c      4eaefe62       jsr -0x19e(a6)              ; fcn.000030f0-0x30f0
│      │    0x00000270      201f           move.l (a7)+, d0
│      │    ; CODE XREF from entry0 @ 0x9e(x)
│      └──> 0x00000272      4cdf7f7e       movem.l (a7)+, d1-d6/a0-a6
└           0x00000276      4e75           rts
            0x00000278      646f           bcc.b 0x2e9                 ; fcn.000002d4+0x15
            0x0000027a      732e           invalid
            0x0000027c      6c69           bge.b 0x2e7                 ; fcn.000002d4+0x13
            0x0000027e      6272           bhi.b 0x2f2                 ; fcn.000002d4+0x1e
            0x00000280      6172           bsr.b fcn.000002f4
            0x00000282      7900           invalid
            ; CALL XREF from fcn.000037f8 @ 0x3950(x)
┌ 80: fcn.00000284 ();
│           0x00000284      48e70104       movem.l d7/a5, -(a7)
│           0x00000288      2e00           move.l d0, d7
│           0x0000028a      2a48           movea.l a0, a5
│           0x0000028c      2007           move.l d7, d0
│           0x0000028e      5580           subq.l 0x2, d0
│           0x00000290      6722           beq.b 0x2b4
│           0x00000292      486c0008       pea.l 0x8(a4)
│           0x00000296      486c0000       pea.l 0x0(a4)
│           0x0000029a      610028cc       bsr.w fcn.00002b68
│           0x0000029e      486c006e       pea.l 0x6e(a4)
│           0x000002a2      486c0046       pea.l 0x46(a4)
│           0x000002a6      610028c0       bsr.w fcn.00002b68
│           0x000002aa      7000           moveq 0x0, d0
│           0x000002ac      61003c66       bsr.w fcn.00003f14
│           0x000002b0      4fef0010       lea.l 0x10(a7), a7
│           ; CODE XREF from fcn.00000284 @ 0x290(x)
│           0x000002b4      206d0004       movea.l 0x4(a5), a0
│           0x000002b8      61003c26       bsr.w fcn.00003ee0
│           0x000002bc      294068c4       move.l d0, 0x68c4(a4)
│           0x000002c0      61000f62       bsr.w fcn.00001224
│           0x000002c4      6100000e       bsr.w fcn.000002d4
│           0x000002c8      61000f46       bsr.w fcn.00001210
│           0x000002cc      7000           moveq 0x0, d0
│           0x000002ce      4cdf2080       movem.l (a7)+, d7/a5
└           0x000002d2      4e75           rts
            ; CALL XREF from fcn.00000284 @ 0x2c4(x)
┌ 32: fcn.000002d4 ();
│           0x000002d4      9efc00e4       suba.w 0xe4, a7
│           0x000002d8      48e73f00       movem.l d2-d7, -(a7)
│           0x000002dc      7c00           moveq 0x0, d6
│           0x000002de      7a01           moveq 0x1, d5
│           0x000002e0      7801           moveq 0x1, d4
│           0x000002e2      41ec0078       lea.l 0x78(a4), a0
│           0x000002e6      203c000001f5   move.l 0x1f5, d0
│           0x000002ec      61001c84       bsr.w fcn.00001f72
└           0x000002f0      41ec007a       lea.l 0x7a(a4), a0
            ; CALL XREF from fcn.000001e6 @ +0x9a(x)
┌ 1556: fcn.000002f4 (int32_t arg_30h);
│ `- args(sp[0x30..0x30])
│           0x000002f4      704e           moveq 0x4e, d0
│           0x000002f6      4600           not.b d0
│           0x000002f8      61001c78       bsr.w fcn.00001f72
│           0x000002fc      426c6c10       clr.w 0x6c10(a4)
│           0x00000300      397c00016c12   move.w 0x1, 0x6c12(a4)
│           0x00000306      61000bd8       bsr.w fcn.00000ee0
│           0x0000030a      294068cc       move.l d0, 0x68cc(a4)
│           0x0000030e      61000b34       bsr.w fcn.00000e44
│           0x00000312      42ac68d0       clr.l 0x68d0(a4)
│           0x00000316      7001           moveq 0x1, d0
│           0x00000318      294068c8       move.l d0, 0x68c8(a4)
│           ; CODE XREF from fcn.000002f4 @ 0x37c(x)
│           0x0000031c      202c68c8       move.l 0x68c8(a4), d0
│           0x00000320      b0ac68cc       cmp.l 0x68cc(a4), d0
│           0x00000324      6e58           bgt.b 0x37e
│           0x00000326      222c68e4       move.l 0x68e4(a4), d1
│           0x0000032a      2401           move.l d1, d2
│           0x0000032c      e582           asl.l 0x2, d2
│           0x0000032e      9481           sub.l d1, d2
│           0x00000330      e782           asl.l 0x3, d2
│           0x00000332      d481           add.l d1, d2
│           0x00000334      e582           asl.l 0x2, d2
│           0x00000336      41ec31c4       lea.l 0x31c4(a4), a0
│           0x0000033a      d1c2           adda.l d2, a0
│           0x0000033c      d1c0           adda.l d0, a0
│           0x0000033e      7258           moveq 0x58, d1
│           0x00000340      b210           cmp.b (a0), d1
│           0x00000342      6628           bne.b 0x36c
│           0x00000344      52ac68d0       addq.l 0x1, 0x68d0(a4)
│           0x00000348      222c68d0       move.l 0x68d0(a4), d1
│           0x0000034c      2401           move.l d1, d2
│           0x0000034e      e582           asl.l 0x2, d2
│           0x00000350      41ec68e8       lea.l 0x68e8(a4), a0
│           0x00000354      21802800       move.l d0, (a0, d2.l)
│           0x00000358      202c68c8       move.l 0x68c8(a4), d0
│           0x0000035c      2200           move.l d0, d1
│           0x0000035e      e581           asl.l 0x2, d1
│           0x00000360      41ec6a78       lea.l 0x6a78(a4), a0
│           0x00000364      21ac68d01800   move.l 0x68d0(a4), (a0, d1.l)
│           0x0000036a      600c           bra.b 0x378
│           ; CODE XREF from fcn.000002f4 @ 0x342(x)
│           0x0000036c      2200           move.l d0, d1
│           0x0000036e      e581           asl.l 0x2, d1
│           0x00000370      41ec6a78       lea.l 0x6a78(a4), a0
│           0x00000374      42b01800       clr.l (a0, d1.l)
│           ; CODE XREF from fcn.000002f4 @ 0x36a(x)
│           0x00000378      52ac68c8       addq.l 0x1, 0x68c8(a4)
│           0x0000037c      609e           bra.b 0x31c
│           ; CODE XREF from fcn.000002f4 @ 0x324(x)
│           0x0000037e      7001           moveq 0x1, d0
│           0x00000380      b0ac68d0       cmp.l 0x68d0(a4), d0
│           0x00000384      6604           bne.b 0x38a
│           0x00000386      426c6c10       clr.w 0x6c10(a4)
│           ; CODE XREF from fcn.000002f4 @ 0x384(x)
│           0x0000038a      202c68d8       move.l 0x68d8(a4), d0
│           0x0000038e      294068dc       move.l d0, 0x68dc(a4)
│           0x00000392      294068e0       move.l d0, 0x68e0(a4)
│           0x00000396      4a80           tst.l d0
│           0x00000398      6f12           ble.b 0x3ac
│           0x0000039a      397c00016c14   move.w 0x1, 0x6c14(a4)
│           0x000003a0      6100098c       bsr.w fcn.00000d2e
│           0x000003a4      4a40           tst.w d0
│           0x000003a6      6704           beq.b 0x3ac
│           0x000003a8      61000e66       bsr.w fcn.00001210
│           ; CODE XREFS from fcn.000002f4 @ 0x398(x), 0x3a6(x)
│           0x000003ac      42ac68dc       clr.l 0x68dc(a4)
│           0x000003b0      426c6c14       clr.w 0x6c14(a4)
│           0x000003b4      422f001c       clr.b 0x1c(a7)
│           ; CODE XREFS from fcn.000002f4 @ 0x890(x), 0x8b4(x), 0x8e2(x)
│           0x000003b8      296c68dc68d8   move.l 0x68dc(a4), 0x68d8(a4)
│           0x000003be      422c6874       clr.b 0x6874(a4)
│           0x000003c2      7e00           moveq 0x0, d7
│           0x000003c4      422f0030       clr.b 0x30(a7)
│           0x000003c8      4a6c6c12       tst.w 0x6c12(a4)
│           0x000003cc      672e           beq.b 0x3fc
│           0x000003ce      4a6c6c10       tst.w 0x6c10(a4)
│           0x000003d2      6716           beq.b 0x3ea
│           0x000003d4      202c6c0c       move.l 0x6c0c(a4), d0
│           0x000003d8      222c68d4       move.l 0x68d4(a4), d1
│           0x000003dc      d280           add.l d0, d1
│           0x000003de      242c6c08       move.l 0x6c08(a4), d2
│           0x000003e2      b282           cmp.l d2, d1
│           0x000003e4      6e16           bgt.b 0x3fc
│           0x000003e6      7c01           moveq 0x1, d6
│           0x000003e8      6012           bra.b 0x3fc
│           ; CODE XREF from fcn.000002f4 @ 0x3d2(x)
│           0x000003ea      202c6c0c       move.l 0x6c0c(a4), d0
│           0x000003ee      d0ac68d0       add.l 0x68d0(a4), d0
│           0x000003f2      5280           addq.l 0x1, d0
│           0x000003f4      b0ac6c08       cmp.l 0x6c08(a4), d0
│           0x000003f8      6e02           bgt.b 0x3fc
│           0x000003fa      7c01           moveq 0x1, d6
│           ; CODE XREFS from fcn.000002f4 @ 0x3cc(x), 0x3e4(x), 0x3e8(x), 0x3f8(x)
│           0x000003fc      4a44           tst.w d4
│           0x000003fe      6704           beq.b 0x404
│           0x00000400      610005e4       bsr.w fcn.000009e6
│           ; CODE XREF from fcn.000002f4 @ 0x3fe(x)
│           0x00000404      4a46           tst.w d6
│           0x00000406      6774           beq.b 0x47c
│           0x00000408      4aac68d0       tst.l 0x68d0(a4)
│           0x0000040c      676e           beq.b 0x47c
│           0x0000040e      610004f8       bsr.w fcn.00000908
│           0x00000412      4a6c6c10       tst.w 0x6c10(a4)
│           0x00000416      671e           beq.b 0x436
│           0x00000418      202c6c0c       move.l 0x6c0c(a4), d0
│           0x0000041c      d0ac68d4       add.l 0x68d4(a4), d0
│           0x00000420      5680           addq.l 0x3, d0
│           0x00000422      2f00           move.l d0, -(a7)
│           0x00000424      486c0084       pea.l 0x84(a4)
│           0x00000428      486f003c       pea.l 0x3c(a7)
│           0x0000042c      61003b1e       bsr.w fcn.00003f4c
│           0x00000430      4fef000c       lea.l 0xc(a7), a7
│           0x00000434      601c           bra.b 0x452
│           ; CODE XREF from fcn.000002f4 @ 0x416(x)
│           0x00000436      202c6c0c       move.l 0x6c0c(a4), d0
│           0x0000043a      d0ac68d0       add.l 0x68d0(a4), d0
│           0x0000043e      5680           addq.l 0x3, d0
│           0x00000440      2f00           move.l d0, -(a7)
│           0x00000442      486c008e       pea.l 0x8e(a4)
│           0x00000446      486f003c       pea.l 0x3c(a7)
│           0x0000044a      61003b00       bsr.w fcn.00003f4c
│           0x0000044e      4fef000c       lea.l 0xc(a7), a7
│           ; CODE XREF from fcn.000002f4 @ 0x434(x)
│           0x00000452      41ef0034       lea.l 0x34(a7), a0
│           0x00000456      7000           moveq 0x0, d0
│           0x00000458      61000fc0       bsr.w fcn.0000141a
│           0x0000045c      486f001c       pea.l 0x1c(a7)
│           0x00000460      486c0098       pea.l 0x98(a4)
│           0x00000464      486f003c       pea.l 0x3c(a7)
│           0x00000468      61003ae2       bsr.w fcn.00003f4c
│           0x0000046c      41ef0040       lea.l 0x40(a7), a0
│           0x00000470      7000           moveq 0x0, d0
│           0x00000472      61000fa6       bsr.w fcn.0000141a
│           0x00000476      4fef000c       lea.l 0xc(a7), a7
│           0x0000047a      600a           bra.b 0x486
│           ; CODE XREFS from fcn.000002f4 @ 0x406(x), 0x40c(x)
│           0x0000047c      41ec0114       lea.l 0x114(a4), a0
│           0x00000480      7000           moveq 0x0, d0
│           0x00000482      61000f96       bsr.w fcn.0000141a
│           ; CODE XREFS from fcn.000002f4 @ 0x47a(x), 0x868(x), 0x872(x)
│           0x00000486      102f0030       move.b 0x30(a7), d0
│           0x0000048a      720d           moveq 0xd, d1
│           0x0000048c      b001           cmp.b d1, d0
│           0x0000048e      670003e6       beq.w 0x876
│           0x00000492      7251           moveq 0x51, d1
│           0x00000494      b001           cmp.b d1, d0
│           0x00000496      670003de       beq.w 0x876
│           0x0000049a      7271           moveq 0x71, d1
│           0x0000049c      b001           cmp.b d1, d0
│           0x0000049e      670003d6       beq.w 0x876
│           0x000004a2      41ef001c       lea.l 0x1c(a7), a0
│           0x000004a6      43ef0028       lea.l 0x28(a7), a1
│           ; CODE XREF from fcn.000002f4 @ 0x4ac(x)
│           0x000004aa      12d8           move.b (a0)+, (a1)+
│           0x000004ac      66fc           bne.b 0x4aa
│           0x000004ae      7a00           moveq 0x0, d5
│           0x000004b0      41ec0190       lea.l 0x190(a4), a0
│           0x000004b4      43ef0030       lea.l 0x30(a7), a1
│           0x000004b8      6100154c       bsr.w fcn.00001a06
│           0x000004bc      102f0030       move.b 0x30(a7), d0
│           0x000004c0      4880           ext.w d0
│           0x000004c2      48c0           ext.l d0
│           0x000004c4      5580           subq.l 0x2, d0
│           0x000004c6      673a           beq.b 0x502
│           0x000004c8      5380           subq.l 0x1, d0
│           0x000004ca      67000092       beq.w 0x55e
│           0x000004ce      5380           subq.l 0x1, d0
│           0x000004d0      6700012a       beq.w 0x5fc
│           0x000004d4      5380           subq.l 0x1, d0
│           0x000004d6      6700017e       beq.w 0x656
│           0x000004da      5780           subq.l 0x3, d0
│           0x000004dc      670001da       beq.w 0x6b8
│           0x000004e0      5b80           subq.l 0x5, d0
│           0x000004e2      6700028e       beq.w 0x772
│           0x000004e6      7232           moveq 0x32, d1
│           0x000004e8      9081           sub.l d1, d0
│           0x000004ea      67000286       beq.w 0x772
│           0x000004ee      7212           moveq 0x12, d1
│           0x000004f0      9081           sub.l d1, d0
│           0x000004f2      6700027e       beq.w 0x772
│           0x000004f6      7220           moveq 0x20, d1
│           0x000004f8      9081           sub.l d1, d0
│           0x000004fa      67000276       beq.w 0x772
│           0x000004fe      600001ea       bra.w 0x6ea
│           ; CODE XREF from fcn.000002f4 @ 0x4c6(x)
│           0x00000502      4a6c6c10       tst.w 0x6c10(a4)
│           0x00000506      6700026a       beq.w 0x772
│           0x0000050a      202c68d0       move.l 0x68d0(a4), d0
│           0x0000050e      2200           move.l d0, d1
│           0x00000510      4a81           tst.l d1
│           0x00000512      6a02           bpl.b 0x516
│           0x00000514      5281           addq.l 0x1, d1
│           ; CODE XREF from fcn.000002f4 @ 0x512(x)
│           0x00000516      e281           asr.l 0x1, d1
│           0x00000518      242c68d8       move.l 0x68d8(a4), d2
│           0x0000051c      2602           move.l d2, d3
│           0x0000051e      9681           sub.l d1, d3
│           0x00000520      2f410018       move.l d1, 0x18(a7)
│           0x00000524      7202           moveq 0x2, d1
│           0x00000526      610031fc       bsr.w fcn.00003724
│           0x0000052a      9681           sub.l d1, d3
│           0x0000052c      7001           moveq 0x1, d0
│           0x0000052e      b680           cmp.l d0, d3
│           0x00000530      6d000240       blt.w 0x772
│           0x00000534      202f0018       move.l 0x18(a7), d0
│           0x00000538      d081           add.l d1, d0
│           0x0000053a      91ac68d8       sub.l d0, 0x68d8(a4)
│           0x0000053e      202c68d8       move.l 0x68d8(a4), d0
│           0x00000542      2200           move.l d0, d1
│           0x00000544      e581           asl.l 0x2, d1
│           0x00000546      41ec68e8       lea.l 0x68e8(a4), a0
│           0x0000054a      20301800       move.l (a0, d1.l), d0
│           0x0000054e      41ef001c       lea.l 0x1c(a7), a0
│           0x00000552      610027ec       bsr.w fcn.00002d40
│           0x00000556      2e00           move.l d0, d7
│           0x00000558      7a01           moveq 0x1, d5
│           0x0000055a      60000216       bra.w 0x772
│           ; CODE XREF from fcn.000002f4 @ 0x4ca(x)
│           0x0000055e      4a6c6c10       tst.w 0x6c10(a4)
│           0x00000562      6700020e       beq.w 0x772
│           0x00000566      202c68d8       move.l 0x68d8(a4), d0
│           0x0000056a      4a80           tst.l d0
│           0x0000056c      6f000204       ble.w 0x772
│           0x00000570      222c68d0       move.l 0x68d0(a4), d1
│           0x00000574      2401           move.l d1, d2
│           0x00000576      4a82           tst.l d2
│           0x00000578      6a02           bpl.b 0x57c
│           0x0000057a      5282           addq.l 0x1, d2
│           ; CODE XREF from fcn.000002f4 @ 0x578(x)
│           0x0000057c      e282           asr.l 0x1, d2
│           0x0000057e      2600           move.l d0, d3
│           0x00000580      d682           add.l d2, d3
│           0x00000582      2001           move.l d1, d0
│           0x00000584      7202           moveq 0x2, d1
│           0x00000586      6100319c       bsr.w fcn.00003724
│           0x0000058a      d681           add.l d1, d3
│           0x0000058c      202c68d0       move.l 0x68d0(a4), d0
│           0x00000590      b680           cmp.l d0, d3
│           0x00000592      6f2c           ble.b 0x5c0
│           0x00000594      7601           moveq 0x1, d3
│           0x00000596      b283           cmp.l d3, d1
│           0x00000598      660001d8       bne.w 0x772
│           0x0000059c      d481           add.l d1, d2
│           0x0000059e      222c68d8       move.l 0x68d8(a4), d1
│           0x000005a2      b481           cmp.l d1, d2
│           0x000005a4      660001cc       bne.w 0x772
│           0x000005a8      2400           move.l d0, d2
│           0x000005aa      6a02           bpl.b 0x5ae
│           0x000005ac      5282           addq.l 0x1, d2
│           ; CODE XREF from fcn.000002f4 @ 0x5aa(x)
│           0x000005ae      e282           asr.l 0x1, d2
│           0x000005b0      7202           moveq 0x2, d1
│           0x000005b2      61003170       bsr.w fcn.00003724
│           0x000005b6      d481           add.l d1, d2
│           0x000005b8      5382           subq.l 0x1, d2
│           0x000005ba      d5ac68d8       add.l d2, 0x68d8(a4)
│           0x000005be      601c           bra.b 0x5dc
│           ; CODE XREF from fcn.000002f4 @ 0x592(x)
│           0x000005c0      2200           move.l d0, d1
│           0x000005c2      6a02           bpl.b 0x5c6
│           0x000005c4      5281           addq.l 0x1, d1
│           ; CODE XREF from fcn.000002f4 @ 0x5c2(x)
│           0x000005c6      e281           asr.l 0x1, d1
│           0x000005c8      2f410018       move.l d1, 0x18(a7)
│           0x000005cc      7202           moveq 0x2, d1
│           0x000005ce      61003154       bsr.w fcn.00003724
│           0x000005d2      202f0018       move.l 0x18(a7), d0
│           0x000005d6      d081           add.l d1, d0
│           0x000005d8      d1ac68d8       add.l d0, 0x68d8(a4)
│           ; CODE XREF from fcn.000002f4 @ 0x5be(x)
│           0x000005dc      202c68d8       move.l 0x68d8(a4), d0
│           0x000005e0      2200           move.l d0, d1
│           0x000005e2      e581           asl.l 0x2, d1
│           0x000005e4      41ec68e8       lea.l 0x68e8(a4), a0
│           0x000005e8      20301800       move.l (a0, d1.l), d0
│           0x000005ec      41ef001c       lea.l 0x1c(a7), a0
│           0x000005f0      6100274e       bsr.w fcn.00002d40
│           0x000005f4      2e00           move.l d0, d7
│           0x000005f6      7a01           moveq 0x1, d5
│           0x000005f8      60000178       bra.w 0x772
│           ; CODE XREF from fcn.000002f4 @ 0x4d0(x)
│           0x000005fc      202c68d8       move.l 0x68d8(a4), d0
│           0x00000600      7201           moveq 0x1, d1
│           0x00000602      b081           cmp.l d1, d0
│           0x00000604      6f00016c       ble.w 0x772
│           0x00000608      4a6c6c10       tst.w 0x6c10(a4)
│           0x0000060c      6724           beq.b 0x632
│           0x0000060e      242c68d0       move.l 0x68d0(a4), d2
│           0x00000612      2602           move.l d2, d3
│           0x00000614      4a83           tst.l d3
│           0x00000616      6a02           bpl.b 0x61a
│           0x00000618      5283           addq.l 0x1, d3
│           ; CODE XREF from fcn.000002f4 @ 0x616(x)
│           0x0000061a      e283           asr.l 0x1, d3
│           0x0000061c      2002           move.l d2, d0
│           0x0000061e      7202           moveq 0x2, d1
│           0x00000620      61003102       bsr.w fcn.00003724
│           0x00000624      d681           add.l d1, d3
│           0x00000626      5283           addq.l 0x1, d3
│           0x00000628      202c68d8       move.l 0x68d8(a4), d0
│           0x0000062c      b680           cmp.l d0, d3
│           0x0000062e      67000142       beq.w 0x772
│           ; CODE XREF from fcn.000002f4 @ 0x60c(x)
│           0x00000632      53ac68d8       subq.l 0x1, 0x68d8(a4)
│           0x00000636      202c68d8       move.l 0x68d8(a4), d0
│           0x0000063a      2200           move.l d0, d1
│           0x0000063c      e581           asl.l 0x2, d1
│           0x0000063e      41ec68e8       lea.l 0x68e8(a4), a0
│           0x00000642      20301800       move.l (a0, d1.l), d0
│           0x00000646      41ef001c       lea.l 0x1c(a7), a0
│           0x0000064a      610026f4       bsr.w fcn.00002d40
│           0x0000064e      2e00           move.l d0, d7
│           0x00000650      7a01           moveq 0x1, d5
│           0x00000652      6000011e       bra.w 0x772
│           ; CODE XREF from fcn.000002f4 @ 0x4d6(x)
│           0x00000656      202c68d0       move.l 0x68d0(a4), d0
│           0x0000065a      222c68d8       move.l 0x68d8(a4), d1
│           0x0000065e      b280           cmp.l d0, d1
│           0x00000660      6c000110       bge.w 0x772
│           0x00000664      4a6c6c10       tst.w 0x6c10(a4)
│           0x00000668      671a           beq.b 0x684
│           0x0000066a      2400           move.l d0, d2
│           0x0000066c      6a02           bpl.b 0x670
│           0x0000066e      5282           addq.l 0x1, d2
│           ; CODE XREF from fcn.000002f4 @ 0x66c(x)
│           0x00000670      e282           asr.l 0x1, d2
│           0x00000672      7202           moveq 0x2, d1
│           0x00000674      610030ae       bsr.w fcn.00003724
│           0x00000678      d481           add.l d1, d2
│           0x0000067a      202c68d8       move.l 0x68d8(a4), d0
│           0x0000067e      b480           cmp.l d0, d2
│           0x00000680      670000f0       beq.w 0x772
│           ; CODE XREF from fcn.000002f4 @ 0x668(x)
│           0x00000684      52ac68d8       addq.l 0x1, 0x68d8(a4)
│           0x00000688      202c68d0       move.l 0x68d0(a4), d0
│           0x0000068c      222c68d8       move.l 0x68d8(a4), d1
│           0x00000690      b280           cmp.l d0, d1
│           0x00000692      6f04           ble.b 0x698
│           0x00000694      294068d8       move.l d0, 0x68d8(a4)
│           ; CODE XREF from fcn.000002f4 @ 0x692(x)
│           0x00000698      202c68d8       move.l 0x68d8(a4), d0
│           0x0000069c      2200           move.l d0, d1
│           0x0000069e      e581           asl.l 0x2, d1
│           0x000006a0      41ec68e8       lea.l 0x68e8(a4), a0
│           0x000006a4      20301800       move.l (a0, d1.l), d0
│           0x000006a8      41ef001c       lea.l 0x1c(a7), a0
│           0x000006ac      61002692       bsr.w fcn.00002d40
│           0x000006b0      2e00           move.l d0, d7
│           0x000006b2      7a01           moveq 0x1, d5
│           0x000006b4      600000bc       bra.w 0x772
│           ; CODE XREF from fcn.000002f4 @ 0x4dc(x)
│           0x000006b8      4a87           tst.l d7
│           0x000006ba      6f0000b6       ble.w 0x772
│           0x000006be      5387           subq.l 0x1, d7
│           0x000006c0      4237781c       clr.b 0x1c(a7, d7.l)
│           0x000006c4      4a87           tst.l d7
│           0x000006c6      6f18           ble.b 0x6e0
│           0x000006c8      41ef001c       lea.l 0x1c(a7), a0
│           0x000006cc      61003812       bsr.w fcn.00003ee0
│           0x000006d0      2200           move.l d0, d1
│           0x000006d2      e581           asl.l 0x2, d1
│           0x000006d4      41ec6a78       lea.l 0x6a78(a4), a0
│           0x000006d8      2970180068d8   move.l (a0, d1.l), 0x68d8(a4)
│           0x000006de      6004           bra.b 0x6e4
│           ; CODE XREF from fcn.000002f4 @ 0x6c6(x)
│           0x000006e0      42ac68d8       clr.l 0x68d8(a4)
│           ; CODE XREF from fcn.000002f4 @ 0x6de(x)
│           0x000006e4      7a01           moveq 0x1, d5
│           0x000006e6      6000008a       bra.w 0x772
│           ; CODE XREF from fcn.000002f4 @ 0x4fe(x)
│           0x000006ea      202c68d0       move.l 0x68d0(a4), d0
│           0x000006ee      4a80           tst.l d0
│           0x000006f0      6f000080       ble.w 0x772
│           0x000006f4      1faf0030781c   move.b 0x30(a7), 0x1c(a7, d7.l)
│           0x000006fa      4237781d       clr.b 0x1d(a7, d7.l)
│           0x000006fe      41ef001c       lea.l 0x1c(a7), a0
│           0x00000702      610037dc       bsr.w fcn.00003ee0
│           0x00000706      294068e0       move.l d0, 0x68e0(a4)
│           0x0000070a      41ef001c       lea.l 0x1c(a7), a0
│           0x0000070e      610037d0       bsr.w fcn.00003ee0
│           0x00000712      2200           move.l d0, d1
│           0x00000714      e581           asl.l 0x2, d1
│           0x00000716      41ec6a78       lea.l 0x6a78(a4), a0
│           0x0000071a      2970180068d8   move.l (a0, d1.l), 0x68d8(a4)
│           0x00000720      7002           moveq 0x2, d0
│           0x00000722      be80           cmp.l d0, d7
│           0x00000724      6e32           bgt.b 0x758
│           0x00000726      202c68e0       move.l 0x68e0(a4), d0
│           0x0000072a      4a80           tst.l d0
│           0x0000072c      6f2a           ble.b 0x758
│           0x0000072e      b0ac68cc       cmp.l 0x68cc(a4), d0
│           0x00000732      6e24           bgt.b 0x758
│           0x00000734      102f0030       move.b 0x30(a7), d0
│           0x00000738      4880           ext.w d0
│           0x0000073a      48c0           ext.l d0
│           0x0000073c      41ec0741       lea.l 0x741(a4), a0
│           0x00000740      083000020800   btst.b 0x2, (a0, d0.l)
│           0x00000746      6710           beq.b 0x758
│           0x00000748      102f001c       move.b 0x1c(a7), d0
│           0x0000074c      7230           moveq 0x30, d1
│           0x0000074e      b001           cmp.b d1, d0
│           0x00000750      6706           beq.b 0x758
│           0x00000752      5287           addq.l 0x1, d7
│           0x00000754      7a01           moveq 0x1, d5
│           0x00000756      601a           bra.b 0x772
│           ; CODE XREFS from fcn.000002f4 @ 0x724(x), 0x72c(x), 0x732(x), 0x746(x), 0x750(x)
│           0x00000758      4237781c       clr.b 0x1c(a7, d7.l)
│           0x0000075c      41ef001c       lea.l 0x1c(a7), a0
│           0x00000760      6100377e       bsr.w fcn.00003ee0
│           0x00000764      2200           move.l d0, d1
│           0x00000766      e581           asl.l 0x2, d1
│           0x00000768      41ec6a78       lea.l 0x6a78(a4), a0
│           0x0000076c      2970180068d8   move.l (a0, d1.l), 0x68d8(a4)
│           ; XREFS(22)
│           0x00000772      4a45           tst.w d5
│           0x00000774      670000ea       beq.w 0x860
│           0x00000778      4a46           tst.w d6
│           0x0000077a      67000094       beq.w 0x810
│           0x0000077e      202c68d8       move.l 0x68d8(a4), d0
│           0x00000782      4a80           tst.l d0
│           0x00000784      6b1c           bmi.b 0x7a2
│           0x00000786      102c6874       move.b 0x6874(a4), d0
│           0x0000078a      4a00           tst.b d0
│           0x0000078c      6714           beq.b 0x7a2
│           0x0000078e      41ec6874       lea.l 0x6874(a4), a0
│           0x00000792      7000           moveq 0x0, d0
│           0x00000794      61000c84       bsr.w fcn.0000141a
│           0x00000798      41ec0192       lea.l 0x192(a4), a0
│           0x0000079c      7000           moveq 0x0, d0
│           0x0000079e      61000c7a       bsr.w fcn.0000141a
│           ; CODE XREFS from fcn.000002f4 @ 0x784(x), 0x78c(x)
│           0x000007a2      61000164       bsr.w fcn.00000908
│           0x000007a6      4a6c6c10       tst.w 0x6c10(a4)
│           0x000007aa      671e           beq.b 0x7ca
│           0x000007ac      202c6c0c       move.l 0x6c0c(a4), d0
│           0x000007b0      d0ac68d4       add.l 0x68d4(a4), d0
│           0x000007b4      5680           addq.l 0x3, d0
│           0x000007b6      2f00           move.l d0, -(a7)
│           0x000007b8      486c01a2       pea.l 0x1a2(a4)
│           0x000007bc      486f003c       pea.l 0x3c(a7)
│           0x000007c0      6100378a       bsr.w fcn.00003f4c
│           0x000007c4      4fef000c       lea.l 0xc(a7), a7
│           0x000007c8      601c           bra.b 0x7e6
│           ; CODE XREF from fcn.000002f4 @ 0x7aa(x)
│           0x000007ca      202c6c0c       move.l 0x6c0c(a4), d0
│           0x000007ce      d0ac68d0       add.l 0x68d0(a4), d0
│           0x000007d2      5680           addq.l 0x3, d0
│           0x000007d4      2f00           move.l d0, -(a7)
│           0x000007d6      486c01ac       pea.l 0x1ac(a4)
│           0x000007da      486f003c       pea.l 0x3c(a7)
│           0x000007de      6100376c       bsr.w fcn.00003f4c
│           0x000007e2      4fef000c       lea.l 0xc(a7), a7
│           ; CODE XREF from fcn.000002f4 @ 0x7c8(x)
│           0x000007e6      41ef0034       lea.l 0x34(a7), a0
│           0x000007ea      7000           moveq 0x0, d0
│           0x000007ec      61000c2c       bsr.w fcn.0000141a
│           0x000007f0      486f001c       pea.l 0x1c(a7)
│           0x000007f4      486c01b6       pea.l 0x1b6(a4)
│           0x000007f8      486f003c       pea.l 0x3c(a7)
│           0x000007fc      6100374e       bsr.w fcn.00003f4c
│           0x00000800      41ef0040       lea.l 0x40(a7), a0
│           0x00000804      7000           moveq 0x0, d0
│           0x00000806      61000c12       bsr.w fcn.0000141a
│           0x0000080a      4fef000c       lea.l 0xc(a7), a7
│           0x0000080e      6050           bra.b 0x860
│           ; CODE XREF from fcn.000002f4 @ 0x77a(x)
│           0x00000810      102f0028       move.b 0x28(a7), d0
│           0x00000814      4a00           tst.b d0
│           0x00000816      672a           beq.b 0x842
│           0x00000818      41ef0028       lea.l 0x28(a7), a0
│           0x0000081c      2248           movea.l a0, a1
│           ; CODE XREF from fcn.000002f4 @ 0x820(x)
│           0x0000081e      4a19           tst.b (a1)+
│           0x00000820      66fc           bne.b 0x81e
│           0x00000822      5389           subq.l 0x1, a1
│           0x00000824      93c8           suba.l a0, a1
│           0x00000826      2f09           move.l a1, -(a7)
│           0x00000828      486c0232       pea.l 0x232(a4)
│           0x0000082c      486f003c       pea.l 0x3c(a7)
│           0x00000830      6100371a       bsr.w fcn.00003f4c
│           0x00000834      41ef0040       lea.l 0x40(a7), a0
│           0x00000838      7000           moveq 0x0, d0
│           0x0000083a      61000bde       bsr.w fcn.0000141a
│           0x0000083e      4fef000c       lea.l 0xc(a7), a7
│           ; CODE XREF from fcn.000002f4 @ 0x816(x)
│           0x00000842      486f001c       pea.l 0x1c(a7)
│           0x00000846      486c0238       pea.l 0x238(a4)
│           0x0000084a      486f003c       pea.l 0x3c(a7)
│           0x0000084e      610036fc       bsr.w fcn.00003f4c
│           0x00000852      41ef0040       lea.l 0x40(a7), a0
│           0x00000856      7000           moveq 0x0, d0
│           0x00000858      61000bc0       bsr.w fcn.0000141a
│           0x0000085c      4fef000c       lea.l 0xc(a7), a7
│           ; CODE XREFS from fcn.000002f4 @ 0x774(x), 0x80e(x)
│           0x00000860      102f0030       move.b 0x30(a7), d0
│           0x00000864      723f           moveq 0x3f, d1
│           0x00000866      b001           cmp.b d1, d0
│           0x00000868      6600fc1c       bne.w 0x486
│           0x0000086c      102f001c       move.b 0x1c(a7), d0
│           0x00000870      4a00           tst.b d0
│           0x00000872      6600fc12       bne.w 0x486
│           ; CODE XREFS from fcn.000002f4 @ 0x48e(x), 0x496(x), 0x49e(x)
│           0x00000876      4237781c       clr.b 0x1c(a7, d7.l)
│           0x0000087a      41ef001c       lea.l 0x1c(a7), a0
│           0x0000087e      61003660       bsr.w fcn.00003ee0
│           0x00000882      294068e0       move.l d0, 0x68e0(a4)
│           0x00000886      7801           moveq 0x1, d4
│           0x00000888      102f0030       move.b 0x30(a7), d0
│           0x0000088c      723f           moveq 0x3f, d1
│           0x0000088e      b001           cmp.b d1, d0
│           0x00000890      6700fb26       beq.w 0x3b8
│           0x00000894      4aac68e0       tst.l 0x68e0(a4)
│           0x00000898      674c           beq.b 0x8e6
│           0x0000089a      7251           moveq 0x51, d1
│           0x0000089c      b001           cmp.b d1, d0
│           0x0000089e      6746           beq.b 0x8e6
│           0x000008a0      7271           moveq 0x71, d1
│           0x000008a2      b001           cmp.b d1, d0
│           0x000008a4      6740           beq.b 0x8e6
│           0x000008a6      61000486       bsr.w fcn.00000d2e
│           0x000008aa      4a40           tst.w d0
│           0x000008ac      670a           beq.b 0x8b8
│           0x000008ae      296c68d868dc   move.l 0x68d8(a4), 0x68dc(a4)
│           0x000008b4      6000fb02       bra.w 0x3b8
│           ; CODE XREF from fcn.000002f4 @ 0x8ac(x)
│           0x000008b8      4a46           tst.w d6
│           0x000008ba      671c           beq.b 0x8d8
│           0x000008bc      102c6874       move.b 0x6874(a4), d0
│           0x000008c0      4a00           tst.b d0
│           0x000008c2      6714           beq.b 0x8d8
│           0x000008c4      41ec6874       lea.l 0x6874(a4), a0
│           0x000008c8      7000           moveq 0x0, d0
│           0x000008ca      61000b4e       bsr.w fcn.0000141a
│           0x000008ce      41ec0248       lea.l 0x248(a4), a0
│           0x000008d2      7000           moveq 0x0, d0
│           0x000008d4      61000b44       bsr.w fcn.0000141a
│           ; CODE XREFS from fcn.000002f4 @ 0x8ba(x), 0x8c2(x)
│           0x000008d8      422f001c       clr.b 0x1c(a7)
│           0x000008dc      42ac68dc       clr.l 0x68dc(a4)
│           0x000008e0      7800           moveq 0x0, d4
│           0x000008e2      6000fad4       bra.w 0x3b8
│           ; CODE XREFS from fcn.000002f4 @ 0x898(x), 0x89e(x), 0x8a4(x)
│           0x000008e6      41ec0258       lea.l 0x258(a4), a0
│           0x000008ea      7001           moveq 0x1, d0
│           0x000008ec      61000b2c       bsr.w fcn.0000141a
│           0x000008f0      41ec025a       lea.l 0x25a(a4), a0
│           0x000008f4      7001           moveq 0x1, d0
│           0x000008f6      61000b22       bsr.w fcn.0000141a
│           0x000008fa      61000914       bsr.w fcn.00001210
│           0x000008fe      4cdf00fc       movem.l (a7)+, d2-d7
│           0x00000902      defc00e4       adda.w 0xe4, a7
└           0x00000906      4e75           rts
            ; CALL XREFS from fcn.000002f4 @ 0x40e(x), 0x7a2(x)
┌ 222: fcn.00000908 ();
│           0x00000908      9efc00c8       suba.w 0xc8, a7
│           0x0000090c      4a6c6c10       tst.w 0x6c10(a4)
│           0x00000910      67000090       beq.w 0x9a2
│           0x00000914      202c68d8       move.l 0x68d8(a4), d0
│           0x00000918      b0ac68d4       cmp.l 0x68d4(a4), d0
│           0x0000091c      6e3c           bgt.b 0x95a
│           0x0000091e      7201           moveq 0x1, d1
│           0x00000920      b2ac68cc       cmp.l 0x68cc(a4), d1
│           0x00000924      661a           bne.b 0x940
│           0x00000926      222c6c0c       move.l 0x6c0c(a4), d1
│           0x0000092a      d280           add.l d0, d1
│           0x0000092c      2f01           move.l d1, -(a7)
│           0x0000092e      486c025c       pea.l 0x25c(a4)
│           0x00000932      486f0008       pea.l 0x8(a7)
│           0x00000936      61003614       bsr.w fcn.00003f4c
│           0x0000093a      4fef000c       lea.l 0xc(a7), a7
│           0x0000093e      607c           bra.b 0x9bc
│           ; CODE XREF from fcn.00000908 @ 0x924(x)
│           0x00000940      222c6c0c       move.l 0x6c0c(a4), d1
│           0x00000944      d280           add.l d0, d1
│           0x00000946      2f01           move.l d1, -(a7)
│           0x00000948      486c026a       pea.l 0x26a(a4)
│           0x0000094c      486f0008       pea.l 0x8(a7)
│           0x00000950      610035fa       bsr.w fcn.00003f4c
│           0x00000954      4fef000c       lea.l 0xc(a7), a7
│           0x00000958      6062           bra.b 0x9bc
│           ; CODE XREF from fcn.00000908 @ 0x91c(x)
│           0x0000095a      7001           moveq 0x1, d0
│           0x0000095c      b0ac68cc       cmp.l 0x68cc(a4), d0
│           0x00000960      6620           bne.b 0x982
│           0x00000962      202c6c0c       move.l 0x6c0c(a4), d0
│           0x00000966      d0ac68d8       add.l 0x68d8(a4), d0
│           0x0000096a      90ac68d4       sub.l 0x68d4(a4), d0
│           0x0000096e      2f00           move.l d0, -(a7)
│           0x00000970      486c0274       pea.l 0x274(a4)
│           0x00000974      486f0008       pea.l 0x8(a7)
│           0x00000978      610035d2       bsr.w fcn.00003f4c
│           0x0000097c      4fef000c       lea.l 0xc(a7), a7
│           0x00000980      603a           bra.b 0x9bc
│           ; CODE XREF from fcn.00000908 @ 0x960(x)
│           0x00000982      202c6c0c       move.l 0x6c0c(a4), d0
│           0x00000986      d0ac68d8       add.l 0x68d8(a4), d0
│           0x0000098a      90ac68d4       sub.l 0x68d4(a4), d0
│           0x0000098e      2f00           move.l d0, -(a7)
│           0x00000990      486c0282       pea.l 0x282(a4)
│           0x00000994      486f0008       pea.l 0x8(a7)
│           0x00000998      610035b2       bsr.w fcn.00003f4c
│           0x0000099c      4fef000c       lea.l 0xc(a7), a7
│           0x000009a0      601a           bra.b 0x9bc
│           ; CODE XREF from fcn.00000908 @ 0x910(x)
│           0x000009a2      202c6c0c       move.l 0x6c0c(a4), d0
│           0x000009a6      d0ac68d8       add.l 0x68d8(a4), d0
│           0x000009aa      2f00           move.l d0, -(a7)
│           0x000009ac      486c0290       pea.l 0x290(a4)
│           0x000009b0      486f0008       pea.l 0x8(a7)
│           0x000009b4      61003596       bsr.w fcn.00003f4c
│           0x000009b8      4fef000c       lea.l 0xc(a7), a7
│           ; CODE XREFS from fcn.00000908 @ 0x93e(x), 0x958(x), 0x980(x), 0x9a0(x)
│           0x000009bc      202c68d8       move.l 0x68d8(a4), d0
│           0x000009c0      4a80           tst.l d0
│           0x000009c2      6f1c           ble.b 0x9e0
│           0x000009c4      41d7           lea.l (a7), a0
│           0x000009c6      7000           moveq 0x0, d0
│           0x000009c8      61000a50       bsr.w fcn.0000141a
│           0x000009cc      41ec029e       lea.l 0x29e(a4), a0
│           0x000009d0      7000           moveq 0x0, d0
│           0x000009d2      61000a46       bsr.w fcn.0000141a
│           0x000009d6      41d7           lea.l (a7), a0
│           0x000009d8      43ec6874       lea.l 0x6874(a4), a1
│           ; CODE XREF from fcn.00000908 @ 0x9de(x)
│           0x000009dc      12d8           move.b (a0)+, (a1)+
│           0x000009de      66fc           bne.b 0x9dc
│           ; CODE XREF from fcn.00000908 @ 0x9c2(x)
│           0x000009e0      defc00c8       adda.w 0xc8, a7
└           0x000009e4      4e75           rts
            ; CALL XREF from fcn.000002f4 @ 0x400(x)
┌ 840: fcn.000009e6 ();
│           0x000009e6      9efc01c0       suba.w 0x1c0, a7
│           0x000009ea      48e72700       movem.l d2/d5-d7, -(a7)
│           0x000009ee      41ec02ad       lea.l 0x2ad(a4), a0
│           0x000009f2      43ef0017       lea.l 0x17(a7), a1
│           0x000009f6      7028           moveq 0x28, d0
│           ; CODE XREF from fcn.000009e6 @ 0x9fa(x)
│           0x000009f8      12d8           move.b (a0)+, (a1)+
│           0x000009fa      51c8fffc       dbra d0, 0x9f8
│           0x000009fe      7001           moveq 0x1, d0
│           0x00000a00      223c0000020d   move.l 0x20d, d1
│           0x00000a06      61000f5c       bsr.w fcn.00001964
│           0x00000a0a      41ec02d6       lea.l 0x2d6(a4), a0
│           0x00000a0e      7000           moveq 0x0, d0
│           0x00000a10      61000a08       bsr.w fcn.0000141a
│           0x00000a14      7e00           moveq 0x0, d7
│           ; CODE XREF from fcn.000009e6 @ 0xa42(x)
│           0x00000a16      2007           move.l d7, d0
│           0x00000a18      e580           asl.l 0x2, d0
│           0x00000a1a      9087           sub.l d7, d0
│           0x00000a1c      e780           asl.l 0x3, d0
│           0x00000a1e      d087           add.l d7, d0
│           0x00000a20      e780           asl.l 0x3, d0
│           0x00000a22      41ec58d4       lea.l 0x58d4(a4), a0
│           0x00000a26      4a300800       tst.b (a0, d0.l)
│           0x00000a2a      6718           beq.b 0xa44
│           0x00000a2c      2007           move.l d7, d0
│           0x00000a2e      e580           asl.l 0x2, d0
│           0x00000a30      9087           sub.l d7, d0
│           0x00000a32      e780           asl.l 0x3, d0
│           0x00000a34      d087           add.l d7, d0
│           0x00000a36      e780           asl.l 0x3, d0
│           0x00000a38      d1c0           adda.l d0, a0
│           0x00000a3a      7001           moveq 0x1, d0
│           0x00000a3c      610009dc       bsr.w fcn.0000141a
│           0x00000a40      5287           addq.l 0x1, d7
│           0x00000a42      60d2           bra.b 0xa16
│           ; CODE XREF from fcn.000009e6 @ 0xa2a(x)
│           0x00000a44      7e00           moveq 0x0, d7
│           ; CODE XREF from fcn.000009e6 @ 0xa6e(x)
│           0x00000a46      41ef0017       lea.l 0x17(a7), a0
│           0x00000a4a      2248           movea.l a0, a1
│           ; CODE XREF from fcn.000009e6 @ 0xa4e(x)
│           0x00000a4c      4a19           tst.b (a1)+
│           0x00000a4e      66fc           bne.b 0xa4c
│           0x00000a50      5389           subq.l 0x1, a1
│           0x00000a52      93c8           suba.l a0, a1
│           0x00000a54      be89           cmp.l a1, d7
│           0x00000a56      6418           bcc.b 0xa70
│           0x00000a58      706b           moveq 0x6b, d0
│           0x00000a5a      d080           add.l d0, d0
│           0x00000a5c      9087           sub.l d7, d0
│           0x00000a5e      7200           moveq 0x0, d1
│           0x00000a60      12377817       move.b 0x17(a7, d7.l), d1
│           0x00000a64      2401           move.l d1, d2
│           0x00000a66      d480           add.l d0, d2
│           0x00000a68      1f827817       move.b d2, 0x17(a7, d7.l)
│           0x00000a6c      5287           addq.l 0x1, d7
│           0x00000a6e      60d6           bra.b 0xa46
│           ; CODE XREF from fcn.000009e6 @ 0xa56(x)
│           0x00000a70      4aac68d0       tst.l 0x68d0(a4)
│           0x00000a74      660e           bne.b 0xa84
│           0x00000a76      41ec02de       lea.l 0x2de(a4), a0
│           0x00000a7a      7001           moveq 0x1, d0
│           0x00000a7c      6100099c       bsr.w fcn.0000141a
│           0x00000a80      60000278       bra.w 0xcfa
│           ; CODE XREF from fcn.000009e6 @ 0xa74(x)
│           0x00000a84      302c6c10       move.w 0x6c10(a4), d0
│           0x00000a88      660000c4       bne.w 0xb4e
│           0x00000a8c      7001           moveq 0x1, d0
│           0x00000a8e      294068c8       move.l d0, 0x68c8(a4)
│           ; CODE XREF from fcn.000009e6 @ 0xb4a(x)
│           0x00000a92      202c68c8       move.l 0x68c8(a4), d0
│           0x00000a96      b0ac68cc       cmp.l 0x68cc(a4), d0
│           0x00000a9a      6e00025e       bgt.w 0xcfa
│           0x00000a9e      222c68e4       move.l 0x68e4(a4), d1
│           0x00000aa2      2401           move.l d1, d2
│           0x00000aa4      e582           asl.l 0x2, d2
│           0x00000aa6      9481           sub.l d1, d2
│           0x00000aa8      e782           asl.l 0x3, d2
│           0x00000aaa      d481           add.l d1, d2
│           0x00000aac      e582           asl.l 0x2, d2
│           0x00000aae      41ec31c4       lea.l 0x31c4(a4), a0
│           0x00000ab2      d1c2           adda.l d2, a0
│           0x00000ab4      d1c0           adda.l d0, a0
│           0x00000ab6      7258           moveq 0x58, d1
│           0x00000ab8      b210           cmp.b (a0), d1
│           0x00000aba      6600008a       bne.w 0xb46
│           0x00000abe      2200           move.l d0, d1
│           0x00000ac0      e581           asl.l 0x2, d1
│           0x00000ac2      9280           sub.l d0, d1
│           0x00000ac4      e781           asl.l 0x3, d1
│           0x00000ac6      d280           add.l d0, d1
│           0x00000ac8      e581           asl.l 0x2, d1
│           0x00000aca      41ec0ab4       lea.l 0xab4(a4), a0
│           0x00000ace      d1c1           adda.l d1, a0
│           0x00000ad0      2248           movea.l a0, a1
│           ; CODE XREF from fcn.000009e6 @ 0xad4(x)
│           0x00000ad2      4a19           tst.b (a1)+
│           0x00000ad4      66fc           bne.b 0xad2
│           0x00000ad6      5389           subq.l 0x1, a1
│           0x00000ad8      93c8           suba.l a0, a1
│           0x00000ada      2a09           move.l a1, d5
│           0x00000adc      7c00           moveq 0x0, d6
│           ; CODE XREF from fcn.000009e6 @ 0xaf4(x)
│           0x00000ade      7027           moveq 0x27, d0
│           0x00000ae0      9085           sub.l d5, d0
│           0x00000ae2      5380           subq.l 0x1, d0
│           0x00000ae4      bc80           cmp.l d0, d6
│           0x00000ae6      6c0e           bge.b 0xaf6
│           0x00000ae8      41ef0108       lea.l 0x108(a7), a0
│           0x00000aec      d1c6           adda.l d6, a0
│           0x00000aee      10bc002e       move.b 0x2e, (a0)
│           0x00000af2      5286           addq.l 0x1, d6
│           0x00000af4      60e8           bra.b 0xade
│           ; CODE XREF from fcn.000009e6 @ 0xae6(x)
│           0x00000af6      41ef0108       lea.l 0x108(a7), a0
│           0x00000afa      2248           movea.l a0, a1
│           0x00000afc      d3c6           adda.l d6, a1
│           0x00000afe      12bc0020       move.b 0x20, (a1)
│           0x00000b02      43ef0109       lea.l 0x109(a7), a1
│           0x00000b06      d3c6           adda.l d6, a1
│           0x00000b08      4211           clr.b (a1)
│           0x00000b0a      202c68c8       move.l 0x68c8(a4), d0
│           0x00000b0e      2200           move.l d0, d1
│           0x00000b10      e581           asl.l 0x2, d1
│           0x00000b12      9280           sub.l d0, d1
│           0x00000b14      e781           asl.l 0x3, d1
│           0x00000b16      d280           add.l d0, d1
│           0x00000b18      e581           asl.l 0x2, d1
│           0x00000b1a      43ec0ab4       lea.l 0xab4(a4), a1
│           0x00000b1e      d3c1           adda.l d1, a1
│           0x00000b20      6100309e       bsr.w fcn.00003bc0
│           0x00000b24      486f0108       pea.l 0x108(a7)
│           0x00000b28      2f2c68c8       move.l 0x68c8(a4), -(a7)
│           0x00000b2c      486c0322       pea.l 0x322(a4)
│           0x00000b30      486f004c       pea.l 0x4c(a7)
│           0x00000b34      61003416       bsr.w fcn.00003f4c
│           0x00000b38      41ef0050       lea.l 0x50(a7), a0
│           0x00000b3c      7001           moveq 0x1, d0
│           0x00000b3e      610008da       bsr.w fcn.0000141a
│           0x00000b42      4fef0010       lea.l 0x10(a7), a7
│           ; CODE XREF from fcn.000009e6 @ 0xaba(x)
│           0x00000b46      52ac68c8       addq.l 0x1, 0x68c8(a4)
│           0x00000b4a      6000ff46       bra.w 0xa92
│           ; CODE XREF from fcn.000009e6 @ 0xa88(x)
│           0x00000b4e      202c68d0       move.l 0x68d0(a4), d0
│           0x00000b52      2200           move.l d0, d1
│           0x00000b54      4a81           tst.l d1
│           0x00000b56      6a02           bpl.b 0xb5a
│           0x00000b58      5281           addq.l 0x1, d1
│           ; CODE XREF from fcn.000009e6 @ 0xb56(x)
│           0x00000b5a      e281           asr.l 0x1, d1
│           0x00000b5c      2f410010       move.l d1, 0x10(a7)
│           0x00000b60      7202           moveq 0x2, d1
│           0x00000b62      61002bc0       bsr.w fcn.00003724
│           0x00000b66      202f0010       move.l 0x10(a7), d0
│           0x00000b6a      d081           add.l d1, d0
│           0x00000b6c      294068d4       move.l d0, 0x68d4(a4)
│           0x00000b70      7e01           moveq 0x1, d7
│           ; CODE XREF from fcn.000009e6 @ 0xcde(x)
│           0x00000b72      beac68d4       cmp.l 0x68d4(a4), d7
│           0x00000b76      6e00016a       bgt.w 0xce2
│           0x00000b7a      2007           move.l d7, d0
│           0x00000b7c      e580           asl.l 0x2, d0
│           0x00000b7e      41ec68e8       lea.l 0x68e8(a4), a0
│           0x00000b82      22300800       move.l (a0, d0.l), d1
│           0x00000b86      2401           move.l d1, d2
│           0x00000b88      e582           asl.l 0x2, d2
│           0x00000b8a      9481           sub.l d1, d2
│           0x00000b8c      e782           asl.l 0x3, d2
│           0x00000b8e      d481           add.l d1, d2
│           0x00000b90      e582           asl.l 0x2, d2
│           0x00000b92      41ec0ab4       lea.l 0xab4(a4), a0
│           0x00000b96      d1c2           adda.l d2, a0
│           0x00000b98      2248           movea.l a0, a1
│           ; CODE XREF from fcn.000009e6 @ 0xb9c(x)
│           0x00000b9a      4a19           tst.b (a1)+
│           0x00000b9c      66fc           bne.b 0xb9a
│           0x00000b9e      5389           subq.l 0x1, a1
│           0x00000ba0      93c8           suba.l a0, a1
│           0x00000ba2      2a09           move.l a1, d5
│           0x00000ba4      7c00           moveq 0x0, d6
│           ; CODE XREF from fcn.000009e6 @ 0xbbc(x)
│           0x00000ba6      701f           moveq 0x1f, d0
│           0x00000ba8      9085           sub.l d5, d0
│           0x00000baa      5380           subq.l 0x1, d0
│           0x00000bac      bc80           cmp.l d0, d6
│           0x00000bae      6c0e           bge.b 0xbbe
│           0x00000bb0      41ef0108       lea.l 0x108(a7), a0
│           0x00000bb4      d1c6           adda.l d6, a0
│           0x00000bb6      10bc002e       move.b 0x2e, (a0)
│           0x00000bba      5286           addq.l 0x1, d6
│           0x00000bbc      60e8           bra.b 0xba6
│           ; CODE XREF from fcn.000009e6 @ 0xbae(x)
│           0x00000bbe      41ef0108       lea.l 0x108(a7), a0
│           0x00000bc2      2248           movea.l a0, a1
│           0x00000bc4      d3c6           adda.l d6, a1
│           0x00000bc6      12bc0020       move.b 0x20, (a1)
│           0x00000bca      43ef0109       lea.l 0x109(a7), a1
│           0x00000bce      d3c6           adda.l d6, a1
│           0x00000bd0      4211           clr.b (a1)
│           0x00000bd2      2007           move.l d7, d0
│           0x00000bd4      e580           asl.l 0x2, d0
│           0x00000bd6      43ec68e8       lea.l 0x68e8(a4), a1
│           0x00000bda      22310800       move.l (a1, d0.l), d1
│           0x00000bde      2401           move.l d1, d2
│           0x00000be0      e582           asl.l 0x2, d2
│           0x00000be2      9481           sub.l d1, d2
│           0x00000be4      e782           asl.l 0x3, d2
│           0x00000be6      d481           add.l d1, d2
│           0x00000be8      e582           asl.l 0x2, d2
│           0x00000bea      43ec0ab4       lea.l 0xab4(a4), a1
│           0x00000bee      d3c2           adda.l d2, a1
│           0x00000bf0      61002fce       bsr.w fcn.00003bc0
│           0x00000bf4      2007           move.l d7, d0
│           0x00000bf6      e580           asl.l 0x2, d0
│           0x00000bf8      486f0108       pea.l 0x108(a7)
│           0x00000bfc      41ec68e8       lea.l 0x68e8(a4), a0
│           0x00000c00      2f300800       move.l (a0, d0.l), -(a7)
│           0x00000c04      486c034a       pea.l 0x34a(a4)
│           0x00000c08      486f004c       pea.l 0x4c(a7)
│           0x00000c0c      6100333e       bsr.w fcn.00003f4c
│           0x00000c10      41ef0050       lea.l 0x50(a7), a0
│           0x00000c14      7000           moveq 0x0, d0
│           0x00000c16      61000802       bsr.w fcn.0000141a
│           0x00000c1a      4fef0010       lea.l 0x10(a7), a7
│           0x00000c1e      2007           move.l d7, d0
│           0x00000c20      d0ac68d4       add.l 0x68d4(a4), d0
│           0x00000c24      2200           move.l d0, d1
│           0x00000c26      e581           asl.l 0x2, d1
│           0x00000c28      41ec68e8       lea.l 0x68e8(a4), a0
│           0x00000c2c      4ab01800       tst.l (a0, d1.l)
│           0x00000c30      670000aa       beq.w 0xcdc
│           0x00000c34      20301800       move.l (a0, d1.l), d0
│           0x00000c38      2400           move.l d0, d2
│           0x00000c3a      e582           asl.l 0x2, d2
│           0x00000c3c      9480           sub.l d0, d2
│           0x00000c3e      e782           asl.l 0x3, d2
│           0x00000c40      d480           add.l d0, d2
│           0x00000c42      e582           asl.l 0x2, d2
│           0x00000c44      41ec0ab4       lea.l 0xab4(a4), a0
│           0x00000c48      d1c2           adda.l d2, a0
│           0x00000c4a      2248           movea.l a0, a1
│           ; CODE XREF from fcn.000009e6 @ 0xc4e(x)
│           0x00000c4c      4a19           tst.b (a1)+
│           0x00000c4e      66fc           bne.b 0xc4c
│           0x00000c50      5389           subq.l 0x1, a1
│           0x00000c52      93c8           suba.l a0, a1
│           0x00000c54      2a09           move.l a1, d5
│           0x00000c56      7c00           moveq 0x0, d6
│           ; CODE XREF from fcn.000009e6 @ 0xc6e(x)
│           0x00000c58      701f           moveq 0x1f, d0
│           0x00000c5a      9085           sub.l d5, d0
│           0x00000c5c      5380           subq.l 0x1, d0
│           0x00000c5e      bc80           cmp.l d0, d6
│           0x00000c60      6c0e           bge.b 0xc70
│           0x00000c62      41ef0108       lea.l 0x108(a7), a0
│           0x00000c66      d1c6           adda.l d6, a0
│           0x00000c68      10bc002e       move.b 0x2e, (a0)
│           0x00000c6c      5286           addq.l 0x1, d6
│           0x00000c6e      60e8           bra.b 0xc58
│           ; CODE XREF from fcn.000009e6 @ 0xc60(x)
│           0x00000c70      41ef0108       lea.l 0x108(a7), a0
│           0x00000c74      2248           movea.l a0, a1
│           0x00000c76      d3c6           adda.l d6, a1
│           0x00000c78      12bc0020       move.b 0x20, (a1)
│           0x00000c7c      43ef0109       lea.l 0x109(a7), a1
│           0x00000c80      d3c6           adda.l d6, a1
│           0x00000c82      4211           clr.b (a1)
│           0x00000c84      2007           move.l d7, d0
│           0x00000c86      d0ac68d4       add.l 0x68d4(a4), d0
│           0x00000c8a      2200           move.l d0, d1
│           0x00000c8c      e581           asl.l 0x2, d1
│           0x00000c8e      43ec68e8       lea.l 0x68e8(a4), a1
│           0x00000c92      20311800       move.l (a1, d1.l), d0
│           0x00000c96      2400           move.l d0, d2
│           0x00000c98      e582           asl.l 0x2, d2
│           0x00000c9a      9480           sub.l d0, d2
│           0x00000c9c      e782           asl.l 0x3, d2
│           0x00000c9e      d480           add.l d0, d2
│           0x00000ca0      e582           asl.l 0x2, d2
│           0x00000ca2      43ec0ab4       lea.l 0xab4(a4), a1
│           0x00000ca6      d3c2           adda.l d2, a1
│           0x00000ca8      61002f16       bsr.w fcn.00003bc0
│           0x00000cac      2007           move.l d7, d0
│           0x00000cae      d0ac68d4       add.l 0x68d4(a4), d0
│           0x00000cb2      2200           move.l d0, d1
│           0x00000cb4      e581           asl.l 0x2, d1
│           0x00000cb6      486f0108       pea.l 0x108(a7)
│           0x00000cba      41ec68e8       lea.l 0x68e8(a4), a0
│           0x00000cbe      2f301800       move.l (a0, d1.l), -(a7)
│           0x00000cc2      486c036e       pea.l 0x36e(a4)
│           0x00000cc6      486f004c       pea.l 0x4c(a7)
│           0x00000cca      61003280       bsr.w fcn.00003f4c
│           0x00000cce      41ef0050       lea.l 0x50(a7), a0
│           0x00000cd2      7001           moveq 0x1, d0
│           0x00000cd4      61000744       bsr.w fcn.0000141a
│           0x00000cd8      4fef0010       lea.l 0x10(a7), a7
│           ; CODE XREF from fcn.000009e6 @ 0xc30(x)
│           0x00000cdc      5287           addq.l 0x1, d7
│           0x00000cde      6000fe92       bra.w 0xb72
│           ; CODE XREF from fcn.000009e6 @ 0xb76(x)
│           0x00000ce2      202c68d0       move.l 0x68d0(a4), d0
│           0x00000ce6      7202           moveq 0x2, d1
│           0x00000ce8      61002a3a       bsr.w fcn.00003724
│           0x00000cec      5381           subq.l 0x1, d1
│           0x00000cee      660a           bne.b 0xcfa
│           0x00000cf0      41ec0394       lea.l 0x394(a4), a0
│           0x00000cf4      7001           moveq 0x1, d0
│           0x00000cf6      61000722       bsr.w fcn.0000141a
│           ; CODE XREFS from fcn.000009e6 @ 0xa80(x), 0xa9a(x), 0xcee(x)
│           0x00000cfa      41ec0396       lea.l 0x396(a4), a0
│           0x00000cfe      7001           moveq 0x1, d0
│           0x00000d00      61000718       bsr.w fcn.0000141a
│           0x00000d04      41ec0398       lea.l 0x398(a4), a0
│           0x00000d08      7001           moveq 0x1, d0
│           0x00000d0a      6100070e       bsr.w fcn.0000141a
│           0x00000d0e      41ef0017       lea.l 0x17(a7), a0
│           0x00000d12      7001           moveq 0x1, d0
│           0x00000d14      61000704       bsr.w fcn.0000141a
│           0x00000d18      7001           moveq 0x1, d0
│           0x00000d1a      223c0000020d   move.l 0x20d, d1
│           0x00000d20      61000c42       bsr.w fcn.00001964
│           0x00000d24      4cdf00e4       movem.l (a7)+, d2/d5-d7
│           0x00000d28      defc01c0       adda.w 0x1c0, a7
└           0x00000d2c      4e75           rts
            ; CALL XREFS from fcn.000002f4 @ 0x3a0(x), 0x8a6(x)
┌ 278: fcn.00000d2e ();
│           0x00000d2e      9efc00cc       suba.w 0xcc, a7
│           0x00000d32      48e72100       movem.l d2/d7, -(a7)
│           0x00000d36      7e00           moveq 0x0, d7
│           0x00000d38      202c68e0       move.l 0x68e0(a4), d0
│           0x00000d3c      4a80           tst.l d0
│           0x00000d3e      6b0000f8       bmi.w 0xe38
│           0x00000d42      b0ac68cc       cmp.l 0x68cc(a4), d0
│           0x00000d46      6e0000f0       bgt.w 0xe38
│           0x00000d4a      222c68e4       move.l 0x68e4(a4), d1
│           0x00000d4e      2401           move.l d1, d2
│           0x00000d50      e582           asl.l 0x2, d2
│           0x00000d52      9481           sub.l d1, d2
│           0x00000d54      e782           asl.l 0x3, d2
│           0x00000d56      d481           add.l d1, d2
│           0x00000d58      e582           asl.l 0x2, d2
│           0x00000d5a      41ec31c4       lea.l 0x31c4(a4), a0
│           0x00000d5e      d1c2           adda.l d2, a0
│           0x00000d60      d1c0           adda.l d0, a0
│           0x00000d62      7258           moveq 0x58, d1
│           0x00000d64      b210           cmp.b (a0), d1
│           0x00000d66      660000d0       bne.w 0xe38
│           0x00000d6a      2f00           move.l d0, -(a7)
│           0x00000d6c      486c03f2       pea.l 0x3f2(a4)
│           0x00000d70      486f0014       pea.l 0x14(a7)
│           0x00000d74      610031d6       bsr.w fcn.00003f4c
│           0x00000d78      41ef0018       lea.l 0x18(a7), a0
│           0x00000d7c      7000           moveq 0x0, d0
│           0x00000d7e      61002370       bsr.w fcn.000030f0
│           0x00000d82      4fef000c       lea.l 0xc(a7), a7
│           0x00000d86      4a80           tst.l d0
│           0x00000d88      661e           bne.b 0xda8
│           0x00000d8a      41ec040e       lea.l 0x40e(a4), a0
│           0x00000d8e      7001           moveq 0x1, d0
│           0x00000d90      61000688       bsr.w fcn.0000141a
│           0x00000d94      41ec0410       lea.l 0x410(a4), a0
│           0x00000d98      7001           moveq 0x1, d0
│           0x00000d9a      6100067e       bsr.w fcn.0000141a
│           0x00000d9e      41ef000c       lea.l 0xc(a7), a0
│           0x00000da2      6100104c       bsr.w fcn.00001df0
│           0x00000da6      604a           bra.b 0xdf2
│           ; CODE XREF from fcn.00000d2e @ 0xd88(x)
│           0x00000da8      2f2c68e0       move.l 0x68e0(a4), -(a7)
│           0x00000dac      486c0412       pea.l 0x412(a4)
│           0x00000db0      486f0014       pea.l 0x14(a7)
│           0x00000db4      61003196       bsr.w fcn.00003f4c
│           0x00000db8      41ef0018       lea.l 0x18(a7), a0
│           0x00000dbc      7000           moveq 0x0, d0
│           0x00000dbe      61002330       bsr.w fcn.000030f0
│           0x00000dc2      4fef000c       lea.l 0xc(a7), a7
│           0x00000dc6      4a80           tst.l d0
│           0x00000dc8      661e           bne.b 0xde8
│           0x00000dca      41ec042c       lea.l 0x42c(a4), a0
│           0x00000dce      7001           moveq 0x1, d0
│           0x00000dd0      61000648       bsr.w fcn.0000141a
│           0x00000dd4      41ec042e       lea.l 0x42e(a4), a0
│           0x00000dd8      7001           moveq 0x1, d0
│           0x00000dda      6100063e       bsr.w fcn.0000141a
│           0x00000dde      41ef000c       lea.l 0xc(a7), a0
│           0x00000de2      6100100c       bsr.w fcn.00001df0
│           0x00000de6      600a           bra.b 0xdf2
│           ; CODE XREF from fcn.00000d2e @ 0xdc8(x)
│           0x00000de8      41ef000c       lea.l 0xc(a7), a0
│           0x00000dec      7002           moveq 0x2, d0
│           0x00000dee      6100033e       bsr.w fcn.0000112e
│           ; CODE XREFS from fcn.00000d2e @ 0xda6(x), 0xde6(x)
│           0x00000df2      7e01           moveq 0x1, d7
│           0x00000df4      4a6c6c14       tst.w 0x6c14(a4)
│           0x00000df8      663e           bne.b 0xe38
│           0x00000dfa      41ec0430       lea.l 0x430(a4), a0
│           0x00000dfe      7000           moveq 0x0, d0
│           0x00000e00      61000618       bsr.w fcn.0000141a
│           0x00000e04      41ec04a0       lea.l 0x4a0(a4), a0
│           0x00000e08      43ef000a       lea.l 0xa(a7), a1
│           0x00000e0c      61000bf8       bsr.w fcn.00001a06
│           0x00000e10      102f000a       move.b 0xa(a7), d0
│           0x00000e14      7251           moveq 0x51, d1
│           0x00000e16      b001           cmp.b d1, d0
│           0x00000e18      6706           beq.b 0xe20
│           0x00000e1a      7271           moveq 0x71, d1
│           0x00000e1c      b001           cmp.b d1, d0
│           0x00000e1e      6618           bne.b 0xe38
│           ; CODE XREF from fcn.00000d2e @ 0xe18(x)
│           0x00000e20      41ec04a2       lea.l 0x4a2(a4), a0
│           0x00000e24      7001           moveq 0x1, d0
│           0x00000e26      610005f2       bsr.w fcn.0000141a
│           0x00000e2a      41ec04a4       lea.l 0x4a4(a4), a0
│           0x00000e2e      7001           moveq 0x1, d0
│           0x00000e30      610005e8       bsr.w fcn.0000141a
│           0x00000e34      610003da       bsr.w fcn.00001210
│           ; CODE XREFS from fcn.00000d2e @ 0xd3e(x), 0xd46(x), 0xd66(x), 0xdf8(x), 0xe1e(x)
│           0x00000e38      3007           move.w d7, d0
│           0x00000e3a      4cdf0084       movem.l (a7)+, d2/d7
│           0x00000e3e      defc00cc       adda.w 0xcc, a7
└           0x00000e42      4e75           rts
            ; CALL XREF from fcn.000002f4 @ 0x30e(x)
┌ 156: fcn.00000e44 ();
│           0x00000e44      9efc0258       suba.w 0x258, a7
│           0x00000e48      41ec09b4       lea.l 0x9b4(a4), a0
│           0x00000e4c      7064           moveq 0x64, d0
│           0x00000e4e      610010d4       bsr.w fcn.00001f24
│           0x00000e52      41ef0190       lea.l 0x190(a7), a0
│           0x00000e56      707a           moveq 0x7a, d0
│           0x00000e58      610010ca       bsr.w fcn.00001f24
│           0x00000e5c      41ef0190       lea.l 0x190(a7), a0
│           0x00000e60      6100307e       bsr.w fcn.00003ee0
│           0x00000e64      29406c08       move.l d0, 0x6c08(a4)
│           0x00000e68      41ef0190       lea.l 0x190(a7), a0
│           0x00000e6c      707c           moveq 0x7c, d0
│           0x00000e6e      4600           not.b d0
│           0x00000e70      610010b2       bsr.w fcn.00001f24
│           0x00000e74      41ef0190       lea.l 0x190(a7), a0
│           0x00000e78      43ef00c8       lea.l 0xc8(a7), a1
│           0x00000e7c      7001           moveq 0x1, d0
│           0x00000e7e      6100034e       bsr.w fcn.000011ce
│           0x00000e82      41ef0190       lea.l 0x190(a7), a0
│           0x00000e86      43d7           lea.l (a7), a1
│           0x00000e88      7002           moveq 0x2, d0
│           0x00000e8a      61000342       bsr.w fcn.000011ce
│           0x00000e8e      41d7           lea.l (a7), a0
│           0x00000e90      6100304e       bsr.w fcn.00003ee0
│           0x00000e94      294068d8       move.l d0, 0x68d8(a4)
│           0x00000e98      41ec09ac       lea.l 0x9ac(a4), a0
│           0x00000e9c      704c           moveq 0x4c, d0
│           0x00000e9e      d080           add.l d0, d0
│           0x00000ea0      61001082       bsr.w fcn.00001f24
│           0x00000ea4      41ef0190       lea.l 0x190(a7), a0
│           0x00000ea8      203c000001fe   move.l 0x1fe, d0
│           0x00000eae      61001074       bsr.w fcn.00001f24
│           0x00000eb2      41ef0190       lea.l 0x190(a7), a0
│           0x00000eb6      61003028       bsr.w fcn.00003ee0
│           0x00000eba      5280           addq.l 0x1, d0
│           0x00000ebc      294068e4       move.l d0, 0x68e4(a4)
│           0x00000ec0      41ec09ac       lea.l 0x9ac(a4), a0
│           0x00000ec4      43ec04a6       lea.l 0x4a6(a4), a1
│           0x00000ec8      61002c96       bsr.w fcn.00003b60
│           0x00000ecc      4a80           tst.l d0
│           0x00000ece      670a           beq.b 0xeda
│           0x00000ed0      41ec04aa       lea.l 0x4aa(a4), a0
│           0x00000ed4      7001           moveq 0x1, d0
│           0x00000ed6      61000256       bsr.w fcn.0000112e
│           ; CODE XREF from fcn.00000e44 @ 0xece(x)
│           0x00000eda      defc0258       adda.w 0x258, a7
└           0x00000ede      4e75           rts
            ; CALL XREF from fcn.000002f4 @ 0x306(x)
┌ 590: fcn.00000ee0 ();
│           0x00000ee0      9efc0168       suba.w 0x168, a7
│           0x00000ee4      48e70700       movem.l d5-d7, -(a7)
│           0x00000ee8      426c6c10       clr.w 0x6c10(a4)
│           0x00000eec      426c6c12       clr.w 0x6c12(a4)
│           0x00000ef0      41ec04ac       lea.l 0x4ac(a4), a0
│           0x00000ef4      43ec04c6       lea.l 0x4c6(a4), a1
│           0x00000ef8      61003666       bsr.w fcn.00004560
│           0x00000efc      29406c16       move.l d0, 0x6c16(a4)
│           0x00000f00      660a           bne.b 0xf0c
│           0x00000f02      41ec04c8       lea.l 0x4c8(a4), a0
│           0x00000f06      7002           moveq 0x2, d0
│           0x00000f08      61000224       bsr.w fcn.0000112e
│           ; XREFS: CODE 0x00000f00  CODE 0x00000f76  CODE 0x00000f7e  
│           ; XREFS: CODE 0x00000f9e  CODE 0x00000fa8  CODE 0x00000fb6  
│           0x00000f0c      41ef00ac       lea.l 0xac(a7), a0
│           0x00000f10      226c6c16       movea.l 0x6c16(a4), a1
│           0x00000f14      7064           moveq 0x64, d0
│           0x00000f16      d080           add.l d0, d0
│           0x00000f18      610031f2       bsr.w fcn.0000410c
│           0x00000f1c      4a80           tst.l d0
│           0x00000f1e      6700009a       beq.w 0xfba
│           0x00000f22      41ef00ac       lea.l 0xac(a7), a0
│           0x00000f26      61002110       bsr.w fcn.00003038
│           0x00000f2a      41ef00ac       lea.l 0xac(a7), a0
│           0x00000f2e      43ec04e2       lea.l 0x4e2(a4), a1
│           0x00000f32      61002c2c       bsr.w fcn.00003b60
│           0x00000f36      4a80           tst.l d0
│           0x00000f38      66000080       bne.w 0xfba
│           0x00000f3c      41ef00ac       lea.l 0xac(a7), a0
│           0x00000f40      43ef005c       lea.l 0x5c(a7), a1
│           0x00000f44      7001           moveq 0x1, d0
│           0x00000f46      61000286       bsr.w fcn.000011ce
│           0x00000f4a      41ef00ac       lea.l 0xac(a7), a0
│           0x00000f4e      43ef000c       lea.l 0xc(a7), a1
│           0x00000f52      7002           moveq 0x2, d0
│           0x00000f54      61000278       bsr.w fcn.000011ce
│           0x00000f58      41ef005c       lea.l 0x5c(a7), a0
│           0x00000f5c      43ec04ee       lea.l 0x4ee(a4), a1
│           0x00000f60      61001cf2       bsr.w fcn.00002c54
│           0x00000f64      4a80           tst.l d0
│           0x00000f66      6618           bne.b 0xf80
│           0x00000f68      41ef000c       lea.l 0xc(a7), a0
│           0x00000f6c      43ec04fc       lea.l 0x4fc(a4), a1
│           0x00000f70      61002bee       bsr.w fcn.00003b60
│           0x00000f74      4a80           tst.l d0
│           0x00000f76      6794           beq.b 0xf0c
│           0x00000f78      397c00016c10   move.w 0x1, 0x6c10(a4)
│           0x00000f7e      608c           bra.b 0xf0c
│           ; CODE XREF from fcn.00000ee0 @ 0xf66(x)
│           0x00000f80      41ef005c       lea.l 0x5c(a7), a0
│           0x00000f84      43ec0500       lea.l 0x500(a4), a1
│           0x00000f88      61001cca       bsr.w fcn.00002c54
│           0x00000f8c      4a80           tst.l d0
│           0x00000f8e      661c           bne.b 0xfac
│           0x00000f90      41ef000c       lea.l 0xc(a7), a0
│           0x00000f94      43ec050c       lea.l 0x50c(a4), a1
│           0x00000f98      61002bc6       bsr.w fcn.00003b60
│           0x00000f9c      4a80           tst.l d0
│           0x00000f9e      6700ff6c       beq.w 0xf0c
│           0x00000fa2      397c00016c12   move.w 0x1, 0x6c12(a4)
│           0x00000fa8      6000ff62       bra.w 0xf0c
│           ; CODE XREF from fcn.00000ee0 @ 0xf8e(x)
│           0x00000fac      41ef005c       lea.l 0x5c(a7), a0
│           0x00000fb0      7003           moveq 0x3, d0
│           0x00000fb2      6100017a       bsr.w fcn.0000112e
│           0x00000fb6      6000ff54       bra.w 0xf0c
│           ; CODE XREFS from fcn.00000ee0 @ 0xf1e(x), 0xf38(x)
│           0x00000fba      7e01           moveq 0x1, d7
│           ; CODE XREF from fcn.00000ee0 @ 0x1038(x)
│           0x00000fbc      41ef00ac       lea.l 0xac(a7), a0
│           0x00000fc0      226c6c16       movea.l 0x6c16(a4), a1
│           0x00000fc4      7064           moveq 0x64, d0
│           0x00000fc6      d080           add.l d0, d0
│           0x00000fc8      61003142       bsr.w fcn.0000410c
│           0x00000fcc      4a80           tst.l d0
│           0x00000fce      676a           beq.b 0x103a
│           0x00000fd0      7a00           moveq 0x0, d5
│           ; CODE XREF from fcn.00000ee0 @ 0xffa(x)
│           0x00000fd2      41ef00ac       lea.l 0xac(a7), a0
│           0x00000fd6      2248           movea.l a0, a1
│           ; CODE XREF from fcn.00000ee0 @ 0xfda(x)
│           0x00000fd8      4a19           tst.b (a1)+
│           0x00000fda      66fc           bne.b 0xfd8
│           0x00000fdc      5389           subq.l 0x1, a1
│           0x00000fde      93c8           suba.l a0, a1
│           0x00000fe0      ba89           cmp.l a1, d5
│           0x00000fe2      6418           bcc.b 0xffc
│           0x00000fe4      2248           movea.l a0, a1
│           0x00000fe6      d3c5           adda.l d5, a1
│           0x00000fe8      703b           moveq 0x3b, d0
│           0x00000fea      b011           cmp.b (a1), d0
│           0x00000fec      670e           beq.b 0xffc
│           0x00000fee      d1c5           adda.l d5, a0
│           0x00000ff0      7020           moveq 0x20, d0
│           0x00000ff2      b010           cmp.b (a0), d0
│           0x00000ff4      6702           beq.b 0xff8
│           0x00000ff6      2c05           move.l d5, d6
│           ; CODE XREF from fcn.00000ee0 @ 0xff4(x)
│           0x00000ff8      5285           addq.l 0x1, d5
│           0x00000ffa      60d6           bra.b 0xfd2
│           ; CODE XREFS from fcn.00000ee0 @ 0xfe2(x), 0xfec(x)
│           0x00000ffc      41ef00ad       lea.l 0xad(a7), a0
│           0x00001000      d1c6           adda.l d6, a0
│           0x00001002      4210           clr.b (a0)
│           0x00001004      41ef00ac       lea.l 0xac(a7), a0
│           0x00001008      43ec0510       lea.l 0x510(a4), a1
│           0x0000100c      61002b52       bsr.w fcn.00003b60
│           0x00001010      4a80           tst.l d0
│           0x00001012      6626           bne.b 0x103a
│           0x00001014      41ef00ac       lea.l 0xac(a7), a0
│           0x00001018      61000190       bsr.w fcn.000011aa
│           0x0000101c      2007           move.l d7, d0
│           0x0000101e      e580           asl.l 0x2, d0
│           0x00001020      9087           sub.l d7, d0
│           0x00001022      e780           asl.l 0x3, d0
│           0x00001024      d087           add.l d7, d0
│           0x00001026      e580           asl.l 0x2, d0
│           0x00001028      41ec0ab4       lea.l 0xab4(a4), a0
│           0x0000102c      d1c0           adda.l d0, a0
│           0x0000102e      43ef00ac       lea.l 0xac(a7), a1
│           ; CODE XREF from fcn.00000ee0 @ 0x1034(x)
│           0x00001032      10d9           move.b (a1)+, (a0)+
│           0x00001034      66fc           bne.b 0x1032
│           0x00001036      5287           addq.l 0x1, d7
│           0x00001038      6082           bra.b 0xfbc
│           ; CODE XREFS from fcn.00000ee0 @ 0xfce(x), 0x1012(x)
│           0x0000103a      7c01           moveq 0x1, d6
│           ; CODE XREF from fcn.00000ee0 @ 0x108a(x)
│           0x0000103c      41ef00ac       lea.l 0xac(a7), a0
│           0x00001040      226c6c16       movea.l 0x6c16(a4), a1
│           0x00001044      7064           moveq 0x64, d0
│           0x00001046      d080           add.l d0, d0
│           0x00001048      610030c2       bsr.w fcn.0000410c
│           0x0000104c      4a80           tst.l d0
│           0x0000104e      673c           beq.b 0x108c
│           0x00001050      41ef00ac       lea.l 0xac(a7), a0
│           0x00001054      43ec0520       lea.l 0x520(a4), a1
│           0x00001058      61002b06       bsr.w fcn.00003b60
│           0x0000105c      4a80           tst.l d0
│           0x0000105e      662c           bne.b 0x108c
│           0x00001060      41ef00ac       lea.l 0xac(a7), a0
│           0x00001064      61000144       bsr.w fcn.000011aa
│           0x00001068      2006           move.l d6, d0
│           0x0000106a      e580           asl.l 0x2, d0
│           0x0000106c      9086           sub.l d6, d0
│           0x0000106e      e780           asl.l 0x3, d0
│           0x00001070      d086           add.l d6, d0
│           0x00001072      e580           asl.l 0x2, d0
│           0x00001074      41ec31c4       lea.l 0x31c4(a4), a0
│           0x00001078      d1c0           adda.l d0, a0
│           0x0000107a      43e80001       lea.l 0x1(a0), a1
│           0x0000107e      41ef00ac       lea.l 0xac(a7), a0
│           0x00001082      7001           moveq 0x1, d0
│           0x00001084      61000148       bsr.w fcn.000011ce
│           0x00001088      5286           addq.l 0x1, d6
│           0x0000108a      60b0           bra.b 0x103c
│           ; CODE XREFS from fcn.00000ee0 @ 0x104e(x), 0x105e(x)
│           0x0000108c      7c00           moveq 0x0, d6
│           ; CODE XREF from fcn.00000ee0 @ 0x110a(x)
│           0x0000108e      41ef00ac       lea.l 0xac(a7), a0
│           0x00001092      226c6c16       movea.l 0x6c16(a4), a1
│           0x00001096      7064           moveq 0x64, d0
│           0x00001098      d080           add.l d0, d0
│           0x0000109a      61003070       bsr.w fcn.0000410c
│           0x0000109e      4a80           tst.l d0
│           0x000010a0      676a           beq.b 0x110c
│           0x000010a2      41ef00ac       lea.l 0xac(a7), a0
│           0x000010a6      43ec0530       lea.l 0x530(a4), a1
│           0x000010aa      61002ab4       bsr.w fcn.00003b60
│           0x000010ae      4a80           tst.l d0
│           0x000010b0      665a           bne.b 0x110c
│           0x000010b2      7014           moveq 0x14, d0
│           0x000010b4      bc80           cmp.l d0, d6
│           0x000010b6      6754           beq.b 0x110c
│           0x000010b8      41ef00ac       lea.l 0xac(a7), a0
│           0x000010bc      610000ec       bsr.w fcn.000011aa
│           0x000010c0      41ef00ac       lea.l 0xac(a7), a0
│           0x000010c4      2248           movea.l a0, a1
│           ; CODE XREF from fcn.00000ee0 @ 0x10c8(x)
│           0x000010c6      4a19           tst.b (a1)+
│           0x000010c8      66fc           bne.b 0x10c6
│           0x000010ca      5389           subq.l 0x1, a1
│           0x000010cc      93c8           suba.l a0, a1
│           0x000010ce      2009           move.l a1, d0
│           0x000010d0      661c           bne.b 0x10ee
│           0x000010d2      2006           move.l d6, d0
│           0x000010d4      e580           asl.l 0x2, d0
│           0x000010d6      9086           sub.l d6, d0
│           0x000010d8      e780           asl.l 0x3, d0
│           0x000010da      d086           add.l d6, d0
│           0x000010dc      e780           asl.l 0x3, d0
│           0x000010de      41ec58d4       lea.l 0x58d4(a4), a0
│           0x000010e2      d1c0           adda.l d0, a0
│           0x000010e4      43ec053c       lea.l 0x53c(a4), a1
│           ; CODE XREF from fcn.00000ee0 @ 0x10ea(x)
│           0x000010e8      10d9           move.b (a1)+, (a0)+
│           0x000010ea      66fc           bne.b 0x10e8
│           0x000010ec      601a           bra.b 0x1108
│           ; CODE XREF from fcn.00000ee0 @ 0x10d0(x)
│           0x000010ee      2006           move.l d6, d0
│           0x000010f0      e580           asl.l 0x2, d0
│           0x000010f2      9086           sub.l d6, d0
│           0x000010f4      e780           asl.l 0x3, d0
│           0x000010f6      d086           add.l d6, d0
│           0x000010f8      e780           asl.l 0x3, d0
│           0x000010fa      41ec58d4       lea.l 0x58d4(a4), a0
│           0x000010fe      d1c0           adda.l d0, a0
│           0x00001100      43ef00ac       lea.l 0xac(a7), a1
│           ; CODE XREF from fcn.00000ee0 @ 0x1106(x)
│           0x00001104      10d9           move.b (a1)+, (a0)+
│           0x00001106      66fc           bne.b 0x1104
│           ; CODE XREF from fcn.00000ee0 @ 0x10ec(x)
│           0x00001108      5286           addq.l 0x1, d6
│           0x0000110a      6082           bra.b 0x108e
│           ; CODE XREFS from fcn.00000ee0 @ 0x10a0(x), 0x10b0(x), 0x10b6(x)
│           0x0000110c      2006           move.l d6, d0
│           0x0000110e      5380           subq.l 0x1, d0
│           0x00001110      29406c0c       move.l d0, 0x6c0c(a4)
│           0x00001114      202c6c16       move.l 0x6c16(a4), d0
│           0x00001118      6706           beq.b 0x1120
│           0x0000111a      2040           movea.l d0, a0
│           0x0000111c      610032a2       bsr.w fcn.000043c0
│           ; CODE XREF from fcn.00000ee0 @ 0x1118(x)
│           0x00001120      2007           move.l d7, d0
│           0x00001122      5380           subq.l 0x1, d0
│           0x00001124      4cdf00e0       movem.l (a7)+, d5-d7
│           0x00001128      defc0168       adda.w 0x168, a7
└           0x0000112c      4e75           rts
            ; CALL XREF from fcn.00000d2e @ 0xdee(x)
            ; CALL XREF from fcn.00000e44 @ 0xed6(x)
            ; CALL XREFS from fcn.00000ee0 @ 0xf08(x), 0xfb2(x)
┌ 124: fcn.0000112e ();
│           0x0000112e      48e70104       movem.l d7/a5, -(a7)
│           0x00001132      2e00           move.l d0, d7
│           0x00001134      2a48           movea.l a0, a5
│           0x00001136      41ec053e       lea.l 0x53e(a4), a0
│           0x0000113a      7001           moveq 0x1, d0
│           0x0000113c      610002dc       bsr.w fcn.0000141a
│           0x00001140      2007           move.l d7, d0
│           0x00001142      5380           subq.l 0x1, d0
│           0x00001144      670a           beq.b 0x1150
│           0x00001146      5380           subq.l 0x1, d0
│           0x00001148      6712           beq.b 0x115c
│           0x0000114a      5380           subq.l 0x1, d0
│           0x0000114c      672c           beq.b 0x117a
│           0x0000114e      6046           bra.b 0x1196
│           ; CODE XREF from fcn.0000112e @ 0x1144(x)
│           0x00001150      41ec0540       lea.l 0x540(a4), a0
│           0x00001154      7001           moveq 0x1, d0
│           0x00001156      610002c2       bsr.w fcn.0000141a
│           0x0000115a      603a           bra.b 0x1196
│           ; CODE XREF from fcn.0000112e @ 0x1148(x)
│           0x0000115c      41ec056e       lea.l 0x56e(a4), a0
│           0x00001160      7000           moveq 0x0, d0
│           0x00001162      610002b6       bsr.w fcn.0000141a
│           0x00001166      204d           movea.l a5, a0
│           0x00001168      7000           moveq 0x0, d0
│           0x0000116a      610002ae       bsr.w fcn.0000141a
│           0x0000116e      41ec057c       lea.l 0x57c(a4), a0
│           0x00001172      7001           moveq 0x1, d0
│           0x00001174      610002a4       bsr.w fcn.0000141a
│           0x00001178      601c           bra.b 0x1196
│           ; CODE XREF from fcn.0000112e @ 0x114c(x)
│           0x0000117a      41ec058a       lea.l 0x58a(a4), a0
│           0x0000117e      7000           moveq 0x0, d0
│           0x00001180      61000298       bsr.w fcn.0000141a
│           0x00001184      204d           movea.l a5, a0
│           0x00001186      7000           moveq 0x0, d0
│           0x00001188      61000290       bsr.w fcn.0000141a
│           0x0000118c      41ec05aa       lea.l 0x5aa(a4), a0
│           0x00001190      7001           moveq 0x1, d0
│           0x00001192      61000286       bsr.w fcn.0000141a
│           ; CODE XREFS from fcn.0000112e @ 0x114e(x), 0x115a(x), 0x1178(x)
│           0x00001196      41ec05b8       lea.l 0x5b8(a4), a0
│           0x0000119a      7001           moveq 0x1, d0
│           0x0000119c      6100027c       bsr.w fcn.0000141a
│           0x000011a0      6100006e       bsr.w fcn.00001210
│           0x000011a4      4cdf2080       movem.l (a7)+, d7/a5
└           0x000011a8      4e75           rts
            ; CALL XREFS from fcn.00000ee0 @ 0x1018(x), 0x1064(x), 0x10bc(x)
┌ 36: fcn.000011aa ();
│           0x000011aa      48e70104       movem.l d7/a5, -(a7)
│           0x000011ae      2a48           movea.l a0, a5
│           0x000011b0      204d           movea.l a5, a0
│           ; CODE XREF from fcn.000011aa @ 0x11b4(x)
│           0x000011b2      4a18           tst.b (a0)+
│           0x000011b4      66fc           bne.b 0x11b2
│           0x000011b6      5388           subq.l 0x1, a0
│           0x000011b8      91cd           suba.l a5, a0
│           0x000011ba      2e08           move.l a0, d7
│           0x000011bc      700a           moveq 0xa, d0
│           0x000011be      b03578ff       cmp.b -0x1(a5, d7.l), d0
│           0x000011c2      6604           bne.b 0x11c8
│           0x000011c4      423578ff       clr.b -0x1(a5, d7.l)
│           ; CODE XREF from fcn.000011aa @ 0x11c2(x)
│           0x000011c8      4cdf2080       movem.l (a7)+, d7/a5
└           0x000011cc      4e75           rts
            ; CALL XREFS from fcn.00000e44 @ 0xe7e(x), 0xe8a(x)
            ; CALL XREFS from fcn.00000ee0 @ 0xf46(x), 0xf54(x), 0x1084(x)
┌ 66: fcn.000011ce ();
│           0x000011ce      48e70314       movem.l d6-d7/a3/a5, -(a7)
│           0x000011d2      2e00           move.l d0, d7
│           0x000011d4      2649           movea.l a1, a3
│           0x000011d6      2a48           movea.l a0, a5
│           0x000011d8      7c01           moveq 0x1, d6
│           0x000011da      4213           clr.b (a3)
│           ; CODE XREF from fcn.000011ce @ 0x1208(x)
│           0x000011dc      4a15           tst.b (a5)
│           0x000011de      672a           beq.b 0x120a
│           0x000011e0      bc87           cmp.l d7, d6
│           0x000011e2      6614           bne.b 0x11f8
│           ; CODE XREF from fcn.000011ce @ 0x11f2(x)
│           0x000011e4      1015           move.b (a5), d0
│           0x000011e6      670c           beq.b 0x11f4
│           0x000011e8      7220           moveq 0x20, d1
│           0x000011ea      b001           cmp.b d1, d0
│           0x000011ec      6706           beq.b 0x11f4
│           0x000011ee      16c0           move.b d0, (a3)+
│           0x000011f0      528d           addq.l 0x1, a5
│           0x000011f2      60f0           bra.b 0x11e4
│           ; CODE XREFS from fcn.000011ce @ 0x11e6(x), 0x11ec(x)
│           0x000011f4      4213           clr.b (a3)
│           0x000011f6      6012           bra.b 0x120a
│           ; CODE XREF from fcn.000011ce @ 0x11e2(x)
│           0x000011f8      7020           moveq 0x20, d0
│           0x000011fa      b015           cmp.b (a5), d0
│           0x000011fc      6608           bne.b 0x1206
│           0x000011fe      b02d0001       cmp.b 0x1(a5), d0
│           0x00001202      6702           beq.b 0x1206
│           0x00001204      5286           addq.l 0x1, d6
│           ; CODE XREFS from fcn.000011ce @ 0x11fc(x), 0x1202(x)
│           0x00001206      528d           addq.l 0x1, a5
│           0x00001208      60d2           bra.b 0x11dc
│           ; CODE XREFS from fcn.000011ce @ 0x11de(x), 0x11f6(x)
│           0x0000120a      4cdf28c0       movem.l (a7)+, d6-d7/a3/a5
└           0x0000120e      4e75           rts
            ; CALL XREF from fcn.00000284 @ 0x2c8(x)
            ; CALL XREFS from fcn.000002f4 @ 0x3a8(x), 0x8fa(x)
            ; CALL XREF from fcn.00000d2e @ 0xe34(x)
            ; CALL XREF from fcn.0000112e @ 0x11a0(x)
┌ 10: fcn.00001210 ();
│           0x00001210      61000130       bsr.w fcn.00001342
│           0x00001214      61000004       bsr.w fcn.0000121a
└           0x00001218      4e75           rts
            ; CALL XREF from fcn.00001210 @ 0x1214(x)
            ; CALL XREF from fcn.00002096 @ 0x209a(x)
┌ 8: fcn.0000121a ();
│           0x0000121a      7000           moveq 0x0, d0
│           0x0000121c      61002cf6       bsr.w fcn.00003f14
└           0x00001220      4e75           rts
            ; CALL XREF from fcn.00001342 @ 0x1346(x)
┌ 2: fcn.00001222 ();
└           0x00001222      4e75           rts
            ; CALL XREF from fcn.00000284 @ 0x2c0(x)
┌ 286: fcn.00001224 ();
│           0x00001224      9efc0010       suba.w 0x10, a7
│           0x00001228      48e70302       movem.l d6-d7/a6, -(a7)
│           0x0000122c      2e00           move.l d0, d7
│           0x0000122e      42af000c       clr.l 0xc(a7)
│           0x00001232      7041           moveq 0x41, d0
│           0x00001234      e588           lsl.l 0x2, d0
│           0x00001236      223c00010001   move.l 0x10001, d1
│           0x0000123c      2c780004       movea.l 0x4, a6
│           0x00001240      4eaeff3a       jsr -0xc6(a6)               ; fcn.000030f0-0x30f0
│           0x00001244      29406c24       move.l d0, 0x6c24(a4)
│           0x00001248      4a80           tst.l d0
│           0x0000124a      6610           bne.b 0x125c
│           0x0000124c      486c05d8       pea.l 0x5d8(a4)
│           0x00001250      4eba18e6       jsr fcn.00002b38(pc)
│           0x00001254      701e           moveq 0x1e, d0
│           0x00001256      4eba2cbc       jsr fcn.00003f14(pc)
│           0x0000125a      584f           addq.w 0x4, a7
│           ; CODE XREF from fcn.00001224 @ 0x124a(x)
│           0x0000125c      7000           moveq 0x0, d0
│           0x0000125e      91c8           suba.l a0, a0
│           0x00001260      4eba17b6       jsr fcn.00002a18(pc)
│           0x00001264      29406c20       move.l d0, 0x6c20(a4)
│           0x00001268      661c           bne.b 0x1286
│           0x0000126a      486c0602       pea.l 0x602(a4)
│           0x0000126e      4eba18c8       jsr fcn.00002b38(pc)
│           0x00001272      226c6c24       movea.l 0x6c24(a4), a1
│           0x00001276      7041           moveq 0x41, d0
│           0x00001278      e588           lsl.l 0x2, d0
│           0x0000127a      4eaeff2e       jsr -0xd2(a6)               ; fcn.000030f0-0x30f0
│           0x0000127e      701e           moveq 0x1e, d0
│           0x00001280      4eba2c92       jsr fcn.00003f14(pc)
│           0x00001284      584f           addq.w 0x4, a7
│           ; CODE XREF from fcn.00001224 @ 0x1268(x)
│           0x00001286      206c6c24       movea.l 0x6c24(a4), a0
│           0x0000128a      117c00050008   move.b 0x5, 0x8(a0)
│           0x00001290      206c6c24       movea.l 0x6c24(a4), a0
│           0x00001294      317c01040012   move.w 0x104, 0x12(a0)
│           0x0000129a      206c6c24       movea.l 0x6c24(a4), a0
│           0x0000129e      216c6c20000e   move.l 0x6c20(a4), 0xe(a0)
│           0x000012a4      206c6c24       movea.l 0x6c24(a4), a0
│           0x000012a8      d0fc0014       adda.w 0x14, a0
│           0x000012ac      43ec061e       lea.l 0x61e(a4), a1
│           ; CODE XREF from fcn.00001224 @ 0x12b2(x)
│           0x000012b0      10d9           move.b (a1)+, (a0)+
│           0x000012b2      66fc           bne.b 0x12b0
│           0x000012b4      7001           moveq 0x1, d0
│           0x000012b6      206c6c24       movea.l 0x6c24(a4), a0
│           0x000012ba      214000e0       move.l d0, 0xe0(a0)
│           0x000012be      7002           moveq 0x2, d0
│           0x000012c0      206c6c24       movea.l 0x6c24(a4), a0
│           0x000012c4      214000dc       move.l d0, 0xdc(a0)
│           0x000012c8      70ff           moveq 0xff, d0
│           0x000012ca      206c6c24       movea.l 0x6c24(a4), a0
│           0x000012ce      214000e4       move.l d0, 0xe4(a0)
│           0x000012d2      206c6c24       movea.l 0x6c24(a4), a0
│           0x000012d6      42a800e8       clr.l 0xe8(a0)
│           0x000012da      2f07           move.l d7, -(a7)
│           0x000012dc      486c0620       pea.l 0x620(a4)
│           0x000012e0      486c6c2c       pea.l 0x6c2c(a4)
│           0x000012e4      4eba2c66       jsr fcn.00003f4c(pc)
│           0x000012e8      4fef000c       lea.l 0xc(a7), a7
│           ; CODE XREF from fcn.00001224 @ 0x12fc(x)
│           0x000012ec      43ec6c2c       lea.l 0x6c2c(a4), a1
│           0x000012f0      2c780004       movea.l 0x4, a6
│           0x000012f4      4eaefe7a       jsr -0x186(a6)              ; fcn.000030f0-0x30f0
│           0x000012f8      29406c1c       move.l d0, 0x6c1c(a4)
│           0x000012fc      67ee           beq.b 0x12ec
│           0x000012fe      206c6c1c       movea.l 0x6c1c(a4), a0
│           0x00001302      226c6c24       movea.l 0x6c24(a4), a1
│           0x00001306      2c780004       movea.l 0x4, a6
│           0x0000130a      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
│           0x0000130e      7000           moveq 0x0, d0
│           0x00001310      206c6c20       movea.l 0x6c20(a4), a0
│           0x00001314      1028000f       move.b 0xf(a0), d0
│           0x00001318      7201           moveq 0x1, d1
│           0x0000131a      e1a1           asl.l d0, d1
│           0x0000131c      2c01           move.l d1, d6
│           0x0000131e      2006           move.l d6, d0
│           0x00001320      4eaefec2       jsr -0x13e(a6)              ; fcn.000030f0-0x30f0
│           0x00001324      206c6c20       movea.l 0x6c20(a4), a0
│           0x00001328      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
│           0x0000132c      29406c28       move.l d0, 0x6c28(a4)
│           0x00001330      2040           movea.l d0, a0
│           0x00001332      296800e06c40   move.l 0xe0(a0), 0x6c40(a4)
│           0x00001338      4cdf40c0       movem.l (a7)+, d6-d7/a6
│           0x0000133c      defc0010       adda.w 0x10, a7
└           0x00001340      4e75           rts
            ; CALL XREF from fcn.00001210 @ 0x1210(x)
            ; CALL XREF from fcn.00002096 @ 0x2096(x)
┌ 68: fcn.00001342 ();
│           0x00001342      48e70302       movem.l d6-d7/a6, -(a7)
│           0x00001346      4ebafeda       jsr fcn.00001222(pc)
│           0x0000134a      7000           moveq 0x0, d0
│           0x0000134c      206c6c20       movea.l 0x6c20(a4), a0
│           0x00001350      1028000f       move.b 0xf(a0), d0
│           0x00001354      7201           moveq 0x1, d1
│           0x00001356      e1a1           asl.l d0, d1
│           0x00001358      2e01           move.l d1, d7
│           0x0000135a      7002           moveq 0x2, d0
│           0x0000135c      206c6c24       movea.l 0x6c24(a4), a0
│           0x00001360      214000e0       move.l d0, 0xe0(a0)
│           0x00001364      206c6c1c       movea.l 0x6c1c(a4), a0
│           0x00001368      226c6c24       movea.l 0x6c24(a4), a1
│           0x0000136c      2c780004       movea.l 0x4, a6
│           0x00001370      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
│           0x00001374      2007           move.l d7, d0
│           0x00001376      4eaefec2       jsr -0x13e(a6)              ; fcn.000030f0-0x30f0
│           0x0000137a      2c00           move.l d0, d6
│           0x0000137c      61000008       bsr.w fcn.00001386
│           0x00001380      4cdf40c0       movem.l (a7)+, d6-d7/a6
└           0x00001384      4e75           rts
            ; CALL XREF from fcn.00001342 @ 0x137c(x)
            ; CALL XREF from fcn.00001a06 @ +0x254(x)
┌ 48: fcn.00001386 ();
│           0x00001386      2f0e           move.l a6, -(a7)
│           ; CODE XREF from fcn.00001386 @ 0x1398(x)
│           0x00001388      206c6c20       movea.l 0x6c20(a4), a0
│           0x0000138c      2c780004       movea.l 0x4, a6
│           0x00001390      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
│           0x00001394      29406c28       move.l d0, 0x6c28(a4)
│           0x00001398      66ee           bne.b 0x1388
│           0x0000139a      206c6c20       movea.l 0x6c20(a4), a0
│           0x0000139e      4eba16ec       jsr fcn.00002a8c(pc)
│           0x000013a2      226c6c24       movea.l 0x6c24(a4), a1
│           0x000013a6      7041           moveq 0x41, d0
│           0x000013a8      e588           lsl.l 0x2, d0
│           0x000013aa      2c780004       movea.l 0x4, a6
│           0x000013ae      4eaeff2e       jsr -0xd2(a6)               ; fcn.000030f0-0x30f0
│           0x000013b2      2c5f           movea.l (a7)+, a6
└           0x000013b4      4e75           rts
            0x000013b6      48e70106       movem.l d7/a5-a6, -(a7)
            0x000013ba      2e00           move.l d0, d7
            0x000013bc      2a48           movea.l a0, a5
            0x000013be      206c6c28       movea.l 0x6c28(a4), a0
            0x000013c2      d0fc0014       adda.w 0x14, a0
            0x000013c6      224d           movea.l a5, a1
            ; CODE XREF from fcn.00001386 @ +0x44(x)
            0x000013c8      10d9           move.b (a1)+, (a0)+
            0x000013ca      66fc           bne.b 0x13c8
            0x000013cc      7009           moveq 0x9, d0
            0x000013ce      206c6c28       movea.l 0x6c28(a4), a0
            0x000013d2      214000e0       move.l d0, 0xe0(a0)
            0x000013d6      206c6c28       movea.l 0x6c28(a4), a0
            0x000013da      214700dc       move.l d7, 0xdc(a0)
            0x000013de      206c6c1c       movea.l 0x6c1c(a4), a0
            0x000013e2      226c6c24       movea.l 0x6c24(a4), a1
            0x000013e6      2c780004       movea.l 0x4.w, a6
            0x000013ea      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x000013ee      206c6c20       movea.l 0x6c20(a4), a0
            0x000013f2      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x000013f6      206c6c20       movea.l 0x6c20(a4), a0
            0x000013fa      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x000013fe      206c6c28       movea.l 0x6c28(a4), a0
            0x00001402      2e2800dc       move.l 0xdc(a0), d7
            0x00001406      70ff           moveq 0xff, d0
            0x00001408      b0a800dc       cmp.l 0xdc(a0), d0
            0x0000140c      6604           bne.b 0x1412
            0x0000140e      61000c86       bsr.w fcn.00002096
            ; CODE XREF from fcn.00001386 @ +0x86(x)
            0x00001412      2007           move.l d7, d0
            0x00001414      4cdf6080       movem.l (a7)+, d7/a5-a6
            0x00001418      4e75           rts
            ; XREFS(44)
┌ 188: fcn.0000141a ();
│           0x0000141a      9efc0050       suba.w 0x50, a7
│           0x0000141e      48e70304       movem.l d6-d7/a5, -(a7)
│           0x00001422      2e00           move.l d0, d7
│           0x00001424      2a48           movea.l a0, a5
│           0x00001426      204d           movea.l a5, a0
│           ; CODE XREF from fcn.0000141a @ 0x142a(x)
│           0x00001428      4a18           tst.b (a0)+
│           0x0000142a      66fc           bne.b 0x1428
│           0x0000142c      5388           subq.l 0x1, a0
│           0x0000142e      91cd           suba.l a5, a0
│           0x00001430      2008           move.l a0, d0
│           0x00001432      7250           moveq 0x50, d1
│           0x00001434      b081           cmp.l d1, d0
│           0x00001436      640a           bcc.b 0x1442
│           0x00001438      204d           movea.l a5, a0
│           0x0000143a      7000           moveq 0x0, d0
│           0x0000143c      610003a2       bsr.w fcn.000017e0
│           0x00001440      603a           bra.b 0x147c
│           ; CODE XREF from fcn.0000141a @ 0x1436(x)
│           0x00001442      7c00           moveq 0x0, d6
│           ; CODE XREF from fcn.0000141a @ 0x147a(x)
│           0x00001444      204d           movea.l a5, a0
│           0x00001446      d1c6           adda.l d6, a0
│           0x00001448      2f08           move.l a0, -(a7)
│           0x0000144a      486c062e       pea.l 0x62e(a4)
│           0x0000144e      486f0014       pea.l 0x14(a7)
│           0x00001452      4eba2af8       jsr fcn.00003f4c(pc)
│           0x00001456      41ef0018       lea.l 0x18(a7), a0
│           0x0000145a      7000           moveq 0x0, d0
│           0x0000145c      61000382       bsr.w fcn.000017e0
│           0x00001460      4fef000c       lea.l 0xc(a7), a7
│           0x00001464      704f           moveq 0x4f, d0
│           0x00001466      dc80           add.l d0, d6
│           0x00001468      41ef000c       lea.l 0xc(a7), a0
│           0x0000146c      2248           movea.l a0, a1
│           ; CODE XREF from fcn.0000141a @ 0x1470(x)
│           0x0000146e      4a19           tst.b (a1)+
│           0x00001470      66fc           bne.b 0x146e
│           0x00001472      5389           subq.l 0x1, a1
│           0x00001474      93c8           suba.l a0, a1
│           0x00001476      b2fc004f       cmpa.w 0x4f, a1
│           0x0000147a      67c8           beq.b 0x1444
│           ; CODE XREF from fcn.0000141a @ 0x1440(x)
│           0x0000147c      2007           move.l d7, d0
│           0x0000147e      5380           subq.l 0x1, d0
│           0x00001480      6612           bne.b 0x1494
│           0x00001482      41ec0634       lea.l 0x634(a4), a0
│           0x00001486      7001           moveq 0x1, d0
│           0x00001488      61000356       bsr.w fcn.000017e0
│           0x0000148c      206c6c24       movea.l 0x6c24(a4), a0
│           0x00001490      52a800e8       addq.l 0x1, 0xe8(a0)
│           ; CODE XREF from fcn.0000141a @ 0x1480(x)
│           0x00001494      206c6c24       movea.l 0x6c24(a4), a0
│           0x00001498      202800e8       move.l 0xe8(a0), d0
│           0x0000149c      b0ac6c40       cmp.l 0x6c40(a4), d0
│           0x000014a0      662a           bne.b 0x14cc
│           0x000014a2      41ec0636       lea.l 0x636(a4), a0
│           0x000014a6      43ef000c       lea.l 0xc(a7), a1
│           0x000014aa      6100055a       bsr.w fcn.00001a06
│           0x000014ae      41ec0652       lea.l 0x652(a4), a0
│           0x000014b2      7000           moveq 0x0, d0
│           0x000014b4      6100ff64       bsr.w fcn.0000141a
│           0x000014b8      41ec066e       lea.l 0x66e(a4), a0
│           0x000014bc      7000           moveq 0x0, d0
│           0x000014be      6100ff5a       bsr.w fcn.0000141a
│           0x000014c2      41ec068a       lea.l 0x68a(a4), a0
│           0x000014c6      7000           moveq 0x0, d0
│           0x000014c8      6100ff50       bsr.w fcn.0000141a
│           ; CODE XREF from fcn.0000141a @ 0x14a0(x)
│           0x000014cc      4cdf20c0       movem.l (a7)+, d6-d7/a5
│           0x000014d0      defc0050       adda.w 0x50, a7
└           0x000014d4      4e75           rts
            0x000014d6      9efc0050       suba.w 0x50, a7
            0x000014da      48e70304       movem.l d6-d7/a5, -(a7)
            0x000014de      2e00           move.l d0, d7
            0x000014e0      2a48           movea.l a0, a5
            0x000014e2      204d           movea.l a5, a0
            ; CODE XREF from fcn.0000141a @ +0xcc(x)
            0x000014e4      4a18           tst.b (a0)+
            0x000014e6      66fc           bne.b 0x14e4
            0x000014e8      5388           subq.l 0x1, a0
            0x000014ea      91cd           suba.l a5, a0
            0x000014ec      2008           move.l a0, d0
            0x000014ee      7250           moveq 0x50, d1
            0x000014f0      b081           cmp.l d1, d0
            0x000014f2      640a           bcc.b 0x14fe
            0x000014f4      204d           movea.l a5, a0
            0x000014f6      7000           moveq 0x0, d0
            0x000014f8      6100037c       bsr.w fcn.00001876
            0x000014fc      603a           bra.b 0x1538
            ; CODE XREF from fcn.0000141a @ +0xd8(x)
            0x000014fe      7c00           moveq 0x0, d6
            ; CODE XREF from fcn.0000141a @ +0x11c(x)
            0x00001500      204d           movea.l a5, a0
            0x00001502      d1c6           adda.l d6, a0
            0x00001504      2f08           move.l a0, -(a7)
            0x00001506      486c06a6       pea.l 0x6a6(a4)
            0x0000150a      486f0014       pea.l 0x14(a7)
            0x0000150e      4eba2a3c       jsr fcn.00003f4c(pc)
            0x00001512      41ef0018       lea.l 0x18(a7), a0
            0x00001516      7000           moveq 0x0, d0
            0x00001518      6100035c       bsr.w fcn.00001876
            0x0000151c      4fef000c       lea.l 0xc(a7), a7
            0x00001520      704f           moveq 0x4f, d0
            0x00001522      dc80           add.l d0, d6
            0x00001524      41ef000c       lea.l 0xc(a7), a0
            0x00001528      2248           movea.l a0, a1
            ; CODE XREF from fcn.0000141a @ +0x112(x)
            0x0000152a      4a19           tst.b (a1)+
            0x0000152c      66fc           bne.b 0x152a
            0x0000152e      5389           subq.l 0x1, a1
            0x00001530      93c8           suba.l a0, a1
            0x00001532      b2fc004f       cmpa.w 0x4f, a1
            0x00001536      67c8           beq.b 0x1500
            ; CODE XREF from fcn.0000141a @ +0xe2(x)
            0x00001538      2007           move.l d7, d0
            0x0000153a      5380           subq.l 0x1, d0
            0x0000153c      660a           bne.b 0x1548
            0x0000153e      41ec06ac       lea.l 0x6ac(a4), a0
            0x00001542      7001           moveq 0x1, d0
            0x00001544      61000330       bsr.w fcn.00001876
            ; CODE XREF from fcn.0000141a @ +0x122(x)
            0x00001548      4cdf20c0       movem.l (a7)+, d6-d7/a5
            0x0000154c      defc0050       adda.w 0x50, a7
            0x00001550      4e75           rts
            0x00001552      48e70006       movem.l a5-a6, -(a7)
            0x00001556      2a48           movea.l a0, a5
            0x00001558      206c6c24       movea.l 0x6c24(a4), a0
            0x0000155c      d0fc0014       adda.w 0x14, a0
            0x00001560      224d           movea.l a5, a1
            ; CODE XREF from fcn.0000141a @ +0x14a(x)
            0x00001562      10d9           move.b (a1)+, (a0)+
            0x00001564      66fc           bne.b 0x1562
            0x00001566      206c6c24       movea.l 0x6c24(a4), a0
            0x0000156a      217c000000..   move.l 0x89, 0xe0(a0)
            0x00001572      206c6c1c       movea.l 0x6c1c(a4), a0
            0x00001576      226c6c24       movea.l 0x6c24(a4), a1
            0x0000157a      2c780004       movea.l 0x4.w, a6
            0x0000157e      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x00001582      206c6c20       movea.l 0x6c20(a4), a0
            0x00001586      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x0000158a      206c6c20       movea.l 0x6c20(a4), a0
            0x0000158e      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x00001592      206c6c24       movea.l 0x6c24(a4), a0
            0x00001596      202800dc       move.l 0xdc(a0), d0
            0x0000159a      6716           beq.b 0x15b2
            0x0000159c      7201           moveq 0x1, d1
            0x0000159e      b081           cmp.l d1, d0
            0x000015a0      6604           bne.b 0x15a6
            0x000015a2      2001           move.l d1, d0
            0x000015a4      600c           bra.b 0x15b2
            ; CODE XREF from fcn.0000141a @ +0x186(x)
            0x000015a6      70fe           moveq 0xfe, d0
            0x000015a8      b0a800dc       cmp.l 0xdc(a0), d0
            0x000015ac      6604           bne.b 0x15b2
            0x000015ae      61000ae6       bsr.w fcn.00002096
            ; CODE XREFS from fcn.0000141a @ +0x180(x), +0x18a(x), +0x192(x)
            0x000015b2      4cdf6000       movem.l (a7)+, a5-a6
            0x000015b6      4e75           rts
            0x000015b8      48e70006       movem.l a5-a6, -(a7)
            0x000015bc      2a48           movea.l a0, a5
            0x000015be      206c6c24       movea.l 0x6c24(a4), a0
            0x000015c2      214d00f8       move.l a5, 0xf8(a0)
            0x000015c6      206c6c24       movea.l 0x6c24(a4), a0
            0x000015ca      217c000002..   move.l 0x21e, 0xe0(a0)
            0x000015d2      206c6c1c       movea.l 0x6c1c(a4), a0
            0x000015d6      226c6c24       movea.l 0x6c24(a4), a1
            0x000015da      2c780004       movea.l 0x4.w, a6
            0x000015de      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x000015e2      206c6c20       movea.l 0x6c20(a4), a0
            0x000015e6      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x000015ea      206c6c20       movea.l 0x6c20(a4), a0
            0x000015ee      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x000015f2      206c6c24       movea.l 0x6c24(a4), a0
            0x000015f6      202800dc       move.l 0xdc(a0), d0
            0x000015fa      6716           beq.b 0x1612
            0x000015fc      7201           moveq 0x1, d1
            0x000015fe      b081           cmp.l d1, d0
            0x00001600      6604           bne.b 0x1606
            0x00001602      2001           move.l d1, d0
            0x00001604      600c           bra.b 0x1612
            ; CODE XREF from fcn.0000141a @ +0x1e6(x)
            0x00001606      70fe           moveq 0xfe, d0
            0x00001608      b0a800dc       cmp.l 0xdc(a0), d0
            0x0000160c      6604           bne.b 0x1612
            0x0000160e      61000a86       bsr.w fcn.00002096
            ; CODE XREFS from fcn.0000141a @ +0x1e0(x), +0x1ea(x), +0x1f2(x)
            0x00001612      4cdf6000       movem.l (a7)+, a5-a6
            0x00001616      4e75           rts
            0x00001618      48e70006       movem.l a5-a6, -(a7)
            0x0000161c      2a48           movea.l a0, a5
            0x0000161e      206c6c24       movea.l 0x6c24(a4), a0
            0x00001622      214d00f8       move.l a5, 0xf8(a0)
            0x00001626      206c6c24       movea.l 0x6c24(a4), a0
            0x0000162a      217c000002..   move.l 0x263, 0xe0(a0)
            0x00001632      206c6c1c       movea.l 0x6c1c(a4), a0
            0x00001636      226c6c24       movea.l 0x6c24(a4), a1
            0x0000163a      2c780004       movea.l 0x4.w, a6
            0x0000163e      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x00001642      206c6c20       movea.l 0x6c20(a4), a0
            0x00001646      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x0000164a      206c6c20       movea.l 0x6c20(a4), a0
            0x0000164e      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x00001652      206c6c24       movea.l 0x6c24(a4), a0
            0x00001656      202800dc       move.l 0xdc(a0), d0
            0x0000165a      6716           beq.b 0x1672
            0x0000165c      7201           moveq 0x1, d1
            0x0000165e      b081           cmp.l d1, d0
            0x00001660      6604           bne.b 0x1666
            0x00001662      2001           move.l d1, d0
            0x00001664      600c           bra.b 0x1672
            ; CODE XREF from fcn.0000141a @ +0x246(x)
            0x00001666      70fe           moveq 0xfe, d0
            0x00001668      b0a800dc       cmp.l 0xdc(a0), d0
            0x0000166c      6604           bne.b 0x1672
            0x0000166e      61000a26       bsr.w fcn.00002096
            ; CODE XREFS from fcn.0000141a @ +0x240(x), +0x24a(x), +0x252(x)
            0x00001672      4cdf6000       movem.l (a7)+, a5-a6
            0x00001676      4e75           rts
            0x00001678      48e70006       movem.l a5-a6, -(a7)
            0x0000167c      2a48           movea.l a0, a5
            0x0000167e      206c6c24       movea.l 0x6c24(a4), a0
            0x00001682      d0fc0014       adda.w 0x14, a0
            0x00001686      224d           movea.l a5, a1
            ; CODE XREF from fcn.0000141a @ +0x270(x)
            0x00001688      10d9           move.b (a1)+, (a0)+
            0x0000168a      66fc           bne.b 0x1688
            0x0000168c      206c6c24       movea.l 0x6c24(a4), a0
            0x00001690      217c000000..   move.l 0x8a, 0xe0(a0)
            0x00001698      206c6c1c       movea.l 0x6c1c(a4), a0
            0x0000169c      226c6c24       movea.l 0x6c24(a4), a1
            0x000016a0      2c780004       movea.l 0x4.w, a6
            0x000016a4      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x000016a8      206c6c20       movea.l 0x6c20(a4), a0
            0x000016ac      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x000016b0      206c6c20       movea.l 0x6c20(a4), a0
            0x000016b4      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x000016b8      206c6c24       movea.l 0x6c24(a4), a0
            0x000016bc      202800dc       move.l 0xdc(a0), d0
            0x000016c0      6716           beq.b 0x16d8
            0x000016c2      7201           moveq 0x1, d1
            0x000016c4      b081           cmp.l d1, d0
            0x000016c6      6604           bne.b 0x16cc
            0x000016c8      2001           move.l d1, d0
            0x000016ca      600c           bra.b 0x16d8
            ; CODE XREF from fcn.0000141a @ +0x2ac(x)
            0x000016cc      70fe           moveq 0xfe, d0
            0x000016ce      b0a800dc       cmp.l 0xdc(a0), d0
            0x000016d2      6604           bne.b 0x16d8
            0x000016d4      610009c0       bsr.w fcn.00002096
            ; CODE XREFS from fcn.0000141a @ +0x2a6(x), +0x2b0(x), +0x2b8(x)
            0x000016d8      4cdf6000       movem.l (a7)+, a5-a6
            0x000016dc      4e75           rts
            0x000016de      48e70006       movem.l a5-a6, -(a7)
            0x000016e2      2a48           movea.l a0, a5
            0x000016e4      206c6c24       movea.l 0x6c24(a4), a0
            0x000016e8      d0fc0014       adda.w 0x14, a0
            0x000016ec      224d           movea.l a5, a1
            ; CODE XREF from fcn.0000141a @ +0x2d6(x)
            0x000016ee      10d9           move.b (a1)+, (a0)+
            0x000016f0      66fc           bne.b 0x16ee
            0x000016f2      206c6c24       movea.l 0x6c24(a4), a0
            0x000016f6      217c000002..   move.l 0x262, 0xe0(a0)
            0x000016fe      206c6c1c       movea.l 0x6c1c(a4), a0
            0x00001702      226c6c24       movea.l 0x6c24(a4), a1
            0x00001706      2c780004       movea.l 0x4.w, a6
            0x0000170a      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x0000170e      206c6c20       movea.l 0x6c20(a4), a0
            0x00001712      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x00001716      206c6c20       movea.l 0x6c20(a4), a0
            0x0000171a      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x0000171e      206c6c24       movea.l 0x6c24(a4), a0
            0x00001722      202800dc       move.l 0xdc(a0), d0
            0x00001726      6716           beq.b 0x173e
            0x00001728      7201           moveq 0x1, d1
            0x0000172a      b081           cmp.l d1, d0
            0x0000172c      6604           bne.b 0x1732
            0x0000172e      2001           move.l d1, d0
            0x00001730      600c           bra.b 0x173e
            ; CODE XREF from fcn.0000141a @ +0x312(x)
            0x00001732      70fe           moveq 0xfe, d0
            0x00001734      b0a800dc       cmp.l 0xdc(a0), d0
            0x00001738      6604           bne.b 0x173e
            0x0000173a      6100095a       bsr.w fcn.00002096
            ; CODE XREFS from fcn.0000141a @ +0x30c(x), +0x316(x), +0x31e(x)
            0x0000173e      4cdf6000       movem.l (a7)+, a5-a6
            0x00001742      4e75           rts
            0x00001744      48e70106       movem.l d7/a5-a6, -(a7)
            0x00001748      2e00           move.l d0, d7
            0x0000174a      2a48           movea.l a0, a5
            0x0000174c      206c6c24       movea.l 0x6c24(a4), a0
            0x00001750      214700dc       move.l d7, 0xdc(a0)
            0x00001754      700a           moveq 0xa, d0
            0x00001756      206c6c24       movea.l 0x6c24(a4), a0
            0x0000175a      214000e0       move.l d0, 0xe0(a0)
            0x0000175e      206c6c24       movea.l 0x6c24(a4), a0
            0x00001762      d0fc0014       adda.w 0x14, a0
            0x00001766      224d           movea.l a5, a1
            ; CODE XREF from fcn.0000141a @ +0x350(x)
            0x00001768      10d9           move.b (a1)+, (a0)+
            0x0000176a      66fc           bne.b 0x1768
            0x0000176c      206c6c1c       movea.l 0x6c1c(a4), a0
            0x00001770      226c6c24       movea.l 0x6c24(a4), a1
            0x00001774      2c780004       movea.l 0x4.w, a6
            0x00001778      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x0000177c      206c6c20       movea.l 0x6c20(a4), a0
            0x00001780      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x00001784      206c6c20       movea.l 0x6c20(a4), a0
            0x00001788      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x0000178c      4cdf6080       movem.l (a7)+, d7/a5-a6
            0x00001790      4e75           rts
            0x00001792      48e70106       movem.l d7/a5-a6, -(a7)
            0x00001796      2e00           move.l d0, d7
            0x00001798      2a48           movea.l a0, a5
            0x0000179a      206c6c24       movea.l 0x6c24(a4), a0
            0x0000179e      214700dc       move.l d7, 0xdc(a0)
            0x000017a2      7012           moveq 0x12, d0
            0x000017a4      206c6c24       movea.l 0x6c24(a4), a0
            0x000017a8      214000e0       move.l d0, 0xe0(a0)
            0x000017ac      206c6c24       movea.l 0x6c24(a4), a0
            0x000017b0      d0fc0014       adda.w 0x14, a0
            0x000017b4      224d           movea.l a5, a1
            ; CODE XREF from fcn.0000141a @ +0x39e(x)
            0x000017b6      10d9           move.b (a1)+, (a0)+
            0x000017b8      66fc           bne.b 0x17b6
            0x000017ba      206c6c1c       movea.l 0x6c1c(a4), a0
            0x000017be      226c6c24       movea.l 0x6c24(a4), a1
            0x000017c2      2c780004       movea.l 0x4.w, a6
            0x000017c6      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x000017ca      206c6c20       movea.l 0x6c20(a4), a0
            0x000017ce      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x000017d2      206c6c20       movea.l 0x6c20(a4), a0
            0x000017d6      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x000017da      4cdf6080       movem.l (a7)+, d7/a5-a6
            0x000017de      4e75           rts
            ; CALL XREFS from fcn.0000141a @ 0x143c(x), 0x145c(x), 0x1488(x)
┌ 78: fcn.000017e0 ();
│           0x000017e0      48e70106       movem.l d7/a5-a6, -(a7)
│           0x000017e4      2e00           move.l d0, d7
│           0x000017e6      2a48           movea.l a0, a5
│           0x000017e8      206c6c24       movea.l 0x6c24(a4), a0
│           0x000017ec      214700dc       move.l d7, 0xdc(a0)
│           0x000017f0      7004           moveq 0x4, d0
│           0x000017f2      206c6c24       movea.l 0x6c24(a4), a0
│           0x000017f6      214000e0       move.l d0, 0xe0(a0)
│           0x000017fa      206c6c24       movea.l 0x6c24(a4), a0
│           0x000017fe      d0fc0014       adda.w 0x14, a0
│           0x00001802      224d           movea.l a5, a1
│           ; CODE XREF from fcn.000017e0 @ 0x1806(x)
│           0x00001804      10d9           move.b (a1)+, (a0)+
│           0x00001806      66fc           bne.b 0x1804
│           0x00001808      206c6c1c       movea.l 0x6c1c(a4), a0
│           0x0000180c      226c6c24       movea.l 0x6c24(a4), a1
│           0x00001810      2c780004       movea.l 0x4, a6
│           0x00001814      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
│           0x00001818      206c6c20       movea.l 0x6c20(a4), a0
│           0x0000181c      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
│           0x00001820      206c6c20       movea.l 0x6c20(a4), a0
│           0x00001824      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
│           0x00001828      4cdf6080       movem.l (a7)+, d7/a5-a6
└           0x0000182c      4e75           rts
            0x0000182e      48e70106       movem.l d7/a5-a6, -(a7)
            0x00001832      2e00           move.l d0, d7
            0x00001834      2a48           movea.l a0, a5
            0x00001836      206c6c24       movea.l 0x6c24(a4), a0
            0x0000183a      214700dc       move.l d7, 0xdc(a0)
            0x0000183e      7013           moveq 0x13, d0
            0x00001840      206c6c24       movea.l 0x6c24(a4), a0
            0x00001844      214000e0       move.l d0, 0xe0(a0)
            0x00001848      206c6c24       movea.l 0x6c24(a4), a0
            0x0000184c      214d0100       move.l a5, 0x100(a0)
            0x00001850      206c6c1c       movea.l 0x6c1c(a4), a0
            0x00001854      226c6c24       movea.l 0x6c24(a4), a1
            0x00001858      2c780004       movea.l 0x4.w, a6
            0x0000185c      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x00001860      206c6c20       movea.l 0x6c20(a4), a0
            0x00001864      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x00001868      206c6c20       movea.l 0x6c20(a4), a0
            0x0000186c      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x00001870      4cdf6080       movem.l (a7)+, d7/a5-a6
            0x00001874      4e75           rts
            ; CALL XREFS from fcn.0000141a @ +0xde(x), +0xfe(x), +0x12a(x)
┌ 80: fcn.00001876 ();
│           0x00001876      48e70106       movem.l d7/a5-a6, -(a7)
│           0x0000187a      2e00           move.l d0, d7
│           0x0000187c      2a48           movea.l a0, a5
│           0x0000187e      206c6c24       movea.l 0x6c24(a4), a0
│           0x00001882      214700dc       move.l d7, 0xdc(a0)
│           0x00001886      206c6c24       movea.l 0x6c24(a4), a0
│           0x0000188a      217c000001..   move.l 0x1fb, 0xe0(a0)
│           0x00001892      206c6c24       movea.l 0x6c24(a4), a0
│           0x00001896      d0fc0014       adda.w 0x14, a0
│           0x0000189a      224d           movea.l a5, a1
│           ; CODE XREF from fcn.00001876 @ 0x189e(x)
│           0x0000189c      10d9           move.b (a1)+, (a0)+
│           0x0000189e      66fc           bne.b 0x189c
│           0x000018a0      206c6c1c       movea.l 0x6c1c(a4), a0
│           0x000018a4      226c6c24       movea.l 0x6c24(a4), a1
│           0x000018a8      2c780004       movea.l 0x4, a6
│           0x000018ac      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
│           0x000018b0      206c6c20       movea.l 0x6c20(a4), a0
│           0x000018b4      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
│           0x000018b8      206c6c20       movea.l 0x6c20(a4), a0
│           0x000018bc      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
│           0x000018c0      4cdf6080       movem.l (a7)+, d7/a5-a6
└           0x000018c4      4e75           rts
            0x000018c6      48e70102       movem.l d7/a6, -(a7)
            0x000018ca      2e00           move.l d0, d7
            0x000018cc      206c6c24       movea.l 0x6c24(a4), a0
            0x000018d0      214700e0       move.l d7, 0xe0(a0)
            0x000018d4      206c6c24       movea.l 0x6c24(a4), a0
            0x000018d8      42a800dc       clr.l 0xdc(a0)
            0x000018dc      206c6c24       movea.l 0x6c24(a4), a0
            0x000018e0      117c00010014   move.b 0x1, 0x14(a0)
            0x000018e6      206c6c1c       movea.l 0x6c1c(a4), a0
            0x000018ea      226c6c24       movea.l 0x6c24(a4), a1
            0x000018ee      2c780004       movea.l 0x4.w, a6
            0x000018f2      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x000018f6      206c6c20       movea.l 0x6c20(a4), a0
            0x000018fa      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x000018fe      206c6c20       movea.l 0x6c20(a4), a0
            0x00001902      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x00001906      206c6c28       movea.l 0x6c28(a4), a0
            0x0000190a      202800dc       move.l 0xdc(a0), d0
            0x0000190e      4cdf4080       movem.l (a7)+, d7/a6
            0x00001912      4e75           rts
            0x00001914      48e70302       movem.l d6-d7/a6, -(a7)
            0x00001918      2c01           move.l d1, d6
            0x0000191a      2e00           move.l d0, d7
            0x0000191c      206c6c24       movea.l 0x6c24(a4), a0
            0x00001920      214600e0       move.l d6, 0xe0(a0)
            0x00001924      206c6c24       movea.l 0x6c24(a4), a0
            0x00001928      214700dc       move.l d7, 0xdc(a0)
            0x0000192c      206c6c24       movea.l 0x6c24(a4), a0
            0x00001930      117c00010014   move.b 0x1, 0x14(a0)
            0x00001936      206c6c1c       movea.l 0x6c1c(a4), a0
            0x0000193a      226c6c24       movea.l 0x6c24(a4), a1
            0x0000193e      2c780004       movea.l 0x4.w, a6
            0x00001942      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x00001946      206c6c20       movea.l 0x6c20(a4), a0
            0x0000194a      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x0000194e      206c6c20       movea.l 0x6c20(a4), a0
            0x00001952      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x00001956      206c6c28       movea.l 0x6c28(a4), a0
            0x0000195a      202800dc       move.l 0xdc(a0), d0
            0x0000195e      4cdf40c0       movem.l (a7)+, d6-d7/a6
            0x00001962      4e75           rts
            ; CALL XREFS from fcn.000009e6 @ 0xa06(x), 0xd20(x)
┌ 70: fcn.00001964 ();
│           0x00001964      48e70302       movem.l d6-d7/a6, -(a7)
│           0x00001968      2c01           move.l d1, d6
│           0x0000196a      2e00           move.l d0, d7
│           0x0000196c      206c6c24       movea.l 0x6c24(a4), a0
│           0x00001970      214600e0       move.l d6, 0xe0(a0)
│           0x00001974      206c6c24       movea.l 0x6c24(a4), a0
│           0x00001978      214700dc       move.l d7, 0xdc(a0)
│           0x0000197c      206c6c24       movea.l 0x6c24(a4), a0
│           0x00001980      42280014       clr.b 0x14(a0)
│           0x00001984      206c6c1c       movea.l 0x6c1c(a4), a0
│           0x00001988      226c6c24       movea.l 0x6c24(a4), a1
│           0x0000198c      2c780004       movea.l 0x4, a6
│           0x00001990      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
│           0x00001994      206c6c20       movea.l 0x6c20(a4), a0
│           0x00001998      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
│           0x0000199c      206c6c20       movea.l 0x6c20(a4), a0
│           0x000019a0      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
│           0x000019a4      4cdf40c0       movem.l (a7)+, d6-d7/a6
└           0x000019a8      4e75           rts
            0x000019aa      594f           subq.w 0x4, a7
            0x000019ac      48e70106       movem.l d7/a5-a6, -(a7)
            0x000019b0      2e00           move.l d0, d7
            0x000019b2      2a48           movea.l a0, a5
            0x000019b4      1f55000d       move.b (a5), 0xd(a7)
            0x000019b8      422f000e       clr.b 0xe(a7)
            0x000019bc      206c6c24       movea.l 0x6c24(a4), a0
            0x000019c0      214700dc       move.l d7, 0xdc(a0)
            0x000019c4      7004           moveq 0x4, d0
            0x000019c6      206c6c24       movea.l 0x6c24(a4), a0
            0x000019ca      214000e0       move.l d0, 0xe0(a0)
            0x000019ce      206c6c24       movea.l 0x6c24(a4), a0
            0x000019d2      d0fc0014       adda.w 0x14, a0
            0x000019d6      43ef000d       lea.l 0xd(a7), a1
            ; CODE XREF from fcn.00001964 @ +0x78(x)
            0x000019da      10d9           move.b (a1)+, (a0)+
            0x000019dc      66fc           bne.b 0x19da
            0x000019de      206c6c1c       movea.l 0x6c1c(a4), a0
            0x000019e2      226c6c24       movea.l 0x6c24(a4), a1
            0x000019e6      2c780004       movea.l 0x4.w, a6
            0x000019ea      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x000019ee      206c6c20       movea.l 0x6c20(a4), a0
            0x000019f2      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x000019f6      206c6c20       movea.l 0x6c20(a4), a0
            0x000019fa      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x000019fe      4cdf6080       movem.l (a7)+, d7/a5-a6
            0x00001a02      584f           addq.w 0x4, a7
            0x00001a04      4e75           rts
            ; CALL XREF from fcn.000002f4 @ 0x4b8(x)
            ; CALL XREF from fcn.00000d2e @ 0xe0c(x)
            ; CALL XREF from fcn.0000141a @ 0x14aa(x)
┌ 108: fcn.00001a06 ();
│           0x00001a06      48e70016       movem.l a3/a5-a6, -(a7)
│           0x00001a0a      2649           movea.l a1, a3
│           0x00001a0c      2a48           movea.l a0, a5
│           0x00001a0e      206c6c24       movea.l 0x6c24(a4), a0
│           0x00001a12      42a800e8       clr.l 0xe8(a0)
│           0x00001a16      206c6c24       movea.l 0x6c24(a4), a0
│           0x00001a1a      d0fc0014       adda.w 0x14, a0
│           0x00001a1e      224d           movea.l a5, a1
│           ; CODE XREF from fcn.00001a06 @ 0x1a22(x)
│           0x00001a20      10d9           move.b (a1)+, (a0)+
│           0x00001a22      66fc           bne.b 0x1a20
│           0x00001a24      7006           moveq 0x6, d0
│           0x00001a26      206c6c24       movea.l 0x6c24(a4), a0
│           0x00001a2a      214000e0       move.l d0, 0xe0(a0)
│           0x00001a2e      206c6c1c       movea.l 0x6c1c(a4), a0
│           0x00001a32      226c6c24       movea.l 0x6c24(a4), a1
│           0x00001a36      2c780004       movea.l 0x4, a6
│           0x00001a3a      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
│           0x00001a3e      206c6c20       movea.l 0x6c20(a4), a0
│           0x00001a42      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
│           0x00001a46      206c6c20       movea.l 0x6c20(a4), a0
│           0x00001a4a      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
│           0x00001a4e      206c6c24       movea.l 0x6c24(a4), a0
│           0x00001a52      d0fc0014       adda.w 0x14, a0
│           0x00001a56      224b           movea.l a3, a1
│           ; CODE XREF from fcn.00001a06 @ 0x1a5a(x)
│           0x00001a58      12d8           move.b (a0)+, (a1)+
│           0x00001a5a      66fc           bne.b 0x1a58
│           0x00001a5c      70ff           moveq 0xff, d0
│           0x00001a5e      206c6c24       movea.l 0x6c24(a4), a0
│           0x00001a62      b0a800dc       cmp.l 0xdc(a0), d0
│           0x00001a66      6604           bne.b 0x1a6c
│           0x00001a68      6100062c       bsr.w fcn.00002096
│           ; CODE XREF from fcn.00001a06 @ 0x1a66(x)
│           0x00001a6c      4cdf6800       movem.l (a7)+, a3/a5-a6
└           0x00001a70      4e75           rts
            0x00001a72      2f0e           move.l a6, -(a7)
            0x00001a74      206c6c24       movea.l 0x6c24(a4), a0
            0x00001a78      42a800e8       clr.l 0xe8(a0)
            0x00001a7c      206c6c24       movea.l 0x6c24(a4), a0
            0x00001a80      217c000002..   move.l 0x260, 0xe0(a0)
            0x00001a88      206c6c1c       movea.l 0x6c1c(a4), a0
            0x00001a8c      226c6c24       movea.l 0x6c24(a4), a1
            0x00001a90      2c780004       movea.l 0x4.w, a6
            0x00001a94      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x00001a98      206c6c20       movea.l 0x6c20(a4), a0
            0x00001a9c      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x00001aa0      206c6c20       movea.l 0x6c20(a4), a0
            0x00001aa4      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x00001aa8      206c6c24       movea.l 0x6c24(a4), a0
            0x00001aac      202800dc       move.l 0xdc(a0), d0
            0x00001ab0      4a80           tst.l d0
            0x00001ab2      6a04           bpl.b 0x1ab8
            0x00001ab4      610005e0       bsr.w fcn.00002096
            ; CODE XREF from fcn.00001a06 @ +0xac(x)
            0x00001ab8      206c6c24       movea.l 0x6c24(a4), a0
            0x00001abc      202800dc       move.l 0xdc(a0), d0
            0x00001ac0      2c5f           movea.l (a7)+, a6
            0x00001ac2      4e75           rts
            0x00001ac4      2f0e           move.l a6, -(a7)
            0x00001ac6      206c6c24       movea.l 0x6c24(a4), a0
            0x00001aca      42a800e8       clr.l 0xe8(a0)
            0x00001ace      7011           moveq 0x11, d0
            0x00001ad0      206c6c24       movea.l 0x6c24(a4), a0
            0x00001ad4      214000e0       move.l d0, 0xe0(a0)
            0x00001ad8      206c6c1c       movea.l 0x6c1c(a4), a0
            0x00001adc      226c6c24       movea.l 0x6c24(a4), a1
            0x00001ae0      2c780004       movea.l 0x4.w, a6
            0x00001ae4      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x00001ae8      206c6c20       movea.l 0x6c20(a4), a0
            0x00001aec      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x00001af0      206c6c20       movea.l 0x6c20(a4), a0
            0x00001af4      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x00001af8      70ff           moveq 0xff, d0
            0x00001afa      206c6c24       movea.l 0x6c24(a4), a0
            0x00001afe      b0a800dc       cmp.l 0xdc(a0), d0
            0x00001b02      6604           bne.b 0x1b08
            0x00001b04      61000590       bsr.w fcn.00002096
            ; CODE XREF from fcn.00001a06 @ +0xfc(x)
            0x00001b08      206c6c24       movea.l 0x6c24(a4), a0
            0x00001b0c      202800e0       move.l 0xe0(a0), d0
            0x00001b10      2c5f           movea.l (a7)+, a6
            0x00001b12      4e75           rts
            0x00001b14      2f0e           move.l a6, -(a7)
            0x00001b16      700f           moveq 0xf, d0
            0x00001b18      206c6c24       movea.l 0x6c24(a4), a0
            0x00001b1c      214000e0       move.l d0, 0xe0(a0)
            0x00001b20      206c6c1c       movea.l 0x6c1c(a4), a0
            0x00001b24      226c6c24       movea.l 0x6c24(a4), a1
            0x00001b28      2c780004       movea.l 0x4.w, a6
            0x00001b2c      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x00001b30      206c6c20       movea.l 0x6c20(a4), a0
            0x00001b34      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x00001b38      206c6c20       movea.l 0x6c20(a4), a0
            0x00001b3c      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x00001b40      70ff           moveq 0xff, d0
            0x00001b42      206c6c24       movea.l 0x6c24(a4), a0
            0x00001b46      b0a800dc       cmp.l 0xdc(a0), d0
            0x00001b4a      6604           bne.b 0x1b50
            0x00001b4c      61000548       bsr.w fcn.00002096
            ; CODE XREF from fcn.00001a06 @ +0x144(x)
            0x00001b50      206c6c24       movea.l 0x6c24(a4), a0
            0x00001b54      202800e0       move.l 0xe0(a0), d0
            0x00001b58      2c5f           movea.l (a7)+, a6
            0x00001b5a      4e75           rts
            0x00001b5c      2f0e           move.l a6, -(a7)
            0x00001b5e      206c6c24       movea.l 0x6c24(a4), a0
            0x00001b62      42a800e8       clr.l 0xe8(a0)
            0x00001b66      7006           moveq 0x6, d0
            0x00001b68      206c6c24       movea.l 0x6c24(a4), a0
            0x00001b6c      214000e0       move.l d0, 0xe0(a0)
            0x00001b70      206c6c24       movea.l 0x6c24(a4), a0
            0x00001b74      d0fc0014       adda.w 0x14, a0
            0x00001b78      43ec06ae       lea.l 0x6ae(a4), a1
            ; CODE XREF from fcn.00001a06 @ +0x178(x)
            0x00001b7c      10d9           move.b (a1)+, (a0)+
            0x00001b7e      66fc           bne.b 0x1b7c
            0x00001b80      206c6c1c       movea.l 0x6c1c(a4), a0
            0x00001b84      226c6c24       movea.l 0x6c24(a4), a1
            0x00001b88      2c780004       movea.l 0x4.w, a6
            0x00001b8c      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x00001b90      206c6c20       movea.l 0x6c20(a4), a0
            0x00001b94      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x00001b98      206c6c20       movea.l 0x6c20(a4), a0
            0x00001b9c      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x00001ba0      70ff           moveq 0xff, d0
            0x00001ba2      206c6c24       movea.l 0x6c24(a4), a0
            0x00001ba6      b0a800dc       cmp.l 0xdc(a0), d0
            0x00001baa      6604           bne.b 0x1bb0
            0x00001bac      610004e8       bsr.w fcn.00002096
            ; CODE XREF from fcn.00001a06 @ +0x1a4(x)
            0x00001bb0      206c6c24       movea.l 0x6c24(a4), a0
            0x00001bb4      10280014       move.b 0x14(a0), d0
            0x00001bb8      2c5f           movea.l (a7)+, a6
            0x00001bba      4e75           rts
            0x00001bbc      2f0e           move.l a6, -(a7)
            0x00001bbe      206c6c24       movea.l 0x6c24(a4), a0
            0x00001bc2      42a800e8       clr.l 0xe8(a0)
            0x00001bc6      206c6c24       movea.l 0x6c24(a4), a0
            0x00001bca      217c000001..   move.l 0x1f4, 0xe0(a0)
            0x00001bd2      206c6c1c       movea.l 0x6c1c(a4), a0
            0x00001bd6      226c6c24       movea.l 0x6c24(a4), a1
            0x00001bda      2c780004       movea.l 0x4.w, a6
            0x00001bde      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x00001be2      206c6c20       movea.l 0x6c20(a4), a0
            0x00001be6      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x00001bea      206c6c20       movea.l 0x6c20(a4), a0
            0x00001bee      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x00001bf2      206c6c24       movea.l 0x6c24(a4), a0
            0x00001bf6      10280014       move.b 0x14(a0), d0
            0x00001bfa      7231           moveq 0x31, d1
            0x00001bfc      b001           cmp.b d1, d0
            0x00001bfe      6604           bne.b 0x1c04
            0x00001c00      7001           moveq 0x1, d0
            0x00001c02      6002           bra.b 0x1c06
            ; CODE XREF from fcn.00001a06 @ +0x1f8(x)
            0x00001c04      7000           moveq 0x0, d0
            ; CODE XREF from fcn.00001a06 @ +0x1fc(x)
            0x00001c06      2c5f           movea.l (a7)+, a6
            0x00001c08      4e75           rts
            0x00001c0a      9efc00c8       suba.w 0xc8, a7
            0x00001c0e      48e73306       movem.l d2-d3/d6-d7/a5-a6, -(a7)
            0x00001c12      2c01           move.l d1, d6
            0x00001c14      2e00           move.l d0, d7
            0x00001c16      2a48           movea.l a0, a5
            0x00001c18      2006           move.l d6, d0
            0x00001c1a      5380           subq.l 0x1, d0
            0x00001c1c      6656           bne.b 0x1c74
            0x00001c1e      2f07           move.l d7, -(a7)
            0x00001c20      2f0d           move.l a5, -(a7)
            0x00001c22      486c06b0       pea.l 0x6b0(a4)
            0x00001c26      486f0024       pea.l 0x24(a7)
            0x00001c2a      4eba2320       jsr fcn.00003f4c(pc)
            0x00001c2e      206c6c24       movea.l 0x6c24(a4), a0
            0x00001c32      217c000001..   move.l 0x1f6, 0xe0(a0)
            0x00001c3a      206c6c1c       movea.l 0x6c1c(a4), a0
            0x00001c3e      226c6c24       movea.l 0x6c24(a4), a1
            0x00001c42      2c780004       movea.l 0x4.w, a6
            0x00001c46      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x00001c4a      206c6c20       movea.l 0x6c20(a4), a0
            0x00001c4e      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x00001c52      206c6c20       movea.l 0x6c20(a4), a0
            0x00001c56      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x00001c5a      6100f72a       bsr.w fcn.00001386
            0x00001c5e      4fef0010       lea.l 0x10(a7), a7
            0x00001c62      41ef0018       lea.l 0x18(a7), a0
            0x00001c66      2208           move.l a0, d1
            0x00001c68      2c6c0988       movea.l 0x988(a4), a6
            0x00001c6c      7400           moveq 0x0, d2
            0x00001c6e      2602           move.l d2, d3
            0x00001c70      4eaeff22       jsr -0xde(a6)               ; fcn.000030f0-0x30f0
            ; CODE XREF from fcn.00001a06 @ +0x216(x)
            0x00001c74      4a86           tst.l d6
            0x00001c76      6626           bne.b 0x1c9e
            0x00001c78      2f07           move.l d7, -(a7)
            0x00001c7a      2f0d           move.l a5, -(a7)
            0x00001c7c      486c06c0       pea.l 0x6c0(a4)
            0x00001c80      486f0024       pea.l 0x24(a7)
            0x00001c84      4eba22c6       jsr fcn.00003f4c(pc)
            0x00001c88      41ef0028       lea.l 0x28(a7), a0
            0x00001c8c      2208           move.l a0, d1
            0x00001c8e      2c6c0988       movea.l 0x988(a4), a6
            0x00001c92      7400           moveq 0x0, d2
            0x00001c94      2602           move.l d2, d3
            0x00001c96      4eaeff22       jsr -0xde(a6)               ; fcn.000030f0-0x30f0
            0x00001c9a      4fef0010       lea.l 0x10(a7), a7
            ; CODE XREF from fcn.00001a06 @ +0x270(x)
            0x00001c9e      4cdf60cc       movem.l (a7)+, d2-d3/d6-d7/a5-a6
            0x00001ca2      defc00c8       adda.w 0xc8, a7
            0x00001ca6      4e75           rts
            0x00001ca8      48e70116       movem.l d7/a3/a5-a6, -(a7)
            0x00001cac      2e00           move.l d0, d7
            0x00001cae      2649           movea.l a1, a3
            0x00001cb0      2a48           movea.l a0, a5
            0x00001cb2      206c6c24       movea.l 0x6c24(a4), a0
            0x00001cb6      42a800e8       clr.l 0xe8(a0)
            0x00001cba      206c6c24       movea.l 0x6c24(a4), a0
            0x00001cbe      d0fc0014       adda.w 0x14, a0
            0x00001cc2      224d           movea.l a5, a1
            ; CODE XREF from fcn.00001a06 @ +0x2c0(x)
            0x00001cc4      10d9           move.b (a1)+, (a0)+
            0x00001cc6      66fc           bne.b 0x1cc4
            0x00001cc8      206c6c24       movea.l 0x6c24(a4), a0
            0x00001ccc      214700dc       move.l d7, 0xdc(a0)
            0x00001cd0      7005           moveq 0x5, d0
            0x00001cd2      206c6c24       movea.l 0x6c24(a4), a0
            0x00001cd6      214000e0       move.l d0, 0xe0(a0)
            0x00001cda      206c6c1c       movea.l 0x6c1c(a4), a0
            0x00001cde      226c6c24       movea.l 0x6c24(a4), a1
            0x00001ce2      2c780004       movea.l 0x4.w, a6
            0x00001ce6      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x00001cea      206c6c20       movea.l 0x6c20(a4), a0
            0x00001cee      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x00001cf2      206c6c20       movea.l 0x6c20(a4), a0
            0x00001cf6      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x00001cfa      206c6c24       movea.l 0x6c24(a4), a0
            0x00001cfe      d0fc0014       adda.w 0x14, a0
            0x00001d02      224b           movea.l a3, a1
            ; CODE XREF from fcn.00001a06 @ +0x300(x)
            0x00001d04      12d8           move.b (a0)+, (a1)+
            0x00001d06      66fc           bne.b 0x1d04
            0x00001d08      70ff           moveq 0xff, d0
            0x00001d0a      206c6c24       movea.l 0x6c24(a4), a0
            0x00001d0e      b0a800dc       cmp.l 0xdc(a0), d0
            0x00001d12      6604           bne.b 0x1d18
            0x00001d14      61000380       bsr.w fcn.00002096
            ; CODE XREF from fcn.00001a06 @ +0x30c(x)
            0x00001d18      4cdf6880       movem.l (a7)+, d7/a3/a5-a6
            0x00001d1c      4e75           rts
            0x00001d1e      594f           subq.w 0x4, a7
            0x00001d20      48e70702       movem.l d5-d7/a6, -(a7)
            0x00001d24      2c01           move.l d1, d6
            0x00001d26      2e00           move.l d0, d7
            0x00001d28      2f480010       move.l a0, 0x10(a7)
            0x00001d2c      206c6c24       movea.l 0x6c24(a4), a0
            0x00001d30      2a2800e8       move.l 0xe8(a0), d5
            0x00001d34      214600e8       move.l d6, 0xe8(a0)
            0x00001d38      206c6c24       movea.l 0x6c24(a4), a0
            0x00001d3c      214700dc       move.l d7, 0xdc(a0)
            0x00001d40      206c6c24       movea.l 0x6c24(a4), a0
            0x00001d44      217c000002..   move.l 0x220, 0xe0(a0)
            0x00001d4c      206c6c1c       movea.l 0x6c1c(a4), a0
            0x00001d50      226c6c24       movea.l 0x6c24(a4), a1
            0x00001d54      2c780004       movea.l 0x4.w, a6
            0x00001d58      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x00001d5c      206c6c20       movea.l 0x6c20(a4), a0
            0x00001d60      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x00001d64      206c6c20       movea.l 0x6c20(a4), a0
            0x00001d68      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x00001d6c      206c6c24       movea.l 0x6c24(a4), a0
            0x00001d70      214500e8       move.l d5, 0xe8(a0)
            0x00001d74      4cdf40e0       movem.l (a7)+, d5-d7/a6
            0x00001d78      584f           addq.w 0x4, a7
            0x00001d7a      4e75           rts
            0x00001d7c      48e70116       movem.l d7/a3/a5-a6, -(a7)
            0x00001d80      2e00           move.l d0, d7
            0x00001d82      2649           movea.l a1, a3
            0x00001d84      2a48           movea.l a0, a5
            0x00001d86      206c6c24       movea.l 0x6c24(a4), a0
            0x00001d8a      42a800e8       clr.l 0xe8(a0)
            0x00001d8e      206c6c24       movea.l 0x6c24(a4), a0
            0x00001d92      d0fc0014       adda.w 0x14, a0
            0x00001d96      224d           movea.l a5, a1
            ; CODE XREF from fcn.00001a06 @ +0x394(x)
            0x00001d98      10d9           move.b (a1)+, (a0)+
            0x00001d9a      66fc           bne.b 0x1d98
            0x00001d9c      206c6c24       movea.l 0x6c24(a4), a0
            0x00001da0      214700dc       move.l d7, 0xdc(a0)
            0x00001da4      206c6c24       movea.l 0x6c24(a4), a0
            0x00001da8      42a800e0       clr.l 0xe0(a0)
            0x00001dac      206c6c1c       movea.l 0x6c1c(a4), a0
            0x00001db0      226c6c24       movea.l 0x6c24(a4), a1
            0x00001db4      2c780004       movea.l 0x4.w, a6
            0x00001db8      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x00001dbc      206c6c20       movea.l 0x6c20(a4), a0
            0x00001dc0      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x00001dc4      206c6c20       movea.l 0x6c20(a4), a0
            0x00001dc8      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x00001dcc      206c6c24       movea.l 0x6c24(a4), a0
            0x00001dd0      d0fc0014       adda.w 0x14, a0
            0x00001dd4      224b           movea.l a3, a1
            ; CODE XREF from fcn.00001a06 @ +0x3d2(x)
            0x00001dd6      12d8           move.b (a0)+, (a1)+
            0x00001dd8      66fc           bne.b 0x1dd6
            0x00001dda      70ff           moveq 0xff, d0
            0x00001ddc      206c6c24       movea.l 0x6c24(a4), a0
            0x00001de0      b0a800dc       cmp.l 0xdc(a0), d0
            0x00001de4      6604           bne.b 0x1dea
            0x00001de6      610002ae       bsr.w fcn.00002096
            ; CODE XREF from fcn.00001a06 @ +0x3de(x)
            0x00001dea      4cdf6880       movem.l (a7)+, d7/a3/a5-a6
            0x00001dee      4e75           rts
            ; CALL XREFS from fcn.00000d2e @ 0xda2(x), 0xde2(x)
┌ 76: fcn.00001df0 ();
│           0x00001df0      48e70006       movem.l a5-a6, -(a7)
│           0x00001df4      2a48           movea.l a0, a5
│           0x00001df6      206c6c24       movea.l 0x6c24(a4), a0
│           0x00001dfa      d0fc0014       adda.w 0x14, a0
│           0x00001dfe      224d           movea.l a5, a1
│           ; CODE XREF from fcn.00001df0 @ 0x1e02(x)
│           0x00001e00      10d9           move.b (a1)+, (a0)+
│           0x00001e02      66fc           bne.b 0x1e00
│           0x00001e04      7008           moveq 0x8, d0
│           0x00001e06      206c6c24       movea.l 0x6c24(a4), a0
│           0x00001e0a      214000e0       move.l d0, 0xe0(a0)
│           0x00001e0e      206c6c24       movea.l 0x6c24(a4), a0
│           0x00001e12      42a800dc       clr.l 0xdc(a0)
│           0x00001e16      206c6c1c       movea.l 0x6c1c(a4), a0
│           0x00001e1a      226c6c24       movea.l 0x6c24(a4), a1
│           0x00001e1e      2c780004       movea.l 0x4, a6
│           0x00001e22      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
│           0x00001e26      206c6c20       movea.l 0x6c20(a4), a0
│           0x00001e2a      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
│           0x00001e2e      206c6c20       movea.l 0x6c20(a4), a0
│           0x00001e32      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
│           0x00001e36      4cdf6000       movem.l (a7)+, a5-a6
└           0x00001e3a      4e75           rts
            ; XREFS: CALL 0x00002112  CALL 0x00002158  CALL 0x0000219e  
            ; XREFS: CALL 0x000021d6  CALL 0x00002202  CALL 0x0000222e  
┌ 76: fcn.00001e3c ();
│           0x00001e3c      48e70006       movem.l a5-a6, -(a7)
│           0x00001e40      2a48           movea.l a0, a5
│           0x00001e42      206c6c24       movea.l 0x6c24(a4), a0
│           0x00001e46      d0fc0014       adda.w 0x14, a0
│           0x00001e4a      224d           movea.l a5, a1
│           ; CODE XREF from fcn.00001e3c @ 0x1e4e(x)
│           0x00001e4c      10d9           move.b (a1)+, (a0)+
│           0x00001e4e      66fc           bne.b 0x1e4c
│           0x00001e50      7007           moveq 0x7, d0
│           0x00001e52      206c6c24       movea.l 0x6c24(a4), a0
│           0x00001e56      214000e0       move.l d0, 0xe0(a0)
│           0x00001e5a      206c6c24       movea.l 0x6c24(a4), a0
│           0x00001e5e      42a800dc       clr.l 0xdc(a0)
│           0x00001e62      206c6c1c       movea.l 0x6c1c(a4), a0
│           0x00001e66      226c6c24       movea.l 0x6c24(a4), a1
│           0x00001e6a      2c780004       movea.l 0x4, a6
│           0x00001e6e      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
│           0x00001e72      206c6c20       movea.l 0x6c20(a4), a0
│           0x00001e76      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
│           0x00001e7a      206c6c20       movea.l 0x6c20(a4), a0
│           0x00001e7e      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
│           0x00001e82      4cdf6000       movem.l (a7)+, a5-a6
└           0x00001e86      4e75           rts
            0x00001e88      48e70006       movem.l a5-a6, -(a7)
            0x00001e8c      2a48           movea.l a0, a5
            0x00001e8e      206c6c24       movea.l 0x6c24(a4), a0
            0x00001e92      d0fc0014       adda.w 0x14, a0
            0x00001e96      224d           movea.l a5, a1
            ; CODE XREF from fcn.00001e3c @ +0x5e(x)
            0x00001e98      10d9           move.b (a1)+, (a0)+
            0x00001e9a      66fc           bne.b 0x1e98
            0x00001e9c      206c6c24       movea.l 0x6c24(a4), a0
            0x00001ea0      217c000002..   move.l 0x269, 0xe0(a0)
            0x00001ea8      206c6c24       movea.l 0x6c24(a4), a0
            0x00001eac      42a800dc       clr.l 0xdc(a0)
            0x00001eb0      206c6c1c       movea.l 0x6c1c(a4), a0
            0x00001eb4      226c6c24       movea.l 0x6c24(a4), a1
            0x00001eb8      2c780004       movea.l 0x4.w, a6
            0x00001ebc      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x00001ec0      206c6c20       movea.l 0x6c20(a4), a0
            0x00001ec4      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x00001ec8      206c6c20       movea.l 0x6c20(a4), a0
            0x00001ecc      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x00001ed0      4cdf6000       movem.l (a7)+, a5-a6
            0x00001ed4      4e75           rts
            0x00001ed6      48e70006       movem.l a5-a6, -(a7)
            0x00001eda      2a48           movea.l a0, a5
            0x00001edc      206c6c24       movea.l 0x6c24(a4), a0
            0x00001ee0      d0fc0014       adda.w 0x14, a0
            0x00001ee4      224d           movea.l a5, a1
            ; CODE XREF from fcn.00001e3c @ +0xac(x)
            0x00001ee6      10d9           move.b (a1)+, (a0)+
            0x00001ee8      66fc           bne.b 0x1ee6
            0x00001eea      206c6c24       movea.l 0x6c24(a4), a0
            0x00001eee      217c000002..   move.l 0x26a, 0xe0(a0)
            0x00001ef6      206c6c24       movea.l 0x6c24(a4), a0
            0x00001efa      42a800dc       clr.l 0xdc(a0)
            0x00001efe      206c6c1c       movea.l 0x6c1c(a4), a0
            0x00001f02      226c6c24       movea.l 0x6c24(a4), a1
            0x00001f06      2c780004       movea.l 0x4.w, a6
            0x00001f0a      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x00001f0e      206c6c20       movea.l 0x6c20(a4), a0
            0x00001f12      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x00001f16      206c6c20       movea.l 0x6c20(a4), a0
            0x00001f1a      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x00001f1e      4cdf6000       movem.l (a7)+, a5-a6
            0x00001f22      4e75           rts
            ; XREFS: CALL 0x00000e4e  CALL 0x00000e58  CALL 0x00000e70  
            ; XREFS: CALL 0x00000ea0  CALL 0x00000eae  CALL 0x000020b0  
┌ 78: fcn.00001f24 ();
│           0x00001f24      48e70106       movem.l d7/a5-a6, -(a7)
│           0x00001f28      2e00           move.l d0, d7
│           0x00001f2a      2a48           movea.l a0, a5
│           0x00001f2c      206c6c24       movea.l 0x6c24(a4), a0
│           0x00001f30      214700e0       move.l d7, 0xe0(a0)
│           0x00001f34      7001           moveq 0x1, d0
│           0x00001f36      206c6c24       movea.l 0x6c24(a4), a0
│           0x00001f3a      214000dc       move.l d0, 0xdc(a0)
│           0x00001f3e      206c6c1c       movea.l 0x6c1c(a4), a0
│           0x00001f42      226c6c24       movea.l 0x6c24(a4), a1
│           0x00001f46      2c780004       movea.l 0x4, a6
│           0x00001f4a      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
│           0x00001f4e      206c6c20       movea.l 0x6c20(a4), a0
│           0x00001f52      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
│           0x00001f56      206c6c20       movea.l 0x6c20(a4), a0
│           0x00001f5a      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
│           0x00001f5e      206c6c24       movea.l 0x6c24(a4), a0
│           0x00001f62      d0fc0014       adda.w 0x14, a0
│           0x00001f66      224d           movea.l a5, a1
│           ; CODE XREF from fcn.00001f24 @ 0x1f6a(x)
│           0x00001f68      12d8           move.b (a0)+, (a1)+
│           0x00001f6a      66fc           bne.b 0x1f68
│           0x00001f6c      4cdf6080       movem.l (a7)+, d7/a5-a6
└           0x00001f70      4e75           rts
            ; CALL XREF from fcn.000002d4 @ 0x2ec(x)
            ; CALL XREF from fcn.000002f4 @ 0x2f8(x)
┌ 76: fcn.00001f72 ();
│           0x00001f72      48e70106       movem.l d7/a5-a6, -(a7)
│           0x00001f76      2e00           move.l d0, d7
│           0x00001f78      2a48           movea.l a0, a5
│           0x00001f7a      206c6c24       movea.l 0x6c24(a4), a0
│           0x00001f7e      214700e0       move.l d7, 0xe0(a0)
│           0x00001f82      206c6c24       movea.l 0x6c24(a4), a0
│           0x00001f86      42a800dc       clr.l 0xdc(a0)
│           0x00001f8a      206c6c24       movea.l 0x6c24(a4), a0
│           0x00001f8e      d0fc0014       adda.w 0x14, a0
│           0x00001f92      224d           movea.l a5, a1
│           ; CODE XREF from fcn.00001f72 @ 0x1f96(x)
│           0x00001f94      10d9           move.b (a1)+, (a0)+
│           0x00001f96      66fc           bne.b 0x1f94
│           0x00001f98      206c6c1c       movea.l 0x6c1c(a4), a0
│           0x00001f9c      226c6c24       movea.l 0x6c24(a4), a1
│           0x00001fa0      2c780004       movea.l 0x4, a6
│           0x00001fa4      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
│           0x00001fa8      206c6c20       movea.l 0x6c20(a4), a0
│           0x00001fac      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
│           0x00001fb0      206c6c20       movea.l 0x6c20(a4), a0
│           0x00001fb4      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
│           0x00001fb8      4cdf6080       movem.l (a7)+, d7/a5-a6
└           0x00001fbc      4e75           rts
            0x00001fbe      48e70116       movem.l d7/a3/a5-a6, -(a7)
            0x00001fc2      2e00           move.l d0, d7
            0x00001fc4      2649           movea.l a1, a3
            0x00001fc6      2a48           movea.l a0, a5
            0x00001fc8      206c6c24       movea.l 0x6c24(a4), a0
            0x00001fcc      214700e0       move.l d7, 0xe0(a0)
            0x00001fd0      206c6c24       movea.l 0x6c24(a4), a0
            0x00001fd4      42a800dc       clr.l 0xdc(a0)
            0x00001fd8      206c6c24       movea.l 0x6c24(a4), a0
            0x00001fdc      d0fc0014       adda.w 0x14, a0
            0x00001fe0      224d           movea.l a5, a1
            ; CODE XREF from fcn.00001f72 @ +0x72(x)
            0x00001fe2      10d9           move.b (a1)+, (a0)+
            0x00001fe4      66fc           bne.b 0x1fe2
            0x00001fe6      206c6c1c       movea.l 0x6c1c(a4), a0
            0x00001fea      226c6c24       movea.l 0x6c24(a4), a1
            0x00001fee      2c780004       movea.l 0x4.w, a6
            0x00001ff2      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x00001ff6      206c6c20       movea.l 0x6c20(a4), a0
            0x00001ffa      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x00001ffe      206c6c20       movea.l 0x6c20(a4), a0
            0x00002002      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x00002006      206c6c24       movea.l 0x6c24(a4), a0
            0x0000200a      d0fc0014       adda.w 0x14, a0
            0x0000200e      224b           movea.l a3, a1
            ; CODE XREF from fcn.00001f72 @ +0xa0(x)
            0x00002010      12d8           move.b (a0)+, (a1)+
            0x00002012      66fc           bne.b 0x2010
            0x00002014      4cdf6880       movem.l (a7)+, d7/a3/a5-a6
            0x00002018      4e75           rts
            0x0000201a      2f0e           move.l a6, -(a7)
            0x0000201c      7010           moveq 0x10, d0
            0x0000201e      206c6c24       movea.l 0x6c24(a4), a0
            0x00002022      214000e0       move.l d0, 0xe0(a0)
            0x00002026      206c6c1c       movea.l 0x6c1c(a4), a0
            0x0000202a      226c6c24       movea.l 0x6c24(a4), a1
            0x0000202e      2c780004       movea.l 0x4.w, a6
            0x00002032      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x00002036      206c6c20       movea.l 0x6c20(a4), a0
            0x0000203a      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x0000203e      206c6c20       movea.l 0x6c20(a4), a0
            0x00002042      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x00002046      206c6c24       movea.l 0x6c24(a4), a0
            0x0000204a      202800dc       move.l 0xdc(a0), d0
            0x0000204e      2c5f           movea.l (a7)+, a6
            0x00002050      4e75           rts
            0x00002052      48e70006       movem.l a5-a6, -(a7)
            0x00002056      2a48           movea.l a0, a5
            0x00002058      206c6c24       movea.l 0x6c24(a4), a0
            0x0000205c      d0fc0014       adda.w 0x14, a0
            0x00002060      224d           movea.l a5, a1
            ; CODE XREF from fcn.00001f72 @ +0xf2(x)
            0x00002062      10d9           move.b (a1)+, (a0)+
            0x00002064      66fc           bne.b 0x2062
            0x00002066      700d           moveq 0xd, d0
            0x00002068      206c6c24       movea.l 0x6c24(a4), a0
            0x0000206c      214000e0       move.l d0, 0xe0(a0)
            0x00002070      206c6c1c       movea.l 0x6c1c(a4), a0
            0x00002074      226c6c24       movea.l 0x6c24(a4), a1
            0x00002078      2c780004       movea.l 0x4.w, a6
            0x0000207c      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x00002080      206c6c20       movea.l 0x6c20(a4), a0
            0x00002084      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x00002088      206c6c20       movea.l 0x6c20(a4), a0
            0x0000208c      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x00002090      4cdf6000       movem.l (a7)+, a5-a6
            0x00002094      4e75           rts
            ; XREFS: CALL 0x0000140e  CALL 0x000015ae  CALL 0x0000160e  
            ; XREFS: CALL 0x0000166e  CALL 0x000016d4  CALL 0x0000173a  
            ; XREFS: CALL 0x00001a68  CALL 0x00001ab4  CALL 0x00001b04  
            ; XREFS: CALL 0x00001b4c  CALL 0x00001bac  CALL 0x00001d14  
            ; XREFS: CALL 0x00001de6  
┌ 10: fcn.00002096 ();
│           0x00002096      6100f2aa       bsr.w fcn.00001342
│           0x0000209a      4ebaf17e       jsr fcn.0000121a(pc)
└           0x0000209e      4e75           rts
            0x000020a0      9efc0190       suba.w 0x190, a7
            0x000020a4      48e70104       movem.l d7/a5, -(a7)
            0x000020a8      2a48           movea.l a0, a5
            0x000020aa      41ef00d0       lea.l 0xd0(a7), a0
            0x000020ae      7069           moveq 0x69, d0
            0x000020b0      6100fe72       bsr.w fcn.00001f24
            0x000020b4      41ef00d0       lea.l 0xd0(a7), a0
            0x000020b8      4eba1e26       jsr fcn.00003ee0(pc)
            0x000020bc      2e00           move.l d0, d7
            0x000020be      204d           movea.l a5, a0
            0x000020c0      43ef00d0       lea.l 0xd0(a7), a1
            ; CODE XREF from fcn.00002096 @ +0x30(x)
            0x000020c4      12d8           move.b (a0)+, (a1)+
            0x000020c6      66fc           bne.b 0x20c4
            0x000020c8      2007           move.l d7, d0
            0x000020ca      7205           moveq 0x5, d1
            0x000020cc      4eba1656       jsr fcn.00003724(pc)
            0x000020d0      9e81           sub.l d1, d7
            ; CODE XREF from fcn.00002096 @ +0x118(x)
            0x000020d2      7002           moveq 0x2, d0
            0x000020d4      be80           cmp.l d0, d7
            0x000020d6      6f0000da       ble.w 0x21b2
            0x000020da      2f07           move.l d7, -(a7)
            0x000020dc      486f00d4       pea.l 0xd4(a7)
            0x000020e0      486c06c6       pea.l 0x6c6(a4)
            0x000020e4      486f0014       pea.l 0x14(a7)
            0x000020e8      4eba1e62       jsr fcn.00003f4c(pc)
            0x000020ec      41ef0018       lea.l 0x18(a7), a0
            0x000020f0      61000150       bsr.w fcn.00002242
            0x000020f4      4fef0010       lea.l 0x10(a7), a7
            0x000020f8      4a80           tst.l d0
            0x000020fa      6724           beq.b 0x2120
            0x000020fc      2f07           move.l d7, -(a7)
            0x000020fe      486f00d4       pea.l 0xd4(a7)
            0x00002102      486c06d0       pea.l 0x6d0(a4)
            0x00002106      486f0014       pea.l 0x14(a7)
            0x0000210a      4eba1e40       jsr fcn.00003f4c(pc)
            0x0000210e      41ef0018       lea.l 0x18(a7), a0
            0x00002112      6100fd28       bsr.w fcn.00001e3c
            0x00002116      4fef0010       lea.l 0x10(a7), a7
            0x0000211a      7001           moveq 0x1, d0
            0x0000211c      6000011a       bra.w 0x2238
            ; CODE XREF from fcn.00002096 @ +0x64(x)
            0x00002120      2f07           move.l d7, -(a7)
            0x00002122      486f00d4       pea.l 0xd4(a7)
            0x00002126      486c06d6       pea.l 0x6d6(a4)
            0x0000212a      486f0014       pea.l 0x14(a7)
            0x0000212e      4eba1e1c       jsr fcn.00003f4c(pc)
            0x00002132      41ef0018       lea.l 0x18(a7), a0
            0x00002136      6100010a       bsr.w fcn.00002242
            0x0000213a      4fef0010       lea.l 0x10(a7), a7
            0x0000213e      4a80           tst.l d0
            0x00002140      6724           beq.b 0x2166
            0x00002142      2f07           move.l d7, -(a7)
            0x00002144      486f00d4       pea.l 0xd4(a7)
            0x00002148      486c06e2       pea.l 0x6e2(a4)
            0x0000214c      486f0014       pea.l 0x14(a7)
            0x00002150      4eba1dfa       jsr fcn.00003f4c(pc)
            0x00002154      41ef0018       lea.l 0x18(a7), a0
            0x00002158      6100fce2       bsr.w fcn.00001e3c
            0x0000215c      4fef0010       lea.l 0x10(a7), a7
            0x00002160      7001           moveq 0x1, d0
            0x00002162      600000d4       bra.w 0x2238
            ; CODE XREF from fcn.00002096 @ +0xaa(x)
            0x00002166      2f07           move.l d7, -(a7)
            0x00002168      486f00d4       pea.l 0xd4(a7)
            0x0000216c      486c06e8       pea.l 0x6e8(a4)
            0x00002170      486f0014       pea.l 0x14(a7)
            0x00002174      4eba1dd6       jsr fcn.00003f4c(pc)
            0x00002178      41ef0018       lea.l 0x18(a7), a0
            0x0000217c      610000c4       bsr.w fcn.00002242
            0x00002180      4fef0010       lea.l 0x10(a7), a7
            0x00002184      4a80           tst.l d0
            0x00002186      6724           beq.b 0x21ac
            0x00002188      2f07           move.l d7, -(a7)
            0x0000218a      486f00d4       pea.l 0xd4(a7)
            0x0000218e      486c06f2       pea.l 0x6f2(a4)
            0x00002192      486f0014       pea.l 0x14(a7)
            0x00002196      4eba1db4       jsr fcn.00003f4c(pc)
            0x0000219a      41ef0018       lea.l 0x18(a7), a0
            0x0000219e      6100fc9c       bsr.w fcn.00001e3c
            0x000021a2      4fef0010       lea.l 0x10(a7), a7
            0x000021a6      7001           moveq 0x1, d0
            0x000021a8      6000008e       bra.w 0x2238
            ; CODE XREF from fcn.00002096 @ +0xf0(x)
            0x000021ac      5b87           subq.l 0x5, d7
            0x000021ae      6000ff22       bra.w 0x20d2
            ; CODE XREF from fcn.00002096 @ +0x40(x)
            0x000021b2      486f00d0       pea.l 0xd0(a7)
            0x000021b6      486c06f8       pea.l 0x6f8(a4)
            0x000021ba      486f0010       pea.l 0x10(a7)
            0x000021be      4eba1d8c       jsr fcn.00003f4c(pc)
            0x000021c2      41ef0014       lea.l 0x14(a7), a0
            0x000021c6      6100007a       bsr.w fcn.00002242
            0x000021ca      4fef000c       lea.l 0xc(a7), a7
            0x000021ce      4a80           tst.l d0
            0x000021d0      670c           beq.b 0x21de
            0x000021d2      41ef00d0       lea.l 0xd0(a7), a0
            0x000021d6      6100fc64       bsr.w fcn.00001e3c
            0x000021da      7001           moveq 0x1, d0
            0x000021dc      605a           bra.b 0x2238
            ; CODE XREF from fcn.00002096 @ +0x13a(x)
            0x000021de      486f00d0       pea.l 0xd0(a7)
            0x000021e2      486c0700       pea.l 0x700(a4)
            0x000021e6      486f0010       pea.l 0x10(a7)
            0x000021ea      4eba1d60       jsr fcn.00003f4c(pc)
            0x000021ee      41ef0014       lea.l 0x14(a7), a0
            0x000021f2      6100004e       bsr.w fcn.00002242
            0x000021f6      4fef000c       lea.l 0xc(a7), a7
            0x000021fa      4a80           tst.l d0
            0x000021fc      670c           beq.b 0x220a
            0x000021fe      41ef00d0       lea.l 0xd0(a7), a0
            0x00002202      6100fc38       bsr.w fcn.00001e3c
            0x00002206      7001           moveq 0x1, d0
            0x00002208      602e           bra.b 0x2238
            ; CODE XREF from fcn.00002096 @ +0x166(x)
            0x0000220a      486f00d0       pea.l 0xd0(a7)
            0x0000220e      486c070a       pea.l 0x70a(a4)
            0x00002212      486f0010       pea.l 0x10(a7)
            0x00002216      4eba1d34       jsr fcn.00003f4c(pc)
            0x0000221a      41ef0014       lea.l 0x14(a7), a0
            0x0000221e      61000022       bsr.w fcn.00002242
            0x00002222      4fef000c       lea.l 0xc(a7), a7
            0x00002226      4a80           tst.l d0
            0x00002228      670c           beq.b 0x2236
            0x0000222a      41ef00d0       lea.l 0xd0(a7), a0
            0x0000222e      6100fc0c       bsr.w fcn.00001e3c
            0x00002232      7001           moveq 0x1, d0
            0x00002234      6002           bra.b 0x2238
            ; CODE XREF from fcn.00002096 @ +0x192(x)
            0x00002236      7000           moveq 0x0, d0
            ; XREFS: CODE 0x0000211c  CODE 0x00002162  CODE 0x000021a8  
            ; XREFS: CODE 0x000021dc  CODE 0x00002208  CODE 0x00002234  
            0x00002238      4cdf2080       movem.l (a7)+, d7/a5
            0x0000223c      defc0190       adda.w 0x190, a7
            0x00002240      4e75           rts
            ; XREFS: CALL 0x000020f0  CALL 0x00002136  CALL 0x0000217c  
            ; XREFS: CALL 0x000021c6  CALL 0x000021f2  CALL 0x0000221e  
┌ 42: fcn.00002242 ();
│           0x00002242      48e72106       movem.l d2/d7/a5-a6, -(a7)
│           0x00002246      2a48           movea.l a0, a5
│           0x00002248      220d           move.l a5, d1
│           0x0000224a      2c6c0988       movea.l 0x988(a4), a6
│           0x0000224e      74fe           moveq 0xfe, d2
│           0x00002250      4eaeffac       jsr -0x54(a6)               ; fcn.000030f0-0x30f0
│           0x00002254      2e00           move.l d0, d7
│           0x00002256      4a87           tst.l d7
│           0x00002258      670a           beq.b 0x2264
│           0x0000225a      2207           move.l d7, d1
│           0x0000225c      4eaeffa6       jsr -0x5a(a6)               ; fcn.000030f0-0x30f0
│           0x00002260      7001           moveq 0x1, d0
│           0x00002262      6002           bra.b 0x2266
│           ; CODE XREF from fcn.00002242 @ 0x2258(x)
│           0x00002264      7000           moveq 0x0, d0
│           ; CODE XREF from fcn.00002242 @ 0x2262(x)
│           0x00002266      4cdf6084       movem.l (a7)+, d2/d7/a5-a6
└           0x0000226a      4e75           rts
            0x0000226c      2f0e           move.l a6, -(a7)
            0x0000226e      206c6c24       movea.l 0x6c24(a4), a0
            0x00002272      217c000002..   move.l 0x213, 0xe0(a0)
            0x0000227a      206c6c1c       movea.l 0x6c1c(a4), a0
            0x0000227e      226c6c24       movea.l 0x6c24(a4), a1
            0x00002282      2c780004       movea.l 0x4.w, a6
            0x00002286      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x0000228a      206c6c20       movea.l 0x6c20(a4), a0
            0x0000228e      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x00002292      206c6c20       movea.l 0x6c20(a4), a0
            0x00002296      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x0000229a      206c6c28       movea.l 0x6c28(a4), a0
            0x0000229e      202800f4       move.l 0xf4(a0), d0
            0x000022a2      2c5f           movea.l (a7)+, a6
            0x000022a4      4e75           rts
            0x000022a6      48e70302       movem.l d6-d7/a6, -(a7)
            0x000022aa      2c01           move.l d1, d6
            0x000022ac      2e00           move.l d0, d7
            0x000022ae      2006           move.l d6, d0
            0x000022b0      0480000003e8   subi.l 0x3e8, d0
            0x000022b6      670a           beq.b 0x22c2
            0x000022b8      5380           subq.l 0x1, d0
            0x000022ba      671c           beq.b 0x22d8
            0x000022bc      5380           subq.l 0x1, d0
            0x000022be      672e           beq.b 0x22ee
            0x000022c0      6042           bra.b 0x2304
            ; CODE XREF from fcn.00002242 @ +0x74(x)
            0x000022c2      206c6c24       movea.l 0x6c24(a4), a0
            0x000022c6      217c000003..   move.l 0x3e8, 0xe0(a0)
            0x000022ce      206c6c24       movea.l 0x6c24(a4), a0
            0x000022d2      214700dc       move.l d7, 0xdc(a0)
            0x000022d6      6030           bra.b 0x2308
            ; CODE XREF from fcn.00002242 @ +0x78(x)
            0x000022d8      206c6c24       movea.l 0x6c24(a4), a0
            0x000022dc      217c000003..   move.l 0x3e9, 0xe0(a0)
            0x000022e4      206c6c24       movea.l 0x6c24(a4), a0
            0x000022e8      214700dc       move.l d7, 0xdc(a0)
            0x000022ec      601a           bra.b 0x2308
            ; CODE XREF from fcn.00002242 @ +0x7c(x)
            0x000022ee      206c6c24       movea.l 0x6c24(a4), a0
            0x000022f2      217c000003..   move.l 0x3ea, 0xe0(a0)
            0x000022fa      206c6c24       movea.l 0x6c24(a4), a0
            0x000022fe      214700dc       move.l d7, 0xdc(a0)
            0x00002302      6004           bra.b 0x2308
            ; CODE XREF from fcn.00002242 @ +0x7e(x)
            0x00002304      7000           moveq 0x0, d0
            0x00002306      6028           bra.b 0x2330
            ; CODE XREFS from fcn.00002242 @ +0x94(x), +0xaa(x), +0xc0(x)
            0x00002308      206c6c1c       movea.l 0x6c1c(a4), a0
            0x0000230c      226c6c24       movea.l 0x6c24(a4), a1
            0x00002310      2c780004       movea.l 0x4.w, a6
            0x00002314      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x00002318      206c6c20       movea.l 0x6c20(a4), a0
            0x0000231c      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x00002320      206c6c20       movea.l 0x6c20(a4), a0
            0x00002324      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x00002328      206c6c28       movea.l 0x6c28(a4), a0
            0x0000232c      202800e0       move.l 0xe0(a0), d0
            ; CODE XREF from fcn.00002242 @ +0xc4(x)
            0x00002330      4cdf40c0       movem.l (a7)+, d6-d7/a6
            0x00002334      4e75           rts
            0x00002336      9efc0078       suba.w 0x78, a7
            0x0000233a      48e72102       movem.l d2/d7/a6, -(a7)
            0x0000233e      2e00           move.l d0, d7
            0x00002340      4a87           tst.l d7
            0x00002342      6608           bne.b 0x234c
            0x00002344      7000           moveq 0x0, d0
            0x00002346      61000654       bsr.w fcn.0000299c
            0x0000234a      2e00           move.l d0, d7
            ; CODE XREF from fcn.00002242 @ +0x100(x)
            0x0000234c      9eac0712       sub.l 0x712(a4), d7
            0x00002350      2007           move.l d7, d0
            0x00002352      223c00015180   move.l 0x15180, d1
            0x00002358      4eba13ca       jsr fcn.00003724(pc)
            0x0000235c      29406c44       move.l d0, 0x6c44(a4)
            0x00002360      2200           move.l d0, d1
            0x00002362      e981           asl.l 0x4, d1
            0x00002364      9280           sub.l d0, d1
            0x00002366      2401           move.l d1, d2
            0x00002368      e782           asl.l 0x3, d2
            0x0000236a      d481           add.l d1, d2
            0x0000236c      2202           move.l d2, d1
            0x0000236e      e581           asl.l 0x2, d1
            0x00002370      d282           add.l d2, d1
            0x00002372      ef81           asl.l 0x7, d1
            0x00002374      9e81           sub.l d1, d7
            0x00002376      2007           move.l d7, d0
            0x00002378      723c           moveq 0x3c, d1
            0x0000237a      4eba13a8       jsr fcn.00003724(pc)
            0x0000237e      29406c48       move.l d0, 0x6c48(a4)
            0x00002382      2200           move.l d0, d1
            0x00002384      e981           asl.l 0x4, d1
            0x00002386      9280           sub.l d0, d1
            0x00002388      e581           asl.l 0x2, d1
            0x0000238a      9e81           sub.l d1, d7
            0x0000238c      2007           move.l d7, d0
            0x0000238e      e580           asl.l 0x2, d0
            0x00002390      9087           sub.l d7, d0
            0x00002392      e780           asl.l 0x3, d0
            0x00002394      d087           add.l d7, d0
            0x00002396      d080           add.l d0, d0
            0x00002398      29406c4c       move.l d0, 0x6c4c(a4)
            0x0000239c      197c00026c50   move.b 0x2, 0x6c50(a4)
            0x000023a2      41ef0034       lea.l 0x34(a7), a0
            0x000023a6      29486c52       move.l a0, 0x6c52(a4)
            0x000023aa      41ef000c       lea.l 0xc(a7), a0
            0x000023ae      29486c56       move.l a0, 0x6c56(a4)
            0x000023b2      41ef0020       lea.l 0x20(a7), a0
            0x000023b6      29486c5a       move.l a0, 0x6c5a(a4)
            0x000023ba      41ec6c44       lea.l 0x6c44(a4), a0
            0x000023be      2208           move.l a0, d1
            0x000023c0      2c6c0988       movea.l 0x988(a4), a6
            0x000023c4      4eaefd18       jsr -0x2e8(a6)              ; fcn.000030f0-0x30f0
            0x000023c8      41ef000c       lea.l 0xc(a7), a0
            0x000023cc      2008           move.l a0, d0
            0x000023ce      4cdf4084       movem.l (a7)+, d2/d7/a6
            0x000023d2      defc0078       adda.w 0x78, a7
            0x000023d6      4e75           rts
            0x000023d8      9efc0078       suba.w 0x78, a7
            0x000023dc      48e72102       movem.l d2/d7/a6, -(a7)
            0x000023e0      2e00           move.l d0, d7
            0x000023e2      4a87           tst.l d7
            0x000023e4      6608           bne.b 0x23ee
            0x000023e6      7000           moveq 0x0, d0
            0x000023e8      610005b2       bsr.w fcn.0000299c
            0x000023ec      2e00           move.l d0, d7
            ; CODE XREF from fcn.00002242 @ +0x1a2(x)
            0x000023ee      9eac0712       sub.l 0x712(a4), d7
            0x000023f2      2007           move.l d7, d0
            0x000023f4      223c00015180   move.l 0x15180, d1
            0x000023fa      4eba1328       jsr fcn.00003724(pc)
            0x000023fe      29406c44       move.l d0, 0x6c44(a4)
            0x00002402      2200           move.l d0, d1
            0x00002404      e981           asl.l 0x4, d1
            0x00002406      9280           sub.l d0, d1
            0x00002408      2401           move.l d1, d2
            0x0000240a      e782           asl.l 0x3, d2
            0x0000240c      d481           add.l d1, d2
            0x0000240e      2202           move.l d2, d1
            0x00002410      e581           asl.l 0x2, d1
            0x00002412      d282           add.l d2, d1
            0x00002414      ef81           asl.l 0x7, d1
            0x00002416      9e81           sub.l d1, d7
            0x00002418      2007           move.l d7, d0
            0x0000241a      723c           moveq 0x3c, d1
            0x0000241c      4eba1306       jsr fcn.00003724(pc)
            0x00002420      29406c48       move.l d0, 0x6c48(a4)
            0x00002424      2200           move.l d0, d1
            0x00002426      e981           asl.l 0x4, d1
            0x00002428      9280           sub.l d0, d1
            0x0000242a      e581           asl.l 0x2, d1
            0x0000242c      9e81           sub.l d1, d7
            0x0000242e      2007           move.l d7, d0
            0x00002430      e580           asl.l 0x2, d0
            0x00002432      9087           sub.l d7, d0
            0x00002434      e780           asl.l 0x3, d0
            0x00002436      d087           add.l d7, d0
            0x00002438      d080           add.l d0, d0
            0x0000243a      29406c4c       move.l d0, 0x6c4c(a4)
            0x0000243e      197c00026c50   move.b 0x2, 0x6c50(a4)
            0x00002444      41ef0034       lea.l 0x34(a7), a0
            0x00002448      29486c52       move.l a0, 0x6c52(a4)
            0x0000244c      41ef000c       lea.l 0xc(a7), a0
            0x00002450      29486c56       move.l a0, 0x6c56(a4)
            0x00002454      41ef0020       lea.l 0x20(a7), a0
            0x00002458      29486c5a       move.l a0, 0x6c5a(a4)
            0x0000245c      41ec6c44       lea.l 0x6c44(a4), a0
            0x00002460      2208           move.l a0, d1
            0x00002462      2c6c0988       movea.l 0x988(a4), a6
            0x00002466      4eaefd18       jsr -0x2e8(a6)              ; fcn.000030f0-0x30f0
            0x0000246a      41ef0034       lea.l 0x34(a7), a0
            0x0000246e      2008           move.l a0, d0
            0x00002470      4cdf4084       movem.l (a7)+, d2/d7/a6
            0x00002474      defc0078       adda.w 0x78, a7
            0x00002478      4e75           rts
            0x0000247a      9efc0078       suba.w 0x78, a7
            0x0000247e      48e72102       movem.l d2/d7/a6, -(a7)
            0x00002482      2e00           move.l d0, d7
            0x00002484      4a87           tst.l d7
            0x00002486      6608           bne.b 0x2490
            0x00002488      7000           moveq 0x0, d0
            0x0000248a      61000510       bsr.w fcn.0000299c
            0x0000248e      2e00           move.l d0, d7
            ; CODE XREF from fcn.00002242 @ +0x244(x)
            0x00002490      9eac0712       sub.l 0x712(a4), d7
            0x00002494      2007           move.l d7, d0
            0x00002496      223c00015180   move.l 0x15180, d1
            0x0000249c      4eba1286       jsr fcn.00003724(pc)
            0x000024a0      29406c44       move.l d0, 0x6c44(a4)
            0x000024a4      2200           move.l d0, d1
            0x000024a6      e981           asl.l 0x4, d1
            0x000024a8      9280           sub.l d0, d1
            0x000024aa      2401           move.l d1, d2
            0x000024ac      e782           asl.l 0x3, d2
            0x000024ae      d481           add.l d1, d2
            0x000024b0      2202           move.l d2, d1
            0x000024b2      e581           asl.l 0x2, d1
            0x000024b4      d282           add.l d2, d1
            0x000024b6      ef81           asl.l 0x7, d1
            0x000024b8      9e81           sub.l d1, d7
            0x000024ba      2007           move.l d7, d0
            0x000024bc      723c           moveq 0x3c, d1
            0x000024be      4eba1264       jsr fcn.00003724(pc)
            0x000024c2      29406c48       move.l d0, 0x6c48(a4)
            0x000024c6      2200           move.l d0, d1
            0x000024c8      e981           asl.l 0x4, d1
            0x000024ca      9280           sub.l d0, d1
            0x000024cc      e581           asl.l 0x2, d1
            0x000024ce      9e81           sub.l d1, d7
            0x000024d0      2007           move.l d7, d0
            0x000024d2      e580           asl.l 0x2, d0
            0x000024d4      9087           sub.l d7, d0
            0x000024d6      e780           asl.l 0x3, d0
            0x000024d8      d087           add.l d7, d0
            0x000024da      d080           add.l d0, d0
            0x000024dc      29406c4c       move.l d0, 0x6c4c(a4)
            0x000024e0      197c00026c50   move.b 0x2, 0x6c50(a4)
            0x000024e6      41ef0034       lea.l 0x34(a7), a0
            0x000024ea      29486c52       move.l a0, 0x6c52(a4)
            0x000024ee      41ef000c       lea.l 0xc(a7), a0
            0x000024f2      29486c56       move.l a0, 0x6c56(a4)
            0x000024f6      41ef0020       lea.l 0x20(a7), a0
            0x000024fa      29486c5a       move.l a0, 0x6c5a(a4)
            0x000024fe      41ec6c44       lea.l 0x6c44(a4), a0
            0x00002502      2208           move.l a0, d1
            0x00002504      2c6c0988       movea.l 0x988(a4), a6
            0x00002508      4eaefd18       jsr -0x2e8(a6)              ; fcn.000030f0-0x30f0
            0x0000250c      41ef0020       lea.l 0x20(a7), a0
            0x00002510      2008           move.l a0, d0
            0x00002512      4cdf4084       movem.l (a7)+, d2/d7/a6
            0x00002516      defc0078       adda.w 0x78, a7
            0x0000251a      4e75           rts
            0x0000251c      9efc0018       suba.w 0x18, a7
            0x00002520      48e70104       movem.l d7/a5, -(a7)
            0x00002524      2e00           move.l d0, d7
            0x00002526      2a48           movea.l a0, a5
            0x00002528      2007           move.l d7, d0
            0x0000252a      41ef000a       lea.l 0xa(a7), a0
            0x0000252e      93c9           suba.l a1, a1
            0x00002530      61000042       bsr.w fcn.00002574
            0x00002534      41ef000a       lea.l 0xa(a7), a0
            0x00002538      224d           movea.l a5, a1
            ; CODE XREF from fcn.00002242 @ +0x2fa(x)
            0x0000253a      12d8           move.b (a0)+, (a1)+
            0x0000253c      66fc           bne.b 0x253a
            0x0000253e      4cdf2080       movem.l (a7)+, d7/a5
            0x00002542      defc0018       adda.w 0x18, a7
            0x00002546      4e75           rts
            0x00002548      9efc0020       suba.w 0x20, a7
            0x0000254c      48e70104       movem.l d7/a5, -(a7)
            0x00002550      2e00           move.l d0, d7
            0x00002552      2a48           movea.l a0, a5
            0x00002554      2007           move.l d7, d0
            0x00002556      43ef000a       lea.l 0xa(a7), a1
            0x0000255a      91c8           suba.l a0, a0
            0x0000255c      61000016       bsr.w fcn.00002574
            0x00002560      41ef000a       lea.l 0xa(a7), a0
            0x00002564      224d           movea.l a5, a1
            ; CODE XREF from fcn.00002242 @ +0x326(x)
            0x00002566      12d8           move.b (a0)+, (a1)+
            0x00002568      66fc           bne.b 0x2566
            0x0000256a      4cdf2080       movem.l (a7)+, d7/a5
            0x0000256e      defc0020       adda.w 0x20, a7
            0x00002572      4e75           rts
            ; CALL XREFS from fcn.00002242 @ +0x2ee(x), +0x31a(x)
┌ 152: fcn.00002574 ();
│           0x00002574      9efc0028       suba.w 0x28, a7
│           0x00002578      48e72116       movem.l d2/d7/a3/a5-a6, -(a7)
│           0x0000257c      2e00           move.l d0, d7
│           0x0000257e      2649           movea.l a1, a3
│           0x00002580      2a48           movea.l a0, a5
│           0x00002582      4a87           tst.l d7
│           0x00002584      661e           bne.b 0x25a4
│           0x00002586      41ef0030       lea.l 0x30(a7), a0
│           0x0000258a      2208           move.l a0, d1
│           0x0000258c      2c6c0988       movea.l 0x988(a4), a6
│           0x00002590      4eaeff40       jsr -0xc0(a6)               ; fcn.000030f0-0x30f0
│           0x00002594      41ef0030       lea.l 0x30(a7), a0
│           0x00002598      43ef0016       lea.l 0x16(a7), a1
│           0x0000259c      22d8           move.l (a0)+, (a1)+
│           0x0000259e      22d8           move.l (a0)+, (a1)+
│           0x000025a0      22d8           move.l (a0)+, (a1)+
│           0x000025a2      603a           bra.b 0x25de
│           ; CODE XREF from fcn.00002574 @ 0x2584(x)
│           0x000025a4      9eac0712       sub.l 0x712(a4), d7
│           0x000025a8      2007           move.l d7, d0
│           0x000025aa      223c00015180   move.l 0x15180, d1
│           0x000025b0      4eba11a4       jsr fcn.00003756(pc)
│           0x000025b4      2f400016       move.l d0, 0x16(a7)
│           0x000025b8      2200           move.l d0, d1
│           0x000025ba      e981           asl.l 0x4, d1
│           0x000025bc      9280           sub.l d0, d1
│           0x000025be      2401           move.l d1, d2
│           0x000025c0      e782           asl.l 0x3, d2
│           0x000025c2      d481           add.l d1, d2
│           0x000025c4      2202           move.l d2, d1
│           0x000025c6      e581           asl.l 0x2, d1
│           0x000025c8      d282           add.l d2, d1
│           0x000025ca      ef81           asl.l 0x7, d1
│           0x000025cc      9e81           sub.l d1, d7
│           0x000025ce      2007           move.l d7, d0
│           0x000025d0      723c           moveq 0x3c, d1
│           0x000025d2      4eba1182       jsr fcn.00003756(pc)
│           0x000025d6      2f40001a       move.l d0, 0x1a(a7)
│           0x000025da      42af001e       clr.l 0x1e(a7)
│           ; CODE XREF from fcn.00002574 @ 0x25a2(x)
│           0x000025de      1f7c00020022   move.b 0x2, 0x22(a7)
│           0x000025e4      42af0024       clr.l 0x24(a7)
│           0x000025e8      2f4d0028       move.l a5, 0x28(a7)
│           0x000025ec      2f4b002c       move.l a3, 0x2c(a7)
│           0x000025f0      422f0023       clr.b 0x23(a7)
│           0x000025f4      41ef0016       lea.l 0x16(a7), a0
│           0x000025f8      2208           move.l a0, d1
│           0x000025fa      2c6c0988       movea.l 0x988(a4), a6
│           0x000025fe      4eaefd18       jsr -0x2e8(a6)              ; fcn.000030f0-0x30f0
│           0x00002602      4cdf6884       movem.l (a7)+, d2/d7/a3/a5-a6
│           0x00002606      defc0028       adda.w 0x28, a7
└           0x0000260a      4e75           rts
            0x0000260c      48e70116       movem.l d7/a3/a5-a6, -(a7)
            0x00002610      2e00           move.l d0, d7
            0x00002612      2649           movea.l a1, a3
            0x00002614      2a48           movea.l a0, a5
            0x00002616      206c6c24       movea.l 0x6c24(a4), a0
            0x0000261a      217c000002..   move.l 0x214, 0xe0(a0)
            0x00002622      206c6c24       movea.l 0x6c24(a4), a0
            0x00002626      214700dc       move.l d7, 0xdc(a0)
            0x0000262a      206c6c24       movea.l 0x6c24(a4), a0
            0x0000262e      214d00f8       move.l a5, 0xf8(a0)
            0x00002632      206c6c24       movea.l 0x6c24(a4), a0
            0x00002636      214b00fc       move.l a3, 0xfc(a0)
            0x0000263a      206c6c1c       movea.l 0x6c1c(a4), a0
            0x0000263e      226c6c24       movea.l 0x6c24(a4), a1
            0x00002642      2c780004       movea.l 0x4.w, a6
            0x00002646      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x0000264a      206c6c20       movea.l 0x6c20(a4), a0
            0x0000264e      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x00002652      206c6c20       movea.l 0x6c20(a4), a0
            0x00002656      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x0000265a      206c6c24       movea.l 0x6c24(a4), a0
            0x0000265e      202800dc       move.l 0xdc(a0), d0
            0x00002662      4cdf6880       movem.l (a7)+, d7/a3/a5-a6
            0x00002666      4e75           rts
            0x00002668      48e70116       movem.l d7/a3/a5-a6, -(a7)
            0x0000266c      2e00           move.l d0, d7
            0x0000266e      2649           movea.l a1, a3
            0x00002670      2a48           movea.l a0, a5
            0x00002672      206c6c24       movea.l 0x6c24(a4), a0
            0x00002676      217c000002..   move.l 0x26b, 0xe0(a0)
            0x0000267e      3007           move.w d7, d0
            0x00002680      48c0           ext.l d0
            0x00002682      206c6c24       movea.l 0x6c24(a4), a0
            0x00002686      214000dc       move.l d0, 0xdc(a0)
            0x0000268a      214d00f8       move.l a5, 0xf8(a0)
            0x0000268e      206c6c24       movea.l 0x6c24(a4), a0
            0x00002692      214b00fc       move.l a3, 0xfc(a0)
            0x00002696      206c6c1c       movea.l 0x6c1c(a4), a0
            0x0000269a      226c6c24       movea.l 0x6c24(a4), a1
            0x0000269e      2c780004       movea.l 0x4.w, a6
            0x000026a2      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x000026a6      206c6c20       movea.l 0x6c20(a4), a0
            0x000026aa      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x000026ae      206c6c20       movea.l 0x6c20(a4), a0
            0x000026b2      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x000026b6      206c6c24       movea.l 0x6c24(a4), a0
            0x000026ba      202800dc       move.l 0xdc(a0), d0
            0x000026be      4cdf6880       movem.l (a7)+, d7/a3/a5-a6
            0x000026c2      4e75           rts
            0x000026c4      48e70106       movem.l d7/a5-a6, -(a7)
            0x000026c8      2e00           move.l d0, d7
            0x000026ca      2a48           movea.l a0, a5
            0x000026cc      206c6c24       movea.l 0x6c24(a4), a0
            0x000026d0      217c000002..   move.l 0x219, 0xe0(a0)
            0x000026d8      206c6c24       movea.l 0x6c24(a4), a0
            0x000026dc      214700dc       move.l d7, 0xdc(a0)
            0x000026e0      206c6c24       movea.l 0x6c24(a4), a0
            0x000026e4      214d00f8       move.l a5, 0xf8(a0)
            0x000026e8      206c6c1c       movea.l 0x6c1c(a4), a0
            0x000026ec      226c6c24       movea.l 0x6c24(a4), a1
            0x000026f0      2c780004       movea.l 0x4.w, a6
            0x000026f4      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x000026f8      206c6c20       movea.l 0x6c20(a4), a0
            0x000026fc      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x00002700      206c6c20       movea.l 0x6c20(a4), a0
            0x00002704      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x00002708      206c6c24       movea.l 0x6c24(a4), a0
            0x0000270c      202800dc       move.l 0xdc(a0), d0
            0x00002710      4cdf6080       movem.l (a7)+, d7/a5-a6
            0x00002714      4e75           rts
            0x00002716      48e70116       movem.l d7/a3/a5-a6, -(a7)
            0x0000271a      2e00           move.l d0, d7
            0x0000271c      2649           movea.l a1, a3
            0x0000271e      2a48           movea.l a0, a5
            0x00002720      206c6c24       movea.l 0x6c24(a4), a0
            0x00002724      217c000002..   move.l 0x215, 0xe0(a0)
            0x0000272c      206c6c24       movea.l 0x6c24(a4), a0
            0x00002730      214700dc       move.l d7, 0xdc(a0)
            0x00002734      206c6c24       movea.l 0x6c24(a4), a0
            0x00002738      214d00f8       move.l a5, 0xf8(a0)
            0x0000273c      206c6c24       movea.l 0x6c24(a4), a0
            0x00002740      214b00fc       move.l a3, 0xfc(a0)
            0x00002744      206c6c1c       movea.l 0x6c1c(a4), a0
            0x00002748      226c6c24       movea.l 0x6c24(a4), a1
            0x0000274c      2c780004       movea.l 0x4.w, a6
            0x00002750      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x00002754      206c6c20       movea.l 0x6c20(a4), a0
            0x00002758      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x0000275c      206c6c20       movea.l 0x6c20(a4), a0
            0x00002760      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x00002764      4cdf6880       movem.l (a7)+, d7/a3/a5-a6
            0x00002768      4e75           rts
            0x0000276a      48e70306       movem.l d6-d7/a5-a6, -(a7)
            0x0000276e      2c01           move.l d1, d6
            0x00002770      2e00           move.l d0, d7
            0x00002772      2a48           movea.l a0, a5
            0x00002774      206c6c24       movea.l 0x6c24(a4), a0
            0x00002778      217c000002..   move.l 0x216, 0xe0(a0)
            0x00002780      206c6c24       movea.l 0x6c24(a4), a0
            0x00002784      214700dc       move.l d7, 0xdc(a0)
            0x00002788      206c6c24       movea.l 0x6c24(a4), a0
            0x0000278c      214600e4       move.l d6, 0xe4(a0)
            0x00002790      206c6c24       movea.l 0x6c24(a4), a0
            0x00002794      214d00f8       move.l a5, 0xf8(a0)
            0x00002798      206c6c1c       movea.l 0x6c1c(a4), a0
            0x0000279c      226c6c24       movea.l 0x6c24(a4), a1
            0x000027a0      2c780004       movea.l 0x4.w, a6
            0x000027a4      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x000027a8      206c6c20       movea.l 0x6c20(a4), a0
            0x000027ac      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x000027b0      206c6c20       movea.l 0x6c20(a4), a0
            0x000027b4      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x000027b8      4cdf60c0       movem.l (a7)+, d6-d7/a5-a6
            0x000027bc      4e75           rts
            0x000027be      48e70016       movem.l a3/a5-a6, -(a7)
            0x000027c2      2649           movea.l a1, a3
            0x000027c4      2a48           movea.l a0, a5
            0x000027c6      206c6c24       movea.l 0x6c24(a4), a0
            0x000027ca      217c000002..   move.l 0x21a, 0xe0(a0)
            0x000027d2      206c6c24       movea.l 0x6c24(a4), a0
            0x000027d6      214d00f8       move.l a5, 0xf8(a0)
            0x000027da      206c6c24       movea.l 0x6c24(a4), a0
            0x000027de      214b00fc       move.l a3, 0xfc(a0)
            0x000027e2      206c6c1c       movea.l 0x6c1c(a4), a0
            0x000027e6      226c6c24       movea.l 0x6c24(a4), a1
            0x000027ea      2c780004       movea.l 0x4.w, a6
            0x000027ee      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x000027f2      206c6c20       movea.l 0x6c20(a4), a0
            0x000027f6      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x000027fa      206c6c20       movea.l 0x6c20(a4), a0
            0x000027fe      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x00002802      4cdf6800       movem.l (a7)+, a3/a5-a6
            0x00002806      4e75           rts
            0x00002808      48e70306       movem.l d6-d7/a5-a6, -(a7)
            0x0000280c      2c01           move.l d1, d6
            0x0000280e      2e00           move.l d0, d7
            0x00002810      2a48           movea.l a0, a5
            0x00002812      206c6c24       movea.l 0x6c24(a4), a0
            0x00002816      217c000002..   move.l 0x217, 0xe0(a0)
            0x0000281e      206c6c24       movea.l 0x6c24(a4), a0
            0x00002822      214700dc       move.l d7, 0xdc(a0)
            0x00002826      206c6c24       movea.l 0x6c24(a4), a0
            0x0000282a      214600e4       move.l d6, 0xe4(a0)
            0x0000282e      206c6c24       movea.l 0x6c24(a4), a0
            0x00002832      214d00f8       move.l a5, 0xf8(a0)
            0x00002836      206c6c1c       movea.l 0x6c1c(a4), a0
            0x0000283a      226c6c24       movea.l 0x6c24(a4), a1
            0x0000283e      2c780004       movea.l 0x4.w, a6
            0x00002842      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x00002846      206c6c20       movea.l 0x6c20(a4), a0
            0x0000284a      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x0000284e      206c6c20       movea.l 0x6c20(a4), a0
            0x00002852      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x00002856      4cdf60c0       movem.l (a7)+, d6-d7/a5-a6
            0x0000285a      4e75           rts
            0x0000285c      48e70136       movem.l d7/a2-a3/a5-a6, -(a7)
            0x00002860      2e00           move.l d0, d7
            0x00002862      2649           movea.l a1, a3
            0x00002864      2a48           movea.l a0, a5
            0x00002866      41ec0716       lea.l 0x716(a4), a0
            0x0000286a      224d           movea.l a5, a1
            ; CODE XREF from fcn.00002574 @ +0x2fa(x)
            0x0000286c      12d8           move.b (a0)+, (a1)+
            0x0000286e      66fc           bne.b 0x286c
            0x00002870      206c6c24       movea.l 0x6c24(a4), a0
            0x00002874      217c000002..   move.l 0x218, 0xe0(a0)
            0x0000287c      206c6c24       movea.l 0x6c24(a4), a0
            0x00002880      214700dc       move.l d7, 0xdc(a0)
            0x00002884      206c6c24       movea.l 0x6c24(a4), a0
            0x00002888      214d00f8       move.l a5, 0xf8(a0)
            0x0000288c      206c6c24       movea.l 0x6c24(a4), a0
            0x00002890      214b00fc       move.l a3, 0xfc(a0)
            0x00002894      206c6c1c       movea.l 0x6c1c(a4), a0
            0x00002898      226c6c24       movea.l 0x6c24(a4), a1
            0x0000289c      2c780004       movea.l 0x4.w, a6
            0x000028a0      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x000028a4      206c6c20       movea.l 0x6c20(a4), a0
            0x000028a8      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x000028ac      206c6c20       movea.l 0x6c20(a4), a0
            0x000028b0      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x000028b4      244d           movea.l a5, a2
            0x000028b6      4a12           tst.b (a2)
            0x000028b8      6604           bne.b 0x28be
            0x000028ba      7000           moveq 0x0, d0
            0x000028bc      6002           bra.b 0x28c0
            ; CODE XREF from fcn.00002574 @ +0x344(x)
            0x000028be      7001           moveq 0x1, d0
            ; CODE XREF from fcn.00002574 @ +0x348(x)
            0x000028c0      4cdf6c80       movem.l (a7)+, d7/a2-a3/a5-a6
            0x000028c4      4e75           rts
            0x000028c6      48e70102       movem.l d7/a6, -(a7)
            0x000028ca      2e00           move.l d0, d7
            0x000028cc      206c6c24       movea.l 0x6c24(a4), a0
            0x000028d0      217c000003..   move.l 0x3ea, 0xe0(a0)
            0x000028d8      206c6c24       movea.l 0x6c24(a4), a0
            0x000028dc      214700dc       move.l d7, 0xdc(a0)
            0x000028e0      206c6c1c       movea.l 0x6c1c(a4), a0
            0x000028e4      226c6c24       movea.l 0x6c24(a4), a1
            0x000028e8      2c780004       movea.l 0x4.w, a6
            0x000028ec      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x000028f0      206c6c20       movea.l 0x6c20(a4), a0
            0x000028f4      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x000028f8      206c6c20       movea.l 0x6c20(a4), a0
            0x000028fc      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x00002900      206c6c24       movea.l 0x6c24(a4), a0
            0x00002904      202800e0       move.l 0xe0(a0), d0
            0x00002908      4cdf4080       movem.l (a7)+, d7/a6
            0x0000290c      4e75           rts
            0x0000290e      48e70106       movem.l d7/a5-a6, -(a7)
            0x00002912      2e00           move.l d0, d7
            0x00002914      2a48           movea.l a0, a5
            0x00002916      206c6c24       movea.l 0x6c24(a4), a0
            0x0000291a      214700e0       move.l d7, 0xe0(a0)
            0x0000291e      206c6c24       movea.l 0x6c24(a4), a0
            0x00002922      42a800dc       clr.l 0xdc(a0)
            0x00002926      206c6c24       movea.l 0x6c24(a4), a0
            0x0000292a      214d00f8       move.l a5, 0xf8(a0)
            0x0000292e      206c6c1c       movea.l 0x6c1c(a4), a0
            0x00002932      226c6c24       movea.l 0x6c24(a4), a1
            0x00002936      2c780004       movea.l 0x4.w, a6
            0x0000293a      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x0000293e      206c6c20       movea.l 0x6c20(a4), a0
            0x00002942      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x00002946      206c6c20       movea.l 0x6c20(a4), a0
            0x0000294a      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x0000294e      4cdf6080       movem.l (a7)+, d7/a5-a6
            0x00002952      4e75           rts
            0x00002954      48e70106       movem.l d7/a5-a6, -(a7)
            0x00002958      2e00           move.l d0, d7
            0x0000295a      2a48           movea.l a0, a5
            0x0000295c      206c6c24       movea.l 0x6c24(a4), a0
            0x00002960      214700e0       move.l d7, 0xe0(a0)
            0x00002964      7001           moveq 0x1, d0
            0x00002966      206c6c24       movea.l 0x6c24(a4), a0
            0x0000296a      214000dc       move.l d0, 0xdc(a0)
            0x0000296e      206c6c24       movea.l 0x6c24(a4), a0
            0x00002972      214d00f8       move.l a5, 0xf8(a0)
            0x00002976      206c6c1c       movea.l 0x6c1c(a4), a0
            0x0000297a      226c6c24       movea.l 0x6c24(a4), a1
            0x0000297e      2c780004       movea.l 0x4.w, a6
            0x00002982      4eaefe92       jsr -0x16e(a6)              ; fcn.000030f0-0x30f0
            0x00002986      206c6c20       movea.l 0x6c20(a4), a0
            0x0000298a      4eaefe80       jsr -0x180(a6)              ; fcn.000030f0-0x30f0
            0x0000298e      206c6c20       movea.l 0x6c20(a4), a0
            0x00002992      4eaefe8c       jsr -0x174(a6)              ; fcn.000030f0-0x30f0
            0x00002996      4cdf6080       movem.l (a7)+, d7/a5-a6
            0x0000299a      4e75           rts
            ; CALL XREFS from fcn.00002242 @ +0x104(x), +0x1a6(x), +0x248(x)
┌ 96: fcn.0000299c ();
│           0x0000299c      514f           subq.w 0x8, a7
│           0x0000299e      48e72002       movem.l d2/a6, -(a7)
│           0x000029a2      2f40000c       move.l d0, 0xc(a7)
│           0x000029a6      41ec6c5e       lea.l 0x6c5e(a4), a0
│           0x000029aa      2208           move.l a0, d1
│           0x000029ac      2c6c0988       movea.l 0x988(a4), a6
│           0x000029b0      4eaeff40       jsr -0xc0(a6)               ; fcn.000030f0-0x30f0
│           0x000029b4      202c6c5e       move.l 0x6c5e(a4), d0
│           0x000029b8      2200           move.l d0, d1
│           0x000029ba      e981           asl.l 0x4, d1
│           0x000029bc      9280           sub.l d0, d1
│           0x000029be      2401           move.l d1, d2
│           0x000029c0      e782           asl.l 0x3, d2
│           0x000029c2      d481           add.l d1, d2
│           0x000029c4      2202           move.l d2, d1
│           0x000029c6      e581           asl.l 0x2, d1
│           0x000029c8      d282           add.l d2, d1
│           0x000029ca      ef81           asl.l 0x7, d1
│           0x000029cc      202c6c62       move.l 0x6c62(a4), d0
│           0x000029d0      2400           move.l d0, d2
│           0x000029d2      e982           asl.l 0x4, d2
│           0x000029d4      9480           sub.l d0, d2
│           0x000029d6      e582           asl.l 0x2, d2
│           0x000029d8      d282           add.l d2, d1
│           0x000029da      202c6c66       move.l 0x6c66(a4), d0
│           0x000029de      2f410008       move.l d1, 0x8(a7)
│           0x000029e2      7232           moveq 0x32, d1
│           0x000029e4      4eba0d3e       jsr fcn.00003724(pc)
│           0x000029e8      222f0008       move.l 0x8(a7), d1
│           0x000029ec      d280           add.l d0, d1
│           0x000029ee      d2ac0712       add.l 0x712(a4), d1
│           0x000029f2      2001           move.l d1, d0
│           0x000029f4      4cdf4004       movem.l (a7)+, d2/a6
│           0x000029f8      504f           addq.w 0x8, a7
└           0x000029fa      4e75           rts
            0x000029fc      206f0004       movea.l 0x4(a7), a0
            ; CALL XREF from fcn.00002a18 @ 0x2a72(x)
┌ 14: fcn.00002a00 ();
│           0x00002a00      42a80004       clr.l 0x4(a0)
│           0x00002a04      21480008       move.l a0, 0x8(a0)
│           0x00002a08      5888           addq.l 0x4, a0
│           0x00002a0a      2108           move.l a0, -(a0)
└           0x00002a0c      4e75           rts
            0x00002a0e      0000206f       ori.b 0x6f, d0
            0x00002a12      0004202f       ori.b 0x2f, d4
            0x00002a16      0008           invalid
            ; CALL XREF from fcn.00001224 @ 0x1260(x)
┌ 112: fcn.00002a18 ();
│           0x00002a18      48e70316       movem.l d6-d7/a3/a5-a6, -(a7)
│           0x00002a1c      2e00           move.l d0, d7
│           0x00002a1e      70ff           moveq 0xff, d0
│           0x00002a20      2c780004       movea.l 0x4, a6
│           0x00002a24      2a48           movea.l a0, a5
│           0x00002a26      4eaefeb6       jsr -0x14a(a6)              ; fcn.000030f0-0x30f0
│           0x00002a2a      7c00           moveq 0x0, d6
│           0x00002a2c      1c00           move.b d0, d6
│           0x00002a2e      4a86           tst.l d6
│           0x00002a30      6f4e           ble.b 0x2a80
│           0x00002a32      7022           moveq 0x22, d0
│           0x00002a34      223c00010001   move.l 0x10001, d1
│           0x00002a3a      4eaeff3a       jsr -0xc6(a6)               ; fcn.000030f0-0x30f0
│           0x00002a3e      2640           movea.l d0, a3
│           0x00002a40      4a80           tst.l d0
│           0x00002a42      6736           beq.b 0x2a7a
│           0x00002a44      41eb000a       lea.l 0xa(a3), a0
│           0x00002a48      20cd           move.l a5, (a0)+
│           0x00002a4a      17470009       move.b d7, 0x9(a3)
│           0x00002a4e      177c00040008   move.b 0x4, 0x8(a3)
│           0x00002a54      4218           clr.b (a0)+
│           0x00002a56      93c9           suba.l a1, a1
│           0x00002a58      10c6           move.b d6, (a0)+
│           0x00002a5a      4eaefeda       jsr -0x126(a6)              ; fcn.000030f0-0x30f0
│           0x00002a5e      27400010       move.l d0, 0x10(a3)
│           0x00002a62      200d           move.l a5, d0
│           0x00002a64      6708           beq.b 0x2a6e
│           0x00002a66      224b           movea.l a3, a1
│           0x00002a68      4eaefe9e       jsr -0x162(a6)              ; fcn.000030f0-0x30f0
│           0x00002a6c      6008           bra.b 0x2a76
│           ; CODE XREF from fcn.00002a18 @ 0x2a64(x)
│           0x00002a6e      41eb0014       lea.l 0x14(a3), a0
│           0x00002a72      6100ff8c       bsr.w fcn.00002a00
│           ; CODE XREF from fcn.00002a18 @ 0x2a6c(x)
│           0x00002a76      200b           move.l a3, d0
│           0x00002a78      6008           bra.b 0x2a82
│           ; CODE XREF from fcn.00002a18 @ 0x2a42(x)
│           0x00002a7a      2006           move.l d6, d0
│           0x00002a7c      4eaefeb0       jsr -0x150(a6)              ; fcn.000030f0-0x30f0
│           ; CODE XREF from fcn.00002a18 @ 0x2a30(x)
│           0x00002a80      7000           moveq 0x0, d0
│           ; CODE XREF from fcn.00002a18 @ 0x2a78(x)
│           0x00002a82      4cdf68c0       movem.l (a7)+, d6-d7/a3/a5-a6
└           0x00002a86      4e75           rts
            0x00002a88      206f0004       movea.l 0x4(a7), a0
            ; CALL XREF from fcn.00001386 @ 0x139e(x)
┌ 60: fcn.00002a8c ();
│           0x00002a8c      48e70006       movem.l a5-a6, -(a7)
│           0x00002a90      2a48           movea.l a0, a5
│           0x00002a92      4aad000a       tst.l 0xa(a5)
│           0x00002a96      670a           beq.b 0x2aa2
│           0x00002a98      224d           movea.l a5, a1
│           0x00002a9a      2c780004       movea.l 0x4, a6
│           0x00002a9e      4eaefe98       jsr -0x168(a6)              ; fcn.000030f0-0x30f0
│           ; CODE XREF from fcn.00002a8c @ 0x2a96(x)
│           0x00002aa2      50ed0008       st.b 0x8(a5)
│           0x00002aa6      70ff           moveq 0xff, d0
│           0x00002aa8      2b400014       move.l d0, 0x14(a5)
│           0x00002aac      7000           moveq 0x0, d0
│           0x00002aae      102d000f       move.b 0xf(a5), d0
│           0x00002ab2      2c780004       movea.l 0x4, a6
│           0x00002ab6      4eaefeb0       jsr -0x150(a6)              ; fcn.000030f0-0x30f0
│           0x00002aba      224d           movea.l a5, a1
│           0x00002abc      7022           moveq 0x22, d0
│           0x00002abe      4eaeff2e       jsr -0xd2(a6)               ; fcn.000030f0-0x30f0
│           0x00002ac2      4cdf6000       movem.l (a7)+, a5-a6
└           0x00002ac6      4e75           rts
            0x00002ac8      2f07           move.l d7, -(a7)
            0x00002aca      7e00           moveq 0x0, d7
            0x00002acc      6014           bra.b 0x2ae2
            ; CODE XREF from fcn.00002a8c @ +0x60(x)
            0x00002ace      4a2c6c90       tst.b 0x6c90(a4)
            0x00002ad2      6604           bne.b 0x2ad8
            0x00002ad4      4a87           tst.l d7
            0x00002ad6      660a           bne.b 0x2ae2
            ; CODE XREF from fcn.00002a8c @ +0x46(x)
            0x00002ad8      226c0844       movea.l 0x844(a4), a1
            0x00002adc      2051           movea.l (a1), a0
            0x00002ade      4e90           jsr (a0)                    ; fcn.00000009
            0x00002ae0      2e00           move.l d0, d7
            ; CODE XREFS from fcn.00002a8c @ +0x40(x), +0x4a(x)
            0x00002ae2      58ac0844       addq.l 0x4, 0x844(a4)
            0x00002ae6      206c0844       movea.l 0x844(a4), a0
            0x00002aea      4a90           tst.l (a0)
            0x00002aec      66e0           bne.b 0x2ace
            0x00002aee      197c00016c90   move.b 0x1, 0x6c90(a4)
            0x00002af4      2007           move.l d7, d0
            0x00002af6      2e1f           move.l (a7)+, d7
            0x00002af8      4e75           rts
            0x00002afa      4e71           nop
            ; CALL XREF from entry0 @ 0x1d6(x)
┌ 36: fcn.00002afc ();
│           0x00002afc      594f           subq.w 0x4, a7
│           0x00002afe      41f9000005c0   lea.l 0x5c0, a0
│           0x00002b04      2e88           move.l a0, (a7)
│           0x00002b06      6710           beq.b 0x2b18
│           0x00002b08      2079000005bc   movea.l 0x5bc, a0
│           0x00002b0e      4e90           jsr (a0)                    ; fcn.00000009
│           0x00002b10      4a80           tst.l d0
│           0x00002b12      6704           beq.b 0x2b18
│           0x00002b14      7014           moveq 0x14, d0
│           0x00002b16  ~   0c407000       cmpi.w 0x7000, d0
│           ; CODE XREFS from fcn.00002afc @ 0x2b06(x), 0x2b12(x)
│           0x00002b18      7000           moveq 0x0, d0
│           0x00002b1a      584f           addq.w 0x4, a7
└           0x00002b1c      4e75           rts
            ; CALL XREF from entry0 @ 0x21a(x)
┌ 24: fcn.00002b1e ();
│           0x00002b1e      594f           subq.w 0x4, a7
│           0x00002b20      41f9000005c8   lea.l 0x5c8, a0
│           0x00002b26      2e88           move.l a0, (a7)
│           0x00002b28      6708           beq.b 0x2b32
│           0x00002b2a      2079000005bc   movea.l 0x5bc, a0
│           0x00002b30      4e90           jsr (a0)                    ; fcn.00000009
│           ; CODE XREF from fcn.00002b1e @ 0x2b28(x)
│           0x00002b32      584f           addq.w 0x4, a7
└           0x00002b34      4e75           rts
            0x00002b36      4e71           nop
            ; CALL XREFS from fcn.00001224 @ 0x1250(x), 0x126e(x)
            ; CALL XREF from fcn.00002b68 @ 0x2bda(x)
┌ 46: fcn.00002b38 ();
│           0x00002b38      48e70104       movem.l d7/a5, -(a7)
│           0x00002b3c      2a6f000c       movea.l 0xc(a7), a5
│           0x00002b40      204d           movea.l a5, a0
│           ; CODE XREF from fcn.00002b38 @ 0x2b44(x)
│           0x00002b42      4a18           tst.b (a0)+
│           0x00002b44      66fc           bne.b 0x2b42
│           0x00002b46      5388           subq.l 0x1, a0
│           0x00002b48      91cd           suba.l a5, a0
│           0x00002b4a      2e08           move.l a0, d7
│           0x00002b4c      6008           bra.b 0x2b56
│           ; CODE XREF from fcn.00002b38 @ 0x2b5c(x)
│           0x00002b4e      41ec086e       lea.l 0x86e(a4), a0
│           0x00002b52      61001430       bsr.w fcn.00003f84
│           ; CODE XREF from fcn.00002b38 @ 0x2b4c(x)
│           0x00002b56      7000           moveq 0x0, d0
│           0x00002b58      101d           move.b (a5)+, d0
│           0x00002b5a      4a80           tst.l d0
│           0x00002b5c      66f0           bne.b 0x2b4e
│           0x00002b5e      2007           move.l d7, d0
│           0x00002b60      4cdf2080       movem.l (a7)+, d7/a5
└           0x00002b64      4e75           rts
            0x00002b66      4e71           nop
            ; CALL XREFS from fcn.00000284 @ 0x29a(x), 0x2a6(x)
┌ 164: fcn.00002b68 ();
│           0x00002b68      9efc0010       suba.w 0x10, a7
│           0x00002b6c      48e70f14       movem.l d4-d7/a3/a5, -(a7)
│           0x00002b70      4bef0030       lea.l 0x30(a7), a5
│           0x00002b74      7e00           moveq 0x0, d7
│           0x00002b76      607a           bra.b 0x2bf2
│           ; CODE XREF from fcn.00002b68 @ 0x2bfc(x)
│           0x00002b78      7025           moveq 0x25, d0
│           0x00002b7a      b800           cmp.b d0, d4
│           0x00002b7c      6666           bne.b 0x2be4
│           0x00002b7e      206f002c       movea.l 0x2c(a7), a0
│           0x00002b82      52af002c       addq.l 0x1, 0x2c(a7)
│           0x00002b86      1810           move.b (a0), d4
│           0x00002b88      7000           moveq 0x0, d0
│           0x00002b8a      1004           move.b d4, d0
│           0x00002b8c      7264           moveq 0x64, d1
│           0x00002b8e      9081           sub.l d1, d0
│           0x00002b90      6738           beq.b 0x2bca
│           0x00002b92      720c           moveq 0xc, d1
│           0x00002b94      9081           sub.l d1, d0
│           0x00002b96      670e           beq.b 0x2ba6
│           0x00002b98      5780           subq.l 0x3, d0
│           0x00002b9a      6706           beq.b 0x2ba2
│           0x00002b9c      5b80           subq.l 0x5, d0
│           0x00002b9e      6706           beq.b 0x2ba6
│           0x00002ba0      6042           bra.b 0x2be4
│           ; CODE XREF from fcn.00002b68 @ 0x2b9a(x)
│           0x00002ba2      265d           movea.l (a5)+, a3
│           0x00002ba4      6032           bra.b 0x2bd8
│           ; CODE XREFS from fcn.00002b68 @ 0x2b96(x), 0x2b9e(x)
│           0x00002ba6      2c1d           move.l (a5)+, d6
│           0x00002ba8      7a07           moveq 0x7, d5
│           0x00002baa      47ef0022       lea.l 0x22(a7), a3
│           ; CODE XREF from fcn.00002b68 @ 0x2bc2(x)
│           0x00002bae      2006           move.l d6, d0
│           0x00002bb0      720f           moveq 0xf, d1
│           0x00002bb2      c081           and.l d1, d0
│           0x00002bb4      41fa0056       lea.l 0x2c0c(pc), a0
│           0x00002bb8      d1c0           adda.l d0, a0
│           0x00002bba      1690           move.b (a0), (a3)
│           0x00002bbc      e886           asr.l 0x4, d6
│           0x00002bbe      5385           subq.l 0x1, d5
│           0x00002bc0      538b           subq.l 0x1, a3
│           0x00002bc2      6aea           bpl.b 0x2bae
│           0x00002bc4      422f0023       clr.b 0x23(a7)
│           0x00002bc8      600a           bra.b 0x2bd4
│           ; CODE XREF from fcn.00002b68 @ 0x2b90(x)
│           0x00002bca      201d           move.l (a5)+, d0
│           0x00002bcc      41ef001b       lea.l 0x1b(a7), a0
│           0x00002bd0      6100016e       bsr.w fcn.00002d40
│           ; CODE XREF from fcn.00002b68 @ 0x2bc8(x)
│           0x00002bd4      47ef001b       lea.l 0x1b(a7), a3
│           ; CODE XREF from fcn.00002b68 @ 0x2ba4(x)
│           0x00002bd8      2f0b           move.l a3, -(a7)
│           0x00002bda      6100ff5c       bsr.w fcn.00002b38
│           0x00002bde      584f           addq.w 0x4, a7
│           0x00002be0      de80           add.l d0, d7
│           0x00002be2      600e           bra.b 0x2bf2
│           ; CODE XREFS from fcn.00002b68 @ 0x2b7c(x), 0x2ba0(x)
│           0x00002be4      5287           addq.l 0x1, d7
│           0x00002be6      7000           moveq 0x0, d0
│           0x00002be8      1004           move.b d4, d0
│           0x00002bea      41ec086e       lea.l 0x86e(a4), a0
│           0x00002bee      61001394       bsr.w fcn.00003f84
│           ; CODE XREFS from fcn.00002b68 @ 0x2b76(x), 0x2be2(x)
│           0x00002bf2      206f002c       movea.l 0x2c(a7), a0
│           0x00002bf6      52af002c       addq.l 0x1, 0x2c(a7)
│           0x00002bfa      1810           move.b (a0), d4
│           0x00002bfc      6600ff7a       bne.w 0x2b78
│           0x00002c00      2007           move.l d7, d0
│           0x00002c02      4cdf28f0       movem.l (a7)+, d4-d7/a3/a5
│           0x00002c06      defc0010       adda.w 0x10, a7
└           0x00002c0a      4e75           rts
            0x00002c0c      30313233       move.w 0x33(a1, d3.w), d0
            0x00002c10      34353637       move.w 0x37(a5, d3.w), d2
            0x00002c14      383941424344   move.w 0x41424344.l, d4
            0x00002c1a      4546           invalid
            0x00002c1c      00004e71       ori.b 0x71, d0
            0x00002c20      48e70016       movem.l a3/a5-a6, -(a7)
            0x00002c24      2a6c6c94       movea.l 0x6c94(a4), a5
            0x00002c28      6014           bra.b 0x2c3e
            ; CODE XREF from fcn.00002b68 @ +0xd8(x)
            0x00002c2a      7014           moveq 0x14, d0
            0x00002c2c      d0ad0004       add.l 0x4(a5), d0
            0x00002c30      224d           movea.l a5, a1
            0x00002c32      2c780004       movea.l 0x4.w, a6
            0x00002c36      2655           movea.l (a5), a3
            0x00002c38      4eaeff2e       jsr -0xd2(a6)               ; fcn.000030f0-0x30f0
            0x00002c3c      2a4b           movea.l a3, a5
            ; CODE XREF from fcn.00002b68 @ +0xc0(x)
            0x00002c3e      200d           move.l a5, d0
            0x00002c40      66e8           bne.b 0x2c2a
            0x00002c42      42ac6c94       clr.l 0x6c94(a4)
            0x00002c46      4cdf6800       movem.l (a7)+, a3/a5-a6
            0x00002c4a      4e75           rts
            0x00002c4c      206f0004       movea.l 0x4(a7), a0
            0x00002c50      226f0008       movea.l 0x8(a7), a1
            ; CALL XREFS from fcn.00000ee0 @ 0xf60(x), 0xf88(x)
┌ 50: fcn.00002c54 ();
│           0x00002c54      7000           moveq 0x0, d0
│           0x00002c56      7200           moveq 0x0, d1
│           ; CODE XREF from fcn.00002c54 @ 0x2c82(x)
│           0x00002c58      1018           move.b (a0)+, d0
│           0x00002c5a      1219           move.b (a1)+, d1
│           0x00002c5c      0c000061       cmpi.b 0x61, d0
│           0x00002c60      6d0a           blt.b 0x2c6c
│           0x00002c62      0c00007a       cmpi.b 0x7a, d0
│           0x00002c66      6e04           bgt.b 0x2c6c
│           0x00002c68      04000020       subi.b 0x20, d0
│           ; CODE XREFS from fcn.00002c54 @ 0x2c60(x), 0x2c66(x)
│           0x00002c6c      0c010061       cmpi.b 0x61, d1
│           0x00002c70      6d0a           blt.b 0x2c7c
│           0x00002c72      0c01007a       cmpi.b 0x7a, d1
│           0x00002c76      6e04           bgt.b 0x2c7c
│           0x00002c78      04010020       subi.b 0x20, d1
│           ; CODE XREFS from fcn.00002c54 @ 0x2c70(x), 0x2c76(x)
│           0x00002c7c      9081           sub.l d1, d0
│           0x00002c7e      6604           bne.b 0x2c84
│           0x00002c80      4a01           tst.b d1
│           0x00002c82      66d4           bne.b 0x2c58
│           ; CODE XREF from fcn.00002c54 @ 0x2c7e(x)
└           0x00002c84      4e75           rts
            0x00002c86      0000226f       ori.b 0x6f, d0
            0x00002c8a      0008           invalid
            0x00002c8c      206f0004       movea.l 0x4(a7), a0
            ; CALL XREFS from fcn.00002d7c @ +0x14e(x), +0x15c(x), +0x174(x)
┌ 12: fcn.00002c90 ();
│           0x00002c90      2008           move.l a0, d0
│           ; CODE XREF from fcn.00002c90 @ 0x2c94(x)
│           0x00002c92      10d9           move.b (a1)+, (a0)+
│           0x00002c94      66fc           bne.b 0x2c92
│           0x00002c96      2008           move.l a0, d0
│           0x00002c98      5380           subq.l 0x1, d0
└           0x00002c9a      4e75           rts
            0x00002c9c      202f0008       move.l 0x8(a7), d0
            0x00002ca0      206f0004       movea.l 0x4(a7), a0
            ; CALL XREF from fcn.000045d8 @ +0x258(x)
┌ 38: fcn.00002ca4 ();
│           0x00002ca4      4e55fff4       link.w a5, 0xfff4
│           0x00002ca8      224f           movea.l a7, a1
│           ; CODE XREF from fcn.00002ca4 @ 0x2cb8(x)
│           0x00002caa      720a           moveq 0xa, d1
│           0x00002cac      4eba0aa8       jsr fcn.00003756(pc)
│           0x00002cb0      06410030       addi.w 0x30, d1
│           0x00002cb4      12c1           move.b d1, (a1)+
│           0x00002cb6      4a80           tst.l d0
│           0x00002cb8      66f0           bne.b 0x2caa
│           0x00002cba      2009           move.l a1, d0
│           ; CODE XREF from fcn.00002ca4 @ 0x2cc0(x)
│           0x00002cbc      10e1           move.b -(a1), (a0)+
│           0x00002cbe      bfc9           cmpa.l a1, a7
│           0x00002cc0      66fa           bne.b 0x2cbc
│           0x00002cc2      4210           clr.b (a0)
│           0x00002cc4      908f           sub.l a7, d0
│           0x00002cc6      4e5d           unlk a5
└           0x00002cc8      4e75           rts
            0x00002cca      0000202f       ori.b 0x2f, d0
            0x00002cce      0008           invalid
            0x00002cd0      206f0004       movea.l 0x4(a7), a0
            ; CALL XREF from fcn.000045d8 @ +0x30e(x)
┌ 38: fcn.00002cd4 ();
│           0x00002cd4      4e55fff4       link.w a5, 0xfff4
│           0x00002cd8      224f           movea.l a7, a1
│           ; CODE XREF from fcn.00002cd4 @ 0x2ce8(x)
│           0x00002cda      2200           move.l d0, d1
│           0x00002cdc      02410007       andi.w 0x7, d1
│           0x00002ce0      06410030       addi.w 0x30, d1
│           0x00002ce4      12c1           move.b d1, (a1)+
│           0x00002ce6      e688           lsr.l 0x3, d0
│           0x00002ce8      66f0           bne.b 0x2cda
│           0x00002cea      2009           move.l a1, d0
│           ; CODE XREF from fcn.00002cd4 @ 0x2cf0(x)
│           0x00002cec      10e1           move.b -(a1), (a0)+
│           0x00002cee      bfc9           cmpa.l a1, a7
│           0x00002cf0      66fa           bne.b 0x2cec
│           0x00002cf2      4210           clr.b (a0)
│           0x00002cf4      908f           sub.l a7, d0
│           0x00002cf6      4e5d           unlk a5
└           0x00002cf8      4e75           rts
            0x00002cfa      00003031       ori.b 0x31, d0
            0x00002cfe      32333435       move.w 0x35(a3, d3.w), d1
            0x00002d02      36373839       move.w 0x39(a7, d3.l), d3
            0x00002d06      6162           bsr.b fcn.00002d6a
            0x00002d08      6364           bls.b 0x2d6e                ; fcn.00002d6a+0x4
            0x00002d0a      6566           bcs.b 0x2d72
            0x00002d0c      202f0008       move.l 0x8(a7), d0
            0x00002d10      206f0004       movea.l 0x4(a7), a0
            ; CALL XREF from fcn.000045d8 @ +0x332(x)
┌ 34: fcn.00002d14 ();
│           0x00002d14      514f           subq.w 0x8, a7
│           0x00002d16      224f           movea.l a7, a1
│           ; CODE XREF from fcn.00002d14 @ 0x2d24(x)
│           0x00002d18      3200           move.w d0, d1
│           0x00002d1a      0241000f       andi.w 0xf, d1
│           0x00002d1e      12fb10dc       move.b 0x2cfc(pc, d1.w), (a1)+
│           0x00002d22      e888           lsr.l 0x4, d0
│           0x00002d24      66f2           bne.b 0x2d18
│           0x00002d26      2009           move.l a1, d0
│           ; CODE XREF from fcn.00002d14 @ 0x2d2c(x)
│           0x00002d28      10e1           move.b -(a1), (a0)+
│           0x00002d2a      bfc9           cmpa.l a1, a7
│           0x00002d2c      66fa           bne.b 0x2d28
│           0x00002d2e      4210           clr.b (a0)
│           0x00002d30      9089           sub.l a1, d0
│           0x00002d32      504f           addq.w 0x8, a7
└           0x00002d34      4e75           rts
            0x00002d36      0000202f       ori.b 0x2f, d0
            0x00002d3a      0008           invalid
            0x00002d3c      206f0004       movea.l 0x4(a7), a0
            ; CALL XREFS from fcn.000002f4 @ 0x552(x), 0x5f0(x), 0x64a(x), 0x6ac(x)
            ; CALL XREF from fcn.00002b68 @ 0x2bd0(x)
┌ 42: fcn.00002d40 ();
│           0x00002d40      2f08           move.l a0, -(a7)
│           0x00002d42      4a80           tst.l d0
│           0x00002d44      4e55fff4       link.w a5, 0xfff4
│           0x00002d48      224f           movea.l a7, a1
│           0x00002d4a      6c06           bge.b 0x2d52
│           0x00002d4c      10fc002d       move.b 0x2d, (a0)+
│           0x00002d50      4480           neg.l d0
│           ; CODE XREFS from fcn.00002d40 @ 0x2d4a(x), 0x2d60(x)
│           0x00002d52      720a           moveq 0xa, d1
│           0x00002d54      4eba0a00       jsr fcn.00003756(pc)
│           0x00002d58      06410030       addi.w 0x30, d1
│           0x00002d5c      12c1           move.b d1, (a1)+
│           0x00002d5e      4a80           tst.l d0
│           0x00002d60      66f0           bne.b 0x2d52
│           ; CODE XREF from fcn.00002d40 @ 0x2d66(x)
│           0x00002d62      10e1           move.b -(a1), (a0)+
│           0x00002d64      bfc9           cmpa.l a1, a7
│           0x00002d66      66fa           bne.b 0x2d62
└           0x00002d68      4210           clr.b (a0)
            ; CALL XREF from fcn.00002cd4 @ +0x32(x)
┌ 8: fcn.00002d6a ();
│           0x00002d6a      2008           move.l a0, d0
│           0x00002d6c      4e5d           unlk a5
│           ; CODE XREF from fcn.00002cd4 @ +0x34(x)
│           0x00002d6e      909f           sub.l (a7)+, d0
└           0x00002d70      4e75           rts
            ; CODE XREF from fcn.00002cd4 @ +0x36(x)
            0x00002d72      0000206f       ori.b 0x6f, d0
            0x00002d76      0004226f       ori.b 0x6f, d4
            0x00002d7a      0008           invalid
            ; CALL XREF from fcn.00003ee0 @ 0x3f04(x)
            ; CALL XREFS from fcn.000045d8 @ 0x46c2(x), 0x4700(x)
┌ 76: fcn.00002d7c ();
│           0x00002d7c      48e73020       movem.l d2-d3/a2, -(a7)
│           0x00002d80      2448           movea.l a0, a2
│           0x00002d82      7200           moveq 0x0, d1
│           0x00002d84      2001           move.l d1, d0
│           0x00002d86      2601           move.l d1, d3
│           0x00002d88      0c10002b       cmpi.b 0x2b, (a0)
│           0x00002d8c      6708           beq.b 0x2d96
│           0x00002d8e      0c10002d       cmpi.b 0x2d, (a0)
│           0x00002d92      6604           bne.b 0x2d98
│           0x00002d94      7601           moveq 0x1, d3
│           ; CODE XREF from fcn.00002d7c @ 0x2d8c(x)
│           0x00002d96      5248           addq.w 0x1, a0
│           ; CODE XREFS from fcn.00002d7c @ 0x2d92(x), 0x2db4(x), 0x2db8(x)
│           0x00002d98      1018           move.b (a0)+, d0
│           0x00002d9a      04000030       subi.b 0x30, d0
│           0x00002d9e      6d1a           blt.b 0x2dba
│           0x00002da0      0c000009       cmpi.b 0x9, d0
│           0x00002da4      6e14           bgt.b 0x2dba
│           0x00002da6      2401           move.l d1, d2
│           0x00002da8      e581           asl.l 0x2, d1
│           0x00002daa      d282           add.l d2, d1
│           0x00002dac      d281           add.l d1, d1
│           0x00002dae      4a03           tst.b d3
│           0x00002db0      6604           bne.b 0x2db6
│           0x00002db2      d280           add.l d0, d1
│           0x00002db4      60e2           bra.b 0x2d98
│           ; CODE XREF from fcn.00002d7c @ 0x2db0(x)
│           0x00002db6      9280           sub.l d0, d1
│           0x00002db8      60de           bra.b 0x2d98
│           ; CODE XREFS from fcn.00002d7c @ 0x2d9e(x), 0x2da4(x)
│           0x00002dba      2281           move.l d1, (a1)
│           0x00002dbc      2008           move.l a0, d0
│           0x00002dbe      908a           sub.l a2, d0
│           0x00002dc0      5380           subq.l 0x1, d0
│           0x00002dc2      4cdf040c       movem.l (a7)+, d2-d3/a2
└           0x00002dc6      4e75           rts
            0x00002dc8      48e72036       movem.l d2/a2-a3/a5-a6, -(a7)
            0x00002dcc      41ec084c       lea.l 0x84c(a4), a0
            0x00002dd0      29486cc8       move.l a0, 0x6cc8(a4)
            0x00002dd4      29486cdc       move.l a0, 0x6cdc(a4)
            0x00002dd8      41ec086e       lea.l 0x86e(a4), a0
            0x00002ddc      29486ce0       move.l a0, 0x6ce0(a4)
            0x00002de0      41ec6ca8       lea.l 0x6ca8(a4), a0
            0x00002de4      29486c98       move.l a0, 0x6c98(a4)
            0x00002de8      41ec6cb8       lea.l 0x6cb8(a4), a0
            0x00002dec      29486ca8       move.l a0, 0x6ca8(a4)
            0x00002df0      42ac6cb8       clr.l 0x6cb8(a4)
            0x00002df4      41ec6c98       lea.l 0x6c98(a4), a0
            0x00002df8      294808bc       move.l a0, 0x8bc(a4)
            0x00002dfc      42ac6ca4       clr.l 0x6ca4(a4)
            0x00002e00      42ac6cb4       clr.l 0x6cb4(a4)
            0x00002e04      42ac6cc4       clr.l 0x6cc4(a4)
            0x00002e08      297c000080..   move.l 0x8011, 0x6c9c(a4)
            0x00002e10      297c000080..   move.l 0x8012, 0x6cac(a4)
            0x00002e18      297c000080..   move.l 0x8016, 0x6cbc(a4)
            0x00002e20      2c6c0988       movea.l 0x988(a4), a6
            0x00002e24      4eaeffc4       jsr -0x3c(a6)               ; fcn.000030f0-0x30f0
            0x00002e28      4a80           tst.l d0
            0x00002e2a      6600013c       bne.w 0x2f68
            0x00002e2e      4aac6c84       tst.l 0x6c84(a4)
            0x00002e32      6720           beq.b 0x2e54
            0x00002e34      206c6c84       movea.l 0x6c84(a4), a0
            0x00002e38      4aa80020       tst.l 0x20(a0)
            0x00002e3c      6716           beq.b 0x2e54
            0x00002e3e      22280020       move.l 0x20(a0), d1
            0x00002e42      243c000003ee   move.l 0x3ee, d2
            0x00002e48      4eaeffe2       jsr -0x1e(a6)               ; fcn.000030f0-0x30f0
            0x00002e4c      29406ca0       move.l d0, 0x6ca0(a4)
            0x00002e50      600000b8       bra.w 0x2f0a
            ; CODE XREFS from fcn.00002d7c @ +0xb6(x), +0xc0(x)
            0x00002e54      9bcd           suba.l a5, a5
            0x00002e56      41ec0930       lea.l 0x930(a4), a0
            0x00002e5a      2248           movea.l a0, a1
            ; CODE XREF from fcn.00002d7c @ +0xe2(x)
            0x00002e5c      4a19           tst.b (a1)+
            0x00002e5e      66fc           bne.b 0x2e5c
            0x00002e60      5389           subq.l 0x1, a1
            0x00002e62      93c8           suba.l a0, a1
            0x00002e64      2409           move.l a1, d2
            0x00002e66      702f           moveq 0x2f, d0
            0x00002e68      2209           move.l a1, d1
            0x00002e6a      41ec092f       lea.l 0x92f(a4), a0
            0x00002e6e      b0301800       cmp.b (a0, d1.l), d0
            0x00002e72      6622           bne.b 0x2e96
            0x00002e74      4bfa0166       lea.l 0x2fdc(pc), a5
            0x00002e78      4aac6c84       tst.l 0x6c84(a4)
            0x00002e7c      670c           beq.b 0x2e8a
            0x00002e7e      226c6c84       movea.l 0x6c84(a4), a1
            0x00002e82      20690024       movea.l 0x24(a1), a0
            0x00002e86      2a680004       movea.l 0x4(a0), a5
            ; CODE XREF from fcn.00002d7c @ +0x100(x)
            0x00002e8a      204d           movea.l a5, a0
            ; CODE XREF from fcn.00002d7c @ +0x112(x)
            0x00002e8c      4a18           tst.b (a0)+
            0x00002e8e      66fc           bne.b 0x2e8c
            0x00002e90      5388           subq.l 0x1, a0
            0x00002e92      91cd           suba.l a5, a0
            0x00002e94      d488           add.l a0, d2
            ; CODE XREF from fcn.00002d7c @ +0xf6(x)
            0x00002e96      206c098c       movea.l 0x98c(a4), a0
            0x00002e9a      0c6800240014   cmpi.w 0x24, 0x14(a0)
            0x00002ea0      6510           bcs.b 0x2eb2
            0x00002ea2      41ec091c       lea.l 0x91c(a4), a0
            0x00002ea6      2248           movea.l a0, a1
            ; CODE XREF from fcn.00002d7c @ +0x12e(x)
            0x00002ea8      4a19           tst.b (a1)+
            0x00002eaa      66fc           bne.b 0x2ea8
            0x00002eac      5389           subq.l 0x1, a1
            0x00002eae      93c8           suba.l a0, a1
            0x00002eb0      d489           add.l a1, d2
            ; CODE XREF from fcn.00002d7c @ +0x124(x)
            0x00002eb2      2002           move.l d2, d0
            0x00002eb4      61000eb6       bsr.w fcn.00003d6c
            0x00002eb8      2640           movea.l d0, a3
            0x00002eba      4a80           tst.l d0
            0x00002ebc      6606           bne.b 0x2ec4
            0x00002ebe      7001           moveq 0x1, d0
            0x00002ec0      60000114       bra.w 0x2fd6
            ; CODE XREF from fcn.00002d7c @ +0x140(x)
            0x00002ec4      204b           movea.l a3, a0
            0x00002ec6      43ec0930       lea.l 0x930(a4), a1
            0x00002eca      6100fdc4       bsr.w fcn.00002c90
            0x00002ece      2440           movea.l d0, a2
            0x00002ed0      200d           move.l a5, d0
            0x00002ed2      670a           beq.b 0x2ede
            0x00002ed4      204a           movea.l a2, a0
            0x00002ed6      224d           movea.l a5, a1
            0x00002ed8      6100fdb6       bsr.w fcn.00002c90
            0x00002edc      2440           movea.l d0, a2
            ; CODE XREF from fcn.00002d7c @ +0x156(x)
            0x00002ede      206c098c       movea.l 0x98c(a4), a0
            0x00002ee2      0c6800240014   cmpi.w 0x24, 0x14(a0)
            0x00002ee8      650a           bcs.b 0x2ef4
            0x00002eea      204a           movea.l a2, a0
            0x00002eec      43ec091c       lea.l 0x91c(a4), a1
            0x00002ef0      6100fd9e       bsr.w fcn.00002c90
            ; CODE XREF from fcn.00002d7c @ +0x16c(x)
            0x00002ef4      220b           move.l a3, d1
            0x00002ef6      243c000003ee   move.l 0x3ee, d2
            0x00002efc      4eaeffe2       jsr -0x1e(a6)               ; fcn.000030f0-0x30f0
            0x00002f00      29406ca0       move.l d0, 0x6ca0(a4)
            0x00002f04      204b           movea.l a3, a0
            0x00002f06      61000cf8       bsr.w fcn.00003c00
            ; CODE XREF from fcn.00002d7c @ +0xd4(x)
            0x00002f0a      4aac6ca0       tst.l 0x6ca0(a4)
            0x00002f0e      660e           bne.b 0x2f1e
            0x00002f10      41fa00d2       lea.l 0x2fe4(pc), a0
            0x00002f14      2208           move.l a0, d1
            0x00002f16      4eaeffe2       jsr -0x1e(a6)               ; fcn.000030f0-0x30f0
            0x00002f1a      29406ca0       move.l d0, 0x6ca0(a4)
            ; CODE XREF from fcn.00002d7c @ +0x192(x)
            0x00002f1e      08ec00026c9f   bset.b 0x2, 0x6c9f(a4)
            0x00002f24      93c9           suba.l a1, a1
            0x00002f26      202c6ca0       move.l 0x6ca0(a4), d0
            0x00002f2a      e580           asl.l 0x2, d0
            0x00002f2c      2c780004       movea.l 0x4.w, a6
            0x00002f30      2440           movea.l d0, a2
            0x00002f32      4eaefeda       jsr -0x126(a6)              ; fcn.000030f0-0x30f0
            0x00002f36      2040           movea.l d0, a0
            0x00002f38      216a000800a4   move.l 0x8(a2), 0xa4(a0)
            0x00002f3e      41fa00aa       lea.l 0x2fea(pc), a0
            0x00002f42      2208           move.l a0, d1
            0x00002f44      243c000003ed   move.l 0x3ed, d2
            0x00002f4a      2c6c0988       movea.l 0x988(a4), a6
            0x00002f4e      4eaeffe2       jsr -0x1e(a6)               ; fcn.000030f0-0x30f0
            0x00002f52      29406cb0       move.l d0, 0x6cb0(a4)
            0x00002f56      6640           bne.b 0x2f98
            0x00002f58      41fa008a       lea.l 0x2fe4(pc), a0
            0x00002f5c      2208           move.l a0, d1
            0x00002f5e      4eaeffe2       jsr -0x1e(a6)               ; fcn.000030f0-0x30f0
            0x00002f62      29406cb0       move.l d0, 0x6cb0(a4)
            0x00002f66      6030           bra.b 0x2f98
            ; CODE XREF from fcn.00002d7c @ +0xae(x)
            0x00002f68      4eaeffca       jsr -0x36(a6)               ; fcn.000030f0-0x30f0
            0x00002f6c      29406ca0       move.l d0, 0x6ca0(a4)
            0x00002f70      4eaeffc4       jsr -0x3c(a6)               ; fcn.000030f0-0x30f0
            0x00002f74      29406cb0       move.l d0, 0x6cb0(a4)
            0x00002f78      41fa0070       lea.l 0x2fea(pc), a0
            0x00002f7c      2208           move.l a0, d1
            0x00002f7e      243c000003ed   move.l 0x3ed, d2
            0x00002f84      4eaeffe2       jsr -0x1e(a6)               ; fcn.000030f0-0x30f0
            0x00002f88      29406cc0       move.l d0, 0x6cc0(a4)
            0x00002f8c      660e           bne.b 0x2f9c
            0x00002f8e      41fa0054       lea.l 0x2fe4(pc), a0
            0x00002f92      2208           move.l a0, d1
            0x00002f94      4eaeffe2       jsr -0x1e(a6)               ; fcn.000030f0-0x30f0
            ; CODE XREFS from fcn.00002d7c @ +0x1da(x), +0x1ea(x)
            0x00002f98      29406cc0       move.l d0, 0x6cc0(a4)
            ; CODE XREF from fcn.00002d7c @ +0x210(x)
            0x00002f9c      56ac08b8       addq.l 0x3, 0x8b8(a4)
            0x00002fa0      7000           moveq 0x0, d0
            0x00002fa2      4aac08c0       tst.l 0x8c0(a4)
            0x00002fa6      6606           bne.b 0x2fae
            0x00002fa8      203c00008000   move.l 0x8000, d0
            ; CODE XREF from fcn.00002d7c @ +0x22a(x)
            0x00002fae      42ac0868       clr.l 0x868(a4)
            0x00002fb2      2200           move.l d0, d1
            0x00002fb4      00410001       ori.w 0x1, d1
            0x00002fb8      29410864       move.l d1, 0x864(a4)
            0x00002fbc      7201           moveq 0x1, d1
            0x00002fbe      2941088a       move.l d1, 0x88a(a4)
            0x00002fc2      00400042       ori.w 0x42, d0
            0x00002fc6      29400886       move.l d0, 0x886(a4)
            0x00002fca      7202           moveq 0x2, d1
            0x00002fcc      294108ac       move.l d1, 0x8ac(a4)
            0x00002fd0      294008a8       move.l d0, 0x8a8(a4)
            0x00002fd4      7000           moveq 0x0, d0
            ; CODE XREF from fcn.00002d7c @ +0x144(x)
            0x00002fd6      4cdf6c04       movem.l (a7)+, d2/a2-a3/a5-a6
            0x00002fda      4e75           rts
            0x00002fdc      4f75           invalid
            0x00002fde      7470           moveq 0x70, d2
            0x00002fe0      7574           invalid
            0x00002fe2      00004e49       ori.b 0x49, d0
            0x00002fe6      4c3a           invalid
            0x00002fe8      00002a00       ori.b 0x0, d0
            0x00002fec      206f0004       movea.l 0x4(a7), a0
            ; CALL XREF from fcn.00003f84 @ 0x408e(x)
            ; CALL XREF from fcn.0000417c @ 0x427e(x)
┌ 66: fcn.00002ff0 ();
│           0x00002ff0      2f0d           move.l a5, -(a7)
│           0x00002ff2      2a48           movea.l a0, a5
│           0x00002ff4      082d0003001b   btst.b 0x3, 0x1b(a5)
│           0x00002ffa      6630           bne.b 0x302c
│           0x00002ffc      202c08b4       move.l 0x8b4(a4), d0
│           0x00003000      61000d6a       bsr.w fcn.00003d6c
│           0x00003004      2b400004       move.l d0, 0x4(a5)
│           0x00003008      2b400010       move.l d0, 0x10(a5)
│           0x0000300c      660a           bne.b 0x3018
│           0x0000300e      700c           moveq 0xc, d0
│           0x00003010      29406c88       move.l d0, 0x6c88(a4)
│           0x00003014      70ff           moveq 0xff, d0
│           0x00003016      6016           bra.b 0x302e
│           ; CODE XREF from fcn.00002ff0 @ 0x300c(x)
│           0x00003018      2b6c08b40014   move.l 0x8b4(a4), 0x14(a5)
│           0x0000301e      70f3           moveq 0xf3, d0
│           0x00003020      c1ad0018       and.l d0, 0x18(a5)
│           0x00003024      42ad000c       clr.l 0xc(a5)
│           0x00003028      42ad0008       clr.l 0x8(a5)
│           ; CODE XREF from fcn.00002ff0 @ 0x2ffa(x)
│           0x0000302c      7000           moveq 0x0, d0
│           ; CODE XREF from fcn.00002ff0 @ 0x3016(x)
│           0x0000302e      2a5f           movea.l (a7)+, a5
└           0x00003030      4e75           rts
            0x00003032      4e71           nop
            0x00003034      206f0004       movea.l 0x4(a7), a0
            ; CALL XREF from fcn.00000ee0 @ 0xf26(x)
            ; CALL XREF from fcn.000045d8 @ +0x346(x)
┌ 50: fcn.00003038 ();
│           0x00003038      2f0b           move.l a3, -(a7)
│           0x0000303a      2248           movea.l a0, a1
│           0x0000303c      2649           movea.l a1, a3
│           0x0000303e      6020           bra.b 0x3060
│           ; CODE XREF from fcn.00003038 @ 0x3062(x)
│           0x00003040      41ec0741       lea.l 0x741(a4), a0
│           0x00003044      7000           moveq 0x0, d0
│           0x00003046      1013           move.b (a3), d0
│           0x00003048      083000010800   btst.b 0x1, (a0, d0.l)
│           0x0000304e      670a           beq.b 0x305a
│           0x00003050      7200           moveq 0x0, d1
│           0x00003052      1200           move.b d0, d1
│           0x00003054      7020           moveq 0x20, d0
│           0x00003056      9280           sub.l d0, d1
│           0x00003058      6004           bra.b 0x305e
│           ; CODE XREF from fcn.00003038 @ 0x304e(x)
│           0x0000305a      7200           moveq 0x0, d1
│           0x0000305c      1200           move.b d0, d1
│           ; CODE XREF from fcn.00003038 @ 0x3058(x)
│           0x0000305e      16c1           move.b d1, (a3)+
│           ; CODE XREF from fcn.00003038 @ 0x303e(x)
│           0x00003060      4a13           tst.b (a3)
│           0x00003062      66dc           bne.b 0x3040
│           0x00003064      2009           move.l a1, d0
│           0x00003066      265f           movea.l (a7)+, a3
└           0x00003068      4e75           rts
            0x0000306a      4e71           nop
            0x0000306c      48e70306       movem.l d6-d7/a5-a6, -(a7)
            0x00003070      7001           moveq 0x1, d0
            0x00003072      2940072c       move.l d0, 0x72c(a4)
            0x00003076      2a6c6cc8       movea.l 0x6cc8(a4), a5
            0x0000307a      6024           bra.b 0x30a0
            ; CODE XREF from fcn.00003038 @ +0x6a(x)
            0x0000307c      7006           moveq 0x6, d0
            0x0000307e      c0ad0018       and.l 0x18(a5), d0
            0x00003082      5580           subq.l 0x2, d0
            0x00003084      6618           bne.b 0x309e
            0x00003086      202d0004       move.l 0x4(a5), d0
            0x0000308a      90ad0010       sub.l 0x10(a5), d0
            0x0000308e      670e           beq.b 0x309e
            0x00003090      222d001c       move.l 0x1c(a5), d1
            0x00003094      c141           exg.l d0, d1
            0x00003096      206d0010       movea.l 0x10(a5), a0
            0x0000309a      610001a8       bsr.w fcn.00003244
            ; CODE XREFS from fcn.00003038 @ +0x4c(x), +0x56(x)
            0x0000309e      2a55           movea.l (a5), a5
            ; CODE XREF from fcn.00003038 @ +0x42(x)
            0x000030a0      200d           move.l a5, d0
            0x000030a2      66d8           bne.b 0x307c
            0x000030a4      2a6c08bc       movea.l 0x8bc(a4), a5
            0x000030a8      7e00           moveq 0x0, d7
            0x000030aa      6030           bra.b 0x30dc
            ; CODE XREF from fcn.00003038 @ +0xa6(x)
            0x000030ac      2c2d0004       move.l 0x4(a5), d6
            0x000030b0      4a06           tst.b d6
            0x000030b2      6712           beq.b 0x30c6
            0x000030b4      08060004       btst.b 0x4, d6
            0x000030b8      660c           bne.b 0x30c6
            0x000030ba      3007           move.w d7, d0
            0x000030bc      48c0           ext.l d0
            0x000030be      206c6ccc       movea.l 0x6ccc(a4), a0
            0x000030c2      4e90           jsr (a0)                    ; fcn.00000009
            0x000030c4      6012           bra.b 0x30d8
            ; CODE XREFS from fcn.00003038 @ +0x7a(x), +0x80(x)
            0x000030c6      08060002       btst.b 0x2, d6
            0x000030ca      670c           beq.b 0x30d8
            0x000030cc      222d0008       move.l 0x8(a5), d1
            0x000030d0      2c6c0988       movea.l 0x988(a4), a6
            0x000030d4      4eaeffdc       jsr -0x24(a6)               ; fcn.000030f0-0x30f0
            ; CODE XREFS from fcn.00003038 @ +0x8c(x), +0x92(x)
            0x000030d8      5247           addq.w 0x1, d7
            0x000030da      2a55           movea.l (a5), a5
            ; CODE XREF from fcn.00003038 @ +0x72(x)
            0x000030dc      200d           move.l a5, d0
            0x000030de      66cc           bne.b 0x30ac
            0x000030e0      4cdf60c0       movem.l (a7)+, d6-d7/a5-a6
            0x000030e4      4e75           rts
            0x000030e6      4e71           nop
            0x000030e8      206f0004       movea.l 0x4(a7), a0
            0x000030ec      202f0008       move.l 0x8(a7), d0
            ; CALL XREFS from fcn.00000d2e @ 0xd7e(x), 0xdbe(x)
┌ 217: fcn.000030f0 ();
│           0x000030f0      594f           subq.w 0x4, a7
│           0x000030f2      48e72306       movem.l d2/d6-d7/a5-a6, -(a7)
│           0x000030f6      2e00           move.l d0, d7
│           0x000030f8      2f480014       move.l a0, 0x14(a7)
│           0x000030fc      2208           move.l a0, d1
│           0x000030fe      74fe           moveq 0xfe, d2
│           0x00003100      2c6c0988       movea.l 0x988(a4), a6
│           0x00003104      4eaeffac       jsr -0x54(a6)
│           0x00003108      2c00           move.l d0, d6
│           0x0000310a      6612           bne.b 0x311e
│           0x0000310c      7002           moveq 0x2, d0
│           0x0000310e      29406c88       move.l d0, 0x6c88(a4)
│           0x00003112      297c000000..   move.l 0xcd, 0x6c7c(a4)
│           0x0000311a      60000112       bra.w 0x322e
│           ; CODE XREF from fcn.000030f0 @ 0x310a(x)
│           0x0000311e      7041           moveq 0x41, d0
│           0x00003120      e588           lsl.l 0x2, d0
│           0x00003122      7201           moveq 0x1, d1
│           0x00003124      2c780004       movea.l 0x4, a6
│           0x00003128      4eaeff3a       jsr -0xc6(a6)
│           0x0000312c      2a40           movea.l d0, a5
│           0x0000312e      4a80           tst.l d0
│           0x00003130      661a           bne.b 0x314c
│           0x00003132      700c           moveq 0xc, d0
│           0x00003134      29406c88       move.l d0, 0x6c88(a4)
│           0x00003138      7067           moveq 0x67, d0
│           0x0000313a      29406c7c       move.l d0, 0x6c7c(a4)
│           0x0000313e      2206           move.l d6, d1
│           0x00003140      2c6c0988       movea.l 0x988(a4), a6
│           0x00003144      4eaeffa6       jsr -0x5a(a6)
│           0x00003148      600000e4       bra.w 0x322e
│           ; CODE XREF from fcn.000030f0 @ 0x3130(x)
│           0x0000314c      2206           move.l d6, d1
│           0x0000314e      240d           move.l a5, d2
│           0x00003150      2c6c0988       movea.l 0x988(a4), a6
│           0x00003154      4eaeff9a       jsr -0x66(a6)
│           0x00003158      4a80           tst.l d0
│           0x0000315a      662a           bne.b 0x3186
│           0x0000315c      7002           moveq 0x2, d0
│           0x0000315e      29406c88       move.l d0, 0x6c88(a4)
│           0x00003162      297c000000..   move.l 0xcd, 0x6c7c(a4)
│           0x0000316a      7041           moveq 0x41, d0
│           0x0000316c      e588           lsl.l 0x2, d0
│           0x0000316e      2c780004       movea.l 0x4, a6
│           0x00003172      2242           movea.l d2, a1
│           0x00003174      4eaeff2e       jsr -0xd2(a6)
│           0x00003178      2206           move.l d6, d1
│           0x0000317a      2c6c0988       movea.l 0x988(a4), a6
│           0x0000317e      4eaeffa6       jsr -0x5a(a6)
│           0x00003182      600000aa       bra.w 0x322e
│           ; CODE XREF from fcn.000030f0 @ 0x315a(x)
│           0x00003186      2206           move.l d6, d1
│           0x00003188      4eaeffa6       jsr -0x5a(a6)
│           0x0000318c      2c2d0074       move.l 0x74(a5), d6
│           0x00003190      4686           not.l d6
│           0x00003192      7041           moveq 0x41, d0
│           0x00003194      e588           lsl.l 0x2, d0
│           0x00003196      2242           movea.l d2, a1
│           0x00003198      2c780004       movea.l 0x4, a6
│           0x0000319c      4eaeff2e       jsr -0xd2(a6)
│           0x000031a0      2007           move.l d7, d0
│           0x000031a2      0c8000000008   cmpi.l 0x8, d0
│           0x000031a8      64000084       bcc.w 0x322e
│           0x000031ac      d040           add.w d0, d0
│           0x000031ae      303b0006       move.w 0x31b6(pc, d0.w), d0
│           0x000031b2      4efb0004       jmp 0x31b8(pc, d0.w)
            0x000031b6      000e           invalid
            0x000031b8      0012001c       ori.b 0x1c, (a2)
            0x000031bc      00260036       ori.b 0x36, -(a6)
            0x000031c0      00400050       ori.w 0x50, d0
            0x000031c4      00607000       ori.w 0x7000, -(a0)
            0x000031c8      6066           bra.b 0x3230                ; fcn.000030f0+0x140
            0x000031ca      08060001       btst.b 0x1, d6
            0x000031ce      675e           beq.b 0x322e                ; fcn.000030f0+0x13e
            0x000031d0      7000           moveq 0x0, d0
            0x000031d2      605c           bra.b 0x3230                ; fcn.000030f0+0x140
            0x000031d4      08060002       btst.b 0x2, d6
            0x000031d8      6754           beq.b 0x322e                ; fcn.000030f0+0x13e
            0x000031da      7000           moveq 0x0, d0
            0x000031dc      6052           bra.b 0x3230                ; fcn.000030f0+0x140
            0x000031de      08060002       btst.b 0x2, d6
            0x000031e2      674a           beq.b 0x322e                ; fcn.000030f0+0x13e
            0x000031e4      08060001       btst.b 0x1, d6
            0x000031e8      6744           beq.b 0x322e                ; fcn.000030f0+0x13e
            0x000031ea      7000           moveq 0x0, d0
            0x000031ec      6042           bra.b 0x3230                ; fcn.000030f0+0x140
            0x000031ee      08060003       btst.b 0x3, d6
            0x000031f2      673a           beq.b 0x322e                ; fcn.000030f0+0x13e
            0x000031f4      7000           moveq 0x0, d0
            0x000031f6      6038           bra.b 0x3230                ; fcn.000030f0+0x140
            0x000031f8      08060003       btst.b 0x3, d6
            0x000031fc      670a           beq.b 0x3208
            0x000031fe      08060001       btst.b 0x1, d6
            0x00003202      6704           beq.b 0x3208
            0x00003204      7000           moveq 0x0, d0
            0x00003206      6028           bra.b 0x3230                ; fcn.000030f0+0x140
            ; CODE XREFS from fcn.000030f0 @ +0x10c(x), +0x112(x)
            0x00003208      08060003       btst.b 0x3, d6
            0x0000320c      6720           beq.b 0x322e                ; fcn.000030f0+0x13e
            0x0000320e      08060002       btst.b 0x2, d6
            0x00003212      671a           beq.b 0x322e                ; fcn.000030f0+0x13e
            0x00003214      7000           moveq 0x0, d0
            0x00003216      6018           bra.b 0x3230                ; fcn.000030f0+0x140
            0x00003218      08060003       btst.b 0x3, d6
            0x0000321c      6710           beq.b 0x322e                ; fcn.000030f0+0x13e
            0x0000321e      08060002       btst.b 0x2, d6
            0x00003222      670a           beq.b 0x322e                ; fcn.000030f0+0x13e
            0x00003224      08060001       btst.b 0x1, d6
            0x00003228      6704           beq.b 0x322e                ; fcn.000030f0+0x13e
            0x0000322a      7000           moveq 0x0, d0
            0x0000322c  ~   0c4070ff       cmpi.w 0x70ff, d0
│           ; XREFS: CODE 0x0000311a  CODE 0x00003148  CODE 0x00003182  
│           ; XREFS: CODE 0x000031a8  CODE 0x000031ce  CODE 0x000031d8  
│           ; XREFS: CODE 0x000031e2  CODE 0x000031e8  CODE 0x000031f2  
│           ; XREFS: CODE 0x0000320c  CODE 0x00003212  CODE 0x0000321c  
│           ; XREFS: CODE 0x00003222  CODE 0x00003228  
│           0x0000322e      70ff           moveq 0xff, d0
│           ; XREFS: CODE 0x000031c8  CODE 0x000031d2  CODE 0x000031dc  
│           ; XREFS: CODE 0x000031ec  CODE 0x000031f6  CODE 0x00003206  
│           ; XREFS: CODE 0x00003216  
│           0x00003230      4cdf60c4       movem.l (a7)+, d2/d6-d7/a5-a6
│           0x00003234      584f           addq.w 0x4, a7
│           0x00003236      4e75           rts
            0x00003238      202f0004       move.l 0x4(a7), d0
            0x0000323c      222f000c       move.l 0xc(a7), d1
            0x00003240      206f0008       movea.l 0x8(a7), a0
            ; CALL XREF from fcn.00003038 @ +0x62(x)
            ; CALL XREF from fcn.00003f84 @ 0x4066(x)
            ; CALL XREF from fcn.000042e8 @ 0x434c(x)
┌ 250: fcn.00003244 ();
│           0x00003244      594f           subq.w 0x4, a7
│           0x00003246      48e73136       movem.l d2-d3/d7/a2-a3/a5-a6, -(a7)
│           0x0000324a      2e01           move.l d1, d7
│           0x0000324c      2400           move.l d0, d2
│           0x0000324e      2f40001c       move.l d0, 0x1c(a7)
│           0x00003252      2a48           movea.l a0, a5
│           0x00003254      610008be       bsr.w fcn.00003b14
│           0x00003258      2002           move.l d2, d0
│           0x0000325a      61000874       bsr.w fcn.00003ad0
│           0x0000325e      2640           movea.l d0, a3
│           0x00003260      4a80           tst.l d0
│           0x00003262      6606           bne.b 0x326a
│           0x00003264      7016           moveq 0x16, d0
│           0x00003266      600000c8       bra.w 0x3330
│           ; CODE XREF from fcn.00003244 @ 0x3262(x)
│           0x0000326a      082b00010007   btst.b 0x1, 0x7(a3)
│           0x00003270      660e           bne.b 0x3280
│           0x00003272      297c000000..   move.l 0xdf, 0x6c7c(a4)
│           0x0000327a      7005           moveq 0x5, d0
│           0x0000327c      600000b2       bra.w 0x3330
│           ; CODE XREF from fcn.00003244 @ 0x3270(x)
│           0x00003280      082b00050007   btst.b 0x5, 0x7(a3)
│           0x00003286      670e           beq.b 0x3296
│           0x00003288      48780002       pea.l 0x2
│           0x0000328c      2002           move.l d2, d0
│           0x0000328e      7200           moveq 0x0, d1
│           0x00003290      610001b8       bsr.w fcn.0000344a
│           0x00003294      584f           addq.w 0x4, a7
│           ; CODE XREF from fcn.00003244 @ 0x3286(x)
│           0x00003296      082b00060007   btst.b 0x6, 0x7(a3)
│           0x0000329c      6710           beq.b 0x32ae
│           0x0000329e      2207           move.l d7, d1
│           0x000032a0      700a           moveq 0xa, d0
│           0x000032a2      204d           movea.l a5, a0
│           0x000032a4      610008fa       bsr.w fcn.00003ba0
│           0x000032a8      2440           movea.l d0, a2
│           0x000032aa      4a80           tst.l d0
│           0x000032ac      661a           bne.b 0x32c8
│           ; CODE XREF from fcn.00003244 @ 0x329c(x)
│           0x000032ae      222b0008       move.l 0x8(a3), d1
│           0x000032b2      240d           move.l a5, d2
│           0x000032b4      2607           move.l d7, d3
│           0x000032b6      2c6c0988       movea.l 0x988(a4), a6
│           0x000032ba      4eaeffd0       jsr -0x30(a6)               ; fcn.000030f0-0x30f0
│           0x000032be      2200           move.l d0, d1
│           0x000032c0      5280           addq.l 0x1, d0
│           0x000032c2      675c           beq.b 0x3320
│           0x000032c4      2001           move.l d1, d0
│           0x000032c6      606e           bra.b 0x3336
│           ; CODE XREFS from fcn.00003244 @ 0x32ac(x), 0x3306(x)
│           0x000032c8      260a           move.l a2, d3
│           0x000032ca      240d           move.l a5, d2
│           0x000032cc      9682           sub.l d2, d3
│           0x000032ce      222b0008       move.l 0x8(a3), d1
│           0x000032d2      2c6c0988       movea.l 0x988(a4), a6
│           0x000032d6      4eaeffd0       jsr -0x30(a6)               ; fcn.000030f0-0x30f0
│           0x000032da      5280           addq.l 0x1, d0
│           0x000032dc      6742           beq.b 0x3320
│           0x000032de      41fa005e       lea.l 0x333e(pc), a0
│           0x000032e2      9e83           sub.l d3, d7
│           0x000032e4      222b0008       move.l 0x8(a3), d1
│           0x000032e8      2408           move.l a0, d2
│           0x000032ea      7601           moveq 0x1, d3
│           0x000032ec      4eaeffd0       jsr -0x30(a6)               ; fcn.000030f0-0x30f0
│           0x000032f0      2a4a           movea.l a2, a5
│           0x000032f2      5280           addq.l 0x1, d0
│           0x000032f4      672a           beq.b 0x3320
│           0x000032f6      41ed0001       lea.l 0x1(a5), a0
│           0x000032fa      2207           move.l d7, d1
│           0x000032fc      700a           moveq 0xa, d0
│           0x000032fe      610008a0       bsr.w fcn.00003ba0
│           0x00003302      2440           movea.l d0, a2
│           0x00003304      200a           move.l a2, d0
│           0x00003306      66c0           bne.b 0x32c8
│           0x00003308      222b0008       move.l 0x8(a3), d1
│           0x0000330c      240d           move.l a5, d2
│           0x0000330e      2607           move.l d7, d3
│           0x00003310      2c6c0988       movea.l 0x988(a4), a6
│           0x00003314      4eaeffd0       jsr -0x30(a6)               ; fcn.000030f0-0x30f0
│           0x00003318      5280           addq.l 0x1, d0
│           0x0000331a      6704           beq.b 0x3320
│           0x0000331c      2003           move.l d3, d0
│           0x0000331e      6016           bra.b 0x3336
│           ; CODE XREFS from fcn.00003244 @ 0x32c2(x), 0x32dc(x), 0x32f4(x), 0x331a(x)
│           0x00003320      2c6c0988       movea.l 0x988(a4), a6
│           0x00003324      4eaeff7c       jsr -0x84(a6)               ; fcn.000030f0-0x30f0
│           0x00003328      29406c7c       move.l d0, 0x6c7c(a4)
│           0x0000332c      610017b6       bsr.w fcn.00004ae4
│           ; CODE XREFS from fcn.00003244 @ 0x3266(x), 0x327c(x)
│           0x00003330      29406c88       move.l d0, 0x6c88(a4)
│           0x00003334      70ff           moveq 0xff, d0
│           ; CODE XREFS from fcn.00003244 @ 0x32c6(x), 0x331e(x)
│           0x00003336      4cdf6c8c       movem.l (a7)+, d2-d3/d7/a2-a3/a5-a6
│           0x0000333a      584f           addq.w 0x4, a7
└           0x0000333c      4e75           rts
            0x0000333e      0d00           btst.l d6, d0
            0x00003340      202f0004       move.l 0x4(a7), d0
            0x00003344      222f000c       move.l 0xc(a7), d1
            0x00003348      206f0008       movea.l 0x8(a7), a0
            ; CALL XREFS from fcn.0000417c @ 0x41a4(x), 0x4252(x), 0x42a4(x)
┌ 238: fcn.0000334c ();
│           0x0000334c      514f           subq.w 0x8, a7
│           0x0000334e      48e73236       movem.l d2-d3/d6/a2-a3/a5-a6, -(a7)
│           0x00003352      2601           move.l d1, d3
│           0x00003354      2c00           move.l d0, d6
│           0x00003356      2f40001c       move.l d0, 0x1c(a7)
│           0x0000335a      2f480020       move.l a0, 0x20(a7)
│           0x0000335e      610007b4       bsr.w fcn.00003b14
│           0x00003362      2006           move.l d6, d0
│           0x00003364      6100076a       bsr.w fcn.00003ad0
│           0x00003368      2a40           movea.l d0, a5
│           0x0000336a      4a80           tst.l d0
│           0x0000336c      660c           bne.b 0x337a
│           0x0000336e      7016           moveq 0x16, d0
│           0x00003370      29406c88       move.l d0, 0x6c88(a4)
│           0x00003374      70ff           moveq 0xff, d0
│           0x00003376      600000ba       bra.w 0x3432
│           ; CODE XREF from fcn.0000334c @ 0x336c(x)
│           0x0000337a      082d00000007   btst.b 0x0, 0x7(a5)
│           0x00003380      6614           bne.b 0x3396
│           0x00003382      297c000000..   move.l 0xe0, 0x6c7c(a4)
│           0x0000338a      7005           moveq 0x5, d0
│           0x0000338c      29406c88       move.l d0, 0x6c88(a4)
│           0x00003390      70ff           moveq 0xff, d0
│           0x00003392      6000009e       bra.w 0x3432
│           ; CODE XREF from fcn.0000334c @ 0x3380(x)
│           0x00003396      42ac6c7c       clr.l 0x6c7c(a4)
│           0x0000339a      266f0020       movea.l 0x20(a7), a3
│           0x0000339e      222d0008       move.l 0x8(a5), d1
│           0x000033a2      240b           move.l a3, d2
│           0x000033a4      2c6c0988       movea.l 0x988(a4), a6
│           0x000033a8      4eaeffd6       jsr -0x2a(a6)               ; fcn.000030f0-0x30f0
│           0x000033ac      2c00           move.l d0, d6
│           0x000033ae      5280           addq.l 0x1, d0
│           0x000033b0      6614           bne.b 0x33c6
│           0x000033b2      4eaeff7c       jsr -0x84(a6)               ; fcn.000030f0-0x30f0
│           0x000033b6      29406c7c       move.l d0, 0x6c7c(a4)
│           0x000033ba      61001728       bsr.w fcn.00004ae4
│           0x000033be      29406c88       move.l d0, 0x6c88(a4)
│           0x000033c2      70ff           moveq 0xff, d0
│           0x000033c4      606c           bra.b 0x3432
│           ; CODE XREF from fcn.0000334c @ 0x33b0(x)
│           0x000033c6      4a86           tst.l d6
│           0x000033c8      6708           beq.b 0x33d2
│           0x000033ca      082d00060007   btst.b 0x6, 0x7(a5)
│           0x000033d0      6604           bne.b 0x33d6
│           ; CODE XREF from fcn.0000334c @ 0x33c8(x)
│           0x000033d2      2006           move.l d6, d0
│           0x000033d4      605c           bra.b 0x3432
│           ; CODE XREF from fcn.0000334c @ 0x33d0(x)
│           0x000033d6      244b           movea.l a3, a2
│           0x000033d8      d5c6           adda.l d6, a2
│           0x000033da      700d           moveq 0xd, d0
│           0x000033dc      b02affff       cmp.b -0x1(a2), d0
│           0x000033e0      660a           bne.b 0x33ec
│           0x000033e2      222d0008       move.l 0x8(a5), d1
│           0x000033e6      7601           moveq 0x1, d3
│           0x000033e8      4eaeffd6       jsr -0x2a(a6)               ; fcn.000030f0-0x30f0
│           ; CODE XREF from fcn.0000334c @ 0x33e0(x)
│           0x000033ec      2042           movea.l d2, a0
│           0x000033ee      2206           move.l d6, d1
│           0x000033f0      700d           moveq 0xd, d0
│           0x000033f2      610007ac       bsr.w fcn.00003ba0
│           0x000033f6      2040           movea.l d0, a0
│           0x000033f8      4a80           tst.l d0
│           0x000033fa      671e           beq.b 0x341a
│           0x000033fc      47e80001       lea.l 0x1(a0), a3
│           0x00003400      600c           bra.b 0x340e
│           ; CODE XREF from fcn.0000334c @ 0x3410(x)
│           0x00003402      1013           move.b (a3), d0
│           0x00003404      720d           moveq 0xd, d1
│           0x00003406      b001           cmp.b d1, d0
│           0x00003408      6702           beq.b 0x340c
│           0x0000340a      10c0           move.b d0, (a0)+
│           ; CODE XREF from fcn.0000334c @ 0x3408(x)
│           0x0000340c      528b           addq.l 0x1, a3
│           ; CODE XREF from fcn.0000334c @ 0x3400(x)
│           0x0000340e      b7ca           cmpa.l a2, a3
│           0x00003410      65f0           bcs.b 0x3402
│           0x00003412      266f0020       movea.l 0x20(a7), a3
│           0x00003416      2c08           move.l a0, d6
│           0x00003418      9c8b           sub.l a3, d6
│           ; CODE XREF from fcn.0000334c @ 0x33fa(x)
│           0x0000341a      2206           move.l d6, d1
│           0x0000341c      701a           moveq 0x1a, d0
│           0x0000341e      204b           movea.l a3, a0
│           0x00003420      6100077e       bsr.w fcn.00003ba0
│           0x00003424      2040           movea.l d0, a0
│           0x00003426      4a80           tst.l d0
│           0x00003428      6604           bne.b 0x342e
│           0x0000342a      2006           move.l d6, d0
│           0x0000342c      6004           bra.b 0x3432
│           ; CODE XREF from fcn.0000334c @ 0x3428(x)
│           0x0000342e      2008           move.l a0, d0
│           0x00003430      908b           sub.l a3, d0
│           ; CODE XREFS from fcn.0000334c @ 0x3376(x), 0x3392(x), 0x33c4(x), 0x33d4(x), 0x342c(x)
│           0x00003432      4cdf6c4c       movem.l (a7)+, d2-d3/d6/a2-a3/a5-a6
│           0x00003436      504f           addq.w 0x8, a7
└           0x00003438      4e75           rts
            0x0000343a      4e71           nop
            0x0000343c      202f0004       move.l 0x4(a7), d0
            0x00003440      222f0008       move.l 0x8(a7), d1
            0x00003444      2f6f000c0004   move.l 0xc(a7), 0x4(a7)
            ; CALL XREF from fcn.00003244 @ 0x3290(x)
            ; CALL XREF from fcn.0000442a @ 0x451a(x)
┌ 138: fcn.0000344a ();
│           0x0000344a      594f           subq.w 0x4, a7
│           0x0000344c      48e73306       movem.l d2-d3/d6-d7/a5-a6, -(a7)
│           0x00003450      2c2f0020       move.l 0x20(a7), d6
│           0x00003454      2e01           move.l d1, d7
│           0x00003456      2400           move.l d0, d2
│           0x00003458      2f400018       move.l d0, 0x18(a7)
│           0x0000345c      610006b6       bsr.w fcn.00003b14
│           0x00003460      2002           move.l d2, d0
│           0x00003462      6100066c       bsr.w fcn.00003ad0
│           0x00003466      2a40           movea.l d0, a5
│           0x00003468      4a80           tst.l d0
│           0x0000346a      660a           bne.b 0x3476
│           0x0000346c      7016           moveq 0x16, d0
│           0x0000346e      29406c88       move.l d0, 0x6c88(a4)
│           0x00003472      70ff           moveq 0xff, d0
│           0x00003474      6056           bra.b 0x34cc
│           ; CODE XREF from fcn.0000344a @ 0x346a(x)
│           0x00003476      42ac6c7c       clr.l 0x6c7c(a4)
│           0x0000347a      2606           move.l d6, d3
│           0x0000347c      5383           subq.l 0x1, d3
│           0x0000347e      222d0008       move.l 0x8(a5), d1
│           0x00003482      2407           move.l d7, d2
│           0x00003484      2c6c0988       movea.l 0x988(a4), a6
│           0x00003488      4eaeffbe       jsr -0x42(a6)               ; fcn.000030f0-0x30f0
│           0x0000348c      2200           move.l d0, d1
│           0x0000348e      5280           addq.l 0x1, d0
│           0x00003490      6612           bne.b 0x34a4
│           0x00003492      4eaeff7c       jsr -0x84(a6)               ; fcn.000030f0-0x30f0
│           0x00003496      29406c7c       move.l d0, 0x6c7c(a4)
│           0x0000349a      7005           moveq 0x5, d0
│           0x0000349c      29406c88       move.l d0, 0x6c88(a4)
│           0x000034a0      70ff           moveq 0xff, d0
│           0x000034a2      6028           bra.b 0x34cc
│           ; CODE XREF from fcn.0000344a @ 0x3490(x)
│           0x000034a4      2006           move.l d6, d0
│           0x000034a6      670a           beq.b 0x34b2
│           0x000034a8      5380           subq.l 0x1, d0
│           0x000034aa      670a           beq.b 0x34b6
│           0x000034ac      5380           subq.l 0x1, d0
│           0x000034ae      670c           beq.b 0x34bc
│           0x000034b0      601a           bra.b 0x34cc
│           ; CODE XREF from fcn.0000344a @ 0x34a6(x)
│           0x000034b2      2007           move.l d7, d0
│           0x000034b4      6016           bra.b 0x34cc
│           ; CODE XREF from fcn.0000344a @ 0x34aa(x)
│           0x000034b6      2001           move.l d1, d0
│           0x000034b8      d087           add.l d7, d0
│           0x000034ba      6010           bra.b 0x34cc
│           ; CODE XREF from fcn.0000344a @ 0x34ae(x)
│           0x000034bc      222d0008       move.l 0x8(a5), d1
│           0x000034c0      7400           moveq 0x0, d2
│           0x000034c2      2602           move.l d2, d3
│           0x000034c4      2c6c0988       movea.l 0x988(a4), a6
│           0x000034c8      4eaeffbe       jsr -0x42(a6)               ; fcn.000030f0-0x30f0
│           ; CODE XREFS from fcn.0000344a @ 0x3474(x), 0x34a2(x), 0x34b0(x), 0x34b4(x), 0x34ba(x)
│           0x000034cc      4cdf60cc       movem.l (a7)+, d2-d3/d6-d7/a5-a6
│           0x000034d0      584f           addq.w 0x4, a7
└           0x000034d2      4e75           rts
            0x000034d4      202f0004       move.l 0x4(a7), d0
            ; CALL XREF from fcn.000043c0 @ 0x4404(x)
┌ 108: fcn.000034d8 ();
│           0x000034d8      48e70106       movem.l d7/a5-a6, -(a7)
│           0x000034dc      2e00           move.l d0, d7
│           0x000034de      61000634       bsr.w fcn.00003b14
│           0x000034e2      2007           move.l d7, d0
│           0x000034e4      610005ea       bsr.w fcn.00003ad0
│           0x000034e8      2a40           movea.l d0, a5
│           0x000034ea      4a80           tst.l d0
│           0x000034ec      6604           bne.b 0x34f2
│           0x000034ee      70ff           moveq 0xff, d0
│           0x000034f0      604c           bra.b 0x353e
│           ; CODE XREF from fcn.000034d8 @ 0x34ec(x)
│           0x000034f2      7014           moveq 0x14, d0
│           0x000034f4      c0ad0004       and.l 0x4(a5), d0
│           0x000034f8      7210           moveq 0x10, d1
│           0x000034fa      b081           cmp.l d1, d0
│           0x000034fc      6608           bne.b 0x3506
│           0x000034fe      7000           moveq 0x0, d0
│           0x00003500      2b400004       move.l d0, 0x4(a5)
│           0x00003504      6038           bra.b 0x353e
│           ; CODE XREF from fcn.000034d8 @ 0x34fc(x)
│           0x00003506      4aad0004       tst.l 0x4(a5)
│           0x0000350a      6604           bne.b 0x3510
│           0x0000350c      70ff           moveq 0xff, d0
│           0x0000350e      602e           bra.b 0x353e
│           ; CODE XREF from fcn.000034d8 @ 0x350a(x)
│           0x00003510      222d0008       move.l 0x8(a5), d1
│           0x00003514      2c6c0988       movea.l 0x988(a4), a6
│           0x00003518      4eaeffdc       jsr -0x24(a6)               ; fcn.000030f0-0x30f0
│           0x0000351c      082d00070007   btst.b 0x7, 0x7(a5)
│           0x00003522      6708           beq.b 0x352c
│           0x00003524      206d000c       movea.l 0xc(a5), a0
│           0x00003528      6100158a       bsr.w fcn.00004ab4
│           ; CODE XREF from fcn.000034d8 @ 0x3522(x)
│           0x0000352c      202d000c       move.l 0xc(a5), d0
│           0x00003530      6706           beq.b 0x3538
│           0x00003532      2040           movea.l d0, a0
│           0x00003534      610006ca       bsr.w fcn.00003c00
│           ; CODE XREF from fcn.000034d8 @ 0x3530(x)
│           0x00003538      42ad0004       clr.l 0x4(a5)
│           0x0000353c      7000           moveq 0x0, d0
│           ; CODE XREFS from fcn.000034d8 @ 0x34f0(x), 0x3504(x), 0x350e(x)
│           0x0000353e      4cdf6080       movem.l (a7)+, d7/a5-a6
└           0x00003542      4e75           rts
            ; CALL XREF from fcn.0000442a @ 0x44dc(x)
┌ 486: fcn.00003544 ();
│           0x00003544      594f           subq.w 0x4, a7
│           0x00003546      48e72f36       movem.l d2/d4-d7/a2-a3/a5-a6, -(a7)
│           0x0000354a      2a6f002c       movea.l 0x2c(a7), a5
│           0x0000354e      7e00           moveq 0x0, d7
│           0x00003550      1f7c00010027   move.b 0x1, 0x27(a7)
│           0x00003556      41faff80       lea.l fcn.000034d8(pc), a0
│           0x0000355a      29486ccc       move.l a0, 0x6ccc(a4)
│           0x0000355e      610005b4       bsr.w fcn.00003b14
│           0x00003562      266c08bc       movea.l 0x8bc(a4), a3
│           0x00003566      244b           movea.l a3, a2
│           0x00003568      7200           moveq 0x0, d1
│           0x0000356a      6006           bra.b 0x3572
│           ; CODE XREF from fcn.00003544 @ 0x357a(x)
│           0x0000356c      244b           movea.l a3, a2
│           0x0000356e      5281           addq.l 0x1, d1
│           0x00003570      2652           movea.l (a2), a3
│           ; CODE XREF from fcn.00003544 @ 0x356a(x)
│           0x00003572      200b           move.l a3, d0
│           0x00003574      6706           beq.b 0x357c
│           0x00003576      4aab0004       tst.l 0x4(a3)
│           0x0000357a      66f0           bne.b 0x356c
│           ; CODE XREF from fcn.00003544 @ 0x3574(x)
│           0x0000357c      200b           move.l a3, d0
│           0x0000357e      662e           bne.b 0x35ae
│           0x00003580      7010           moveq 0x10, d0
│           0x00003582      610007e8       bsr.w fcn.00003d6c
│           0x00003586      2640           movea.l d0, a3
│           0x00003588      4a80           tst.l d0
│           0x0000358a      6606           bne.b 0x3592
│           0x0000358c      700c           moveq 0xc, d0
│           0x0000358e      60000186       bra.w 0x3716
│           ; CODE XREF from fcn.00003544 @ 0x358a(x)
│           0x00003592      4293           clr.l (a3)
│           0x00003594      42ab0004       clr.l 0x4(a3)
│           0x00003598      200a           move.l a2, d0
│           0x0000359a      6606           bne.b 0x35a2
│           0x0000359c      294b08bc       move.l a3, 0x8bc(a4)
│           0x000035a0  ~   0c40248b       cmpi.w 0x248b, d0
│           ; CODE XREF from fcn.00003544 @ 0x359a(x)
│           0x000035a2      248b           move.l a3, (a2)
│           0x000035a4      2a2c08b8       move.l 0x8b8(a4), d5
│           0x000035a8      52ac08b8       addq.l 0x1, 0x8b8(a4)
│           0x000035ac  ~   0c402a01       cmpi.w 0x2a01, d0
│           ; CODE XREF from fcn.00003544 @ 0x357e(x)
│           0x000035ae      2a01           move.l d1, d5
│           0x000035b0      204d           movea.l a5, a0
│           ; CODE XREF from fcn.00003544 @ 0x35b4(x)
│           0x000035b2      4a18           tst.b (a0)+
│           0x000035b4      66fc           bne.b 0x35b2
│           0x000035b6      5388           subq.l 0x1, a0
│           0x000035b8      91cd           suba.l a5, a0
│           0x000035ba      2008           move.l a0, d0
│           0x000035bc      5280           addq.l 0x1, d0
│           0x000035be      610007ac       bsr.w fcn.00003d6c
│           0x000035c2      2740000c       move.l d0, 0xc(a3)
│           0x000035c6      6610           bne.b 0x35d8
│           0x000035c8      720c           moveq 0xc, d1
│           0x000035ca      29416c88       move.l d1, 0x6c88(a4)
│           0x000035ce      7067           moveq 0x67, d0
│           0x000035d0      29406c7c       move.l d0, 0x6c7c(a4)
│           0x000035d4      60000144       bra.w 0x371a
│           ; CODE XREF from fcn.00003544 @ 0x35c6(x)
│           0x000035d8      204d           movea.l a5, a0
│           0x000035da      226b000c       movea.l 0xc(a3), a1
│           ; CODE XREF from fcn.00003544 @ 0x35e0(x)
│           0x000035de      12d8           move.b (a0)+, (a1)+
│           0x000035e0      66fc           bne.b 0x35de
│           0x000035e2      7003           moveq 0x3, d0
│           0x000035e4      c0af0030       and.l 0x30(a7), d0
│           0x000035e8      670e           beq.b 0x35f8
│           0x000035ea      5380           subq.l 0x1, d0
│           0x000035ec      6720           beq.b 0x360e
│           0x000035ee      5380           subq.l 0x1, d0
│           0x000035f0      6720           beq.b 0x3612
│           0x000035f2      5380           subq.l 0x1, d0
│           0x000035f4      670e           beq.b 0x3604
│           0x000035f6      601c           bra.b 0x3614
│           ; CODE XREF from fcn.00003544 @ 0x35e8(x)
│           0x000035f8      203c00000708   move.l 0x708, d0
│           0x000035fe      c0af0030       and.l 0x30(a7), d0
│           0x00003602      6706           beq.b 0x360a
│           ; CODE XREF from fcn.00003544 @ 0x35f4(x)
│           0x00003604      7016           moveq 0x16, d0
│           0x00003606      6000010e       bra.w 0x3716
│           ; CODE XREF from fcn.00003544 @ 0x3602(x)
│           0x0000360a      7e01           moveq 0x1, d7
│           0x0000360c      6006           bra.b 0x3614
│           ; CODE XREF from fcn.00003544 @ 0x35ec(x)
│           0x0000360e      7e02           moveq 0x2, d7
│           0x00003610  ~   0c407e03       cmpi.w 0x7e03, d0
│           ; CODE XREF from fcn.00003544 @ 0x35f0(x)
│           0x00003612      7e03           moveq 0x3, d7
│           ; CODE XREFS from fcn.00003544 @ 0x35f6(x), 0x360c(x)
│           0x00003614      082f00030033   btst.b 0x3, 0x33(a7)
│           0x0000361a      6704           beq.b 0x3620
│           0x0000361c      08c70005       bset.b 0x5, d7
│           ; CODE XREF from fcn.00003544 @ 0x361a(x)
│           0x00003620      082f00060032   btst.b 0x6, 0x32(a7)
│           0x00003626      6704           beq.b 0x362c
│           0x00003628      08c70006       bset.b 0x6, d7
│           ; CODE XREF from fcn.00003544 @ 0x3626(x)
│           0x0000362c      082f00050032   btst.b 0x5, 0x32(a7)
│           0x00003632      6704           beq.b 0x3638
│           0x00003634      08c70007       bset.b 0x7, d7
│           ; CODE XREF from fcn.00003544 @ 0x3632(x)
│           0x00003638      082f00000032   btst.b 0x0, 0x32(a7)
│           0x0000363e      674a           beq.b 0x368a
│           0x00003640      220d           move.l a5, d1
│           0x00003642      74fe           moveq 0xfe, d2
│           0x00003644      2c6c0988       movea.l 0x988(a4), a6
│           0x00003648      4eaeffac       jsr -0x54(a6)               ; fcn.000030f0-0x30f0
│           0x0000364c      2c00           move.l d0, d6
│           0x0000364e      673a           beq.b 0x368a
│           0x00003650      082f00020032   btst.b 0x2, 0x32(a7)
│           0x00003656      6718           beq.b 0x3670
│           0x00003658      2206           move.l d6, d1
│           0x0000365a      4eaeffa6       jsr -0x5a(a6)               ; fcn.000030f0-0x30f0
│           0x0000365e      7011           moveq 0x11, d0
│           0x00003660      29406c88       move.l d0, 0x6c88(a4)
│           0x00003664      206b000c       movea.l 0xc(a3), a0
│           0x00003668      61000596       bsr.w fcn.00003c00
│           0x0000366c      600000ac       bra.w 0x371a
│           ; CODE XREF from fcn.00003544 @ 0x3656(x)
│           0x00003670      082f00010032   btst.b 0x1, 0x32(a7)
│           0x00003676      6706           beq.b 0x367e
│           0x00003678      422f0027       clr.b 0x27(a7)
│           0x0000367c      6006           bra.b 0x3684
│           ; CODE XREF from fcn.00003544 @ 0x3676(x)
│           0x0000367e      08af00000032   bclr.b 0x0, 0x32(a7)
│           ; CODE XREF from fcn.00003544 @ 0x367c(x)
│           0x00003684      2206           move.l d6, d1
│           0x00003686      4eaeffa6       jsr -0x5a(a6)               ; fcn.000030f0-0x30f0
│           ; CODE XREFS from fcn.00003544 @ 0x363e(x), 0x364e(x)
│           0x0000368a      082f00000032   btst.b 0x0, 0x32(a7)
│           0x00003690      672e           beq.b 0x36c0
│           0x00003692      220d           move.l a5, d1
│           0x00003694      243c000003ee   move.l 0x3ee, d2
│           0x0000369a      2c6c0988       movea.l 0x988(a4), a6
│           0x0000369e      4eaeffe2       jsr -0x1e(a6)               ; fcn.000030f0-0x30f0
│           0x000036a2      2800           move.l d0, d4
│           0x000036a4      6750           beq.b 0x36f6
│           0x000036a6      202c08c4       move.l 0x8c4(a4), d0
│           0x000036aa      4680           not.l d0
│           0x000036ac      72f0           moveq 0xf0, d1
│           0x000036ae      b380           eor.l d1, d0
│           0x000036b0      4a2f0027       tst.b 0x27(a7)
│           0x000036b4      6734           beq.b 0x36ea
│           0x000036b6      220d           move.l a5, d1
│           0x000036b8      2400           move.l d0, d2
│           0x000036ba      4eaeff46       jsr -0xba(a6)               ; fcn.000030f0-0x30f0
│           0x000036be      602a           bra.b 0x36ea
│           ; CODE XREF from fcn.00003544 @ 0x3690(x)
│           0x000036c0      2c3c000003ed   move.l 0x3ed, d6
│           0x000036c6      08070001       btst.b 0x1, d7
│           0x000036ca      670e           beq.b 0x36da
│           0x000036cc      082f00040032   btst.b 0x4, 0x32(a7)
│           0x000036d2      6706           beq.b 0x36da
│           0x000036d4      2c3c000003ec   move.l 0x3ec, d6
│           ; CODE XREFS from fcn.00003544 @ 0x36ca(x), 0x36d2(x)
│           0x000036da      220d           move.l a5, d1
│           0x000036dc      2406           move.l d6, d2
│           0x000036de      2c6c0988       movea.l 0x988(a4), a6
│           0x000036e2      4eaeffe2       jsr -0x1e(a6)               ; fcn.000030f0-0x30f0
│           0x000036e6      2800           move.l d0, d4
│           0x000036e8      670c           beq.b 0x36f6
│           ; CODE XREFS from fcn.00003544 @ 0x36b4(x), 0x36be(x)
│           0x000036ea      27470004       move.l d7, 0x4(a3)
│           0x000036ee      27440008       move.l d4, 0x8(a3)
│           0x000036f2      2005           move.l d5, d0
│           0x000036f4      6026           bra.b 0x371c
│           ; CODE XREFS from fcn.00003544 @ 0x36a4(x), 0x36e8(x)
│           0x000036f6      2c6c0988       movea.l 0x988(a4), a6
│           0x000036fa      4eaeff7c       jsr -0x84(a6)               ; fcn.000030f0-0x30f0
│           0x000036fe      29406c7c       move.l d0, 0x6c7c(a4)
│           0x00003702      202b000c       move.l 0xc(a3), d0
│           0x00003706      6706           beq.b 0x370e
│           0x00003708      2040           movea.l d0, a0
│           0x0000370a      610004f4       bsr.w fcn.00003c00
│           ; CODE XREF from fcn.00003544 @ 0x3706(x)
│           0x0000370e      202c6c7c       move.l 0x6c7c(a4), d0
│           0x00003712      610013d0       bsr.w fcn.00004ae4
│           ; CODE XREFS from fcn.00003544 @ 0x358e(x), 0x3606(x)
│           0x00003716      29406c88       move.l d0, 0x6c88(a4)
│           ; CODE XREFS from fcn.00003544 @ 0x35d4(x), 0x366c(x)
│           0x0000371a      70ff           moveq 0xff, d0
│           ; CODE XREF from fcn.00003544 @ 0x36f4(x)
│           0x0000371c      4cdf6cf4       movem.l (a7)+, d2/d4-d7/a2-a3/a5-a6
│           0x00003720      584f           addq.w 0x4, a7
└           0x00003722      4e75           rts
            ; XREFS: CALL 0x00000526  CALL 0x00000586  CALL 0x000005b2  
            ; XREFS: CALL 0x000005ce  CALL 0x00000620  CALL 0x00000674  
            ; XREFS: CALL 0x00000b62  CALL 0x00000ce8  CALL 0x000020cc  
            ; XREFS: CALL 0x00002358  CALL 0x0000237a  CALL 0x000023fa  
            ; XREFS: CALL 0x0000241c  CALL 0x0000249c  CALL 0x000024be  
            ; XREFS: CALL 0x000029e4  
┌ 50: fcn.00003724 ();
│           0x00003724      4a80           tst.l d0
│           0x00003726      6a00001e       bpl.w 0x3746
│           0x0000372a      4480           neg.l d0
│           0x0000372c      4a81           tst.l d1
│           0x0000372e      6a00000c       bpl.w 0x373c
│           0x00003732      4481           neg.l d1
│           0x00003734      61000020       bsr.w fcn.00003756
│           0x00003738      4481           neg.l d1
│           0x0000373a      4e75           rts
│           ; CODE XREF from fcn.00003724 @ 0x372e(x)
│           0x0000373c      61000018       bsr.w fcn.00003756
│           0x00003740      4480           neg.l d0
│           0x00003742      4481           neg.l d1
│           0x00003744      4e75           rts
│           ; CODE XREF from fcn.00003724 @ 0x3726(x)
│           0x00003746      4a81           tst.l d1
│           0x00003748      6a00000c       bpl.w fcn.00003756
│           0x0000374c      4481           neg.l d1
│           0x0000374e      61000006       bsr.w fcn.00003756
│           0x00003752      4480           neg.l d0
└           0x00003754      4e75           rts
            ; XREFS: CALL 0x000025b0  CALL 0x000025d2  CALL 0x00002cac  
            ; XREFS: CALL 0x00002d54  CALL 0x00003734  CALL 0x0000373c  
            ; XREFS: CODE 0x00003748  CALL 0x0000374e  
┌ 144: fcn.00003756 ();
│           0x00003756      2f02           move.l d2, -(a7)
│           0x00003758      4841           swap d1
│           0x0000375a      3401           move.w d1, d2
│           0x0000375c      66000022       bne.w 0x3780
│           0x00003760      4840           swap d0
│           0x00003762      4841           swap d1
│           0x00003764      4842           swap d2
│           0x00003766      3400           move.w d0, d2
│           0x00003768      67000006       beq.w 0x3770
│           0x0000376c      84c1           divu.w d1, d2
│           0x0000376e      3002           move.w d2, d0
│           ; CODE XREF from fcn.00003756 @ 0x3768(x)
│           0x00003770      4840           swap d0
│           0x00003772      3400           move.w d0, d2
│           0x00003774      84c1           divu.w d1, d2
│           0x00003776      3002           move.w d2, d0
│           0x00003778      4842           swap d2
│           0x0000377a      3202           move.w d2, d1
│           0x0000377c      241f           move.l (a7)+, d2
│           0x0000377e      4e75           rts
│           ; CODE XREF from fcn.00003756 @ 0x375c(x)
│           0x00003780      2f03           move.l d3, -(a7)
│           0x00003782      7610           moveq 0x10, d3
│           0x00003784      0c410080       cmpi.w 0x80, d1
│           0x00003788      64000006       bcc.w 0x3790
│           0x0000378c      e199           rol.l 0x8, d1
│           0x0000378e      5143           subq.w 0x8, d3
│           ; CODE XREF from fcn.00003756 @ 0x3788(x)
│           0x00003790      0c410800       cmpi.w 0x800, d1
│           0x00003794      64000006       bcc.w 0x379c
│           0x00003798      e999           rol.l 0x4, d1
│           0x0000379a      5943           subq.w 0x4, d3
│           ; CODE XREF from fcn.00003756 @ 0x3794(x)
│           0x0000379c      0c412000       cmpi.w 0x2000, d1
│           0x000037a0      64000006       bcc.w 0x37a8
│           0x000037a4      e599           rol.l 0x2, d1
│           0x000037a6      5543           subq.w 0x2, d3
│           ; CODE XREF from fcn.00003756 @ 0x37a0(x)
│           0x000037a8      4a41           tst.w d1
│           0x000037aa      6b000006       bmi.w 0x37b2
│           0x000037ae      e399           rol.l 0x1, d1
│           0x000037b0      5343           subq.w 0x1, d3
│           ; CODE XREF from fcn.00003756 @ 0x37aa(x)
│           0x000037b2      3400           move.w d0, d2
│           0x000037b4      e6a8           lsr.l d3, d0
│           0x000037b6      4842           swap d2
│           0x000037b8      4242           clr.w d2
│           0x000037ba      e6aa           lsr.l d3, d2
│           0x000037bc      4843           swap d3
│           0x000037be      80c1           divu.w d1, d0
│           0x000037c0      3600           move.w d0, d3
│           0x000037c2      3002           move.w d2, d0
│           0x000037c4      3403           move.w d3, d2
│           0x000037c6      4841           swap d1
│           0x000037c8      c4c1           mulu.w d1, d2
│           0x000037ca      9082           sub.l d2, d0
│           0x000037cc      64000006       bcc.w 0x37d4
│           0x000037d0      5343           subq.w 0x1, d3
│           0x000037d2      d081           add.l d1, d0
│           ; CODE XREF from fcn.00003756 @ 0x37cc(x)
│           0x000037d4      7200           moveq 0x0, d1
│           0x000037d6      3203           move.w d3, d1
│           0x000037d8      4843           swap d3
│           0x000037da      e7b8           rol.l d3, d0
│           0x000037dc      4840           swap d0
│           0x000037de      c141           exg.l d0, d1
│           0x000037e0      261f           move.l (a7)+, d3
│           0x000037e2      241f           move.l (a7)+, d2
└           0x000037e4      4e75           rts
            0x000037e6      0000202f       ori.b 0x2f, d0
            0x000037ea  ~   00042f00       ori.b 0x0, d4
            ; CALL XREFS from fcn.00003b3c @ 0x3a10(x), 0x3a30(x), 0x3a66(x)
            ; CODE XREF from fcn.00003f14 @ 0x3f32(x)
┌ 10: fcn.000037ec ();
│           0x000037ec      2f00           move.l d0, -(a7)
│           0x000037ee      6100c9f6       bsr.w fcn.000001e6
│           0x000037f2      584f           addq.w 0x4, a7
└           0x000037f4      4e75           rts
            0x000037f6      4e71           nop
            ; CALL XREF from entry0 @ 0x1de(x)
┌ 366: fcn.000037f8 ();
│           0x000037f8      48e70016       movem.l a3/a5-a6, -(a7)
│           0x000037fc      2a6f0010       movea.l 0x10(a7), a5
│           0x00003800      42ac6cd0       clr.l 0x6cd0(a4)
│           0x00003804  ~   0c40528d       cmpi.w 0x528d, d0
│           ; CODE XREFS from fcn.000037f8 @ 0x380e(x), 0x3814(x), 0x381a(x)
│           0x00003806      528d           addq.l 0x1, a5
│           ; CODE XREF from fcn.000037f8 @ 0x386c(x)
│           0x00003808      1015           move.b (a5), d0
│           0x0000380a      7220           moveq 0x20, d1
│           0x0000380c      b001           cmp.b d1, d0
│           0x0000380e      67f6           beq.b 0x3806
│           0x00003810      7209           moveq 0x9, d1
│           0x00003812      b001           cmp.b d1, d0
│           0x00003814      67f0           beq.b 0x3806
│           0x00003816      720a           moveq 0xa, d1
│           0x00003818      b001           cmp.b d1, d0
│           0x0000381a      67ea           beq.b 0x3806
│           0x0000381c      1015           move.b (a5), d0
│           0x0000381e      674e           beq.b 0x386e
│           0x00003820      7222           moveq 0x22, d1
│           0x00003822      b001           cmp.b d1, d0
│           0x00003824      6628           bne.b 0x384e
│           0x00003826      600e           bra.b 0x3836
│           ; CODE XREF from fcn.000037f8 @ 0x3842(x)
│           0x00003828      1015           move.b (a5), d0
│           0x0000382a      722a           moveq 0x2a, d1
│           0x0000382c      b001           cmp.b d1, d0
│           0x0000382e      6606           bne.b 0x3836
│           0x00003830      528d           addq.l 0x1, a5
│           0x00003832      4a15           tst.b (a5)
│           0x00003834      670e           beq.b 0x3844
│           ; CODE XREFS from fcn.000037f8 @ 0x3826(x), 0x382e(x)
│           0x00003836      528d           addq.l 0x1, a5
│           0x00003838      1015           move.b (a5), d0
│           0x0000383a      7222           moveq 0x22, d1
│           0x0000383c      b001           cmp.b d1, d0
│           0x0000383e      6704           beq.b 0x3844
│           0x00003840      4a00           tst.b d0
│           0x00003842      66e4           bne.b 0x3828
│           ; CODE XREFS from fcn.000037f8 @ 0x3834(x), 0x383e(x)
│           0x00003844      4a15           tst.b (a5)
│           0x00003846      6720           beq.b 0x3868
│           0x00003848      528d           addq.l 0x1, a5
│           0x0000384a      601c           bra.b 0x3868
│           ; CODE XREF from fcn.000037f8 @ 0x3862(x)
│           0x0000384c      528d           addq.l 0x1, a5
│           ; CODE XREF from fcn.000037f8 @ 0x3824(x)
│           0x0000384e      1015           move.b (a5), d0
│           0x00003850      6712           beq.b 0x3864
│           0x00003852      7220           moveq 0x20, d1
│           0x00003854      b001           cmp.b d1, d0
│           0x00003856      670c           beq.b 0x3864
│           0x00003858      7209           moveq 0x9, d1
│           0x0000385a      b001           cmp.b d1, d0
│           0x0000385c      6706           beq.b 0x3864
│           0x0000385e      720a           moveq 0xa, d1
│           0x00003860      b001           cmp.b d1, d0
│           0x00003862      66e8           bne.b 0x384c
│           ; CODE XREFS from fcn.000037f8 @ 0x3850(x), 0x3856(x), 0x385c(x)
│           0x00003864      4a15           tst.b (a5)
│           0x00003866      6706           beq.b 0x386e
│           ; CODE XREFS from fcn.000037f8 @ 0x3846(x), 0x384a(x)
│           0x00003868      52ac6cd0       addq.l 0x1, 0x6cd0(a4)
│           0x0000386c      609a           bra.b 0x3808
│           ; CODE XREFS from fcn.000037f8 @ 0x381e(x), 0x3866(x)
│           0x0000386e      202c6cd0       move.l 0x6cd0(a4), d0
│           0x00003872      670000c8       beq.w 0x393c
│           0x00003876      5280           addq.l 0x1, d0
│           0x00003878      2c780004       movea.l 0x4, a6
│           0x0000387c      e580           asl.l 0x2, d0
│           0x0000387e      7201           moveq 0x1, d1
│           0x00003880      4841           swap d1
│           0x00003882      4eaeff3a       jsr -0xc6(a6)               ; fcn.000030f0-0x30f0
│           0x00003886      29406cd8       move.l d0, 0x6cd8(a4)
│           0x0000388a      6606           bne.b 0x3892
│           0x0000388c      7014           moveq 0x14, d0
│           0x0000388e      61000684       bsr.w fcn.00003f14
│           ; CODE XREF from fcn.000037f8 @ 0x388a(x)
│           0x00003892      226f0010       movea.l 0x10(a7), a1
│           0x00003896      206c6cd8       movea.l 0x6cd8(a4), a0
│           0x0000389a  ~   0c405289       cmpi.w 0x5289, d0
│           ; CODE XREFS from fcn.000037f8 @ 0x38a4(x), 0x38aa(x), 0x38b0(x)
│           0x0000389c      5289           addq.l 0x1, a1
│           ; CODE XREFS from fcn.000037f8 @ 0x3914(x), 0x3938(x)
│           0x0000389e      1011           move.b (a1), d0
│           0x000038a0      7220           moveq 0x20, d1
│           0x000038a2      b001           cmp.b d1, d0
│           0x000038a4      67f6           beq.b 0x389c
│           0x000038a6      7209           moveq 0x9, d1
│           0x000038a8      b001           cmp.b d1, d0
│           0x000038aa      67f0           beq.b 0x389c
│           0x000038ac      720a           moveq 0xa, d1
│           0x000038ae      b001           cmp.b d1, d0
│           0x000038b0      67ea           beq.b 0x389c
│           0x000038b2      1011           move.b (a1), d0
│           0x000038b4      67000086       beq.w 0x393c
│           0x000038b8      7222           moveq 0x22, d1
│           0x000038ba      b001           cmp.b d1, d0
│           0x000038bc      6658           bne.b 0x3916
│           0x000038be      5289           addq.l 0x1, a1
│           0x000038c0      2649           movea.l a1, a3
│           0x000038c2      208b           move.l a3, (a0)
│           0x000038c4      5888           addq.l 0x4, a0
│           0x000038c6      6038           bra.b 0x3900
│           ; CODE XREF from fcn.000037f8 @ 0x390a(x)
│           0x000038c8      1011           move.b (a1), d0
│           0x000038ca      722a           moveq 0x2a, d1
│           0x000038cc      b001           cmp.b d1, d0
│           0x000038ce      662e           bne.b 0x38fe
│           0x000038d0      5289           addq.l 0x1, a1
│           0x000038d2      7000           moveq 0x0, d0
│           0x000038d4      1011           move.b (a1), d0
│           0x000038d6      4a80           tst.l d0
│           0x000038d8      670e           beq.b 0x38e8
│           0x000038da      7245           moveq 0x45, d1
│           0x000038dc      9081           sub.l d1, d0
│           0x000038de      670c           beq.b 0x38ec
│           0x000038e0      7209           moveq 0x9, d1
│           0x000038e2      9081           sub.l d1, d0
│           0x000038e4      670c           beq.b 0x38f2
│           0x000038e6      6010           bra.b 0x38f8
│           ; CODE XREF from fcn.000037f8 @ 0x38d8(x)
│           0x000038e8      4213           clr.b (a3)
│           0x000038ea      6050           bra.b 0x393c
│           ; CODE XREF from fcn.000037f8 @ 0x38de(x)
│           0x000038ec      16fc001b       move.b 0x1b, (a3)+
│           0x000038f0      6008           bra.b 0x38fa
│           ; CODE XREF from fcn.000037f8 @ 0x38e4(x)
│           0x000038f2      16fc000a       move.b 0xa, (a3)+
│           0x000038f6  ~   0c4016d1       cmpi.w 0x16d1, d0
│           ; CODE XREF from fcn.000037f8 @ 0x38e6(x)
│           0x000038f8      16d1           move.b (a1), (a3)+
│           ; CODE XREF from fcn.000037f8 @ 0x38f0(x)
│           0x000038fa      5289           addq.l 0x1, a1
│           0x000038fc  ~   0c4016d9       cmpi.w 0x16d9, d0
│           ; CODE XREF from fcn.000037f8 @ 0x38ce(x)
│           0x000038fe      16d9           move.b (a1)+, (a3)+
│           ; CODE XREF from fcn.000037f8 @ 0x38c6(x)
│           0x00003900      1011           move.b (a1), d0
│           0x00003902      7222           moveq 0x22, d1
│           0x00003904      b001           cmp.b d1, d0
│           0x00003906      6704           beq.b 0x390c
│           0x00003908      4a00           tst.b d0
│           0x0000390a      66bc           bne.b 0x38c8
│           ; CODE XREF from fcn.000037f8 @ 0x3906(x)
│           0x0000390c      4a11           tst.b (a1)
│           0x0000390e      6702           beq.b 0x3912
│           0x00003910      5289           addq.l 0x1, a1
│           ; CODE XREF from fcn.000037f8 @ 0x390e(x)
│           0x00003912      4213           clr.b (a3)
│           0x00003914      6088           bra.b 0x389e
│           ; CODE XREF from fcn.000037f8 @ 0x38bc(x)
│           0x00003916      20c9           move.l a1, (a0)+
│           0x00003918  ~   0c405289       cmpi.w 0x5289, d0
│           ; CODE XREF from fcn.000037f8 @ 0x3930(x)
│           0x0000391a      5289           addq.l 0x1, a1
│           0x0000391c      1011           move.b (a1), d0
│           0x0000391e      6712           beq.b 0x3932
│           0x00003920      7220           moveq 0x20, d1
│           0x00003922      b001           cmp.b d1, d0
│           0x00003924      670c           beq.b 0x3932
│           0x00003926      7209           moveq 0x9, d1
│           0x00003928      b001           cmp.b d1, d0
│           0x0000392a      6706           beq.b 0x3932
│           0x0000392c      720a           moveq 0xa, d1
│           0x0000392e      b001           cmp.b d1, d0
│           0x00003930      66e8           bne.b 0x391a
│           ; CODE XREFS from fcn.000037f8 @ 0x391e(x), 0x3924(x), 0x392a(x)
│           0x00003932      4a11           tst.b (a1)
│           0x00003934      6706           beq.b 0x393c
│           0x00003936      4219           clr.b (a1)+
│           0x00003938      6000ff64       bra.w 0x389e
│           ; CODE XREFS from fcn.000037f8 @ 0x3872(x), 0x38b4(x), 0x38ea(x), 0x3934(x)
│           0x0000393c      202c6cd0       move.l 0x6cd0(a4), d0
│           0x00003940      6606           bne.b 0x3948
│           0x00003942      206c6c84       movea.l 0x6c84(a4), a0
│           0x00003946      6004           bra.b 0x394c
│           ; CODE XREF from fcn.000037f8 @ 0x3940(x)
│           0x00003948      206c6cd8       movea.l 0x6cd8(a4), a0
│           ; CODE XREF from fcn.000037f8 @ 0x3946(x)
│           0x0000394c      29486cd4       move.l a0, 0x6cd4(a4)
│           0x00003950      6100c932       bsr.w fcn.00000284
│           0x00003954      4cdf6800       movem.l (a7)+, a3/a5-a6
└           0x00003958      600005ba       bra.w fcn.00003f14
            0x0000395c      2f0e           move.l a6, -(a7)
            0x0000395e      202c6cd0       move.l 0x6cd0(a4), d0
            0x00003962      6716           beq.b 0x397a
            0x00003964      4aac6cd8       tst.l 0x6cd8(a4)
            0x00003968      6710           beq.b 0x397a
            0x0000396a      5280           addq.l 0x1, d0
            0x0000396c      226c6cd8       movea.l 0x6cd8(a4), a1
            0x00003970      e580           asl.l 0x2, d0
            0x00003972      2c780004       movea.l 0x4.w, a6
            0x00003976      4eaeff2e       jsr -0xd2(a6)               ; fcn.000030f0-0x30f0
            ; CODE XREFS from fcn.000037f8 @ +0x16a(x), +0x170(x)
            0x0000397a      2c5f           movea.l (a7)+, a6
            0x0000397c      4e75           rts
            0x0000397e      4e71           nop
            0x00003980      202f0004       move.l 0x4(a7), d0
│           ; CODE XREF from fcn.00003b3c @ 0x3b40(x)
│           0x00003984      9efc0054       suba.w 0x54, a7
│           0x00003988      48e73736       movem.l d2-d3/d5-d7/a2-a3/a5-a6, -(a7)
│           0x0000398c      206c6c74       movea.l 0x6c74(a4), a0
│           0x00003990      2e00           move.l d0, d7
│           0x00003992      7c00           moveq 0x0, d6
│           0x00003994      1c28ffff       move.b -0x1(a0), d6
│           0x00003998      704f           moveq 0x4f, d0
│           0x0000399a      bc80           cmp.l d0, d6
│           0x0000399c      6f02           ble.b 0x39a0
│           0x0000399e      2c00           move.l d0, d6
│           ; CODE XREF from fcn.00003b3c @ 0x399c(x)
│           0x000039a0      2006           move.l d6, d0
│           0x000039a2      43ef0027       lea.l 0x27(a7), a1
│           0x000039a6  ~   0c4012d8       cmpi.w 0x12d8, d0
│           ; CODE XREF from fcn.00003b3c @ 0x39ac(x)
│           0x000039a8      12d8           move.b (a0)+, (a1)+
│           0x000039aa      5380           subq.l 0x1, d0
│           0x000039ac      64fa           bcc.b 0x39a8
│           0x000039ae      42376827       clr.b 0x27(a7, d6.l)
│           0x000039b2      93c9           suba.l a1, a1
│           0x000039b4      2c780004       movea.l 0x4, a6
│           0x000039b8      4eaefeda       jsr -0x126(a6)              ; fcn.000030f0-0x30f0
│           0x000039bc      2040           movea.l d0, a0
│           0x000039be      4aa800ac       tst.l 0xac(a0)
│           0x000039c2      2440           movea.l d0, a2
│           0x000039c4      674e           beq.b 0x3a14
│           0x000039c6      202a00ac       move.l 0xac(a2), d0
│           0x000039ca      e580           asl.l 0x2, d0
│           0x000039cc      2040           movea.l d0, a0
│           0x000039ce      2a280038       move.l 0x38(a0), d5
│           0x000039d2      6604           bne.b 0x39d8
│           0x000039d4      2a2a00a0       move.l 0xa0(a2), d5
│           ; CODE XREF from fcn.00003b3c @ 0x39d2(x)
│           0x000039d8      4a85           tst.l d5
│           0x000039da      6738           beq.b 0x3a14
│           0x000039dc      41fa00d0       lea.l 0x3aae(pc), a0
│           0x000039e0      2205           move.l d5, d1
│           0x000039e2      2408           move.l a0, d2
│           0x000039e4      760b           moveq 0xb, d3
│           0x000039e6      2c6c0988       movea.l 0x988(a4), a6
│           0x000039ea      4eaeffd0       jsr -0x30(a6)               ; fcn.000030f0-0x30f0
│           0x000039ee      2606           move.l d6, d3
│           0x000039f0      5283           addq.l 0x1, d3
│           0x000039f2      1fbc000a6827   move.b 0xa, 0x27(a7, d6.l)
│           0x000039f8      41ef0027       lea.l 0x27(a7), a0
│           0x000039fc      2205           move.l d5, d1
│           0x000039fe      2408           move.l a0, d2
│           0x00003a00      2c6c0988       movea.l 0x988(a4), a6
│           0x00003a04      4eaeffd0       jsr -0x30(a6)               ; fcn.000030f0-0x30f0
│           0x00003a08      7001           moveq 0x1, d0
│           0x00003a0a      2940072c       move.l d0, 0x72c(a4)
│           0x00003a0e      7014           moveq 0x14, d0
│           0x00003a10      6100fdda       bsr.w fcn.000037ec
│           ; CODE XREFS from fcn.00003b3c @ 0x39c4(x), 0x39da(x)
│           0x00003a14      43fa00a4       lea.l 0x3aba(pc), a1
│           0x00003a18      7000           moveq 0x0, d0
│           0x00003a1a      2c780004       movea.l 0x4, a6
│           0x00003a1e      4eaefdd8       jsr -0x228(a6)              ; fcn.000030f0-0x30f0
│           0x00003a22      2a40           movea.l d0, a5
│           0x00003a24      4a80           tst.l d0
│           0x00003a26      660c           bne.b 0x3a34
│           0x00003a28      7001           moveq 0x1, d0
│           0x00003a2a      2940072c       move.l d0, 0x72c(a4)
│           0x00003a2e      7014           moveq 0x14, d0
│           0x00003a30      6100fdba       bsr.w fcn.000037ec
│           ; CODE XREF from fcn.00003b3c @ 0x3a26(x)
│           0x00003a34      41ef0027       lea.l 0x27(a7), a0
│           0x00003a38      294808e8       move.l a0, 0x8e8(a4)
│           0x00003a3c      7000           moveq 0x0, d0
│           0x00003a3e      2200           move.l d0, d1
│           0x00003a40      747d           moveq 0x7d, d2
│           0x00003a42      91c8           suba.l a0, a0
│           0x00003a44      d482           add.l d2, d2
│           0x00003a46      763c           moveq 0x3c, d3
│           0x00003a48      43ec08dc       lea.l 0x8dc(a4), a1
│           0x00003a4c      45ec08f0       lea.l 0x8f0(a4), a2
│           0x00003a50      47ec0904       lea.l 0x904(a4), a3
│           0x00003a54      2c4d           movea.l a5, a6
│           0x00003a56      4eaefea4       jsr -0x15c(a6)              ; fcn.000030f0-0x30f0
│           0x00003a5a      5340           subq.w 0x1, d0
│           0x00003a5c      670c           beq.b 0x3a6a
│           0x00003a5e      7001           moveq 0x1, d0
│           0x00003a60      2940072c       move.l d0, 0x72c(a4)
│           0x00003a64      7014           moveq 0x14, d0
│           0x00003a66      6100fd84       bsr.w fcn.000037ec
│           ; CODE XREF from fcn.00003b3c @ 0x3a5c(x)
│           0x00003a6a      e587           asl.l 0x2, d7
│           0x00003a6c      41faff16       lea.l 0x3984(pc), a0
│           0x00003a70      43ec071c       lea.l 0x71c(a4), a1
│           0x00003a74      23887800       move.l a0, (a1, d7.l)
│           0x00003a78      4cdf6cec       movem.l (a7)+, d2-d3/d5-d7/a2-a3/a5-a6
│           0x00003a7c      defc0054       adda.w 0x54, a7
│           0x00003a80      4e75           rts
            0x00003a82      2a2a2055       move.l 0x2055(a2), d5
            0x00003a86      7365           invalid
            0x00003a88      7220           moveq 0x20, d1
            0x00003a8a      4162           invalid
            0x00003a8c      6f72           ble.b 0x3b00                ; fcn.00003ad0+0x30
            0x00003a8e      7420           moveq 0x20, d2
            0x00003a90      5265           addq.w 0x1, -(a5)
            0x00003a92      7175           invalid
            0x00003a94      6573           bcs.b 0x3b09                ; fcn.00003ad0+0x39
            0x00003a96      7465           moveq 0x65, d2
            0x00003a98      6420           bcc.b 0x3aba
            0x00003a9a      2a2a0000       move.l 0x0(a2), d5
            0x00003a9e      434f           invalid
            0x00003aa0      4e54494e       link.w a4, 0x494e
            0x00003aa4      5545           subq.w 0x2, d5
            0x00003aa6      00004142       ori.b 0x42, d0
            0x00003aaa      4f52           invalid
            0x00003aac      5400           addq.b 0x2, d0
            0x00003aae      2a2a2a20       move.l 0x2a20(a2), d5
            0x00003ab2      427265616b3a   clr.w ([0x6b3a, a2])
            0x00003ab8      2000           move.l d0, d0
            ; CODE XREF from fcn.000037f8 @ +0x2a0(x)
            0x00003aba      696e           bvs.b 0x3b2a                ; fcn.00003b14+0x16
            0x00003abc      7475           moveq 0x75, d2
            0x00003abe      6974           bvs.b 0x3b34                ; fcn.00003b14+0x20
            0x00003ac0      696f           bvs.b 0x3b31                ; fcn.00003b14+0x1d
            0x00003ac2      6e2e           bgt.b 0x3af2                ; fcn.00003ad0+0x22
            0x00003ac4      6c69           bge.b 0x3b2f                ; fcn.00003b14+0x1b
            0x00003ac6      6272           bhi.b 0x3b3a                ; fcn.00003b14+0x26
            0x00003ac8      6172           bsr.b fcn.00003b3c
            0x00003aca      7900           invalid
            0x00003acc      202f0004       move.l 0x4(a7), d0
            ; CALL XREF from fcn.00003244 @ 0x325a(x)
            ; CALL XREF from fcn.0000334c @ 0x3364(x)
            ; CALL XREF from fcn.0000344a @ 0x3462(x)
            ; CALL XREF from fcn.000034d8 @ 0x34e4(x)
┌ 68: fcn.00003ad0 ();
│           0x00003ad0      2f0d           move.l a5, -(a7)
│           0x00003ad2      2200           move.l d0, d1
│           0x00003ad4      42ac6c7c       clr.l 0x6c7c(a4)
│           0x00003ad8      4a81           tst.l d1
│           0x00003ada      6b06           bmi.b 0x3ae2
│           0x00003adc      b2ac08b8       cmp.l 0x8b8(a4), d1
│           0x00003ae0      6d0a           blt.b 0x3aec
│           ; CODE XREF from fcn.00003ad0 @ 0x3ada(x)
│           0x00003ae2      7009           moveq 0x9, d0
│           0x00003ae4      29406c88       move.l d0, 0x6c88(a4)
│           0x00003ae8      7000           moveq 0x0, d0
│           0x00003aea      6022           bra.b 0x3b0e
│           ; CODE XREF from fcn.00003ad0 @ 0x3ae0(x)
│           0x00003aec      2a6c08bc       movea.l 0x8bc(a4), a5
│           0x00003af0      6004           bra.b 0x3af6
│           ; CODE XREF from fcn.000037f8 @ +0x2ca(x)
│           ; CODE XREF from fcn.00003ad0 @ 0x3afc(x)
│           0x00003af2      5381           subq.l 0x1, d1
│           0x00003af4      2a55           movea.l (a5), a5
│           ; CODE XREF from fcn.00003ad0 @ 0x3af0(x)
│           0x00003af6      4a81           tst.l d1
│           0x00003af8      6f04           ble.b 0x3afe
│           0x00003afa      200d           move.l a5, d0
│           0x00003afc      66f4           bne.b 0x3af2
│           ; CODE XREF from fcn.00003ad0 @ 0x3af8(x)
│           0x00003afe      200d           move.l a5, d0
│           ; CODE XREF from fcn.000037f8 @ +0x294(x)
│           0x00003b00      660a           bne.b 0x3b0c
│           0x00003b02      7005           moveq 0x5, d0
│           0x00003b04      29406c88       move.l d0, 0x6c88(a4)
│           0x00003b08      7000           moveq 0x0, d0
│           0x00003b0a  ~   0c40200d       cmpi.w 0x200d, d0
│           ; CODE XREF from fcn.00003ad0 @ 0x3b00(x)
│           0x00003b0c      200d           move.l a5, d0
│           ; CODE XREF from fcn.00003ad0 @ 0x3aea(x)
│           0x00003b0e      2a5f           movea.l (a7)+, a5
└           0x00003b10      4e75           rts
            0x00003b12      4e71           nop
            ; CALL XREF from fcn.00003244 @ 0x3254(x)
            ; CALL XREF from fcn.0000334c @ 0x335e(x)
            ; CALL XREF from fcn.0000344a @ 0x345c(x)
            ; CALL XREF from fcn.000034d8 @ 0x34de(x)
            ; CALL XREF from fcn.00003544 @ 0x355e(x)
┌ 60: fcn.00003b14 ();
│           0x00003b14      2f0e           move.l a6, -(a7)
│           0x00003b16      7000           moveq 0x0, d0
│           0x00003b18      7260           moveq 0x60, d1
│           0x00003b1a      ef89           lsl.l 0x7, d1
│           0x00003b1c      2c780004       movea.l 0x4, a6
│           0x00003b20      4eaefece       jsr -0x132(a6)              ; fcn.000030f0-0x30f0
│           0x00003b24      028000003000   andi.l 0x3000, d0
│           ; CODE XREF from fcn.000037f8 @ +0x2c2(x)
│           0x00003b2a      6728           beq.b 0x3b54
│           0x00003b2c      307c0001       movea.w 0x1, a0
│           0x00003b30      226c072c       movea.l 0x72c(a4), a1
│           ; CODE XREF from fcn.000037f8 @ +0x2c6(x)
│           0x00003b34      b1c9           cmpa.l a1, a0
│           0x00003b36      671c           beq.b 0x3b54
│           0x00003b38      2009           move.l a1, d0
│           ; CODE XREF from fcn.000037f8 @ +0x2ce(x)
│           0x00003b3a      6608           bne.b 0x3b44
            ; CALL XREF from fcn.000037f8 @ +0x2d0(x)
┌ 264: fcn.00003b3c ();
│           0x00003b3c      7004           moveq 0x4, d0
│           0x00003b3e      2c5f           movea.l (a7)+, a6
│           0x00003b40      6000fe42       bra.w 0x3984
│           ; CODE XREF from fcn.00003b14 @ 0x3b3a(x)
│           0x00003b44      42ac072c       clr.l 0x72c(a4)
│           0x00003b48      7004           moveq 0x4, d0
│           0x00003b4a      2f00           move.l d0, -(a7)
│           0x00003b4c      2200           move.l d0, d1
│           0x00003b4e      c141           exg.l d0, d1
│           0x00003b50      4e91           jsr (a1)                    ; fcn.0000000a
│           0x00003b52      584f           addq.w 0x4, a7
│           ; CODE XREFS from fcn.00003b14 @ 0x3b2a(x), 0x3b36(x)
│           0x00003b54      2c5f           movea.l (a7)+, a6
└           0x00003b56      4e75           rts
            0x00003b58      206f0004       movea.l 0x4(a7), a0
            0x00003b5c      226f0008       movea.l 0x8(a7), a1
            ; XREFS: CALL 0x00000ec8  CALL 0x00000f32  CALL 0x00000f70  
            ; XREFS: CALL 0x00000f98  CALL 0x0000100c  CALL 0x00001058  
            ; XREFS: CALL 0x000010aa  
┌ 50: fcn.00003b60 ();
│           0x00003b60      48e70030       movem.l a2-a3, -(a7)
│           0x00003b64      4a10           tst.b (a0)
│           0x00003b66      671a           beq.b 0x3b82
│           0x00003b68      600a           bra.b 0x3b74
│           ; CODE XREF from fcn.00003b60 @ 0x3b7e(x)
│           0x00003b6a      4a12           tst.b (a2)
│           0x00003b6c      6714           beq.b 0x3b82
│           0x00003b6e      5288           addq.l 0x1, a0
│           0x00003b70      4a10           tst.b (a0)
│           0x00003b72      670e           beq.b 0x3b82
│           ; CODE XREF from fcn.00003b60 @ 0x3b68(x)
│           0x00003b74      2448           movea.l a0, a2
│           0x00003b76      2649           movea.l a1, a3
│           ; CODE XREF from fcn.00003b60 @ 0x3b80(x)
│           0x00003b78      4a13           tst.b (a3)
│           0x00003b7a      670e           beq.b 0x3b8a
│           0x00003b7c      b70a           cmpm.b (a2)+, (a3)+
│           0x00003b7e      66ea           bne.b 0x3b6a
│           0x00003b80      60f6           bra.b 0x3b78
│           ; CODE XREFS from fcn.00003b60 @ 0x3b66(x), 0x3b6c(x), 0x3b72(x)
│           0x00003b82      7000           moveq 0x0, d0
│           0x00003b84      4cdf0c00       movem.l (a7)+, a2-a3
│           0x00003b88      4e75           rts
│           ; CODE XREF from fcn.00003b60 @ 0x3b7a(x)
│           0x00003b8a      2008           move.l a0, d0
│           0x00003b8c      4cdf0c00       movem.l (a7)+, a2-a3
└           0x00003b90      4e75           rts
            0x00003b92      0000206f       ori.b 0x6f, d0
            0x00003b96      0004202f       ori.b 0x2f, d4
            0x00003b9a      0008           invalid
            0x00003b9c      222f000c       move.l 0xc(a7), d1
            ; CALL XREFS from fcn.00003244 @ 0x32a4(x), 0x32fe(x)
            ; CALL XREFS from fcn.0000334c @ 0x33f2(x), 0x3420(x)
            ; CODE XREF from fcn.00003ba0 @ 0x3ba6(x)
┌ 24: fcn.00003ba0 ();
│           0x00003ba0      5381           subq.l 0x1, d1
│           0x00003ba2      6b04           bmi.b 0x3ba8
│           0x00003ba4      b018           cmp.b (a0)+, d0
│           0x00003ba6      66f8           bne.b fcn.00003ba0
│           ; CODE XREF from fcn.00003ba0 @ 0x3ba2(x)
│           0x00003ba8      5348           subq.w 0x1, a0
│           0x00003baa      5281           addq.l 0x1, d1
│           0x00003bac      4a81           tst.l d1
│           0x00003bae      66000004       bne.w 0x3bb4
│           0x00003bb2      91c8           suba.l a0, a0
│           ; CODE XREF from fcn.00003ba0 @ 0x3bae(x)
│           0x00003bb4      2008           move.l a0, d0
└           0x00003bb6      4e75           rts
            0x00003bb8      226f0008       movea.l 0x8(a7), a1
            0x00003bbc      206f0004       movea.l 0x4(a7), a0
            ; CALL XREFS from fcn.000009e6 @ 0xb20(x), 0xbf0(x), 0xca8(x)
┌ 14: fcn.00003bc0 ();
│           0x00003bc0      2008           move.l a0, d0
│           ; CODE XREF from fcn.00003bc0 @ 0x3bc4(x)
│           0x00003bc2      4a18           tst.b (a0)+
│           0x00003bc4      66fc           bne.b 0x3bc2
│           0x00003bc6      5388           subq.l 0x1, a0
│           ; CODE XREF from fcn.00003bc0 @ 0x3bca(x)
│           0x00003bc8      10d9           move.b (a1)+, (a0)+
│           0x00003bca      66fc           bne.b 0x3bc8
└           0x00003bcc      4e75           rts
            0x00003bce      0000226f       ori.b 0x6f, d0
            0x00003bd2      0008           invalid
            0x00003bd4      206f0004       movea.l 0x4(a7), a0
            0x00003bd8      202f000c       move.l 0xc(a7), d0
            ; CALL XREF from fcn.000045d8 @ +0x286(x)
┌ 32: fcn.00003bdc ();
│           0x00003bdc      2208           move.l a0, d1
│           0x00003bde      4a80           tst.l d0
│           0x00003be0      6f16           ble.b 0x3bf8
│           0x00003be2      b1c9           cmpa.l a1, a0
│           0x00003be4      650c           bcs.b 0x3bf2
│           0x00003be6      d3c0           adda.l d0, a1
│           0x00003be8      d1c0           adda.l d0, a0
│           ; CODE XREF from fcn.00003bdc @ 0x3bee(x)
│           0x00003bea      1121           move.b -(a1), -(a0)
│           0x00003bec      5380           subq.l 0x1, d0
│           0x00003bee      66fa           bne.b 0x3bea
│           0x00003bf0      6006           bra.b 0x3bf8
│           ; CODE XREFS from fcn.00003bdc @ 0x3be4(x), 0x3bf6(x)
│           0x00003bf2      10d9           move.b (a1)+, (a0)+
│           0x00003bf4      5380           subq.l 0x1, d0
│           0x00003bf6      66fa           bne.b 0x3bf2
│           ; CODE XREFS from fcn.00003bdc @ 0x3be0(x), 0x3bf0(x)
│           0x00003bf8      2001           move.l d1, d0
└           0x00003bfa      4e75           rts
            0x00003bfc      206f0004       movea.l 0x4(a7), a0
            ; CALL XREF from fcn.00002d7c @ +0x18a(x)
            ; CALL XREF from fcn.000034d8 @ 0x3534(x)
            ; CALL XREFS from fcn.00003544 @ 0x3668(x), 0x370a(x)
            ; CALL XREF from fcn.000043c0 @ 0x43f8(x)
┌ 360: fcn.00003c00 ();
│           0x00003c00      2008           move.l a0, d0
│           0x00003c02      6602           bne.b 0x3c06
│           0x00003c04      4e75           rts
│           ; CODE XREF from fcn.00003c00 @ 0x3c02(x)
│           0x00003c06      5980           subq.l 0x4, d0
│           0x00003c08      48e73c32       movem.l d2-d5/a2-a3/a6, -(a7)
│           0x00003c0c      222c6c94       move.l 0x6c94(a4), d1
│           0x00003c10      660e           bne.b 0x3c20
│           ; CODE XREFS from fcn.00003c00 @ 0x3c3c(x), 0x3c4a(x), 0x3c56(x), 0x3c66(x)
│           0x00003c12      297c000000..   move.l 0x16, 0x6c88(a4)
│           0x00003c1a      4cdf4c3c       movem.l (a7)+, d2-d5/a2-a3/a6
│           0x00003c1e      4e75           rts
│           ; CODE XREFS from fcn.00003c00 @ 0x3c10(x), 0x3c3e(x)
│           0x00003c20      2241           movea.l d1, a1
│           0x00003c22      b081           cmp.l d1, d0
│           0x00003c24      6f12           ble.b 0x3c38
│           0x00003c26      2401           move.l d1, d2
│           0x00003c28      d4a90004       add.l 0x4(a1), d2
│           0x00003c2c      068200000014   addi.l 0x14, d2
│           0x00003c32      b082           cmp.l d2, d0
│           0x00003c34      6c02           bge.b 0x3c38
│           0x00003c36      6008           bra.b 0x3c40
│           ; CODE XREFS from fcn.00003c00 @ 0x3c24(x), 0x3c34(x)
│           0x00003c38      22290000       move.l 0x0(a1), d1
│           0x00003c3c      67d4           beq.b 0x3c12
│           0x00003c3e      60e0           bra.b 0x3c20
│           ; CODE XREF from fcn.00003c00 @ 0x3c36(x)
│           0x00003c40      2601           move.l d1, d3
│           0x00003c42      068300000010   addi.l 0x10, d3
│           ; CODE XREF from fcn.00003c00 @ 0x3c5e(x)
│           0x00003c48      b083           cmp.l d3, d0
│           0x00003c4a      6dc6           blt.b 0x3c12
│           0x00003c4c      6712           beq.b 0x3c60
│           0x00003c4e      2443           movea.l d3, a2
│           0x00003c50      4282           clr.l d2
│           0x00003c52      342a0002       move.w 0x2(a2), d2
│           0x00003c56      6bba           bmi.b 0x3c12
│           0x00003c58      e58a           lsl.l 0x2, d2
│           0x00003c5a      d682           add.l d2, d3
│           0x00003c5c      5883           addq.l 0x4, d3
│           0x00003c5e      60e8           bra.b 0x3c48
│           ; CODE XREF from fcn.00003c00 @ 0x3c4c(x)
│           0x00003c60      2440           movea.l d0, a2
│           0x00003c62      342a0000       move.w 0x0(a2), d2
│           0x00003c66      6aaa           bpl.b 0x3c12
│           0x00003c68      08aa00070000   bclr.b 0x7, 0x0(a2)
│           0x00003c6e      4283           clr.l d3
│           0x00003c70      362a0002       move.w 0x2(a2), d3
│           0x00003c74      02437fff       andi.w 0x7fff, d3
│           0x00003c78      e58b           lsl.l 0x2, d3
│           0x00003c7a      4a6a0002       tst.w 0x2(a2)
│           0x00003c7e      6b40           bmi.b 0x3cc0
│           0x00003c80      47f23804       lea.l 0x4(a2, d3.l), a3
│           0x00003c84      4a6b0000       tst.w 0x0(a3)
│           0x00003c88      6b36           bmi.b 0x3cc0
│           0x00003c8a      4284           clr.l d4
│           0x00003c8c      382b0002       move.w 0x2(a3), d4
│           0x00003c90      02447fff       andi.w 0x7fff, d4
│           0x00003c94      e58c           lsl.l 0x2, d4
│           0x00003c96      d883           add.l d3, d4
│           0x00003c98      5884           addq.l 0x4, d4
│           0x00003c9a      e48c           lsr.l 0x2, d4
│           0x00003c9c      5883           addq.l 0x4, d3
│           0x00003c9e      4a6b0002       tst.w 0x2(a3)
│           0x00003ca2      6a04           bpl.b 0x3ca8
│           0x00003ca4      00448000       ori.w 0x8000, d4
│           ; CODE XREF from fcn.00003c00 @ 0x3ca2(x)
│           0x00003ca8      35440002       move.w d4, 0x2(a2)
│           0x00003cac      6b12           bmi.b 0x3cc0
│           0x00003cae      2a04           move.l d4, d5
│           0x00003cb0      e58c           lsl.l 0x2, d4
│           0x00003cb2      34324804       move.w 0x4(a2, d4.l), d2
│           0x00003cb6      02428000       andi.w 0x8000, d2
│           0x00003cba      8a42           or.w d2, d5
│           0x00003cbc      35854804       move.w d5, 0x4(a2, d4.l)
│           ; CODE XREFS from fcn.00003c00 @ 0x3c7e(x), 0x3c88(x), 0x3cac(x)
│           0x00003cc0      4284           clr.l d4
│           0x00003cc2      382a0000       move.w 0x0(a2), d4
│           0x00003cc6      674c           beq.b 0x3d14
│           0x00003cc8      e58c           lsl.l 0x2, d4
│           0x00003cca      4484           neg.l d4
│           0x00003ccc      47f248fc       lea.l -0x4(a2, d4.l), a3
│           0x00003cd0      4a6b0000       tst.w 0x0(a3)
│           0x00003cd4      6b3e           bmi.b 0x3d14
│           0x00003cd6      4284           clr.l d4
│           0x00003cd8      382b0002       move.w 0x2(a3), d4
│           0x00003cdc      e58c           lsl.l 0x2, d4
│           0x00003cde      4285           clr.l d5
│           0x00003ce0      3a2a0002       move.w 0x2(a2), d5
│           0x00003ce4      02457fff       andi.w 0x7fff, d5
│           0x00003ce8      e58d           lsl.l 0x2, d5
│           0x00003cea      d885           add.l d5, d4
│           0x00003cec      5884           addq.l 0x4, d4
│           0x00003cee      5883           addq.l 0x4, d3
│           0x00003cf0      e48c           lsr.l 0x2, d4
│           0x00003cf2      4a6a0002       tst.w 0x2(a2)
│           0x00003cf6      6a04           bpl.b 0x3cfc
│           0x00003cf8      00448000       ori.w 0x8000, d4
│           ; CODE XREF from fcn.00003c00 @ 0x3cf6(x)
│           0x00003cfc      37440002       move.w d4, 0x2(a3)
│           0x00003d00      6b12           bmi.b 0x3d14
│           0x00003d02      2a04           move.l d4, d5
│           0x00003d04      e58c           lsl.l 0x2, d4
│           0x00003d06      34334804       move.w 0x4(a3, d4.l), d2
│           0x00003d0a      02428000       andi.w 0x8000, d2
│           0x00003d0e      8a42           or.w d2, d5
│           0x00003d10      37854804       move.w d5, 0x4(a3, d4.l)
│           ; CODE XREFS from fcn.00003c00 @ 0x3cc6(x), 0x3cd4(x), 0x3d00(x)
│           0x00003d14      d7a90008       add.l d3, 0x8(a1)
│           0x00003d18      26290004       move.l 0x4(a1), d3
│           0x00003d1c      b6ac0718       cmp.l 0x718(a4), d3
│           0x00003d20      6e0c           bgt.b 0x3d2e
│           0x00003d22      b6a90008       cmp.l 0x8(a1), d3
│           0x00003d26      663a           bne.b 0x3d62
│           0x00003d28      4aa90000       tst.l 0x0(a1)
│           0x00003d2c      6734           beq.b 0x3d62
│           ; CODE XREF from fcn.00003c00 @ 0x3d20(x)
│           0x00003d2e      202c6c94       move.l 0x6c94(a4), d0
│           0x00003d32      2040           movea.l d0, a0
│           0x00003d34      b280           cmp.l d0, d1
│           0x00003d36      660c           bne.b 0x3d44
│           0x00003d38      296900006c94   move.l 0x0(a1), 0x6c94(a4)
│           0x00003d3e      6010           bra.b 0x3d50
│           ; CODE XREF from fcn.00003c00 @ 0x3d48(x)
│           0x00003d40      20680000       movea.l 0x0(a0), a0
│           ; CODE XREF from fcn.00003c00 @ 0x3d36(x)
│           0x00003d44      b2a80000       cmp.l 0x0(a0), d1
│           0x00003d48      66f6           bne.b 0x3d40
│           0x00003d4a      216900000000   move.l 0x0(a1), 0x0(a0)
│           ; CODE XREF from fcn.00003c00 @ 0x3d3e(x)
│           0x00003d50      20290004       move.l 0x4(a1), d0
│           0x00003d54      068000000014   addi.l 0x14, d0
│           0x00003d5a      2c780004       movea.l 0x4, a6
│           0x00003d5e      4eaeff2e       jsr -0xd2(a6)               ; fcn.000030f0-0x30f0
│           ; CODE XREFS from fcn.00003c00 @ 0x3d26(x), 0x3d2c(x)
│           0x00003d62      4cdf4c3c       movem.l (a7)+, d2-d5/a2-a3/a6
└           0x00003d66      4e75           rts
            0x00003d68      202f0004       move.l 0x4(a7), d0
            ; CALL XREF from fcn.00002d7c @ +0x138(x)
            ; CALL XREF from fcn.00002ff0 @ 0x3000(x)
            ; CALL XREFS from fcn.00003544 @ 0x3582(x), 0x35be(x)
            ; CALL XREF from fcn.00004560 @ 0x4586(x)
┌ 368: fcn.00003d6c ();
│           0x00003d6c      4a80           tst.l d0
│           0x00003d6e      660c           bne.b 0x3d7c
│           0x00003d70      297c000000..   move.l 0x16, 0x6c88(a4)
│           0x00003d78      7000           moveq 0x0, d0
│           0x00003d7a      4e75           rts
│           ; CODE XREF from fcn.00003d6c @ 0x3d6e(x)
│           0x00003d7c      48e73e32       movem.l d2-d6/a2-a3/a6, -(a7)
│           0x00003d80      5680           addq.l 0x3, d0
│           0x00003d82      0280fffffffc   andi.l 0xfffffffc, d0
│           0x00003d88      0c800001fffc   cmpi.l 0x1fffc, d0
│           0x00003d8e      6e0000b8       bgt.w 0x3e48
│           0x00003d92      b0ac0718       cmp.l 0x718(a4), d0
│           0x00003d96      6e0000b0       bgt.w 0x3e48
│           0x00003d9a      262c6c94       move.l 0x6c94(a4), d3
│           0x00003d9e      670000a8       beq.w 0x3e48
│           0x00003da2      2243           movea.l d3, a1
│           ; CODE XREF from fcn.00003d6c @ 0x3de4(x)
│           0x00003da4      b0a90008       cmp.l 0x8(a1), d0
│           0x00003da8      6e32           bgt.b 0x3ddc
│           0x00003daa      222c6c8c       move.l 0x6c8c(a4), d1
│           0x00003dae      b2a9000c       cmp.l 0xc(a1), d1
│           0x00003db2      6628           bne.b 0x3ddc
│           0x00003db4      45e90010       lea.l 0x10(a1), a2
│           ; CODE XREF from fcn.00003d6c @ 0x3dda(x)
│           0x00003db8      4a52           tst.w (a2)
│           0x00003dba      6b10           bmi.b 0x3dcc
│           0x00003dbc      4284           clr.l d4
│           0x00003dbe      382a0002       move.w 0x2(a2), d4
│           0x00003dc2      02447fff       andi.w 0x7fff, d4
│           0x00003dc6      e58c           lsl.l 0x2, d4
│           0x00003dc8      b084           cmp.l d4, d0
│           0x00003dca      6f1a           ble.b 0x3de6
│           ; CODE XREF from fcn.00003d6c @ 0x3dba(x)
│           0x00003dcc      4284           clr.l d4
│           0x00003dce      382a0002       move.w 0x2(a2), d4
│           0x00003dd2      6b08           bmi.b 0x3ddc
│           0x00003dd4      e58c           lsl.l 0x2, d4
│           0x00003dd6      45f24804       lea.l 0x4(a2, d4.l), a2
│           0x00003dda      60dc           bra.b 0x3db8
│           ; CODE XREFS from fcn.00003d6c @ 0x3da8(x), 0x3db2(x), 0x3dd2(x)
│           0x00003ddc      26290000       move.l 0x0(a1), d3
│           0x00003de0      6766           beq.b 0x3e48
│           0x00003de2      2243           movea.l d3, a1
│           0x00003de4      60be           bra.b 0x3da4
│           ; CODE XREF from fcn.00003d6c @ 0x3dca(x)
│           0x00003de6      08ea00070000   bset.b 0x7, 0x0(a2)
│           0x00003dec      47f20804       lea.l 0x4(a2, d0.l), a3
│           0x00003df0      4285           clr.l d5
│           0x00003df2      b084           cmp.l d4, d0
│           0x00003df4      673c           beq.b 0x3e32
│           0x00003df6      2c04           move.l d4, d6
│           0x00003df8      9c80           sub.l d0, d6
│           0x00003dfa      5986           subq.l 0x4, d6
│           0x00003dfc      6604           bne.b 0x3e02
│           0x00003dfe      2004           move.l d4, d0
│           0x00003e00      6030           bra.b 0x3e32
│           ; CODE XREF from fcn.00003d6c @ 0x3dfc(x)
│           0x00003e02      e48e           lsr.l 0x2, d6
│           0x00003e04      4a6a0002       tst.w 0x2(a2)
│           0x00003e08      6a04           bpl.b 0x3e0e
│           0x00003e0a      00468000       ori.w 0x8000, d6
│           ; CODE XREF from fcn.00003d6c @ 0x3e08(x)
│           0x00003e0e      2a00           move.l d0, d5
│           0x00003e10      e48d           lsr.l 0x2, d5
│           0x00003e12      37460002       move.w d6, 0x2(a3)
│           0x00003e16      37450000       move.w d5, 0x0(a3)
│           0x00003e1a      35450002       move.w d5, 0x2(a2)
│           0x00003e1e      7a04           moveq 0x4, d5
│           0x00003e20      4a46           tst.w d6
│           0x00003e22      6b0e           bmi.b 0x3e32
│           0x00003e24      34324804       move.w 0x4(a2, d4.l), d2
│           0x00003e28      02428000       andi.w 0x8000, d2
│           0x00003e2c      8c42           or.w d2, d6
│           0x00003e2e      35864804       move.w d6, 0x4(a2, d4.l)
│           ; CODE XREFS from fcn.00003d6c @ 0x3df4(x), 0x3e00(x), 0x3e22(x)
│           0x00003e32      26290008       move.l 0x8(a1), d3
│           0x00003e36      9680           sub.l d0, d3
│           0x00003e38      9685           sub.l d5, d3
│           0x00003e3a      23430008       move.l d3, 0x8(a1)
│           0x00003e3e      200a           move.l a2, d0
│           0x00003e40      5880           addq.l 0x4, d0
│           ; CODE XREF from fcn.00003d6c @ 0x3e74(x)
│           0x00003e42      4cdf4c7c       movem.l (a7)+, d2-d6/a2-a3/a6
│           0x00003e46      4e75           rts
│           ; CODE XREFS from fcn.00003d6c @ 0x3d8e(x), 0x3d96(x), 0x3d9e(x), 0x3de0(x)
│           0x00003e48      2a00           move.l d0, d5
│           0x00003e4a      b0ac0718       cmp.l 0x718(a4), d0
│           0x00003e4e      6a04           bpl.b 0x3e54
│           0x00003e50      202c0718       move.l 0x718(a4), d0
│           ; CODE XREF from fcn.00003d6c @ 0x3e4e(x)
│           0x00003e54      2800           move.l d0, d4
│           0x00003e56      068000000014   addi.l 0x14, d0
│           0x00003e5c      222c6c8c       move.l 0x6c8c(a4), d1
│           0x00003e60      2c780004       movea.l 0x4, a6
│           0x00003e64      4eaeff3a       jsr -0xc6(a6)               ; fcn.000030f0-0x30f0
│           0x00003e68      4a80           tst.l d0
│           0x00003e6a      660a           bne.b 0x3e76
│           0x00003e6c      297c000000..   move.l 0xc, 0x6c88(a4)
│           0x00003e74      60cc           bra.b 0x3e42
│           ; CODE XREF from fcn.00003d6c @ 0x3e6a(x)
│           0x00003e76      2240           movea.l d0, a1
│           0x00003e78      45e90010       lea.l 0x10(a1), a2
│           0x00003e7c      236c6c940000   move.l 0x6c94(a4), 0x0(a1)
│           0x00003e82      29496c94       move.l a1, 0x6c94(a4)
│           0x00003e86      23440004       move.l d4, 0x4(a1)
│           0x00003e8a      236c6c8c000c   move.l 0x6c8c(a4), 0xc(a1)
│           0x00003e90      2604           move.l d4, d3
│           0x00003e92      9685           sub.l d5, d3
│           0x00003e94      6728           beq.b 0x3ebe
│           0x00003e96      5983           subq.l 0x4, d3
│           0x00003e98      6724           beq.b 0x3ebe
│           0x00003e9a      23430008       move.l d3, 0x8(a1)
│           0x00003e9e      47f25804       lea.l 0x4(a2, d5.l), a3
│           0x00003ea2      357c80000000   move.w 0x8000, 0x0(a2)
│           0x00003ea8      e48d           lsr.l 0x2, d5
│           0x00003eaa      35450002       move.w d5, 0x2(a2)
│           0x00003eae      37450000       move.w d5, 0x0(a3)
│           0x00003eb2      e48b           lsr.l 0x2, d3
│           0x00003eb4      00438000       ori.w 0x8000, d3
│           0x00003eb8      37430002       move.w d3, 0x2(a3)
│           0x00003ebc      6014           bra.b 0x3ed2
│           ; CODE XREFS from fcn.00003d6c @ 0x3e94(x), 0x3e98(x)
│           0x00003ebe      42a90008       clr.l 0x8(a1)
│           0x00003ec2      357c80000000   move.w 0x8000, 0x0(a2)
│           0x00003ec8      e48c           lsr.l 0x2, d4
│           0x00003eca      00448000       ori.w 0x8000, d4
│           0x00003ece      35440002       move.w d4, 0x2(a2)
│           ; CODE XREF from fcn.00003d6c @ 0x3ebc(x)
│           0x00003ed2      200a           move.l a2, d0
│           0x00003ed4      5880           addq.l 0x4, d0
│           0x00003ed6      4cdf4c7c       movem.l (a7)+, d2-d6/a2-a3/a6
└           0x00003eda      4e75           rts
            0x00003edc      206f0004       movea.l 0x4(a7), a0
            ; XREFS: CALL 0x000002b8  CALL 0x000006cc  CALL 0x00000702  
            ; XREFS: CALL 0x0000070e  CALL 0x00000760  CALL 0x0000087e  
            ; XREFS: CALL 0x00000e60  CALL 0x00000e90  CALL 0x00000eb6  
            ; XREFS: CALL 0x000020b8  
┌ 50: fcn.00003ee0 ();
│           0x00003ee0      514f           subq.w 0x8, a7
│           0x00003ee2      2008           move.l a0, d0
│           0x00003ee4      6726           beq.b 0x3f0c
│           0x00003ee6      2e88           move.l a0, (a7)
│           0x00003ee8  ~   0c405297       cmpi.w 0x5297, d0
│           ; CODE XREF from fcn.00003ee0 @ 0x3efc(x)
│           0x00003eea      5297           addq.l 0x1, (a7)
│           0x00003eec      2057           movea.l (a7), a0
│           0x00003eee      7000           moveq 0x0, d0
│           0x00003ef0      1010           move.b (a0), d0
│           0x00003ef2      41ec0741       lea.l 0x741(a4), a0
│           0x00003ef6      083000030800   btst.b 0x3, (a0, d0.l)
│           0x00003efc      66ec           bne.b 0x3eea
│           0x00003efe      2057           movea.l (a7), a0
│           0x00003f00      43ef0004       lea.l 0x4(a7), a1
│           0x00003f04      6100ee76       bsr.w fcn.00002d7c
│           0x00003f08      202f0004       move.l 0x4(a7), d0
│           ; CODE XREF from fcn.00003ee0 @ 0x3ee4(x)
│           0x00003f0c      504f           addq.w 0x8, a7
└           0x00003f0e      4e75           rts
            0x00003f10      202f0004       move.l 0x4(a7), d0
            ; XREFS: CALL 0x000002ac  CALL 0x0000121c  CALL 0x00001256  
            ; XREFS: CALL 0x00001280  CALL 0x0000388e  CODE 0x00003958  
┌ 34: fcn.00003f14 ();
│           0x00003f14      48e70104       movem.l d7/a5, -(a7)
│           0x00003f18      2e00           move.l d0, d7
│           0x00003f1a      2a6c0918       movea.l 0x918(a4), a5
│           0x00003f1e      6008           bra.b 0x3f28
│           ; CODE XREF from fcn.00003f14 @ 0x3f2a(x)
│           0x00003f20      206d0004       movea.l 0x4(a5), a0
│           0x00003f24      4e90           jsr (a0)                    ; fcn.00000009
│           0x00003f26      2a55           movea.l (a5), a5
│           ; CODE XREF from fcn.00003f14 @ 0x3f1e(x)
│           0x00003f28      200d           move.l a5, d0
│           0x00003f2a      66f4           bne.b 0x3f20
│           0x00003f2c      2007           move.l d7, d0
│           0x00003f2e      4cdf2080       movem.l (a7)+, d7/a5
└           0x00003f32      6000f8b8       bra.w fcn.000037ec
            0x00003f36      4e71           nop
            0x00003f38      202f0004       move.l 0x4(a7), d0
            0x00003f3c      206f0008       movea.l 0x8(a7), a0
            0x00003f40      43d0           lea.l (a0), a1
            0x00003f42      5299           addq.l 0x1, (a1)+
            0x00003f44      2051           movea.l (a1), a0
            0x00003f46      5299           addq.l 0x1, (a1)+
            0x00003f48      1080           move.b d0, (a0)
            0x00003f4a      4e75           rts
            ; XREFS(32)
┌ 46: fcn.00003f4c ();
│           0x00003f4c      514f           subq.w 0x8, a7
│           0x00003f4e      206f000c       movea.l 0xc(a7), a0
│           0x00003f52      4297           clr.l (a7)
│           0x00003f54      2f480004       move.l a0, 0x4(a7)
│           0x00003f58      486f0014       pea.l 0x14(a7)
│           0x00003f5c      2f2f0014       move.l 0x14(a7), -(a7)
│           0x00003f60      41faffde       lea.l 0x3f40(pc), a0
│           0x00003f64      43ef0008       lea.l 0x8(a7), a1
│           0x00003f68      61000aea       bsr.w fcn.00004a54
│           0x00003f6c      206f000c       movea.l 0xc(a7), a0
│           0x00003f70      504f           addq.w 0x8, a7
│           0x00003f72      4210           clr.b (a0)
│           0x00003f74      2017           move.l (a7), d0
│           0x00003f76      504f           addq.w 0x8, a7
└           0x00003f78      4e75           rts
            0x00003f7a      4e71           nop
            0x00003f7c      202f0004       move.l 0x4(a7), d0
            0x00003f80      206f0008       movea.l 0x8(a7), a0
            ; CALL XREF from fcn.00002b38 @ 0x2b52(x)
            ; CALL XREF from fcn.00002b68 @ 0x2bee(x)
┌ 380: fcn.00003f84 ();
│           0x00003f84      594f           subq.w 0x4, a7
│           0x00003f86      48e70304       movem.l d6-d7/a5, -(a7)
│           0x00003f8a      2e00           move.l d0, d7
│           0x00003f8c      7c00           moveq 0x0, d6
│           0x00003f8e      1f47000f       move.b d7, 0xf(a7)
│           0x00003f92      7241           moveq 0x41, d1
│           0x00003f94      d281           add.l d1, d1
│           0x00003f96      2a48           movea.l a0, a5
│           0x00003f98      c2ad0018       and.l 0x18(a5), d1
│           0x00003f9c      660c           bne.b 0x3faa
│           0x00003f9e      08ed0005001b   bset.b 0x5, 0x1b(a5)
│           0x00003fa4      70ff           moveq 0xff, d0
│           0x00003fa6      60000150       bra.w 0x40f8
│           ; CODE XREF from fcn.00003f84 @ 0x3f9c(x)
│           0x00003faa      7033           moveq 0x33, d0
│           0x00003fac      c0ad0018       and.l 0x18(a5), d0
│           0x00003fb0      5580           subq.l 0x2, d0
│           0x00003fb2      6760           beq.b 0x4014
│           0x00003fb4      704c           moveq 0x4c, d0
│           0x00003fb6      4600           not.b d0
│           0x00003fb8      c0ad0018       and.l 0x18(a5), d0
│           0x00003fbc      7240           moveq 0x40, d1
│           0x00003fbe      d281           add.l d1, d1
│           0x00003fc0      b081           cmp.l d1, d0
│           0x00003fc2      6614           bne.b 0x3fd8
│           0x00003fc4      08ed0001001b   bset.b 0x1, 0x1b(a5)
│           0x00003fca      42ad000c       clr.l 0xc(a5)
│           0x00003fce      206d0010       movea.l 0x10(a5), a0
│           0x00003fd2      2b480004       move.l a0, 0x4(a5)
│           0x00003fd6      603c           bra.b 0x4014
│           ; CODE XREF from fcn.00003f84 @ 0x3fc2(x)
│           0x00003fd8      082d0005001b   btst.b 0x5, 0x1b(a5)
│           0x00003fde      6706           beq.b 0x3fe6
│           0x00003fe0      70ff           moveq 0xff, d0
│           0x00003fe2      60000114       bra.w 0x40f8
│           ; CODE XREF from fcn.00003f84 @ 0x3fde(x)
│           0x00003fe6      706e           moveq 0x6e, d0
│           0x00003fe8      4600           not.b d0
│           0x00003fea      c0ad0018       and.l 0x18(a5), d0
│           0x00003fee      726e           moveq 0x6e, d1
│           0x00003ff0      4601           not.b d1
│           0x00003ff2      b081           cmp.l d1, d0
│           0x00003ff4      6614           bne.b 0x400a
│           0x00003ff6      08ed0001001b   bset.b 0x1, 0x1b(a5)
│           0x00003ffc      42ad000c       clr.l 0xc(a5)
│           0x00004000      206d0010       movea.l 0x10(a5), a0
│           0x00004004      2b480004       move.l a0, 0x4(a5)
│           0x00004008      600a           bra.b 0x4014
│           ; CODE XREF from fcn.00003f84 @ 0x3ff4(x)
│           0x0000400a      7000           moveq 0x0, d0
│           0x0000400c      2b40000c       move.l d0, 0xc(a5)
│           0x00004010      600000e6       bra.w 0x40f8
│           ; CODE XREFS from fcn.00003f84 @ 0x3fb2(x), 0x3fd6(x), 0x4008(x)
│           0x00004014      202d000c       move.l 0xc(a5), d0
│           0x00004018      b0ad0014       cmp.l 0x14(a5), d0
│           0x0000401c      6c32           bge.b 0x4050
│           0x0000401e      206d0004       movea.l 0x4(a5), a0
│           0x00004022      52ad0004       addq.l 0x1, 0x4(a5)
│           0x00004026      2007           move.l d7, d0
│           0x00004028      1080           move.b d0, (a0)
│           0x0000402a      52ad000c       addq.l 0x1, 0xc(a5)
│           0x0000402e      082d0006001b   btst.b 0x6, 0x1b(a5)
│           0x00004034      670e           beq.b 0x4044
│           0x00004036      720a           moveq 0xa, d1
│           0x00004038      be81           cmp.l d1, d7
│           0x0000403a      6608           bne.b 0x4044
│           0x0000403c      204d           movea.l a5, a0
│           0x0000403e      610002a8       bsr.w fcn.000042e8
│           0x00004042      2c00           move.l d0, d6
│           ; CODE XREFS from fcn.00003f84 @ 0x4034(x), 0x403a(x)
│           0x00004044      4a86           tst.l d6
│           0x00004046      670000aa       beq.w 0x40f2
│           0x0000404a      2006           move.l d6, d0
│           0x0000404c      600000aa       bra.w 0x40f8
│           ; CODE XREF from fcn.00003f84 @ 0x401c(x)
│           0x00004050      082d0002001b   btst.b 0x2, 0x1b(a5)
│           0x00004056      672e           beq.b 0x4086
│           0x00004058      42ad000c       clr.l 0xc(a5)
│           0x0000405c      202d001c       move.l 0x1c(a5), d0
│           0x00004060      7201           moveq 0x1, d1
│           0x00004062      41ef000f       lea.l 0xf(a7), a0
│           0x00004066      6100f1dc       bsr.w fcn.00003244
│           0x0000406a      2c00           move.l d0, d6
│           0x0000406c      5280           addq.l 0x1, d0
│           0x0000406e      6608           bne.b 0x4078
│           0x00004070      08ed0005001b   bset.b 0x5, 0x1b(a5)
│           0x00004076      6072           bra.b 0x40ea
│           ; CODE XREF from fcn.00003f84 @ 0x406e(x)
│           0x00004078      2006           move.l d6, d0
│           0x0000407a      5380           subq.l 0x1, d0
│           0x0000407c      676c           beq.b 0x40ea
│           0x0000407e      08ed0004001b   bset.b 0x4, 0x1b(a5)
│           0x00004084      6064           bra.b 0x40ea
│           ; CODE XREF from fcn.00003f84 @ 0x4056(x)
│           0x00004086      4aad0014       tst.l 0x14(a5)
│           0x0000408a      6620           bne.b 0x40ac
│           0x0000408c      204d           movea.l a5, a0
│           0x0000408e      6100ef60       bsr.w fcn.00002ff0
│           0x00004092      4a80           tst.l d0
│           0x00004094      670a           beq.b 0x40a0
│           0x00004096      08ed0005001b   bset.b 0x5, 0x1b(a5)
│           0x0000409c      70ff           moveq 0xff, d0
│           0x0000409e      6058           bra.b 0x40f8
│           ; CODE XREF from fcn.00003f84 @ 0x4094(x)
│           0x000040a0      7000           moveq 0x0, d0
│           0x000040a2      2b40000c       move.l d0, 0xc(a5)
│           0x000040a6      2b6d00100004   move.l 0x10(a5), 0x4(a5)
│           ; CODE XREF from fcn.00003f84 @ 0x408a(x)
│           0x000040ac      202d000c       move.l 0xc(a5), d0
│           0x000040b0      b0ad0014       cmp.l 0x14(a5), d0
│           0x000040b4      6d08           blt.b 0x40be
│           0x000040b6      204d           movea.l a5, a0
│           0x000040b8      6100022e       bsr.w fcn.000042e8
│           0x000040bc      2c00           move.l d0, d6
│           ; CODE XREF from fcn.00003f84 @ 0x40b4(x)
│           0x000040be      08ed0001001b   bset.b 0x1, 0x1b(a5)
│           0x000040c4      206d0004       movea.l 0x4(a5), a0
│           0x000040c8      52ad0004       addq.l 0x1, 0x4(a5)
│           0x000040cc      2007           move.l d7, d0
│           0x000040ce      1080           move.b d0, (a0)
│           0x000040d0      52ad000c       addq.l 0x1, 0xc(a5)
│           0x000040d4      082d0006001b   btst.b 0x6, 0x1b(a5)
│           0x000040da      670e           beq.b 0x40ea
│           0x000040dc      720a           moveq 0xa, d1
│           0x000040de      be81           cmp.l d1, d7
│           0x000040e0      6608           bne.b 0x40ea
│           0x000040e2      204d           movea.l a5, a0
│           0x000040e4      61000202       bsr.w fcn.000042e8
│           0x000040e8      2c00           move.l d0, d6
│           ; CODE XREFS from fcn.00003f84 @ 0x4076(x), 0x407c(x), 0x4084(x), 0x40da(x), 0x40e0(x)
│           0x000040ea      4a86           tst.l d6
│           0x000040ec      6704           beq.b 0x40f2
│           0x000040ee      2006           move.l d6, d0
│           0x000040f0      6006           bra.b 0x40f8
│           ; CODE XREFS from fcn.00003f84 @ 0x4046(x), 0x40ec(x)
│           0x000040f2      7200           moveq 0x0, d1
│           0x000040f4      1207           move.b d7, d1
│           0x000040f6      2001           move.l d1, d0
│           ; XREFS: CODE 0x00003fa6  CODE 0x00003fe2  CODE 0x00004010  
│           ; XREFS: CODE 0x0000404c  CODE 0x0000409e  CODE 0x000040f0  
│           0x000040f8      4cdf20c0       movem.l (a7)+, d6-d7/a5
│           0x000040fc      584f           addq.w 0x4, a7
└           0x000040fe      4e75           rts
            0x00004100      206f0004       movea.l 0x4(a7), a0
            0x00004104      202f0008       move.l 0x8(a7), d0
            0x00004108      226f000c       movea.l 0xc(a7), a1
            ; CALL XREFS from fcn.00000ee0 @ 0xf18(x), 0xfc8(x), 0x1048(x), 0x109a(x)
┌ 108: fcn.0000410c ();
│           0x0000410c      594f           subq.w 0x4, a7
│           0x0000410e      48e70334       movem.l d6-d7/a2-a3/a5, -(a7)
│           0x00004112      2e00           move.l d0, d7
│           0x00004114      5387           subq.l 0x1, d7
│           0x00004116      2a48           movea.l a0, a5
│           0x00004118      244d           movea.l a5, a2
│           0x0000411a      2649           movea.l a1, a3
│           0x0000411c      6042           bra.b 0x4160
│           ; CODE XREF from fcn.0000410c @ 0x4162(x)
│           0x0000411e      082b0000001b   btst.b 0x0, 0x1b(a3)
│           0x00004124      6724           beq.b 0x414a
│           0x00004126      53ab0008       subq.l 0x1, 0x8(a3)
│           0x0000412a      6d16           blt.b 0x4142
│           0x0000412c      082b0005001e   btst.b 0x5, 0x1e(a3)
│           0x00004132      660e           bne.b 0x4142
│           0x00004134      206b0004       movea.l 0x4(a3), a0
│           0x00004138      52ab0004       addq.l 0x1, 0x4(a3)
│           0x0000413c      7000           moveq 0x0, d0
│           0x0000413e      1010           move.b (a0), d0
│           0x00004140      600e           bra.b 0x4150
│           ; CODE XREFS from fcn.0000410c @ 0x412a(x), 0x4132(x)
│           0x00004142      204b           movea.l a3, a0
│           0x00004144      61000036       bsr.w fcn.0000417c
│           0x00004148      6006           bra.b 0x4150
│           ; CODE XREF from fcn.0000410c @ 0x4124(x)
│           0x0000414a      204b           movea.l a3, a0
│           0x0000414c      6100002e       bsr.w fcn.0000417c
│           ; CODE XREFS from fcn.0000410c @ 0x4140(x), 0x4148(x)
│           0x00004150      2c00           move.l d0, d6
│           0x00004152      5280           addq.l 0x1, d0
│           0x00004154      670e           beq.b 0x4164
│           0x00004156      5387           subq.l 0x1, d7
│           0x00004158      14c6           move.b d6, (a2)+
│           0x0000415a      720a           moveq 0xa, d1
│           0x0000415c      bc81           cmp.l d1, d6
│           0x0000415e      6704           beq.b 0x4164
│           ; CODE XREF from fcn.0000410c @ 0x411c(x)
│           0x00004160      4a87           tst.l d7
│           0x00004162      6eba           bgt.b 0x411e
│           ; CODE XREFS from fcn.0000410c @ 0x4154(x), 0x415e(x)
│           0x00004164      b5cd           cmpa.l a5, a2
│           0x00004166      6604           bne.b 0x416c
│           0x00004168      7000           moveq 0x0, d0
│           0x0000416a      6004           bra.b 0x4170
│           ; CODE XREF from fcn.0000410c @ 0x4166(x)
│           0x0000416c      4212           clr.b (a2)
│           0x0000416e      200d           move.l a5, d0
│           ; CODE XREF from fcn.0000410c @ 0x416a(x)
│           0x00004170      4cdf2cc0       movem.l (a7)+, d6-d7/a2-a3/a5
│           0x00004174      584f           addq.w 0x4, a7
└           0x00004176      4e75           rts
            0x00004178      206f0004       movea.l 0x4(a7), a0
            ; CALL XREFS from fcn.0000410c @ 0x4144(x), 0x414c(x)
┌ 360: fcn.0000417c ();
│           0x0000417c      594f           subq.w 0x4, a7
│           0x0000417e      48e70104       movem.l d7/a5, -(a7)
│           0x00004182      2a48           movea.l a0, a5
│           0x00004184      bbec6cdc       cmpa.l 0x6cdc(a4), a5
│           0x00004188      6644           bne.b 0x41ce
│           0x0000418a      206c6ce0       movea.l 0x6ce0(a4), a0
│           0x0000418e      61000158       bsr.w fcn.000042e8
│           0x00004192      082d0005001a   btst.b 0x5, 0x1a(a5)
│           0x00004198      6734           beq.b 0x41ce
│           0x0000419a      202d001c       move.l 0x1c(a5), d0
│           0x0000419e      7201           moveq 0x1, d1
│           0x000041a0      41ef000b       lea.l 0xb(a7), a0
│           0x000041a4      6100f1a6       bsr.w fcn.0000334c
│           0x000041a8      2e00           move.l d0, d7
│           0x000041aa      6f0a           ble.b 0x41b6
│           0x000041ac      7e00           moveq 0x0, d7
│           0x000041ae      1e2f000b       move.b 0xb(a7), d7
│           0x000041b2      60000126       bra.w 0x42da
│           ; CODE XREF from fcn.0000417c @ 0x41aa(x)
│           0x000041b6      4a87           tst.l d7
│           0x000041b8      6608           bne.b 0x41c2
│           0x000041ba      08ed0004001b   bset.b 0x4, 0x1b(a5)
│           0x000041c0      6006           bra.b 0x41c8
│           ; CODE XREF from fcn.0000417c @ 0x41b8(x)
│           0x000041c2      08ed0005001b   bset.b 0x5, 0x1b(a5)
│           ; CODE XREF from fcn.0000417c @ 0x41c0(x)
│           0x000041c8      7eff           moveq 0xff, d7
│           0x000041ca      6000010e       bra.w 0x42da
│           ; CODE XREFS from fcn.0000417c @ 0x4188(x), 0x4198(x)
│           0x000041ce      53ad0008       subq.l 0x1, 0x8(a5)
│           0x000041d2      6d10           blt.b 0x41e4
│           0x000041d4      206d0004       movea.l 0x4(a5), a0
│           0x000041d8      52ad0004       addq.l 0x1, 0x4(a5)
│           0x000041dc      7000           moveq 0x0, d0
│           0x000041de      1010           move.b (a0), d0
│           0x000041e0      600000fa       bra.w 0x42dc
│           ; CODE XREF from fcn.0000417c @ 0x41d2(x)
│           0x000041e4      7e33           moveq 0x33, d7
│           0x000041e6      cead0018       and.l 0x18(a5), d7
│           0x000041ea      7001           moveq 0x1, d0
│           0x000041ec      be80           cmp.l d0, d7
│           0x000041ee      673a           beq.b 0x422a
│           0x000041f0      725c           moveq 0x5c, d1
│           0x000041f2      4601           not.b d1
│           0x000041f4      c2ad0018       and.l 0x18(a5), d1
│           0x000041f8      7040           moveq 0x40, d0
│           0x000041fa      d080           add.l d0, d0
│           0x000041fc      b280           cmp.l d0, d1
│           0x000041fe      6614           bne.b 0x4214
│           0x00004200      08ed0000001b   bset.b 0x0, 0x1b(a5)
│           0x00004206      082d0004001b   btst.b 0x4, 0x1b(a5)
│           0x0000420c      671c           beq.b 0x422a
│           0x0000420e      70ff           moveq 0xff, d0
│           0x00004210      600000ca       bra.w 0x42dc
│           ; CODE XREF from fcn.0000417c @ 0x41fe(x)
│           0x00004214      42ad0008       clr.l 0x8(a5)
│           0x00004218      7211           moveq 0x11, d1
│           0x0000421a      be81           cmp.l d1, d7
│           0x0000421c      6706           beq.b 0x4224
│           0x0000421e      08ed0005001b   bset.b 0x5, 0x1b(a5)
│           ; CODE XREF from fcn.0000417c @ 0x421c(x)
│           0x00004224      70ff           moveq 0xff, d0
│           0x00004226      600000b4       bra.w 0x42dc
│           ; CODE XREFS from fcn.0000417c @ 0x41ee(x), 0x420c(x)
│           0x0000422a      082d0002001b   btst.b 0x2, 0x1b(a5)
│           0x00004230      6744           beq.b 0x4276
│           0x00004232      42ad0008       clr.l 0x8(a5)
│           0x00004236      7e00           moveq 0x0, d7
│           0x00004238      1e2d0020       move.b 0x20(a5), d7
│           0x0000423c      4a87           tst.l d7
│           0x0000423e      6708           beq.b 0x4248
│           0x00004240      422d0020       clr.b 0x20(a5)
│           0x00004244      60000094       bra.w 0x42da
│           ; CODE XREF from fcn.0000417c @ 0x423e(x)
│           0x00004248      202d001c       move.l 0x1c(a5), d0
│           0x0000424c      7201           moveq 0x1, d1
│           0x0000424e      41ef000b       lea.l 0xb(a7), a0
│           0x00004252      6100f0f8       bsr.w fcn.0000334c
│           0x00004256      2e00           move.l d0, d7
│           0x00004258      6f08           ble.b 0x4262
│           0x0000425a      7e00           moveq 0x0, d7
│           0x0000425c      1e2f000b       move.b 0xb(a7), d7
│           0x00004260      6078           bra.b 0x42da
│           ; CODE XREF from fcn.0000417c @ 0x4258(x)
│           0x00004262      4a87           tst.l d7
│           0x00004264      6608           bne.b 0x426e
│           0x00004266      08ed0004001b   bset.b 0x4, 0x1b(a5)
│           0x0000426c      606a           bra.b 0x42d8
│           ; CODE XREF from fcn.0000417c @ 0x4264(x)
│           0x0000426e      08ed0005001b   bset.b 0x5, 0x1b(a5)
│           0x00004274      6062           bra.b 0x42d8
│           ; CODE XREF from fcn.0000417c @ 0x4230(x)
│           0x00004276      4aad0014       tst.l 0x14(a5)
│           0x0000427a      6614           bne.b 0x4290
│           0x0000427c      204d           movea.l a5, a0
│           0x0000427e      6100ed70       bsr.w fcn.00002ff0
│           0x00004282      4a80           tst.l d0
│           0x00004284      670a           beq.b 0x4290
│           0x00004286      08ed0005001b   bset.b 0x5, 0x1b(a5)
│           0x0000428c      70ff           moveq 0xff, d0
│           0x0000428e      604c           bra.b 0x42dc
│           ; CODE XREFS from fcn.0000417c @ 0x427a(x), 0x4284(x)
│           0x00004290      206d0010       movea.l 0x10(a5), a0
│           0x00004294      2b480004       move.l a0, 0x4(a5)
│           0x00004298      202d001c       move.l 0x1c(a5), d0
│           0x0000429c      222d0014       move.l 0x14(a5), d1
│           0x000042a0      206d0010       movea.l 0x10(a5), a0
│           0x000042a4      6100f0a6       bsr.w fcn.0000334c
│           0x000042a8      2b400008       move.l d0, 0x8(a5)
│           0x000042ac      2e00           move.l d0, d7
│           0x000042ae      6f12           ble.b 0x42c2
│           0x000042b0      53ad0008       subq.l 0x1, 0x8(a5)
│           0x000042b4      206d0004       movea.l 0x4(a5), a0
│           0x000042b8      52ad0004       addq.l 0x1, 0x4(a5)
│           0x000042bc      7e00           moveq 0x0, d7
│           0x000042be      1e10           move.b (a0), d7
│           0x000042c0      6018           bra.b 0x42da
│           ; CODE XREF from fcn.0000417c @ 0x42ae(x)
│           0x000042c2      4a87           tst.l d7
│           0x000042c4      6608           bne.b 0x42ce
│           0x000042c6      08ed0004001b   bset.b 0x4, 0x1b(a5)
│           0x000042cc      600a           bra.b 0x42d8
│           ; CODE XREF from fcn.0000417c @ 0x42c4(x)
│           0x000042ce      08ed0005001b   bset.b 0x5, 0x1b(a5)
│           0x000042d4      42ad0008       clr.l 0x8(a5)
│           ; CODE XREFS from fcn.0000417c @ 0x426c(x), 0x4274(x), 0x42cc(x)
│           0x000042d8      7eff           moveq 0xff, d7
│           ; CODE XREFS from fcn.0000417c @ 0x41b2(x), 0x41ca(x), 0x4244(x), 0x4260(x), 0x42c0(x)
│           0x000042da      2007           move.l d7, d0
│           ; CODE XREFS from fcn.0000417c @ 0x41e0(x), 0x4210(x), 0x4226(x), 0x428e(x)
│           0x000042dc      4cdf2080       movem.l (a7)+, d7/a5
│           0x000042e0      584f           addq.w 0x4, a7
└           0x000042e2      4e75           rts
            0x000042e4      206f0004       movea.l 0x4(a7), a0
            ; XREFS: CALL 0x0000403e  CALL 0x000040b8  CALL 0x000040e4  
            ; XREFS: CALL 0x0000418e  CALL 0x000043a2  CALL 0x000043e0  
┌ 210: fcn.000042e8 ();
│           0x000042e8      48e70104       movem.l d7/a5, -(a7)
│           0x000042ec      2a48           movea.l a0, a5
│           0x000042ee      200d           move.l a5, d0
│           0x000042f0      670000a0       beq.w 0x4392
│           0x000042f4      7041           moveq 0x41, d0
│           0x000042f6      d080           add.l d0, d0
│           0x000042f8      c0ad0018       and.l 0x18(a5), d0
│           0x000042fc      662c           bne.b 0x432a
│           0x000042fe      206d0010       movea.l 0x10(a5), a0
│           0x00004302      43ed0004       lea.l 0x4(a5), a1
│           0x00004306      22c8           move.l a0, (a1)+
│           0x00004308      4299           clr.l (a1)+
│           0x0000430a      422d0020       clr.b 0x20(a5)
│           0x0000430e      7000           moveq 0x0, d0
│           0x00004310      22c0           move.l d0, (a1)+
│           0x00004312      082d0007001b   btst.b 0x7, 0x1b(a5)
│           0x00004318      6706           beq.b 0x4320
│           0x0000431a      08ad0000001b   bclr.b 0x0, 0x1b(a5)
│           ; CODE XREF from fcn.000042e8 @ 0x4318(x)
│           0x00004320      08ad0004001b   bclr.b 0x4, 0x1b(a5)
│           0x00004326      6000008c       bra.w 0x43b4
│           ; CODE XREF from fcn.000042e8 @ 0x42fc(x)
│           0x0000432a      4aad0014       tst.l 0x14(a5)
│           0x0000432e      6744           beq.b 0x4374
│           0x00004330      202d000c       move.l 0xc(a5), d0
│           0x00004334      6a06           bpl.b 0x433c
│           0x00004336      7200           moveq 0x0, d1
│           0x00004338      2b41000c       move.l d1, 0xc(a5)
│           ; CODE XREF from fcn.000042e8 @ 0x4334(x)
│           0x0000433c      202d000c       move.l 0xc(a5), d0
│           0x00004340      6728           beq.b 0x436a
│           0x00004342      222d001c       move.l 0x1c(a5), d1
│           0x00004346      c141           exg.l d0, d1
│           0x00004348      206d0010       movea.l 0x10(a5), a0
│           0x0000434c      6100eef6       bsr.w fcn.00003244
│           0x00004350      2200           move.l d0, d1
│           0x00004352      5280           addq.l 0x1, d0
│           0x00004354      6608           bne.b 0x435e
│           0x00004356      08ed0005001b   bset.b 0x5, 0x1b(a5)
│           0x0000435c      600c           bra.b 0x436a
│           ; CODE XREF from fcn.000042e8 @ 0x4354(x)
│           0x0000435e      b2ad000c       cmp.l 0xc(a5), d1
│           0x00004362      6706           beq.b 0x436a
│           0x00004364      08ed0004001b   bset.b 0x4, 0x1b(a5)
│           ; CODE XREFS from fcn.000042e8 @ 0x4340(x), 0x435c(x), 0x4362(x)
│           0x0000436a      2b6d00100004   move.l 0x10(a5), 0x4(a5)
│           0x00004370      42ad000c       clr.l 0xc(a5)
│           ; CODE XREF from fcn.000042e8 @ 0x432e(x)
│           0x00004374      7030           moveq 0x30, d0
│           0x00004376      c0ad0018       and.l 0x18(a5), d0
│           0x0000437a      6612           bne.b 0x438e
│           0x0000437c      082d0007001b   btst.b 0x7, 0x1b(a5)
│           0x00004382      6706           beq.b 0x438a
│           0x00004384      70fc           moveq 0xfc, d0
│           0x00004386      c1ad0018       and.l d0, 0x18(a5)
│           ; CODE XREF from fcn.000042e8 @ 0x4382(x)
│           0x0000438a      7000           moveq 0x0, d0
│           0x0000438c      6026           bra.b 0x43b4
│           ; CODE XREF from fcn.000042e8 @ 0x437a(x)
│           0x0000438e      7000           moveq 0x0, d0
│           0x00004390      6022           bra.b 0x43b4
│           ; CODE XREF from fcn.000042e8 @ 0x42f0(x)
│           0x00004392      2a6c6cc8       movea.l 0x6cc8(a4), a5
│           0x00004396      7e00           moveq 0x0, d7
│           0x00004398      6014           bra.b 0x43ae
│           ; CODE XREF from fcn.000042e8 @ 0x43b0(x)
│           0x0000439a      4aad0018       tst.l 0x18(a5)
│           0x0000439e      670c           beq.b 0x43ac
│           0x000043a0      204d           movea.l a5, a0
│           0x000043a2      6100ff44       bsr.w fcn.000042e8
│           0x000043a6      4a80           tst.l d0
│           0x000043a8      6702           beq.b 0x43ac
│           0x000043aa      7eff           moveq 0xff, d7
│           ; CODE XREFS from fcn.000042e8 @ 0x439e(x), 0x43a8(x)
│           0x000043ac      2a55           movea.l (a5), a5
│           ; CODE XREF from fcn.000042e8 @ 0x4398(x)
│           0x000043ae      200d           move.l a5, d0
│           0x000043b0      66e8           bne.b 0x439a
│           0x000043b2      2007           move.l d7, d0
│           ; CODE XREFS from fcn.000042e8 @ 0x4326(x), 0x438c(x), 0x4390(x)
│           0x000043b4      4cdf2080       movem.l (a7)+, d7/a5
└           0x000043b8      4e75           rts
            0x000043ba      4e71           nop
            0x000043bc      206f0004       movea.l 0x4(a7), a0
            ; CALL XREF from fcn.00000ee0 @ 0x111c(x)
            ; CALL XREF from fcn.0000442a @ 0x4446(x)
┌ 94: fcn.000043c0 ();
│           0x000043c0      48e70104       movem.l d7/a5, -(a7)
│           0x000043c4      2a48           movea.l a0, a5
│           0x000043c6      7e00           moveq 0x0, d7
│           0x000043c8      200d           move.l a5, d0
│           0x000043ca      6706           beq.b 0x43d2
│           0x000043cc      202d0018       move.l 0x18(a5), d0
│           0x000043d0      6604           bne.b 0x43d6
│           ; CODE XREF from fcn.000043c0 @ 0x43ca(x)
│           0x000043d2      70ff           moveq 0xff, d0
│           0x000043d4      6040           bra.b 0x4416
│           ; CODE XREF from fcn.000043c0 @ 0x43d0(x)
│           0x000043d6      082d0001001b   btst.b 0x1, 0x1b(a5)
│           0x000043dc      6708           beq.b 0x43e6
│           0x000043de      204d           movea.l a5, a0
│           0x000043e0      6100ff06       bsr.w fcn.000042e8
│           0x000043e4      2e00           move.l d0, d7
│           ; CODE XREF from fcn.000043c0 @ 0x43dc(x)
│           0x000043e6      700c           moveq 0xc, d0
│           0x000043e8      c0ad0018       and.l 0x18(a5), d0
│           0x000043ec      660e           bne.b 0x43fc
│           0x000043ee      4aad0014       tst.l 0x14(a5)
│           0x000043f2      6708           beq.b 0x43fc
│           0x000043f4      206d0010       movea.l 0x10(a5), a0
│           0x000043f8      6100f806       bsr.w fcn.00003c00
│           ; CODE XREFS from fcn.000043c0 @ 0x43ec(x), 0x43f2(x)
│           0x000043fc      42ad0018       clr.l 0x18(a5)
│           0x00004400      202d001c       move.l 0x1c(a5), d0
│           0x00004404      6100f0d2       bsr.w fcn.000034d8
│           0x00004408      5287           addq.l 0x1, d7
│           0x0000440a      6704           beq.b 0x4410
│           0x0000440c      4a80           tst.l d0
│           0x0000440e      6704           beq.b 0x4414
│           ; CODE XREF from fcn.000043c0 @ 0x440a(x)
│           0x00004410      70ff           moveq 0xff, d0
│           0x00004412  ~   0c407000       cmpi.w 0x7000, d0
│           ; CODE XREF from fcn.000043c0 @ 0x440e(x)
│           0x00004414      7000           moveq 0x0, d0
│           ; CODE XREF from fcn.000043c0 @ 0x43d4(x)
│           0x00004416      4cdf2080       movem.l (a7)+, d7/a5
└           0x0000441a      4e75           rts
            0x0000441c      206f0004       movea.l 0x4(a7), a0
            0x00004420      226f0008       movea.l 0x8(a7), a1
            0x00004424      2f6f000c0004   move.l 0xc(a7), 0x4(a7)
            ; CALL XREF from fcn.00004560 @ 0x45b6(x)
┌ 302: fcn.0000442a ();
│           0x0000442a      48e70f34       movem.l d4-d7/a2-a3/a5, -(a7)
│           0x0000442e      246f0020       movea.l 0x20(a7), a2
│           0x00004432      2649           movea.l a1, a3
│           0x00004434      2a48           movea.l a0, a5
│           0x00004436      7e00           moveq 0x0, d7
│           0x00004438      2c2c08c0       move.l 0x8c0(a4), d6
│           0x0000443c      7a00           moveq 0x0, d5
│           0x0000443e      4aaa0018       tst.l 0x18(a2)
│           0x00004442      6706           beq.b 0x444a
│           0x00004444      204a           movea.l a2, a0
│           0x00004446      6100ff78       bsr.w fcn.000043c0
│           ; CODE XREF from fcn.0000442a @ 0x4442(x)
│           0x0000444a      7000           moveq 0x0, d0
│           0x0000444c      102b0001       move.b 0x1(a3), d0
│           0x00004450      722b           moveq 0x2b, d1
│           0x00004452      9081           sub.l d1, d0
│           0x00004454      6722           beq.b 0x4478
│           0x00004456      7236           moveq 0x36, d1
│           0x00004458      9081           sub.l d1, d0
│           0x0000445a      6706           beq.b 0x4462
│           0x0000445c      5380           subq.l 0x1, d0
│           0x0000445e      6706           beq.b 0x4466
│           0x00004460      6022           bra.b 0x4484
│           ; CODE XREF from fcn.0000442a @ 0x445a(x)
│           0x00004462      7c40           moveq 0x40, d6
│           0x00004464      e18e           lsl.l 0x8, d6
│           ; CODE XREF from fcn.0000442a @ 0x445e(x)
│           0x00004466      722b           moveq 0x2b, d1
│           0x00004468      b22b0002       cmp.b 0x2(a3), d1
│           0x0000446c      57c0           seq.b d0
│           0x0000446e      4400           neg.b d0
│           0x00004470      4880           ext.w d0
│           0x00004472      48c0           ext.l d0
│           0x00004474      2a00           move.l d0, d5
│           0x00004476      600c           bra.b 0x4484
│           ; CODE XREF from fcn.0000442a @ 0x4454(x)
│           0x00004478      7a01           moveq 0x1, d5
│           0x0000447a      7061           moveq 0x61, d0
│           0x0000447c      b02b0002       cmp.b 0x2(a3), d0
│           0x00004480      6602           bne.b 0x4484
│           0x00004482      7c00           moveq 0x0, d6
│           ; CODE XREFS from fcn.0000442a @ 0x4460(x), 0x4476(x), 0x4480(x)
│           0x00004484      7000           moveq 0x0, d0
│           0x00004486      1013           move.b (a3), d0
│           0x00004488      7261           moveq 0x61, d1
│           0x0000448a      9081           sub.l d1, d0
│           0x0000448c      670c           beq.b 0x449a
│           0x0000448e      7211           moveq 0x11, d1
│           0x00004490      9081           sub.l d1, d0
│           0x00004492      671a           beq.b 0x44ae
│           0x00004494      5b80           subq.l 0x5, d0
│           0x00004496      6724           beq.b 0x44bc
│           0x00004498      6036           bra.b 0x44d0
│           ; CODE XREF from fcn.0000442a @ 0x448c(x)
│           0x0000449a      4a85           tst.l d5
│           0x0000449c      56c0           sne.b d0
│           0x0000449e      7201           moveq 0x1, d1
│           0x000044a0      9200           sub.b d0, d1
│           0x000044a2      00410108       ori.w 0x108, d1
│           0x000044a6      8c81           or.l d1, d6
│           0x000044a8      7e40           moveq 0x40, d7
│           0x000044aa      e18f           lsl.l 0x8, d7
│           0x000044ac      6026           bra.b 0x44d4
│           ; CODE XREF from fcn.0000442a @ 0x4492(x)
│           0x000044ae      4a85           tst.l d5
│           0x000044b0      56c0           sne.b d0
│           0x000044b2      7200           moveq 0x0, d1
│           0x000044b4      9200           sub.b d0, d1
│           0x000044b6      9200           sub.b d0, d1
│           0x000044b8      8c81           or.l d1, d6
│           0x000044ba      6018           bra.b 0x44d4
│           ; CODE XREF from fcn.0000442a @ 0x4496(x)
│           0x000044bc      4a85           tst.l d5
│           0x000044be      56c0           sne.b d0
│           0x000044c0      7201           moveq 0x1, d1
│           0x000044c2      9200           sub.b d0, d1
│           0x000044c4      00410100       ori.w 0x100, d1
│           0x000044c8      00410200       ori.w 0x200, d1
│           0x000044cc      8c81           or.l d1, d6
│           0x000044ce      6004           bra.b 0x44d4
│           ; CODE XREF from fcn.0000442a @ 0x4498(x)
│           0x000044d0      7000           moveq 0x0, d0
│           0x000044d2      607c           bra.b 0x4550
│           ; CODE XREFS from fcn.0000442a @ 0x44ac(x), 0x44ba(x), 0x44ce(x)
│           0x000044d4      2f2c08c4       move.l 0x8c4(a4), -(a7)
│           0x000044d8      2f06           move.l d6, -(a7)
│           0x000044da      2f0d           move.l a5, -(a7)
│           0x000044dc      6100f066       bsr.w fcn.00003544
│           0x000044e0      2800           move.l d0, d4
│           0x000044e2      5280           addq.l 0x1, d0
│           0x000044e4      4fef000c       lea.l 0xc(a7), a7
│           0x000044e8      6604           bne.b 0x44ee
│           0x000044ea      7000           moveq 0x0, d0
│           0x000044ec      6062           bra.b 0x4550
│           ; CODE XREF from fcn.0000442a @ 0x44e8(x)
│           0x000044ee      4a85           tst.l d5
│           0x000044f0      6706           beq.b 0x44f8
│           0x000044f2      08c70007       bset.b 0x7, d7
│           0x000044f6      6030           bra.b 0x4528
│           ; CODE XREF from fcn.0000442a @ 0x44f0(x)
│           0x000044f8      7000           moveq 0x0, d0
│           0x000044fa      1013           move.b (a3), d0
│           0x000044fc      7261           moveq 0x61, d1
│           0x000044fe      9081           sub.l d1, d0
│           0x00004500      670c           beq.b 0x450e
│           0x00004502      7211           moveq 0x11, d1
│           0x00004504      9081           sub.l d1, d0
│           0x00004506      671a           beq.b 0x4522
│           0x00004508      5b80           subq.l 0x5, d0
│           0x0000450a      671a           beq.b 0x4526
│           0x0000450c      601a           bra.b 0x4528
│           ; CODE XREF from fcn.0000442a @ 0x4500(x)
│           0x0000450e      48780002       pea.l 0x2
│           0x00004512      08c70001       bset.b 0x1, d7
│           0x00004516      2004           move.l d4, d0
│           0x00004518      7200           moveq 0x0, d1
│           0x0000451a      6100ef2e       bsr.w fcn.0000344a
│           0x0000451e      584f           addq.w 0x4, a7
│           0x00004520      6006           bra.b 0x4528
│           ; CODE XREF from fcn.0000442a @ 0x4506(x)
│           0x00004522      7e01           moveq 0x1, d7
│           0x00004524  ~   0c407e02       cmpi.w 0x7e02, d0
│           ; CODE XREF from fcn.0000442a @ 0x450a(x)
│           0x00004526      7e02           moveq 0x2, d7
│           ; CODE XREFS from fcn.0000442a @ 0x44f6(x), 0x450c(x), 0x4520(x)
│           0x00004528      0806000f       btst.b 0xf, d6
│           0x0000452c      6604           bne.b 0x4532
│           0x0000452e      08c7000f       bset.b 0xf, d7
│           ; CODE XREF from fcn.0000442a @ 0x452c(x)
│           0x00004532      91c8           suba.l a0, a0
│           0x00004534      4bea0010       lea.l 0x10(a2), a5
│           0x00004538      2ac8           move.l a0, (a5)+
│           0x0000453a      2ac8           move.l a0, (a5)+
│           0x0000453c      2544001c       move.l d4, 0x1c(a2)
│           0x00004540      25480004       move.l a0, 0x4(a2)
│           0x00004544      2548000c       move.l a0, 0xc(a2)
│           0x00004548      25480008       move.l a0, 0x8(a2)
│           0x0000454c      2ac7           move.l d7, (a5)+
│           0x0000454e      200a           move.l a2, d0
│           ; CODE XREFS from fcn.0000442a @ 0x44d2(x), 0x44ec(x)
│           0x00004550      4cdf2cf0       movem.l (a7)+, d4-d7/a2-a3/a5
└           0x00004554      4e75           rts
            0x00004556      4e71           nop
            0x00004558      206f0004       movea.l 0x4(a7), a0
            0x0000455c      226f0008       movea.l 0x8(a7), a1
            ; CALL XREF from fcn.00000ee0 @ 0xef8(x)
┌ 102: fcn.00004560 ();
│           0x00004560      594f           subq.w 0x4, a7
│           0x00004562      48e70034       movem.l a2-a3/a5, -(a7)
│           0x00004566      2f49000c       move.l a1, 0xc(a7)
│           0x0000456a      266c6cc8       movea.l 0x6cc8(a4), a3
│           0x0000456e      2a48           movea.l a0, a5
│           0x00004570      6004           bra.b 0x4576
│           ; CODE XREF from fcn.00004560 @ 0x457e(x)
│           0x00004572      244b           movea.l a3, a2
│           0x00004574      2652           movea.l (a2), a3
│           ; CODE XREF from fcn.00004560 @ 0x4570(x)
│           0x00004576      200b           move.l a3, d0
│           0x00004578      6706           beq.b 0x4580
│           0x0000457a      4aab0018       tst.l 0x18(a3)
│           0x0000457e      66f2           bne.b 0x4572
│           ; CODE XREF from fcn.00004560 @ 0x4578(x)
│           0x00004580      200b           move.l a3, d0
│           0x00004582      662a           bne.b 0x45ae
│           0x00004584      7022           moveq 0x22, d0
│           0x00004586      6100f7e4       bsr.w fcn.00003d6c
│           0x0000458a      2640           movea.l d0, a3
│           0x0000458c      4a80           tst.l d0
│           0x0000458e      6604           bne.b 0x4594
│           0x00004590      7000           moveq 0x0, d0
│           0x00004592      6028           bra.b 0x45bc
│           ; CODE XREF from fcn.00004560 @ 0x458e(x)
│           0x00004594      4aac6cc8       tst.l 0x6cc8(a4)
│           0x00004598      6606           bne.b 0x45a0
│           0x0000459a      294b6cc8       move.l a3, 0x6cc8(a4)
│           0x0000459e  ~   0c40248b       cmpi.w 0x248b, d0
│           ; CODE XREF from fcn.00004560 @ 0x4598(x)
│           0x000045a0      248b           move.l a3, (a2)
│           0x000045a2      204b           movea.l a3, a0
│           0x000045a4      7021           moveq 0x21, d0
│           0x000045a6      7200           moveq 0x0, d1
│           ; CODE XREF from fcn.00004560 @ 0x45aa(x)
│           0x000045a8      10c1           move.b d1, (a0)+
│           0x000045aa      51c8fffc       dbra d0, 0x45a8
│           ; CODE XREF from fcn.00004560 @ 0x4582(x)
│           0x000045ae      2f0b           move.l a3, -(a7)
│           0x000045b0      226f0010       movea.l 0x10(a7), a1
│           0x000045b4      204d           movea.l a5, a0
│           0x000045b6      6100fe72       bsr.w fcn.0000442a
│           0x000045ba      584f           addq.w 0x4, a7
│           ; CODE XREF from fcn.00004560 @ 0x4592(x)
│           0x000045bc      4cdf2c00       movem.l (a7)+, a2-a3/a5
│           0x000045c0      584f           addq.w 0x4, a7
└           0x000045c2      4e75           rts
            0x000045c4      206f0004       movea.l 0x4(a7), a0
            0x000045c8      226f0008       movea.l 0x8(a7), a1
            0x000045cc      2f6f000c0004   move.l 0xc(a7), 0x4(a7)
            0x000045d2      2f6f00100008   move.l 0x10(a7), 0x8(a7)
            ; CALL XREF from fcn.00004a54 @ 0x4a82(x)
┌ 356: fcn.000045d8 ();
│           0x000045d8      9efc0048       suba.w 0x48, a7
│           0x000045dc      48e72f34       movem.l d2/d4-d7/a2-a3/a5, -(a7)
│           0x000045e0      2a6f0070       movea.l 0x70(a7), a5
│           0x000045e4      2f480028       move.l a0, 0x28(a7)
│           0x000045e8      422f005b       clr.b 0x5b(a7)
│           0x000045ec      422f0046       clr.b 0x46(a7)
│           0x000045f0      422f0047       clr.b 0x47(a7)
│           0x000045f4      422f0064       clr.b 0x64(a7)
│           0x000045f8      1f7c0020005a   move.b 0x20, 0x5a(a7)
│           0x000045fe      42af004c       clr.l 0x4c(a7)
│           0x00004602      70ff           moveq 0xff, d0
│           0x00004604      2f400060       move.l d0, 0x60(a7)
│           0x00004608      422f005c       clr.b 0x5c(a7)
│           0x0000460c      7e00           moveq 0x0, d7
│           0x0000460e      7c00           moveq 0x0, d6
│           0x00004610      45ef0032       lea.l 0x32(a7), a2
│           0x00004614      2649           movea.l a1, a3
│           0x00004616      606c           bra.b 0x4684
│           ; CODE XREF from fcn.000045d8 @ 0x468a(x)
│           0x00004618      206f0028       movea.l 0x28(a7), a0
│           0x0000461c      7000           moveq 0x0, d0
│           0x0000461e      1010           move.b (a0), d0
│           0x00004620      7220           moveq 0x20, d1
│           0x00004622      9081           sub.l d1, d0
│           0x00004624      6d66           blt.b 0x468c
│           0x00004626      0c8000000011   cmpi.l 0x11, d0
│           0x0000462c      6c5e           bge.b 0x468c
│           0x0000462e      d040           add.w d0, d0
│           0x00004630      303b0006       move.w 0x4638(pc, d0.w), d0
│           0x00004634      4efb0004       jmp 0x463a(pc, d0.w)        ; fcn.000030f0-0x30f0
            0x00004638      003000520052   ori.b 0x52, 0x52(a0, d0.w)
            0x0000463e      003800520052   ori.b 0x52, 0x52.w
            0x00004644      00520052       ori.w 0x52, (a2)
            0x00004648      00520052       ori.w 0x52, (a2)
            0x0000464c      00520028       ori.w 0x28, (a2)
            0x00004650      00520020       ori.w 0x20, (a2)
            0x00004654      00520052       ori.w 0x52, (a2)
            0x00004658      00401f7c       ori.w 0x1f7c, d0
            0x0000465c      0001005b       ori.b 0x5b, d1
            0x00004660      601e           bra.b 0x4680
            0x00004662      1f7c00010046   move.b 0x1, 0x46(a7)
            0x00004668      6016           bra.b 0x4680
            0x0000466a      1f7c00010047   move.b 0x1, 0x47(a7)
            0x00004670      600e           bra.b 0x4680
            0x00004672      1f7c00010064   move.b 0x1, 0x64(a7)
            0x00004678      6006           bra.b 0x4680
            0x0000467a      1f7c0030005a   move.b 0x30, 0x5a(a7)
            ; CODE XREFS from fcn.000045d8 @ +0x88(x), +0x90(x), +0x98(x), +0xa0(x)
            0x00004680      52af0028       addq.l 0x1, 0x28(a7)
│           ; CODE XREF from fcn.000045d8 @ 0x4616(x)
│           0x00004684      206f0028       movea.l 0x28(a7), a0
│           0x00004688      4a10           tst.b (a0)
│           0x0000468a      668c           bne.b 0x4618
│           ; CODE XREFS from fcn.000045d8 @ 0x4624(x), 0x462c(x)
│           0x0000468c      7001           moveq 0x1, d0
│           0x0000468e      b02f005b       cmp.b 0x5b(a7), d0
│           0x00004692      6606           bne.b 0x469a
│           0x00004694      1f7c0020005a   move.b 0x20, 0x5a(a7)
│           ; CODE XREF from fcn.000045d8 @ 0x4692(x)
│           0x0000469a      722a           moveq 0x2a, d1
│           0x0000469c      206f0028       movea.l 0x28(a7), a0
│           0x000046a0      b210           cmp.b (a0), d1
│           0x000046a2      661a           bne.b 0x46be
│           0x000046a4      2253           movea.l (a3), a1
│           0x000046a6      5893           addq.l 0x4, (a3)
│           0x000046a8      2211           move.l (a1), d1
│           0x000046aa      2f41004c       move.l d1, 0x4c(a7)
│           0x000046ae      6c08           bge.b 0x46b8
│           0x000046b0      44af004c       neg.l 0x4c(a7)
│           0x000046b4      1f40005b       move.b d0, 0x5b(a7)
│           ; CODE XREF from fcn.000045d8 @ 0x46ae(x)
│           0x000046b8      52af0028       addq.l 0x1, 0x28(a7)
│           0x000046bc      600c           bra.b 0x46ca
│           ; CODE XREF from fcn.000045d8 @ 0x46a2(x)
│           0x000046be      43ef004c       lea.l 0x4c(a7), a1
│           0x000046c2      6100e6b8       bsr.w fcn.00002d7c
│           0x000046c6      d1af0028       add.l d0, 0x28(a7)
│           ; CODE XREF from fcn.000045d8 @ 0x46bc(x)
│           0x000046ca      206f0028       movea.l 0x28(a7), a0
│           0x000046ce      1010           move.b (a0), d0
│           0x000046d0      722e           moveq 0x2e, d1
│           0x000046d2      b001           cmp.b d1, d0
│           0x000046d4      6642           bne.b 0x4718
│           0x000046d6      52af0028       addq.l 0x1, 0x28(a7)
│           0x000046da      702a           moveq 0x2a, d0
│           0x000046dc      206f0028       movea.l 0x28(a7), a0
│           0x000046e0      b010           cmp.b (a0), d0
│           0x000046e2      6618           bne.b 0x46fc
│           0x000046e4      2053           movea.l (a3), a0
│           0x000046e6      5893           addq.l 0x4, (a3)
│           0x000046e8      2010           move.l (a0), d0
│           0x000046ea      2f400060       move.l d0, 0x60(a7)
│           0x000046ee      6c06           bge.b 0x46f6
│           0x000046f0      70ff           moveq 0xff, d0
│           0x000046f2      2f400060       move.l d0, 0x60(a7)
│           ; CODE XREF from fcn.000045d8 @ 0x46ee(x)
│           0x000046f6      52af0028       addq.l 0x1, 0x28(a7)
│           0x000046fa      6016           bra.b 0x4712
│           ; CODE XREF from fcn.000045d8 @ 0x46e2(x)
│           0x000046fc      43ef0060       lea.l 0x60(a7), a1
│           0x00004700      6100e67a       bsr.w fcn.00002d7c
│           0x00004704      2a00           move.l d0, d5
│           0x00004706      6606           bne.b 0x470e
│           0x00004708      42af0060       clr.l 0x60(a7)
│           0x0000470c      6004           bra.b 0x4712
│           ; CODE XREF from fcn.000045d8 @ 0x4706(x)
│           0x0000470e      dbaf0028       add.l d5, 0x28(a7)
│           ; CODE XREFS from fcn.000045d8 @ 0x46fa(x), 0x470c(x)
│           0x00004712      1f7c0020005a   move.b 0x20, 0x5a(a7)
│           ; CODE XREF from fcn.000045d8 @ 0x46d4(x)
│           0x00004718      206f0028       movea.l 0x28(a7), a0
│           0x0000471c      7000           moveq 0x0, d0
│           0x0000471e      1010           move.b (a0), d0
│           0x00004720      724c           moveq 0x4c, d1
│           0x00004722      9081           sub.l d1, d0
│           0x00004724      6714           beq.b 0x473a
│           0x00004726      721c           moveq 0x1c, d1
│           0x00004728      9081           sub.l d1, d0
│           0x0000472a      6706           beq.b 0x4732
│           0x0000472c      5980           subq.l 0x4, d0
│           0x0000472e      670a           beq.b 0x473a
│           0x00004730      6012           bra.b 0x4744
│           ; CODE XREF from fcn.000045d8 @ 0x472a(x)
│           0x00004732      1f7c0002005c   move.b 0x2, 0x5c(a7)
│           0x00004738      6006           bra.b 0x4740
│           ; CODE XREFS from fcn.000045d8 @ 0x4724(x), 0x472e(x)
│           0x0000473a      1f7c0001005c   move.b 0x1, 0x5c(a7)
│           ; CODE XREF from fcn.000045d8 @ 0x4738(x)
│           0x00004740      52af0028       addq.l 0x1, 0x28(a7)
│           ; CODE XREF from fcn.000045d8 @ 0x4730(x)
│           0x00004744      206f0028       movea.l 0x28(a7), a0
│           0x00004748      5288           addq.l 0x1, a0
│           0x0000474a      226f0028       movea.l 0x28(a7), a1
│           0x0000474e      1011           move.b (a1), d0
│           0x00004750      7200           moveq 0x0, d1
│           0x00004752      1200           move.b d0, d1
│           0x00004754      1f400020       move.b d0, 0x20(a7)
│           0x00004758      2f480022       move.l a0, 0x22(a7)
│           0x0000475c      7050           moveq 0x50, d0
│           0x0000475e      9280           sub.l d0, d1
│           0x00004760      6d00020a       blt.w 0x496c
│           0x00004764      0c8100000029   cmpi.l 0x29, d1
│           0x0000476a      6c000200       bge.w 0x496c
│           0x0000476e      d241           add.w d1, d1
│           0x00004770      323b1006       move.w 0x4778(pc, d1.w), d1
; Bulls (emp_tools/Bulls) full disassembly
; Generated via: r2 -q -c "e scr.color=false; aaa; pd 6000" Doors/emp_tools/Bulls
; Date: 2025-12-08
; Notes:
;  - Addresses are file-relative (segment 0 base 0x0 -> loaded at 0x1008 in emulator).
;  - Useful anchors: entry0 at 0x24; AEDoor/OpenLibrary path around 0x11xx/0x12xx;
;    IPC/WaitPort loop near 0x3b00-0x3c40; ANSI/UI routines in 0x4xxx+.
;  - See Documentation/4-Door-Developers/archive/Bulls_DISASM_NOTES.md for behavioral notes.
