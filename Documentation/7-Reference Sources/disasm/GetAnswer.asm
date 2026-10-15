            0x00000000      000003f3       ori.b 0xf3, d0
            0x00000004      00000000       ori.b 0x0, d0
            0x00000008      00000002       ori.b 0x2, d0
            0x0000000c      00000000       ori.b 0x0, d0
            0x00000010      00000001       ori.b 0x1, d0
            0x00000014      000006e9       ori.b 0xe9, d0
            0x00000018      000000d6       ori.b 0xd6, d0
            0x0000001c      000003e9       ori.b 0xe9, d0
            0x00000020      000006e9       ori.b 0xe9, d0
            0x00000024      48e77efe       movem.l d1-d6/a0-a6, -(a7)
            0x00000028      2448           movea.l a0, a2
            0x0000002a      2400           move.l d0, d2
            0x0000002c      49f900000000   lea.l 0x0.l, a4
            0x00000032      2c780004       movea.l 0x4.w, a6
            0x00000036      47f900000254   lea.l 0x254.l, a3
            0x0000003c      7200           moveq 0x0, d1
            0x0000003e      203c00000041   move.l 0x41, d0
       ┌──< 0x00000044      6002           bra.b 0x48
      ┌───> 0x00000046      26c1           move.l d1, (a3)+
      └└──> 0x00000048      51c8fffc       dbra d0, 0x46
            0x0000004c      294f02a8       move.l a7, 0x2a8(a4)
            0x00000050      294e025c       move.l a6, 0x25c(a4)
            0x00000054      266e0114       movea.l 0x114(a6), a3
            0x00000058      202b00ac       move.l 0xac(a3), d0
       ┌──< 0x0000005c      670c           beq.b 0x6a
       │    0x0000005e      e588           lsl.l 0x2, d0
       │    0x00000060      2040           movea.l d0, a0
       │    0x00000062      20280034       move.l 0x34(a0), d0
       │    0x00000066      e588           lsl.l 0x2, d0
      ┌───< 0x00000068      6006           bra.b 0x70
      │└──> 0x0000006a      200f           move.l a7, d0
      │     0x0000006c      90ab003a       sub.l 0x3a(a3), d0
      └───> 0x00000070      220f           move.l a7, d1
            0x00000072      9280           sub.l d0, d1
            0x00000074      068100000080   addi.l 0x80, d1
            0x0000007a      294102a4       move.l d1, 0x2a4(a4)
            0x0000007e      b0ac0210       cmp.l 0x210(a4), d0
       ┌──< 0x00000082      6454           bcc.b 0xd8
       │    0x00000084      202c0210       move.l 0x210(a4), d0
       │    0x00000088      068000000080   addi.l 0x80, d0
       │    0x0000008e      29400278       move.l d0, 0x278(a4)
       │    0x00000092      223c00010001   move.l 0x10001, d1
       │    0x00000098      4eaeff3a       jsr -0xc6(a6)
       │    0x0000009c      4a80           tst.l d0
      ┌───< 0x0000009e      670001d2       beq.w 0x272
      ││    0x000000a2      29400274       move.l d0, 0x274(a4)
      ││    0x000000a6      068000000080   addi.l 0x80, d0
      ││    0x000000ac      294002a4       move.l d0, 0x2a4(a4)
      ││    0x000000b0      d0ac0210       add.l 0x210(a4), d0
      ││    0x000000b4      2200           move.l d0, d1
      ││    0x000000b6      0c6e00240014   cmpi.w 0x24, 0x14(a6)
     ┌────< 0x000000bc      6d18           blt.b 0xd6
     │││    0x000000be      29400270       move.l d0, 0x270(a4)
     │││    0x000000c2      2941026c       move.l d1, 0x26c(a4)
     │││    0x000000c6      92ac0278       sub.l 0x278(a4), d1
     │││    0x000000ca      41ec0268       lea.l 0x268(a4), a0
     │││    0x000000ce      2081           move.l d1, (a0)
     │││    0x000000d0      4eaefd24       jsr -0x2dc(a6)
    ┌─────< 0x000000d4      6002           bra.b 0xd8
    │└────> 0x000000d6      2e40           movea.l d0, a7
    └──└──> 0x000000d8      42ac02b8       clr.l 0x2b8(a4)
      │     0x000000dc      7000           moveq 0x0, d0
      │     0x000000de      223c00003000   move.l 0x3000, d1
      │     0x000000e4      4eaefece       jsr -0x132(a6)
      │     0x000000e8      266e0114       movea.l 0x114(a6), a3
      │     0x000000ec      43fa018a       lea.l 0x278(pc), a1
      │     0x000000f0      7000           moveq 0x0, d0
      │     0x000000f2      4eaefdd8       jsr -0x228(a6)
      │     0x000000f6      29400258       move.l d0, 0x258(a4)
      │┌──< 0x000000fa      6606           bne.b 0x102
      ││    0x000000fc      7064           moveq 0x64, d0
      ││┌─< 0x000000fe      600000ea       bra.w 0x1ea
      │└──> 0x00000102      296b009802b4   move.l 0x98(a3), 0x2b4(a4)
      │ │   0x00000108      4aab00ac       tst.l 0xac(a3)
      │ │   0x0000010c      6700007e       beq.w 0x18c
      │ │   0x00000110      206b00ac       movea.l 0xac(a3), a0
      │ │   0x00000114      d1c8           adda.l a0, a0
      │ │   0x00000116      d1c8           adda.l a0, a0
      │ │   0x00000118      22680010       movea.l 0x10(a0), a1
      │ │   0x0000011c      d3c9           adda.l a1, a1
      │ │   0x0000011e      d3c9           adda.l a1, a1
      │ │   0x00000120      2002           move.l d2, d0
      │ │   0x00000122      7200           moveq 0x0, d1
      │ │   0x00000124      1219           move.b (a1)+, d1
      │ │   0x00000126      294902ac       move.l a1, 0x2ac(a4)
      │ │   0x0000012a      d081           add.l d1, d0
      │ │   0x0000012c      5e80           addq.l 0x7, d0
      │ │   0x0000012e      0240fffc       andi.w 0xfffc, d0
      │ │   0x00000132      29400264       move.l d0, 0x264(a4)
      │ │   0x00000136      48e74040       movem.l d1/a1, -(a7)
      │ │   0x0000013a      223c00010001   move.l 0x10001, d1
      │ │   0x00000140      4eaeff3a       jsr -0xc6(a6)
      │ │   0x00000144      4cdf0202       movem.l (a7)+, d1/a1
      │ │   0x00000148      4a80           tst.l d0
      │ │   0x0000014a      6608           bne.b 0x154
      │ │   0x0000014c      7014           moveq 0x14, d0
      │ │   0x0000014e      2f00           move.l d0, -(a7)
      │ │   0x00000150      67000116       beq.w 0x268
      │ │   0x00000154      2040           movea.l d0, a0
      │ │   0x00000156      29400260       move.l d0, 0x260(a4)
      │ │   0x0000015a      2002           move.l d2, d0
      │ │   0x0000015c      5380           subq.l 0x1, d0
      │ │   0x0000015e      d481           add.l d1, d2
      │ │   0x00000160      11b200002002   move.b (a2, d0.w), 0x2(a0, d2.w)
      │ │   0x00000166      5382           subq.l 0x1, d2
      │ │   0x00000168      51c8fff6       dbra d0, 0x160
      │ │   0x0000016c      11bc00202002   move.b 0x20, 0x2(a0, d2.w)
      │ │   0x00000172      5382           subq.l 0x1, d2
      │ │   0x00000174      11bc00222002   move.b 0x22, 0x2(a0, d2.w)
      │ │   0x0000017a      11b120002001   move.b (a1, d2.w), 0x1(a0, d2.w)
      │ │   0x00000180      51cafff8       dbra d2, 0x17a
      │ │   0x00000184      10bc0022       move.b 0x22, (a0)
      │ │   0x00000188      2f08           move.l a0, -(a7)
      │ │   0x0000018a      604a           bra.b 0x1d6
      │ │   0x0000018c      41eb005c       lea.l 0x5c(a3), a0
      │ │   0x00000190      4eaefe80       jsr -0x180(a6)
      │ │   0x00000194      41eb005c       lea.l 0x5c(a3), a0
      │ │   0x00000198      4eaefe8c       jsr -0x174(a6)
      │ │   0x0000019c      294002b8       move.l d0, 0x2b8(a4)
      │ │   0x000001a0      2f00           move.l d0, -(a7)
      │ │   0x000001a2      2440           movea.l d0, a2
      │ │   0x000001a4      202a0024       move.l 0x24(a2), d0
      │ │   0x000001a8      6718           beq.b 0x1c2
      │ │   0x000001aa      2c6c0258       movea.l 0x258(a4), a6
      │ │   0x000001ae      2040           movea.l d0, a0
      │ │   0x000001b0      22280000       move.l 0x0(a0), d1
      │ │   0x000001b4      4eaeffa0       jsr -0x60(a6)
      │ │   0x000001b8      294002b4       move.l d0, 0x2b4(a4)
      │ │   0x000001bc      2200           move.l d0, d1
      │ │   0x000001be      4eaeff82       jsr -0x7e(a6)
      │ │   0x000001c2      206c02b8       movea.l 0x2b8(a4), a0
      │ │   0x000001c6      2f08           move.l a0, -(a7)
      │ │   0x000001c8      486c0254       pea.l 0x254(a4)
      │ │   0x000001cc      20680024       movea.l 0x24(a0), a0
      │ │   0x000001d0      2968000402ac   move.l 0x4(a0), 0x2ac(a4)
      │ │   0x000001d6      4eba0c58       jsr 0xe30(pc)
      │ │   0x000001da      4a80           tst.l d0
      │ │   0x000001dc      660c           bne.b 0x1ea
      │ │   0x000001de      4eba0f64       jsr 0x1144(pc)
      │ │   0x000001e2      7000           moveq 0x0, d0
      │ │   0x000001e4      6004           bra.b 0x1ea
      │ │   0x000001e6      202f0004       move.l 0x4(a7), d0
      │ │   0x000001ea      246c02a8       movea.l 0x2a8(a4), a2
      │ │   0x000001ee      2500           move.l d0, -(a2)
      │ │   0x000001f0      2c780004       movea.l 0x4.w, a6
      │ │   0x000001f4      0c6e00240014   cmpi.w 0x24, 0x14(a6)
      │ │   0x000001fa      6d12           blt.b 0x20e
      │ │   0x000001fc      4aac0268       tst.l 0x268(a4)
      │ │   0x00000200      670c           beq.b 0x20e
      │ │   0x00000202      41ec0268       lea.l 0x268(a4), a0
      │ │   0x00000206      59ac0270       subq.l 0x4, 0x270(a4)
      │ │   0x0000020a      4eaefd24       jsr -0x2dc(a6)
      │ │   0x0000020e      2e4a           movea.l a2, a7
      │ │   0x00000210      202c02b0       move.l 0x2b0(a4), d0
      │ │   0x00000214      6704           beq.b 0x21a
      │ │   0x00000216      2040           movea.l d0, a0
      │ │   0x00000218      4e90           jsr (a0)
      │ │   0x0000021a      4eba0c36       jsr 0xe52(pc)
      │ │   0x0000021e      202c0278       move.l 0x278(a4), d0
      │ │   0x00000222      670c           beq.b 0x230
      │ │   0x00000224      226c0274       movea.l 0x274(a4), a1
      │ │   0x00000228      2c780004       movea.l 0x4.w, a6
      │ │   0x0000022c      4eaeff2e       jsr -0xd2(a6)
      │ │   0x00000230      4aac02b8       tst.l 0x2b8(a4)
      │ │   0x00000234      6720           beq.b 0x256
      │ │   0x00000236      2c6c0258       movea.l 0x258(a4), a6
      │ │   0x0000023a      222c02b4       move.l 0x2b4(a4), d1
      │ │   0x0000023e      6704           beq.b 0x244
      │ │   0x00000240      4eaeffa6       jsr -0x5a(a6)
      │ │   0x00000244      2c780004       movea.l 0x4.w, a6
      │ │   0x00000248      4eaeff7c       jsr -0x84(a6)
      │ │   0x0000024c      226c02b8       movea.l 0x2b8(a4), a1
      │ │   0x00000250      4eaefe86       jsr -0x17a(a6)
      │ │   0x00000254      6012           bra.b 0x268
      │ │   0x00000256      2c780004       movea.l 0x4.w, a6
      │ │   0x0000025a      202c0264       move.l 0x264(a4), d0
      │ │   0x0000025e      6708           beq.b 0x268
      │ │   0x00000260      226c0260       movea.l 0x260(a4), a1
      │ │   0x00000264      4eaeff2e       jsr -0xd2(a6)
      │ │   0x00000268      226c0258       movea.l 0x258(a4), a1
      │ │   0x0000026c      4eaefe62       jsr -0x19e(a6)
      │ │   0x00000270      201f           move.l (a7)+, d0
      └───> 0x00000272      4cdf7f7e       movem.l (a7)+, d1-d6/a0-a6
        │   0x00000276      4e75           rts
        │   0x00000278      646f           bcc.b 0x2e9
        │   0x0000027a      732e           invalid
        │   0x0000027c      6c69           bge.b 0x2e7
        │   0x0000027e      6272           bhi.b 0x2f2
        │   0x00000280      6172           bsr.b 0x2f4
        │   0x00000282      7900           invalid
        │   0x00000284      200f           move.l a7, d0
        │   0x00000286      90bc00000c90   sub.l 0xc90, d0
        │   0x0000028c      b0ac02a4       cmp.l 0x2a4(a4), d0
        │   0x00000290      65000e92       bcs.w 0x1124
        │   0x00000294      9efc0c80       suba.w 0xc80, a7
        │   0x00000298      2f07           move.l d7, -(a7)
        │   0x0000029a      48780064       pea.l 0x64.w
        │   0x0000029e      486f0c24       pea.l 0xc24(a7)
        │   0x000002a2      2f2f0c90       move.l 0xc90(a7), -(a7)
        │   0x000002a6      610018cc       bsr.w 0x1b74
        │   0x000002aa      487803ed       pea.l 0x3ed.w
        │   0x000002ae      486c0000       pea.l 0x0(a4)
        │   0x000002b2      610018a4       bsr.w 0x1b58
        │   0x000002b6      4fef0014       lea.l 0x14(a7), a7
        │   0x000002ba      2e00           move.l d0, d7
        │   0x000002bc      6762           beq.b 0x320
        │   0x000002be      48780001       pea.l 0x1.w
        │   0x000002c2      487800e8       pea.l 0xe8.w
        │   0x000002c6      486f000c       pea.l 0xc(a7)
        │   0x000002ca      2f07           move.l d7, -(a7)
        │   0x000002cc      61001852       bsr.w 0x1b20
        │   0x000002d0      4fef0010       lea.l 0x10(a7), a7
        │   0x000002d4      4a80           tst.l d0
        │   0x000002d6      660c           bne.b 0x2e4
        │   0x000002d8      2f07           move.l d7, -(a7)
        │   0x000002da      61001814       bsr.w 0x1af0
        │   0x000002de      584f           addq.w 0x4, a7
        │   0x000002e0      7000           moveq 0x0, d0
        │   0x000002e2      603c           bra.b 0x320
        │   0x000002e4      486f0004       pea.l 0x4(a7)
        │   0x000002e8      486f0c24       pea.l 0xc24(a7)
        │   0x000002ec      6100184e       bsr.w 0x1b3c
        │   0x000002f0      504f           addq.w 0x8, a7
        │   0x000002f2      4a40           tst.w d0
        │   0x000002f4      67c8           beq.b 0x2be
        │   0x000002f6      41ef0004       lea.l 0x4(a7), a0
        │   0x000002fa      43ec027c       lea.l 0x27c(a4), a1
        │   0x000002fe      12d8           move.b (a0)+, (a1)+
        │   0x00000300      66fc           bne.b 0x2fe
        │   0x00000302      486c027c       pea.l 0x27c(a4)
        │   0x00000306      486c000e       pea.l 0xe(a4)
        │   0x0000030a      486f0bc4       pea.l 0xbc4(a7)
        │   0x0000030e      6100129c       bsr.w 0x15ac
        │   0x00000312      486f0bc8       pea.l 0xbc8(a7)
        │   0x00000316      61000010       bsr.w 0x328
        │   0x0000031a      4fef0010       lea.l 0x10(a7), a7
        │   0x0000031e      609e           bra.b 0x2be
        │   0x00000320      2e1f           move.l (a7)+, d7
        │   0x00000322      defc0c80       adda.w 0xc80, a7
        │   0x00000326      4e75           rts
        │   0x00000328      200f           move.l a7, d0
        │   0x0000032a      90bc00000074   sub.l 0x74, d0
        │   0x00000330      b0ac02a4       cmp.l 0x2a4(a4), d0
        │   0x00000334      65000dee       bcs.w 0x1124
        │   0x00000338      9efc0068       suba.w 0x68, a7
        │   0x0000033c      48e70f34       movem.l d4-d7/a2-a3/a5, -(a7)
        │   0x00000340      2a6f0088       movea.l 0x88(a7), a5
        │   0x00000344      426f0080       clr.w 0x80(a7)
        │   0x00000348      2f3c0000c350   move.l 0xc350, -(a7)
        │   0x0000034e      610010ac       bsr.w 0x13fc
        │   0x00000352      584f           addq.w 0x4, a7
        │   0x00000354      2640           movea.l d0, a3
        │   0x00000356      7e00           moveq 0x0, d7
        │   0x00000358      60000136       bra.w 0x490
        │   0x0000035c      2f07           move.l d7, -(a7)
        │   0x0000035e      486c001c       pea.l 0x1c(a4)
        │   0x00000362      486f0024       pea.l 0x24(a7)
        │   0x00000366      61001244       bsr.w 0x15ac
        │   0x0000036a      487803ed       pea.l 0x3ed.w
        │   0x0000036e      486f002c       pea.l 0x2c(a7)
        │   0x00000372      610017e4       bsr.w 0x1b58
        │   0x00000376      4fef0014       lea.l 0x14(a7), a7
        │   0x0000037a      2c00           move.l d0, d6
        │   0x0000037c      67000110       beq.w 0x48e
        │   0x00000380      2f07           move.l d7, -(a7)
        │   0x00000382      486c0030       pea.l 0x30(a4)
        │   0x00000386      486f0024       pea.l 0x24(a7)
        │   0x0000038a      61001220       bsr.w 0x15ac
        │   0x0000038e      7000           moveq 0x0, d0
        │   0x00000390      2e80           move.l d0, (a7)
        │   0x00000392      2f00           move.l d0, -(a7)
        │   0x00000394      486f002c       pea.l 0x2c(a7)
        │   0x00000398      610004d2       bsr.w 0x86c
        │   0x0000039c      4fef0014       lea.l 0x14(a7), a7
        │   0x000003a0      7a00           moveq 0x0, d5
        │   0x000003a2      603a           bra.b 0x3de
        │   0x000003a4      7000           moveq 0x0, d0
        │   0x000003a6      2f00           move.l d0, -(a7)
        │   0x000003a8      2f00           move.l d0, -(a7)
        │   0x000003aa      486c0048       pea.l 0x48(a4)
        │   0x000003ae      610004bc       bsr.w 0x86c
        │   0x000003b2      2e8d           move.l a5, (a7)
        │   0x000003b4      2f0b           move.l a3, -(a7)
        │   0x000003b6      61000e70       bsr.w 0x1228
        │   0x000003ba      4fef0010       lea.l 0x10(a7), a7
        │   0x000003be      2440           movea.l d0, a2
        │   0x000003c0      4a80           tst.l d0
        │   0x000003c2      671a           beq.b 0x3de
        │   0x000003c4      7000           moveq 0x0, d0
        │   0x000003c6      2f00           move.l d0, -(a7)
        │   0x000003c8      2f00           move.l d0, -(a7)
        │   0x000003ca      2f06           move.l d6, -(a7)
        │   0x000003cc      610017de       bsr.w 0x1bac
        │   0x000003d0      4fef000c       lea.l 0xc(a7), a7
        │   0x000003d4      220a           move.l a2, d1
        │   0x000003d6      928b           sub.l a3, d1
        │   0x000003d8      9084           sub.l d4, d0
        │   0x000003da      d081           add.l d1, d0
        │   0x000003dc      2a00           move.l d0, d5
        │   0x000003de      2f3c0000c350   move.l 0xc350, -(a7)
        │   0x000003e4      2f0b           move.l a3, -(a7)
        │   0x000003e6      2f06           move.l d6, -(a7)
        │   0x000003e8      610017a6       bsr.w 0x1b90
        │   0x000003ec      4fef000c       lea.l 0xc(a7), a7
        │   0x000003f0      2800           move.l d0, d4
        │   0x000003f2      66b0           bne.b 0x3a4
        │   0x000003f4      4a85           tst.l d5
        │   0x000003f6      677c           beq.b 0x474
        │   0x000003f8      42a7           clr.l -(a7)
        │   0x000003fa      48780001       pea.l 0x1.w
        │   0x000003fe      486c004a       pea.l 0x4a(a4)
        │   0x00000402      61000468       bsr.w 0x86c
        │   0x00000406      3f7c0001008c   move.w 0x1, 0x8c(a7)
        │   0x0000040c      7218           moveq 0x18, d1
        │   0x0000040e      9a81           sub.l d1, d5
        │   0x00000410      4878ffff       pea.l 0xffff.w
        │   0x00000414      2f05           move.l d5, -(a7)
        │   0x00000416      2f06           move.l d6, -(a7)
        │   0x00000418      61001792       bsr.w 0x1bac
        │   0x0000041c      4fef0018       lea.l 0x18(a7), a7
        │   0x00000420      41ec0052       lea.l 0x52(a4), a0
        │   0x00000424      6028           bra.b 0x44e
        │   0x00000426      41ef001c       lea.l 0x1c(a7), a0
        │   0x0000042a      2248           movea.l a0, a1
        │   0x0000042c      4a19           tst.b (a1)+
        │   0x0000042e      66fc           bne.b 0x42c
        │   0x00000430      5389           subq.l 0x1, a1
        │   0x00000432      93c8           suba.l a0, a1
        │   0x00000434      2009           move.l a1, d0
        │   0x00000436      4237081b       clr.b 0x1b(a7, d0.l)
        │   0x0000043a      42a7           clr.l -(a7)
        │   0x0000043c      48780001       pea.l 0x1.w
        │   0x00000440      2f08           move.l a0, -(a7)
        │   0x00000442      61000428       bsr.w 0x86c
        │   0x00000446      4fef000c       lea.l 0xc(a7), a7
        │   0x0000044a      41ec0054       lea.l 0x54(a4), a0
        │   0x0000044e      43ef001c       lea.l 0x1c(a7), a1
        │   0x00000452      4211           clr.b (a1)
        │   0x00000454      48780064       pea.l 0x64.w
        │   0x00000458      486f0020       pea.l 0x20(a7)
        │   0x0000045c      2f06           move.l d6, -(a7)
        │   0x0000045e      610016a4       bsr.w 0x1b04
        │   0x00000462      4fef000c       lea.l 0xc(a7), a7
        │   0x00000466      4a80           tst.l d0
        │   0x00000468      671c           beq.b 0x486
        │   0x0000046a      702a           moveq 0x2a, d0
        │   0x0000046c      b02f001c       cmp.b 0x1c(a7), d0
        │   0x00000470      66b4           bne.b 0x426
        │   0x00000472      6012           bra.b 0x486
        │   0x00000474      42a7           clr.l -(a7)
        │   0x00000476      48780001       pea.l 0x1.w
        │   0x0000047a      486c0056       pea.l 0x56(a4)
        │   0x0000047e      610003ec       bsr.w 0x86c
        │   0x00000482      4fef000c       lea.l 0xc(a7), a7
        │   0x00000486      2f06           move.l d6, -(a7)
        │   0x00000488      61001666       bsr.w 0x1af0
        │   0x0000048c      584f           addq.w 0x4, a7
        │   0x0000048e      5287           addq.l 0x1, d7
        │   0x00000490      7020           moveq 0x20, d0
        │   0x00000492      be80           cmp.l d0, d7
        │   0x00000494      6f00fec6       ble.w 0x35c
        │   0x00000498      2f0b           move.l a3, -(a7)
        │   0x0000049a      61000df4       bsr.w 0x1290
        │   0x0000049e      584f           addq.w 0x4, a7
        │   0x000004a0      4a6f0080       tst.w 0x80(a7)
        │   0x000004a4      6622           bne.b 0x4c8
        │   0x000004a6      486c027c       pea.l 0x27c(a4)
        │   0x000004aa      486c0062       pea.l 0x62(a4)
        │   0x000004ae      486f0024       pea.l 0x24(a7)
        │   0x000004b2      610010f8       bsr.w 0x15ac
        │   0x000004b6      4297           clr.l (a7)
        │   0x000004b8      48780001       pea.l 0x1.w
        │   0x000004bc      486f002c       pea.l 0x2c(a7)
        │   0x000004c0      610003aa       bsr.w 0x86c
        │   0x000004c4      4fef0014       lea.l 0x14(a7), a7
        │   0x000004c8      4cdf2cf0       movem.l (a7)+, d4-d7/a2-a3/a5
        │   0x000004cc      defc0068       adda.w 0x68, a7
        │   0x000004d0      4e75           rts
        │   0x000004d2      200f           move.l a7, d0
        │   0x000004d4      90bc00000098   sub.l 0x98, d0
        │   0x000004da      b0ac02a4       cmp.l 0x2a4(a4), d0
        │   0x000004de      65000c44       bcs.w 0x1124
        │   0x000004e2      9efc008c       suba.w 0x8c, a7
        │   0x000004e6      226f0094       movea.l 0x94(a7), a1
        │   0x000004ea      20690004       movea.l 0x4(a1), a0
        │   0x000004ee      1010           move.b (a0), d0
        │   0x000004f0      4880           ext.w d0
        │   0x000004f2      48c0           ext.l d0
        │   0x000004f4      7230           moveq 0x30, d1
        │   0x000004f6      9081           sub.l d1, d0
        │   0x000004f8      2f00           move.l d0, -(a7)
        │   0x000004fa      610000ee       bsr.w 0x5ea
        │   0x000004fe      4297           clr.l (a7)
        │   0x00000500      48780001       pea.l 0x1.w
        │   0x00000504      486c007e       pea.l 0x7e(a4)
        │   0x00000508      61000362       bsr.w 0x86c
        │   0x0000050c      4297           clr.l (a7)
        │   0x0000050e      48780001       pea.l 0x1.w
        │   0x00000512      486c00a6       pea.l 0xa6(a4)
        │   0x00000516      61000354       bsr.w 0x86c
        │   0x0000051a      41ec00ce       lea.l 0xce(a4), a0
        │   0x0000051e      43ef0078       lea.l 0x78(a7), a1
        │   0x00000522      4211           clr.b (a1)
        │   0x00000524      422f0078       clr.b 0x78(a7)
        │   0x00000528      48780028       pea.l 0x28.w
        │   0x0000052c      486f007c       pea.l 0x7c(a7)
        │   0x00000530      486c00d0       pea.l 0xd0(a4)
        │   0x00000534      6100027c       bsr.w 0x7b2
        │   0x00000538      4fef0020       lea.l 0x20(a7), a7
        │   0x0000053c      41ef0064       lea.l 0x64(a7), a0
        │   0x00000540      2248           movea.l a0, a1
        │   0x00000542      4a19           tst.b (a1)+
        │   0x00000544      66fc           bne.b 0x542
        │   0x00000546      5389           subq.l 0x1, a1
        │   0x00000548      93c8           suba.l a0, a1
        │   0x0000054a      2009           move.l a1, d0
        │   0x0000054c      660c           bne.b 0x55a
        │   0x0000054e      61000190       bsr.w 0x6e0
        │   0x00000552      42a7           clr.l -(a7)
        │   0x00000554      6100101a       bsr.w 0x1570
        │   0x00000558      584f           addq.w 0x4, a7
        │   0x0000055a      102f0064       move.b 0x64(a7), d0
        │   0x0000055e      4880           ext.w d0
        │   0x00000560      48c0           ext.l d0
        │   0x00000562      2f00           move.l d0, -(a7)
        │   0x00000564      61001562       bsr.w 0x1ac8
        │   0x00000568      584f           addq.w 0x4, a7
        │   0x0000056a      4a80           tst.l d0
        │   0x0000056c      6712           beq.b 0x580
        │   0x0000056e      486f0064       pea.l 0x64(a7)
        │   0x00000572      486c00e8       pea.l 0xe8(a4)
        │   0x00000576      486f0008       pea.l 0x8(a7)
        │   0x0000057a      61001030       bsr.w 0x15ac
        │   0x0000057e      6020           bra.b 0x5a0
        │   0x00000580      486f0064       pea.l 0x64(a7)
        │   0x00000584      6100fcfe       bsr.w 0x284
        │   0x00000588      4297           clr.l (a7)
        │   0x0000058a      48780001       pea.l 0x1.w
        │   0x0000058e      486c00ee       pea.l 0xee(a4)
        │   0x00000592      610002d8       bsr.w 0x86c
        │   0x00000596      61000148       bsr.w 0x6e0
        │   0x0000059a      4297           clr.l (a7)
        │   0x0000059c      61000fd2       bsr.w 0x1570
        │   0x000005a0      4fef000c       lea.l 0xc(a7), a7
        │   0x000005a4      4857           pea.l (a7)
        │   0x000005a6      6100fd80       bsr.w 0x328
        │   0x000005aa      4297           clr.l (a7)
        │   0x000005ac      48780001       pea.l 0x1.w
        │   0x000005b0      486c00f0       pea.l 0xf0(a4)
        │   0x000005b4      610002b6       bsr.w 0x86c
        │   0x000005b8      61000126       bsr.w 0x6e0
        │   0x000005bc      4fef000c       lea.l 0xc(a7), a7
        │   0x000005c0      defc008c       adda.w 0x8c, a7
        │   0x000005c4      7000           moveq 0x0, d0
        │   0x000005c6      4e75           rts
        │   0x000005c8      00245645       ori.b 0x45, -(a4)
        │   0x000005cc      523a           invalid
        │   0x000005ce      2041           movea.l d1, a0
        │   0x000005d0      6d69           blt.b 0x63b
        │   0x000005d2      786c           moveq 0x6c, d4
        │   0x000005d4      6962           bvs.b 0x638
        │   0x000005d6      2056           movea.l (a6), a0
        │   0x000005d8      312e3120       move.w 0x3120(a6), -(a0)
        │   0x000005dc      2832362d       move.l 0x2d(a2, d3.w), d4
        │   0x000005e0      4d61           invalid
        │   0x000005e2      792d           invalid
        │   0x000005e4      313939322900   move.w 0x39322900.l, -(a0)
        │   0x000005ea      48e7fffe       movem.l d0-d7/a0-a6, -(a7)
        │   0x000005ee      202f0040       move.l 0x40(a7), d0
        │   0x000005f2      d03c0030       add.b 0x30, d0
        │   0x000005f6      13c000000dc6   move.b d0, 0xdc6.l
        │   0x000005fc      13c000000dd2   move.b d0, 0xdd2.l
        │   0x00000602      70ff           moveq 0xff, d0
        │   0x00000604      2c780004       movea.l 0x4.w, a6
        │   0x00000608      4eaefeb6       jsr -0x14a(a6)
        │   0x0000060c      b0bcffffffff   cmp.l 0xffffffff, d0
        │   0x00000612      67ee           beq.b 0x602
        │   0x00000614      207c00000c82   movea.l 0xc82, a0
        │   0x0000061a      13c000000c7a   move.b d0, 0xc7a.l
        │   0x00000620      1140000f       move.b d0, 0xf(a0)
        │   0x00000624      117a07b60009   move.b 0xddc(pc), 0x9(a0)
        │   0x0000062a      117c00040008   move.b 0x4, 0x8(a0)
        │   0x00000630      4228000e       clr.b 0xe(a0)
        │   0x00000634      217c00000d..   move.l 0xdb9, 0xa(a0)
        │   0x0000063c      93c9           suba.l a1, a1
        │   0x0000063e      2c780004       movea.l 0x4.w, a6
        │   0x00000642      4eaefeda       jsr -0x126(a6)
        │   0x00000646      227c00000c82   movea.l 0xc82, a1
        │   0x0000064c      23400010       move.l d0, 0x10(a1)
        │   0x00000650      2c780004       movea.l 0x4.w, a6
        │   0x00000654      4eaefe9e       jsr -0x162(a6)
        │   0x00000658      267c00000ca4   movea.l 0xca4, a3
        │   0x0000065e      177c00050008   move.b 0x5, 0x8(a3)
        │   0x00000664      377c00ec0012   move.w 0xec, 0x12(a3)
        │   0x0000066a      277c00000c..   move.l 0xc82, 0xe(a3)
        │   0x00000672      277cffffff..   move.l 0xffffffff, 0xe4(a3)
        │   0x0000067a      42ab00e8       clr.l 0xe8(a3)
        │   0x0000067e      237c000000..   move.l 0x2, 0xdc(a1)
        │   0x00000686      277c000000..   move.l 0x1, 0xe0(a3)
        │   0x0000068e      227c00000db9   movea.l 0xdb9, a1
        │   0x00000694      244b           movea.l a3, a2
        │   0x00000696      d4fc0014       adda.w 0x14, a2
        │   0x0000069a      610005e6       bsr.w 0xc82
        │   0x0000069e      227c00000dc8   movea.l 0xdc8, a1
        │   0x000006a4      2c780004       movea.l 0x4.w, a6
        │   0x000006a8      4eaefe7a       jsr -0x186(a6)
        │   0x000006ac      4a80           tst.l d0
        │   0x000006ae      67f4           beq.b 0x6a4
        │   0x000006b0      23c000000c7e   move.l d0, 0xc7e.l
        │   0x000006b6      6100009a       bsr.w 0x752
        │   0x000006ba      7200           moveq 0x0, d1
        │   0x000006bc      123a05e0       move.b 0xc9e(pc), d1
        │   0x000006c0      7001           moveq 0x1, d0
        │   0x000006c2      e3a0           asl.l d1, d0
        │   0x000006c4      2c780004       movea.l 0x4.w, a6
        │   0x000006c8      4eaefec2       jsr -0x13e(a6)
        │   0x000006cc      207c00000c82   movea.l 0xc82, a0
        │   0x000006d2      2c780004       movea.l 0x4.w, a6
        │   0x000006d6      4eaefe8c       jsr -0x174(a6)
        │   0x000006da      4cdf7fff       movem.l (a7)+, d0-d7/a0-a6
        │   0x000006de      4e75           rts
        │   0x000006e0      48e7fffe       movem.l d0-d7/a0-a6, -(a7)
        │   0x000006e4      207c00000ca4   movea.l 0xca4, a0
        │   0x000006ea      217c000000..   move.l 0x2, 0xe0(a0)
        │   0x000006f2      615e           bsr.b 0x752
        │   0x000006f4      7200           moveq 0x0, d1
        │   0x000006f6      123a05a6       move.b 0xc9e(pc), d1
        │   0x000006fa      7001           moveq 0x1, d0
        │   0x000006fc      e3a0           asl.l d1, d0
        │   0x000006fe      2c780004       movea.l 0x4.w, a6
        │   0x00000702      4eaefec2       jsr -0x13e(a6)
        │   0x00000706      207c00000c82   movea.l 0xc82, a0
        │   0x0000070c      2c780004       movea.l 0x4.w, a6
        │   0x00000710      4eaefe8c       jsr -0x174(a6)
        │   0x00000714      227c00000c82   movea.l 0xc82, a1
        │   0x0000071a      2c780004       movea.l 0x4.w, a6
        │   0x0000071e      4eaefe98       jsr -0x168(a6)
        │   0x00000722      207c00000c82   movea.l 0xc82, a0
        │   0x00000728      217cffffff..   move.l 0xffffffff, 0x10(a0)
        │   0x00000730      217cffffff..   move.l 0xffffffff, 0x14(a0)
        │   0x00000738      7000           moveq 0x0, d0
        │   0x0000073a      103a0562       move.b 0xc9e(pc), d0
        │   0x0000073e      2c780004       movea.l 0x4.w, a6
        │   0x00000742      4eaefeb0       jsr -0x150(a6)
        │   0x00000746      42b900000c7e   clr.l 0xc7e.l
        │   0x0000074c      4cdf7fff       movem.l (a7)+, d0-d7/a0-a6
        │   0x00000750      4e75           rts
        │   0x00000752      48e7fffe       movem.l d0-d7/a0-a6, -(a7)
        │   0x00000756      207a054a       movea.l 0xca2(pc), a0
        │   0x0000075a      227c00000ca4   movea.l 0xca4, a1
        │   0x00000760      2c780004       movea.l 0x4.w, a6
        │   0x00000764      4eaefe92       jsr -0x16e(a6)
        │   0x00000768      4cdf7fff       movem.l (a7)+, d0-d7/a0-a6
        │   0x0000076c      4e75           rts
        │   0x0000076e      48e77ffe       movem.l d1-d7/a0-a6, -(a7)
        │   0x00000772      226f003c       movea.l 0x3c(a7), a1
        │   0x00000776      7009           moveq 0x9, d0
        │   0x00000778      222f0040       move.l 0x40(a7), d1
        │   0x0000077c      61000418       bsr.w 0xb96
        │   0x00000780      4cdf7ffe       movem.l (a7)+, d1-d7/a0-a6
        │   0x00000784      4e75           rts
        │   0x00000786      48e77ffe       movem.l d1-d7/a0-a6, -(a7)
        │   0x0000078a      226f003c       movea.l 0x3c(a7), a1
        │   0x0000078e      7008           moveq 0x8, d0
        │   0x00000790      7200           moveq 0x0, d1
        │   0x00000792      61000402       bsr.w 0xb96
        │   0x00000796      4cdf7ffe       movem.l (a7)+, d1-d7/a0-a6
        │   0x0000079a      4e75           rts
        │   0x0000079c      48e77ffe       movem.l d1-d7/a0-a6, -(a7)
        │   0x000007a0      226f003c       movea.l 0x3c(a7), a1
        │   0x000007a4      7007           moveq 0x7, d0
        │   0x000007a6      7200           moveq 0x0, d1
        │   0x000007a8      610003ec       bsr.w 0xb96
        │   0x000007ac      4cdf7ffe       movem.l (a7)+, d1-d7/a0-a6
        │   0x000007b0      4e75           rts
        │   0x000007b2      48e77ffe       movem.l d1-d7/a0-a6, -(a7)
        │   0x000007b6      226f003c       movea.l 0x3c(a7), a1
        │   0x000007ba      246f0040       movea.l 0x40(a7), a2
        │   0x000007be      7005           moveq 0x5, d0
        │   0x000007c0      222f0044       move.l 0x44(a7), d1
        │   0x000007c4      b3fc00000000   cmpa.l 0x0, a1
        │   0x000007ca      6706           beq.b 0x7d2
        │   0x000007cc      6100045c       bsr.w 0xc2a
        │   0x000007d0      6012           bra.b 0x7e4
        │   0x000007d2      224a           movea.l a2, a1
        │   0x000007d4      247c00000ca4   movea.l 0xca4, a2
        │   0x000007da      d4fc0014       adda.w 0x14, a2
        │   0x000007de      4212           clr.b (a2)
        │   0x000007e0      610003fc       bsr.w 0xbde
        │   0x000007e4      4cdf7ffe       movem.l (a7)+, d1-d7/a0-a6
        │   0x000007e8      4e75           rts
        │   0x000007ea      48e7fffe       movem.l d0-d7/a0-a6, -(a7)
        │   0x000007ee      202f0040       move.l 0x40(a7), d0
        │   0x000007f2      226f0044       movea.l 0x44(a7), a1
        │   0x000007f6      7201           moveq 0x1, d1
        │   0x000007f8      610003e4       bsr.w 0xbde
        │   0x000007fc      4cdf7fff       movem.l (a7)+, d0-d7/a0-a6
        │   0x00000800      4e75           rts
        │   0x00000802      48e7fffe       movem.l d0-d7/a0-a6, -(a7)
        │   0x00000806      202f0040       move.l 0x40(a7), d0
        │   0x0000080a      226f0044       movea.l 0x44(a7), a1
        │   0x0000080e      b3fc00000000   cmpa.l 0x0, a1
        │   0x00000814      6606           bne.b 0x81c
        │   0x00000816      227c00000dd4   movea.l 0xdd4, a1
        │   0x0000081c      7200           moveq 0x0, d1
        │   0x0000081e      61000376       bsr.w 0xb96
        │   0x00000822      4cdf7fff       movem.l (a7)+, d0-d7/a0-a6
        │   0x00000826      4e75           rts
        │   0x00000828      48e77ffe       movem.l d1-d7/a0-a6, -(a7)
        │   0x0000082c      7006           moveq 0x6, d0
        │   0x0000082e      7200           moveq 0x0, d1
        │   0x00000830      226f003c       movea.l 0x3c(a7), a1
        │   0x00000834      b3fc00000000   cmpa.l 0x0, a1
        │   0x0000083a      660e           bne.b 0x84a
        │   0x0000083c      247c00000ca4   movea.l 0xca4, a2
        │   0x00000842      d4fc0014       adda.w 0x14, a2
        │   0x00000846      4212           clr.b (a2)
        │   0x00000848      224a           movea.l a2, a1
        │   0x0000084a      6100034a       bsr.w 0xb96
        │   0x0000084e      70ff           moveq 0xff, d0
        │   0x00000850      247c00000ca4   movea.l 0xca4, a2
        │   0x00000856      0caaffffff..   cmpi.l 0xffffffff, 0xdc(a2)
        │   0x0000085e      6706           beq.b 0x866
        │   0x00000860      7000           moveq 0x0, d0
        │   0x00000862      102a0014       move.b 0x14(a2), d0
        │   0x00000866      4cdf7ffe       movem.l (a7)+, d1-d7/a0-a6
        │   0x0000086a      4e75           rts
        │   0x0000086c      48e77ffe       movem.l d1-d7/a0-a6, -(a7)
        │   0x00000870      226f003c       movea.l 0x3c(a7), a1
        │   0x00000874      6100041a       bsr.w 0xc90
        │   0x00000878      b0bc00000050   cmp.l 0x50, d0
        │   0x0000087e      6b00001a       bmi.w 0x89a
        │   0x00000882      222f0040       move.l 0x40(a7), d1
        │   0x00000886      7404           moveq 0x4, d2
        │   0x00000888      0caf000000..   cmpi.l 0x1, 0x44(a7)
        │   0x00000890      6602           bne.b 0x894
        │   0x00000892      740a           moveq 0xa, d2
        │   0x00000894      6120           bsr.b 0x8b6
        │   0x00000896      6000ffdc       bra.w 0x874
        │   0x0000089a      222f0040       move.l 0x40(a7), d1
        │   0x0000089e      7404           moveq 0x4, d2
        │   0x000008a0      0caf000000..   cmpi.l 0x1, 0x44(a7)
        │   0x000008a8      6602           bne.b 0x8ac
        │   0x000008aa      740a           moveq 0xa, d2
        │   0x000008ac      6108           bsr.b 0x8b6
        │   0x000008ae      7000           moveq 0x0, d0
        │   0x000008b0      4cdf7ffe       movem.l (a7)+, d1-d7/a0-a6
        │   0x000008b4      4e75           rts
        │   0x000008b6      247c00000ca4   movea.l 0xca4, a2
        │   0x000008bc      254100dc       move.l d1, 0xdc(a2)
        │   0x000008c0      254200e0       move.l d2, 0xe0(a2)
        │   0x000008c4      d4fc0014       adda.w 0x14, a2
        │   0x000008c8      704f           moveq 0x4f, d0
        │   0x000008ca      610003b6       bsr.w 0xc82
        │   0x000008ce      2f09           move.l a1, -(a7)
        │   0x000008d0      6100fe80       bsr.w 0x752
        │   0x000008d4      207c00000c82   movea.l 0xc82, a0
        │   0x000008da      2c780004       movea.l 0x4.w, a6
        │   0x000008de      4eaefe80       jsr -0x180(a6)
        │   0x000008e2      207c00000c82   movea.l 0xc82, a0
        │   0x000008e8      2c780004       movea.l 0x4.w, a6
        │   0x000008ec      4eaefe8c       jsr -0x174(a6)
        │   0x000008f0      4a80           tst.l d0
        │   0x000008f2      67e0           beq.b 0x8d4
        │   0x000008f4      225f           movea.l (a7)+, a1
        │   0x000008f6      4e75           rts
        │   0x000008f8      48e7fffe       movem.l d0-d7/a0-a6, -(a7)
        │   0x000008fc      206f0040       movea.l 0x40(a7), a0
        │   0x00000900      2010           move.l (a0), d0
        │   0x00000902      80fc05b5       divu.w 0x5b5, d0
        │   0x00000906      e548           lsl.w 0x2, d0
        │   0x00000908      3f00           move.w d0, -(a7)
        │   0x0000090a      4240           clr.w d0
        │   0x0000090c      4840           swap d0
        │   0x0000090e      b07c0315       cmp.w 0x315, d0
        │   0x00000912      67000116       beq.w 0xa2a
        │   0x00000916      6502           bcs.b 0x91a
        │   0x00000918      5340           subq.w 0x1, d0
        │   0x0000091a      80fc016d       divu.w 0x16d, d0
        │   0x0000091e      2200           move.l d0, d1
        │   0x00000920      4841           swap d1
        │   0x00000922      b07c0004       cmp.w 0x4, d0
        │   0x00000926      6502           bcs.b 0x92a
        │   0x00000928      5340           subq.w 0x1, d0
        │   0x0000092a      d157           add.w d0, (a7)
        │   0x0000092c      43fa010a       lea.l 0xa38(pc), a1
        │   0x00000930      7018           moveq 0x18, d0
        │   0x00000932      5540           subq.w 0x2, d0
        │   0x00000934      34310000       move.w (a1, d0.w), d2
        │   0x00000938      b242           cmp.w d2, d1
        │   0x0000093a      6404           bcc.b 0x940
        │   0x0000093c      4a40           tst.w d0
        │   0x0000093e      66f2           bne.b 0x932
        │   0x00000940      e248           lsr.w 0x1, d0
        │   0x00000942      5240           addq.w 0x1, d0
        │   0x00000944      3f00           move.w d0, -(a7)
        │   0x00000946      9242           sub.w d2, d1
        │   0x00000948      5241           addq.w 0x1, d1
        │   0x0000094a      3f01           move.w d1, -(a7)
        │   0x0000094c      7000           moveq 0x0, d0
        │   0x0000094e      302f0004       move.w 0x4(a7), d0
        │   0x00000952      d07c004e       add.w 0x4e, d0
        │   0x00000956      80fc0064       divu.w 0x64, d0
        │   0x0000095a      4840           swap d0
        │   0x0000095c      3f400004       move.w d0, 0x4(a7)
        │   0x00000960      341f           move.w (a7)+, d2
        │   0x00000962      321f           move.w (a7)+, d1
        │   0x00000964      301f           move.w (a7)+, d0
        │   0x00000966      48c2           ext.l d2
        │   0x00000968      48c1           ext.l d1
        │   0x0000096a      48c0           ext.l d0
        │   0x0000096c      206f0044       movea.l 0x44(a7), a0
        │   0x00000970      b4bc00000009   cmp.l 0x9, d2
        │   0x00000976      6204           bhi.b 0x97c
        │   0x00000978      10fc0030       move.b 0x30, (a0)+
        │   0x0000097c      2f08           move.l a0, -(a7)
        │   0x0000097e      2f02           move.l d2, -(a7)
        │   0x00000980      61000180       bsr.w 0xb02
        │   0x00000984      508f           addq.l 0x8, a7
        │   0x00000986      206f0044       movea.l 0x44(a7), a0
        │   0x0000098a      5488           addq.l 0x2, a0
        │   0x0000098c      0caf000000..   cmpi.l 0x2, 0x48(a7)
        │   0x00000994      6710           beq.b 0x9a6
        │   0x00000996      0caf000000..   cmpi.l 0x3, 0x48(a7)
        │   0x0000099e      6706           beq.b 0x9a6
        │   0x000009a0      10fc002d       move.b 0x2d, (a0)+
        │   0x000009a4      6004           bra.b 0x9aa
        │   0x000009a6      10fc002f       move.b 0x2f, (a0)+
        │   0x000009aa      4aaf0048       tst.l 0x48(a7)
        │   0x000009ae      6724           beq.b 0x9d4
        │   0x000009b0      0caf000000..   cmpi.l 0x2, 0x48(a7)
        │   0x000009b8      671a           beq.b 0x9d4
        │   0x000009ba      227c00000a2c   movea.l 0xa2c, a1
        │   0x000009c0      5381           subq.l 0x1, d1
        │   0x000009c2      c2fc0003       mulu.w 0x3, d1
        │   0x000009c6      d3c1           adda.l d1, a1
        │   0x000009c8      20d1           move.l (a1), (a0)+
        │   0x000009ca      5388           subq.l 0x1, a0
        │   0x000009cc      206f0044       movea.l 0x44(a7), a0
        │   0x000009d0      5c88           addq.l 0x6, a0
        │   0x000009d2      601c           bra.b 0x9f0
        │   0x000009d4      b2bc00000009   cmp.l 0x9, d1
        │   0x000009da      6204           bhi.b 0x9e0
        │   0x000009dc      10fc0030       move.b 0x30, (a0)+
        │   0x000009e0      2f08           move.l a0, -(a7)
        │   0x000009e2      2f01           move.l d1, -(a7)
        │   0x000009e4      6100011c       bsr.w 0xb02
        │   0x000009e8      508f           addq.l 0x8, a7
        │   0x000009ea      206f0044       movea.l 0x44(a7), a0
        │   0x000009ee      5a88           addq.l 0x5, a0
        │   0x000009f0      0caf000000..   cmpi.l 0x2, 0x48(a7)
        │   0x000009f8      6710           beq.b 0xa0a
        │   0x000009fa      0caf000000..   cmpi.l 0x3, 0x48(a7)
        │   0x00000a02      6706           beq.b 0xa0a
        │   0x00000a04      10fc002d       move.b 0x2d, (a0)+
        │   0x00000a08      6004           bra.b 0xa0e
        │   0x00000a0a      10fc002f       move.b 0x2f, (a0)+
        │   0x00000a0e      b0bc00000009   cmp.l 0x9, d0
        │   0x00000a14      6204           bhi.b 0xa1a
        │   0x00000a16      10fc0030       move.b 0x30, (a0)+
        │   0x00000a1a      2f08           move.l a0, -(a7)
        │   0x00000a1c      2f00           move.l d0, -(a7)
        │   0x00000a1e      610000e2       bsr.w 0xb02
        │   0x00000a22      508f           addq.l 0x8, a7
        │   0x00000a24      4cdf7fff       movem.l (a7)+, d0-d7/a0-a6
        │   0x00000a28      4e75           rts
        │   0x00000a2a      5457           addq.w 0x2, (a7)
        │   0x00000a2c      3f3c0002       move.w 0x2, -(a7)
        │   0x00000a30      3f3c001d       move.w 0x1d, -(a7)
        │   0x00000a34      6000ff16       bra.w 0x94c
        │   0x00000a38      0000001f       ori.b 0x1f, d0
        │   0x00000a3c      003b           invalid
        │   0x00000a3e      005a0078       ori.w 0x78, (a2)+
        │   0x00000a42      009700b500d4   ori.l 0xb500d4, (a7)
        │   0x00000a48      00f3           invalid
        │   0x00000a4a      0111           btst.l d0, (a1)
        │   0x00000a4c      0130014e       btst.l d0, ([a0])
        │   0x00000a50      4a61           tst.w -(a1)
        │   0x00000a52      6e46           bgt.b 0xa9a
        │   0x00000a54      6562           bcs.b 0xab8
        │   0x00000a56      4d61           invalid
        │   0x00000a58      7241           moveq 0x41, d1
        │   0x00000a5a      7072           moveq 0x72, d0
        │   0x00000a5c      4d61           invalid
        │   0x00000a5e      794a           invalid
        │   0x00000a60      756e           invalid
        │   0x00000a62      4a756c41       tst.w 0x41(a5, d6.l)
        │   0x00000a66      7567           invalid
        │   0x00000a68      5365           subq.w 0x1, -(a5)
        │   0x00000a6a      704f           moveq 0x4f, d0
        │   0x00000a6c      6374           bls.b 0xae2
        │   0x00000a6e      4e6f           move usp, a7
        │   0x00000a70      7644           moveq 0x44, d3
        │   0x00000a72      6563           bcs.b 0xad7
        │   0x00000a74      48e7fffe       movem.l d0-d7/a0-a6, -(a7)
        │   0x00000a78      206f0040       movea.l 0x40(a7), a0
        │   0x00000a7c      20280004       move.l 0x4(a0), d0
        │   0x00000a80      723c           moveq 0x3c, d1
        │   0x00000a82      80c1           divu.w d1, d0
        │   0x00000a84      3f00           move.w d0, -(a7)
        │   0x00000a86      4840           swap d0
        │   0x00000a88      3f00           move.w d0, -(a7)
        │   0x00000a8a      20280008       move.l 0x8(a0), d0
        │   0x00000a8e      80c1           divu.w d1, d0
        │   0x00000a90      c0bc0000ffff   and.l 0xffff, d0
        │   0x00000a96      321f           move.w (a7)+, d1
        │   0x00000a98      341f           move.w (a7)+, d2
        │   0x00000a9a      48c1           ext.l d1
        │   0x00000a9c      48c2           ext.l d2
        │   0x00000a9e      206f0044       movea.l 0x44(a7), a0
        │   0x00000aa2      b4bc00000009   cmp.l 0x9, d2
        │   0x00000aa8      6204           bhi.b 0xaae
        │   0x00000aaa      10fc0030       move.b 0x30, (a0)+
        │   0x00000aae      2f08           move.l a0, -(a7)
        │   0x00000ab0      2f02           move.l d2, -(a7)
        │   0x00000ab2      614e           bsr.b 0xb02
        │   0x00000ab4      508f           addq.l 0x8, a7
        │   0x00000ab6      206f0044       movea.l 0x44(a7), a0
        │   0x00000aba      5488           addq.l 0x2, a0
        │   0x00000abc      10fc003a       move.b 0x3a, (a0)+
        │   0x00000ac0      b2bc00000009   cmp.l 0x9, d1
        │   0x00000ac6      6204           bhi.b 0xacc
        │   0x00000ac8      10fc0030       move.b 0x30, (a0)+
        │   0x00000acc      2f08           move.l a0, -(a7)
        │   0x00000ace      2f01           move.l d1, -(a7)
        │   0x00000ad0      6130           bsr.b 0xb02
        │   0x00000ad2      508f           addq.l 0x8, a7
        │   0x00000ad4      0caf000000..   cmpi.l 0x1, 0x48(a7)
        │   0x00000adc      671e           beq.b 0xafc
        │   0x00000ade      206f0044       movea.l 0x44(a7), a0
        │   0x00000ae2      5a88           addq.l 0x5, a0
        │   0x00000ae4      10fc003a       move.b 0x3a, (a0)+
        │   0x00000ae8      b0bc00000009   cmp.l 0x9, d0
        │   0x00000aee      6204           bhi.b 0xaf4
        │   0x00000af0      10fc0030       move.b 0x30, (a0)+
        │   0x00000af4      2f08           move.l a0, -(a7)
        │   0x00000af6      2f00           move.l d0, -(a7)
        │   0x00000af8      6108           bsr.b 0xb02
        │   0x00000afa      508f           addq.l 0x8, a7
        │   0x00000afc      4cdf7fff       movem.l (a7)+, d0-d7/a0-a6
        │   0x00000b00      4e75           rts
        │   0x00000b02      48e7fffe       movem.l d0-d7/a0-a6, -(a7)
        │   0x00000b06      202f0040       move.l 0x40(a7), d0
        │   0x00000b0a      206f0044       movea.l 0x44(a7), a0
        │   0x00000b0e      227c00000d90   movea.l 0xd90, a1
        │   0x00000b14      720a           moveq 0xa, d1
        │   0x00000b16      7600           moveq 0x0, d3
        │   0x00000b18      4a80           tst.l d0
        │   0x00000b1a      6a06           bpl.b 0xb22
        │   0x00000b1c      10fc002d       move.b 0x2d, (a0)+
        │   0x00000b20      4480           neg.l d0
        │   0x00000b22      b091           cmp.l (a1), d0
        │   0x00000b24      640c           bcc.b 0xb32
        │   0x00000b26      5889           addq.l 0x4, a1
        │   0x00000b28      5381           subq.l 0x1, d1
        │   0x00000b2a      0c8100000001   cmpi.l 0x1, d1
        │   0x00000b30      66f0           bne.b 0xb22
        │   0x00000b32      10bc0030       move.b 0x30, (a0)
        │   0x00000b36      5283           addq.l 0x1, d3
        │   0x00000b38      9091           sub.l (a1), d0
        │   0x00000b3a      6504           bcs.b 0xb40
        │   0x00000b3c      5210           addq.b 0x1, (a0)
        │   0x00000b3e      60f8           bra.b 0xb38
        │   0x00000b40      d091           add.l (a1), d0
        │   0x00000b42      5889           addq.l 0x4, a1
        │   0x00000b44      5381           subq.l 0x1, d1
        │   0x00000b46      6704           beq.b 0xb4c
        │   0x00000b48      5288           addq.l 0x1, a0
        │   0x00000b4a      60e6           bra.b 0xb32
        │   0x00000b4c      5288           addq.l 0x1, a0
        │   0x00000b4e      4210           clr.b (a0)
        │   0x00000b50      4cdf7fff       movem.l (a7)+, d0-d7/a0-a6
        │   0x00000b54      4e75           rts
        │   0x00000b56      48e77ffe       movem.l d1-d7/a0-a6, -(a7)
        │   0x00000b5a      206f003c       movea.l 0x3c(a7), a0
        │   0x00000b5e      7000           moveq 0x0, d0
        │   0x00000b60      7200           moveq 0x0, d1
        │   0x00000b62      7400           moveq 0x0, d2
        │   0x00000b64      1418           move.b (a0)+, d2
        │   0x00000b66      b43c002b       cmp.b 0x2b, d2
        │   0x00000b6a      670c           beq.b 0xb78
        │   0x00000b6c      b43c002d       cmp.b 0x2d, d2
        │   0x00000b70      6604           bne.b 0xb76
        │   0x00000b72      7201           moveq 0x1, d1
        │   0x00000b74      6002           bra.b 0xb78
        │   0x00000b76      5388           subq.l 0x1, a0
        │   0x00000b78      1418           move.b (a0)+, d2
        │   0x00000b7a      4a02           tst.b d2
        │   0x00000b7c      670c           beq.b 0xb8a
        │   0x00000b7e      c43c000f       and.b 0xf, d2
        │   0x00000b82      c0fc000a       mulu.w 0xa, d0
        │   0x00000b86      d082           add.l d2, d0
        │   0x00000b88      60ee           bra.b 0xb78
        │   0x00000b8a      4a81           tst.l d1
        │   0x00000b8c      6702           beq.b 0xb90
        │   0x00000b8e      4480           neg.l d0
        │   0x00000b90      4cdf7ffe       movem.l (a7)+, d1-d7/a0-a6
        │   0x00000b94      4e75           rts
        │   0x00000b96      247c00000ca4   movea.l 0xca4, a2
        │   0x00000b9c      254000e0       move.l d0, 0xe0(a2)
        │   0x00000ba0      254100dc       move.l d1, 0xdc(a2)
        │   0x00000ba4      d4fc0014       adda.w 0x14, a2
        │   0x00000ba8      203c000000c7   move.l 0xc7, d0
        │   0x00000bae      610000d2       bsr.w 0xc82
        │   0x00000bb2      6100fb9e       bsr.w 0x752
        │   0x00000bb6      207c00000c82   movea.l 0xc82, a0
        │   0x00000bbc      2c780004       movea.l 0x4.w, a6
        │   0x00000bc0      4eaefe80       jsr -0x180(a6)
        │   0x00000bc4      207c00000c82   movea.l 0xc82, a0
        │   0x00000bca      2c780004       movea.l 0x4.w, a6
        │   0x00000bce      4eaefe8c       jsr -0x174(a6)
        │   0x00000bd2      4a80           tst.l d0
        │   0x00000bd4      67e6           beq.b 0xbbc
        │   0x00000bd6      2240           movea.l d0, a1
        │   0x00000bd8      202900dc       move.l 0xdc(a1), d0
        │   0x00000bdc      4e75           rts
        │   0x00000bde      2f09           move.l a1, -(a7)
        │   0x00000be0      247c00000ca4   movea.l 0xca4, a2
        │   0x00000be6      254000e0       move.l d0, 0xe0(a2)
        │   0x00000bea      254100dc       move.l d1, 0xdc(a2)
        │   0x00000bee      6100fb62       bsr.w 0x752
        │   0x00000bf2      207c00000c82   movea.l 0xc82, a0
        │   0x00000bf8      2c780004       movea.l 0x4.w, a6
        │   0x00000bfc      4eaefe80       jsr -0x180(a6)
        │   0x00000c00      207c00000c82   movea.l 0xc82, a0
        │   0x00000c06      2c780004       movea.l 0x4.w, a6
        │   0x00000c0a      4eaefe8c       jsr -0x174(a6)
        │   0x00000c0e      4a80           tst.l d0
        │   0x00000c10      67e6           beq.b 0xbf8
        │   0x00000c12      2240           movea.l d0, a1
        │   0x00000c14      245f           movea.l (a7)+, a2
        │   0x00000c16      2f2900dc       move.l 0xdc(a1), -(a7)
        │   0x00000c1a      d2fc0014       adda.w 0x14, a1
        │   0x00000c1e      203c000000c7   move.l 0xc7, d0
        │   0x00000c24      615c           bsr.b 0xc82
        │   0x00000c26      201f           move.l (a7)+, d0
        │   0x00000c28      4e75           rts
        │   0x00000c2a      2f0a           move.l a2, -(a7)
        │   0x00000c2c      247c00000ca4   movea.l 0xca4, a2
        │   0x00000c32      254000e0       move.l d0, 0xe0(a2)
        │   0x00000c36      254100dc       move.l d1, 0xdc(a2)
        │   0x00000c3a      d4fc0014       adda.w 0x14, a2
        │   0x00000c3e      203c000000c7   move.l 0xc7, d0
        │   0x00000c44      613c           bsr.b 0xc82
        │   0x00000c46      6100fb0a       bsr.w 0x752
        │   0x00000c4a      207c00000c82   movea.l 0xc82, a0
        │   0x00000c50      2c780004       movea.l 0x4.w, a6
        │   0x00000c54      4eaefe80       jsr -0x180(a6)
        │   0x00000c58      207c00000c82   movea.l 0xc82, a0
        │   0x00000c5e      2c780004       movea.l 0x4.w, a6
        │   0x00000c62      4eaefe8c       jsr -0x174(a6)
        │   0x00000c66      4a80           tst.l d0
        │   0x00000c68      67e6           beq.b 0xc50
        │   0x00000c6a      2240           movea.l d0, a1
        │   0x00000c6c      245f           movea.l (a7)+, a2
        │   0x00000c6e      2f2900dc       move.l 0xdc(a1), -(a7)
        │   0x00000c72      d2fc0014       adda.w 0x14, a1
        │   0x00000c76      203c000000c7   move.l 0xc7, d0
        │   0x00000c7c      6104           bsr.b 0xc82
        │   0x00000c7e      201f           move.l (a7)+, d0
        │   0x00000c80      4e75           rts
        │   0x00000c82      4a11           tst.b (a1)
        │   0x00000c84      6706           beq.b 0xc8c
        │   0x00000c86      14d9           move.b (a1)+, (a2)+
        │   0x00000c88      51c8fff8       dbra d0, 0xc82
        │   0x00000c8c      4212           clr.b (a2)
        │   0x00000c8e      4e75           rts
        │   0x00000c90      2f09           move.l a1, -(a7)
        │   0x00000c92      70ff           moveq 0xff, d0
        │   0x00000c94      5280           addq.l 0x1, d0
        │   0x00000c96      4a19           tst.b (a1)+
        │   0x00000c98      66fa           bne.b 0xc94
        │   0x00000c9a      225f           movea.l (a7)+, a1
        │   0x00000c9c      4e75           rts
        │   0x00000c9e      00000000       ori.b 0x0, d0
        │   0x00000ca2      00000000       ori.b 0x0, d0
        │   0x00000ca6      00000000       ori.b 0x0, d0
        │   0x00000caa      00000000       ori.b 0x0, d0
        │   0x00000cae      00000000       ori.b 0x0, d0
        │   0x00000cb2      00000000       ori.b 0x0, d0
        │   0x00000cb6      00000000       ori.b 0x0, d0
        │   0x00000cba      00000000       ori.b 0x0, d0
        │   0x00000cbe      00000000       ori.b 0x0, d0
        │   0x00000cc2      00000000       ori.b 0x0, d0
        │   0x00000cc6      00000000       ori.b 0x0, d0
        │   0x00000cca      00000000       ori.b 0x0, d0
        │   0x00000cce      00000000       ori.b 0x0, d0
        │   0x00000cd2      00000000       ori.b 0x0, d0
        │   0x00000cd6      00000000       ori.b 0x0, d0
        │   0x00000cda      00000000       ori.b 0x0, d0
        │   0x00000cde      00000000       ori.b 0x0, d0
        │   0x00000ce2      00000000       ori.b 0x0, d0
        │   0x00000ce6      00000000       ori.b 0x0, d0
        │   0x00000cea      00000000       ori.b 0x0, d0
        │   0x00000cee      00000000       ori.b 0x0, d0
        │   0x00000cf2      00000000       ori.b 0x0, d0
        │   0x00000cf6      00000000       ori.b 0x0, d0
        │   0x00000cfa      00000000       ori.b 0x0, d0
        │   0x00000cfe      00000000       ori.b 0x0, d0
        │   0x00000d02      00000000       ori.b 0x0, d0
        │   0x00000d06      00000000       ori.b 0x0, d0
        │   0x00000d0a      00000000       ori.b 0x0, d0
        │   0x00000d0e      00000000       ori.b 0x0, d0
        │   0x00000d12      00000000       ori.b 0x0, d0
        │   0x00000d16      00000000       ori.b 0x0, d0
        │   0x00000d1a      00000000       ori.b 0x0, d0
        │   0x00000d1e      00000000       ori.b 0x0, d0
        │   0x00000d22      00000000       ori.b 0x0, d0
        │   0x00000d26      00000000       ori.b 0x0, d0
        │   0x00000d2a      00000000       ori.b 0x0, d0
        │   0x00000d2e      00000000       ori.b 0x0, d0
        │   0x00000d32      00000000       ori.b 0x0, d0
        │   0x00000d36      00000000       ori.b 0x0, d0
        │   0x00000d3a      00000000       ori.b 0x0, d0
        │   0x00000d3e      00000000       ori.b 0x0, d0
        │   0x00000d42      00000000       ori.b 0x0, d0
        │   0x00000d46      00000000       ori.b 0x0, d0
        │   0x00000d4a      00000000       ori.b 0x0, d0
        │   0x00000d4e      00000000       ori.b 0x0, d0
        │   0x00000d52      00000000       ori.b 0x0, d0
        │   0x00000d56      00000000       ori.b 0x0, d0
        │   0x00000d5a      00000000       ori.b 0x0, d0
        │   0x00000d5e      00000000       ori.b 0x0, d0
        │   0x00000d62      00000000       ori.b 0x0, d0
        │   0x00000d66      00000000       ori.b 0x0, d0
        │   0x00000d6a      00000000       ori.b 0x0, d0
        │   0x00000d6e      00000000       ori.b 0x0, d0
        │   0x00000d72      00000000       ori.b 0x0, d0
        │   0x00000d76      00000000       ori.b 0x0, d0
        │   0x00000d7a      00000000       ori.b 0x0, d0
        │   0x00000d7e      00000000       ori.b 0x0, d0
        │   0x00000d82      00000000       ori.b 0x0, d0
        │   0x00000d86      00000000       ori.b 0x0, d0
        │   0x00000d8a      00000000       ori.b 0x0, d0
        │   0x00000d8e      00000000       ori.b 0x0, d0
        │   0x00000d92      00000000       ori.b 0x0, d0
        │   0x00000d96      00000000       ori.b 0x0, d0
        │   0x00000d9a      00000000       ori.b 0x0, d0
        │   0x00000d9e      00000000       ori.b 0x0, d0
        │   0x00000da2      00000000       ori.b 0x0, d0
        │   0x00000da6      00000000       ori.b 0x0, d0
        │   0x00000daa      00000000       ori.b 0x0, d0
        │   0x00000dae      00000000       ori.b 0x0, d0
        │   0x00000db2      00003b9a       ori.b 0x9a, d0
        │   0x00000db6      ca00           and.b d0, d5
        │   0x00000db8      05f5e100       bset.b d2, (a5, a6.w)
        │   0x00000dbc      00989680000f   ori.l 0x9680000f, (a0)+
        │   0x00000dc2      4240           clr.w d0
        │   0x00000dc4      000186a0       ori.b 0xa0, d1
        │   0x00000dc8      00002710       ori.b 0x10, d0
        │   0x00000dcc      000003e8       ori.b 0xe8, d0
        │   0x00000dd0      00000064       ori.b 0x64, d0
        │   0x00000dd4      0000000a       ori.b 0xa, d0
        │   0x00000dd8      00000001       ori.b 0x1, d0
        │   0x00000ddc      00446f6f       ori.w 0x6f6f, d4
        │   0x00000de0      7252           moveq 0x52, d1
        │   0x00000de2      6570           bcs.b 0xe54
        │   0x00000de4      6c79           bge.b 0xe5f
        │   0x00000de6      506f7274       addq.w 0x8, 0x7274(a7)
        │   0x00000dea      00004145       ori.b 0x45, d0
        │   0x00000dee      446f6f72       neg.w 0x6f72(a7)
        │   0x00000df2      506f7274       addq.w 0x8, 0x7274(a7)
        │   0x00000df6      00000000       ori.b 0x0, d0
        │   0x00000dfa      00002f07       ori.b 0x7, d0
        │   0x00000dfe      7e00           moveq 0x0, d7
        │   0x00000e00      6014           bra.b 0xe16
        │   0x00000e02      4a2c02c4       tst.b 0x2c4(a4)
        │   0x00000e06      6604           bne.b 0xe0c
        │   0x00000e08      4a87           tst.l d7
        │   0x00000e0a      660a           bne.b 0xe16
        │   0x00000e0c      226c020c       movea.l 0x20c(a4), a1
        │   0x00000e10      2051           movea.l (a1), a0
        │   0x00000e12      4e90           jsr (a0)
        │   0x00000e14      2e00           move.l d0, d7
        │   0x00000e16      58ac020c       addq.l 0x4, 0x20c(a4)
        │   0x00000e1a      206c020c       movea.l 0x20c(a4), a0
        │   0x00000e1e      4a90           tst.l (a0)
        │   0x00000e20      66e0           bne.b 0xe02
        │   0x00000e22      197c000102c4   move.b 0x1, 0x2c4(a4)
        │   0x00000e28      2007           move.l d7, d0
        │   0x00000e2a      2e1f           move.l (a7)+, d7
        │   0x00000e2c      4e75           rts
        │   0x00000e2e      4e71           nop
        │   0x00000e30      594f           subq.w 0x4, a7
        │   0x00000e32      41f9000000f8   lea.l 0xf8.l, a0
        │   0x00000e38      2e88           move.l a0, (a7)
        │   0x00000e3a      6710           beq.b 0xe4c
        │   0x00000e3c      2079000000f4   movea.l 0xf4.l, a0
        │   0x00000e42      4e90           jsr (a0)
        │   0x00000e44      4a80           tst.l d0
        │   0x00000e46      6704           beq.b 0xe4c
        │   0x00000e48      7001           moveq 0x1, d0
        │   0x00000e4a      0c407000       cmpi.w 0x7000, d0
        │   0x00000e4e      584f           addq.w 0x4, a7
        │   0x00000e50      4e75           rts
        │   0x00000e52      594f           subq.w 0x4, a7
        │   0x00000e54      41f9000000fc   lea.l 0xfc.l, a0
        │   0x00000e5a      2e88           move.l a0, (a7)
        │   0x00000e5c      6708           beq.b 0xe66
        │   0x00000e5e      2079000000f4   movea.l 0xf4.l, a0
        │   0x00000e64      4e90           jsr (a0)
        │   0x00000e66      584f           addq.w 0x4, a7
        │   0x00000e68      4e75           rts
        │   0x00000e6a      4e71           nop
        │   0x00000e6c      48e70016       movem.l a3/a5-a6, -(a7)
        │   0x00000e70      2a6c02c8       movea.l 0x2c8(a4), a5
        │   0x00000e74      6014           bra.b 0xe8a
        │   0x00000e76      7014           moveq 0x14, d0
        │   0x00000e78      d0ad0004       add.l 0x4(a5), d0
        │   0x00000e7c      224d           movea.l a5, a1
        │   0x00000e7e      2c780004       movea.l 0x4.w, a6
        │   0x00000e82      2655           movea.l (a5), a3
        │   0x00000e84      4eaeff2e       jsr -0xd2(a6)
        │   0x00000e88      2a4b           movea.l a3, a5
        │   0x00000e8a      200d           move.l a5, d0
        │   0x00000e8c      66e8           bne.b 0xe76
        │   0x00000e8e      42ac02c8       clr.l 0x2c8(a4)
        │   0x00000e92      4cdf6800       movem.l (a7)+, a3/a5-a6
        │   0x00000e96      4e75           rts
        │   0x00000e98      202f0008       move.l 0x8(a7), d0
        │   0x00000e9c      206f0004       movea.l 0x4(a7), a0
        │   0x00000ea0      4e55fff4       link.w a5, 0xfff4
        │   0x00000ea4      224f           movea.l a7, a1
        │   0x00000ea6      720a           moveq 0xa, d1
        │   0x00000ea8      4eba01e8       jsr 0x1092(pc)
        │   0x00000eac      06410030       addi.w 0x30, d1
        │   0x00000eb0      12c1           move.b d1, (a1)+
        │   0x00000eb2      4a80           tst.l d0
        │   0x00000eb4      66f0           bne.b 0xea6
        │   0x00000eb6      2009           move.l a1, d0
        │   0x00000eb8      10e1           move.b -(a1), (a0)+
        │   0x00000eba      bfc9           cmpa.l a1, a7
        │   0x00000ebc      66fa           bne.b 0xeb8
        │   0x00000ebe      4210           clr.b (a0)
        │   0x00000ec0      908f           sub.l a7, d0
        │   0x00000ec2      4e5d           unlk a5
        │   0x00000ec4      4e75           rts
        │   0x00000ec6      0000202f       ori.b 0x2f, d0
        │   0x00000eca      0008           invalid
        │   0x00000ecc      206f0004       movea.l 0x4(a7), a0
        │   0x00000ed0      4e55fff4       link.w a5, 0xfff4
        │   0x00000ed4      224f           movea.l a7, a1
        │   0x00000ed6      2200           move.l d0, d1
        │   0x00000ed8      02410007       andi.w 0x7, d1
        │   0x00000edc      06410030       addi.w 0x30, d1
        │   0x00000ee0      12c1           move.b d1, (a1)+
        │   0x00000ee2      e688           lsr.l 0x3, d0
        │   0x00000ee4      66f0           bne.b 0xed6
        │   0x00000ee6      2009           move.l a1, d0
        │   0x00000ee8      10e1           move.b -(a1), (a0)+
        │   0x00000eea      bfc9           cmpa.l a1, a7
        │   0x00000eec      66fa           bne.b 0xee8
        │   0x00000eee      4210           clr.b (a0)
        │   0x00000ef0      908f           sub.l a7, d0
        │   0x00000ef2      4e5d           unlk a5
        │   0x00000ef4      4e75           rts
        │   0x00000ef6      00003031       ori.b 0x31, d0
        │   0x00000efa      32333435       move.w 0x35(a3, d3.w), d1
        │   0x00000efe      36373839       move.w 0x39(a7, d3.l), d3
        │   0x00000f02      6162           bsr.b 0xf66
        │   0x00000f04      6364           bls.b 0xf6a
        │   0x00000f06      6566           bcs.b 0xf6e
        │   0x00000f08      202f0008       move.l 0x8(a7), d0
        │   0x00000f0c      206f0004       movea.l 0x4(a7), a0
        │   0x00000f10      514f           subq.w 0x8, a7
        │   0x00000f12      224f           movea.l a7, a1
        │   0x00000f14      3200           move.w d0, d1
        │   0x00000f16      0241000f       andi.w 0xf, d1
        │   0x00000f1a      12fb10dc       move.b 0xef8(pc, d1.w), (a1)+
        │   0x00000f1e      e888           lsr.l 0x4, d0
        │   0x00000f20      66f2           bne.b 0xf14
        │   0x00000f22      2009           move.l a1, d0
        │   0x00000f24      10e1           move.b -(a1), (a0)+
        │   0x00000f26      bfc9           cmpa.l a1, a7
        │   0x00000f28      66fa           bne.b 0xf24
        │   0x00000f2a      4210           clr.b (a0)
        │   0x00000f2c      9089           sub.l a1, d0
        │   0x00000f2e      504f           addq.w 0x8, a7
        │   0x00000f30      4e75           rts
        │   0x00000f32      0000206f       ori.b 0x6f, d0
        │   0x00000f36      0004226f       ori.b 0x6f, d4
        │   0x00000f3a      0008           invalid
        │   0x00000f3c      48e73020       movem.l d2-d3/a2, -(a7)
        │   0x00000f40      2448           movea.l a0, a2
        │   0x00000f42      7200           moveq 0x0, d1
        │   0x00000f44      2001           move.l d1, d0
        │   0x00000f46      2601           move.l d1, d3
        │   0x00000f48      0c10002b       cmpi.b 0x2b, (a0)
        │   0x00000f4c      6708           beq.b 0xf56
        │   0x00000f4e      0c10002d       cmpi.b 0x2d, (a0)
        │   0x00000f52      6604           bne.b 0xf58
        │   0x00000f54      7601           moveq 0x1, d3
        │   0x00000f56      5248           addq.w 0x1, a0
        │   0x00000f58      1018           move.b (a0)+, d0
        │   0x00000f5a      04000030       subi.b 0x30, d0
        │   0x00000f5e      6d1a           blt.b 0xf7a
        │   0x00000f60      0c000009       cmpi.b 0x9, d0
        │   0x00000f64      6e14           bgt.b 0xf7a
        │   0x00000f66      2401           move.l d1, d2
        │   0x00000f68      e581           asl.l 0x2, d1
        │   0x00000f6a      d282           add.l d2, d1
        │   0x00000f6c      d281           add.l d1, d1
        │   0x00000f6e      4a03           tst.b d3
        │   0x00000f70      6604           bne.b 0xf76
        │   0x00000f72      d280           add.l d0, d1
        │   0x00000f74      60e2           bra.b 0xf58
        │   0x00000f76      9280           sub.l d0, d1
        │   0x00000f78      60de           bra.b 0xf58
        │   0x00000f7a      2281           move.l d1, (a1)
        │   0x00000f7c      2008           move.l a0, d0
        │   0x00000f7e      908a           sub.l a2, d0
        │   0x00000f80      5380           subq.l 0x1, d0
        │   0x00000f82      4cdf040c       movem.l (a7)+, d2-d3/a2
        │   0x00000f86      4e75           rts
        │   0x00000f88      206f0004       movea.l 0x4(a7), a0
        │   0x00000f8c      2f0b           move.l a3, -(a7)
        │   0x00000f8e      2248           movea.l a0, a1
        │   0x00000f90      2649           movea.l a1, a3
        │   0x00000f92      6020           bra.b 0xfb4
        │   0x00000f94      41ec0109       lea.l 0x109(a4), a0
        │   0x00000f98      7000           moveq 0x0, d0
        │   0x00000f9a      1013           move.b (a3), d0
        │   0x00000f9c      083000010800   btst.b 0x1, (a0, d0.l)
        │   0x00000fa2      670a           beq.b 0xfae
        │   0x00000fa4      7200           moveq 0x0, d1
        │   0x00000fa6      1200           move.b d0, d1
        │   0x00000fa8      7020           moveq 0x20, d0
        │   0x00000faa      9280           sub.l d0, d1
        │   0x00000fac      6004           bra.b 0xfb2
        │   0x00000fae      7200           moveq 0x0, d1
        │   0x00000fb0      1200           move.b d0, d1
        │   0x00000fb2      16c1           move.b d1, (a3)+
        │   0x00000fb4      4a13           tst.b (a3)
        │   0x00000fb6      66dc           bne.b 0xf94
        │   0x00000fb8      2009           move.l a1, d0
        │   0x00000fba      265f           movea.l (a7)+, a3
        │   0x00000fbc      4e75           rts
        │   0x00000fbe      4e71           nop
        │   0x00000fc0      9efc0050       suba.w 0x50, a7
        │   0x00000fc4      48e73036       movem.l d2-d3/a2-a3/a5-a6, -(a7)
        │   0x00000fc8      43fa0084       lea.l 0x104e(pc), a1
        │   0x00000fcc      7000           moveq 0x0, d0
        │   0x00000fce      2c780004       movea.l 0x4.w, a6
        │   0x00000fd2      4eaefdd8       jsr -0x228(a6)
        │   0x00000fd6      2a40           movea.l d0, a5
        │   0x00000fd8      4a80           tst.l d0
        │   0x00000fda      6606           bne.b 0xfe2
        │   0x00000fdc      7014           moveq 0x14, d0
        │   0x00000fde      61000158       bsr.w 0x1138
        │   0x00000fe2      206c02ac       movea.l 0x2ac(a4), a0
        │   0x00000fe6      7200           moveq 0x0, d1
        │   0x00000fe8      1228ffff       move.b -0x1(a0), d1
        │   0x00000fec      2001           move.l d1, d0
        │   0x00000fee      43ef0018       lea.l 0x18(a7), a1
        │   0x00000ff2      0c4012d8       cmpi.w 0x12d8, d0
        │   0x00000ff6      5380           subq.l 0x1, d0
        │   0x00000ff8      64fa           bcc.b 0xff4
        │   0x00000ffa      42371818       clr.b 0x18(a7, d1.l)
        │   0x00000ffe      95ca           suba.l a2, a2
        │   0x00001000      2c4d           movea.l a5, a6
        │   0x00001002      41ef0018       lea.l 0x18(a7), a0
        │   0x00001006      29480220       move.l a0, 0x220(a4)
        │   0x0000100a      7000           moveq 0x0, d0
        │   0x0000100c      2200           move.l d0, d1
        │   0x0000100e      747d           moveq 0x7d, d2
        │   0x00001010      91c8           suba.l a0, a0
        │   0x00001012      d482           add.l d2, d2
        │   0x00001014      7628           moveq 0x28, d3
        │   0x00001016      43ec0228       lea.l 0x228(a4), a1
        │   0x0000101a      47ec023c       lea.l 0x23c(a4), a3
        │   0x0000101e      4eaefea4       jsr -0x15c(a6)
        │   0x00001022      7014           moveq 0x14, d0
        │   0x00001024      61000112       bsr.w 0x1138
        │   0x00001028      4cdf6c0c       movem.l (a7)+, d2-d3/a2-a3/a5-a6
        │   0x0000102c      defc0050       adda.w 0x50, a7
        │   0x00001030      4e75           rts
        │   0x00001032      2a2a2053       move.l 0x2053(a2), d5
        │   0x00001036      7461           moveq 0x61, d2
        │   0x00001038      636b           bls.b 0x10a5
        │   0x0000103a      204f           movea.l a7, a0
        │   0x0000103c      7665           moveq 0x65, d3
        │   0x0000103e      7266           moveq 0x66, d1
        │   0x00001040      6c6f           bge.b 0x10b1
        │   0x00001042      7720           invalid
        │   0x00001044      2a2a0000       move.l 0x0(a2), d5
        │   0x00001048      4558           invalid
        │   0x0000104a      4954           invalid
        │   0x0000104c      0000696e       ori.b 0x6e, d0
        │   0x00001050      7475           moveq 0x75, d2
        │   0x00001052      6974           bvs.b 0x10c8
        │   0x00001054      696f           bvs.b 0x10c5
        │   0x00001056      6e2e           bgt.b 0x1086
        │   0x00001058      6c69           bge.b 0x10c3
        │   0x0000105a      6272           bhi.b 0x10ce
        │   0x0000105c      6172           bsr.b 0x10d0
        │   0x0000105e      7900           invalid
        │   0x00001060      4a80           tst.l d0
        │   0x00001062      6a00001e       bpl.w 0x1082
        │   0x00001066      4480           neg.l d0
        │   0x00001068      4a81           tst.l d1
        │   0x0000106a      6a00000c       bpl.w 0x1078
        │   0x0000106e      4481           neg.l d1
        │   0x00001070      61000020       bsr.w 0x1092
        │   0x00001074      4481           neg.l d1
        │   0x00001076      4e75           rts
        │   0x00001078      61000018       bsr.w 0x1092
        │   0x0000107c      4480           neg.l d0
        │   0x0000107e      4481           neg.l d1
        │   0x00001080      4e75           rts
        │   0x00001082      4a81           tst.l d1
        │   0x00001084      6a00000c       bpl.w 0x1092
        │   0x00001088      4481           neg.l d1
        │   0x0000108a      61000006       bsr.w 0x1092
        │   0x0000108e      4480           neg.l d0
        │   0x00001090      4e75           rts
        │   0x00001092      2f02           move.l d2, -(a7)
        │   0x00001094      4841           swap d1
        │   0x00001096      3401           move.w d1, d2
        │   0x00001098      66000022       bne.w 0x10bc
        │   0x0000109c      4840           swap d0
        │   0x0000109e      4841           swap d1
        │   0x000010a0      4842           swap d2
        │   0x000010a2      3400           move.w d0, d2
        │   0x000010a4      67000006       beq.w 0x10ac
        │   0x000010a8      84c1           divu.w d1, d2
        │   0x000010aa      3002           move.w d2, d0
        │   0x000010ac      4840           swap d0
        │   0x000010ae      3400           move.w d0, d2
        │   0x000010b0      84c1           divu.w d1, d2
        │   0x000010b2      3002           move.w d2, d0
        │   0x000010b4      4842           swap d2
        │   0x000010b6      3202           move.w d2, d1
        │   0x000010b8      241f           move.l (a7)+, d2
        │   0x000010ba      4e75           rts
        │   0x000010bc      2f03           move.l d3, -(a7)
        │   0x000010be      7610           moveq 0x10, d3
        │   0x000010c0      0c410080       cmpi.w 0x80, d1
        │   0x000010c4      64000006       bcc.w 0x10cc
        │   0x000010c8      e199           rol.l 0x8, d1
        │   0x000010ca      5143           subq.w 0x8, d3
        │   0x000010cc      0c410800       cmpi.w 0x800, d1
        │   0x000010d0      64000006       bcc.w 0x10d8
        │   0x000010d4      e999           rol.l 0x4, d1
        │   0x000010d6      5943           subq.w 0x4, d3
        │   0x000010d8      0c412000       cmpi.w 0x2000, d1
        │   0x000010dc      64000006       bcc.w 0x10e4
        │   0x000010e0      e599           rol.l 0x2, d1
        │   0x000010e2      5543           subq.w 0x2, d3
        │   0x000010e4      4a41           tst.w d1
        │   0x000010e6      6b000006       bmi.w 0x10ee
        │   0x000010ea      e399           rol.l 0x1, d1
        │   0x000010ec      5343           subq.w 0x1, d3
        │   0x000010ee      3400           move.w d0, d2
        │   0x000010f0      e6a8           lsr.l d3, d0
        │   0x000010f2      4842           swap d2
        │   0x000010f4      4242           clr.w d2
        │   0x000010f6      e6aa           lsr.l d3, d2
        │   0x000010f8      4843           swap d3
        │   0x000010fa      80c1           divu.w d1, d0
        │   0x000010fc      3600           move.w d0, d3
        │   0x000010fe      3002           move.w d2, d0
        │   0x00001100      3403           move.w d3, d2
        │   0x00001102      4841           swap d1
        │   0x00001104      c4c1           mulu.w d1, d2
        │   0x00001106      9082           sub.l d2, d0
        │   0x00001108      64000006       bcc.w 0x1110
        │   0x0000110c      5343           subq.w 0x1, d3
        │   0x0000110e      d081           add.l d1, d0
        │   0x00001110      7200           moveq 0x0, d1
        │   0x00001112      3203           move.w d3, d1
        │   0x00001114      4843           swap d3
        │   0x00001116      e7b8           rol.l d3, d0
        │   0x00001118      4840           swap d0
        │   0x0000111a      c141           exg.l d0, d1
        │   0x0000111c      261f           move.l (a7)+, d3
        │   0x0000111e      241f           move.l (a7)+, d2
        │   0x00001120      4e75           rts
        │   0x00001122      0000202c       ori.b 0x2c, d0
        │   0x00001126      02a8044001..   andi.l 0x44001f4, 0x2e40(a0)
        │   0x0000112e      4efafe90       jmp 0xfc0(pc)
        │   0x00001132      0000202f       ori.b 0x2f, d0
        │   0x00001136      00042f00       ori.b 0x0, d4
        │   0x0000113a      6100f0aa       bsr.w 0x1e6
        │   0x0000113e      584f           addq.w 0x4, a7
        │   0x00001140      4e75           rts
        │   0x00001142      4e71           nop
        │   0x00001144      48e70034       movem.l a2-a3/a5, -(a7)
        │   0x00001148      202c02cc       move.l 0x2cc(a4), d0
        │   0x0000114c      2200           move.l d0, d1
        │   0x0000114e      e581           asl.l 0x2, d1
        │   0x00001150      4bec02d4       lea.l 0x2d4(a4), a5
        │   0x00001154      dbc1           adda.l d1, a5
        │   0x00001156      266f0010       movea.l 0x10(a7), a3
        │   0x0000115a      600000a0       bra.w 0x11fc
        │   0x0000115e      528b           addq.l 0x1, a3
        │   0x00001160      1013           move.b (a3), d0
        │   0x00001162      7220           moveq 0x20, d1
        │   0x00001164      b001           cmp.b d1, d0
        │   0x00001166      67f6           beq.b 0x115e
        │   0x00001168      7209           moveq 0x9, d1
        │   0x0000116a      b001           cmp.b d1, d0
        │   0x0000116c      67f0           beq.b 0x115e
        │   0x0000116e      720a           moveq 0xa, d1
        │   0x00001170      b001           cmp.b d1, d0
        │   0x00001172      67ea           beq.b 0x115e
        │   0x00001174      1013           move.b (a3), d0
        │   0x00001176      67000090       beq.w 0x1208
        │   0x0000117a      52ac02cc       addq.l 0x1, 0x2cc(a4)
        │   0x0000117e      7222           moveq 0x22, d1
        │   0x00001180      244d           movea.l a5, a2
        │   0x00001182      588d           addq.l 0x4, a5
        │   0x00001184      b001           cmp.b d1, d0
        │   0x00001186      6652           bne.b 0x11da
        │   0x00001188      528b           addq.l 0x1, a3
        │   0x0000118a      204b           movea.l a3, a0
        │   0x0000118c      2488           move.l a0, (a2)
        │   0x0000118e      6038           bra.b 0x11c8
        │   0x00001190      1013           move.b (a3), d0
        │   0x00001192      722a           moveq 0x2a, d1
        │   0x00001194      b001           cmp.b d1, d0
        │   0x00001196      662e           bne.b 0x11c6
        │   0x00001198      528b           addq.l 0x1, a3
        │   0x0000119a      7000           moveq 0x0, d0
        │   0x0000119c      1013           move.b (a3), d0
        │   0x0000119e      4a80           tst.l d0
        │   0x000011a0      670e           beq.b 0x11b0
        │   0x000011a2      7245           moveq 0x45, d1
        │   0x000011a4      9081           sub.l d1, d0
        │   0x000011a6      670c           beq.b 0x11b4
        │   0x000011a8      7209           moveq 0x9, d1
        │   0x000011aa      9081           sub.l d1, d0
        │   0x000011ac      670c           beq.b 0x11ba
        │   0x000011ae      6010           bra.b 0x11c0
        │   0x000011b0      4210           clr.b (a0)
        │   0x000011b2      6054           bra.b 0x1208
        │   0x000011b4      10fc0017       move.b 0x17, (a0)+
        │   0x000011b8      6008           bra.b 0x11c2
        │   0x000011ba      10fc000a       move.b 0xa, (a0)+
        │   0x000011be      0c4010d3       cmpi.w 0x10d3, d0
        │   0x000011c2      528b           addq.l 0x1, a3
        │   0x000011c4      0c4010db       cmpi.w 0x10db, d0
        │   0x000011c8      1013           move.b (a3), d0
        │   0x000011ca      7222           moveq 0x22, d1
        │   0x000011cc      b001           cmp.b d1, d0
        │   0x000011ce      6704           beq.b 0x11d4
        │   0x000011d0      4a00           tst.b d0
        │   0x000011d2      66bc           bne.b 0x1190
        │   0x000011d4      528b           addq.l 0x1, a3
        │   0x000011d6      4210           clr.b (a0)
        │   0x000011d8      6022           bra.b 0x11fc
        │   0x000011da      248b           move.l a3, (a2)
        │   0x000011dc      0c40528b       cmpi.w 0x528b, d0
        │   0x000011e0      1013           move.b (a3), d0
        │   0x000011e2      6712           beq.b 0x11f6
        │   0x000011e4      7220           moveq 0x20, d1
        │   0x000011e6      b001           cmp.b d1, d0
        │   0x000011e8      670c           beq.b 0x11f6
        │   0x000011ea      7209           moveq 0x9, d1
        │   0x000011ec      b001           cmp.b d1, d0
        │   0x000011ee      6706           beq.b 0x11f6
        │   0x000011f0      720a           moveq 0xa, d1
        │   0x000011f2      b001           cmp.b d1, d0
        │   0x000011f4      66e8           bne.b 0x11de
        │   0x000011f6      4a13           tst.b (a3)
        │   0x000011f8      670e           beq.b 0x1208
        │   0x000011fa      421b           clr.b (a3)+
        │   0x000011fc      0cac000000..   cmpi.l 0x20, 0x2cc(a4)
        │   0x00001204      6d00ff5a       blt.w 0x1160
        │   0x00001208      202c02cc       move.l 0x2cc(a4), d0
        │   0x0000120c      6606           bne.b 0x1214
        │   0x0000120e      206c02b8       movea.l 0x2b8(a4), a0
        │   0x00001212      6004           bra.b 0x1218
        │   0x00001214      41ec02d4       lea.l 0x2d4(a4), a0
        │   0x00001218      294802d0       move.l a0, 0x2d0(a4)
        │   0x0000121c      610008c2       bsr.w 0x1ae0
        │   0x00001220      4cdf2c00       movem.l (a7)+, a2-a3/a5
        │   0x00001224      6000034e       bra.w 0x1574
        │   0x00001228      206f0004       movea.l 0x4(a7), a0
        │   0x0000122c      226f0008       movea.l 0x8(a7), a1
        │   0x00001230      48e70030       movem.l a2-a3, -(a7)
        │   0x00001234      4a10           tst.b (a0)
        │   0x00001236      671a           beq.b 0x1252
        │   0x00001238      600a           bra.b 0x1244
        │   0x0000123a      4a12           tst.b (a2)
        │   0x0000123c      6714           beq.b 0x1252
        │   0x0000123e      5288           addq.l 0x1, a0
        │   0x00001240      4a10           tst.b (a0)
        │   0x00001242      670e           beq.b 0x1252
        │   0x00001244      2448           movea.l a0, a2
        │   0x00001246      2649           movea.l a1, a3
        │   0x00001248      4a13           tst.b (a3)
        │   0x0000124a      670e           beq.b 0x125a
        │   0x0000124c      b70a           cmpm.b (a2)+, (a3)+
        │   0x0000124e      66ea           bne.b 0x123a
        │   0x00001250      60f6           bra.b 0x1248
        │   0x00001252      7000           moveq 0x0, d0
        │   0x00001254      4cdf0c00       movem.l (a7)+, a2-a3
        │   0x00001258      4e75           rts
        │   0x0000125a      2008           move.l a0, d0
        │   0x0000125c      4cdf0c00       movem.l (a7)+, a2-a3
        │   0x00001260      4e75           rts
        │   0x00001262      0000226f       ori.b 0x6f, d0
        │   0x00001266      0008           invalid
        │   0x00001268      206f0004       movea.l 0x4(a7), a0
        │   0x0000126c      202f000c       move.l 0xc(a7), d0
        │   0x00001270      2208           move.l a0, d1
        │   0x00001272      4a80           tst.l d0
        │   0x00001274      6f16           ble.b 0x128c
        │   0x00001276      b1c9           cmpa.l a1, a0
        │   0x00001278      650c           bcs.b 0x1286
        │   0x0000127a      d3c0           adda.l d0, a1
        │   0x0000127c      d1c0           adda.l d0, a0
        │   0x0000127e      1121           move.b -(a1), -(a0)
        │   0x00001280      5380           subq.l 0x1, d0
        │   0x00001282      66fa           bne.b 0x127e
        │   0x00001284      6006           bra.b 0x128c
        │   0x00001286      10d9           move.b (a1)+, (a0)+
        │   0x00001288      5380           subq.l 0x1, d0
        │   0x0000128a      66fa           bne.b 0x1286
        │   0x0000128c      2001           move.l d1, d0
        │   0x0000128e      4e75           rts
        │   0x00001290      206f0004       movea.l 0x4(a7), a0
        │   0x00001294      2008           move.l a0, d0
        │   0x00001296      6602           bne.b 0x129a
        │   0x00001298      4e75           rts
        │   0x0000129a      5980           subq.l 0x4, d0
        │   0x0000129c      48e73c32       movem.l d2-d5/a2-a3/a6, -(a7)
        │   0x000012a0      222c02c8       move.l 0x2c8(a4), d1
        │   0x000012a4      660e           bne.b 0x12b4
        │   0x000012a6      297c000000..   move.l 0x16, 0x2bc(a4)
        │   0x000012ae      4cdf4c3c       movem.l (a7)+, d2-d5/a2-a3/a6
        │   0x000012b2      4e75           rts
        │   0x000012b4      2241           movea.l d1, a1
        │   0x000012b6      b081           cmp.l d1, d0
        │   0x000012b8      6f12           ble.b 0x12cc
        │   0x000012ba      2401           move.l d1, d2
        │   0x000012bc      d4a90004       add.l 0x4(a1), d2
        │   0x000012c0      068200000014   addi.l 0x14, d2
        │   0x000012c6      b082           cmp.l d2, d0
        │   0x000012c8      6c02           bge.b 0x12cc
        │   0x000012ca      6008           bra.b 0x12d4
        │   0x000012cc      22290000       move.l 0x0(a1), d1
        │   0x000012d0      67d4           beq.b 0x12a6
        │   0x000012d2      60e0           bra.b 0x12b4
        │   0x000012d4      2601           move.l d1, d3
        │   0x000012d6      068300000010   addi.l 0x10, d3
        │   0x000012dc      b083           cmp.l d3, d0
        │   0x000012de      6dc6           blt.b 0x12a6
        │   0x000012e0      6712           beq.b 0x12f4
        │   0x000012e2      2443           movea.l d3, a2
        │   0x000012e4      4282           clr.l d2
        │   0x000012e6      342a0002       move.w 0x2(a2), d2
        │   0x000012ea      6bba           bmi.b 0x12a6
        │   0x000012ec      e58a           lsl.l 0x2, d2
        │   0x000012ee      d682           add.l d2, d3
        │   0x000012f0      5883           addq.l 0x4, d3
        │   0x000012f2      60e8           bra.b 0x12dc
        │   0x000012f4      2440           movea.l d0, a2
        │   0x000012f6      342a0000       move.w 0x0(a2), d2
        │   0x000012fa      6aaa           bpl.b 0x12a6
        │   0x000012fc      08aa00070000   bclr.b 0x7, 0x0(a2)
        │   0x00001302      4283           clr.l d3
        │   0x00001304      362a0002       move.w 0x2(a2), d3
        │   0x00001308      02437fff       andi.w 0x7fff, d3
        │   0x0000130c      e58b           lsl.l 0x2, d3
        │   0x0000130e      4a6a0002       tst.w 0x2(a2)
        │   0x00001312      6b40           bmi.b 0x1354
        │   0x00001314      47f23804       lea.l 0x4(a2, d3.l), a3
        │   0x00001318      4a6b0000       tst.w 0x0(a3)
        │   0x0000131c      6b36           bmi.b 0x1354
        │   0x0000131e      4284           clr.l d4
        │   0x00001320      382b0002       move.w 0x2(a3), d4
        │   0x00001324      02447fff       andi.w 0x7fff, d4
        │   0x00001328      e58c           lsl.l 0x2, d4
        │   0x0000132a      d883           add.l d3, d4
        │   0x0000132c      5884           addq.l 0x4, d4
        │   0x0000132e      e48c           lsr.l 0x2, d4
        │   0x00001330      5883           addq.l 0x4, d3
        │   0x00001332      4a6b0002       tst.w 0x2(a3)
        │   0x00001336      6a04           bpl.b 0x133c
        │   0x00001338      00448000       ori.w 0x8000, d4
        │   0x0000133c      35440002       move.w d4, 0x2(a2)
        │   0x00001340      6b12           bmi.b 0x1354
        │   0x00001342      2a04           move.l d4, d5
        │   0x00001344      e58c           lsl.l 0x2, d4
        │   0x00001346      34324804       move.w 0x4(a2, d4.l), d2
        │   0x0000134a      02428000       andi.w 0x8000, d2
        │   0x0000134e      8a42           or.w d2, d5
        │   0x00001350      35854804       move.w d5, 0x4(a2, d4.l)
        │   0x00001354      4284           clr.l d4
        │   0x00001356      382a0000       move.w 0x0(a2), d4
        │   0x0000135a      674c           beq.b 0x13a8
        │   0x0000135c      e58c           lsl.l 0x2, d4
        │   0x0000135e      4484           neg.l d4
        │   0x00001360      47f248fc       lea.l -0x4(a2, d4.l), a3
        │   0x00001364      4a6b0000       tst.w 0x0(a3)
        │   0x00001368      6b3e           bmi.b 0x13a8
        │   0x0000136a      4284           clr.l d4
        │   0x0000136c      382b0002       move.w 0x2(a3), d4
        │   0x00001370      e58c           lsl.l 0x2, d4
        │   0x00001372      4285           clr.l d5
        │   0x00001374      3a2a0002       move.w 0x2(a2), d5
        │   0x00001378      02457fff       andi.w 0x7fff, d5
        │   0x0000137c      e58d           lsl.l 0x2, d5
        │   0x0000137e      d885           add.l d5, d4
        │   0x00001380      5884           addq.l 0x4, d4
        │   0x00001382      5883           addq.l 0x4, d3
        │   0x00001384      e48c           lsr.l 0x2, d4
        │   0x00001386      4a6a0002       tst.w 0x2(a2)
        │   0x0000138a      6a04           bpl.b 0x1390
        │   0x0000138c      00448000       ori.w 0x8000, d4
        │   0x00001390      37440002       move.w d4, 0x2(a3)
        │   0x00001394      6b12           bmi.b 0x13a8
        │   0x00001396      2a04           move.l d4, d5
        │   0x00001398      e58c           lsl.l 0x2, d4
        │   0x0000139a      34334804       move.w 0x4(a3, d4.l), d2
        │   0x0000139e      02428000       andi.w 0x8000, d2
        │   0x000013a2      8a42           or.w d2, d5
        │   0x000013a4      37854804       move.w d5, 0x4(a3, d4.l)
        │   0x000013a8      d7a90008       add.l d3, 0x8(a1)
        │   0x000013ac      26290004       move.l 0x4(a1), d3
        │   0x000013b0      b6ac0104       cmp.l 0x104(a4), d3
        │   0x000013b4      6e0c           bgt.b 0x13c2
        │   0x000013b6      b6a90008       cmp.l 0x8(a1), d3
        │   0x000013ba      663a           bne.b 0x13f6
        │   0x000013bc      4aa90000       tst.l 0x0(a1)
        │   0x000013c0      6734           beq.b 0x13f6
        │   0x000013c2      202c02c8       move.l 0x2c8(a4), d0
        │   0x000013c6      2040           movea.l d0, a0
        │   0x000013c8      b280           cmp.l d0, d1
        │   0x000013ca      660c           bne.b 0x13d8
        │   0x000013cc      2969000002c8   move.l 0x0(a1), 0x2c8(a4)
        │   0x000013d2      6010           bra.b 0x13e4
        │   0x000013d4      20680000       movea.l 0x0(a0), a0
        │   0x000013d8      b2a80000       cmp.l 0x0(a0), d1
        │   0x000013dc      66f6           bne.b 0x13d4
        │   0x000013de      216900000000   move.l 0x0(a1), 0x0(a0)
        │   0x000013e4      20290004       move.l 0x4(a1), d0
        │   0x000013e8      068000000014   addi.l 0x14, d0
        │   0x000013ee      2c780004       movea.l 0x4.w, a6
        │   0x000013f2      4eaeff2e       jsr -0xd2(a6)
        │   0x000013f6      4cdf4c3c       movem.l (a7)+, d2-d5/a2-a3/a6
        │   0x000013fa      4e75           rts
        │   0x000013fc      202f0004       move.l 0x4(a7), d0
        │   0x00001400      4a80           tst.l d0
        │   0x00001402      660c           bne.b 0x1410
        │   0x00001404      297c000000..   move.l 0x16, 0x2bc(a4)
        │   0x0000140c      7000           moveq 0x0, d0
        │   0x0000140e      4e75           rts
        │   0x00001410      48e73e32       movem.l d2-d6/a2-a3/a6, -(a7)
        │   0x00001414      5680           addq.l 0x3, d0
        │   0x00001416      0280fffffffc   andi.l 0xfffffffc, d0
        │   0x0000141c      0c800001fffc   cmpi.l 0x1fffc, d0
        │   0x00001422      6e0000b8       bgt.w 0x14dc
        │   0x00001426      b0ac0104       cmp.l 0x104(a4), d0
        │   0x0000142a      6e0000b0       bgt.w 0x14dc
        │   0x0000142e      262c02c8       move.l 0x2c8(a4), d3
        │   0x00001432      670000a8       beq.w 0x14dc
        │   0x00001436      2243           movea.l d3, a1
        │   0x00001438      b0a90008       cmp.l 0x8(a1), d0
        │   0x0000143c      6e32           bgt.b 0x1470
        │   0x0000143e      222c02c0       move.l 0x2c0(a4), d1
        │   0x00001442      b2a9000c       cmp.l 0xc(a1), d1
        │   0x00001446      6628           bne.b 0x1470
        │   0x00001448      45e90010       lea.l 0x10(a1), a2
        │   0x0000144c      4a52           tst.w (a2)
        │   0x0000144e      6b10           bmi.b 0x1460
        │   0x00001450      4284           clr.l d4
        │   0x00001452      382a0002       move.w 0x2(a2), d4
        │   0x00001456      02447fff       andi.w 0x7fff, d4
        │   0x0000145a      e58c           lsl.l 0x2, d4
        │   0x0000145c      b084           cmp.l d4, d0
        │   0x0000145e      6f1a           ble.b 0x147a
        │   0x00001460      4284           clr.l d4
        │   0x00001462      382a0002       move.w 0x2(a2), d4
        │   0x00001466      6b08           bmi.b 0x1470
        │   0x00001468      e58c           lsl.l 0x2, d4
        │   0x0000146a      45f24804       lea.l 0x4(a2, d4.l), a2
        │   0x0000146e      60dc           bra.b 0x144c
        │   0x00001470      26290000       move.l 0x0(a1), d3
        │   0x00001474      6766           beq.b 0x14dc
        │   0x00001476      2243           movea.l d3, a1
        │   0x00001478      60be           bra.b 0x1438
        │   0x0000147a      08ea00070000   bset.b 0x7, 0x0(a2)
        │   0x00001480      47f20804       lea.l 0x4(a2, d0.l), a3
        │   0x00001484      4285           clr.l d5
        │   0x00001486      b084           cmp.l d4, d0
        │   0x00001488      673c           beq.b 0x14c6
        │   0x0000148a      2c04           move.l d4, d6
        │   0x0000148c      9c80           sub.l d0, d6
        │   0x0000148e      5986           subq.l 0x4, d6
        │   0x00001490      6604           bne.b 0x1496
        │   0x00001492      2004           move.l d4, d0
        │   0x00001494      6030           bra.b 0x14c6
        │   0x00001496      e48e           lsr.l 0x2, d6
        │   0x00001498      4a6a0002       tst.w 0x2(a2)
        │   0x0000149c      6a04           bpl.b 0x14a2
        │   0x0000149e      00468000       ori.w 0x8000, d6
        │   0x000014a2      2a00           move.l d0, d5
        │   0x000014a4      e48d           lsr.l 0x2, d5
        │   0x000014a6      37460002       move.w d6, 0x2(a3)
        │   0x000014aa      37450000       move.w d5, 0x0(a3)
        │   0x000014ae      35450002       move.w d5, 0x2(a2)
        │   0x000014b2      7a04           moveq 0x4, d5
        │   0x000014b4      4a46           tst.w d6
        │   0x000014b6      6b0e           bmi.b 0x14c6
        │   0x000014b8      34324804       move.w 0x4(a2, d4.l), d2
        │   0x000014bc      02428000       andi.w 0x8000, d2
        │   0x000014c0      8c42           or.w d2, d6
        │   0x000014c2      35864804       move.w d6, 0x4(a2, d4.l)
        │   0x000014c6      26290008       move.l 0x8(a1), d3
        │   0x000014ca      9680           sub.l d0, d3
        │   0x000014cc      9685           sub.l d5, d3
        │   0x000014ce      23430008       move.l d3, 0x8(a1)
        │   0x000014d2      200a           move.l a2, d0
        │   0x000014d4      5880           addq.l 0x4, d0
        │   0x000014d6      4cdf4c7c       movem.l (a7)+, d2-d6/a2-a3/a6
        │   0x000014da      4e75           rts
        │   0x000014dc      2a00           move.l d0, d5
        │   0x000014de      b0ac0104       cmp.l 0x104(a4), d0
        │   0x000014e2      6a04           bpl.b 0x14e8
        │   0x000014e4      202c0104       move.l 0x104(a4), d0
        │   0x000014e8      2800           move.l d0, d4
        │   0x000014ea      068000000014   addi.l 0x14, d0
        │   0x000014f0      222c02c0       move.l 0x2c0(a4), d1
        │   0x000014f4      2c780004       movea.l 0x4.w, a6
        │   0x000014f8      4eaeff3a       jsr -0xc6(a6)
        │   0x000014fc      4a80           tst.l d0
        │   0x000014fe      660a           bne.b 0x150a
        │   0x00001500      297c000000..   move.l 0xc, 0x2bc(a4)
        │   0x00001508      60cc           bra.b 0x14d6
        │   0x0000150a      2240           movea.l d0, a1
        │   0x0000150c      45e90010       lea.l 0x10(a1), a2
        │   0x00001510      236c02c80000   move.l 0x2c8(a4), 0x0(a1)
        │   0x00001516      294902c8       move.l a1, 0x2c8(a4)
        │   0x0000151a      23440004       move.l d4, 0x4(a1)
        │   0x0000151e      236c02c0000c   move.l 0x2c0(a4), 0xc(a1)
        │   0x00001524      2604           move.l d4, d3
        │   0x00001526      9685           sub.l d5, d3
        │   0x00001528      6728           beq.b 0x1552
        │   0x0000152a      5983           subq.l 0x4, d3
        │   0x0000152c      6724           beq.b 0x1552
        │   0x0000152e      23430008       move.l d3, 0x8(a1)
        │   0x00001532      47f25804       lea.l 0x4(a2, d5.l), a3
        │   0x00001536      357c80000000   move.w 0x8000, 0x0(a2)
        │   0x0000153c      e48d           lsr.l 0x2, d5
        │   0x0000153e      35450002       move.w d5, 0x2(a2)
        │   0x00001542      37450000       move.w d5, 0x0(a3)
        │   0x00001546      e48b           lsr.l 0x2, d3
        │   0x00001548      00438000       ori.w 0x8000, d3
        │   0x0000154c      37430002       move.w d3, 0x2(a3)
        │   0x00001550      6014           bra.b 0x1566
        │   0x00001552      42a90008       clr.l 0x8(a1)
        │   0x00001556      357c80000000   move.w 0x8000, 0x0(a2)
        │   0x0000155c      e48c           lsr.l 0x2, d4
        │   0x0000155e      00448000       ori.w 0x8000, d4
        │   0x00001562      35440002       move.w d4, 0x2(a2)
        │   0x00001566      200a           move.l a2, d0
        │   0x00001568      5880           addq.l 0x4, d0
        │   0x0000156a      4cdf4c7c       movem.l (a7)+, d2-d6/a2-a3/a6
        │   0x0000156e      4e75           rts
        │   0x00001570      202f0004       move.l 0x4(a7), d0
        │   0x00001574      48e70104       movem.l d7/a5, -(a7)
        │   0x00001578      2e00           move.l d0, d7
        │   0x0000157a      2a6c0250       movea.l 0x250(a4), a5
        │   0x0000157e      6008           bra.b 0x1588
        │   0x00001580      206d0004       movea.l 0x4(a5), a0
        │   0x00001584      4e90           jsr (a0)
        │   0x00001586      2a55           movea.l (a5), a5
        │   0x00001588      200d           move.l a5, d0
        │   0x0000158a      66f4           bne.b 0x1580
        │   0x0000158c      2007           move.l d7, d0
        │   0x0000158e      4cdf2080       movem.l (a7)+, d7/a5
        │   0x00001592      6000fba4       bra.w 0x1138
        │   0x00001596      4e71           nop
        │   0x00001598      202f0004       move.l 0x4(a7), d0
        │   0x0000159c      206f0008       movea.l 0x8(a7), a0
        │   0x000015a0      43d0           lea.l (a0), a1
        │   0x000015a2      5299           addq.l 0x1, (a1)+
        │   0x000015a4      2051           movea.l (a1), a0
        │   0x000015a6      5299           addq.l 0x1, (a1)+
        │   0x000015a8      1080           move.b d0, (a0)
        │   0x000015aa      4e75           rts
        │   0x000015ac      514f           subq.w 0x8, a7
        │   0x000015ae      206f000c       movea.l 0xc(a7), a0
        │   0x000015b2      4297           clr.l (a7)
        │   0x000015b4      2f480004       move.l a0, 0x4(a7)
        │   0x000015b8      486f0014       pea.l 0x14(a7)
        │   0x000015bc      2f2f0014       move.l 0x14(a7), -(a7)
        │   0x000015c0      41faffde       lea.l 0x15a0(pc), a0
        │   0x000015c4      43ef0008       lea.l 0x8(a7), a1
        │   0x000015c8      610004a2       bsr.w 0x1a6c
        │   0x000015cc      206f000c       movea.l 0xc(a7), a0
        │   0x000015d0      504f           addq.w 0x8, a7
        │   0x000015d2      4210           clr.b (a0)
        │   0x000015d4      2017           move.l (a7), d0
        │   0x000015d6      504f           addq.w 0x8, a7
        │   0x000015d8      4e75           rts
        │   0x000015da      4e71           nop
        │   0x000015dc      206f0004       movea.l 0x4(a7), a0
        │   0x000015e0      226f0008       movea.l 0x8(a7), a1
        │   0x000015e4      2f6f000c0004   move.l 0xc(a7), 0x4(a7)
        │   0x000015ea      2f6f00100008   move.l 0x10(a7), 0x8(a7)
        │   0x000015f0      9efc0048       suba.w 0x48, a7
        │   0x000015f4      48e72f34       movem.l d2/d4-d7/a2-a3/a5, -(a7)
        │   0x000015f8      2a6f0070       movea.l 0x70(a7), a5
        │   0x000015fc      2f480028       move.l a0, 0x28(a7)
        │   0x00001600      422f005b       clr.b 0x5b(a7)
        │   0x00001604      422f0046       clr.b 0x46(a7)
        │   0x00001608      422f0047       clr.b 0x47(a7)
        │   0x0000160c      422f0064       clr.b 0x64(a7)
        │   0x00001610      1f7c0020005a   move.b 0x20, 0x5a(a7)
        │   0x00001616      42af004c       clr.l 0x4c(a7)
        │   0x0000161a      70ff           moveq 0xff, d0
        │   0x0000161c      2f400060       move.l d0, 0x60(a7)
        │   0x00001620      422f005c       clr.b 0x5c(a7)
        │   0x00001624      7e00           moveq 0x0, d7
        │   0x00001626      7c00           moveq 0x0, d6
        │   0x00001628      45ef0032       lea.l 0x32(a7), a2
        │   0x0000162c      2649           movea.l a1, a3
        │   0x0000162e      606c           bra.b 0x169c
        │   0x00001630      206f0028       movea.l 0x28(a7), a0
        │   0x00001634      7000           moveq 0x0, d0
        │   0x00001636      1010           move.b (a0), d0
        │   0x00001638      7220           moveq 0x20, d1
        │   0x0000163a      9081           sub.l d1, d0
        │   0x0000163c      6d66           blt.b 0x16a4
        │   0x0000163e      0c8000000011   cmpi.l 0x11, d0
        │   0x00001644      6c5e           bge.b 0x16a4
        │   0x00001646      d040           add.w d0, d0
        │   0x00001648      303b0006       move.w 0x1650(pc, d0.w), d0
        │   0x0000164c      4efb0004       jmp 0x1652(pc, d0.w)
        │   0x00001650      003000520052   ori.b 0x52, 0x52(a0, d0.w)
        │   0x00001656      003800520052   ori.b 0x52, 0x52.w
        │   0x0000165c      00520052       ori.w 0x52, (a2)
        │   0x00001660      00520052       ori.w 0x52, (a2)
        │   0x00001664      00520028       ori.w 0x28, (a2)
        │   0x00001668      00520020       ori.w 0x20, (a2)
        │   0x0000166c      00520052       ori.w 0x52, (a2)
        │   0x00001670      00401f7c       ori.w 0x1f7c, d0
        │   0x00001674      0001005b       ori.b 0x5b, d1
        │   0x00001678      601e           bra.b 0x1698
        │   0x0000167a      1f7c00010046   move.b 0x1, 0x46(a7)
        │   0x00001680      6016           bra.b 0x1698
        │   0x00001682      1f7c00010047   move.b 0x1, 0x47(a7)
        │   0x00001688      600e           bra.b 0x1698
        │   0x0000168a      1f7c00010064   move.b 0x1, 0x64(a7)
        │   0x00001690      6006           bra.b 0x1698
        │   0x00001692      1f7c0030005a   move.b 0x30, 0x5a(a7)
        │   0x00001698      52af0028       addq.l 0x1, 0x28(a7)
        │   0x0000169c      206f0028       movea.l 0x28(a7), a0
        │   0x000016a0      4a10           tst.b (a0)
        │   0x000016a2      668c           bne.b 0x1630
        │   0x000016a4      7001           moveq 0x1, d0
        │   0x000016a6      b02f005b       cmp.b 0x5b(a7), d0
        │   0x000016aa      6606           bne.b 0x16b2
        │   0x000016ac      1f7c0020005a   move.b 0x20, 0x5a(a7)
        │   0x000016b2      722a           moveq 0x2a, d1
        │   0x000016b4      206f0028       movea.l 0x28(a7), a0
        │   0x000016b8      b210           cmp.b (a0), d1
        │   0x000016ba      661a           bne.b 0x16d6
        │   0x000016bc      2253           movea.l (a3), a1
        │   0x000016be      5893           addq.l 0x4, (a3)
        │   0x000016c0      2211           move.l (a1), d1
        │   0x000016c2      2f41004c       move.l d1, 0x4c(a7)
        │   0x000016c6      6c08           bge.b 0x16d0
        │   0x000016c8      44af004c       neg.l 0x4c(a7)
        │   0x000016cc      1f40005b       move.b d0, 0x5b(a7)
        │   0x000016d0      52af0028       addq.l 0x1, 0x28(a7)
        │   0x000016d4      600c           bra.b 0x16e2
        │   0x000016d6      43ef004c       lea.l 0x4c(a7), a1
        │   0x000016da      6100f860       bsr.w 0xf3c
        │   0x000016de      d1af0028       add.l d0, 0x28(a7)
        │   0x000016e2      206f0028       movea.l 0x28(a7), a0
        │   0x000016e6      1010           move.b (a0), d0
        │   0x000016e8      722e           moveq 0x2e, d1
        │   0x000016ea      b001           cmp.b d1, d0
        │   0x000016ec      6642           bne.b 0x1730
        │   0x000016ee      52af0028       addq.l 0x1, 0x28(a7)
        │   0x000016f2      702a           moveq 0x2a, d0
        │   0x000016f4      206f0028       movea.l 0x28(a7), a0
        │   0x000016f8      b010           cmp.b (a0), d0
        │   0x000016fa      6618           bne.b 0x1714
        │   0x000016fc      2053           movea.l (a3), a0
        │   0x000016fe      5893           addq.l 0x4, (a3)
        │   0x00001700      2010           move.l (a0), d0
        │   0x00001702      2f400060       move.l d0, 0x60(a7)
        │   0x00001706      6c06           bge.b 0x170e
        │   0x00001708      70ff           moveq 0xff, d0
        │   0x0000170a      2f400060       move.l d0, 0x60(a7)
        │   0x0000170e      52af0028       addq.l 0x1, 0x28(a7)
        │   0x00001712      6016           bra.b 0x172a
        │   0x00001714      43ef0060       lea.l 0x60(a7), a1
        │   0x00001718      6100f822       bsr.w 0xf3c
        │   0x0000171c      2a00           move.l d0, d5
        │   0x0000171e      6606           bne.b 0x1726
        │   0x00001720      42af0060       clr.l 0x60(a7)
        │   0x00001724      6004           bra.b 0x172a
        │   0x00001726      dbaf0028       add.l d5, 0x28(a7)
        │   0x0000172a      1f7c0020005a   move.b 0x20, 0x5a(a7)
        │   0x00001730      206f0028       movea.l 0x28(a7), a0
        │   0x00001734      7000           moveq 0x0, d0
        │   0x00001736      1010           move.b (a0), d0
        │   0x00001738      724c           moveq 0x4c, d1
        │   0x0000173a      9081           sub.l d1, d0
        │   0x0000173c      6714           beq.b 0x1752
        │   0x0000173e      721c           moveq 0x1c, d1
        │   0x00001740      9081           sub.l d1, d0
        │   0x00001742      6706           beq.b 0x174a
        │   0x00001744      5980           subq.l 0x4, d0
        │   0x00001746      670a           beq.b 0x1752
        │   0x00001748      6012           bra.b 0x175c
        │   0x0000174a      1f7c0002005c   move.b 0x2, 0x5c(a7)
        │   0x00001750      6006           bra.b 0x1758
        │   0x00001752      1f7c0001005c   move.b 0x1, 0x5c(a7)
        │   0x00001758      52af0028       addq.l 0x1, 0x28(a7)
        │   0x0000175c      206f0028       movea.l 0x28(a7), a0
        │   0x00001760      5288           addq.l 0x1, a0
        │   0x00001762      226f0028       movea.l 0x28(a7), a1
        │   0x00001766      1011           move.b (a1), d0
        │   0x00001768      7200           moveq 0x0, d1
        │   0x0000176a      1200           move.b d0, d1
        │   0x0000176c      1f400020       move.b d0, 0x20(a7)
        │   0x00001770      2f480022       move.l a0, 0x22(a7)
        │   0x00001774      7050           moveq 0x50, d0
        │   0x00001776      9280           sub.l d0, d1
        │   0x00001778      6d00020a       blt.w 0x1984
        │   0x0000177c      0c8100000029   cmpi.l 0x29, d1
        │   0x00001782      6c000200       bge.w 0x1984
        │   0x00001786      d241           add.w d1, d1
        │   0x00001788      323b1006       move.w 0x1790(pc, d1.w), d1
        │   0x0000178c      4efb1004       jmp 0x1792(pc, d1.w)
        │   0x00001790      0118           btst.l d0, (a0)+
        │   0x00001792      01f201f201..   bset.b d0, ([0x1f201f2], 0x1f2)
        │   0x0000179c      01f201f201..   bset.b d0, ([0x12a01f2], 0x1f2)
        │   0x000017a6      01f201f201..   bset.b d0, ([0x1f201f2], 0x1f2)
        │   0x000017b0      01f201f201..   bset.b d0, ([0x1f201e0], 0x72)
        │   0x000017ba      01f201f201..   bset.b d0, ([0x1f201f2], 0x72)
        │   0x000017c4      01f201f201..   bset.b d0, ([0x1f201f2], 0x50)
        │   0x000017ce      012a0118       btst.l d0, 0x118(a2)
        │   0x000017d2      01f201f201..   bset.b d0, ([0x1ac01f2], 0x12a)
        │   0x000017dc      01f201f201..   bset.b d0, ([0x12a7002], 0xb02f)
        │   0x000017e6      005c660e       ori.w 0x660e, (a4)+
        │   0x000017ea      2053           movea.l (a3), a0
        │   0x000017ec      5893           addq.l 0x4, (a3)
        │   0x000017ee      2250           movea.l (a0), a1
        │   0x000017f0      2015           move.l (a5), d0
        │   0x000017f2      3280           move.w d0, (a1)
        │   0x000017f4      6000023e       bra.w 0x1a34
        │   0x000017f8      2053           movea.l (a3), a0
        │   0x000017fa      5893           addq.l 0x4, (a3)
        │   0x000017fc      2250           movea.l (a0), a1
        │   0x000017fe      2295           move.l (a5), (a1)
        │   0x00001800      60000232       bra.w 0x1a34
        │   0x00001804      2053           movea.l (a3), a0
        │   0x00001806      5893           addq.l 0x4, (a3)
        │   0x00001808      2810           move.l (a0), d4
        │   0x0000180a      6a04           bpl.b 0x1810
        │   0x0000180c      7e01           moveq 0x1, d7
        │   0x0000180e      4484           neg.l d4
        │   0x00001810      4a87           tst.l d7
        │   0x00001812      670c           beq.b 0x1820
        │   0x00001814      45ef0033       lea.l 0x33(a7), a2
        │   0x00001818      1f7c002d0032   move.b 0x2d, 0x32(a7)
        │   0x0000181e      6022           bra.b 0x1842
        │   0x00001820      4a2f0046       tst.b 0x46(a7)
        │   0x00001824      670c           beq.b 0x1832
        │   0x00001826      45ef0033       lea.l 0x33(a7), a2
        │   0x0000182a      1f7c002b0032   move.b 0x2b, 0x32(a7)
        │   0x00001830      6010           bra.b 0x1842
        │   0x00001832      4a2f0047       tst.b 0x47(a7)
        │   0x00001836      670c           beq.b 0x1844
        │   0x00001838      45ef0033       lea.l 0x33(a7), a2
        │   0x0000183c      1f7c00200032   move.b 0x20, 0x32(a7)
        │   0x00001842      7c01           moveq 0x1, d6
        │   0x00001844      2004           move.l d4, d0
        │   0x00001846      204a           movea.l a2, a0
        │   0x00001848      6100f656       bsr.w 0xea0
        │   0x0000184c      2a00           move.l d0, d5
        │   0x0000184e      202f0060       move.l 0x60(a7), d0
        │   0x00001852      6606           bne.b 0x185a
        │   0x00001854      4a84           tst.l d4
        │   0x00001856      670001dc       beq.w 0x1a34
        │   0x0000185a      202f0060       move.l 0x60(a7), d0
        │   0x0000185e      6a06           bpl.b 0x1866
        │   0x00001860      7201           moveq 0x1, d1
        │   0x00001862      2f410060       move.l d1, 0x60(a7)
        │   0x00001866      282f0060       move.l 0x60(a7), d4
        │   0x0000186a      9885           sub.l d5, d4
        │   0x0000186c      6f1c           ble.b 0x188a
        │   0x0000186e      204a           movea.l a2, a0
        │   0x00001870      d1c4           adda.l d4, a0
        │   0x00001872      2005           move.l d5, d0
        │   0x00001874      224a           movea.l a2, a1
        │   0x00001876      6100f9f8       bsr.w 0x1270
        │   0x0000187a      7230           moveq 0x30, d1
        │   0x0000187c      204a           movea.l a2, a0
        │   0x0000187e      0c4010c1       cmpi.w 0x10c1, d0
        │   0x00001882      5384           subq.l 0x1, d4
        │   0x00001884      64fa           bcc.b 0x1880
        │   0x00001886      2a2f0060       move.l 0x60(a7), d5
        │   0x0000188a      dc85           add.l d5, d6
        │   0x0000188c      5385           subq.l 0x1, d5
        │   0x0000188e      660000fa       bne.w 0x198a
        │   0x00001892      1a12           move.b (a2), d5
        │   0x00001894      ba2f005a       cmp.b 0x5a(a7), d5
        │   0x00001898      660000f0       bne.w 0x198a
        │   0x0000189c      4aaf0060       tst.l 0x60(a7)
        │   0x000018a0      660000e8       bne.w 0x198a
        │   0x000018a4      4212           clr.b (a2)
        │   0x000018a6      600000e2       bra.w 0x198a
        │   0x000018aa      202f0060       move.l 0x60(a7), d0
        │   0x000018ae      6a06           bpl.b 0x18b6
        │   0x000018b0      7008           moveq 0x8, d0
        │   0x000018b2      2f400060       move.l d0, 0x60(a7)
        │   0x000018b6      1f7c0001005c   move.b 0x1, 0x5c(a7)
        │   0x000018bc      7002           moveq 0x2, d0
        │   0x000018be      b02f005c       cmp.b 0x5c(a7), d0
        │   0x000018c2      660c           bne.b 0x18d0
        │   0x000018c4      2053           movea.l (a3), a0
        │   0x000018c6      5893           addq.l 0x4, (a3)
        │   0x000018c8      2010           move.l (a0), d0
        │   0x000018ca      7800           moveq 0x0, d4
        │   0x000018cc      3800           move.w d0, d4
        │   0x000018ce      6006           bra.b 0x18d6
        │   0x000018d0      2053           movea.l (a3), a0
        │   0x000018d2      5893           addq.l 0x4, (a3)
        │   0x000018d4      2810           move.l (a0), d4
        │   0x000018d6      102f0020       move.b 0x20(a7), d0
        │   0x000018da      7275           moveq 0x75, d1
        │   0x000018dc      b001           cmp.b d1, d0
        │   0x000018de      6700ff64       beq.w 0x1844
        │   0x000018e2      726f           moveq 0x6f, d1
        │   0x000018e4      b001           cmp.b d1, d0
        │   0x000018e6      661e           bne.b 0x1906
        │   0x000018e8      4a2f0064       tst.b 0x64(a7)
        │   0x000018ec      670c           beq.b 0x18fa
        │   0x000018ee      45ef0033       lea.l 0x33(a7), a2
        │   0x000018f2      1f7c00300032   move.b 0x30, 0x32(a7)
        │   0x000018f8      7c01           moveq 0x1, d6
        │   0x000018fa      2004           move.l d4, d0
        │   0x000018fc      204a           movea.l a2, a0
        │   0x000018fe      6100f5d0       bsr.w 0xed0
        │   0x00001902      6000ff48       bra.w 0x184c
        │   0x00001906      4a2f0064       tst.b 0x64(a7)
        │   0x0000190a      6712           beq.b 0x191e
        │   0x0000190c      1f7c00300032   move.b 0x30, 0x32(a7)
        │   0x00001912      45ef0034       lea.l 0x34(a7), a2
        │   0x00001916      1f7c00780033   move.b 0x78, 0x33(a7)
        │   0x0000191c      7c02           moveq 0x2, d6
        │   0x0000191e      2004           move.l d4, d0
        │   0x00001920      204a           movea.l a2, a0
        │   0x00001922      6100f5ec       bsr.w 0xf10
        │   0x00001926      2a00           move.l d0, d5
        │   0x00001928      082f00050020   btst.b 0x5, 0x20(a7)
        │   0x0000192e      6600ff1e       bne.w 0x184e
        │   0x00001932      41ef0032       lea.l 0x32(a7), a0
        │   0x00001936      6100f654       bsr.w 0xf8c
        │   0x0000193a      6000ff12       bra.w 0x184e
        │   0x0000193e      2053           movea.l (a3), a0
        │   0x00001940      5893           addq.l 0x4, (a3)
        │   0x00001942      2650           movea.l (a0), a3
        │   0x00001944      200b           move.l a3, d0
        │   0x00001946      660a           bne.b 0x1952
        │   0x00001948      70ff           moveq 0xff, d0
        │   0x0000194a      47fa00f6       lea.l 0x1a42(pc), a3
        │   0x0000194e      2f400060       move.l d0, 0x60(a7)
        │   0x00001952      204b           movea.l a3, a0
        │   0x00001954      4a18           tst.b (a0)+
        │   0x00001956      66fc           bne.b 0x1954
        │   0x00001958      5388           subq.l 0x1, a0
        │   0x0000195a      91cb           suba.l a3, a0
        │   0x0000195c      2a08           move.l a0, d5
        │   0x0000195e      202f0060       move.l 0x60(a7), d0
        │   0x00001962      6b04           bmi.b 0x1968
        │   0x00001964      b085           cmp.l d5, d0
        │   0x00001966      6f04           ble.b 0x196c
        │   0x00001968      2f450060       move.l d5, 0x60(a7)
        │   0x0000196c      2c2f0060       move.l 0x60(a7), d6
        │   0x00001970      601c           bra.b 0x198e
        │   0x00001972      2053           movea.l (a3), a0
        │   0x00001974      7c01           moveq 0x1, d6
        │   0x00001976      5893           addq.l 0x4, (a3)
        │   0x00001978      2010           move.l (a0), d0
        │   0x0000197a      1f400032       move.b d0, 0x32(a7)
        │   0x0000197e      422f0033       clr.b 0x33(a7)
        │   0x00001982      6006           bra.b 0x198a
        │   0x00001984      7000           moveq 0x0, d0
        │   0x00001986      600000b0       bra.w 0x1a38
        │   0x0000198a      47ef0032       lea.l 0x32(a7), a3
        │   0x0000198e      202f004c       move.l 0x4c(a7), d0
        │   0x00001992      b086           cmp.l d6, d0
        │   0x00001994      6c08           bge.b 0x199e
        │   0x00001996      7200           moveq 0x0, d1
        │   0x00001998      2f41004c       move.l d1, 0x4c(a7)
        │   0x0000199c      6004           bra.b 0x19a2
        │   0x0000199e      9daf004c       sub.l d6, 0x4c(a7)
        │   0x000019a2      246f006c       movea.l 0x6c(a7), a2
        │   0x000019a6      4a2f005b       tst.b 0x5b(a7)
        │   0x000019aa      671e           beq.b 0x19ca
        │   0x000019ac      6008           bra.b 0x19b6
        │   0x000019ae      204d           movea.l a5, a0
        │   0x000019b0      7000           moveq 0x0, d0
        │   0x000019b2      101b           move.b (a3)+, d0
        │   0x000019b4      4e92           jsr (a2)
        │   0x000019b6      5386           subq.l 0x1, d6
        │   0x000019b8      6cf4           bge.b 0x19ae
        │   0x000019ba      6006           bra.b 0x19c2
        │   0x000019bc      204d           movea.l a5, a0
        │   0x000019be      7020           moveq 0x20, d0
        │   0x000019c0      4e92           jsr (a2)
        │   0x000019c2      53af004c       subq.l 0x1, 0x4c(a7)
        │   0x000019c6      6cf4           bge.b 0x19bc
        │   0x000019c8      606a           bra.b 0x1a34
        │   0x000019ca      4a87           tst.l d7
        │   0x000019cc      660c           bne.b 0x19da
        │   0x000019ce      4a2f0047       tst.b 0x47(a7)
        │   0x000019d2      6606           bne.b 0x19da
        │   0x000019d4      4a2f0046       tst.b 0x46(a7)
        │   0x000019d8      6746           beq.b 0x1a20
        │   0x000019da      1013           move.b (a3), d0
        │   0x000019dc      7220           moveq 0x20, d1
        │   0x000019de      b001           cmp.b d1, d0
        │   0x000019e0      670c           beq.b 0x19ee
        │   0x000019e2      742b           moveq 0x2b, d2
        │   0x000019e4      b002           cmp.b d2, d0
        │   0x000019e6      6706           beq.b 0x19ee
        │   0x000019e8      742d           moveq 0x2d, d2
        │   0x000019ea      b002           cmp.b d2, d0
        │   0x000019ec      6632           bne.b 0x1a20
        │   0x000019ee      4a86           tst.l d6
        │   0x000019f0      6b2e           bmi.b 0x1a20
        │   0x000019f2      b22f005a       cmp.b 0x5a(a7), d1
        │   0x000019f6      6612           bne.b 0x1a0a
        │   0x000019f8      600a           bra.b 0x1a04
        │   0x000019fa      204d           movea.l a5, a0
        │   0x000019fc      7000           moveq 0x0, d0
        │   0x000019fe      102f005a       move.b 0x5a(a7), d0
        │   0x00001a02      4e92           jsr (a2)
        │   0x00001a04      53af004c       subq.l 0x1, 0x4c(a7)
        │   0x00001a08      6cf0           bge.b 0x19fa
        │   0x00001a0a      204d           movea.l a5, a0
        │   0x00001a0c      7000           moveq 0x0, d0
        │   0x00001a0e      101b           move.b (a3)+, d0
        │   0x00001a10      4e92           jsr (a2)
        │   0x00001a12      5386           subq.l 0x1, d6
        │   0x00001a14      600a           bra.b 0x1a20
        │   0x00001a16      204d           movea.l a5, a0
        │   0x00001a18      7000           moveq 0x0, d0
        │   0x00001a1a      102f005a       move.b 0x5a(a7), d0
        │   0x00001a1e      4e92           jsr (a2)
        │   0x00001a20      53af004c       subq.l 0x1, 0x4c(a7)
        │   0x00001a24      6cf0           bge.b 0x1a16
        │   0x00001a26      6008           bra.b 0x1a30
        │   0x00001a28      204d           movea.l a5, a0
        │   0x00001a2a      7000           moveq 0x0, d0
        │   0x00001a2c      101b           move.b (a3)+, d0
        │   0x00001a2e      4e92           jsr (a2)
        │   0x00001a30      5386           subq.l 0x1, d6
        │   0x00001a32      6cf4           bge.b 0x1a28
        │   0x00001a34      202f0022       move.l 0x22(a7), d0
        │   0x00001a38      4cdf2cf4       movem.l (a7)+, d2/d4-d7/a2-a3/a5
        │   0x00001a3c      defc0048       adda.w 0x48, a7
        │   0x00001a40      4e75           rts
        │   0x00001a42      2a2a2a4e       move.l 0x2a4e(a2), d5
        │   0x00001a46      554c           subq.w 0x2, a4
        │   0x00001a48      4c20           invalid
        │   0x00001a4a      504f           addq.w 0x8, a7
        │   0x00001a4c      494e           invalid
        │   0x00001a4e      5445           addq.w 0x2, d5
        │   0x00001a50      522a2a2a       addq.b 0x1, 0x2a2a(a2)
        │   0x00001a54      00004e71       ori.b 0x71, d0
        │   0x00001a58      206f0004       movea.l 0x4(a7), a0
        │   0x00001a5c      226f0008       movea.l 0x8(a7), a1
        │   0x00001a60      2f6f000c0004   move.l 0xc(a7), 0x4(a7)
        │   0x00001a66      2f6f00100008   move.l 0x10(a7), 0x8(a7)
        │   0x00001a6c      594f           subq.w 0x4, a7
        │   0x00001a6e      48e70114       movem.l d7/a3/a5, -(a7)
        │   0x00001a72      2f6f0018000c   move.l 0x18(a7), 0xc(a7)
        │   0x00001a78      2649           movea.l a1, a3
        │   0x00001a7a      2a48           movea.l a0, a5
        │   0x00001a7c      6034           bra.b 0x1ab2
        │   0x00001a7e      7025           moveq 0x25, d0
        │   0x00001a80      be00           cmp.b d0, d7
        │   0x00001a82      6626           bne.b 0x1aaa
        │   0x00001a84      206f0014       movea.l 0x14(a7), a0
        │   0x00001a88      b010           cmp.b (a0), d0
        │   0x00001a8a      6606           bne.b 0x1a92
        │   0x00001a8c      52af0014       addq.l 0x1, 0x14(a7)
        │   0x00001a90      6018           bra.b 0x1aaa
        │   0x00001a92      2f0b           move.l a3, -(a7)
        │   0x00001a94      2f0d           move.l a5, -(a7)
        │   0x00001a96      43ef0014       lea.l 0x14(a7), a1
        │   0x00001a9a      6100fb54       bsr.w 0x15f0
        │   0x00001a9e      504f           addq.w 0x8, a7
        │   0x00001aa0      4a80           tst.l d0
        │   0x00001aa2      6706           beq.b 0x1aaa
        │   0x00001aa4      2f400014       move.l d0, 0x14(a7)
        │   0x00001aa8      6008           bra.b 0x1ab2
        │   0x00001aaa      204b           movea.l a3, a0
        │   0x00001aac      7000           moveq 0x0, d0
        │   0x00001aae      1007           move.b d7, d0
        │   0x00001ab0      4e95           jsr (a5)
        │   0x00001ab2      206f0014       movea.l 0x14(a7), a0
        │   0x00001ab6      1e18           move.b (a0)+, d7
        │   0x00001ab8      2f480014       move.l a0, 0x14(a7)
        │   0x00001abc      4a07           tst.b d7
        │   0x00001abe      66be           bne.b 0x1a7e
        │   0x00001ac0      4cdf2880       movem.l (a7)+, d7/a3/a5
        │   0x00001ac4      584f           addq.w 0x4, a7
        │   0x00001ac6      4e75           rts
        │   0x00001ac8      202f0004       move.l 0x4(a7), d0
        │   0x00001acc      0280000000ff   andi.l 0xff, d0
        │   0x00001ad2      41ec0108       lea.l 0x108(a4), a0
        │   0x00001ad6      10300001       move.b 0x1(a0, d0.w), d0
        │   0x00001ada      02000004       andi.b 0x4, d0
        │   0x00001ade      4e75           rts
        │   0x00001ae0      2f08           move.l a0, -(a7)
        │   0x00001ae2      2f00           move.l d0, -(a7)
        │   0x00001ae4      4eb9000004ae   jsr 0x4ae.l
        │   0x00001aea      504f           addq.w 0x8, a7
        │   0x00001aec      4e75           rts
        │   0x00001aee      00002f0e       ori.b 0xe, d0
        │   0x00001af2      2c7900000258   movea.l 0x258.l, a6
        │   0x00001af8      222f0008       move.l 0x8(a7), d1
        │   0x00001afc      4eaeffdc       jsr -0x24(a6)
        │   0x00001b00      2c5f           movea.l (a7)+, a6
        │   0x00001b02      4e75           rts
        │   0x00001b04      48e73002       movem.l d2-d3/a6, -(a7)
        │   0x00001b08      2c7900000258   movea.l 0x258.l, a6
        │   0x00001b0e      4cef000e0010   movem.l 0x10(a7), d1-d3
        │   0x00001b14      4eaefeb0       jsr -0x150(a6)
        │   0x00001b18      4cdf400c       movem.l (a7)+, d2-d3/a6
        │   0x00001b1c      4e75           rts
        │   0x00001b1e      000048e7       ori.b 0xe7, d0
        │   0x00001b22      3802           move.w d2, d4
        │   0x00001b24      2c7900000258   movea.l 0x258.l, a6
        │   0x00001b2a      4cef001e0014   movem.l 0x14(a7), d1-d4
        │   0x00001b30      4eaefebc       jsr -0x144(a6)
        │   0x00001b34      4cdf401c       movem.l (a7)+, d2-d4/a6
        │   0x00001b38      4e75           rts
        │   0x00001b3a      000048e7       ori.b 0xe7, d0
        │   0x00001b3e      2002           move.l d2, d0
        │   0x00001b40      2c7900000258   movea.l 0x258.l, a6
        │   0x00001b46      4cef0006000c   movem.l 0xc(a7), d1-d2
        │   0x00001b4c      4eaefc34       jsr -0x3cc(a6)
        │   0x00001b50      4cdf4004       movem.l (a7)+, d2/a6
        │   0x00001b54      4e75           rts
        │   0x00001b56      000048e7       ori.b 0xe7, d0
        │   0x00001b5a      2002           move.l d2, d0
        │   0x00001b5c      2c7900000258   movea.l 0x258.l, a6
        │   0x00001b62      4cef0006000c   movem.l 0xc(a7), d1-d2
        │   0x00001b68      4eaeffe2       jsr -0x1e(a6)
        │   0x00001b6c      4cdf4004       movem.l (a7)+, d2/a6
        │   0x00001b70      4e75           rts
        │   0x00001b72      000048e7       ori.b 0xe7, d0
        │   0x00001b76      3002           move.w d2, d0
        │   0x00001b78      2c7900000258   movea.l 0x258.l, a6
        │   0x00001b7e      4cef000e0010   movem.l 0x10(a7), d1-d3
        │   0x00001b84      4eaefc3a       jsr -0x3c6(a6)
        │   0x00001b88      4cdf400c       movem.l (a7)+, d2-d3/a6
        │   0x00001b8c      4e75           rts
        │   0x00001b8e      000048e7       ori.b 0xe7, d0
        │   0x00001b92      3002           move.w d2, d0
        │   0x00001b94      2c7900000258   movea.l 0x258.l, a6
        │   0x00001b9a      4cef000e0010   movem.l 0x10(a7), d1-d3
        │   0x00001ba0      4eaeffd6       jsr -0x2a(a6)
        │   0x00001ba4      4cdf400c       movem.l (a7)+, d2-d3/a6
        │   0x00001ba8      4e75           rts
        │   0x00001baa      000048e7       ori.b 0xe7, d0
        │   0x00001bae      3002           move.w d2, d0
        │   0x00001bb0      2c7900000258   movea.l 0x258.l, a6
        │   0x00001bb6      4cef000e0010   movem.l 0x10(a7), d1-d3
        │   0x00001bbc      4eaeffbe       jsr -0x42(a6)
        │   0x00001bc0      4cdf400c       movem.l (a7)+, d2-d3/a6
        │   0x00001bc4      4e75           rts
        │   0x00001bc6      00000000       ori.b 0x0, d0
        │   0x00001bca      03ec0000       bset.b d1, 0x0(a4)
        │   0x00001bce      00250000       ori.b 0x0, -(a5)
        │   0x00001bd2      00000000       ori.b 0x0, d0
        │   0x00001bd6      1ac2           move.b d2, (a5)+
        │   0x00001bd8      00000c36       ori.b 0x36, d0
        │   0x00001bdc      00000c28       ori.b 0x28, d0
        │   0x00001be0      00000c0a       ori.b 0xa, d0
        │   0x00001be4      00000bde       ori.b 0xde, d0
        │   0x00001be8      00000bd0       ori.b 0xd0, d0
        │   0x00001bec      00000bbe       ori.b 0xbe, d0
        │   0x00001bf0      00000ba2       ori.b 0xa2, d0
        │   0x00001bf4      00000b94       ori.b 0x94, d0
        │   0x00001bf8      00000b74       ori.b 0x74, d0
        │   0x00001bfc      00000aec       ori.b 0xec, d0
        │   0x00001c00      00000998       ori.b 0x98, d0
        │   0x00001c04      000008c0       ori.b 0xc0, d0
        │   0x00001c08      000008b2       ori.b 0xb2, d0
        │   0x00001c0c      00000894       ori.b 0x94, d0
        │   0x00001c10      0000082e       ori.b 0x2e, d0
        │   0x00001c14      0000081a       ori.b 0x1a, d0
        │   0x00001c18      000007f4       ori.b 0xf4, d0
        │   0x00001c1c      000007b2       ori.b 0xb2, d0
        │   0x00001c20      00000738       ori.b 0x38, d0
        │   0x00001c24      00000724       ori.b 0x24, d0
        │   0x00001c28      00000700       ori.b 0x0, d0
        │   0x00001c2c      000006f2       ori.b 0xf2, d0
        │   0x00001c30      000006e4       ori.b 0xe4, d0
        │   0x00001c34      000006c2       ori.b 0xc2, d0
        │   0x00001c38      000006aa       ori.b 0xaa, d0
        │   0x00001c3c      0000068e       ori.b 0x8e, d0
        │   0x00001c40      0000067c       ori.b 0x7c, d0
        │   0x00001c44      0000066c       ori.b 0x6c, d0
        │   0x00001c48      00000648       ori.b 0x48, d0
        │   0x00001c4c      00000636       ori.b 0x36, d0
        │   0x00001c50      00000624       ori.b 0x24, d0
        │   0x00001c54      00000612       ori.b 0x12, d0
        │   0x00001c58      000005f8       ori.b 0xf8, d0
        │   0x00001c5c      000005f2       ori.b 0xf2, d0
        │   0x00001c60      000005da       ori.b 0xda, d0
        │   0x00001c64      000005d4       ori.b 0xd4, d0
        │   0x00001c68      0000000e       ori.b 0xe, d0
        │   0x00001c6c      00000001       ori.b 0x1, d0
        │   0x00001c70      00001b8e       ori.b 0x8e, d0
        │   0x00001c74      00001b72       ori.b 0x72, d0
        │   0x00001c78      00001b56       ori.b 0x56, d0
        │   0x00001c7c      00001b3a       ori.b 0x3a, d0
        │   0x00001c80      00001b1e       ori.b 0x1e, d0
        │   0x00001c84      00001b02       ori.b 0x2, d0
        │   0x00001c88      00001ae6       ori.b 0xe6, d0
        │   0x00001c8c      00001ad0       ori.b 0xd0, d0
        │   0x00001c90      00000e32       ori.b 0x32, d0
        │   0x00001c94      00000e3c       ori.b 0x3c, d0
        │   0x00001c98      00000e1a       ori.b 0x1a, d0
        │   0x00001c9c      00000e10       ori.b 0x10, d0
        │   0x00001ca0      00000014       ori.b 0x14, d0
        │   0x00001ca4      0000000a       ori.b 0xa, d0
        │   0x00001ca8      00000000       ori.b 0x0, d0
        │   0x00001cac      000003f0       ori.b 0xf0, d0
        │   0x00001cb0      00000002       ori.b 0x2, d0
        │   0x00001cb4      5f53           subq.w 0x7, (a3)
        │   0x00001cb6      6565           bcs.b 0x1d1d
        │   0x00001cb8      6b000000       bmi.w 0x1cba
        │   0x00001cbc      00001b88       ori.b 0x88, d0
        │   0x00001cc0      00000002       ori.b 0x2, d0
        │   0x00001cc4      5f52           subq.w 0x7, (a2)
        │   0x00001cc6      6561           bcs.b 0x1d29
        │   0x00001cc8      64000000       bcc.w 0x1cca
        │   0x00001ccc      00001b6c       ori.b 0x6c, d0
        │   0x00001cd0      00000005       ori.b 0x5, d0
        │   0x00001cd4      5f50           subq.w 0x7, (a0)
        │   0x00001cd6      6172           bsr.b 0x1d4a
        │   0x00001cd8      7365           invalid
        │   0x00001cda      5061           addq.w 0x8, -(a1)
        │   0x00001cdc      7474           moveq 0x74, d2
        │   0x00001cde      6572           bcs.b 0x1d52
        │   0x00001ce0      6e4e           bgt.b 0x1d30
        │   0x00001ce2      6f43           ble.b 0x1d27
        │   0x00001ce4      6173           bsr.b 0x1d59
        │   0x00001ce6      65000000       bcs.w 0x1ce8
        │   0x00001cea      1b500000       move.b (a0), 0x0(a5)
        │   0x00001cee      00025f4f       ori.b 0x4f, d2
        │   0x00001cf2      7065           moveq 0x65, d0
        │   0x00001cf4      6e000000       bgt.w 0x1cf6
        │   0x00001cf8      00001b34       ori.b 0x34, d0
        │   0x00001cfc      00000005       ori.b 0x5, d0
        │   0x00001d00      5f4d           subq.w 0x7, a5
        │   0x00001d02      6174           bsr.b 0x1d78
        │   0x00001d04      6368           bls.b 0x1d6e
        │   0x00001d06      5061           addq.w 0x8, -(a1)
        │   0x00001d08      7474           moveq 0x74, d2
        │   0x00001d0a      6572           bcs.b 0x1d7e
        │   0x00001d0c      6e4e           bgt.b 0x1d5c
        │   0x00001d0e      6f43           ble.b 0x1d53
        │   0x00001d10      6173           bsr.b 0x1d85
        │   0x00001d12      65000000       bcs.w 0x1d14
        │   0x00001d16      1b18           move.b (a0)+, -(a5)
        │   0x00001d18      00000002       ori.b 0x2, d0
        │   0x00001d1c      5f46           subq.w 0x7, d6
        │   0x00001d1e      5265           addq.w 0x1, -(a5)
        │   0x00001d20      6164           bsr.b 0x1d86
        │   0x00001d22      00000000       ori.b 0x0, d0
        │   0x00001d26      1afc0000       move.b 0x0, (a5)+
        │   0x00001d2a      00025f46       ori.b 0x46, d2
        │   0x00001d2e      4765           invalid
        │   0x00001d30      7473           moveq 0x73, d2
        │   0x00001d32      00000000       ori.b 0x0, d0
        │   0x00001d36      1ae0           move.b -(a0), (a5)+
        │   0x00001d38      00000002       ori.b 0x2, d0
        │   0x00001d3c      5f43           subq.w 0x7, d3
        │   0x00001d3e      6c6f           bge.b 0x1daf
        │   0x00001d40      7365           invalid
        │   0x00001d42      00000000       ori.b 0x0, d0
        │   0x00001d46      1acc           invalid
        │   0x00001d48      00000000       ori.b 0x0, d0
        │   0x00001d4c      000003f2       ori.b 0xf2, d0
        │   0x00001d50      000003ea       ori.b 0xea, d0
        │   0x00001d54      00000095       ori.b 0x95, d0
        │   0x00001d58      4242           clr.w d2
        │   0x00001d5a      533a           invalid
        │   0x00001d5c      5553           subq.w 0x2, (a3)
        │   0x00001d5e      4552           invalid
        │   0x00001d60      2e44           movea.l d4, a7
        │   0x00001d62      4154           invalid
        │   0x00001d64      4100           invalid
        │   0x00001d66      5d20           subq.b 0x6, -(a0)
        │   0x00001d68      25732028434f   move.l 0x28(a3, d2.w), 0x434f(a2)
        │   0x00001d6e      4e4e           trap 0xe
        │   0x00001d70      4543           invalid
        │   0x00001d72      5400           addq.b 0x2, d0
        │   0x00001d74      6262           bhi.b 0x1dd8
        │   0x00001d76      733a           invalid
        │   0x00001d78      6e6f           bgt.b 0x1de9
        │   0x00001d7a      6465           bcc.b 0x1de1
        │   0x00001d7c      25642f61       move.l -(a4), 0x2f61(a2)
        │   0x00001d80      6e73           bgt.b 0x1df5
        │   0x00001d82      7765           invalid
        │   0x00001d84      7273           moveq 0x73, d1
        │   0x00001d86      00005363       ori.b 0x63, d0
        │   0x00001d8a      616e           bsr.b 0x1dfa
        │   0x00001d8c      6e69           bgt.b 0x1df7
        │   0x00001d8e      6e67           bgt.b 0x1df7
        │   0x00001d90      206f6e20       movea.l 0x6e20(a7), a0
        │   0x00001d94      4e6f           move usp, a7
        │   0x00001d96      6465           bcc.b 0x1dfd
        │   0x00001d98      2025           move.l -(a5), d0
        │   0x00001d9a      642e           bcc.b 0x1dca
        │   0x00001d9c      2e2e0000       move.l 0x0(a6), d7
        │   0x00001da0      2e00           move.l d0, d7
        │   0x00001da2      464f           invalid
        │   0x00001da4      554e           subq.w 0x2, a6
        │   0x00001da6      4421           neg.b -(a1)
        │   0x00001da8      00000000       ori.b 0x0, d0
        │   0x00001dac      00004e4f       ori.b 0x4f, d0
        │   0x00001db0      5420           addq.b 0x2, -(a0)
        │   0x00001db2      464f           invalid
        │   0x00001db4      554e           subq.w 0x2, a6
        │   0x00001db6      4421           neg.b -(a1)
        │   0x00001db8      00005365       ori.b 0x65, d0
        │   0x00001dbc      6172           bsr.b 0x1e30
        │   0x00001dbe      6368           bls.b 0x1e28
        │   0x00001dc0      6564           bcs.b 0x1e26
        │   0x00001dc2      2066           movea.l -(a6), a0
        │   0x00001dc4      6f72           ble.b 0x1e38
        │   0x00001dc6      2025           move.l -(a5), d0
        │   0x00001dc8      732c           invalid
        │   0x00001dca      204e           movea.l a6, a0
        │   0x00001dcc      6f74           ble.b 0x1e42
        │   0x00001dce      2066           movea.l -(a6), a0
        │   0x00001dd0      6f75           ble.b 0x1e47
        │   0x00001dd2      6e64           bgt.b 0x1e38
        │   0x00001dd4      2100           move.l d0, -(a0)
        │   0x00001dd6      4765           invalid
        │   0x00001dd8      7441           moveq 0x41, d2
        │   0x00001dda      6e73           bgt.b 0x1e4f
        │   0x00001ddc      7765           invalid
        │   0x00001dde      7220           moveq 0x20, d1
        │   0x00001de0      7631           moveq 0x31, d3
        │   0x00001de2      2e322062       move.l 0x62(a2, d2.w), d7
        │   0x00001de6      7920           invalid
        │   0x00001de8      4167           invalid
        │   0x00001dea      616d           bsr.b 0x1e59
        │   0x00001dec      656d           bcs.b 0x1e5b
        │   0x00001dee      6e6f           bgt.b 0x1e5f
        │   0x00001df0      6e20           bgt.b 0x1e12
        │   0x00001df2      2f20           move.l -(a0), -(a7)
        │   0x00001df4      4d6f           invalid
        │   0x00001df6      6d65           blt.b 0x1e5d
        │   0x00001df8      6e74           bgt.b 0x1e6e
        │   0x00001dfa      20323200       move.l (a2, d3.w * 2), d0
        │   0x00001dfe      afaf           invalid
        │   0x00001e00      afaf           invalid
        │   0x00001e02      afaf           invalid
        │   0x00001e04      afaf           invalid
        │   0x00001e06      afaf           invalid
        │   0x00001e08      afaf           invalid
        │   0x00001e0a      afaf           invalid
        │   0x00001e0c      afaf           invalid
        │   0x00001e0e      afaf           invalid
        │   0x00001e10      afaf           invalid
        │   0x00001e12      afaf           invalid
        │   0x00001e14      afaf           invalid
        │   0x00001e16      afaf           invalid
        │   0x00001e18      afaf           invalid
        │   0x00001e1a      afaf           invalid
        │   0x00001e1c      afaf           invalid
        │   0x00001e1e      afaf           invalid
        │   0x00001e20      afaf           invalid
        │   0x00001e22      afaf           invalid
        │   0x00001e24      af00           invalid
        │   0x00001e26      0000456e       ori.b 0x6e, d0
        │   0x00001e2a      7465           moveq 0x65, d2
        │   0x00001e2c      7220           moveq 0x20, d1
        │   0x00001e2e      6861           bvc.b 0x1e91
        │   0x00001e30      6e64           bgt.b 0x1e96
        │   0x00001e32      6c65           bge.b 0x1e99
        │   0x00001e34      2f75736572..   move.l ([0x726e, a5]), 0x7220(a7)
        │   0x00001e3c      3e3a2000       move.w 0x3e3e(pc), d7
        │   0x00001e40      5b25           subq.b 0x5, -(a5)
        │   0x00001e42      735d           invalid
        │   0x00001e44      2000           move.l d0, d0
        │   0x00001e46      00000000       ori.b 0x0, d0
        │   0x00001e4a      00000000       ori.b 0x0, d0
        │   0x00001e4e      0dd8           bset.b d6, (a0)+
        │   0x00001e50      00000000       ori.b 0x0, d0
        │   0x00001e54      00000e48       ori.b 0x48, d0
        │   0x00001e58      00000000       ori.b 0x0, d0
        │   0x00001e5c      00001000       ori.b 0x0, d0
        │   0x00001e60      00202020       ori.b 0x20, -(a0)
        │   0x00001e64      2020           move.l -(a0), d0
        │   0x00001e66      2020           move.l -(a0), d0
        │   0x00001e68      2020           move.l -(a0), d0
        │   0x00001e6a      28282828       move.l 0x2828(a0), d4
        │   0x00001e6e      2820           move.l -(a0), d4
        │   0x00001e70      2020           move.l -(a0), d0
        │   0x00001e72      2020           move.l -(a0), d0
        │   0x00001e74      2020           move.l -(a0), d0
        │   0x00001e76      2020           move.l -(a0), d0
        │   0x00001e78      2020           move.l -(a0), d0
        │   0x00001e7a      2020           move.l -(a0), d0
        │   0x00001e7c      2020           move.l -(a0), d0
        │   0x00001e7e      2020           move.l -(a0), d0
        │   0x00001e80      2048           movea.l a0, a0
        │   0x00001e82      1010           move.b (a0), d0
        │   0x00001e84      1010           move.b (a0), d0
        │   0x00001e86      1010           move.b (a0), d0
        │   0x00001e88      1010           move.b (a0), d0
        │   0x00001e8a      1010           move.b (a0), d0
        │   0x00001e8c      1010           move.b (a0), d0
        │   0x00001e8e      1010           move.b (a0), d0
        │   0x00001e90      1084           move.b d4, (a0)
        │   0x00001e92      8484           or.l d4, d2
        │   0x00001e94      8484           or.l d4, d2
        │   0x00001e96      8484           or.l d4, d2
        │   0x00001e98      8484           or.l d4, d2
        │   0x00001e9a      8410           or.b (a0), d2
        │   0x00001e9c      1010           move.b (a0), d0
        │   0x00001e9e      1010           move.b (a0), d0
        │   0x00001ea0      1010           move.b (a0), d0
        │   0x00001ea2      8181           invalid
        │   0x00001ea4      8181           invalid
        │   0x00001ea6      8181           invalid
        │   0x00001ea8      0101           btst.l d0, d1
        │   0x00001eaa      0101           btst.l d0, d1
        │   0x00001eac      0101           btst.l d0, d1
        │   0x00001eae      0101           btst.l d0, d1
        │   0x00001eb0      0101           btst.l d0, d1
        │   0x00001eb2      0101           btst.l d0, d1
        │   0x00001eb4      0101           btst.l d0, d1
        │   0x00001eb6      0101           btst.l d0, d1
        │   0x00001eb8      0101           btst.l d0, d1
        │   0x00001eba      0101           btst.l d0, d1
        │   0x00001ebc      1010           move.b (a0), d0
        │   0x00001ebe      1010           move.b (a0), d0
        │   0x00001ec0      1010           move.b (a0), d0
        │   0x00001ec2      8282           or.l d2, d1
        │   0x00001ec4      8282           or.l d2, d1
        │   0x00001ec6      8282           or.l d2, d1
        │   0x00001ec8      02020202       andi.b 0x2, d2
        │   0x00001ecc      02020202       andi.b 0x2, d2
        │   0x00001ed0      02020202       andi.b 0x2, d2
        │   0x00001ed4      02020202       andi.b 0x2, d2
        │   0x00001ed8      02020202       andi.b 0x2, d2
        │   0x00001edc      1010           move.b (a0), d0
        │   0x00001ede      1010           move.b (a0), d0
        │   0x00001ee0      2000           move.l d0, d0
        │   0x00001ee2      00000000       ori.b 0x0, d0
        │   0x00001ee6      00000000       ori.b 0x0, d0
        │   0x00001eea      00000000       ori.b 0x0, d0
        │   0x00001eee      00000000       ori.b 0x0, d0
        │   0x00001ef2      00000000       ori.b 0x0, d0
        │   0x00001ef6      00000000       ori.b 0x0, d0
        │   0x00001efa      00000000       ori.b 0x0, d0
        │   0x00001efe      00000000       ori.b 0x0, d0
        │   0x00001f02      00000000       ori.b 0x0, d0
        │   0x00001f06      00000000       ori.b 0x0, d0
        │   0x00001f0a      00000000       ori.b 0x0, d0
        │   0x00001f0e      00000000       ori.b 0x0, d0
        │   0x00001f12      00000000       ori.b 0x0, d0
        │   0x00001f16      00000000       ori.b 0x0, d0
        │   0x00001f1a      00000000       ori.b 0x0, d0
        │   0x00001f1e      00000000       ori.b 0x0, d0
        │   0x00001f22      00000000       ori.b 0x0, d0
        │   0x00001f26      00000000       ori.b 0x0, d0
        │   0x00001f2a      00000000       ori.b 0x0, d0
        │   0x00001f2e      00000000       ori.b 0x0, d0
        │   0x00001f32      00000000       ori.b 0x0, d0
        │   0x00001f36      00000000       ori.b 0x0, d0
        │   0x00001f3a      00000000       ori.b 0x0, d0
        │   0x00001f3e      00000000       ori.b 0x0, d0
        │   0x00001f42      00000000       ori.b 0x0, d0
        │   0x00001f46      00000000       ori.b 0x0, d0
        │   0x00001f4a      00000000       ori.b 0x0, d0
        │   0x00001f4e      00000000       ori.b 0x0, d0
        │   0x00001f52      00000000       ori.b 0x0, d0
        │   0x00001f56      00000000       ori.b 0x0, d0
        │   0x00001f5a      00000000       ori.b 0x0, d0
        │   0x00001f5e      00000000       ori.b 0x0, d0
        │   0x00001f62      00000000       ori.b 0x0, d0
        │   0x00001f66      00f4           invalid
        │   0x00001f68      00000fa0       ori.b 0xa0, d0
        │   0x00001f6c      ffff           invalid
        │   0x00001f6e      0000000e       ori.b 0xe, d0
        │   0x00001f72      000e           invalid
        │   0x00001f74      00000000       ori.b 0x0, d0
        │   0x00001f78      00000000       ori.b 0x0, d0
        │   0x00001f7c      00000000       ori.b 0x0, d0
        │   0x00001f80      ffff           invalid
        │   0x00001f82      00000004       ori.b 0x4, d0
        │   0x00001f86      00040000       ori.b 0x0, d4
        │   0x00001f8a      00000000       ori.b 0x0, d0
        │   0x00001f8e      100e           invalid
        │   0x00001f90      00000214       ori.b 0x14, d0
        │   0x00001f94      ffff           invalid
        │   0x00001f96      00000004       ori.b 0x4, d0
        │   0x00001f9a      00040000       ori.b 0x0, d4
        │   0x00001f9e      00000000       ori.b 0x0, d0
        │   0x00001fa2      1024           move.b -(a4), d0
        │   0x00001fa4      00000000       ori.b 0x0, d0
        │   0x00001fa8      00000000       ori.b 0x0, d0
        │   0x00001fac      000003ec       ori.b 0xec, d0
        │   0x00001fb0      00000004       ori.b 0x4, d0
        │   0x00001fb4      00000000       ori.b 0x0, d0
        │   0x00001fb8      00000248       ori.b 0x48, d0
        │   0x00001fbc      00000234       ori.b 0x34, d0
        │   0x00001fc0      000000fc       ori.b 0xfc, d0
        │   0x00001fc4      000000f4       ori.b 0xf4, d0
        │   0x00001fc8      00000002       ori.b 0x2, d0
        │   0x00001fcc      00000001       ori.b 0x1, d0
        │   0x00001fd0      00000238       ori.b 0x38, d0
        │   0x00001fd4      0000020c       ori.b 0xc, d0
        │   0x00001fd8      00000000       ori.b 0x0, d0
        │   0x00001fdc      000003f2       ori.b 0xf2, d0
        │   0x00001fe0      ffff           invalid
        │   0x00001fe2      ffff           invalid
        │   0x00001fe4      ffff           invalid
        │   0x00001fe6      ffff           invalid
        │   0x00001fe8      ffff           invalid
        │   0x00001fea      ffff           invalid
        │   0x00001fec      ffff           invalid
        │   0x00001fee      ffff           invalid
        │   0x00001ff0      ffff           invalid
        │   0x00001ff2      ffff           invalid
        │   0x00001ff4      ffff           invalid
        │   0x00001ff6      ffff           invalid
        │   0x00001ff8      ffff           invalid
        │   0x00001ffa      ffff           invalid
        │   0x00001ffc      ffff           invalid
        │   0x00001ffe      ffff           invalid
        │   0x00002000      ffff           invalid
        │   0x00002002      ffff           invalid
        │   0x00002004      ffff           invalid
        │   0x00002006      ffff           invalid
        │   0x00002008      ffff           invalid
        │   0x0000200a      ffff           invalid
        │   0x0000200c      ffff           invalid
        │   0x0000200e      ffff           invalid
        │   0x00002010      ffff           invalid
        │   0x00002012      ffff           invalid
        │   0x00002014      ffff           invalid
        │   0x00002016      ffff           invalid
        │   0x00002018      ffff           invalid
        │   0x0000201a      ffff           invalid
        │   0x0000201c      ffff           invalid
        │   0x0000201e      ffff           invalid
        │   0x00002020      ffff           invalid
        │   0x00002022      ffff           invalid
        │   0x00002024      ffff           invalid
        │   0x00002026      ffff           invalid
        │   0x00002028      ffff           invalid
        │   0x0000202a      ffff           invalid
        │   0x0000202c      ffff           invalid
        │   0x0000202e      ffff           invalid
        │   0x00002030      ffff           invalid
        │   0x00002032      ffff           invalid
        │   0x00002034      ffff           invalid
        │   0x00002036      ffff           invalid
        │   0x00002038      ffff           invalid
        │   0x0000203a      ffff           invalid
        │   0x0000203c      ffff           invalid
        │   0x0000203e      ffff           invalid
        │   0x00002040      ffff           invalid
        │   0x00002042      ffff           invalid
        │   0x00002044      ffff           invalid
        │   0x00002046      ffff           invalid
        │   0x00002048      ffff           invalid
        │   0x0000204a      ffff           invalid
        │   0x0000204c      ffff           invalid
        │   0x0000204e      ffff           invalid
        │   0x00002050      ffff           invalid
        │   0x00002052      ffff           invalid
        │   0x00002054      ffff           invalid
        │   0x00002056      ffff           invalid
        │   0x00002058      ffff           invalid
        │   0x0000205a      ffff           invalid
        │   0x0000205c      ffff           invalid
        │   0x0000205e      ffff           invalid
        │   0x00002060      ffff           invalid
        │   0x00002062      ffff           invalid
        │   0x00002064      ffff           invalid
        │   0x00002066      ffff           invalid
        │   0x00002068      ffff           invalid
        │   0x0000206a      ffff           invalid
        │   0x0000206c      ffff           invalid
        │   0x0000206e      ffff           invalid
        │   0x00002070      ffff           invalid
        │   0x00002072      ffff           invalid
        │   0x00002074      ffff           invalid
        │   0x00002076      ffff           invalid
        │   0x00002078      ffff           invalid
        │   0x0000207a      ffff           invalid
        │   0x0000207c      ffff           invalid
        │   0x0000207e      ffff           invalid
        │   0x00002080      ffff           invalid
        │   0x00002082      ffff           invalid
        │   0x00002084      ffff           invalid
        │   0x00002086      ffff           invalid
        │   0x00002088      ffff           invalid
        │   0x0000208a      ffff           invalid
        │   0x0000208c      ffff           invalid
        │   0x0000208e      ffff           invalid
        │   0x00002090      ffff           invalid
        │   0x00002092      ffff           invalid
        │   0x00002094      ffff           invalid
        │   0x00002096      ffff           invalid
        │   0x00002098      ffff           invalid
        │   0x0000209a      ffff           invalid
        │   0x0000209c      ffff           invalid
        │   0x0000209e      ffff           invalid
        │   0x000020a0      ffff           invalid
        │   0x000020a2      ffff           invalid
        │   0x000020a4      ffff           invalid
        │   0x000020a6      ffff           invalid
        │   0x000020a8      ffff           invalid
        │   0x000020aa      ffff           invalid
        │   0x000020ac      ffff           invalid
        │   0x000020ae      ffff           invalid
        │   0x000020b0      ffff           invalid
        │   0x000020b2      ffff           invalid
        │   0x000020b4      ffff           invalid
        │   0x000020b6      ffff           invalid
        │   0x000020b8      ffff           invalid
        │   0x000020ba      ffff           invalid
        │   0x000020bc      ffff           invalid
        │   0x000020be      ffff           invalid
        │   0x000020c0      ffff           invalid
        │   0x000020c2      ffff           invalid
        │   0x000020c4      ffff           invalid
        │   0x000020c6      ffff           invalid
        │   0x000020c8      ffff           invalid
        │   0x000020ca      ffff           invalid
        │   0x000020cc      ffff           invalid
        │   0x000020ce      ffff           invalid
        │   0x000020d0      ffff           invalid
        │   0x000020d2      ffff           invalid
        │   0x000020d4      ffff           invalid
        │   0x000020d6      ffff           invalid
        │   0x000020d8      ffff           invalid
        │   0x000020da      ffff           invalid
        │   0x000020dc      ffff           invalid
        │   0x000020de      ffff           invalid
        │   0x000020e0      ffff           invalid
        │   0x000020e2      ffff           invalid
        │   0x000020e4      ffff           invalid
        │   0x000020e6      ffff           invalid
        │   0x000020e8      ffff           invalid
        │   0x000020ea      ffff           invalid
        │   0x000020ec      ffff           invalid
        │   0x000020ee      ffff           invalid
        │   0x000020f0      ffff           invalid
        │   0x000020f2      ffff           invalid
        │   0x000020f4      ffff           invalid
        │   0x000020f6      ffff           invalid
        │   0x000020f8      ffff           invalid
        │   0x000020fa      ffff           invalid
        │   0x000020fc      ffff           invalid
        │   0x000020fe      ffff           invalid
        │   0x00002100      ffff           invalid
        │   0x00002102      ffff           invalid
        │   0x00002104      ffff           invalid
        │   0x00002106      ffff           invalid
        │   0x00002108      ffff           invalid
        │   0x0000210a      ffff           invalid
        │   0x0000210c      ffff           invalid
        │   0x0000210e      ffff           invalid
        │   0x00002110      ffff           invalid
        │   0x00002112      ffff           invalid
        │   0x00002114      ffff           invalid
        │   0x00002116      ffff           invalid
        │   0x00002118      ffff           invalid
        │   0x0000211a      ffff           invalid
        │   0x0000211c      ffff           invalid
        │   0x0000211e      ffff           invalid
        │   0x00002120      ffff           invalid
        │   0x00002122      ffff           invalid
        │   0x00002124      ffff           invalid
        │   0x00002126      ffff           invalid
        │   0x00002128      ffff           invalid
        │   0x0000212a      ffff           invalid
        │   0x0000212c      ffff           invalid
        │   0x0000212e      ffff           invalid
        │   0x00002130      ffff           invalid
        │   0x00002132      ffff           invalid
        │   0x00002134      ffff           invalid
        │   0x00002136      ffff           invalid
        │   0x00002138      ffff           invalid
        │   0x0000213a      ffff           invalid
        │   0x0000213c      ffff           invalid
        │   0x0000213e      ffff           invalid
        │   0x00002140      ffff           invalid
        │   0x00002142      ffff           invalid
        │   0x00002144      ffff           invalid
        │   0x00002146      ffff           invalid
        │   0x00002148      ffff           invalid
        │   0x0000214a      ffff           invalid
        │   0x0000214c      ffff           invalid
        │   0x0000214e      ffff           invalid
        │   0x00002150      ffff           invalid
        │   0x00002152      ffff           invalid
        │   0x00002154      ffff           invalid
        │   0x00002156      ffff           invalid
        │   0x00002158      ffff           invalid
        │   0x0000215a      ffff           invalid
        │   0x0000215c      ffff           invalid
        │   0x0000215e      ffff           invalid
        │   0x00002160      ffff           invalid
        │   0x00002162      ffff           invalid
        │   0x00002164      ffff           invalid
        │   0x00002166      ffff           invalid
        │   0x00002168      ffff           invalid
        │   0x0000216a      ffff           invalid
        │   0x0000216c      ffff           invalid
        │   0x0000216e      ffff           invalid
        │   0x00002170      ffff           invalid
        │   0x00002172      ffff           invalid
        │   0x00002174      ffff           invalid
        │   0x00002176      ffff           invalid
        │   0x00002178      ffff           invalid
        │   0x0000217a      ffff           invalid
        │   0x0000217c      ffff           invalid
        │   0x0000217e      ffff           invalid
        │   0x00002180      ffff           invalid
        │   0x00002182      ffff           invalid
        │   0x00002184      ffff           invalid
        │   0x00002186      ffff           invalid
        │   0x00002188      ffff           invalid
        │   0x0000218a      ffff           invalid
        │   0x0000218c      ffff           invalid
        │   0x0000218e      ffff           invalid
        │   0x00002190      ffff           invalid
        │   0x00002192      ffff           invalid
        │   0x00002194      ffff           invalid
        │   0x00002196      ffff           invalid
        │   0x00002198      ffff           invalid
        │   0x0000219a      ffff           invalid
        │   0x0000219c      ffff           invalid
        │   0x0000219e      ffff           invalid
        │   0x000021a0      ffff           invalid
        │   0x000021a2      ffff           invalid
        │   0x000021a4      ffff           invalid
        │   0x000021a6      ffff           invalid
        │   0x000021a8      ffff           invalid
        │   0x000021aa      ffff           invalid
        │   0x000021ac      ffff           invalid
        │   0x000021ae      ffff           invalid
        │   0x000021b0      ffff           invalid
        │   0x000021b2      ffff           invalid
        │   0x000021b4      ffff           invalid
        │   0x000021b6      ffff           invalid
        │   0x000021b8      ffff           invalid
        │   0x000021ba      ffff           invalid
        │   0x000021bc      ffff           invalid
        │   0x000021be      ffff           invalid
        │   0x000021c0      ffff           invalid
        │   0x000021c2      ffff           invalid
        │   0x000021c4      ffff           invalid
        │   0x000021c6      ffff           invalid
        │   0x000021c8      ffff           invalid
        │   0x000021ca      ffff           invalid
        │   0x000021cc      ffff           invalid
        │   0x000021ce      ffff           invalid
        │   0x000021d0      ffff           invalid
        │   0x000021d2      ffff           invalid
        │   0x000021d4      ffff           invalid
        │   0x000021d6      ffff           invalid
        │   0x000021d8      ffff           invalid
        │   0x000021da      ffff           invalid
        │   0x000021dc      ffff           invalid
        │   0x000021de      ffff           invalid
        │   0x000021e0      ffff           invalid
        │   0x000021e2      ffff           invalid
        │   0x000021e4      ffff           invalid
        │   0x000021e6      ffff           invalid
        │   0x000021e8      ffff           invalid
        │   0x000021ea      ffff           invalid
        │   0x000021ec      ffff           invalid
        │   0x000021ee      ffff           invalid
        │   0x000021f0      ffff           invalid
        │   0x000021f2      ffff           invalid
        │   0x000021f4      ffff           invalid
        │   0x000021f6      ffff           invalid
        │   0x000021f8      ffff           invalid
        │   0x000021fa      ffff           invalid
        │   0x000021fc      ffff           invalid
        │   0x000021fe      ffff           invalid
        │   0x00002200      ffff           invalid
        │   0x00002202      ffff           invalid
        │   0x00002204      ffff           invalid
        │   0x00002206      ffff           invalid
        │   0x00002208      ffff           invalid
        │   0x0000220a      ffff           invalid
        │   0x0000220c      ffff           invalid
        │   0x0000220e      ffff           invalid
        │   0x00002210      ffff           invalid
        │   0x00002212      ffff           invalid
        │   0x00002214      ffff           invalid
        │   0x00002216      ffff           invalid
        │   0x00002218      ffff           invalid
        │   0x0000221a      ffff           invalid
        │   0x0000221c      ffff           invalid
        │   0x0000221e      ffff           invalid
        │   0x00002220      ffff           invalid
        │   0x00002222      ffff           invalid
        │   0x00002224      ffff           invalid
        │   0x00002226      ffff           invalid
        │   0x00002228      ffff           invalid
        │   0x0000222a      ffff           invalid
        │   0x0000222c      ffff           invalid
        │   0x0000222e      ffff           invalid
        │   0x00002230      ffff           invalid
        │   0x00002232      ffff           invalid
        │   0x00002234      ffff           invalid
        │   0x00002236      ffff           invalid
        │   0x00002238      ffff           invalid
        │   0x0000223a      ffff           invalid
        │   0x0000223c      ffff           invalid
        │   0x0000223e      ffff           invalid
        │   0x00002240      ffff           invalid
        │   0x00002242      ffff           invalid
        │   0x00002244      ffff           invalid
        │   0x00002246      ffff           invalid
        │   0x00002248      ffff           invalid
        │   0x0000224a      ffff           invalid
        │   0x0000224c      ffff           invalid
        │   0x0000224e      ffff           invalid
        │   0x00002250      ffff           invalid
        │   0x00002252      ffff           invalid
        │   0x00002254      ffff           invalid
        │   0x00002256      ffff           invalid
        │   0x00002258      ffff           invalid
        │   0x0000225a      ffff           invalid
        │   0x0000225c      ffff           invalid
        │   0x0000225e      ffff           invalid
        │   0x00002260      ffff           invalid
        │   0x00002262      ffff           invalid
        │   0x00002264      ffff           invalid
        │   0x00002266      ffff           invalid
        │   0x00002268      ffff           invalid
        │   0x0000226a      ffff           invalid
        │   0x0000226c      ffff           invalid
        │   0x0000226e      ffff           invalid
        │   0x00002270      ffff           invalid
        │   0x00002272      ffff           invalid
        │   0x00002274      ffff           invalid
        │   0x00002276      ffff           invalid
        │   0x00002278      ffff           invalid
        │   0x0000227a      ffff           invalid
        │   0x0000227c      ffff           invalid
        │   0x0000227e      ffff           invalid
        │   0x00002280      ffff           invalid
        │   0x00002282      ffff           invalid
        │   0x00002284      ffff           invalid
        │   0x00002286      ffff           invalid
        │   0x00002288      ffff           invalid
        │   0x0000228a      ffff           invalid
        │   0x0000228c      ffff           invalid
        │   0x0000228e      ffff           invalid
        │   0x00002290      ffff           invalid
        │   0x00002292      ffff           invalid
        │   0x00002294      ffff           invalid
        │   0x00002296      ffff           invalid
        │   0x00002298      ffff           invalid
        │   0x0000229a      ffff           invalid
        │   0x0000229c      ffff           invalid
        │   0x0000229e      ffff           invalid
        │   0x000022a0      ffff           invalid
        │   0x000022a2      ffff           invalid
        │   0x000022a4      ffff           invalid
        │   0x000022a6      ffff           invalid
        │   0x000022a8      ffff           invalid
        │   0x000022aa      ffff           invalid
        │   0x000022ac      ffff           invalid
        │   0x000022ae      ffff           invalid
        │   0x000022b0      ffff           invalid
        │   0x000022b2      ffff           invalid
        │   0x000022b4      ffff           invalid
        │   0x000022b6      ffff           invalid
        │   0x000022b8      ffff           invalid
        │   0x000022ba      ffff           invalid
        │   0x000022bc      ffff           invalid
        │   0x000022be      ffff           invalid
        │   0x000022c0      ffff           invalid
        │   0x000022c2      ffff           invalid
        │   0x000022c4      ffff           invalid
        │   0x000022c6      ffff           invalid
        │   0x000022c8      ffff           invalid
        │   0x000022ca      ffff           invalid
        │   0x000022cc      ffff           invalid
        │   0x000022ce      ffff           invalid
        │   0x000022d0      ffff           invalid
        │   0x000022d2      ffff           invalid
        │   0x000022d4      ffff           invalid
        │   0x000022d6      ffff           invalid
        │   0x000022d8      ffff           invalid
        │   0x000022da      ffff           invalid
        │   0x000022dc      ffff           invalid
        │   0x000022de      ffff           invalid
        │   0x000022e0      ffff           invalid
        │   0x000022e2      ffff           invalid
        │   0x000022e4      ffff           invalid
        │   0x000022e6      ffff           invalid
        │   0x000022e8      ffff           invalid
        │   0x000022ea      ffff           invalid
        │   0x000022ec      ffff           invalid
        │   0x000022ee      ffff           invalid
        │   0x000022f0      ffff           invalid
        │   0x000022f2      ffff           invalid
        │   0x000022f4      ffff           invalid
        │   0x000022f6      ffff           invalid
        │   0x000022f8      ffff           invalid
        │   0x000022fa      ffff           invalid
        │   0x000022fc      ffff           invalid
        │   0x000022fe      ffff           invalid
        │   0x00002300      ffff           invalid
        │   0x00002302      ffff           invalid
        │   0x00002304      ffff           invalid
        │   0x00002306      ffff           invalid
        │   0x00002308      ffff           invalid
        │   0x0000230a      ffff           invalid
        │   0x0000230c      ffff           invalid
        │   0x0000230e      ffff           invalid
        │   0x00002310      ffff           invalid
        │   0x00002312      ffff           invalid
        │   0x00002314      ffff           invalid
        │   0x00002316      ffff           invalid
        │   0x00002318      ffff           invalid
        │   0x0000231a      ffff           invalid
        │   0x0000231c      ffff           invalid
        │   0x0000231e      ffff           invalid
        │   0x00002320      ffff           invalid
        │   0x00002322      ffff           invalid
        │   0x00002324      ffff           invalid
        │   0x00002326      ffff           invalid
        │   0x00002328      ffff           invalid
        │   0x0000232a      ffff           invalid
        │   0x0000232c      ffff           invalid
        │   0x0000232e      ffff           invalid
        │   0x00002330      ffff           invalid
        │   0x00002332      ffff           invalid
        │   0x00002334      ffff           invalid
        │   0x00002336      ffff           invalid
        │   0x00002338      ffff           invalid
        │   0x0000233a      ffff           invalid
        │   0x0000233c      ffff           invalid
        │   0x0000233e      ffff           invalid
        │   0x00002340      ffff           invalid
        │   0x00002342      ffff           invalid
        │   0x00002344      ffff           invalid
        │   0x00002346      ffff           invalid
        │   0x00002348      ffff           invalid
        │   0x0000234a      ffff           invalid
        │   0x0000234c      ffff           invalid
        │   0x0000234e      ffff           invalid
        │   0x00002350      ffff           invalid
        │   0x00002352      ffff           invalid
        │   0x00002354      ffff           invalid
        │   0x00002356      ffff           invalid
        │   0x00002358      ffff           invalid
        │   0x0000235a      ffff           invalid
        │   0x0000235c      ffff           invalid
        │   0x0000235e      ffff           invalid
        │   0x00002360      ffff           invalid
        │   0x00002362      ffff           invalid
        │   0x00002364      ffff           invalid
        │   0x00002366      ffff           invalid
        │   0x00002368      ffff           invalid
        │   0x0000236a      ffff           invalid
        │   0x0000236c      ffff           invalid
        │   0x0000236e      ffff           invalid
        │   0x00002370      ffff           invalid
        │   0x00002372      ffff           invalid
        │   0x00002374      ffff           invalid
        │   0x00002376      ffff           invalid
        │   0x00002378      ffff           invalid
        │   0x0000237a      ffff           invalid
        │   0x0000237c      ffff           invalid
        │   0x0000237e      ffff           invalid
        │   0x00002380      ffff           invalid
        │   0x00002382      ffff           invalid
        │   0x00002384      ffff           invalid
        │   0x00002386      ffff           invalid
        │   0x00002388      ffff           invalid
        │   0x0000238a      ffff           invalid
        │   0x0000238c      ffff           invalid
        │   0x0000238e      ffff           invalid
        │   0x00002390      ffff           invalid
        │   0x00002392      ffff           invalid
        │   0x00002394      ffff           invalid
        │   0x00002396      ffff           invalid
        │   0x00002398      ffff           invalid
        │   0x0000239a      ffff           invalid
        │   0x0000239c      ffff           invalid
        │   0x0000239e      ffff           invalid
        │   0x000023a0      ffff           invalid
        │   0x000023a2      ffff           invalid
        │   0x000023a4      ffff           invalid
        │   0x000023a6      ffff           invalid
        │   0x000023a8      ffff           invalid
        │   0x000023aa      ffff           invalid
        │   0x000023ac      ffff           invalid
        │   0x000023ae      ffff           invalid
        │   0x000023b0      ffff           invalid
        │   0x000023b2      ffff           invalid
        │   0x000023b4      ffff           invalid
        │   0x000023b6      ffff           invalid
        │   0x000023b8      ffff           invalid
        │   0x000023ba      ffff           invalid
        │   0x000023bc      ffff           invalid
        │   0x000023be      ffff           invalid
        │   0x000023c0      ffff           invalid
        │   0x000023c2      ffff           invalid
        │   0x000023c4      ffff           invalid
        │   0x000023c6      ffff           invalid
        │   0x000023c8      ffff           invalid
        │   0x000023ca      ffff           invalid
        │   0x000023cc      ffff           invalid
        │   0x000023ce      ffff           invalid
        │   0x000023d0      ffff           invalid
        │   0x000023d2      ffff           invalid
        │   0x000023d4      ffff           invalid
        │   0x000023d6      ffff           invalid
        │   0x000023d8      ffff           invalid
        │   0x000023da      ffff           invalid
        │   0x000023dc      ffff           invalid
        │   0x000023de      ffff           invalid
        │   0x000023e0      ffff           invalid
        │   0x000023e2      ffff           invalid
        │   0x000023e4      ffff           invalid
        │   0x000023e6      ffff           invalid
        │   0x000023e8      ffff           invalid
        │   0x000023ea      ffff           invalid
        │   0x000023ec      ffff           invalid
        │   0x000023ee      ffff           invalid
        │   0x000023f0      ffff           invalid
        │   0x000023f2      ffff           invalid
        │   0x000023f4      ffff           invalid
        │   0x000023f6      ffff           invalid
        │   0x000023f8      ffff           invalid
        │   0x000023fa      ffff           invalid
        │   0x000023fc      ffff           invalid
        │   0x000023fe      ffff           invalid
        │   0x00002400      ffff           invalid
        │   0x00002402      ffff           invalid
        │   0x00002404      ffff           invalid
        │   0x00002406      ffff           invalid
        │   0x00002408      ffff           invalid
        │   0x0000240a      ffff           invalid
        │   0x0000240c      ffff           invalid
        │   0x0000240e      ffff           invalid
        │   0x00002410      ffff           invalid
        │   0x00002412      ffff           invalid
        │   0x00002414      ffff           invalid
        │   0x00002416      ffff           invalid
        │   0x00002418      ffff           invalid
        │   0x0000241a      ffff           invalid
        │   0x0000241c      ffff           invalid
        │   0x0000241e      ffff           invalid
        │   0x00002420      ffff           invalid
        │   0x00002422      ffff           invalid
        │   0x00002424      ffff           invalid
        │   0x00002426      ffff           invalid
        │   0x00002428      ffff           invalid
        │   0x0000242a      ffff           invalid
        │   0x0000242c      ffff           invalid
        │   0x0000242e      ffff           invalid
        │   0x00002430      ffff           invalid
        │   0x00002432      ffff           invalid
        │   0x00002434      ffff           invalid
        │   0x00002436      ffff           invalid
        │   0x00002438      ffff           invalid
        │   0x0000243a      ffff           invalid
        │   0x0000243c      ffff           invalid
        │   0x0000243e      ffff           invalid
        │   0x00002440      ffff           invalid
        │   0x00002442      ffff           invalid
        │   0x00002444      ffff           invalid
        │   0x00002446      ffff           invalid
        │   0x00002448      ffff           invalid
        │   0x0000244a      ffff           invalid
        │   0x0000244c      ffff           invalid
        │   0x0000244e      ffff           invalid
        │   0x00002450      ffff           invalid
        │   0x00002452      ffff           invalid
        │   0x00002454      ffff           invalid
        │   0x00002456      ffff           invalid
        │   0x00002458      ffff           invalid
        │   0x0000245a      ffff           invalid
        │   0x0000245c      ffff           invalid
        │   0x0000245e      ffff           invalid
        │   0x00002460      ffff           invalid
        │   0x00002462      ffff           invalid
        │   0x00002464      ffff           invalid
        │   0x00002466      ffff           invalid
        │   0x00002468      ffff           invalid
        │   0x0000246a      ffff           invalid
        │   0x0000246c      ffff           invalid
        │   0x0000246e      ffff           invalid
        │   0x00002470      ffff           invalid
        │   0x00002472      ffff           invalid
        │   0x00002474      ffff           invalid
        │   0x00002476      ffff           invalid
        │   0x00002478      ffff           invalid
        │   0x0000247a      ffff           invalid
        │   0x0000247c      ffff           invalid
        │   0x0000247e      ffff           invalid
        │   0x00002480      ffff           invalid
        │   0x00002482      ffff           invalid
        │   0x00002484      ffff           invalid
        │   0x00002486      ffff           invalid
        │   0x00002488      ffff           invalid
        │   0x0000248a      ffff           invalid
        │   0x0000248c      ffff           invalid
        │   0x0000248e      ffff           invalid
        │   0x00002490      ffff           invalid
        │   0x00002492      ffff           invalid
        │   0x00002494      ffff           invalid
        │   0x00002496      ffff           invalid
        │   0x00002498      ffff           invalid
        │   0x0000249a      ffff           invalid
        │   0x0000249c      ffff           invalid
        │   0x0000249e      ffff           invalid
        │   0x000024a0      ffff           invalid
        │   0x000024a2      ffff           invalid
        │   0x000024a4      ffff           invalid
        │   0x000024a6      ffff           invalid
        │   0x000024a8      ffff           invalid
        │   0x000024aa      ffff           invalid
        │   0x000024ac      ffff           invalid
        │   0x000024ae      ffff           invalid
        │   0x000024b0      ffff           invalid
        │   0x000024b2      ffff           invalid
        │   0x000024b4      ffff           invalid
        │   0x000024b6      ffff           invalid
        │   0x000024b8      ffff           invalid
        │   0x000024ba      ffff           invalid
        │   0x000024bc      ffff           invalid
        │   0x000024be      ffff           invalid
        │   0x000024c0      ffff           invalid
        │   0x000024c2      ffff           invalid
        │   0x000024c4      ffff           invalid
        │   0x000024c6      ffff           invalid
        │   0x000024c8      ffff           invalid
        │   0x000024ca      ffff           invalid
        │   0x000024cc      ffff           invalid
        │   0x000024ce      ffff           invalid
        │   0x000024d0      ffff           invalid
        │   0x000024d2      ffff           invalid
        │   0x000024d4      ffff           invalid
        │   0x000024d6      ffff           invalid
        │   0x000024d8      ffff           invalid
        │   0x000024da      ffff           invalid
        │   0x000024dc      ffff           invalid
        │   0x000024de      ffff           invalid
        │   0x000024e0      ffff           invalid
        │   0x000024e2      ffff           invalid
        │   0x000024e4      ffff           invalid
        │   0x000024e6      ffff           invalid
        │   0x000024e8      ffff           invalid
        │   0x000024ea      ffff           invalid
        │   0x000024ec      ffff           invalid
        │   0x000024ee      ffff           invalid
        │   0x000024f0      ffff           invalid
        │   0x000024f2      ffff           invalid
        │   0x000024f4      ffff           invalid
        │   0x000024f6      ffff           invalid
        │   0x000024f8      ffff           invalid
        │   0x000024fa      ffff           invalid
        │   0x000024fc      ffff           invalid
        │   0x000024fe      ffff           invalid
        │   0x00002500      ffff           invalid
        │   0x00002502      ffff           invalid
        │   0x00002504      ffff           invalid
        │   0x00002506      ffff           invalid
        │   0x00002508      ffff           invalid
        │   0x0000250a      ffff           invalid
        │   0x0000250c      ffff           invalid
        │   0x0000250e      ffff           invalid
        │   0x00002510      ffff           invalid
        │   0x00002512      ffff           invalid
        │   0x00002514      ffff           invalid
        │   0x00002516      ffff           invalid
        │   0x00002518      ffff           invalid
        │   0x0000251a      ffff           invalid
        │   0x0000251c      ffff           invalid
        │   0x0000251e      ffff           invalid
        │   0x00002520      ffff           invalid
        │   0x00002522      ffff           invalid
        │   0x00002524      ffff           invalid
        │   0x00002526      ffff           invalid
        │   0x00002528      ffff           invalid
        │   0x0000252a      ffff           invalid
        │   0x0000252c      ffff           invalid
        │   0x0000252e      ffff           invalid
        │   0x00002530      ffff           invalid
        │   0x00002532      ffff           invalid
        │   0x00002534      ffff           invalid
        │   0x00002536      ffff           invalid
        │   0x00002538      ffff           invalid
        │   0x0000253a      ffff           invalid
        │   0x0000253c      ffff           invalid
        │   0x0000253e      ffff           invalid
        │   0x00002540      ffff           invalid
        │   0x00002542      ffff           invalid
        │   0x00002544      ffff           invalid
        │   0x00002546      ffff           invalid
        │   0x00002548      ffff           invalid
        │   0x0000254a      ffff           invalid
        │   0x0000254c      ffff           invalid
        │   0x0000254e      ffff           invalid
        │   0x00002550      ffff           invalid
        │   0x00002552      ffff           invalid
        │   0x00002554      ffff           invalid
        │   0x00002556      ffff           invalid
        │   0x00002558      ffff           invalid
        │   0x0000255a      ffff           invalid
        │   0x0000255c      ffff           invalid
        │   0x0000255e      ffff           invalid
        │   0x00002560      ffff           invalid
        │   0x00002562      ffff           invalid
        │   0x00002564      ffff           invalid
        │   0x00002566      ffff           invalid
        │   0x00002568      ffff           invalid
        │   0x0000256a      ffff           invalid
        │   0x0000256c      ffff           invalid
        │   0x0000256e      ffff           invalid
        │   0x00002570      ffff           invalid
        │   0x00002572      ffff           invalid
        │   0x00002574      ffff           invalid
        │   0x00002576      ffff           invalid
        │   0x00002578      ffff           invalid
        │   0x0000257a      ffff           invalid
        │   0x0000257c      ffff           invalid
        │   0x0000257e      ffff           invalid
        │   0x00002580      ffff           invalid
        │   0x00002582      ffff           invalid
        │   0x00002584      ffff           invalid
        │   0x00002586      ffff           invalid
        │   0x00002588      ffff           invalid
        │   0x0000258a      ffff           invalid
        │   0x0000258c      ffff           invalid
        │   0x0000258e      ffff           invalid
        │   0x00002590      ffff           invalid
        │   0x00002592      ffff           invalid
        │   0x00002594      ffff           invalid
        │   0x00002596      ffff           invalid
        │   0x00002598      ffff           invalid
        │   0x0000259a      ffff           invalid
        │   0x0000259c      ffff           invalid
        │   0x0000259e      ffff           invalid
        │   0x000025a0      ffff           invalid
        │   0x000025a2      ffff           invalid
        │   0x000025a4      ffff           invalid
        │   0x000025a6      ffff           invalid
        │   0x000025a8      ffff           invalid
        │   0x000025aa      ffff           invalid
        │   0x000025ac      ffff           invalid
        │   0x000025ae      ffff           invalid
        │   0x000025b0      ffff           invalid
        │   0x000025b2      ffff           invalid
        │   0x000025b4      ffff           invalid
        │   0x000025b6      ffff           invalid
        │   0x000025b8      ffff           invalid
        │   0x000025ba      ffff           invalid
        │   0x000025bc      ffff           invalid
        │   0x000025be      ffff           invalid
        │   0x000025c0      ffff           invalid
        │   0x000025c2      ffff           invalid
        │   0x000025c4      ffff           invalid
        │   0x000025c6      ffff           invalid
        │   0x000025c8      ffff           invalid
        │   0x000025ca      ffff           invalid
        │   0x000025cc      ffff           invalid
        │   0x000025ce      ffff           invalid
        │   0x000025d0      ffff           invalid
        │   0x000025d2      ffff           invalid
        │   0x000025d4      ffff           invalid
        │   0x000025d6      ffff           invalid
        │   0x000025d8      ffff           invalid
        │   0x000025da      ffff           invalid
        │   0x000025dc      ffff           invalid
        │   0x000025de      ffff           invalid
        │   0x000025e0      ffff           invalid
        │   0x000025e2      ffff           invalid
        │   0x000025e4      ffff           invalid
        │   0x000025e6      ffff           invalid
        │   0x000025e8      ffff           invalid
        │   0x000025ea      ffff           invalid
        │   0x000025ec      ffff           invalid
        │   0x000025ee      ffff           invalid
        │   0x000025f0      ffff           invalid
        │   0x000025f2      ffff           invalid
        │   0x000025f4      ffff           invalid
        │   0x000025f6      ffff           invalid
        │   0x000025f8      ffff           invalid
        │   0x000025fa      ffff           invalid
        │   0x000025fc      ffff           invalid
        │   0x000025fe      ffff           invalid
        │   0x00002600      ffff           invalid
        │   0x00002602      ffff           invalid
        │   0x00002604      ffff           invalid
        │   0x00002606      ffff           invalid
        │   0x00002608      ffff           invalid
        │   0x0000260a      ffff           invalid
        │   0x0000260c      ffff           invalid
        │   0x0000260e      ffff           invalid
        │   0x00002610      ffff           invalid
        │   0x00002612      ffff           invalid
        │   0x00002614      ffff           invalid
        │   0x00002616      ffff           invalid
        │   0x00002618      ffff           invalid
        │   0x0000261a      ffff           invalid
        │   0x0000261c      ffff           invalid
        │   0x0000261e      ffff           invalid
        │   0x00002620      ffff           invalid
        │   0x00002622      ffff           invalid
        │   0x00002624      ffff           invalid
        │   0x00002626      ffff           invalid
        │   0x00002628      ffff           invalid
        │   0x0000262a      ffff           invalid
        │   0x0000262c      ffff           invalid
        │   0x0000262e      ffff           invalid
        │   0x00002630      ffff           invalid
        │   0x00002632      ffff           invalid
        │   0x00002634      ffff           invalid
        │   0x00002636      ffff           invalid
        │   0x00002638      ffff           invalid
        │   0x0000263a      ffff           invalid
        │   0x0000263c      ffff           invalid
        │   0x0000263e      ffff           invalid
        │   0x00002640      ffff           invalid
        │   0x00002642      ffff           invalid
        │   0x00002644      ffff           invalid
        │   0x00002646      ffff           invalid
        │   0x00002648      ffff           invalid
        │   0x0000264a      ffff           invalid
        │   0x0000264c      ffff           invalid
        │   0x0000264e      ffff           invalid
        │   0x00002650      ffff           invalid
        │   0x00002652      ffff           invalid
        │   0x00002654      ffff           invalid
        │   0x00002656      ffff           invalid
        │   0x00002658      ffff           invalid
        │   0x0000265a      ffff           invalid
        │   0x0000265c      ffff           invalid
        │   0x0000265e      ffff           invalid
        │   0x00002660      ffff           invalid
        │   0x00002662      ffff           invalid
        │   0x00002664      ffff           invalid
        │   0x00002666      ffff           invalid
        │   0x00002668      ffff           invalid
        │   0x0000266a      ffff           invalid
        │   0x0000266c      ffff           invalid
        │   0x0000266e      ffff           invalid
        │   0x00002670      ffff           invalid
        │   0x00002672      ffff           invalid
        │   0x00002674      ffff           invalid
        │   0x00002676      ffff           invalid
        │   0x00002678      ffff           invalid
        │   0x0000267a      ffff           invalid
        │   0x0000267c      ffff           invalid
        │   0x0000267e      ffff           invalid
        │   0x00002680      ffff           invalid
        │   0x00002682      ffff           invalid
        │   0x00002684      ffff           invalid
        │   0x00002686      ffff           invalid
        │   0x00002688      ffff           invalid
        │   0x0000268a      ffff           invalid
        │   0x0000268c      ffff           invalid
        │   0x0000268e      ffff           invalid
        │   0x00002690      ffff           invalid
        │   0x00002692      ffff           invalid
        │   0x00002694      ffff           invalid
        │   0x00002696      ffff           invalid
        │   0x00002698      ffff           invalid
        │   0x0000269a      ffff           invalid
        │   0x0000269c      ffff           invalid
        │   0x0000269e      ffff           invalid
        │   0x000026a0      ffff           invalid
        │   0x000026a2      ffff           invalid
        │   0x000026a4      ffff           invalid
        │   0x000026a6      ffff           invalid
        │   0x000026a8      ffff           invalid
        │   0x000026aa      ffff           invalid
        │   0x000026ac      ffff           invalid
        │   0x000026ae      ffff           invalid
        │   0x000026b0      ffff           invalid
        │   0x000026b2      ffff           invalid
        │   0x000026b4      ffff           invalid
        │   0x000026b6      ffff           invalid
        │   0x000026b8      ffff           invalid
        │   0x000026ba      ffff           invalid
        │   0x000026bc      ffff           invalid
        │   0x000026be      ffff           invalid
        │   0x000026c0      ffff           invalid
        │   0x000026c2      ffff           invalid
        │   0x000026c4      ffff           invalid
        │   0x000026c6      ffff           invalid
        │   0x000026c8      ffff           invalid
        │   0x000026ca      ffff           invalid
        │   0x000026cc      ffff           invalid
        │   0x000026ce      ffff           invalid
        │   0x000026d0      ffff           invalid
        │   0x000026d2      ffff           invalid
        │   0x000026d4      ffff           invalid
        │   0x000026d6      ffff           invalid
        │   0x000026d8      ffff           invalid
        │   0x000026da      ffff           invalid
        │   0x000026dc      ffff           invalid
        │   0x000026de      ffff           invalid
        │   0x000026e0      ffff           invalid
        │   0x000026e2      ffff           invalid
        │   0x000026e4      ffff           invalid
        │   0x000026e6      ffff           invalid
        │   0x000026e8      ffff           invalid
        │   0x000026ea      ffff           invalid
        │   0x000026ec      ffff           invalid
        │   0x000026ee      ffff           invalid
        │   0x000026f0      ffff           invalid
        │   0x000026f2      ffff           invalid
        │   0x000026f4      ffff           invalid
        │   0x000026f6      ffff           invalid
        │   0x000026f8      ffff           invalid
        │   0x000026fa      ffff           invalid
        │   0x000026fc      ffff           invalid
        │   0x000026fe      ffff           invalid
        │   0x00002700      ffff           invalid
        │   0x00002702      ffff           invalid
        │   0x00002704      ffff           invalid
        │   0x00002706      ffff           invalid
        │   0x00002708      ffff           invalid
        │   0x0000270a      ffff           invalid
        │   0x0000270c      ffff           invalid
        │   0x0000270e      ffff           invalid
        │   0x00002710      ffff           invalid
        │   0x00002712      ffff           invalid
        │   0x00002714      ffff           invalid
        │   0x00002716      ffff           invalid
        │   0x00002718      ffff           invalid
        │   0x0000271a      ffff           invalid
        │   0x0000271c      ffff           invalid
        │   0x0000271e      ffff           invalid
        │   0x00002720      ffff           invalid
        │   0x00002722      ffff           invalid
        │   0x00002724      ffff           invalid
        │   0x00002726      ffff           invalid
        │   0x00002728      ffff           invalid
        │   0x0000272a      ffff           invalid
        │   0x0000272c      ffff           invalid
        │   0x0000272e      ffff           invalid
        │   0x00002730      ffff           invalid
        │   0x00002732      ffff           invalid
        │   0x00002734      ffff           invalid
        │   0x00002736      ffff           invalid
        │   0x00002738      ffff           invalid
        │   0x0000273a      ffff           invalid
        │   0x0000273c      ffff           invalid
        │   0x0000273e      ffff           invalid
        │   0x00002740      ffff           invalid
        │   0x00002742      ffff           invalid
        │   0x00002744      ffff           invalid
        │   0x00002746      ffff           invalid
        │   0x00002748      ffff           invalid
        │   0x0000274a      ffff           invalid
        │   0x0000274c      ffff           invalid
        │   0x0000274e      ffff           invalid
        │   0x00002750      ffff           invalid
        │   0x00002752      ffff           invalid
        │   0x00002754      ffff           invalid
        │   0x00002756      ffff           invalid
        │   0x00002758      ffff           invalid
        │   0x0000275a      ffff           invalid
        │   0x0000275c      ffff           invalid
        │   0x0000275e      ffff           invalid
        │   0x00002760      ffff           invalid
        │   0x00002762      ffff           invalid
        │   0x00002764      ffff           invalid
        │   0x00002766      ffff           invalid
        │   0x00002768      ffff           invalid
        │   0x0000276a      ffff           invalid
        │   0x0000276c      ffff           invalid
        │   0x0000276e      ffff           invalid
        │   0x00002770      ffff           invalid
        │   0x00002772      ffff           invalid
        │   0x00002774      ffff           invalid
        │   0x00002776      ffff           invalid
        │   0x00002778      ffff           invalid
        │   0x0000277a      ffff           invalid
        │   0x0000277c      ffff           invalid
        │   0x0000277e      ffff           invalid
        │   0x00002780      ffff           invalid
        │   0x00002782      ffff           invalid
        │   0x00002784      ffff           invalid
        │   0x00002786      ffff           invalid
        │   0x00002788      ffff           invalid
        │   0x0000278a      ffff           invalid
        │   0x0000278c      ffff           invalid
        │   0x0000278e      ffff           invalid
        │   0x00002790      ffff           invalid
        │   0x00002792      ffff           invalid
        │   0x00002794      ffff           invalid
        │   0x00002796      ffff           invalid
        │   0x00002798      ffff           invalid
        │   0x0000279a      ffff           invalid
        │   0x0000279c      ffff           invalid
        │   0x0000279e      ffff           invalid
        │   0x000027a0      ffff           invalid
        │   0x000027a2      ffff           invalid
        │   0x000027a4      ffff           invalid
        │   0x000027a6      ffff           invalid
        │   0x000027a8      ffff           invalid
        │   0x000027aa      ffff           invalid
        │   0x000027ac      ffff           invalid
        │   0x000027ae      ffff           invalid
        │   0x000027b0      ffff           invalid
        │   0x000027b2      ffff           invalid
        │   0x000027b4      ffff           invalid
        │   0x000027b6      ffff           invalid
        │   0x000027b8      ffff           invalid
        │   0x000027ba      ffff           invalid
        │   0x000027bc      ffff           invalid
        │   0x000027be      ffff           invalid
        │   0x000027c0      ffff           invalid
        │   0x000027c2      ffff           invalid
        │   0x000027c4      ffff           invalid
        │   0x000027c6      ffff           invalid
        │   0x000027c8      ffff           invalid
        │   0x000027ca      ffff           invalid
        │   0x000027cc      ffff           invalid
        │   0x000027ce      ffff           invalid
        │   0x000027d0      ffff           invalid
        │   0x000027d2      ffff           invalid
        │   0x000027d4      ffff           invalid
        │   0x000027d6      ffff           invalid
        │   0x000027d8      ffff           invalid
        │   0x000027da      ffff           invalid
        │   0x000027dc      ffff           invalid
        │   0x000027de      ffff           invalid
        │   0x000027e0      ffff           invalid
        │   0x000027e2      ffff           invalid
        │   0x000027e4      ffff           invalid
        │   0x000027e6      ffff           invalid
        │   0x000027e8      ffff           invalid
        │   0x000027ea      ffff           invalid
        │   0x000027ec      ffff           invalid
        │   0x000027ee      ffff           invalid
        │   0x000027f0      ffff           invalid
        │   0x000027f2      ffff           invalid
        │   0x000027f4      ffff           invalid
        │   0x000027f6      ffff           invalid
        │   0x000027f8      ffff           invalid
        │   0x000027fa      ffff           invalid
        │   0x000027fc      ffff           invalid
        │   0x000027fe      ffff           invalid
        │   0x00002800      ffff           invalid
        │   0x00002802      ffff           invalid
        │   0x00002804      ffff           invalid
        │   0x00002806      ffff           invalid
        │   0x00002808      ffff           invalid
        │   0x0000280a      ffff           invalid
        │   0x0000280c      ffff           invalid
        │   0x0000280e      ffff           invalid
        │   0x00002810      ffff           invalid
        │   0x00002812      ffff           invalid
        │   0x00002814      ffff           invalid
        │   0x00002816      ffff           invalid
        │   0x00002818      ffff           invalid
        │   0x0000281a      ffff           invalid
        │   0x0000281c      ffff           invalid
        │   0x0000281e      ffff           invalid
        │   0x00002820      ffff           invalid
        │   0x00002822      ffff           invalid
        │   0x00002824      ffff           invalid
        │   0x00002826      ffff           invalid
        │   0x00002828      ffff           invalid
        │   0x0000282a      ffff           invalid
        │   0x0000282c      ffff           invalid
        │   0x0000282e      ffff           invalid
        │   0x00002830      ffff           invalid
        │   0x00002832      ffff           invalid
        │   0x00002834      ffff           invalid
        │   0x00002836      ffff           invalid
        │   0x00002838      ffff           invalid
        │   0x0000283a      ffff           invalid
        │   0x0000283c      ffff           invalid
        │   0x0000283e      ffff           invalid
        │   0x00002840      ffff           invalid
        │   0x00002842      ffff           invalid
        │   0x00002844      ffff           invalid
        │   0x00002846      ffff           invalid
        │   0x00002848      ffff           invalid
        │   0x0000284a      ffff           invalid
        │   0x0000284c      ffff           invalid
        │   0x0000284e      ffff           invalid
        │   0x00002850      ffff           invalid
        │   0x00002852      ffff           invalid
        │   0x00002854      ffff           invalid
        │   0x00002856      ffff           invalid
        │   0x00002858      ffff           invalid
        │   0x0000285a      ffff           invalid
        │   0x0000285c      ffff           invalid
        │   0x0000285e      ffff           invalid
        │   0x00002860      ffff           invalid
        │   0x00002862      ffff           invalid
        │   0x00002864      ffff           invalid
        │   0x00002866      ffff           invalid
        │   0x00002868      ffff           invalid
        │   0x0000286a      ffff           invalid
        │   0x0000286c      ffff           invalid
        │   0x0000286e      ffff           invalid
        │   0x00002870      ffff           invalid
        │   0x00002872      ffff           invalid
        │   0x00002874      ffff           invalid
        │   0x00002876      ffff           invalid
        │   0x00002878      ffff           invalid
        │   0x0000287a      ffff           invalid
        │   0x0000287c      ffff           invalid
        │   0x0000287e      ffff           invalid
        │   0x00002880      ffff           invalid
        │   0x00002882      ffff           invalid
        │   0x00002884      ffff           invalid
        │   0x00002886      ffff           invalid
        │   0x00002888      ffff           invalid
        │   0x0000288a      ffff           invalid
        │   0x0000288c      ffff           invalid
        │   0x0000288e      ffff           invalid
        │   0x00002890      ffff           invalid
        │   0x00002892      ffff           invalid
        │   0x00002894      ffff           invalid
        │   0x00002896      ffff           invalid
        │   0x00002898      ffff           invalid
        │   0x0000289a      ffff           invalid
        │   0x0000289c      ffff           invalid
        │   0x0000289e      ffff           invalid
        │   0x000028a0      ffff           invalid
        │   0x000028a2      ffff           invalid
        │   0x000028a4      ffff           invalid
        │   0x000028a6      ffff           invalid
        │   0x000028a8      ffff           invalid
        │   0x000028aa      ffff           invalid
        │   0x000028ac      ffff           invalid
        │   0x000028ae      ffff           invalid
        │   0x000028b0      ffff           invalid
        │   0x000028b2      ffff           invalid
        │   0x000028b4      ffff           invalid
        │   0x000028b6      ffff           invalid
        │   0x000028b8      ffff           invalid
        │   0x000028ba      ffff           invalid
        │   0x000028bc      ffff           invalid
        │   0x000028be      ffff           invalid
        │   0x000028c0      ffff           invalid
        │   0x000028c2      ffff           invalid
        │   0x000028c4      ffff           invalid
        │   0x000028c6      ffff           invalid
        │   0x000028c8      ffff           invalid
        │   0x000028ca      ffff           invalid
        │   0x000028cc      ffff           invalid
        │   0x000028ce      ffff           invalid
        │   0x000028d0      ffff           invalid
        │   0x000028d2      ffff           invalid
        │   0x000028d4      ffff           invalid
        │   0x000028d6      ffff           invalid
        │   0x000028d8      ffff           invalid
        │   0x000028da      ffff           invalid
        │   0x000028dc      ffff           invalid
        │   0x000028de      ffff           invalid
        │   0x000028e0      ffff           invalid
        │   0x000028e2      ffff           invalid
        │   0x000028e4      ffff           invalid
        │   0x000028e6      ffff           invalid
        │   0x000028e8      ffff           invalid
        │   0x000028ea      ffff           invalid
        │   0x000028ec      ffff           invalid
        │   0x000028ee      ffff           invalid
        │   0x000028f0      ffff           invalid
        │   0x000028f2      ffff           invalid
        │   0x000028f4      ffff           invalid
        │   0x000028f6      ffff           invalid
        │   0x000028f8      ffff           invalid
        │   0x000028fa      ffff           invalid
        │   0x000028fc      ffff           invalid
        │   0x000028fe      ffff           invalid
        │   0x00002900      ffff           invalid
        │   0x00002902      ffff           invalid
        │   0x00002904      ffff           invalid
        │   0x00002906      ffff           invalid
        │   0x00002908      ffff           invalid
        │   0x0000290a      ffff           invalid
        │   0x0000290c      ffff           invalid
        │   0x0000290e      ffff           invalid
        │   0x00002910      ffff           invalid
        │   0x00002912      ffff           invalid
        │   0x00002914      ffff           invalid
        │   0x00002916      ffff           invalid
        │   0x00002918      ffff           invalid
        │   0x0000291a      ffff           invalid
        │   0x0000291c      ffff           invalid
        │   0x0000291e      ffff           invalid
        │   0x00002920      ffff           invalid
        │   0x00002922      ffff           invalid
        │   0x00002924      ffff           invalid
        │   0x00002926      ffff           invalid
        │   0x00002928      ffff           invalid
        │   0x0000292a      ffff           invalid
        │   0x0000292c      ffff           invalid
        │   0x0000292e      ffff           invalid
        │   0x00002930      ffff           invalid
        │   0x00002932      ffff           invalid
        │   0x00002934      ffff           invalid
        │   0x00002936      ffff           invalid
        │   0x00002938      ffff           invalid
        │   0x0000293a      ffff           invalid
        │   0x0000293c      ffff           invalid
        │   0x0000293e      ffff           invalid
        │   0x00002940      ffff           invalid
        │   0x00002942      ffff           invalid
        │   0x00002944      ffff           invalid
        │   0x00002946      ffff           invalid
        │   0x00002948      ffff           invalid
        │   0x0000294a      ffff           invalid
        │   0x0000294c      ffff           invalid
        │   0x0000294e      ffff           invalid
        │   0x00002950      ffff           invalid
        │   0x00002952      ffff           invalid
        │   0x00002954      ffff           invalid
        │   0x00002956      ffff           invalid
        │   0x00002958      ffff           invalid
        │   0x0000295a      ffff           invalid
        │   0x0000295c      ffff           invalid
        │   0x0000295e      ffff           invalid
        │   0x00002960      ffff           invalid
        │   0x00002962      ffff           invalid
        │   0x00002964      ffff           invalid
        │   0x00002966      ffff           invalid
        │   0x00002968      ffff           invalid
        │   0x0000296a      ffff           invalid
        │   0x0000296c      ffff           invalid
        │   0x0000296e      ffff           invalid
        │   0x00002970      ffff           invalid
        │   0x00002972      ffff           invalid
        │   0x00002974      ffff           invalid
        │   0x00002976      ffff           invalid
        │   0x00002978      ffff           invalid
        │   0x0000297a      ffff           invalid
        │   0x0000297c      ffff           invalid
        │   0x0000297e      ffff           invalid
        │   0x00002980      ffff           invalid
        │   0x00002982      ffff           invalid
        │   0x00002984      ffff           invalid
        │   0x00002986      ffff           invalid
        │   0x00002988      ffff           invalid
        │   0x0000298a      ffff           invalid
        │   0x0000298c      ffff           invalid
        │   0x0000298e      ffff           invalid
        │   0x00002990      ffff           invalid
        │   0x00002992      ffff           invalid
        │   0x00002994      ffff           invalid
        │   0x00002996      ffff           invalid
        │   0x00002998      ffff           invalid
        │   0x0000299a      ffff           invalid
        │   0x0000299c      ffff           invalid
        │   0x0000299e      ffff           invalid
        │   0x000029a0      ffff           invalid
        │   0x000029a2      ffff           invalid
        │   0x000029a4      ffff           invalid
        │   0x000029a6      ffff           invalid
        │   0x000029a8      ffff           invalid
        │   0x000029aa      ffff           invalid
        │   0x000029ac      ffff           invalid
        │   0x000029ae      ffff           invalid
        │   0x000029b0      ffff           invalid
        │   0x000029b2      ffff           invalid
        │   0x000029b4      ffff           invalid
        │   0x000029b6      ffff           invalid
        │   0x000029b8      ffff           invalid
        │   0x000029ba      ffff           invalid
        │   0x000029bc      ffff           invalid
        │   0x000029be      ffff           invalid
        │   0x000029c0      ffff           invalid
        │   0x000029c2      ffff           invalid
        │   0x000029c4      ffff           invalid
        │   0x000029c6      ffff           invalid
        │   0x000029c8      ffff           invalid
        │   0x000029ca      ffff           invalid
        │   0x000029cc      ffff           invalid
        │   0x000029ce      ffff           invalid
        │   0x000029d0      ffff           invalid
        │   0x000029d2      ffff           invalid
        │   0x000029d4      ffff           invalid
        │   0x000029d6      ffff           invalid
        │   0x000029d8      ffff           invalid
        │   0x000029da      ffff           invalid
        │   0x000029dc      ffff           invalid
        │   0x000029de      ffff           invalid
        │   0x000029e0      ffff           invalid
        │   0x000029e2      ffff           invalid
        │   0x000029e4      ffff           invalid
        │   0x000029e6      ffff           invalid
        │   0x000029e8      ffff           invalid
        │   0x000029ea      ffff           invalid
        │   0x000029ec      ffff           invalid
        │   0x000029ee      ffff           invalid
        │   0x000029f0      ffff           invalid
        │   0x000029f2      ffff           invalid
        │   0x000029f4      ffff           invalid
        │   0x000029f6      ffff           invalid
        │   0x000029f8      ffff           invalid
        │   0x000029fa      ffff           invalid
        │   0x000029fc      ffff           invalid
        │   0x000029fe      ffff           invalid
        │   0x00002a00      ffff           invalid
        │   0x00002a02      ffff           invalid
        │   0x00002a04      ffff           invalid
        │   0x00002a06      ffff           invalid
        │   0x00002a08      ffff           invalid
        │   0x00002a0a      ffff           invalid
        │   0x00002a0c      ffff           invalid
        │   0x00002a0e      ffff           invalid
        │   0x00002a10      ffff           invalid
        │   0x00002a12      ffff           invalid
        │   0x00002a14      ffff           invalid
        │   0x00002a16      ffff           invalid
        │   0x00002a18      ffff           invalid
        │   0x00002a1a      ffff           invalid
        │   0x00002a1c      ffff           invalid
        │   0x00002a1e      ffff           invalid
        │   0x00002a20      ffff           invalid
        │   0x00002a22      ffff           invalid
        │   0x00002a24      ffff           invalid
        │   0x00002a26      ffff           invalid
        │   0x00002a28      ffff           invalid
        │   0x00002a2a      ffff           invalid
        │   0x00002a2c      ffff           invalid
        │   0x00002a2e      ffff           invalid
        │   0x00002a30      ffff           invalid
        │   0x00002a32      ffff           invalid
        │   0x00002a34      ffff           invalid
        │   0x00002a36      ffff           invalid
        │   0x00002a38      ffff           invalid
        │   0x00002a3a      ffff           invalid
        │   0x00002a3c      ffff           invalid
        │   0x00002a3e      ffff           invalid
        │   0x00002a40      ffff           invalid
        │   0x00002a42      ffff           invalid
        │   0x00002a44      ffff           invalid
        │   0x00002a46      ffff           invalid
        │   0x00002a48      ffff           invalid
        │   0x00002a4a      ffff           invalid
        │   0x00002a4c      ffff           invalid
        │   0x00002a4e      ffff           invalid
        │   0x00002a50      ffff           invalid
        │   0x00002a52      ffff           invalid
        │   0x00002a54      ffff           invalid
        │   0x00002a56      ffff           invalid
        │   0x00002a58      ffff           invalid
        │   0x00002a5a      ffff           invalid
        │   0x00002a5c      ffff           invalid
        │   0x00002a5e      ffff           invalid
        │   0x00002a60      ffff           invalid
        │   0x00002a62      ffff           invalid
        │   0x00002a64      ffff           invalid
        │   0x00002a66      ffff           invalid
        │   0x00002a68      ffff           invalid
        │   0x00002a6a      ffff           invalid
        │   0x00002a6c      ffff           invalid
        │   0x00002a6e      ffff           invalid
        │   0x00002a70      ffff           invalid
        │   0x00002a72      ffff           invalid
        │   0x00002a74      ffff           invalid
        │   0x00002a76      ffff           invalid
        │   0x00002a78      ffff           invalid
        │   0x00002a7a      ffff           invalid
        │   0x00002a7c      ffff           invalid
        │   0x00002a7e      ffff           invalid
        │   0x00002a80      ffff           invalid
        │   0x00002a82      ffff           invalid
        │   0x00002a84      ffff           invalid
        │   0x00002a86      ffff           invalid
        │   0x00002a88      ffff           invalid
        │   0x00002a8a      ffff           invalid
        │   0x00002a8c      ffff           invalid
        │   0x00002a8e      ffff           invalid
        │   0x00002a90      ffff           invalid
        │   0x00002a92      ffff           invalid
        │   0x00002a94      ffff           invalid
