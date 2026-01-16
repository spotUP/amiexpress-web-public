; CP Listan - AmiExpress 68020 Assembly Door
; Displays a random line from the classic CP list
; Assembles with vasm: vasmm68k_mot -Fhunkexe -kick1hunks -nosym -m68020

; AmigaOS Constants
ABSEXECBASE     EQU     4

; exec.library LVOs
LVO_OpenLibrary EQU     -552
LVO_CloseLibrary EQU    -414

; dos.library LVOs
LVO_DateStamp   EQU     -192

; AEDoor.library LVOs (use trapped functions!)
LVO_CreateComm  EQU     -30             ; Creates comm channel (trapped)
LVO_DeleteComm  EQU     -36             ; Deletes comm channel (trapped)
LVO_WriteStr    EQU     -84             ; Output text (trapped)

TOTAL_STRINGS   EQU     999

; Single merged section for executable format
        SECTION text,CODE

start:
        ; D3 = random seed from startup
        ; On emulator: set by DoorLoader to fresh random value
        ; On real Amiga: undefined (garbage from previous ops = random)
        ; MUST save seed BEFORE movem.l clobbers our easy access to D3
        lea     data_start(pc),a4       ; Need A4 for variable access
        or.l    #1,d3                   ; Ensure non-zero
        move.l  d3,lfsr_state-data_start(a4)  ; Store seed NOW

        movem.l d0-d7/a0-a6,-(sp)       ; Save all registers

        move.l  ABSEXECBASE,a6
        tst.l   a6
        beq     .exit

.open_aedoor:
        move.l  ABSEXECBASE,a6
        lea     aedoor_name(pc),a1
        moveq   #0,d0
        jsr     LVO_OpenLibrary(a6)
        move.l  d0,aedoor_base-data_start(a4)
        beq     .exit

        ; Initialize comm channel with BBS
        move.l  aedoor_base-data_start(a4),a6
        jsr     LVO_CreateComm(a6)

        ; Display header
        move.l  aedoor_base-data_start(a4),a6
        lea     header_msg(pc),a0
        jsr     LVO_WriteStr(a6)

        ; Generate random number 0 to TOTAL_STRINGS-1
        ; Run LFSR 16 times for better mixing
        moveq   #15,d7
.rng_loop:
        bsr     random_lfsr
        dbf     d7,.rng_loop
        
        divu.w  #TOTAL_STRINGS,d0
        swap    d0
        and.l   #$FFFF,d0

        ; Get string offset from table
        ; A4 = data_start, need to get to offset_table
        lea     start(pc),a2            ; A2 = start of code
        lea     offset_table-start(a2),a3  ; A3 = offset_table (using add since may be >32KB)
        add.l   #offset_table-start,a2
        lsl.l   #2,d0                   ; D0 = index * 4
        move.l  (a2,d0.l),d1            ; D1 = offset from string_data
        
        ; Calculate actual string address
        lea     start(pc),a0
        add.l   #string_data-start,a0   ; A0 = string_data base
        add.l   d1,a0                   ; A0 = actual string address

        ; Output the random string
        move.l  aedoor_base-data_start(a4),a6
        jsr     LVO_WriteStr(a6)

        move.l  aedoor_base-data_start(a4),a6
        lea     crlf(pc),a0
        jsr     LVO_WriteStr(a6)

        ; Display footer
        move.l  aedoor_base-data_start(a4),a6
        lea     footer_msg(pc),a0
        jsr     LVO_WriteStr(a6)

        ; Cleanup comm channel
        move.l  aedoor_base-data_start(a4),a6
        jsr     LVO_DeleteComm(a6)

        move.l  ABSEXECBASE,a6
        move.l  aedoor_base-data_start(a4),a1
        jsr     LVO_CloseLibrary(a6)

.exit:
        movem.l (sp)+,d0-d7/a0-a6
        moveq   #0,d0
        rts

random_lfsr:
        move.l  lfsr_state-data_start(a4),d0
        move.l  d0,d1
        move.l  d0,d2
        lsr.l   #1,d1
        roxr.l  #1,d0
        eor.l   d2,d0
        move.l  d0,d1
        ror.l   #7,d1
        eor.l   d1,d0
        rol.l   #3,d0
        move.l  d0,lfsr_state-data_start(a4)
        rts

; Data area (in same section, close to code for PC-relative)
data_start:
aedoor_base:    dc.l    0
lfsr_state:     dc.l    $DEADBEEF

aedoor_name:    dc.b    'AEDoor.library',0
        EVEN
header_msg:
        dc.b    13,10,'HUR DU BLIR ETT ',$C4,'KTA CP DELUXE:',13,10,13,10,0
        EVEN
footer_msg:
        dc.b    13,10,0
        EVEN
crlf:   dc.b    13,10,0
        EVEN

; Offset table - offsets from string_data
offset_table:

        dc.l    0
        dc.l    60
        dc.l    118
        dc.l    152
        dc.l    190
        dc.l    228
        dc.l    284
        dc.l    308
        dc.l    338
        dc.l    402
        dc.l    444
        dc.l    476
        dc.l    526
        dc.l    558
        dc.l    592
        dc.l    618
        dc.l    646
        dc.l    666
        dc.l    700
        dc.l    718
        dc.l    744
        dc.l    782
        dc.l    808
        dc.l    840
        dc.l    892
        dc.l    922
        dc.l    986
        dc.l    1008
        dc.l    1046
        dc.l    1076
        dc.l    1116
        dc.l    1172
        dc.l    1202
        dc.l    1276
        dc.l    1312
        dc.l    1368
        dc.l    1428
        dc.l    1480
        dc.l    1506
        dc.l    1536
        dc.l    1624
        dc.l    1688
        dc.l    1712
        dc.l    1738
        dc.l    1768
        dc.l    1798
        dc.l    1858
        dc.l    1902
        dc.l    1934
        dc.l    1990
        dc.l    2012
        dc.l    2066
        dc.l    2104
        dc.l    2158
        dc.l    2168
        dc.l    2184
        dc.l    2222
        dc.l    2246
        dc.l    2270
        dc.l    2292
        dc.l    2316
        dc.l    2336
        dc.l    2394
        dc.l    2420
        dc.l    2432
        dc.l    2472
        dc.l    2488
        dc.l    2550
        dc.l    2592
        dc.l    2644
        dc.l    2694
        dc.l    2716
        dc.l    2752
        dc.l    2792
        dc.l    2816
        dc.l    2870
        dc.l    2896
        dc.l    2936
        dc.l    2980
        dc.l    3044
        dc.l    3084
        dc.l    3130
        dc.l    3170
        dc.l    3226
        dc.l    3286
        dc.l    3320
        dc.l    3332
        dc.l    3376
        dc.l    3404
        dc.l    3476
        dc.l    3514
        dc.l    3584
        dc.l    3620
        dc.l    3646
        dc.l    3682
        dc.l    3734
        dc.l    3780
        dc.l    3854
        dc.l    3900
        dc.l    3914
        dc.l    3956
        dc.l    4012
        dc.l    4046
        dc.l    4120
        dc.l    4270
        dc.l    4306
        dc.l    4322
        dc.l    4344
        dc.l    4362
        dc.l    4392
        dc.l    4416
        dc.l    4442
        dc.l    4468
        dc.l    4492
        dc.l    4512
        dc.l    4558
        dc.l    4606
        dc.l    4636
        dc.l    4694
        dc.l    4730
        dc.l    4758
        dc.l    4798
        dc.l    4820
        dc.l    4922
        dc.l    4952
        dc.l    4974
        dc.l    4992
        dc.l    5058
        dc.l    5074
        dc.l    5122
        dc.l    5160
        dc.l    5168
        dc.l    5230
        dc.l    5286
        dc.l    5328
        dc.l    5362
        dc.l    5398
        dc.l    5492
        dc.l    5520
        dc.l    5618
        dc.l    5706
        dc.l    5758
        dc.l    5828
        dc.l    5898
        dc.l    6002
        dc.l    6054
        dc.l    6106
        dc.l    6152
        dc.l    6182
        dc.l    6210
        dc.l    6242
        dc.l    6272
        dc.l    6332
        dc.l    6382
        dc.l    6422
        dc.l    6488
        dc.l    6566
        dc.l    6620
        dc.l    6664
        dc.l    6712
        dc.l    6756
        dc.l    6790
        dc.l    6820
        dc.l    6864
        dc.l    6886
        dc.l    6932
        dc.l    6968
        dc.l    7012
        dc.l    7054
        dc.l    7070
        dc.l    7120
        dc.l    7152
        dc.l    7190
        dc.l    7230
        dc.l    7290
        dc.l    7354
        dc.l    7396
        dc.l    7424
        dc.l    7498
        dc.l    7522
        dc.l    7540
        dc.l    7564
        dc.l    7704
        dc.l    7754
        dc.l    7860
        dc.l    7886
        dc.l    7914
        dc.l    7934
        dc.l    7946
        dc.l    7976
        dc.l    8020
        dc.l    8088
        dc.l    8126
        dc.l    8190
        dc.l    8238
        dc.l    8310
        dc.l    8332
        dc.l    8368
        dc.l    8412
        dc.l    8460
        dc.l    8498
        dc.l    8522
        dc.l    8554
        dc.l    8582
        dc.l    8634
        dc.l    8682
        dc.l    8712
        dc.l    8736
        dc.l    8786
        dc.l    8808
        dc.l    8840
        dc.l    8884
        dc.l    8926
        dc.l    8952
        dc.l    8994
        dc.l    9042
        dc.l    9066
        dc.l    9126
        dc.l    9162
        dc.l    9206
        dc.l    9250
        dc.l    9282
        dc.l    9346
        dc.l    9398
        dc.l    9446
        dc.l    9504
        dc.l    9546
        dc.l    9586
        dc.l    9644
        dc.l    9660
        dc.l    9700
        dc.l    9724
        dc.l    9748
        dc.l    9812
        dc.l    9834
        dc.l    9850
        dc.l    9876
        dc.l    9904
        dc.l    9930
        dc.l    9974
        dc.l    10034
        dc.l    10050
        dc.l    10082
        dc.l    10102
        dc.l    10122
        dc.l    10172
        dc.l    10234
        dc.l    10278
        dc.l    10302
        dc.l    10322
        dc.l    10348
        dc.l    10406
        dc.l    10464
        dc.l    10502
        dc.l    10532
        dc.l    10556
        dc.l    10584
        dc.l    10596
        dc.l    10622
        dc.l    10684
        dc.l    10710
        dc.l    10776
        dc.l    10788
        dc.l    10814
        dc.l    10866
        dc.l    10936
        dc.l    10968
        dc.l    11002
        dc.l    11032
        dc.l    11074
        dc.l    11136
        dc.l    11164
        dc.l    11180
        dc.l    11212
        dc.l    11238
        dc.l    11260
        dc.l    11280
        dc.l    11296
        dc.l    11320
        dc.l    11354
        dc.l    11390
        dc.l    11420
        dc.l    11454
        dc.l    11512
        dc.l    11552
        dc.l    11582
        dc.l    11612
        dc.l    11638
        dc.l    11672
        dc.l    11696
        dc.l    11738
        dc.l    11762
        dc.l    11792
        dc.l    11832
        dc.l    11858
        dc.l    11868
        dc.l    11904
        dc.l    11916
        dc.l    11938
        dc.l    11966
        dc.l    12012
        dc.l    12028
        dc.l    12058
        dc.l    12088
        dc.l    12108
        dc.l    12148
        dc.l    12178
        dc.l    12202
        dc.l    12244
        dc.l    12266
        dc.l    12308
        dc.l    12332
        dc.l    12386
        dc.l    12422
        dc.l    12464
        dc.l    12490
        dc.l    12506
        dc.l    12532
        dc.l    12558
        dc.l    12606
        dc.l    12628
        dc.l    12646
        dc.l    12672
        dc.l    12696
        dc.l    12718
        dc.l    12730
        dc.l    12772
        dc.l    12796
        dc.l    12832
        dc.l    12874
        dc.l    12930
        dc.l    12968
        dc.l    13002
        dc.l    13030
        dc.l    13080
        dc.l    13102
        dc.l    13136
        dc.l    13150
        dc.l    13172
        dc.l    13196
        dc.l    13214
        dc.l    13250
        dc.l    13284
        dc.l    13304
        dc.l    13350
        dc.l    13400
        dc.l    13446
        dc.l    13466
        dc.l    13496
        dc.l    13524
        dc.l    13544
        dc.l    13592
        dc.l    13634
        dc.l    13696
        dc.l    13714
        dc.l    13752
        dc.l    13786
        dc.l    13842
        dc.l    13904
        dc.l    13952
        dc.l    13984
        dc.l    14006
        dc.l    14054
        dc.l    14088
        dc.l    14120
        dc.l    14158
        dc.l    14194
        dc.l    14254
        dc.l    14288
        dc.l    14318
        dc.l    14368
        dc.l    14402
        dc.l    14470
        dc.l    14514
        dc.l    14532
        dc.l    14554
        dc.l    14604
        dc.l    14644
        dc.l    14704
        dc.l    14726
        dc.l    14770
        dc.l    14786
        dc.l    14820
        dc.l    14862
        dc.l    14930
        dc.l    14978
        dc.l    15014
        dc.l    15046
        dc.l    15072
        dc.l    15106
        dc.l    15166
        dc.l    15220
        dc.l    15266
        dc.l    15352
        dc.l    15434
        dc.l    15502
        dc.l    15534
        dc.l    15558
        dc.l    15618
        dc.l    15652
        dc.l    15694
        dc.l    15726
        dc.l    15776
        dc.l    15838
        dc.l    15894
        dc.l    15922
        dc.l    15964
        dc.l    16002
        dc.l    16054
        dc.l    16076
        dc.l    16138
        dc.l    16174
        dc.l    16190
        dc.l    16220
        dc.l    16244
        dc.l    16280
        dc.l    16292
        dc.l    16318
        dc.l    16354
        dc.l    16394
        dc.l    16438
        dc.l    16482
        dc.l    16512
        dc.l    16548
        dc.l    16582
        dc.l    16652
        dc.l    16698
        dc.l    16744
        dc.l    16778
        dc.l    16836
        dc.l    16894
        dc.l    16944
        dc.l    16988
        dc.l    17034
        dc.l    17072
        dc.l    17118
        dc.l    17192
        dc.l    17236
        dc.l    17322
        dc.l    17370
        dc.l    17414
        dc.l    17466
        dc.l    17536
        dc.l    17632
        dc.l    17680
        dc.l    17726
        dc.l    17742
        dc.l    17792
        dc.l    17828
        dc.l    17902
        dc.l    17934
        dc.l    17984
        dc.l    18038
        dc.l    18080
        dc.l    18128
        dc.l    18174
        dc.l    18222
        dc.l    18268
        dc.l    18294
        dc.l    18332
        dc.l    18378
        dc.l    18410
        dc.l    18454
        dc.l    18468
        dc.l    18504
        dc.l    18538
        dc.l    18602
        dc.l    18644
        dc.l    18708
        dc.l    18760
        dc.l    18786
        dc.l    18834
        dc.l    18874
        dc.l    18912
        dc.l    18968
        dc.l    18986
        dc.l    19024
        dc.l    19068
        dc.l    19142
        dc.l    19170
        dc.l    19194
        dc.l    19218
        dc.l    19260
        dc.l    19294
        dc.l    19326
        dc.l    19378
        dc.l    19404
        dc.l    19436
        dc.l    19464
        dc.l    19480
        dc.l    19514
        dc.l    19546
        dc.l    19572
        dc.l    19596
        dc.l    19620
        dc.l    19674
        dc.l    19704
        dc.l    19750
        dc.l    19762
        dc.l    19780
        dc.l    19800
        dc.l    19830
        dc.l    19842
        dc.l    19872
        dc.l    19902
        dc.l    19932
        dc.l    19958
        dc.l    19986
        dc.l    20014
        dc.l    20036
        dc.l    20076
        dc.l    20142
        dc.l    20202
        dc.l    20234
        dc.l    20262
        dc.l    20300
        dc.l    20334
        dc.l    20358
        dc.l    20382
        dc.l    20438
        dc.l    20454
        dc.l    20488
        dc.l    20524
        dc.l    20548
        dc.l    20594
        dc.l    20632
        dc.l    20678
        dc.l    20724
        dc.l    20802
        dc.l    20832
        dc.l    20856
        dc.l    20910
        dc.l    20980
        dc.l    21040
        dc.l    21058
        dc.l    21094
        dc.l    21120
        dc.l    21154
        dc.l    21186
        dc.l    21220
        dc.l    21284
        dc.l    21316
        dc.l    21374
        dc.l    21396
        dc.l    21426
        dc.l    21458
        dc.l    21500
        dc.l    21534
        dc.l    21560
        dc.l    21586
        dc.l    21640
        dc.l    21688
        dc.l    21754
        dc.l    21806
        dc.l    21838
        dc.l    21906
        dc.l    21964
        dc.l    22050
        dc.l    22098
        dc.l    22152
        dc.l    22180
        dc.l    22220
        dc.l    22252
        dc.l    22296
        dc.l    22358
        dc.l    22388
        dc.l    22420
        dc.l    22442
        dc.l    22464
        dc.l    22490
        dc.l    22518
        dc.l    22538
        dc.l    22564
        dc.l    22598
        dc.l    22640
        dc.l    22704
        dc.l    22740
        dc.l    22772
        dc.l    22794
        dc.l    22820
        dc.l    22842
        dc.l    22866
        dc.l    22892
        dc.l    22920
        dc.l    22956
        dc.l    22982
        dc.l    23018
        dc.l    23036
        dc.l    23072
        dc.l    23112
        dc.l    23154
        dc.l    23180
        dc.l    23224
        dc.l    23264
        dc.l    23318
        dc.l    23338
        dc.l    23366
        dc.l    23394
        dc.l    23422
        dc.l    23466
        dc.l    23530
        dc.l    23564
        dc.l    23620
        dc.l    23668
        dc.l    23728
        dc.l    23774
        dc.l    23804
        dc.l    23842
        dc.l    23866
        dc.l    23904
        dc.l    23932
        dc.l    23980
        dc.l    24020
        dc.l    24054
        dc.l    24112
        dc.l    24140
        dc.l    24198
        dc.l    24214
        dc.l    24230
        dc.l    24246
        dc.l    24286
        dc.l    24324
        dc.l    24350
        dc.l    24390
        dc.l    24410
        dc.l    24428
        dc.l    24450
        dc.l    24478
        dc.l    24532
        dc.l    24584
        dc.l    24602
        dc.l    24646
        dc.l    24680
        dc.l    24698
        dc.l    24720
        dc.l    24744
        dc.l    24778
        dc.l    24836
        dc.l    24862
        dc.l    24878
        dc.l    24900
        dc.l    24944
        dc.l    24970
        dc.l    24984
        dc.l    25016
        dc.l    25034
        dc.l    25074
        dc.l    25098
        dc.l    25114
        dc.l    25142
        dc.l    25178
        dc.l    25214
        dc.l    25254
        dc.l    25272
        dc.l    25312
        dc.l    25384
        dc.l    25400
        dc.l    25442
        dc.l    25482
        dc.l    25514
        dc.l    25562
        dc.l    25598
        dc.l    25626
        dc.l    25652
        dc.l    25688
        dc.l    25720
        dc.l    25756
        dc.l    25784
        dc.l    25830
        dc.l    25850
        dc.l    25888
        dc.l    25958
        dc.l    25988
        dc.l    26020
        dc.l    26048
        dc.l    26100
        dc.l    26162
        dc.l    26184
        dc.l    26208
        dc.l    26246
        dc.l    26270
        dc.l    26298
        dc.l    26334
        dc.l    26368
        dc.l    26392
        dc.l    26416
        dc.l    26442
        dc.l    26486
        dc.l    26514
        dc.l    26544
        dc.l    26590
        dc.l    26616
        dc.l    26654
        dc.l    26684
        dc.l    26720
        dc.l    26742
        dc.l    26792
        dc.l    26852
        dc.l    26880
        dc.l    26912
        dc.l    26948
        dc.l    26972
        dc.l    27040
        dc.l    27074
        dc.l    27106
        dc.l    27144
        dc.l    27174
        dc.l    27212
        dc.l    27234
        dc.l    27278
        dc.l    27304
        dc.l    27330
        dc.l    27356
        dc.l    27384
        dc.l    27416
        dc.l    27458
        dc.l    27516
        dc.l    27540
        dc.l    27568
        dc.l    27638
        dc.l    27666
        dc.l    27690
        dc.l    27730
        dc.l    27752
        dc.l    27780
        dc.l    27812
        dc.l    27852
        dc.l    27886
        dc.l    27910
        dc.l    27944
        dc.l    27960
        dc.l    28030
        dc.l    28084
        dc.l    28138
        dc.l    28170
        dc.l    28222
        dc.l    28234
        dc.l    28272
        dc.l    28318
        dc.l    28336
        dc.l    28358
        dc.l    28396
        dc.l    28442
        dc.l    28464
        dc.l    28504
        dc.l    28570
        dc.l    28630
        dc.l    28674
        dc.l    28728
        dc.l    28758
        dc.l    28804
        dc.l    28834
        dc.l    28882
        dc.l    28914
        dc.l    28932
        dc.l    28952
        dc.l    28984
        dc.l    29024
        dc.l    29068
        dc.l    29126
        dc.l    29188
        dc.l    29232
        dc.l    29276
        dc.l    29302
        dc.l    29354
        dc.l    29388
        dc.l    29410
        dc.l    29446
        dc.l    29484
        dc.l    29510
        dc.l    29550
        dc.l    29584
        dc.l    29596
        dc.l    29624
        dc.l    29666
        dc.l    29718
        dc.l    29740
        dc.l    29768
        dc.l    29802
        dc.l    29826
        dc.l    29852
        dc.l    29890
        dc.l    29916
        dc.l    29950
        dc.l    29982
        dc.l    30022
        dc.l    30046
        dc.l    30060
        dc.l    30090
        dc.l    30112
        dc.l    30146
        dc.l    30200
        dc.l    30238
        dc.l    30256
        dc.l    30278
        dc.l    30314
        dc.l    30328
        dc.l    30344
        dc.l    30368
        dc.l    30408
        dc.l    30426
        dc.l    30468
        dc.l    30484
        dc.l    30522
        dc.l    30576
        dc.l    30614
        dc.l    30654
        dc.l    30686
        dc.l    30718
        dc.l    30748
        dc.l    30780
        dc.l    30856
        dc.l    30880
        dc.l    30904
        dc.l    30932
        dc.l    30978
        dc.l    31008
        dc.l    31046
        dc.l    31092
        dc.l    31152
        dc.l    31168
        dc.l    31192
        dc.l    31220
        dc.l    31238
        dc.l    31270
        dc.l    31306
        dc.l    31332
        dc.l    31390
        dc.l    31422
        dc.l    31438
        dc.l    31498
        dc.l    31522
        dc.l    31560
        dc.l    31596
        dc.l    31628
        dc.l    31668
        dc.l    31700
        dc.l    31738
        dc.l    31784
        dc.l    31810
        dc.l    31840
        dc.l    31906
        dc.l    31960
        dc.l    32012
        dc.l    32040
        dc.l    32056
        dc.l    32076
        dc.l    32126
        dc.l    32160
        dc.l    32184
        dc.l    32234
        dc.l    32266
        dc.l    32310
        dc.l    32342
        dc.l    32380
        dc.l    32412
        dc.l    32440
        dc.l    32496
        dc.l    32536
        dc.l    32552
        dc.l    32596
        dc.l    32628
        dc.l    32654
        dc.l    32678
        dc.l    32706
        dc.l    32762
        dc.l    32788
        dc.l    32806
        dc.l    32834
        dc.l    32862
        dc.l    32888
        dc.l    32924
        dc.l    32958
        dc.l    32976
        dc.l    33014
        dc.l    33048
        dc.l    33080
        dc.l    33108
        dc.l    33128
        dc.l    33146
        dc.l    33212
        dc.l    33260
        dc.l    33288
        dc.l    33332
        dc.l    33364
        dc.l    33390
        dc.l    33460
        dc.l    33506
        dc.l    33534
        dc.l    33556
        dc.l    33610
        dc.l    33680
        dc.l    33730
        dc.l    33756
        dc.l    33794
        dc.l    33840
        dc.l    33910
        dc.l    33954
        dc.l    33984
        dc.l    34004
        dc.l    34016
        dc.l    34034
        dc.l    34098
        dc.l    34126
        dc.l    34140
        dc.l    34156
        dc.l    34200
        dc.l    34248
        dc.l    34272
        dc.l    34294
        dc.l    34322
        dc.l    34360
        dc.l    34372
        dc.l    34398
        dc.l    34450
        dc.l    34484
        dc.l    34534
        dc.l    34576
        dc.l    34612
        dc.l    34670
        dc.l    34716
        dc.l    34758
        dc.l    34788
        dc.l    34818
        dc.l    34890
        dc.l    34908
        dc.l    34958
        dc.l    34974
        dc.l    35006
        dc.l    35032
        dc.l    35106
        dc.l    35162
        dc.l    35232
        dc.l    35258
        dc.l    35286
        dc.l    35328
        dc.l    35378
        dc.l    35406
        dc.l    35426
        dc.l    35454
        dc.l    35518
        dc.l    35568
        dc.l    35616
        dc.l    35642
        dc.l    35672
        dc.l    35708
        dc.l    35734
        dc.l    35762
        dc.l    35780
        dc.l    35818
        dc.l    35854
        dc.l    35894
        dc.l    35938
        dc.l    35986
        dc.l    36034
        dc.l    36062
        dc.l    36086
        dc.l    36144
        dc.l    36182
        dc.l    36250
        dc.l    36266
        dc.l    36286
        dc.l    36306
        dc.l    36342
        dc.l    36382
        dc.l    36438
        dc.l    36502
        dc.l    36536
        dc.l    36578
        dc.l    36614
        dc.l    36644
        dc.l    36684
        dc.l    36754
        dc.l    36798
        dc.l    36828
        dc.l    36878
        dc.l    36906
        dc.l    36940
        dc.l    36994
        dc.l    37026
        dc.l    37044
        dc.l    37062
        dc.l    37104
        dc.l    37122
        dc.l    37152
        dc.l    37180
        dc.l    37224
        dc.l    37274
        dc.l    37308
        dc.l    37348
        dc.l    37360
        dc.l    37390
        dc.l    37430
        dc.l    37456
        dc.l    37484
        dc.l    37514
        dc.l    37536
        dc.l    37598
        dc.l    37640
        dc.l    37672

; String data
string_data:
str_0:
        dc.b    'T','a','n','k','a',' ','a','l','l','t','i','d',' ','d','u','b'
        dc.b    'b','e','l','t',' ','s',$E5,' ','m','y','c','k','e','t',' ','s'
        dc.b    'o','m',' ','r','y','m','s',' ','i',' ','t','a','n','k','e','n'
        dc.b    ' ','p',$E5,' ','d','i','n',' ','b','i','l',0
        EVEN
str_1:
        dc.b    'S',$E4,'t','t',' ','u','p','p',' ','h','a','n','d','i','k','a'
        dc.b    'p','p','s','k','y','l','t','a','r',' ','i','s','t',$E4,'l','l'
        dc.b    'e','t',' ','f',$F6,'r',' ','t','a','v','l','o','r',' ','i',' '
        dc.b    'd','i','t','t',' ','h','u','s',0
        EVEN
str_2:
        dc.b    'A','n','v',$E4,'n','d',' ','a','l','l','t','i','d',' ','h','a'
        dc.b    'n','d','i','k','a','p','p','t','o','a','l','e','t','t','e','r'
        dc.b    0
        EVEN
str_3:
        dc.b    'T','a','p','e','t','s','e','r','a',' ','m','e','d',' ','k','v'
        dc.b    'i','t','t','o','n',' ','f','r',$E5,'n',' ','F',$E4,'r','d','t'
        dc.b    'j',$E4,'n','s','t',0
        EVEN
str_4:
        dc.b    'K','a','l','l','a',' ','a','l','l','a',' ','f','a','m','i','l'
        dc.b    'j','e','m','e','d','l','e','m','m','a','r',' ','f',$F6,'r',' '
        dc.b    $22,'C','P',$22,0
        EVEN
str_5:
        dc.b    'B',$F6,'r','j','a',' ','m','o','r','g','o','n','e','n',' ','m'
        dc.b    'e','d',' ','a','t','t',' ','s','p','e','l','a',' ',$22,'C','P'
        dc.b    '-',$C5,'K','E',$22,' ','m','e','d',' ','O','n','k','e','l',' '
        dc.b    'K',$E5,'n','k','e','l',0
        EVEN
str_6:
        dc.b    'S','k','o','t','t','a',' ','s','n',$F6,' ','p',$E5,' ','s','o'
        dc.b    'm','m','a','r','e','n',0
        EVEN
str_7:
        dc.b    'K','l','i','p','p','a',' ','g','r',$E4,'s','m','a','t','t','a'
        dc.b    'n',' ','p',$E5,' ','v','i','n','t','e','r','n',0
        EVEN
str_8:
        dc.b    'G',$E5,' ','m','e','d',' ','i',' ','A','n','o','n','y','m','a'
        dc.b    ' ','A','l','k','o','h','o','l','i','s','t','e','r',' ','f',$F6
        dc.b    'r',' ','a','t','t',' ','l',$E4,'r','a',' ','s','i','g',' ','s'
        dc.b    'u','p','a',' ','o','r','d','e','n','t','l','i','g','t',0
        EVEN
str_9:
        dc.b    'S','o','v',' ','a','l','d','r','i','g',',',' ',$E4,'t',' ','k'
        dc.b    'o','f','f','e','i','n','t','a','b','l','e','t','t','e','r',' '
        dc.b    'i','s','t',$E4,'l','l','e','t',0
        EVEN
str_10:
        dc.b    'D','u','s','c','h','a',' ','a','l','d','r','i','g',',',' ',$E4
        dc.b    't',' ','t','v',$E5,'l',' ','i','s','t',$E4,'l','l','e','t',0
        EVEN
str_11:
        dc.b    'S',$F6,'k',' ','s','o','c','i','a','l','b','i','d','r','a','g'
        dc.b    ',',' ','f',$F6,'r',' ','a','t','t',' ','s','e','d','a','n',' '
        dc.b    'e','l','d','a',' ','u','p','p',' ','p','e','n','g','a','r','n'
        dc.b    'a',0
        EVEN
str_12:
        dc.b    'K',$F6,'r',' ','m','e','d',' ','v','i','n','t','e','r','d',$E4
        dc.b    'c','k',' ','p',$E5,' ','s','o','m','m','a','r','e','n',0
        EVEN
str_13:
        dc.b    'A','n','o','r','d','n','a',' ','C','P','-','V','M',' ','i',' '
        dc.b    's','i','n',' ','e','g','e','n',' ','t','r',$E4,'d','g',$E5,'r'
        dc.b    'd',0
        EVEN
str_14:
        dc.b    'L','y','s','s','n','a',' ','p',$E5,' ','J','o','c','k','m','o'
        dc.b    'c','k','s','-','J','o','c','k','e',0
        EVEN
str_15:
        dc.b    'G',$E5,' ','t','i','l','l',' ','t','a','n','d','l',$E4,'k','a'
        dc.b    'r','e','n',' ','p',$E5,' ','s','k','o','j',0
        EVEN
str_16:
        dc.b    'S','a','m','l','a',' ','p',$E5,' ','b','r',$F6,'d','r','o','s'
        dc.b    't','a','r',0
        EVEN
str_17:
        dc.b    'B','y','g','g','a',' ','e','t','t',' ','g','a','r','a','g','e'
        dc.b    ' ','a','v',' ','m','a','r','s','h','m','a','l','l','o','w','s'
        dc.b    0
        EVEN
str_18:
        dc.b    'B','a','d','a',' ','i',' ','s','p','a','g','h','e','t','t','i'
        dc.b    0
        EVEN
str_19:
        dc.b    $C5,'k','a',' ','s','n','o','w','b','o','a','r','d',' ','p',$E5
        dc.b    ' ','s','o','m','m','a','r','e','n',0
        EVEN
str_20:
        dc.b    'U','t','b','i','l','d','a',' ','s','i','g',' ','t','i','l','l'
        dc.b    ' ','m','e','d','e','l','t','i','d','a',' ','r',$F6,'r','m','o'
        dc.b    'k','a','r','e',0
        EVEN
str_21:
        dc.b    'G','r',$E4,'v','a',' ','e','n',' ','t','u','n','n','e','l',' '
        dc.b    't','i','l','l',' ','K','i','n','a',0
        EVEN
str_22:
        dc.b    'G',$F6,'r',' ','e','n',' ','r','y','m','d','r','a','k','e','t'
        dc.b    ' ','a','v',' ','m','j',$F6,'l','k','p','a','k','e','t',0
        EVEN
str_23:
        dc.b    'K','l',$E4,' ','u','t',' ','s','i','g',' ','t','i','l','l',' '
        dc.b    'M','u','m','i','n','t','r','o','l','l','e','t',' ','f',$F6,'r'
        dc.b    's','t','a',' ','d','a','g','e','n',' ','p',$E5,' ','j','o','b'
        dc.b    'b','e','t',0
        EVEN
str_24:
        dc.b    'S','t','o','p','p','a',' ','s','i','n',' ','h','j',$E4,'r','n'
        dc.b    'a',' ','i',' ','e','n',' ','m','i','x','e','r',0
        EVEN
str_25:
        dc.b    'F','e','j','k','a',' ','l','e','g','i','t','i','m','a','t','i'
        dc.b    'o','n','e','n',' ','s',$E5,' ','a','t','t',' ','m','a','n',' '
        dc.b    'b','l','i','r',' ','y','n','g','r','e',' ','o','c','h',' ','f'
        dc.b    $E5,'r',' ','l','e','v','a',' ','l',$E4,'n','g','r','e',0
        EVEN
str_26:
        dc.b    'K','o','l','l','a',' ','p',$E5,' ',$22,'J','o','e','l','-','B'
        dc.b    'i','t','a','r',$22,0
        EVEN
str_27:
        dc.b    'K',$F6,'p','a',' ','a','l','l','a',' ','s','k','i','v','o','r'
        dc.b    ' ','m','e','d',' ',$22,'S','y','s','k','o','n','-','R','i','n'
        dc.b    'g','e','n',$22,0
        EVEN
str_28:
        dc.b    'B','y','g','g','a',' ','e','n',' ','m','o','s','k','e',' ','i'
        dc.b    ' ','T','r','o','l','l','h',$E4,'t','t','a','n',0
        EVEN
str_29:
        dc.b    'F',$F6,'r','s',$F6,'k','a',' ','g',$E5,' ','m','e','d',' ','i'
        dc.b    ' ','V','.','A','.','M',' ','n',$E4,'r',' ','m','a','n',' ',$E4
        dc.b    'r',' ','n','e','g','e','r',0
        EVEN
str_30:
        dc.b    'G',$E5,' ','t','o','m','t','e','l','i','n','j','e','n',' ','m'
        dc.b    'e','d',' ','h','o','c','k','e','y','s','p','e','l','s','t','i'
        dc.b    'l','l','v','e','r','k','n','i','n','g',' ','s','o','m',' ','t'
        dc.b    'i','l','l','v','a','l',0
        EVEN
str_31:
        dc.b    'T','r','o',' ','a','t','t',' ','d','e','t','t','a',' ',$E4,'r'
        dc.b    ' ','s','i','s','t','a',' ','n','u','m','r','e','t',0
        EVEN
str_32:
        dc.b    'K','o','n','t','r','o','l','l','r',$E4,'k','n','a',' ','s','i'
        dc.b    'n','a',' ',$F6,'r','o','n',' ','v','a','r','j','e',' ','d','a'
        dc.b    'g',' ','o','c','h',' ','a','n','t','e','c','k','n','a',' ','r'
        dc.b    'e','s','u','l','t','a','t','e','t',' ','i',' ','e','n',' ','s'
        dc.b    'v','a','r','t',' ','b','o','k',0
        EVEN
str_33:
        dc.b    'B','l','i',' ','a','n','a','r','k','i','s','t',' ','o','c','h'
        dc.b    ' ','g',$E5,' ','p',$E5,' ','n','a','z','i','s','t','m',$F6,'t'
        dc.b    'e','n',0
        EVEN
str_34:
        dc.b    'F',$F6,'r','s',$F6,'k','a',' ','s','m','u','g','g','l','a',' '
        dc.b    'i','n',' ','t','o','m','t','e','b','l','o','s','s',' ','t','i'
        dc.b    'l','l',' ','S','v','e','r','i','g','e',' ','f','r',$E5,'n',' '
        dc.b    'I','s','l','a','n','d',0
        EVEN
str_35:
        dc.b    'S','k','r','i','v','a',' ','b','r','e','v',' ','t','i','l','l'
        dc.b    ' ','s','i','g',' ','s','j',$E4,'l','v',' ','f',$F6,'r',' ','a'
        dc.b    't','t',' ','k','o','l','l','a',' ','v','e','m',' ','s','o','m'
        dc.b    ' ','f',$E5,'r',' ','b','r','e','v','e','t',0
        EVEN
str_36:
        dc.b    'S','k','r','i','v','a',' ','a','v',' ','b','i','b','e','l','n'
        dc.b    ' ','o','c','h',' ','b','y','t','a',' ','u','t',' ','o','r','d'
        dc.b    'e','t',' ',$22,'J','e','s','u','s',$22,' ','m','o','t',' ',$22
        dc.b    'C','P',$22,0
        EVEN
str_37:
        dc.b    'S','m','u','g','g','l','a',' ','s','a','n','d',' ','t','i','l'
        dc.b    'l',' ','S','k','a','g','e','n',0
        EVEN
str_38:
        dc.b    'P','r','a','t','a',' ','t','e','c','k','e','n','s','p','r',$E5
        dc.b    'k',' ','m','e','d',' ','b','l','i','n','d','a',0
        EVEN
str_39:
        dc.b    'B','y','g','g','a',' ','e','n',' ',$22,'C','P','-','b','o','x'
        dc.b    $22,' ','s',$E5,' ','a','t','t',' ','a','l','l','a',' ','v',$E4
        dc.b    'r','l','d','e','n','s',' ','s','a','m','t','a','l','s','k','o'
        dc.b    's','t','n','a','d','e','r',' ','h','a','m','n','a','r',' ','p'
        dc.b    $E5,' ','s','i','n',' ','e','g','e','n',' ','t','e','l','e','r'
        dc.b    $E4,'k','n','i','n','g',0
        EVEN
str_40:
        dc.b    'P','r','a','t','a',' ','i','n',' ','e','t','t',' ','t','v',$E5
        dc.b    ' ','t','i','m','m','a','r',' ','l',$E5,'n','g','t',' ','m','e'
        dc.b    'd','d','e','l','a','n','d','e',' ','p',$E5,' ','s','i','n',' '
        dc.b    't','e','l','e','f','o','n','s','v','a','r','a','r','e',0
        EVEN
str_41:
        dc.b    'H','i','t','t','a',' ','p',$E5,' ','e','n',' ','e','g','e','n'
        dc.b    ' ','v','a','l','u','t','a',0
        EVEN
str_42:
        dc.b    $C5,'k','a',' ','r','u','l','l','s','t','o','l',' ','p',$E5,' '
        dc.b    'f','r','i','t','i','d','e','n',0
        EVEN
str_43:
        dc.b    'S',$E4,'l','j','a',' ','s','i','n',' ','t','o','m','t',' ','t'
        dc.b    'i','l','l',' ','F',$E4,'r',$F6,'a','r','n','a',0
        EVEN
str_44:
        dc.b    'H','i','t','t','a',' ','p',$E5,' ','e','n',' ','e','g','e','n'
        dc.b    ' ','C','P','-','r','e','l','i','g','i','o','n',0
        EVEN
str_45:
        dc.b    'H','i','t','t','a',' ','p',$E5,' ','e','t','t',' ','e','g','e'
        dc.b    't',' ','s','p','r',$E5,'k',' ','s',$E5,' ','a','t','t',' ','m'
        dc.b    'a','n',' ','k','a','n',' ','p','r','a','t','a',' ','m','e','d'
        dc.b    ' ','s','i','g',' ','s','j',$E4,'l','v',0
        EVEN
str_46:
        dc.b    'S',$E4,'l','j','a',' ','b','i','l','e','n',' ','o','c','h',' '
        dc.b    's','e','d','a','n',' ','a','n','m',$E4,'l','a',' ','d','e','n'
        dc.b    ' ','s','o','m',' ','s','t','u','l','e','n',0
        EVEN
str_47:
        dc.b    'P','a','r','k','e','r','a',' ','b','i','l','e','n',' ','i',' '
        dc.b    'V',$E4,'n','e','r','n',',',' ',$E5,'r','e','t',' ','o','m',0
        EVEN
str_48:
        dc.b    'B','y','t','a',' ','u','t',' ','n','a','m','n','e','n',' ','p'
        dc.b    $E5,' ','a','l','l','a',' ','s','j','u','k','d','o','m','a','r'
        dc.b    ' ','i',' ','e','n',' ','l',$E4,'k','a','r','b','o','k',' ','m'
        dc.b    'o','t',' ',$22,'C','P',$22,0
        EVEN
str_49:
        dc.b    'S','w','a','p','p','a',' ','m','e','d',' ','s','i','g',' ','s'
        dc.b    'j',$E4,'l','v',0
        EVEN
str_50:
        dc.b    'S',$E4,'l','j','a',' ','s','i','n',' ','e','n','d','a',' ','b'
        dc.b    'i','l',' ','f',$F6,'r',' ','a','t','t',' ','h','a',' ','r',$E5
        dc.b    'd',' ','a','t','t',' ','k',$F6,'p','a',' ','e','n',' ','h','u'
        dc.b    's','v','a','g','n',0
        EVEN
str_51:
        dc.b    'T','a',' ','m','e','d',' ','s','i','g',' ','s','o','v','s',$E4
        dc.b    'c','k',' ','t','i','l','l',' ','e','t','t',' ','r','a','v','e'
        dc.b    'p','a','r','t','y',0
        EVEN
str_52:
        dc.b    'S','t',$E4,'l','l','a',' ','v',$E4,'c','k','a','r','k','l','o'
        dc.b    'c','k','a','n',' ','u','p','p','o','c','h','n','e','r',' ','f'
        dc.b    $F6,'r',' ','a','t','t',' ','f',$E5,' ','s','o','v','a',' ','l'
        dc.b    $E4,'n','g','r','e',0
        EVEN
str_53:
        dc.b    'R',$F6,'k','a',' ','s','n','u','s',0
        EVEN
str_54:
        dc.b    'D','r','i','c','k','a',' ','n',$E4,'s','s','p','r','a','y',0
        EVEN
str_55:
        dc.b    'R','i','n','g','a',' ','t','i','l','l',' ','s','i','t','t',' '
        dc.b    'e','g','e','t',' ','n','u','m','m','e','r',' ','h','e','m','i'
        dc.b    'f','r',$E5,'n',0
        EVEN
str_56:
        dc.b    $C4,'t','a',' ','s','o','p','p','a',' ','m','e','d',' ','h',$E4
        dc.b    'n','d','e','r','n','a',0
        EVEN
str_57:
        dc.b    'S','t',$E5,' ','p',$E5,' ','s',$E4,'t','e','n','a',' ','i',' '
        dc.b    'e','n',' ','b','u','s','s',0
        EVEN
str_58:
        dc.b    'T','r',$E4,'n','a',' ','p',$E5,' ','a','t','t',' ','b','l','i'
        dc.b    ' ','d',$F6,'v',0
        EVEN
str_59:
        dc.b    'D','r','a',' ','p','u','n','g','e','n',' ',$F6,'v','e','r',' '
        dc.b    'h','u','v','u','d','e','t',0
        EVEN
str_60:
        dc.b    'R','i','n','g','a',' ','f','e','l',' ','m','e','d',' ','v','i'
        dc.b    'l','j','e',0
        EVEN
str_61:
        dc.b    'L',$E4,'m','n','a',' ','t','i','l','l','b','a','k','a',' ','m'
        dc.b    'e','r',' ','b',$F6,'c','k','e','r',' ',$E4,'n',' ','m','a','n'
        dc.b    ' ','h','a','r',' ','l',$E5,'n','a','t',' ','p',$E5,' ','b','i'
        dc.b    'b','l','i','o','t','e','k','e','t',0
        EVEN
str_62:
        dc.b    'G',$E5,' ','p',$E5,' ','d','i','s','c','o',' ','m','e','d',' '
        dc.b    'f','r','e','e','s','t','y','l','e',0
        EVEN
str_63:
        dc.b    $C4,'t','a',' ','g','u','l',' ','s','n',$F6,0
        EVEN
str_64:
        dc.b    'G',$F6,'r','a',' ','s','i','t','-','u','p','s',' ','s','a','m'
        dc.b    't','i','d','i','g','t',' ','s','o','m',' ','m','a','n',' ','k'
        dc.b    $F6,'r',' ','b','i','l',0
        EVEN
str_65:
        dc.b    'H',$E4,'r','m','a',' ','s','i','g',' ','s','j',$E4,'l','v',0
        EVEN
str_66:
        dc.b    'S','k','r','i','v','a',' ','e','n',' ','e','g','e','n',' ','a'
        dc.b    'l','m','a','n','a','c','k','a',' ','d',$E4,'r',' ','C','P','-'
        dc.b    'm','a','n','n','e','n',' ','h','a','r',' ','n','a','m','n','s'
        dc.b    'd','a','g',' ','v','a','r','j','e',' ','d','a','g',0
        EVEN
str_67:
        dc.b    'T',$E4,'n','d','a',' ','e','l','d',' ','p',$E5,' ','t','a','p'
        dc.b    'e','t','e','r','n','a',' ','f',$F6,'r',' ','a','t','t',' ','v'
        dc.b    $E4,'r','m','a',' ','s','i','g',0
        EVEN
str_68:
        dc.b    'F',$F6,'r','s',$F6,'k','a',' ','a','t','t',' ','h','a',' ','a'
        dc.b    'l','l','a',' ','e','x','i','s','t','e','r','a','n','d','e',' '
        dc.b    's','j','u','k','d','o','m','a','r',' ','s','a','m','t','i','d'
        dc.b    'i','g','t',0
        EVEN
str_69:
        dc.b    'S','l',$E5,' ','a','l','l','a',' ','r','e','k','o','r','d',' '
        dc.b    'i',' ','G','u','i','n','n','e','s','s',' ','R','e','k','o','r'
        dc.b    'd','b','o','k',' ','p',$E5,' ','s','a','m','m','a',' ','d','a'
        dc.b    'g',0
        EVEN
str_70:
        dc.b    'T','a',' ','f','e','l',' ','b','u','s','s',' ','v','a','r','j'
        dc.b    'e',' ','d','a','g',0
        EVEN
str_71:
        dc.b    'G','e',' ','b','o','r','t',' ','p','r','e','s','e','n','t','e'
        dc.b    'r',' ','p',$E5,' ','s','i','n',' ','f',$F6,'d','e','l','s','e'
        dc.b    'd','a','g',0
        EVEN
str_72:
        dc.b    'P','r','e','n','u','m','e','r','e','r','a',' ','p',$E5,' ','t'
        dc.b    'i','d','n','i','n','g','a','r',' ','s','o','m',' ','i','n','t'
        dc.b    'e',' ','f','i','n','n','s',0
        EVEN
str_73:
        dc.b    'P','a','n','t','a',' ','o',$F6,'p','p','n','a','d','e',' ',$F6
        dc.b    'l','b','u','r','k','a','r',0
        EVEN
str_74:
        dc.b    'S','t',$E4,'l','l','a',' ','u','p','p',' ','i',' ','k','v','i'
        dc.b    't','t',' ','e','l','l','e','r',' ','d','u','b','b','e','l','t'
        dc.b    ' ','i',' ',$E4,'m','n','e','t',' ',$22,'R','u','l','l','s','t'
        dc.b    'o','l','a','r',$22,0
        EVEN
str_75:
        dc.b    'F','y','l','l','a',' ','m','u','n','n','e','n',' ','m','e','d'
        dc.b    ' ','g','u','l','a',' ','g','e','m',0
        EVEN
str_76:
        dc.b    'P',$E5,'s','t',$E5,' ','a','t','t',' ','m','a','n',' ',$E4,'r'
        dc.b    ' ','g','o','d',' ','v',$E4,'n',' ','m','e','d',' ','j','u','l'
        dc.b    't','o','m','t','e','n',0
        EVEN
str_77:
        dc.b    'F','y','l','l','a',' ','s','i','t','t',' ','b','a','d','k','a'
        dc.b    'r',' ','m','e','d',' ','s','n',$F6,' ','n',$E4,'r',' ','m','a'
        dc.b    'n',' ','s','k','a',' ','b','a','d','a',0
        EVEN
str_78:
        dc.b    'G',$F6,'r','a',' ','e','n',' ','k',$F6,'n','s','o','p','e','r'
        dc.b    'a','t','i','o','n',' ','s',$E5,' ','a','t','t',' ','m','a','n'
        dc.b    ' ','b','l','i','r',' ','m','a','n',' ','n',$E4,'r',' ','m','a'
        dc.b    'n',' ','r','e','d','a','n',' ',$E4,'r',' ','m','a','n',0
        EVEN
str_79:
        dc.b    'B','y','t','a',' ','n','u','m','m','e','r','p','l',$E5,'t','a'
        dc.b    'r',' ','m','e','d',' ','s','i','n','a',' ','C','P','-','k','o'
        dc.b    'm','p','i','s','a','r',0
        EVEN
str_80:
        dc.b    'G',$F6,'r','a',' ','l','u','m','p','e','n',' ','f',$F6,'r',' '
        dc.b    'a','t','t',' ','m','a','n',' ','g','i','l','l','a','r',' ','n'
        dc.b    $E4,'r',' ','d','e','t',' ','r','e','g','n','a','r',0
        EVEN
str_81:
        dc.b    'A','n','v',$E4,'n','d','a',' ',$22,'B','l','a','s','k','a','n'
        dc.b    $22,' ','i',' ','u','n','d','e','r','v','i','s','n','i','n','g'
        dc.b    's','s','y','f','t','e',0
        EVEN
str_82:
        dc.b    'H',$E4,'l','s','a',' ','m','e','d',' ','v',$E4,'n','s','t','e'
        dc.b    'r','h','a','n','d','e','n',' ','n',$E4,'r',' ','m','a','n',' '
        dc.b    's','k','a',' ','t','a',' ','e','m','o','t',' ','n','o','b','e'
        dc.b    'l','p','r','i','s','e','t',0
        EVEN
str_83:
        dc.b    'A','n','v',$E4,'n','d','a',' ','h',$E4,'n','d','e','r','n','a'
        dc.b    ' ','i','s','t',$E4,'l','l','e','t',' ','f',$F6,'r',' ','p','e'
        dc.b    'n','s','e','l',' ','n',$E4,'r',' ','m','a','n',' ','m',$E5,'l'
        dc.b    'a','r',' ','o','m',' ','h','u','s','e','t',0
        EVEN
str_84:
        dc.b    'A','n','v',$E4,'n','d','a',' ','l','i','m',' ','i','s','t',$E4
        dc.b    'l','l','e','t',' ','f',$F6,'r',' ','t','a','n','d','k','r',$E4
        dc.b    'm',0
        EVEN
str_85:
        dc.b    'S','n','i','f','f','a',' ','s','n',$F6,0
        EVEN
str_86:
        dc.b    'G',$F6,'r','a',' ','e','n',' ','f','i','l','m',' ','m','e','d'
        dc.b    ' ','s','p',$E4,'n','n','a','n','d','e',' ','r','u','l','l','s'
        dc.b    't','o','l','s','j','a','k','t','e','r',0
        EVEN
str_87:
        dc.b    $C5,'k','a',' ','r','u','l','l','s','t','o','l',' ','i',' ',$22
        dc.b    'F','l','u','m','-','R','i','d','e',$22,0
        EVEN
str_88:
        dc.b    'V','i','n','n','a',' ','t','r','e',' ','m','i','l','j','o','n'
        dc.b    'e','r',' ','k','r',' ','p',$E5,' ','B','i','n','g','o','l','o'
        dc.b    't','t','o',' ','o','c','h',' ','s','e','d','a','n',' ','k',$F6
        dc.b    'p','a',' ','b','i','n','g','o','l','o','t','t','e','r',' ','f'
        dc.b    $F6,'r',' ','a','l','l','t',0
        EVEN
str_89:
        dc.b    'S','t','r','u','n','t','a',' ','i',' ','s',$E4,'k','e','r','h'
        dc.b    'e','t','s','b',$E4,'l','t','e','t',' ','p',$E5,' ',$22,'L','o'
        dc.b    'o','p','e','n',$22,0
        EVEN
str_90:
        dc.b    'L',$E4,'s','a',' ','u','p','p',' ','h','e','l','a',' ','C','P'
        dc.b    '-','l','i','s','t','a','n',' ','o','c','h',' ','s','a','m','p'
        dc.b    'l','a',' ','d','e','n',' ','o','c','h',' ','l',$E4,'g','g','a'
        dc.b    ' ','d','e','n',' ','p',$E5,' ','s','i','n',' ','h',$E5,'r','d'
        dc.b    'd','i','s','k',0
        EVEN
str_91:
        dc.b    'S','p','e','l','a',' ',$22,'R','a','p','p','a','k','a','l','j'
        dc.b    'a',$22,' ','p',$E5,' ','t','v',$E5,' ','p','e','r','s','o','n'
        dc.b    'e','r',0
        EVEN
str_92:
        dc.b    'A','v','l','y','s','s','n','a',' ','s','i','n',' ','e','g','e'
        dc.b    'n',' ','t','e','l','e','f','o','n',0
        EVEN
str_93:
        dc.b    'D','r','i','c','k','a',' ','v','a','t','t','e','n',' ','n',$E4
        dc.b    'r',' ','m','a','n',' ',$E4,'r',' ','p',$E5,' ','k','r','o','g'
        dc.b    'e','n',0
        EVEN
str_94:
        dc.b    'G',$F6,'r','a',' ','s','e','m','l','o','r',' ','m','e','d',' '
        dc.b    'm','o','d','e','l','l','e','r','a',' ','i','s','t',$E4,'l','l'
        dc.b    'e','t',' ','f',$F6,'r',' ','m','a','n','d','e','l','m','a','s'
        dc.b    's','a',0
        EVEN
str_95:
        dc.b    'T','r','o',' ','a','t','t',' ',$22,'2','-','U','n','l','i','m'
        dc.b    'i','t','e','d',$22,' ','k','o','m','m','e','r',' ','g','e',' '
        dc.b    'u','t',' ','e','n',' ','l','i','v','e','-','C','D',0
        EVEN
str_96:
        dc.b    'G',$F6,'r','a',' ','v','i','l','d','a',' ','o','m','k',$F6,'r'
        dc.b    'n','i','n','g','a','r',' ','o','c','h',' ','t','a',' ','g','e'
        dc.b    'n','v',$E4,'g','a','r',' ',$F6,'v','e','r',' ','g','r',$E4,'s'
        dc.b    'm','a','t','t','o','r',' ','p',$E5,' ','s','i','n',' ','u','p'
        dc.b    'p','k',$F6,'r','n','i','n','g',0
        EVEN
str_97:
        dc.b    'K','l',$E4,' ','u','t',' ','s','i','g',' ','t','i','l','l',' '
        dc.b    'e','t','t',' ','v','i','d','e','o','b','a','n','d',' ','p',$E5
        dc.b    ' ','m',$F6,'n','s','t','r','i','n','g','e','n',0
        EVEN
str_98:
        dc.b    $C4,'t','a',' ','C','l','e','a','r','a','s','i','l',0
        EVEN
str_99:
        dc.b    'P','l','u','g','g','a',' ','a','l','f','a','b','e','t','e','t'
        dc.b    ' ','i','n','f',$F6,'r',' ','t','e','n','t','a','m','e','n',' '
        dc.b    'i',' ','s','v','e','n','s','k','a',0
        EVEN
str_100:
        dc.b    'R','i','n','g','a',' ','p',$E5,' ','b',$E5,'d','a',' ','n','u'
        dc.b    'm','r','e','n',' ','p',$E5,' ',$22,'P','e','r','n','i','l','l'
        dc.b    'a',' ','&',' ','C','o','.',$22,' ','(','J','a',' ','e','l','l'
        dc.b    'e','r',' ','N','e','j',')',0
        EVEN
str_101:
        dc.b    $22,'C','a','r','d','a',$22,' ','p',$E5,' ','s','i','t','t',' '
        dc.b    'e','g','e','t',' ','V','i','s','a','-','n','u','m','m','e','r'
        dc.b    0
        EVEN
str_102:
        dc.b    'S','k','r','i','v','a',' ','i',' ','s','i','t','t',' ','t','e'
        dc.b    's','t','a','m','e','n','t','e',' ','a','t','t',' ','s','i','n'
        dc.b    ' ','s','e','d','a','n',' ','l',$E4,'n','g','e',' ','a','v','l'
        dc.b    'i','d','n','a',' ','f','a','r','f','a','r',' ','f',$E5,'r',' '
        dc.b    $E4,'r','v','a',' ','a','l','l','t',0
        EVEN
str_103:
        dc.b    'S','t','a','r','t','a',' ','e','t','t',' ','l','o','k','a','l'
        dc.b    'r','a','d','i','o','p','r','o','g','r','a','m',' ','d',$E4,'r'
        dc.b    ' ','m','a','n',' ','r','i','n','g','e','r',' ','b','r','a','n'
        dc.b    'd','k',$E5,'r','e','n',' ','o','c','h',' ','s',$E4,'g','e','r'
        dc.b    ' ','a','t','t',' ','d','e','t',' ','b','r','i','n','n','e','r'
        dc.b    ' ','p',$E5,' ','N','i','s','s','e',' ','v','a','r','j','e',' '
        dc.b    'd','a','g',' ','s','o','m',' ','p','r','o','g','r','a','m','m'
        dc.b    'e','t',' ','s',$E4,'n','d','s',',',' ','p','r','o','g','r','a'
        dc.b    'm','m','e','t',' ','s','k','a',' ','h','e','t','a',' ','T','a'
        dc.b    'r','z','a','n',0
        EVEN
str_104:
        dc.b    'S','v','a','r','a',' ','i',' ','t','e','l','e','f','o','n',' '
        dc.b    'n',$E4,'r',' ','d','e','t',' ','i','n','t','e',' ','r','i','n'
        dc.b    'g','e','r',0
        EVEN
str_105:
        dc.b    'B','i','t','a',' ','s','i','g',' ','i',' ',$F6,'g','a','t',0
        EVEN
str_106:
        dc.b    'L','y','s','s','n','a',' ','p',$E5,' ','t','o','m','m','a',' '
        dc.b    'b','a','n','d',0
        EVEN
str_107:
        dc.b    'B','l','i',' ','k','a','k','t','u','s','k','r','a','m','a','r'
        dc.b    'e',0
        EVEN
str_108:
        dc.b    'T','a','p','e','t','s','e','r','a',' ','p',$E5,' ','u','t','s'
        dc.b    'i','d','a','n',' ','a','v',' ','h','u','s','e','t',0
        EVEN
str_109:
        dc.b    'S',$E4,'t','t','a',' ','f','a','l','l','u','c','k','o','r',' '
        dc.b    'i',' ','t','a','k','e','t',0
        EVEN
str_110:
        dc.b    'L',$E4,'g','g','a',' ','u','t',' ','l','a','x','n',$E4,'t',' '
        dc.b    'i',' ','s','l','u','m','p',$E5,'n',0
        EVEN
str_111:
        dc.b    'T','a',' ','i','n',' ','e','n',' ','j','u','l','k','a','k','t'
        dc.b    'u','s',' ','p',$E5,' ','j','u','l',0
        EVEN
str_112:
        dc.b    $C5,'k','a',' ','s','k','a','t','e','b','o','a','r','d',' ','i'
        dc.b    ' ','S','a','h','a','r','a',0
        EVEN
str_113:
        dc.b    'R','i','n','g','a',' ','b','b','s','e','r',' ',$22,'V','o','i'
        dc.b    'c','e',$22,0
        EVEN
str_114:
        dc.b    'R','i','n','g','a',' ','t','i','l','l',' ','B','i','n','g','o'
        dc.b    'l','o','t','t','o',' ','n',$E4,'r',' ','m','a','n',' ','i','n'
        dc.b    't','e',' ','h','a','r',' ','b','i','n','g','o',0
        EVEN
str_115:
        dc.b    'S','t','e','k','a',' ','f','i','s','k',' ','o','c','h',' ','s'
        dc.b    'e','d','a','n',' ','l',$E4,'g','g','a',' ','d','e','n',' ','i'
        dc.b    ' ','s','i','t','t',' ','a','k','v','a','r','i','u','m',0
        EVEN
str_116:
        dc.b    'G','r',$E4,'v','a',' ','e','f','t','e','r',' ','g','u','l','d'
        dc.b    ' ','i',' ','g','a','r','d','e','r','o','b','e','n',0
        EVEN
str_117:
        dc.b    'B',$F6,'r','j','a',' ','p','l','u','g','g','a',' ','p',$E5,' '
        dc.b    'e','t','t',' ','p','r','o','v',' ','d','a','g','e','n',' ','e'
        dc.b    'f','t','e','r',' ','m','a','n',' ','h','a','r',' ','h','a','f'
        dc.b    't',' ','p','r','o','v','e','t',0
        EVEN
str_118:
        dc.b    'F','y','l','l','a',' ','e','n',' ','h','e','l',' ','s','j',$F6
        dc.b    ' ','m','e','d',' ','b','r','u','s','t','a','b','l','e','t','t'
        dc.b    'e','r',0
        EVEN
str_119:
        dc.b    'F','y','l','l','a',' ','n','a','v','e','l','n',' ','m','e','d'
        dc.b    ' ','s','a','f','t','s','o','p','p','a',0
        EVEN
str_120:
        dc.b    'T','v','i','n','g','a',' ','f','i','n','g','r','a','r','n','a'
        dc.b    ' ','b','a','k',$E5,'t',' ','t','i','l','l','s',' ','d','o','m'
        dc.b    ' ','g',$E5,'r',' ','a','v',0
        EVEN
str_121:
        dc.b    'B','i','t','a',' ','a','v',' ','a','r','m','a','r',' ','o','c'
        dc.b    'h',' ','b','e','n',0
        EVEN
str_122:
        dc.b    'S','k',$E4,'r','a',' ','a','v',' ','h','a','l','s','p','u','l'
        dc.b    's',$E5,'d','e','r','n',' ','f',$F6,'r',' ','a','t','t',' ','s'
        dc.b    'e',' ','h','u','r',' ','m','y','c','k','e','t',' ','b','l','o'
        dc.b    'd',' ','m','a','n',' ','h','a','r',' ','o','c','h',' ','h','u'
        dc.b    'r',' ','l',$E5,'n','g',' ','t','i','d',' ','d','e','t',' ','t'
        dc.b    'a','r',' ','a','t','t',' ','t',$F6,'m','m','a',' ','u','t',' '
        dc.b    'a','l','l','t',0
        EVEN
str_123:
        dc.b    'K',$F6,'r','a',' ','m','e','d',' ','s','n',$F6,'k','a','n','o'
        dc.b    'n',' ','p',$E5,' ','s','o','m','m','a','r','e','n',0
        EVEN
str_124:
        dc.b    'B','a','s','t','a',' ','m','e','d',' ','k','l',$E4,'d','e','r'
        dc.b    'n','a',' ','p',$E5,0
        EVEN
str_125:
        dc.b    'S','n','i','f','f','a',' ','c','o','r','n','f','l','a','k','e'
        dc.b    's',0
        EVEN
str_126:
        dc.b    'B','e','s','t',$E4,'l','l','a',' ','s','a','k','e','r',' ','m'
        dc.b    'o','t',' ','p','o','r','t','f',$F6,'r','s','k','o','t','t',' '
        dc.b    'o','c','h',' ','s','e','d','a','n',' ','f',$F6,'r','s',$F6,'k'
        dc.b    'a',' ','p','r','u','t','a',' ','p',$E5,' ','p','o','s','t','e'
        dc.b    'n',0
        EVEN
str_127:
        dc.b    'K','o','p','i','e','r','a',' ','t','o','m','b','a','n','d',0
        EVEN
str_128:
        dc.b    'B','y','g','g','a',' ','e','t','t',' ','L','P','-','R','O','M'
        dc.b    ' ','m','e','d',' ','v','i','n','y','l','s','k','i','v','o','r'
        dc.b    ' ','t','i','l','l',' ','s','i','n',' ','d','a','t','o','r',0
        EVEN
str_129:
        dc.b    'V',$E4,'l','j','a',' ',$22,'J','e','o','p','a','r','d','y',$22
        dc.b    ' ','s','o','m',' ','t','i','l','l','v','a','l',' ','i',' ','s'
        dc.b    'k','o','l','a','n',0
        EVEN
str_130:
        dc.b    $C4,'t','a',' ','e','l','d',0
        EVEN
str_131:
        dc.b    'S','p','a','r','a',' ','b','e','n','s','i','n','p','e','n','g'
        dc.b    'a','r',' ','g','e','n','o','m',' ','a','t','t',' ','b','l','a'
        dc.b    'n','d','a',' ','u','t',' ','b','e','n','s','i','n','e','n',' '
        dc.b    'm','e','d',' ','s','a','f','t','s','o','p','p','a',0
        EVEN
str_132:
        dc.b    'G',$F6,'r','a',' ','b','o','k','r','e','c','e','n','s','i','o'
        dc.b    'n','e','r',' ','p',$E5,' ','A','l','f','o','n','s',' ',$C5,'b'
        dc.b    'e','r','g',' ','b',$F6,'c','k','e','r','n','a',' ','i',' ','s'
        dc.b    'v','e','n','s','k','a','n',0
        EVEN
str_133:
        dc.b    'P','l','a','n','t','e','r','a',' ','b','a','t','t','e','r','i'
        dc.b    'e','r',' ','o','c','h',' ','v','a','t','t','n','a',' ','m','e'
        dc.b    'd',' ','b','e','n','s','i','n',0
        EVEN
str_134:
        dc.b    'B','o','r','r','a',' ','h',$E5,'l',' ','i',' ','g','o','l','v'
        dc.b    'e','t',' ','f',$F6,'r',' ','j','u','l','g','r','a','n','e','n'
        dc.b    0
        EVEN
str_135:
        dc.b    'S','p','e','l','a',' ','2','-','U','n','l','i','m','i','t','e'
        dc.b    'd',' ','p',$E5,' ','e','t','t',' ','r','a','v','e','p','a','r'
        dc.b    't','y',0
        EVEN
str_136:
        dc.b    'G',$F6,'r','a',' ','i','n','b','r','o','t','t',' ','p',$E5,' '
        dc.b    'e','t','t',' ','d','a','g','i','s',' ','f',$F6,'r',' ','a','t'
        dc.b    't',' ','f',$E5,' ','b','y','g','g','a',' ','m','e','d',' ','l'
        dc.b    'e','g','o',' ',$E4,'n','d','a',' ','t','i','l','l','s',' ','p'
        dc.b    'o','l','i','s','e','n',' ','k','o','m','m','e','r',' ','o','c'
        dc.b    'h',' ','h',$E4,'m','t','a','r',' ','d','i','g',0
        EVEN
str_137:
        dc.b    'B','y','g','g','a',' ','e','n',' ','f','r','i','g','g','e','b'
        dc.b    'o','d',' ','a','v',' ','l','e','g','o',0
        EVEN
str_138:
        dc.b    'D',$F6,'p','a',' ','s','i','n','a',' ','u','n','g','a','r',' '
        dc.b    't','i','l','l',' ','k','o','n','s','t','i','g','a',' ','n','a'
        dc.b    'm','n',' ','t','y','p',' ',$22,'H','a','g','b','a','r','d',$22
        dc.b    ' ',$22,'A','n','d','e','r','s',' ','H','i','t','l','e','r',$22
        dc.b    ' ',$22,'M','a','g','n','u','s',' ','P',$E5,'f',$E5,'g','e','l'
        dc.b    $22,' ',$22,'J','o','h','a','n',' ','S','c','h',$E4,'f','e','r'
        dc.b    $22,0
        EVEN
str_139:
        dc.b    'K',$F6,'p','a',' ','e','n',' ','p','i','t','t','b','u','l','l'
        dc.b    '-','t','e','r','r','i','e','r',' ','o','c','h',' ','r','e','t'
        dc.b    'a',' ','d','e','n',' ','i',' ','e','t','t',' ','h','a','l','v'
        dc.b    $E5,'r',' ','o','c','h',' ','s','e','d','a','n',' ','s','l',$E4
        dc.b    'p','p','a',' ','i','n',' ','d','e','n',' ','p',$E5,' ','e','t'
        dc.b    't',' ','d','a','g','i','s',0
        EVEN
str_140:
        dc.b    'K',$F6,'p','a',' ','s','t','u','d','e','n','t','m',$F6,'s','s'
        dc.b    'o','r',' ','f',$F6,'r',' ','h','e','l','a',' ','s','t','u','d'
        dc.b    'i','e','b','i','d','r','a','g','e','t',' ',$E5,'r','e','t',' '
        dc.b    'o','m',0
        EVEN
str_141:
        dc.b    'T','a',' ','m','e','d',' ','s','i','g',' ','e','n',' ','h','u'
        dc.b    'n','g','r','i','g',' ','m','y','r','s','l','o','k',' ','p',$E5
        dc.b    ' ','e','n',' ','u','t','s','t',$E4,'l','l','n','i','n','g',' '
        dc.b    'o','m',' ','s',$E4,'l','l','s','y','n','t','a',' ','i','n','s'
        dc.b    'e','k','t','e','r',0
        EVEN
str_142:
        dc.b    'D','r',$F6,'m','m','a',' ','m','a','r','d','r',$F6,'m','m','a'
        dc.b    'r',' ','o','m',' ','e','l','a','k','a',' ','k','a','l','a','s'
        dc.b    'p','u','f','f','s','p','a','k','e','t',' ','s','o','m',' ','t'
        dc.b    $E4,'n','k','e','r',' ','t','a',' ',$F6,'v','e','r',' ','j','o'
        dc.b    'r','d','e','n',0
        EVEN
str_143:
        dc.b    'H','y','r','a',' ','e','n',' ','v','i','d','e','o','f','i','l'
        dc.b    'm',' ','o','c','h',' ','s','e','d','a','n',' ','s','p','e','l'
        dc.b    'a',' ',$F6,'v','e','r',' ','d','e','n',' ','m','e','d',' ','e'
        dc.b    'n',' ','p','o','r','r','f','i','l','m',' ','d',$E4,'r',' ','m'
        dc.b    'a','n',' ','s',$E4,'t','t','e','r',' ','p',$E5,' ','e','n',' '
        dc.b    'u','t','v','e','c','k','l','i','n','g','s','s','t',$F6,'r','d'
        dc.b    ' ','e','s','k','i','m',$E5,0
        EVEN
str_144:
        dc.b    'K',$E4,'k','a',' ','u','p','p',' ','s','i','n',' ','k','e','p'
        dc.b    's',' ','f',$F6,'r',' ','a','t','t',' ','v',$E5,'g','a',' ','t'
        dc.b    'a',' ','e','t','t',' ','l',$E5,'n',' ','p',$E5,' ','b','a','n'
        dc.b    'k','e','n',0
        EVEN
str_145:
        dc.b    'S','t','o','p','p','a',' ','i','n',' ','p','o','m','m','e','s'
        dc.b    ' ','f','r','i','t','e','s',' ','i',' ',$F6,'r','o','n','e','n'
        dc.b    ' ','n',$E4,'r',' ','m','a','n',' ','g',$E5,'r',' ','p',$E5,' '
        dc.b    'b','i','o',0
        EVEN
str_146:
        dc.b    'S','t','j',$E4,'l','a',' ','e','n',' ','c','y','k','e','l',' '
        dc.b    'f',$F6,'r',' ','a','t','t',' ','f',$E5,' ','h',$F6,'g','r','e'
        dc.b    ' ','s','t','u','d','i','e','b','i','d','r','a','g',0
        EVEN
str_147:
        dc.b    'S','p','r','i','n','g','a',' ','m','o','t',' ','i','s','l',$E4
        dc.b    'n','d','s','k','a',' ','k','u','r','d','e','r',0
        EVEN
str_148:
        dc.b    'S',$E4,'l','j','a',' ','k','o','k','a','i','n',' ','t','i','l'
        dc.b    'l',' ','C','o','l','o','m','b','i','a',0
        EVEN
str_149:
        dc.b    'E','x','t','r','a','k','n',$E4,'c','k','a',' ','s','o','m',' '
        dc.b    $E4,'l','g',' ','p',$E5,' ','S','k','a','n','s','e','n',0
        EVEN
str_150:
        dc.b    'T','a',' ','p','a','t','e','n','t',' ','p',$E5,' ','a','t','t'
        dc.b    ' ','v','a','r','a',' ','l','a','t','e','n','t',0
        EVEN
str_151:
        dc.b    'L',$E5,'s','a',' ','u','t','e',' ','s','i','g',' ','f','r',$E5
        dc.b    'n',' ','s','i','t','t',' ','h','u','s',' ','f',$F6,'r',' ','a'
        dc.b    't','t',' ','s','l','i','p','p','a',' ','s','v','a','r','a',' '
        dc.b    'i',' ','t','e','l','e','f','o','n','e','n',0
        EVEN
str_152:
        dc.b    'M',$E5,'l','a',' ','s','i','n',' ','g','r',$E4,'s','m','a','t'
        dc.b    't','a',' ','b','l',$E5,' ','f',$F6,'r',' ','a','t','t',' ','i'
        dc.b    'n','g','e','n',' ','s','k','a',' ','s','n','o',' ','d','e','n'
        dc.b    0
        EVEN
str_153:
        dc.b    'V','a','r','a',' ','r','e','d','l',$F6,'s','t',' ','b','e','r'
        dc.b    'u','s','a','d',' ','p',$E5,' ','s','i','n',' ','u','p','p','k'
        dc.b    $F6,'r','n','i','n','g',0
        EVEN
str_154:
        dc.b    'I','m','p','a',' ','p',$E5,' ','b','r','u','d','a','r',' ','g'
        dc.b    'e','n','o','m',' ','a','t','t',' ','s','t','r','u','n','t','a'
        dc.b    ' ','i',' ','s',$E4,'k','e','r','h','e','t','s','b',$E4,'l','t'
        dc.b    'e','t',' ','p',$E5,' ','a','e','r','o','v','a','r','v','e','t'
        dc.b    0
        EVEN
str_155:
        dc.b    'S','t','a','r','t','a',' ','e','n',' ','r','u','l','l','s','t'
        dc.b    'o','l','s','f','a','b','r','i','k',' ','s','o','m',' ','h','e'
        dc.b    't','e','r',' ',$22,'G','o','l','v','o',$22,' ','s','o','m',' '
        dc.b    'b','e','t','y','d','e','r',' ',$22,'J','a','g',' ',$E4,'r',' '
        dc.b    'C','P',$22,' ','p',$E5,' ','l','a','t','i','n',0
        EVEN
str_156:
        dc.b    'S',$E5,'g','a',' ','s',$F6,'n','d','e','r',' ','e','n',' ','t'
        dc.b    'a','n','d','e','m','c','y','k','e','l',' ','s',$E5,' ','a','t'
        dc.b    't',' ','m','a','n',' ','f',$E5,'r',' ','t','v',$E5,' ','c','y'
        dc.b    'k','l','a','r',0
        EVEN
str_157:
        dc.b    'K',$F6,'p','a',' ','t',$E5,'g','b','i','l','j','e','t','t',' '
        dc.b    'n',$E4,'r',' ','m','a','n',' ','h','a','r',' ','i','n','t','e'
        dc.b    'r','-','r','a','i','l',' ','k','o','r','t',0
        EVEN
str_158:
        dc.b    'K','l','i','p','p','a',' ','g','r','a','n','n','e','n','s',' '
        dc.b    'g','r',$E4,'s','m','a','t','t','a',' ','i','s','t',$E4,'l','l'
        dc.b    'e','t',' ','f',$F6,'r',' ','s','i','n',' ','e','g','e','n',0
        EVEN
str_159:
        dc.b    'H','u','g','g','a',' ','a','v',' ','s','i','g',' ','h',$E4,'n'
        dc.b    'd','e','r','n','a',' ','s',$E5,' ','m','a','n',' ','s','l','i'
        dc.b    'p','p','e','r',' ','d','i','s','k','a',0
        EVEN
str_160:
        dc.b    'K','o','p','i','e','r','a',' ','v','i','d','e','o','r','e','n'
        dc.b    'g',$F6,'r','i','n','g','s',' ','k','a','s','s','e','t','t','e'
        dc.b    'r',0
        EVEN
str_161:
        dc.b    'G',$F6,'r','a',' ','s','p','l','a','t','t','e','r','f','i','l'
        dc.b    'm','e','r',' ','f',$F6,'r',' ','b','a','r','n',0
        EVEN
str_162:
        dc.b    'T','r','o',' ','a','t','t',' ',$22,'A','r','i','e','l',' ','U'
        dc.b    'l','t','r','a',$22,' ',$E4,'r',' ','e','t','t',' ','p','r','e'
        dc.b    'v','e','n','t','i','v','m','e','d','e','l',0
        EVEN
str_163:
        dc.b    'V','a','r','a',' ','h',$F6,'g',' ','p',$E5,' ','h',$F6,'g','m'
        dc.b    $E4,'s','s','a','n',0
        EVEN
str_164:
        dc.b    'F','i','r','a',' ',$E5,'r','s','d','a','g','e','n',' ','a','v'
        dc.b    ' ','T','i','t','a','n','i','c','s',' ','u','n','d','e','r','g'
        dc.b    $E5,'n','g',' ','v','a','r','j','e',' ',$E5,'r',0
        EVEN
str_165:
        dc.b    'F','o','r','m','a','t','e','r','a',' ','d','i','s','k','e','t'
        dc.b    't','e','r',' ','i',' ','d','i','s','k','m','a','s','k','i','n'
        dc.b    'e','n',0
        EVEN
str_166:
        dc.b    'B',$F6,'r','j','a',' ','b','i','t','a',' ','f','o','l','k',' '
        dc.b    'i',' ','s','l','i','p','s','e','n',' ','p',$E5,' ','v','i','k'
        dc.b    't','i','g','a',' ','m',$F6,'t','e','n',0
        EVEN
str_167:
        dc.b    'I','n','f',$F6,'r','a',' ','C','P','-','n','a','t','i','o','n'
        dc.b    'a','l','d','a','g','e','n',' ','d','e','n',' ','3','4',':','e'
        dc.b    ' ','O','k','t','o','b','e','r',0
        EVEN
str_168:
        dc.b    $C4,'t','a',' ','u','p','p',' ','m','o','m','s','e','n',0
        EVEN
str_169:
        dc.b    'B','i','n','d','a',' ','f','a','s','t',' ','e','t','t',' ','C'
        dc.b    'P',' ','b','a','k','o','m',' ','b','i','l','e','n',' ','n',$E4
        dc.b    'r',' ','m','a','n',' ','g','i','f','t','e','r',' ','s','i','g'
        dc.b    0
        EVEN
str_170:
        dc.b    'K','o','p','i','e','r','a',' ','C','D','-','s','k','i','v','o'
        dc.b    'r',' ','m','e','d',' ','e','n',' ','m','a','n','g','e','l',0
        EVEN
str_171:
        dc.b    'A','n','v',$E4,'n','d','a',' ','m','i','k','r','o','v',$E5,'g'
        dc.b    's','u','g','n',' ','s','o','m',' ','e','t','t',' ','a','k','v'
        dc.b    'a','r','i','u','m',0
        EVEN
str_172:
        dc.b    'B','e','g',$E4,'r','a',' ','s','k','i','l','s','m',$E4,'s','s'
        dc.b    'a',' ','n',$E4,'r',' ','m','a','n',' ','i','n','t','e',' ',$E4
        dc.b    'r',' ','g','i','f','t',0
        EVEN
str_173:
        dc.b    'H','o','p','p','a',' ','b','u','n','g','y','j','u','m','p',' '
        dc.b    'f','r',$E5,'n',' ','S','t','a','l','l','b','a','c','k','a','b'
        dc.b    'r','o','n',' ','m','e','d',' ','e','t','t',' ','r','e','p',' '
        dc.b    'r','u','n','t',' ','h','a','l','s','e','n',0
        EVEN
str_174:
        dc.b    'D','r','i','c','k','a',' ','e','n',' ','s','t','a','r','k',$F6
        dc.b    'l',' ','f',$F6,'r',' ','v','a','r','j','e',' ','p','a','s','s'
        dc.b    'n','i','n','g',' ','S','v','e','r','i','g','e',' ','g',$F6,'r'
        dc.b    ' ','i',' ','F','o','t','b','o','l','l','s','-','V','M',0
        EVEN
str_175:
        dc.b    'T','a',' ','k',$F6,'r','l','e','k','t','i','o','n','e','r',' '
        dc.b    'n',$E4,'r',' ','m','a','n',' ','r','e','d','a','n',' ','h','a'
        dc.b    'r',' ','k',$F6,'r','k','o','r','t',0
        EVEN
str_176:
        dc.b    'G',$E5,' ','i',' ','r','u','l','l','t','r','a','p','p','a',' '
        dc.b    $E5,'t',' ','f','e','l',' ','h',$E5,'l','l',0
        EVEN
str_177:
        dc.b    'K','r',$E4,'v','a',' ','a','t','t',' ','a','i','d','s','f','o'
        dc.b    'r','s','k','n','i','n','g','e','n',' ','u','p','p','h',$F6,'r'
        dc.b    ' ','o','c','h',' ','i','s','t',$E4,'l','l','e','t',' ','s','a'
        dc.b    't','s','a',' ','p',$E5,' ','s','p','r','i','d','n','i','n','g'
        dc.b    ' ','a','v',' ','a','i','d','s',0
        EVEN
str_178:
        dc.b    'L','e','k','a',' ','e','n','m','a','n','s',' ','k','u','r','r'
        dc.b    'a','g',$F6,'m','m','a',0
        EVEN
str_179:
        dc.b    'A','n','o','r','d','n','a',' ','V','M',' ','i',' ','A','i','d'
        dc.b    's',0
        EVEN
str_180:
        dc.b    'B','r','e','v','v',$E4,'x','l','a',' ','m','e','d',' ','s','i'
        dc.b    'g',' ','s','j',$E4,'l','v',0
        EVEN
str_181:
        dc.b    'T','r','o',' ','a','t','t',' ','m','a','n',' ','f',$E5,'r',' '
        dc.b    'n','o','b','e','l','p','r','i','s','e','t',' ','i',' ','l','i'
        dc.b    't','t','e','r','a','t','u','r',' ','o','m',' ','m','a','n',' '
        dc.b    's','k','r','i','v','e','r',' ','e','n',' ','b','o','k',' ','o'
        dc.b    'm',' ','d','e','n',' ','u','t','v','e','c','k','l','i','n','g'
        dc.b    's','s','t',$F6,'r','d','a',' ','i','g','e','l','k','o','t','t'
        dc.b    'e','n',' ','S','a','m','u','e','l',' ','s','o','m',' ','i','n'
        dc.b    't','e',' ','h','a','r',' ','b','e','t','a','l','a','t',' ','T'
        dc.b    'V','-','l','i','c','e','n','s','e','n',0
        EVEN
str_182:
        dc.b    'H','u','n','g','e','r','s','t','r','e','j','k','a',' ','f',$F6
        dc.b    'r',' ','a','t','t',' ','d','e','t',' ','i','n','t','e',' ',$E4
        dc.b    'r',' ','n',$E5,'g','o','t',' ','b','r','a',' ','p',$E5,' ','T'
        dc.b    'V',0
        EVEN
str_183:
        dc.b    'S','o','v','a',' ','s','i','g',' ','i','g','e','n','o','m',' '
        dc.b    'e','n',' ','f','i','l','m',' ','p',$E5,' ','b','i','o',' ','s'
        dc.b    $E5,' ','a','t','t',' ','m','a','n',' ','k','a','n',' ',$E4,'t'
        dc.b    'a',' ','u','p','p',' ','a','l','l','t',' ','p','o','p','c','o'
        dc.b    'r','n',' ','s','o','m',' ','l','i','g','g','e','r',' ','p',$E5
        dc.b    ' ','g','o','l','v','e','t',' ','n',$E4,'r',' ','a','l','l','a'
        dc.b    ' ','h','a','r',' ','g',$E5,'t','t',0
        EVEN
str_184:
        dc.b    'S','k','a','f','f','a',' ','s','i','g',' ','A','i','d','s',' '
        dc.b    'm','e','d',' ','v','i','l','j','e',0
        EVEN
str_185:
        dc.b    'S','k','r','i','v','a',' ','e','n',' ','s',$E5,'n',' ','h',$E4
        dc.b    'r',' ','C','P','-','l','i','s','t','a',0
        EVEN
str_186:
        dc.b    'S','k','o','l','k','a',' ','p',$E5,' ','h',$E5,'l','t','i','m'
        dc.b    'm','a','r',0
        EVEN
str_187:
        dc.b    'S','n','i','f','f','a',' ','s','n','u','s',0
        EVEN
str_188:
        dc.b    'S','t','a','g','e','d','i','v','a',' ','i','n','n','e',' ','i'
        dc.b    ' ','e','n',' ','s','k','i','v','a','f','f',$E4,'r',0
        EVEN
str_189:
        dc.b    'K','l','i','p','p','a',' ','h',$E5,'l',' ','i',' ','s','i','n'
        dc.b    ' ','t','r',$F6,'j','a',' ','n',$E4,'r',' ','d','e','t',' ',$E4
        dc.b    'r',' ','f',$F6,'r',' ','v','a','r','m','t',0
        EVEN
str_190:
        dc.b    'S','k','i','c','k','a',' ','b','r','e','v','b','o','m','b','e'
        dc.b    'r',' ','t','i','l','l',' ','s','i','g',' ','s','j',$E4,'l','v'
        dc.b    ',',' ','f',$F6,'r',' ','a','t','t',' ','k','o','l','l','a',' '
        dc.b    'v','e','m',' ','s','o','m',' ','f',$E5,'r',' ','b','r','e','v'
        dc.b    'e','t',0
        EVEN
str_191:
        dc.b    'B','y','g','g','a',' ','e','n',' ','h','e','m','b','r',$E4,'n'
        dc.b    'n','i','n','g','s','a','p','p','a','r','a','t',' ','a','v',' '
        dc.b    'l','e','g','o',0
        EVEN
str_192:
        dc.b    'S','t','a','r','t','a',' ','e','n',' ','e','g','e','n',' ','T'
        dc.b    'V','-','k','a','n','a','l',' ','s','o','m',' ','s',$E4,'n','d'
        dc.b    'e','r',' ','r','u','l','l','s','t','o','l','s','r','e','k','l'
        dc.b    'a','m',' ','d','y','g','n','e','t',' ','r','u','n','t',0
        EVEN
str_193:
        dc.b    'A','n','v',$E4,'n','d','a',' ','e','n',' ','m','i','k','r','o'
        dc.b    'v',$E5,'g','s','u','g','n',' ','s','o','m',' ',$E4,'g','g','k'
        dc.b    'l',$E4,'c','k','n','i','n','g','s','m','a','s','k','i','n',0
        EVEN
str_194:
        dc.b    'S','t','a','r','t','a',' ','e','n',' ','a','f','f',$E4,'r','s'
        dc.b    'k','e','d','j','a',' ','s','o','m',' ','s',$E4,'l','j','e','r'
        dc.b    ' ','k','r','o','p','p','s','d','e','l','a','r',',',' ','d','e'
        dc.b    'n',' ','s','k','a',' ','h','e','t','a',' ',$22,'B','o','d','y'
        dc.b    ' ','S','h','o','p',$22,0
        EVEN
str_195:
        dc.b    'F','r','e','e','b','a','s','a',' ','j','o','r','d','n',$F6,'t'
        dc.b    's','s','m',$F6,'r',0
        EVEN
str_196:
        dc.b    'F',$F6,'r','s',$F6,'k','a',' ','s','t','j',$E4,'l','a',' ','R'
        dc.b    'a','i','n','b','o','w',' ','p',$E5,' ','L','i','s','e','b','e'
        dc.b    'r','g',0
        EVEN
str_197:
        dc.b    'B','y','g','g','a',' ','e','n',' ','T','V','-','s',$E4,'n','d'
        dc.b    'a','r','e',' ','o','c','h',' ','s',$E4,'n','d','a',' ','m','y'
        dc.b    'r','o','r','n','a','s',' ','k','r','i','g',0
        EVEN
str_198:
        dc.b    'S','k','r','i','v','a',' ','u','p','p',' ','s','i','n',' ','b'
        dc.b    'a','n','k','o','m','a','t','k','o','d',' ','p',$E5,' ','s','i'
        dc.b    't','t',' ','b','a','n','k','o','m','a','t','k','o','r','t',0
        EVEN
str_199:
        dc.b    'S','k','j','u','t','a',' ','l',$E5,'t','s','a','s',$E4,'l','g'
        dc.b    'a','r','n','a',' ','p',$E5,' ','h','a','l','k','k',$F6,'r','n'
        dc.b    'i','n','g','e','n',0
        EVEN
str_200:
        dc.b    'G',$F6,'r','a',' ','l',$E4,'x','o','r','n','a',' ','i',' ','d'
        dc.b    'u','s','c','h','e','n',0
        EVEN
str_201:
        dc.b    'S','p','e','l','a',' ','i','n',' ','C','D','-','s','k','i','v'
        dc.b    'o','r',' ','p',$E5,' ','v','i','d','e','o','b','a','n','d',0
        EVEN
str_202:
        dc.b    'P','r','a','t','a',' ','m','e','d',' ','s','i','n','a',' ','d'
        dc.b    $F6,'d','a',' ','b','l','o','m','m','o','r',0
        EVEN
str_203:
        dc.b    'A','n','v',$E4,'n','d','a',' ','s','i','n',' ','f','r','i','t'
        dc.b    'i','d',' ','t','i','l','l',' ','a','t','t',' ','f','o','r','s'
        dc.b    'k','a',' ','o','m',' ','f','r','a','g','g','e','l','-','A','i'
        dc.b    'd','s',0
        EVEN
str_204:
        dc.b    'L','i','m','m','a',' ','f','a','s','t',' ','f','r','i','m',$E4
        dc.b    'r','k','e','n','a',' ','b','a','k',' ','o','c','h',' ','f','r'
        dc.b    'a','m',' ','p',$E5,' ','s','i','n','a',' ','b','r','e','v',0
        EVEN
str_205:
        dc.b    'A','n','v',$E4,'n','d','a',' ','e','n',' ','v','i','d','e','o'
        dc.b    ' ','s','o','m',' ','b','r',$F6,'d','r','o','s','t',0
        EVEN
str_206:
        dc.b    'G',$F6,'r','a',' ','C','D','-','s','k','i','v','o','r',' ','f'
        dc.b    $F6,'r',' ','d',$F6,'v','a',0
        EVEN
str_207:
        dc.b    'G',$E5,' ','p',$E5,' ','r',$F6,'t','t',' ','i',' ','t','u','l'
        dc.b    'l','e','n',' ','f',$F6,'r',' ','a','t','t',' ','d','e','t',' '
        dc.b    $E4,'r',' ','m','i','n','d','r','e',' ','k',$F6,' ','d',$E4,'r'
        dc.b    0
        EVEN
str_208:
        dc.b    'G',$F6,'m','m','a',' ','s','i','g',' ','f',$F6,'r',' ','m','o'
        dc.b    'p','e','d','e','r',0
        EVEN
str_209:
        dc.b    'K','l','i','p','p','a',' ','g','r',$E4,'s','m','a','t','t','a'
        dc.b    'n',' ','m','e','d',' ','e','n',' ','r','u','b','a','n','k',0
        EVEN
str_210:
        dc.b    'T','a',' ','m','e','d',' ','s','i','g',' ','s',$F6,'m','n','t'
        dc.b    'a','b','l','e','t','t','e','r',' ','t','i','l','l',' ','e','t'
        dc.b    't',' ','r','a','v','e','p','a','r','t','y',0
        EVEN
str_211:
        dc.b    'A','n','v',$E4,'n','d','a',' ','s','n',$F6,'s','l','u','n','g'
        dc.b    'a',' ','n',$E4,'r',' ','m','a','n',' ','g',$F6,'r',' ','p','o'
        dc.b    't','a','t','i','s','m','o','s',0
        EVEN
str_212:
        dc.b    'S','a','m','l','a',' ','p',$E5,' ','g','a','m','l','a',' ','C'
        dc.b    'P','-','l','i','s','t','o','r',0
        EVEN
str_213:
        dc.b    'A','n','v',$E4,'n','d','a',' ','k','a','r','d','b','o','r','r'
        dc.b    'e','b','a','n','d',' ','t','i','l','l',' ','s','i','n','a',' '
        dc.b    'f','r','i','m',$E4,'r','k','e','n',0
        EVEN
str_214:
        dc.b    'S','p','e','l','a',' ','d','e','t',' ','v','a','n','l','i','g'
        dc.b    'a',' ','s','p','e','l','e','t',' ',$22,'I','n','s','e','r','t'
        dc.b    ' ','C','o','i','n',$22,' ','p',$E5,' ','a','r','k','a','d',0
        EVEN
str_215:
        dc.b    'F','u','s','k','a',' ','p',$E5,' ','h','a','l','k','k',$F6,'r'
        dc.b    'n','i','n','g','e','n',0
        EVEN
str_216:
        dc.b    'K','l',$E4,' ','u','t',' ','s','i','g',' ','t','i','l','l',' '
        dc.b    'D','a','r','k','w','i','n','g',' ','D','u','c','k',' ','p',$E5
        dc.b    ' ','e','t','t',' ','m',$F6,'t','e',' ','m','e','d',' ','H','e'
        dc.b    'm',' ','o','c','h',' ','S','k','o','l','a',0
        EVEN
str_217:
        dc.b    'V','i','d','a','r','e','k','o','p','p','l','a',' ','s','i','n'
        dc.b    ' ','t','e','l','e','f','o','n',' ','t','i','l','l',' ','B','R'
        dc.b    'I','S',0
        EVEN
str_218:
        dc.b    'G','e',' ','H','a','n','s',' ','S','h','e','i','k','e',' ','d'
        dc.b    'a','g','e','n','s',' ','r','i','s',' ','i',' ','D','a','g','e'
        dc.b    'n','s',' ','N','y','h','e','t','e','r',0
        EVEN
str_219:
        dc.b    'F','r',$E5,'g','a',' ','f','o','l','k',' ','v','a','r','f',$F6
        dc.b    'r',' ','d','o','m',' ','i','n','t','e',' ','v','i','l','l',' '
        dc.b    $E4,'t','a',' ','s','t','o','l','a','r',0
        EVEN
str_220:
        dc.b    'A','n','v',$E4,'n','d','a',' ','f','l','u','g','p','a','p','p'
        dc.b    'e','r',' ','s','o','m',' ','m','u','s','m','a','t','t','a',0
        EVEN
str_221:
        dc.b    'G',$F6,'r','a',' ','i','n','b','r','o','t','t',' ','p',$E5,' '
        dc.b    'e','n',' ','b','a','n','k',' ','o','c','h',' ','s','t','j',$E4
        dc.b    'l','a',' ','b','a','n','k','v','a','l','v','e','t',' ','m','e'
        dc.b    'n',' ','i','n','t','e',' ','p','e','n','g','a','r','n','a',0
        EVEN
str_222:
        dc.b    'S',$E4,'l','j','a',' ','s','i','t','t',' ','h','u','s',' ','o'
        dc.b    'c','h',' ','k',$F6,'p','a',' ','E','s','t','l','i','n','e','-'
        dc.b    'A','k','t','i','e','r',' ','f',$F6,'r',' ','p','e','n','g','a'
        dc.b    'r','n','a',0
        EVEN
str_223:
        dc.b    'H','u','g','g','a',' ','n','e','r',' ','e','t','t',' ','t','r'
        dc.b    $E4,'d',' ','f',$F6,'r',' ','a','t','t',' ','k','u','n','n','a'
        dc.b    ' ','d','r','a',' ','i',' ','r',$F6,'t','t','e','r','n','a',0
        EVEN
str_224:
        dc.b    'S',$E4,'l','j','a',' ','s','i','n',' ','f','r','u',' ','o','c'
        dc.b    'h',' ','f','l','y','t','t','a',' ','t','i','l','l',' ','V','e'
        dc.b    'n','e','d','i','g',' ','o','c','h',' ','b','l','i',' ','j','o'
        dc.b    'r','d','b','r','u','k','a','r','e',0
        EVEN
str_225:
        dc.b    'S',$E4,'t','t','a',' ','u','p','p',' ','s','i','n','a',' ','t'
        dc.b    'a','p','e','t','e','r',' ','m','e','d',' ','k','a','r','d','b'
        dc.b    'o','r','r','e','b','a','n','d',0
        EVEN
str_226:
        dc.b    'V','i','d','a','r','e','k','o','p','p','l','a',' ','s','i','n'
        dc.b    ' ','t','e','l','e','f','o','n',' ','t','i','l','l',' ','s','i'
        dc.b    'g',' ','s','j',$E4,'l','v',0
        EVEN
str_227:
        dc.b    'S',$E4,'l','j','a',' ','s','i','n','a',' ','s','y','s','k','o'
        dc.b    'n',' ','t','i','l','l',' ','e','n',' ','b','a','g','a','r','e'
        dc.b    ' ','o','c','h',' ','e','m','i','g','r','e','r','a',' ','t','i'
        dc.b    'l','l',' ',$D6,'r','e','b','r','o',0
        EVEN
str_228:
        dc.b    'S','w','a','p','p','a',' ','h','u','s','d','j','u','r',0
        EVEN
str_229:
        dc.b    'S','a','m','l','a',' ','p',$E5,' ','b','o','m','u','l','l',','
        dc.b    ' ','d','e','t',' ',$E4,'r',' ','b','r','a',' ','f',$F6,'r',' '
        dc.b    'h','j',$E4,'r','n','a','n',0
        EVEN
str_230:
        dc.b    'T','a','p','e','t','s','e','r','a',' ','m','e','d',' ','C','P'
        dc.b    '-','l','i','s','t','o','r',0
        EVEN
str_231:
        dc.b    'F','i','r','a',' ','A','i','d','s','d','a','g','e','n',' ','v'
        dc.b    'a','r','j','e',' ',$E5,'r',0
        EVEN
str_232:
        dc.b    'L',$E5,'n','a',' ','b',$F6,'c','k','e','r',' ','p',$E5,' ','b'
        dc.b    'i','b','l','i','o','t','e','k','e','t',' ','o','c','h',' ','s'
        dc.b    'e','d','a','n',' ','l',$E4,'m','n','a',' ','i','n',' ','d','o'
        dc.b    'm',' ','p',$E5,' ','b','o','k','h','a','n','d','e','l','n',0
        EVEN
str_233:
        dc.b    'K',$F6,'p','a',' ','s','k','i','v','o','r',' ','p',$E5,' ',$C5
        dc.b    'h','l',$E9,'n','s',0
        EVEN
str_234:
        dc.b    'S','a','m','p','l','a',' ','m','o','d','u','l','e','r',0
        EVEN
str_235:
        dc.b    'S','o','v','a',' ','p',$E5,' ',$F6,'v','e','r','g',$E5,'n','g'
        dc.b    's','s','t',$E4,'l','l','e','n',0
        EVEN
str_236:
        dc.b    'F',$F6,'r','s',$F6,'k','a',' ','v',$E4,'l','t','a',' ','E','i'
        dc.b    'f','f','e','l','t','o','r','n','e','t',0
        EVEN
str_237:
        dc.b    'S','p','e','l','a',' ','r','u','g','b','y',' ','m','e','d',' '
        dc.b    'l','a','n','d','m','i','n','o','r',0
        EVEN
str_238:
        dc.b    'R',$F6,'s','t','a',' ','p',$E5,' ','f','o','l','k','p','a','r'
        dc.b    't','i','e','t',' ','i',' ','S','i','k','t','a',' ','M','o','t'
        dc.b    ' ','S','t','j',$E4,'r','n','o','r','n','a',0
        EVEN
str_239:
        dc.b    'S','t','o','p','p','a',' ','i','n',' ','C','D','-','s','k','i'
        dc.b    'v','o','r',' ','m','e','d',' ','t','e','x','t','e','n',' ','u'
        dc.b    'p','p',$E5,'t',',',' ','d',$E5,' ','k','a','n',' ','m','a','n'
        dc.b    ' ','h',$F6,'r','a',' ','m','u','s','i','k',0
        EVEN
str_240:
        dc.b    'T','i','l','t','a',' ','a','r','k','a','d','s','p','e','l',0
        EVEN
str_241:
        dc.b    'F','y','l','l','a',' ','s','i','n',' ','f','r','y','s',' ','m'
        dc.b    'e','d',' ','h','o','c','k','e','y','b','i','l','d','e','r',0
        EVEN
str_242:
        dc.b    'F','e','j','k','a',' ','k','l','i','s','t','e','r','m',$E4,'r'
        dc.b    'k','e','n',0
        EVEN
str_243:
        dc.b    'P','l','u','g','g','a',' ','p',$E5,' ','f','e','l',' ','p','r'
        dc.b    'o','v',0
        EVEN
str_244:
        dc.b    $C4,'t','a',' ','s',$E5,' ','l',$E5,'n','g','s','a','m','t',' '
        dc.b    's',$E5,' ','a','t','t',' ','m','a','n',' ','a','l','d','r','i'
        dc.b    'g',' ','h','i','n','n','e','r',' ','b','l','i',' ','m',$E4,'t'
        dc.b    't',0
        EVEN
str_245:
        dc.b    'B','r','y','t','a',' ','s','i','g',' ','i','n',' ','h','o','s'
        dc.b    ' ','n',$E5,'g','o','n',' ','b','a','r','a',' ','f',$F6,'r',' '
        dc.b    'a','t','t',' ','f',$E5,' ','s','v','a','r','a',' ','i',' ','d'
        dc.b    'e','r','a','s',' ','t','e','l','e','f','o','n',0
        EVEN
str_246:
        dc.b    'G',$F6,'r','a',' ','g','r','a','f','f','i','t','i','m',$E5,'l'
        dc.b    'n','i','n','g','a','r',' ','m','e','d',' ','p','a','i','n','t'
        dc.b    'b','a','l','l','p','i','s','t','o','l',0
        EVEN
str_247:
        dc.b    'H','a',' ','f','l','e','r',' ','h','o','r','m','o','n','e','r'
        dc.b    ' ',$E4,'n',' ','I','Q',0
        EVEN
str_248:
        dc.b    $C4,'t','a',' ','u','p','p',' ','n','o','b','e','l','p','r','i'
        dc.b    's','e','t',0
        EVEN
str_249:
        dc.b    'R','i','n','g','a',' ','o','c','h',' ','p','r','a','t','a',' '
        dc.b    'm','e','d',' ','f','a','x','a','r',0
        EVEN
str_250:
        dc.b    'V','i','s','a',' ','u','p','p',' ','d','e','n',' ','h',$E4,'r'
        dc.b    ' ','C','P','-','l','i','s','t','a','n',' ','f',$F6,'r',' ','p'
        dc.b    's','y','k','o','l','o','g','e','n',' ','p',$E5,' ','m',$F6,'n'
        dc.b    's','t','r','i','n','g','e','n',0
        EVEN
str_251:
        dc.b    'T','a',' ','u','t',' ','s','i','n',' ','l',$F6,'n',' ','i',' '
        dc.b    'p','r','e','s','e','n','t','k','o','r','t',' ','p',$E5,' ','r'
        dc.b    'e','s','o','r',' ','m','e','d',' ','r','e','d','e','r','i','e'
        dc.b    't',' ','E','s','t','l','i','n','e',0
        EVEN
str_252:
        dc.b    'S','t','r',$F6,' ','s','a','f','f','r','a','n',' ','p',$E5,' '
        dc.b    'v',$E4,'g','a','r',' ','n',$E4,'r',' ','d','e','t',' ',$E4,'r'
        dc.b    ' ','h','a','l','t',0
        EVEN
str_253:
        dc.b    'K',$F6,'r','a',' ','i',' ','v','a','t','t','e','n','f','a','l'
        dc.b    'l',' ','m','e','d',' ','m','o','p','e','d','e','r',0
        EVEN
str_254:
        dc.b    $C4,'t','a',' ','u','p','p',' ','s','i','n','a',' ','m','a','t'
        dc.b    't','e','p','r','o','v',0
        EVEN
str_255:
        dc.b    'P','u','t','s','a',' ','s','i','n','a',' ','g','l','a','s',$F6
        dc.b    'g','o','n',' ','m','e','d',' ','l','i','m',0
        EVEN
str_256:
        dc.b    $C4,'t','a',' ','m','a','n','e','t','e','r',0
        EVEN
str_257:
        dc.b    'V','a','r','a',' ','r',$E4,'d','d',' ','f',$F6,'r',' ','k','u'
        dc.b    'n','d','v','a','g','n','a','r',0
        EVEN
str_258:
        dc.b    'S','p','r',$E4,'n','g','a',' ','h',$E4,'l','s','o','k','o','s'
        dc.b    't','b','u','t','i','k','e','r',' ','i',' ','p','r','o','t','e'
        dc.b    's','t',' ','m','o','t',' ','S','v','e','r','i','g','e','s',' '
        dc.b    'i','n','t','r',$E4,'d','e',' ','i',' ','E','U',0
        EVEN
str_259:
        dc.b    $C5,'k','a',' ','v','a','t','t','e','n','s','k','i','d','o','r'
        dc.b    ' ','i',' ','s','k','o','g','e','n',0
        EVEN
str_260:
        dc.b    'S','a','t','s','a',' ','a','l','l','t',' ','m','a','n',' ',$E4
        dc.b    'g','e','r',' ','p',$E5,' ','e','n',' ','f','a','b','r','i','k'
        dc.b    ' ','s','o','m',' ','t','i','l','l','v','e','r','k','a','r',' '
        dc.b    'a','l','k','o','h','o','l','f','r','i',' ','m','j',$F6,'l','k'
        dc.b    0
        EVEN
str_261:
        dc.b    'M','e','t','a',' ','r',$E4,'k','o','r',0
        EVEN
str_262:
        dc.b    'K','a','m','m','a',' ','s','i','g',' ','m','e','d',' ','e','n'
        dc.b    ' ','o','s','t','h','y','v','e','l',0
        EVEN
str_263:
        dc.b    'F','r',$E5,'g','a',' ','n',$E4,'r',' ','m','a','n',' ','f',$E5
        dc.b    'r',' ','b',$F6,'r','j','a',' ','a','n','v',$E4,'n','d','a',' '
        dc.b    'l','a','s','e','r','s','v',$E4,'r','d',' ','i',' ','l','u','m'
        dc.b    'p','e','n',0
        EVEN
str_264:
        dc.b    $D6,'n','s','k','a',' ','a','t','t',' ','m','a','n',' ','v','o'
        dc.b    'r','e',' ','e','n',' ','d','v',$E4,'r','g',' ','s',$E5,' ','m'
        dc.b    'a','n',' ','k','a','n',' ','b','a','d','a',' ','i',' ','b','e'
        dc.b    'n','s','i','n','t','a','n','k','e','n',' ','p',$E5,' ','s','i'
        dc.b    'n',' ','b','i','l',0
        EVEN
str_265:
        dc.b    'S','p','e','l','a',' ','p','i','a','n','o',' ','p',$E5,' ',$F6
        dc.b    'v','e','r','g',$E5,'n','g','s','s','t',$E4,'l','l','e','n',0
        EVEN
str_266:
        dc.b    'T','r',$E4,'n','g','a',' ','i','n',' ','s','i','n',' ','b','i'
        dc.b    'l',' ','i',' ','t','v',$E4,'t','t','m','a','s','k','i','n','e'
        dc.b    'n',0
        EVEN
str_267:
        dc.b    'K','e','d','j','a',' ','f','a','s','t',' ','s','i','n',' ','f'
        dc.b    'r','u',' ','v','i','d',' ','s','p','i','s','e','n',0
        EVEN
str_268:
        dc.b    'S','t','o','p','p','a',' ','i','n',' ','e','n',' ','T','h','u'
        dc.b    'n','d','e','r','k','i','n','g',' ','i',' ','s','i','n',' ','C'
        dc.b    'D','-','s','p','e','l','a','r','e',0
        EVEN
str_269:
        dc.b    'L',$E5,'s','a',' ','i','n',' ','b','a','r','n',' ','i',' ','f'
        dc.b    $F6,'r','v','a','r','i','n','g','s','s','k',$E5,'p','e','n',' '
        dc.b    'p',$E5,' ',$C5,'h','l','e','n','s',' ','n',$E4,'r',' ','m','a'
        dc.b    'n',' ',$E4,'r',' ','b','a','r','n','v','a','k','t',0
        EVEN
str_270:
        dc.b    $C4,'t','a',' ','e','n',' ','s','p','a','r','g','r','i','s',' '
        dc.b    'p',$E5,' ','j','u','l','a','f','t','o','n',0
        EVEN
str_271:
        dc.b    'H','o','p','p','a',' ','p',$E5,' ','s','e','m','l','o','r',0
        EVEN
str_272:
        dc.b    'T','i','l','l','v','e','r','k','a',' ','a','l','k','o','h','o'
        dc.b    'l','f','r','i','t','t',' ','h','e','m','b','r',$E4,'n','t',0
        EVEN
str_273:
        dc.b    'B',$E4,'d','d','a',' ','s','i','n',' ','s',$E4,'n','g',' ','m'
        dc.b    'e','d',' ',$F6,'r','o','n','e','n',0
        EVEN
str_274:
        dc.b    'H',$E5,'n','g','l','a',' ','m','e','d',' ','s','i','g',' ','s'
        dc.b    'j',$E4,'l','v',0
        EVEN
str_275:
        dc.b    'B',$E4,'r','a',' ','r','e','f','l','e','x',' ','i','n','o','m'
        dc.b    'h','u','s',0
        EVEN
str_276:
        dc.b    'T','r','o',' ','p',$E5,' ','T','u','r','t','l','e','s',0
        EVEN
str_277:
        dc.b    'S',$E4,'t','t','a',' ','s','e','g','e','l',' ','p',$E5,' ','r'
        dc.b    'u','l','l','s','t','o','l',0
        EVEN
str_278:
        dc.b    'G',$E5,' ','m','e','d',' ','i',' ','N','i','n','t','e','n','d'
        dc.b    'o','k','l','u','b','b','e','n',' ','m','e','d',' ','f','l','i'
        dc.b    't',0
        EVEN
str_279:
        dc.b    'S','p','e','l','a',' ','i','n',' ','b','o','o','t','l','e','g'
        dc.b    's',' ','m','e','d',' ','S','y','s','k','o','n','r','i','n','g'
        dc.b    'e','n',0
        EVEN
str_280:
        dc.b    'K',$F6,'r','a',' ','r','u','l','l','s','t','o','l',' ','i',' '
        dc.b    'e','n',' ','p','u','c','k','e','l','p','i','s','t',0
        EVEN
str_281:
        dc.b    'T','y','c','k','a',' ','a','t','t',' ','G','a','m','e',' ','&'
        dc.b    ' ','W','a','t','c','h',' ',$E4,'r',' ','C','y','b','e','r','!'
        dc.b    0
        EVEN
str_282:
        dc.b    'S',$E4,'g','a',' ','u','p','p',' ','s','i','g',' ','f','r',$E5
        dc.b    'n',' ','j','o','b','b','e','t',' ','f',$F6,'r',' ','a','t','t'
        dc.b    ' ','k','o','l','l','a',' ','p',$E5,' ','s','e','r','i','e','r'
        dc.b    'n','a',' ','p',$E5,' ','T','V','4',0
        EVEN
str_283:
        dc.b    'A','n','v',$E4,'n','d','a',' ','N','i','n','t','e','n','d','o'
        dc.b    'k','o','r','t','e','t',' ','s','o','m',' ','l','e','g','i','t'
        dc.b    'i','m','a','t','i','o','n',0
        EVEN
str_284:
        dc.b    'B','a','c','k','a',' ','m','e','d',' ','e','n',' ','b','i','l'
        dc.b    ' ','j','o','r','d','e','n',' ','r','u','n','t',0
        EVEN
str_285:
        dc.b    'T','r',$E4,'n','a',' ','p',$E5,' ','a','t','t',' ','b','l','i'
        dc.b    ' ','h','o','m','o','s','e','x','u','e','l','l',0
        EVEN
str_286:
        dc.b    'G',$E5,' ','o','m',' ','e','n',' ',$E5,'r','s','k','u','r','s'
        dc.b    ' ','p',$E5,' ','s','k','o','j',0
        EVEN
str_287:
        dc.b    'A','n','v',$E4,'n','d','a',' ','C','P','-','l','i','s','t','a'
        dc.b    'n',' ','s','o','m',' ','h',$E5,'r','d','v','a','l','u','t','a'
        dc.b    0
        EVEN
str_288:
        dc.b    'B','e','g',$E5,' ','s','j',$E4,'l','v','m','o','r','d',' ','p'
        dc.b    $E5,' ','s','k','o','j',0
        EVEN
str_289:
        dc.b    'L','e','k','a',' ','m','a','m','m','a','-','p','a','p','p','a'
        dc.b    '-','b','a','r','n',' ','m','e','d',' ','s','i','n','a',' ','f'
        dc.b    $F6,'r',$E4,'l','d','r','a','r',0
        EVEN
str_290:
        dc.b    'F',$F6,'r','b','j','u','d','a',' ','b','r','o','t','t','n','i'
        dc.b    'n','g',' ','i',' ','T','V',0
        EVEN
str_291:
        dc.b    'L','i','t','a',' ','p',$E5,' ',$22,'E','n',' ','D','i','n','g'
        dc.b    ' ','D','i','n','g',' ','V',$E4,'r','l','d',$22,0
        EVEN
str_292:
        dc.b    'G','r',$E4,'v','a',' ','n','e','d',' ','C','D','-','s','k','i'
        dc.b    'v','o','r',' ','i','f','a','l','l',' ','d','e','t',' ','b','l'
        dc.b    'i','r',' ','k','r','i','g',0
        EVEN
str_293:
        dc.b    'P','r','a','k','t','i','s','e','r','a',' ','s','o','m',' ','p'
        dc.b    'e','n','s','i','o','n',$E4,'r',0
        EVEN
str_294:
        dc.b    'L','e','k','a',' ','l',$F6,'k',0
        EVEN
str_295:
        dc.b    'T','r','o',' ','a','t','t',' ','m','a','n',' ','b','l','i','r'
        dc.b    ' ','f','u','l','l',' ','i',' ','f','y','l','l','e','c','e','l'
        dc.b    'l','e','n',0
        EVEN
str_296:
        dc.b    'S','a','m','p','l','a',' ','r',$F6,'k',0
        EVEN
str_297:
        dc.b    'T','j','u','v','k','o','p','p','l','a',' ','r','u','l','l','s'
        dc.b    't','o','l','a','r',0
        EVEN
str_298:
        dc.b    'R','a','g','g','a',' ','p',$E5,' ','k','y','r','k','a','n','s'
        dc.b    ' ','b','a','r','n','t','i','m','m','a','r',0
        EVEN
str_299:
        dc.b    'A','n','o','r','d','n','a',' ','n','a','t','t','o','r','i','e'
        dc.b    'n','t','e','r','i','n','g',' ','f',$F6,'r',' ','m',$F6,'r','k'
        dc.b    'r',$E4,'d','d','a',' ','m','o','n','g','o','s',0
        EVEN
str_300:
        dc.b    'R','a','k','a',' ','i','g','e','l','k','o','t','t','a','r',0
        EVEN
str_301:
        dc.b    'T','r','o',' ','a','t','t',' ','S',$E4,'p','o',' ',$E4,'r',' '
        dc.b    'e','t','t',' ','f','i','n','s','k','t',' ','C','P',0
        EVEN
str_302:
        dc.b    'S','m','u','t','s','a',' ','n','e','r',' ',$22,'t','v',$E4,'t'
        dc.b    't','a','d','e',$22,' ','p','e','n','g','a','r',0
        EVEN
str_303:
        dc.b    'S','p','i','n','n','a',' ','m','e','d',' ','r','u','l','l','s'
        dc.b    't','o','l',0
        EVEN
str_304:
        dc.b    'S',$F6,'k','a',' ','u','p','p',' ','o','c','h',' ','m',$F6,'r'
        dc.b    'd','a',' ','f','o','l','k',' ','s','o','m',' ','r','i','n','g'
        dc.b    'e','r',' ','f','e','l',0
        EVEN
str_305:
        dc.b    'F','y','l','l','a',' ','s','i','n',' ','s','o','v','s',$E4,'c'
        dc.b    'k',' ','m','e','d',' ','s','k','o','t','t','a','r',0
        EVEN
str_306:
        dc.b    'A','n','o','r','d','n','a',' ','s','t',$F6,'l','d','g','o','d'
        dc.b    's','m',$E4,'s','s','a',0
        EVEN
str_307:
        dc.b    'U','t','r','u','s','t','a',' ','s','i','n',' ','r','u','l','l'
        dc.b    's','t','o','l',' ','m','e','d',' ','k','a','t','a','p','u','l'
        dc.b    't','f','u','n','k','t','i','o','n',0
        EVEN
str_308:
        dc.b    'D','r','a',' ','t',$E4,'l','t',' ','e','f','t','e','r',' ','b'
        dc.b    'i','l','e','n',0
        EVEN
str_309:
        dc.b    'T','r','o',' ','a','t','t',' ','G','h','a','n','d','i',' ','g'
        dc.b    'j','o','r','d','e',' ','a','f','f',$E4,'r','e','r',' ','m','e'
        dc.b    'd',' ','B','o','f','o','r','s',0
        EVEN
str_310:
        dc.b    'R','i','n','g','a',' ','0','2','0','-','n','u','m','m','e','r'
        dc.b    ' ','m','e','d',' ','C','C',0
        EVEN
str_311:
        dc.b    'H','a',' ','s','u','r','f','i','n','g','b','r',$E4,'d','a','n'
        dc.b    ' ','i',' ','b','e','r','e','d','s','k','a','p',' ','n',$E4,'r'
        dc.b    ' ','m','a','n',' ','r','i','n','g','e','r',' ','I','n','t','e'
        dc.b    'r','n','e','t',0
        EVEN
str_312:
        dc.b    'T','j',$E4,'n','a',' ','s','t','o','r','k','o','v','a','n',' '
        dc.b    'p',$E5,' ','f','a','l','s','k','a',' ','C','P','-','l','i','s'
        dc.b    't','o','r',0
        EVEN
str_313:
        dc.b    'H',$E4,'r','m','a',' ','H','a','n','s',' ','S','h','e','i','k'
        dc.b    'e',' ','i',' ','S','i','k','t','a',' ','m','o','t',' ','S','t'
        dc.b    'j',$E4,'r','n','o','r','n','a',0
        EVEN
str_314:
        dc.b    'S','y',' ','t','o','a','l','e','t','t','e','r',' ','i',' ','s'
        dc.b    'y','s','l',$F6,'j','d','e','n',0
        EVEN
str_315:
        dc.b    'I','n','j','i','c','e','r','a',' ','O','b','o','y','!',0
        EVEN
str_316:
        dc.b    'L','e','t','a',' ','e','f','t','e','r',' ','F','a','n','t','a'
        dc.b    '-','s','k','a','t','t','e','n',0
        EVEN
str_317:
        dc.b    'A','n','o','r','d','n','a',' ','V','M',' ','i',' ','s',$E4,'n'
        dc.b    'g','v',$E4,'t','n','i','n','g',0
        EVEN
str_318:
        dc.b    'S','p','o','l','a',' ','t','i','l','l','b','a','k','a',' ','s'
        dc.b    'i','n','a',' ','C','D','-','s','k','i','v','o','r',' ','e','f'
        dc.b    't','e','r',' ','a','v','l','y','s','s','n','i','n','g',0
        EVEN
str_319:
        dc.b    'J','o','b','b','a',' ','s','v','a','r','t',' ','s','o','m',' '
        dc.b    'p','o','l','i','s',0
        EVEN
str_320:
        dc.b    $C4,'r','v','a',' ','k','r','o','p','p','s','d','e','l','a','r'
        dc.b    0
        EVEN
str_321:
        dc.b    'A','n','o','r','d','n','a',' ','V','M',' ','i',' ','d','e','k'
        dc.b    'l','a','r','a','t','i','o','n',0
        EVEN
str_322:
        dc.b    $C4,'t','a',' ','s','i','g',' ','m',$E4,'t','t',' ','p',$E5,' '
        dc.b    'a','l','v','e','d','o','n',0
        EVEN
str_323:
        dc.b    'S',$E4,'g','a',' ','d','e','t',' ','m','a','n',' ','j','u','s'
        dc.b    't',' ','s','a',0
        EVEN
str_324:
        dc.b    'L','e','k','a',' ','s','o','f','f','a',0
        EVEN
str_325:
        dc.b    'B',$F6,'r','j','a',' ','s','p','e','l','a',' ','g','o','l','f'
        dc.b    ' ','f',$F6,'r',' ','a','t','t',' ','f',$E5,' ','e','t','t',' '
        dc.b    'h','a','n','d','i','k','a','p','p',0
        EVEN
str_326:
        dc.b    'B','o','s',$E4,'t','t','a',' ','s','i','g',' ','h','o','s',' '
        dc.b    'G','e','r','h','a','r','d',0
        EVEN
str_327:
        dc.b    'P','l','a','c','e','r','a',' ','s','i','n','a',' ','b','a','r'
        dc.b    'n',' ','i',' ','m','i','k','r','o','v',$E5,'g','s','u','g','n'
        dc.b    'e','n',0
        EVEN
str_328:
        dc.b    'F','y','l','l','a',' ','s','i','n',' ','s',$E4,'n','g',' ','m'
        dc.b    'e','d',' ','p','o','p','c','o','r','n',' ','p',$E5,' ','m',$F6
        dc.b    'n','s','t','r','i','n','g','e','n',0
        EVEN
str_329:
        dc.b    'D',$F6,'m','a','s',' ','t','i','l','l',' ','l','i','v','s','t'
        dc.b    'i','d','s',' ','a','v','r',$E4,'t','t','n','i','n','g',' ','f'
        dc.b    $F6,'r',' ','d','i','v','e','r','s','e',' ','p','i','a','n','o'
        dc.b    's','t',$F6,'l','d','e','r',0
        EVEN
str_330:
        dc.b    'B',$E4,'r','a',' ','t','u','r','k','o','s','a',' ','s','n','o'
        dc.b    'w','j','o','g','g','i','n','g','s',' ','p',$E5,' ','b','r',$F6
        dc.b    'l','l','o','p',0
        EVEN
str_331:
        dc.b    'S',$E4,'l','j','a',' ','t','r','i','m','d','e','l','a','r',' '
        dc.b    't','i','l','l',' ','s','n','o','w','-','r','a','c','e','r','s'
        dc.b    0
        EVEN
str_332:
        dc.b    'C','y','k','l','a',' ','u','p','p',' ','f',$F6,'r',' ','H','o'
        dc.b    'l','m','e','n','k','o','l','l','e','n',0
        EVEN
str_333:
        dc.b    'F',$F6,'r','s',$F6,'k','a',' ','m',$F6,'r','d','a',' ','s',$E5
        dc.b    ' ','m',$E5,'n','g','a',' ','s','o','m',' ','m',$F6,'j','l','i'
        dc.b    'g','t',' ','p',$E5,' ','s','i','n',' ','s','t','u','d','e','n'
        dc.b    't',0
        EVEN
str_334:
        dc.b    $C4,'t','a',' ','u','p','p',' ','S','y','s','k','o','n','r','i'
        dc.b    'n','g','e','n',0
        EVEN
str_335:
        dc.b    'A','n','v',$E4,'n','d','a',' ','c','o','r','n','f','l','a','k'
        dc.b    'e','s',' ','s','o','m',' ','f','r','i','m',$E4,'r','k','e','n'
        dc.b    0
        EVEN
str_336:
        dc.b    'F','e','j','k','a',' ','k','u','v','e','r','t',0
        EVEN
str_337:
        dc.b    'B','y','t','a',' ','n','a','m','n',' ','t','i','l','l',' ','G'
        dc.b    'l','e','n','n',0
        EVEN
str_338:
        dc.b    'L','u','r','p','a','s','s','a',' ','p',$E5,' ','o','r','i','e'
        dc.b    'n','t','e','r','a','r','e',0
        EVEN
str_339:
        dc.b    'S','p','r','i','d','a',' ','C','P','-','l','i','s','t','a','n'
        dc.b    0
        EVEN
str_340:
        dc.b    'D','e','k','l','a','r','e','r','a',' ','f',$F6,'r',' ','m','e'
        dc.b    'r',' ',$E4,'n',' ','v','a','d',' ','m','a','n',' ','t','j',$E4
        dc.b    'n','a','r',0
        EVEN
str_341:
        dc.b    'I','n','f',$F6,'r','a',' ','s','v','a','r','t','v','i','t','a'
        dc.b    ' ','r','a','d','i','o','s',$E4,'n','d','n','i','n','g','a','r'
        dc.b    0
        EVEN
str_342:
        dc.b    'M','i','s','s','b','r','u','k','a',' ','r','u','n','s','k','r'
        dc.b    'i','f','t',0
        EVEN
str_343:
        dc.b    '0','1','0','0','0','1','1','1','.','0','1','1','0','1','1','0'
        dc.b    '0','.','0','1','1','0','0','1','0','1','.',' ','0','1','1','0'
        dc.b    '1','1','1','0','.','0','1','1','0','1','1','1','0',0
        EVEN
str_344:
        dc.b    'T','r','o','r',' ','a','t','t',' ','p','i','r','a','t','k','o'
        dc.b    'p','i','e','r','a','r','e',' ',$E4,'r',' ','e','n',$F6,'g','d'
        dc.b    'a',' ','o','c','h',' ','h','a','r',' ','t','r',$E4,'b','e','n'
        dc.b    0
        EVEN
str_345:
        dc.b    'A','r','r','e','s','t','e','r','a',' ','a','l','l','a',' ','s'
        dc.b    'o','m',' ',$E5,'k','e','r',' ','b',$E5,'t',' ','t','i','l','l'
        dc.b    ' ','c','o','p','y','-','p','a','r','t','y','s',0
        EVEN
str_346:
        dc.b    $C4,'t','a',' ','m','e','d',' ','l','a','s','e','r','s','v',$E4
        dc.b    'r','d',0
        EVEN
str_347:
        dc.b    'S',$E4,'t','t','a',' ','i','n',' ','p','e','n','g','a','r',' '
        dc.b    'p',$E5,' ',$22,'M','i','n','u','t','e','n',$22,0
        EVEN
str_348:
        dc.b    'S','k','r','a','t','t','a',' ',$E5,'t',' ','s','k',$E4,'g','g'
        dc.b    'i','g','a',' ','h',$E4,'s','t','a','r',0
        EVEN
str_349:
        dc.b    'V',$E4,'l','t','a',' ','k','o','r',' ','i',' ','I','n','d','i'
        dc.b    'e','n',0
        EVEN
str_350:
        dc.b    'V','i','n','n','a',' ','F','r','e','d','r','i','k',' ','J','o'
        dc.b    'h','a','n','n','e','s','s','e','n','s',' ','F','i','a','t','-'
        dc.b    '7','4',' ','i',' ','B','i','n','g','o','l','o','t','t','o',0
        EVEN
str_351:
        dc.b    'B','e','t','a','l','a',' ','f',$F6,'r',' ','f','r','i',' ','d'
        dc.b    'o','w','n','l','o','a','d',' ','p',$E5,' ','R','o','s','e','n'
        dc.b    'b','a','d','s',' ','B','B','S',0
        EVEN
str_352:
        dc.b    'K',$F6,'p','a',' ','e','n',' ','t','r','u','c','k',' ','s',$E5
        dc.b    ' ','a','t','t',' ','m','a','n',' ','k','a','n',' ','p','l','a'
        dc.b    'c','e','r','a',' ','o','m',' ','b','i','l','a','r',' ','p',$E5
        dc.b    ' ','e','n',' ','p','a','r','k','e','r','i','n','g',0
        EVEN
str_353:
        dc.b    'P','a','l','l','a',' ','r','i','s',' ','i',' ','K','i','n','a'
        dc.b    0
        EVEN
str_354:
        dc.b    'B','y','t','a',' ','s','i','n','a',' ','f',$F6,'r',$E4,'l','d'
        dc.b    'r','a','r',' ','m','o','t',' ','e','n',' ','P',$E4,'r','o','n'
        dc.b    's','p','l','i','t',0
        EVEN
str_355:
        dc.b    'R','y','m','m','a',' ','h','e','m',' ','n',$E4,'r',' ','m','a'
        dc.b    'n',' ',$E4,'r',' ','p',$E5,' ','s','e','m','e','s','t','e','r'
        dc.b    0
        EVEN
str_356:
        dc.b    '3','5','7',',',' ','T','r','o',' ','a','t','t',' ','S','k',$E5
        dc.b    'n','e',' ',$E4,'r',' ','e','t','t',' ','s','t',$E4,'l','l','e'
        dc.b    ' ','d',$E4,'r',' ','a','l','l','a',' ','g',$E5,'r',' ','p',$E5
        dc.b    ' ','h',$E4,'n','d','e','r',0
        EVEN
str_357:
        dc.b    'T','i','l','l','v','e','r','k','a',' ','f','y','r','v','e','r'
        dc.b    'k','e','r','i','e','r',' ','b','a','s','e','r','a','d','e',' '
        dc.b    'p',$E5,' ','g','r','u','n','d',$E4,'m','n','e','t',' ','a','p'
        dc.b    'e','l','s','i','n','m','a','r','m','e','l','a','d',0
        EVEN
str_358:
        dc.b    'T','v','i','v','l','a',' ','p',$E5,' ','a','l','l','t',' ','J'
        dc.b    'o','h','n',' ','P','o','h','l','m','a','n',' ','s',$E4,'g','e'
        dc.b    'r',' ','o','c','h',' ','s','t',$E5,'r',' ','f',$F6,'r',0
        EVEN
str_359:
        dc.b    'A','n','v',$E4,'n','d','a',' ','s',$E4,'k','e','r','h','e','t'
        dc.b    's','b',$E4,'l','t','e',' ','i',' ','b','a','s','t','u',0
        EVEN
str_360:
        dc.b    'L','u','k','t','a',' ','p',$E5,' ','l','a','m','p','s','k',$E4
        dc.b    'r','m','a','r',0
        EVEN
str_361:
        dc.b    'L',$E4,'m','n','a',' ','i','n',' ','C','P','-','l','i','s','t'
        dc.b    'a','n',' ','s','o','m',' ','s','p','e','c','i','a','l','a','r'
        dc.b    'b','e','t','e',' ','i',' ','r','e','l','i','g','i','o','n',0
        EVEN
str_362:
        dc.b    'T','r','o',' ','a','t','t',' ','e','n',' ','P','C',' ',$E4,'r'
        dc.b    ' ','b',$E4,'t','t','r','e',' ',$E4,'n',' ','e','n',' ','C','6'
        dc.b    '4',0
        EVEN
str_363:
        dc.b    'A','n','v',$E4,'n','d','a',' ','k','e','p','s',' ','s','o','m'
        dc.b    ' ','p','r','e','v','e','n','t','i','v','m','e','d','e','l',0
        EVEN
str_364:
        dc.b    'K','a','l','l','a',' ','s','i','n',' ','s','y','s','t','e','r'
        dc.b    ' ','f',$F6,'r',' ','s','i','n',' ','s','v',$E5,'g','e','r','s'
        dc.b    ' ','f','r','u',0
        EVEN
str_365:
        dc.b    'P','o','s','t','r',$F6,'s','t','a',' ','p',$E5,' ','T','e',' '
        dc.b    'P','a','r','t','y','s',' ','d','e','m','o','t',$E4,'v','l','i'
        dc.b    'n','g',0
        EVEN
str_366:
        dc.b    'K','l',$E4,' ','u','t',' ','s','i','g',' ','t','i','l','l',' '
        dc.b    's','p',$E5,'r','v','a','g','n','s','k','o','n','t','r','o','l'
        dc.b    'l','a','n','t',' ','f',$F6,'r',' ','a','t','t',' ','f',$E5,' '
        dc.b    $E5,'k','a',' ','g','r','a','t','i','s',0
        EVEN
str_367:
        dc.b    'A','n','v',$E4,'n','d','a',' ','C','P','-','l','i','s','t','a'
        dc.b    'n',' ','s','o','m',' ','t','a','n','d','b','o','r','s','t','e'
        dc.b    0
        EVEN
str_368:
        dc.b    'S','k','r','y','t','a',' ','o','m',' ','a','t','t',' ','m','a'
        dc.b    'n',' ','h','a','r',' ','f',$E4,'r','g','-','T','V',0
        EVEN
str_369:
        dc.b    'D','r','u','n','k','n','a',' ','n',$E4,'r',' ','m','a','n',' '
        dc.b    'f',$F6,'r','s',$F6,'k','e','r',' ','t','a',' ','b','a','d','d'
        dc.b    'a','r','e','n',' ','i',' ','s','i','m','s','k','o','l','a','n'
        dc.b    0
        EVEN
str_370:
        dc.b    'F',$F6,'r','k','l','a','r','a',' ','k','r','i','g',' ','m','o'
        dc.b    't',' ','F','r',$E4,'l','s','n','i','n','g','s','a','r','m',$E9
        dc.b    'n',0
        EVEN
str_371:
        dc.b    'S','t','j',$E4,'l','a',' ','f','r',$E5,'n',' ','d','o','m',' '
        dc.b    'r','i','k','a',' ','i',' ','R','i','n','k','e','b','y',' ','o'
        dc.b    'c','h',' ','g','e',' ','t','i','l','l',' ','d','o','m',' ','f'
        dc.b    'a','t','t','i','g','a',' ','p',$E5,' ',$D6,'s','t','e','r','m'
        dc.b    'a','l','m',0
        EVEN
str_372:
        dc.b    'T','r','o',' ','a','t','t',' ',$22,'T','r','e',' ','K','r','o'
        dc.b    'n','o','r',$22,' ','k','o','m','m','e','r',' ','s','o','m',' '
        dc.b    'f','l','i','p','p','e','r','s','p','e','l',0
        EVEN
str_373:
        dc.b    'B','e','g',$E4,'r','a',' ','b','l',$E5,' ','l','i','n','g','o'
        dc.b    'n',0
        EVEN
str_374:
        dc.b    'O','d','l','a',' ','o','p','i','u','m','k','a','n','t','a','r'
        dc.b    'e','l','l','e','r',0
        EVEN
str_375:
        dc.b    'G','l',$F6,'m','m','a',' ','b','o','r','t',' ','a','t','t',' '
        dc.b    's','o','v','a',' ','u','n','d','e','r',' ','e','n',' ','t','r'
        dc.b    'e','m',$E5,'n','a','d','e','r','s',' ','p','e','r','i','o','d'
        dc.b    0
        EVEN
str_376:
        dc.b    'F',$F6,'r','s',$F6,'r','j','a',' ','s','i','g',' ','s','o','m'
        dc.b    ' ','i','l','l','e','g','a','l',' ','g','r','a','f','f','i','t'
        dc.b    'i','m',$E5,'l','a','r','e',0
        EVEN
str_377:
        dc.b    'K',$F6,'p','a',' ','e','n',' ','A','m','i','g','a',' ','4','0'
        dc.b    '0','0',' ','T','o','w','e','r',' ','f',$F6,'r',' ','a','t','t'
        dc.b    ' ','f',$E5,' ','s','n','a','b','b','a','r','e',' ','c','6','4'
        dc.b    ' ','e','m','u','l','e','r','i','n','g',0
        EVEN
str_378:
        dc.b    'H',$E4,'l','s','a',' ','p',$E5,' ','l','y','k','t','s','t','o'
        dc.b    'l','p','a','r',0
        EVEN
str_379:
        dc.b    'H',$E4,'v','d','a',' ','a','t','t',' ','A','I','D','S',' ','i'
        dc.b    'n','t','e',' ','s','p','r','i','d','s',' ','g','e','n','o','m'
        dc.b    ' ','k','r','a','n','v','a','t','t','e','n',0
        EVEN
str_380:
        dc.b    'H','a',' ','s','e','x',' ','m','e','d',' ','p','l',$E5,'t',0
        EVEN
str_381:
        dc.b    'R',$E5,'n','a',' ','I','n','t','e','r','n','a','t','i','o','n'
        dc.b    'e','l','l','a',' ','V',$E4,'r','l','d','s','b','a','n','k','e'
        dc.b    'n',0
        EVEN
str_382:
        dc.b    'T','o','r','t','e','r','a',' ','f','o','l','k',' ','g','e','n'
        dc.b    'o','m',' ','a','t','t',' ','l',$E4,'s','a',' ','u','p','p',' '
        dc.b    'C','P','-','l','i','s','t','a','n',0
        EVEN
str_383:
        dc.b    'S','n','i','c','k','r','a',' ','e','n',' ','m',$F6,'s','s','a'
        dc.b    ' ','s',$E5,' ','a','t','t',' ','m','a','n',' ','b','l','i','r'
        dc.b    ' ','h','o','m','o','s','e','x','u','e','l','l',' ','o','m',' '
        dc.b    'm','a','n',' ','t','a','r',' ','p',$E5,' ','s','i','g',' ','d'
        dc.b    'e','n',0
        EVEN
str_384:
        dc.b    'S','w','a','p','p','a',' ','m','a','t',' ','m','e','d',' ','S'
        dc.b    'k','a','-','n','i','-','h','a','-','n',$E5,'g','o','t','-','a'
        dc.b    't','t','-',' ',$E4,'t','a','-','m','a','n','n','e','n',0
        EVEN
str_385:
        dc.b    'B','y','g','g','a',' ','o','m',' ','C','P','-','l','i','s','t'
        dc.b    'a','n',' ','t','i','l','l',' ','e','n',' ','a','t','o','m','b'
        dc.b    'o','m','b',0
        EVEN
str_386:
        dc.b    'T','r','o',' ','a','t','t',' ','s','k','i','n','n','b','a','n'
        dc.b    'j','o',' ',$E4,'r',' ','e','t','t',' ','d','j','u','r',0
        EVEN
str_387:
        dc.b    'G',$F6,'r','a',' ','u','p','p',' ','m','e','d',' ','J','o','h'
        dc.b    'n',' ','P','o','h','l','m','a','n',0
        EVEN
str_388:
        dc.b    'V',$E4,'s','s','a',' ','a','r','m','b',$E5,'g','a','r','n','a'
        dc.b    ' ','m','e','d',' ','p','e','n','n','v',$E4,'s','s','a','r','e'
        dc.b    0
        EVEN
str_389:
        dc.b    'S','k','y','l','t','a',' ','u','t','e','f','t','e','r',' ','h'
        dc.b    'e','l','a',' ','E','2','0',' ','m','e','d',' ','s','k','y','l'
        dc.b    't','a','r',' ','d',$E4,'r',' ','d','e','t',' ','s','t',$E5,'r'
        dc.b    ' ',$22,'F','r','i','g','o','l','i','t',$22,0
        EVEN
str_390:
        dc.b    'D','r','i','v','a',' ','i','n',' ','s','l','i','p','a','d','e'
        dc.b    ' ','s','t','r','u','m','p','s','t','i','c','k','o','r',' ','i'
        dc.b    ' ','D','r','u','t','t','e','n','s',' ','m','e','l','l','a','n'
        dc.b    'g',$E4,'r','d','e',0
        EVEN
str_391:
        dc.b    'S','t','y','c','k','a',' ','a','l','l','a',' ','b','a','r','n'
        dc.b    ' ','s','o','m',' ','r','y','c','k','e','r',' ','t','o','m','t'
        dc.b    'e','n',' ','i',' ','s','k',$E4,'g','g','e','t',0
        EVEN
str_392:
        dc.b    'S','l','i','c','k','a',' ','f','r','i','m',$E4,'r','k','e','n'
        dc.b    ' ','p',$E5,' ','b',$E5,'d','a',' ','s','i','d','o','r','n','a'
        dc.b    ' ','s',$E5,' ','a','t','t',' ','m','a','n',' ','k','a','n',' '
        dc.b    'a','n','v',$E4,'n','d','a',' ','s','a','m','m','a',' ','f','r'
        dc.b    'i','m',$E4,'r','k','e',' ','t','i','l','l',' ','t','v',$E5,' '
        dc.b    'b','r','e','v',0
        EVEN
str_393:
        dc.b    'U','t','n',$E4,'m','n','a',' ','s','i','g',' ','s','j',$E4,'l'
        dc.b    'v',' ','t','i','l','l',' ','m',$E4,'s','t','e','r','s','p','i'
        dc.b    'o','n',' ','d',$E5,' ','m','a','n',' ','h','i','t','t','a','t'
        dc.b    ' ','e','n',' ','l',$F6,'s','-','n',$E4,'s','a',' ','i',' ','e'
        dc.b    'n',' ','t','i','d','n','i','n','g','s','a','u','t','o','m','a'
        dc.b    't',0
        EVEN
str_394:
        dc.b    'T','y','c','k','a',' ','s','y','n','d',' ','o','m',' ','B','i'
        dc.b    'n','g','o','-','B','e','r','r','a',' ','f',$F6,'r',' ','h','a'
        dc.b    'n',' ','t','r','i','l','l','a','r',' ','o','c','h',' ','s','l'
        dc.b    $E5,'r',' ','s','i','g',' ','i',' ','B','i','n','g','o','l','o'
        dc.b    't','t','o',0
        EVEN
str_395:
        dc.b    'T','a',' ','p','a','t','e','n','t',' ','p',$E5,' ','k','a','k'
        dc.b    'o','r',' ','a','v',' ','t','a','n','d','k','r',$E4,'m',0
        EVEN
str_396:
        dc.b    'S','a','m','l','a',' ','p',$E5,' ','n','a','v','e','l','s','t'
        dc.b    'r',$E4,'n','g','a','r',0
        EVEN
str_397:
        dc.b    'G','i','l','l','r','a',' ','f',$E4,'l','l','o','r',' ','f',$F6
        dc.b    'r',' ','D','e','l','e','r','i','u','m','-','D','a','g','o','b'
        dc.b    'e','r','t',' ','d',$E5,' ','h','a','n',' ','s','m','y','g','e'
        dc.b    'r',' ','i',' ','v','a','s','s','e','n',0
        EVEN
str_398:
        dc.b    'S','p','e','l','a',' ','s','c','h','a','c','k',' ','m','e','d'
        dc.b    ' ','d',$F6,'d','e','n',',',' ','o','c','h',' ','f','u','s','k'
        dc.b    'a',0
        EVEN
str_399:
        dc.b    'S','v','e','t','s','a',' ','d','i','s','k','e','n',',',' ','i'
        dc.b    's','t',$E4,'l','l','e','t',' ','f',$F6,'r',' ','a','t','t',' '
        dc.b    'd','i','s','k','a',' ','d','e','n',0
        EVEN
str_400:
        dc.b    'S','t',$E4,'m','m','a',' ','s','y','n','t','h','a','r',' ','m'
        dc.b    'e','d',' ','s','t',$E4,'m','m','g','a','f','f','e','l',0
        EVEN
str_401:
        dc.b    $22,'D','u','n','k','a',$22,' ','m','e','d',' ','h','u','v','u'
        dc.b    'd','e','t',' ','i','s','t',$E4,'l','l','e','t',' ','f',$F6,'r'
        dc.b    ' ','b','o','l','l','e','n',' ','i',' ','b','a','s','k','e','t'
        dc.b    0
        EVEN
str_402:
        dc.b    'D','e','m','o','n','s','t','r','e','r','a',' ','m','o','t',' '
        dc.b    'p','o','r','r','e','n',' ','g','e','n','o','m',' ','a','t','t'
        dc.b    ' ','l','i','m','m','a',' ','f','a','s','t',' ','s','i','g',' '
        dc.b    'p',$E5,' ','m','o','t','o','r','v',$E4,'g','e','n',0
        EVEN
str_403:
        dc.b    'H','u','k','a',' ','s','i','g',' ','u','n','d','e','r',' ','b'
        dc.b    'o','r','d','e','t',' ','n',$E4,'r',' ','n',$E5,'g','o','n',' '
        dc.b    'r',$E5,'k','a','r',' ','n',$E4,'m','n','a',' ','o','r','d','e'
        dc.b    't',' ',$22,'w','o','k',$22,0
        EVEN
str_404:
        dc.b    'S','p','r','i','t','s','a',' ','s','i','t','t',' ','s','p','e'
        dc.b    'c','i','a','l','a','r','b','e','t','e',0
        EVEN
str_405:
        dc.b    'S','n','i','c','k','r','a',' ','e','n',' ','b',$E4,'v','e','r'
        dc.b    ' ','s','o','m',' ','a','n','f','a','l','l','e','r',' ','b','a'
        dc.b    'r','n','v','a','g','n','a','r',0
        EVEN
str_406:
        dc.b    'A','n','v',$E4,'n','d',' ','c','o','r','n','f','l','a','k','e'
        dc.b    's','-','p','a','k','e','t',' ','s','o','m',' ','t','o','w','e'
        dc.b    'r','l',$E5,'d','a',0
        EVEN
str_407:
        dc.b    'T','v','e','k','a',' ','o','m',' ','m','a','n',' ','t','v','i'
        dc.b    'n','g','a','s',' ','v',$E4,'l','j','a',' ','m','e','l','l','a'
        dc.b    'n',' ','f','a','m','i','l','j','e','n',' ','o','c','h',' ','p'
        dc.b    'o','r','r',0
        EVEN
str_408:
        dc.b    'S','w','a','p','p','a',' ','m','e','d',' ','t','e','l','e','v'
        dc.b    'e','r','k','e','t',0
        EVEN
str_409:
        dc.b    'R','o','p','a',' ',$22,'F','e','l','r','i','n','g','n','i','n'
        dc.b    'g',$22,' ','f','y','r','a',' ','g',$E5,'n','g','e','r',' ','u'
        dc.b    'n','d','e','r',' ','c','e','n','t','r','a','l','p','r','o','v'
        dc.b    'e','t',' ','i',' ','s','v','e','n','s','k','a',0
        EVEN
str_410:
        dc.b    'T','r','o',' ','a','t','t',' ','a','l','l','t',' ','s','o','m'
        dc.b    ' ','f','l','y','t','e','r',' ','g',$E5,'r',' ','a','t','t',' '
        dc.b    $E4,'t','a',0
        EVEN
str_411:
        dc.b    'C','r','a','c','k','a',' ','m','o','d','u','l','e','r',0
        EVEN
str_412:
        dc.b    'S',$E4,'n','d','a',' ','t','e','x','t','-','T','V',' ','m','e'
        dc.b    'd',' ','b','l','i','n','d','s','k','r','i','f','t',0
        EVEN
str_413:
        dc.b    'A','n','o','r','d','n','a',' ','V','M',' ','i',' ','k',$F6,'t'
        dc.b    't','b','u','l','l','a','r',0
        EVEN
str_414:
        dc.b    'S',$E4,'n','d','a',' ','r','a','d','i','o','p','r','o','g','r'
        dc.b    'a','m',' ','f',$F6,'r',' ','v',$E4,'n','s','t','e','r','h',$E4
        dc.b    'n','t','a',0
        EVEN
str_415:
        dc.b    'M','o','t','i','o','n','s','r',$F6,'k','a',0
        EVEN
str_416:
        dc.b    'A','n','o','r','d','n','a',' ','V','M',' ','i',' ','f','e','l'
        dc.b    'r','i','n','g','n','i','n','g',0
        EVEN
str_417:
        dc.b    'T','r','o',' ','a','t','t',' ','K','a','r','l',' ','M','a','r'
        dc.b    'x',' ',$E4,'r',' ','H','o','n','e','y',' ','M','o','n','s','t'
        dc.b    'e','r',0
        EVEN
str_418:
        dc.b    'A','n','v',$E4,'n','d','a',' ','C','P','-','l','i','s','t','a'
        dc.b    'n',' ','s','o','m',' ','m','a','t','s','e','d','e','l',' ','i'
        dc.b    ' ','s','k','o','l','a','n',0
        EVEN
str_419:
        dc.b    'E','r','s',$E4,'t','t','a',' ','a','l','l','a',' ','f',$F6,'r'
        dc.b    's','k','o','l','e','f','r',$F6,'k','n','a','r',' ','m','e','d'
        dc.b    ' ','C','P','-','l','i','s','t','a','n',0
        EVEN
str_420:
        dc.b    'T','r','o',' ','a','t','t',' ','f','i','l','m','e','n',' ',$22
        dc.b    'S','a','l','o',$22,' ',$E4,'r',' ','e','n',' ','d','o','k','u'
        dc.b    'm','e','n','t',$E4,'r','f','i','l','m',0
        EVEN
str_421:
        dc.b    'K','l',$E4,'t','t','r','a',' ','i',' ','l','i','v','s','f','a'
        dc.b    'r','l','i','g',' ','l','e','d','n','i','n','g',0
        EVEN
str_422:
        dc.b    'T','r','o',' ','a','t','t',' ','D','o','o','m',' ',$E4,'r',' '
        dc.b    'b',$E4,'t','t','r','e',' ',$E4,'n',' ','B','r','a','t','w','u'
        dc.b    'r','s','t',0
        EVEN
str_423:
        dc.b    $C4,'g','n','a',' ','s','i','n',' ','f','r','i','t','i','d',' '
        dc.b    $E5,'t',' ','a','t','t',' ','v',$E4,'l','t','a',' ','t',$E5,'g'
        dc.b    0
        EVEN
str_424:
        dc.b    'S','k','r','i','v','a',' ','b','a','r','n','p','o','r','r',' '
        dc.b    's','o','m',' ','s','i','t','t',' ','s','t',$F6,'r','s','t','a'
        dc.b    ' ','i','n','t','r','e','s','s','e',' ','v','i','d',' ','a','n'
        dc.b    's','t',$E4,'l','l','n','i','n','g','s','i','n','t','e','r','v'
        dc.b    'j','u','e','r',0
        EVEN
str_425:
        dc.b    'F',$F6,'r','s',$F6,'k','a',' ','b','l','i',' ','s',$E5,' ','l'
        dc.b    'i','k',' ','e','n',' ','c','e','m','e','n','t','k','l','u','m'
        dc.b    'p',' ','s','o','m',' ','m',$F6,'j','l','i','g','t',0
        EVEN
str_426:
        dc.b    'T','i','l','l','v','e','r','k','a',' ','e','n',' ','V','i','r'
        dc.b    't','u','a','l',' ','R','e','a','l','i','t','y',' ','h','j',$E4
        dc.b    'l','m',' ','f',$F6,'r',' ','b','l','i','n','d','a',0
        EVEN
str_427:
        dc.b    'R',$F6,'k','a',' ','d','i','s','k','e','t','t','e','r',' ','i'
        dc.b    's','t',$E4,'l','l','e','t',' ','f',$F6,'r',' ','f','i','s','k'
        dc.b    0
        EVEN
str_428:
        dc.b    'S','l',$E5,' ','i','h','j',$E4,'l',' ','o','c','h',' ','r','e'
        dc.b    'n','s','a',' ','F','i','s','h','-','d','i','s','k','e','t','t'
        dc.b    'e','r',' ','i','n','n','a','n',' ','m','a','n',' ','a','n','v'
        dc.b    $E4,'n','d','e','r',' ','d','o','m',0
        EVEN
str_429:
        dc.b    'T','r','o',' ','a','t','t',' ','G','r','o','d','a','n',' ','B'
        dc.b    'o','l','l',' ',$E4,'r',' ','r','u','n','d',' ','o','c','h',' '
        dc.b    'g','j','o','r','d',' ','a','v',' ','s','v','a','r','t','/','v'
        dc.b    'i','t','t',' ','l',$E4,'d','e','r',0
        EVEN
str_430:
        dc.b    'K','a','l','l','a',' ','a','l','l','a',' ','s','o','m',' ','b'
        dc.b    'o','r',' ','i',' ','T','a','n','u','m','s','-','H','e','d','e'
        dc.b    ' ','f',$F6,'r',' ','K','a','p','t','e','n',' ','K','r','o','k'
        dc.b    0
        EVEN
str_431:
        dc.b    'L',$E5,'t','a',' ','B','l','o','m','s','t','e','r','-','L','e'
        dc.b    'i','f',' ','g',$F6,'r','a',' ','d','i','t','t',' ','s','p','e'
        dc.b    'c','i','a','l','a','r','b','e','t','e',0
        EVEN
str_432:
        dc.b    'F',$F6,'r','e','b','y','g','g','a',' ','u','n','g','d','o','m'
        dc.b    's','v',$E5,'l','d',' ','g','e','n','o','m',' ','a','t','t',' '
        dc.b    's','p','r',$E4,'n','g','a',' ','d','a','g','i','s',0
        EVEN
str_433:
        dc.b    'S','k','r','i','v','a',' ','s','i','n','a',' ','p','r','o','v'
        dc.b    ' ','m','e','d',' ','o','s','y','n','l','i','g','h','e','t','s'
        dc.b    'b','l',$E4,'c','k',0
        EVEN
str_434:
        dc.b    'T','r','o',' ','a','t','t',' ','s','k','o','l','a','n',' ',$E4
        dc.b    'r',' ','e','n',' ','d','e','m','o','k','r','a','t','i','s','k'
        dc.b    ' ','o','r','g','a','n','i','s','a','t','i','o','n',0
        EVEN
str_435:
        dc.b    'K','r','o','s','s','a',' ','k','n',$E4,'s','k',$E5,'l','a','r'
        dc.b    'n','a',' ','m','e','d',' ','v','i','l','j','e',' ','f',$F6,'r'
        dc.b    ' ','a','t','t',' ','s','e',' ','o','m',' ','C','P','-',$E4,'n'
        dc.b    'g','e','l','n',' ','k','o','m','m','e','r',' ','o','c','h',' '
        dc.b    'h','e','l','a','r',' ','d','e','m',0
        EVEN
str_436:
        dc.b    'F','i','x','a',' ','s','p','r','i','t','r',$E4,'t','t','i','g'
        dc.b    'h','e','t','e','r',' ','t','i','l','l',' ','e','t','t',' ','k'
        dc.b    'n','a','t','t','e','d','i','s','c','o',0
        EVEN
str_437:
        dc.b    'T','r','o',' ','a','t','t',' ','m','a','n',' ','f',$E5,'r',' '
        dc.b    'N','o','b','e','l','s',' ','f','r','e','d','s','p','r','i','s'
        dc.b    ' ','o','m',' ','m','a','n',' ','k','a','s','t','a','r',' ','1'
        dc.b    '0','0','0',' ','u','t','v','e','c','k','l','i','n','g','s','s'
        dc.b    't',$F6,'r','d','a',' ','l','e','m','m','l','a','r',' ','p',$E5
        dc.b    ' ','J','A','S',0
        EVEN
str_438:
        dc.b    'A','n','v',$E4,'n','d','a',' ','G','a','n','g','b','a','n','g'
        dc.b    '-','m','e','d','l','e','m','s','k','o','r','t','e','t',' ','s'
        dc.b    'o','m',' ','l','e','g','i','t','i','m','a','t','i','o','n',0
        EVEN
str_439:
        dc.b    'C','i','t','e','r','a',' ',$22,'S','a','t','a','n','s','v','e'
        dc.b    'r','s','e','r','n','a',$22,' ','i',' ','e','n',' ','m','o','s'
        dc.b    'k',$E9,' ','i',' ','M','e','k','k','a',0
        EVEN
str_440:
        dc.b    'T','r','o',' ','a','t','t',' ','m','a','n',' ','k','a','n',' '
        dc.b    'b','o','t','a',' ','p','e','r','s','o','n','l','i','g','h','e'
        dc.b    't','s','k','l','y','v','n','i','n','g',' ','m','e','d',' ','l'
        dc.b    'i','m',0
        EVEN
str_441:
        dc.b    'T','r','o',' ','a','t','t',' ','m','a','n',' ','f',$E5,'r',' '
        dc.b    'h',$F6,'g','r','e',' ','s','t','u','d','i','e','b','i','d','r'
        dc.b    'a','g',' ','o','m',' ','m','a','n',' ','g','a','n','g','b','a'
        dc.b    'n','g','a','r',' ','f','i','n','a','n','s','m','i','n','i','s'
        dc.b    't','e','r','n',0
        EVEN
str_442:
        dc.b    'P','r','o','t','e','s','t','e','r','a',' ','m','o','t',' ','S'
        dc.b    'v','e','r','i','g','e','s',' ','e','k','o','n','o','m','i','s'
        dc.b    'k','a',' ','p','o','l','i','t','i','k',' ','g','e','n','o','m'
        dc.b    ' ','a','t','t',' ','b','r',$E4,'n','n','a',' ','u','p','p',' '
        dc.b    's','i','n','a',' ','p','e','n','g','a','r',' ','u','t','a','n'
        dc.b    'f',$F6,'r',' ','r','i','k','s','b','a','n','k','e','n',0
        EVEN
str_443:
        dc.b    'L','e','k','a',' ','D','o','o','m',' ','m','e','d',' ','s','i'
        dc.b    'n',' ','l','i','l','l','e','b','r','o','r',' ','o','c','h',' '
        dc.b    'p','a','p','p','a','s',' ','m','o','t','o','r','s',$E5,'g',0
        EVEN
str_444:
        dc.b    $C4,'g','n','a',' ','s','i','t','t',' ','l','i','v',' ',$E5,'t'
        dc.b    ' ','a','t','t',' ','l','e','t','a',' ','e','f','t','e','r',' '
        dc.b    'v',$E4,'r','l','d','s','k','a','n','t','e','n',0
        EVEN
str_445:
        dc.b    'S','a','m','l','a',' ','m','o','l','e','k','y','l','e','r',0
        EVEN
str_446:
        dc.b    'S','t',$E4,'l','l','a',' ','u','p','p',' ','m','e','d',' ','e'
        dc.b    'n',' ','k',$F6,'n','s','r','o','c','k','l',$E5,'t',' ','i',' '
        dc.b    'M','e','l','o','d','i','f','e','s','t','i','v','a','l','e','n'
        dc.b    0
        EVEN
str_447:
        dc.b    'G',$E5,' ','i','n',' ','o','c','h',' ','s','k','r','i','k','a'
        dc.b    ' ',$22,'T','r','e','n','d','b','r','o','t','t',$22,' ','p',$E5
        dc.b    ' ','J','C',0
        EVEN
str_448:
        dc.b    'U','p','p','f','i','n','n','a',' ','e','n',' ','C','P','-','p'
        dc.b    'a','c','e','m','a','k','e','r',' ','s','o','m',' ','b','y','t'
        dc.b    'e','r',' ','t','a','k','t',' ','v','a','r',' ','3',':','e',' '
        dc.b    'm','i','n','u','t',' ','o','c','h',' ','d','r','i','v','s',' '
        dc.b    'm','e','d',' ','u','r','a','n',0
        EVEN
str_449:
        dc.b    'T','i','l','l','v','e','r','k','a',' ','g','l','a','s','s',' '
        dc.b    'm','e','d',' ','a','l','v','e','d','o','n','s','m','a','k',0
        EVEN
str_450:
        dc.b    'K','a','p','a',' ','T','V',' ','4',':','s',' ','t','e','x','t'
        dc.b    '-','T','V',' ','f',$F6,'r',' ','a','t','t',' ','k','u','n','n'
        dc.b    'a',' ','s',$E4,'n','d','a',' ','C','P','-','l','i','s','t','a'
        dc.b    'n',0
        EVEN
str_451:
        dc.b    'T','a',' ','s','i','t','t',' ','l','i','v',' ','v','a','r','j'
        dc.b    'e',' ','g',$E5,'n','g',' ','m','a','n',' ','i','n','t','e',' '
        dc.b    'v','i','n','n','e','r',' ','p',$E5,' ','B','i','n','g','o','l'
        dc.b    'o','t','t','o',0
        EVEN
str_452:
        dc.b    'S','k','o','l','k','a',' ','f',$F6,'r',' ','a','t','t',' ','k'
        dc.b    'u','n','n','a',' ','k','o','l','l','a',' ','p',$E5,' ','D','j'
        dc.b    ' ','K','a','t',' ','S','h','o','w',0
        EVEN
str_453:
        dc.b    'G','r','e','e','t','a',' ','a','l','l','a',' ','s','o','m',' '
        dc.b    'b',$E4,'r',' ','t','r',$E4,'s','k','o','r',' ','i',' ','K','e'
        dc.b    's','o','s',' ','2','8',' ','k',' ','i','n','t','r','o',0
        EVEN
str_454:
        dc.b    'F','r',$E5,'g','a',' ','S','l','a','s','h','/','C','i','t','r'
        dc.b    'o','n','.',' ','o','m',' ','h','a','n',' ','h','a','r',' ','n'
        dc.b    $E5,'g','r','a',' ','m','o','d','u','l','e','r',0
        EVEN
str_455:
        dc.b    'G',$E5,' ','i','n',' ','p',$E5,' ','M','c','D','o','n','a','l'
        dc.b    'd','s',' ','o','c','h',' ','b','e','s','t',$E4,'l','l','a',' '
        dc.b    'e','n',' ','h','a','l','v',' ','s','p','e','c','i','a','l',0
        EVEN
str_456:
        dc.b    'B',$F6,'r','j','a',' ','s','o','m',' ','A','s','c','i','i',' '
        dc.b    'g','r','a','f','i','k','e','r',' ','v','i','d',' ','h','o','v'
        dc.b    'e','t',' ','i',' ','S','o','m','a','l','i','a',0
        EVEN
str_457:
        dc.b    'S','m','u','g','g','l','a',' ','r',$E4,'k','o','r',' ','j','o'
        dc.b    'r','d','e','n',' ','r','u','n','t',0
        EVEN
str_458:
        dc.b    'G',$F6,'r','a',' ','h','o','n','n',$F6,'r',' ','f',$F6,'r',' '
        dc.b    'e','n',' ','f','i','n','s','k',' ','v',$E4,'r','n','p','l','i'
        dc.b    'k','t','i','g',0
        EVEN
str_459:
        dc.b    $D6,'p','p','n','a',' ','e','n',' ','d','j','u','r','p','a','r'
        dc.b    'k',' ','f',$F6,'r',' ','u','t','v','e','c','k','l','i','n','g'
        dc.b    's','s','t',$F6,'r','d','a',' ','d','j','u','r',0
        EVEN
str_460:
        dc.b    'L',$E5,'n','a',' ','u','t',' ','s','i','n','a',' ','r','o','l'
        dc.b    'l','s','p','e','l',' ','t','i','l','l',' ','U','l','f',0
        EVEN
str_461:
        dc.b    'O','p','e','r','e','r','a',' ','b','o','r','t',' ','r','y','g'
        dc.b    'g','r','a','d','e','n',' ','f',$F6,'r',' ','a','t','t',' ','v'
        dc.b    $E4,'g','a',' ','m','i','n','d','r','e',0
        EVEN
str_462:
        dc.b    'S','t','i','f','t','a',' ','l','a','g','a','r',0
        EVEN
str_463:
        dc.b    'T','a',' ','m','e','d',' ','b','a','d','b','y','x','o','r',' '
        dc.b    't','i','l','l',' ','e','t','t',' ','c','o','p','y','p','a','r'
        dc.b    't','y',0
        EVEN
str_464:
        dc.b    'S','l',$E5,' ','i','h','j',$E4,'l',' ','f','l','u','g','o','r'
        dc.b    ' ','m','e','d',' ','k','a','r','a','t','e','p','i','n','n','a'
        dc.b    'r',0
        EVEN
str_465:
        dc.b    'K','o','p','p','l','a',' ','i','n',' ','s','i','g',' ','p',$E5
        dc.b    ' ','g','r','a','n','n','e','n','s',' ','T','V','-','a','n','t'
        dc.b    'e','n','n',' ','f',$F6,'r',' ','a','t','t',' ','f',$E5,' ','f'
        dc.b    $E4,'r','r','e',' ','T','V','-','k','a','n','a','l','e','r',0
        EVEN
str_466:
        dc.b    'O','r','d','n','a',' ','e','n',' ','l',$F6,'p','t',$E4,'v','l'
        dc.b    'i','n','g',' ','f',$F6,'r',' ','f','o','l','k',' ','s','o','m'
        dc.b    ' ',$E4,'r',' ','l','a','m','a',0
        EVEN
str_467:
        dc.b    'T','r','o',' ','a','t','t',' ','D','j',' ','C','a','t',' ','s'
        dc.b    'k','a',' ','f',$E5,' ','N','o','b','e','l','p','r','i','s','e'
        dc.b    't',' ','i',' ','l','i','t','t','e','r','a','t','u','r',' ','f'
        dc.b    $F6,'r',' ','d','e','n','n','a',' ','l','i','s','t','a',0
        EVEN
str_468:
        dc.b    'F',$F6,'r','s',$F6,'k','a',' ','s','n','o',' ','s',$E5,' ','m'
        dc.b    'y','c','k','e','t',' ','l','e','g','o',' ','s','o','m',' ','m'
        dc.b    $F6,'j','l','i','g','t',' ','p',$E5,' ','L','e','g','o','l','a'
        dc.b    'n','d',0
        EVEN
str_469:
        dc.b    'T','r','i','m','m','a',' ','K','i','n','d','e','r',$E4,'g','g'
        dc.b    's','l','e','k','s','a','k','e','r',0
        EVEN
str_470:
        dc.b    'D','a','m','m','s','u','g','a',' ','b','a','n','a','n','e','r'
        dc.b    'n','a',' ','p',$E5,' ','O','b','s','!',' ','i','n','n','a','n'
        dc.b    ' ','m','a','n',' ','k',$F6,'p','e','r',' ','d','e','m',0
        EVEN
str_471:
        dc.b    'K',$F6,'p','a',' ','b','i','l','j','e','t','t','e','r',' ','t'
        dc.b    'i','l','l',' ','v','a','n','f',$F6,'r','e','s','t',$E4,'l','l'
        dc.b    'n','i','n','g','a','r',0
        EVEN
str_472:
        dc.b    'A','n','v',$E4,'n','d','a',' ','c','y','k','e','l','h','j',$E4
        dc.b    'l','m',' ','s','o','m',' ','p','r','e','v','e','n','t','i','v'
        dc.b    'm','e','d','e','l',0
        EVEN
str_473:
        dc.b    'T','r','o',' ','a','t','t',' ','A','F','A',' ',$E4,'r',' ','e'
        dc.b    'n',' ','s','y','f',$F6,'r','e','n','i','n','g',' ','f',$F6,'r'
        dc.b    ' ','f','o','l','k','s','k','y','g','g','a',' ','A','M','O','S'
        dc.b    '-','c','o','d','a','r','e',0
        EVEN
str_474:
        dc.b    'P','o','p','p','a',' ','m','a','j','s','k','o','l','v','a','r'
        dc.b    0
        EVEN
str_475:
        dc.b    'S','o','v','a',' ','p',$E5,' ','k','y','r','k','o','g',$E5,'r'
        dc.b    'd','e','n',' ','d','e','n',' ','1','0',':','e',' ','o','k','t'
        dc.b    'o','b','e','r',0
        EVEN
str_476:
        dc.b    'F','i','r','a',' ','F',$E4,'b','o','j',$E4,'n','t','a','n','s'
        dc.b    ' ','d','a','g',' ','g','e','n','o','m',' ','a','t','t',' ',$E4
        dc.b    't','a',' ','f','a','l','u','k','o','r','v',0
        EVEN
str_477:
        dc.b    'K',$E4,'m','p','a',' ','s','i','g',' ','i','n',' ','i',' ','J'
        dc.b    'e','o','p','a','r','d','y',' ','f',$F6,'r',' ','a','t','t',' '
        dc.b    's','e',' ','o','m',' ','d','e','t',' ',$E4,'r',' ','n',$E5,'g'
        dc.b    'o','n',' ','m','a','n',' ','k',$E4,'n','n','e','r',' ','i',' '
        dc.b    'p','u','b','l','i','k','e','n',0
        EVEN
str_478:
        dc.b    'B','l','a','n','d','a',' ','u','t',' ','O','b','o','y',' ','m'
        dc.b    'e','d',' ','h','e','m','b','r',$E4,'n','t',0
        EVEN
str_479:
        dc.b    'F','r','i','d','l','y','s','a',' ','h','a','n','d','i','k','a'
        dc.b    'p','p','r','u','t','o','r',0
        EVEN
str_480:
        dc.b    $C5,'k','a',' ','f','a','s','t',' ','f',$F6,'r',' ','l',$F6,'s'
        dc.b    'd','r','i','v','e','r','i',0
        EVEN
str_481:
        dc.b    'G',$E5,' ','m','o','t',' ','g','r',$F6,'n',' ','g','u','b','b'
        dc.b    'e',' ','o','c','h',' ','v','a','r','a',' ','s','t','o','l','t'
        dc.b    ' ',$F6,'v','e','r',' ','d','e','t',0
        EVEN
str_482:
        dc.b    'T','y','c','k','a',' ','a','t','t',' ','E','d','d','i','e',' '
        dc.b    'M','e','d','u','z','a',' ',$E4,'r',' ','C','y','b','e','r','!'
        dc.b    0
        EVEN
str_483:
        dc.b    'H',$E4,'v','d','a',' ','a','t','t',' ','J','o','n','a','s',' '
        dc.b    'G','a','r','d','e','l','l',' ',$E4,'r',' ','b',$F6,'g',0
        EVEN
str_484:
        dc.b    'T','y','c','k','a',' ','a','t','t',' ','d','e','t',' ','l',$E5
        dc.b    't','e','r',' ','s','o','m',' ','m','u','s','i','k',' ','n',$E4
        dc.b    'r',' ','m','a','n',' ','r','i','t','a','r',' ','p','e','n','i'
        dc.b    's','a','r',0
        EVEN
str_485:
        dc.b    'P','r','e','n','u','m','e','r','e','r','a',' ','p',$E5,' ','k'
        dc.b    'n',$E4,'c','k','e','b','r',$F6,'d',0
        EVEN
str_486:
        dc.b    'B','e','t','y','g','s',$E4,'t','t','a',' ','o','f','f','e','n'
        dc.b    't','l','i','g','a',' ','t','o','a','l','e','t','t','e','r',0
        EVEN
str_487:
        dc.b    'P','a','r','k','e','r','a',' ','p',$E5,' ','u','p','p','t','a'
        dc.b    'g','n','a',' ','P','-','r','u','t','o','r',0
        EVEN
str_488:
        dc.b    'A','b','o','n','n','e','r','a',' ','p',$E5,' ','B',$F6,'g',0
        EVEN
str_489:
        dc.b    'F',$F6,'r','s',$F6,'k','a',' ','k','o','n','k','u','r','r','e'
        dc.b    'r','a',' ','m','e','d',' ','C','P','-','l','i','s','t','a','n'
        dc.b    0
        EVEN
str_490:
        dc.b    'T','r','o',' ','a','t','t',' ','b','e','n','s','i','n',' ',$E4
        dc.b    'r',' ','b','r','a','n','d','f','a','r','l','i','g','t',0
        EVEN
str_491:
        dc.b    'G',$F6,'r','a',' ','l','a','g','e','n',' ','t','i','l','l',' '
        dc.b    'e','n',' ','s','p','o','r','t',0
        EVEN
str_492:
        dc.b    'V','a','r','a',' ','f','u','l','l',' ','p',$E5,' ',$E4,'l','g'
        dc.b    'j','a','k','t','e','n',0
        EVEN
str_493:
        dc.b    'B','l','i',' ','v','e','g','e','t','a','r','i','s','k',' ','k'
        dc.b    'a','n','n','i','b','a','l',0
        EVEN
str_494:
        dc.b    'S',$E4,'l','j','a',' ','s','k',$F6,'r','d','e','t','r',$F6,'s'
        dc.b    'k','o','r',' ','i',' ','p','a','k','e','t',' ','o','m',' ','6'
        dc.b    ' ','s','l','u','m','p','m',$E4,'s','s','i','g','a',' ','i',' '
        dc.b    'v','a','r','j','e',0
        EVEN
str_495:
        dc.b    'V','a','r','a',' ','v','e','g','e','t','a','r','i','a','n',' '
        dc.b    'o','c','h',' ',$E4,'l','g',$E4,'t','a','r','e',0
        EVEN
str_496:
        dc.b    'P','r','o','v','a',' ','o','m',' ','d','e','t',' ','g',$F6,'r'
        dc.b    ' ','o','n','t',' ','a','t','t',' ','s','k','j','u','t','a',' '
        dc.b    's','i','g',' ','i',' ','h','u','v','u','d','e','t',0
        EVEN
str_497:
        dc.b    'R',$F6,'k','a',' ','a','s','k','f','a','t',0
        EVEN
str_498:
        dc.b    'S','o','l','a',' ','u','t','a','n',' ','k','l',$E4,'d','e','r'
        dc.b    0
        EVEN
str_499:
        dc.b    'S','v',$E4,'l','j','a',' ','s','i','n',' ','e','g','e','n',' '
        dc.b    'g','o','m',0
        EVEN
str_500:
        dc.b    'B','e','s','t',$E4,'l','l','a',' ','b','l','y','f','r','i',' '
        dc.b    '9','5',' ','p',$E5,' ','k','r','o','g','e','n',0
        EVEN
str_501:
        dc.b    'R','o','s','t','a',' ','f','o','l','i','e',0
        EVEN
str_502:
        dc.b    'T','r','o',' ','a','t','t',' ','P','r','i','p','p','s',' ','t'
        dc.b    'i','l','l','v','e','r','k','a','r',' ',$F6,'l',0
        EVEN
str_503:
        dc.b    $C5,'k','a',' ','V',$E4,'t','t','e','r','n',' ','R','u','n','t'
        dc.b    ' ','m','e','d',' ','r','u','l','l','s','t','o','l',0
        EVEN
str_504:
        dc.b    'K','o','n','v','e','r','t','e','r','a',' ','t','i','l','l',' '
        dc.b    'h','e','t','e','r','o','s','e','x','u','e','l','l',0
        EVEN
str_505:
        dc.b    'K',$F6,'p','a',' ','s','y','n','v','i','l','l','o','r',' ','p'
        dc.b    $E5,' ','K','o','n','s','u','m',0
        EVEN
str_506:
        dc.b    'S','u','p','a',' ','s','i','g',' ','f','u','l','l',' ','p',$E5
        dc.b    ' ','m','e','l','l','a','n','c','o','l','a',0
        EVEN
str_507:
        dc.b    'B','l','i',' ','s','t','a','m','m','i','s',' ','p',$E5,' ','m'
        dc.b    'o','t','o','r','b',$F6,'r','s','e','n',0
        EVEN
str_508:
        dc.b    'A','n','o','r','d','n','a',' ','r','a','v','e',' ','f',$F6,'r'
        dc.b    ' ','P','R','O',0
        EVEN
str_509:
        dc.b    'B','e','g',$E4,'r','a',' ','p','r','e','d','i','k','a','t','s'
        dc.b    'f','y','l','l','n','a','d',' ','h','o','s',' ','t','a','n','d'
        dc.b    'l',$E4,'k','a','r','e','n',0
        EVEN
str_510:
        dc.b    'F',$F6,'r','s',$F6,'k','a',' ','b','l','i',' ','a','n','s','t'
        dc.b    $E4,'l','l','d',' ','s','o','m',' ','o','f','f','i','c','i','e'
        dc.b    'l','l',' ','B','a','m','s','e','-','l',$E4,'s','a','r','e',' '
        dc.b    'f',$F6,'r',' ','H','e','l','l','s',' ','A','n','g','e','l','s'
        dc.b    0
        EVEN
str_511:
        dc.b    'S','n','i','c','k','r','a',' ','e','t','t',' ','d','r','o','g'
        dc.b    'f','r','i','t','t',' ','a','l','t','e','r','n','a','t','i','v'
        dc.b    ' ','t','i','l','l',' ','H','u','l','t','s','f','r','e','d','s'
        dc.b    ' ','f','e','s','t','i','v','a','l','e','n',0
        EVEN
str_512:
        dc.b    'S','t',$E4,'l','l','a',' ','u','p','p',' ','i',' ','v',$E4,'r'
        dc.b    'l','d','s','c','u','p','e','n',' ','i',' ','B',$F6,'g',0
        EVEN
str_513:
        dc.b    'S','v','a','r','v','a',' ','l','j','u','s','s','t','a','k','a'
        dc.b    'r',' ','a','v',' ','b','o','m','u','l','l',0
        EVEN
str_514:
        dc.b    'S','p','e','c','i','a','l','b','e','s','t',$E4,'l','l','a',' '
        dc.b    'v','e','g','e','t','a','r','i','s','k',' ','b','r','y','s','s'
        dc.b    'e','l','k',$E5,'l',0
        EVEN
str_515:
        dc.b    'G',$F6,'r','a',' ','s','i','n',' ','P','R','A','O',' ','s','o'
        dc.b    'm',' ','f','o','t','b','o','l','l','s','m',$E5,'l','v','a','k'
        dc.b    't',0
        EVEN
str_516:
        dc.b    'S','a','m','l','a',' ','p',$E5,' ','f','l','y','t','a','n','d'
        dc.b    'e',' ','t','v',$E5,'l',0
        EVEN
str_517:
        dc.b    'T','i','l','l','v','e','r','k','a',' ','2','-','D',' ','g','l'
        dc.b    'a','s',$F6,'g','o','n',0
        EVEN
str_518:
        dc.b    'P','l','a','c','e','r','a',' ','k','o','n','f','i','r','m','a'
        dc.b    't','i','o','n','s','l',$E4,'g','r','e','t',' ','p',$E5,' ','e'
        dc.b    't','t',' ','k','o','n','c','e','n','t','r','a','t','i','o','n'
        dc.b    's','l',$E4,'g','e','r',0
        EVEN
str_519:
        dc.b    'V','i','r','k','a',' ','e','n',' ','g',$E5,'s','t','o','l',0
        EVEN
str_520:
        dc.b    'F',$F6,'r','s',$F6,'k','a',' ','g',$F6,'r','a',' ','f','y','r'
        dc.b    'k','a','n','t','i','g','a',' ','r',$F6,'k','r','i','n','g','a'
        dc.b    'r',0
        EVEN
str_521:
        dc.b    'S',$E4,'l','j','a',' ',$F6,'v','n','i','n','g','s','m','i','n'
        dc.b    'k','a','r',' ','t','i','l','l',' ','f',$F6,'r','s','v','a','r'
        dc.b    'e','t',0
        EVEN
str_522:
        dc.b    'P','r','e','n','u','m','e','r','e','r','a',' ','p',$E5,' ','h'
        dc.b    'e','m','g','l','a','s','s',0
        EVEN
str_523:
        dc.b    'K',$E4,'n','n','a',' ','s','i','g',' ','l','i','t','e',' ','g'
        dc.b    'e','n','e','r','a','d',' ','n',$E4,'r',' ','m','a','n',' ','b'
        dc.b    'l','i','r',' ','v',$E5,'l','d','t','a','g','e','n',0
        EVEN
str_524:
        dc.b    $C5,'k','a',' ','t','i','l','l',' ','e','n',' ','n','u','d','i'
        dc.b    's','t','s','t','r','a','n','d',' ','o','c','h',' ','v','a','r'
        dc.b    'a',' ','b',$F6,'g',0
        EVEN
str_525:
        dc.b    $C4,'t','a',' ','c','h','o','k','l','a','d','p','u','d','d','i'
        dc.b    'n','g',' ','i',' ','t','r','o','n',' ','a','t','t',' ','d','e'
        dc.b    't',' ',$E4,'r',' ','a','v','f',$F6,'r','i','n','g',0
        EVEN
str_526:
        dc.b    'K',$F6,'p','a',' ','a','l','l','a',' ','s','k','i','v','o','r'
        dc.b    ' ','m','e','d',' ','g','r','u','p','p','e','n',' ','V','a','r'
        dc.b    'i','o','u','s',' ','A','r','t','i','s','t','s',0
        EVEN
str_527:
        dc.b    'G',$F6,'r','a',' ','e','t','t',' ','d','a','t','a','s','p','e'
        dc.b    'l',' ','s','o','m',' ','h','e','t','e','r',' ','M','a','n','s'
        dc.b    'L','e','m','m','i','n','g','s',' ','o','c','h',' ','g',$E5,'r'
        dc.b    ' ','u','t',' ','p',$E5,' ','a','t','t',' ','s','t','y','r','a'
        dc.b    ' ','s','m',$E5,' ','p','e','n','i','s','a','r',0
        EVEN
str_528:
        dc.b    'L','e','t','a',' ','f','e','b','r','i','l','t',' ','e','f','t'
        dc.b    'e','r',' ','f',$E5,'g','e','l','v',$E4,'g','e','n',0
        EVEN
str_529:
        dc.b    'L','e','k','a',' ','S','a','l','o',' ','i',' ','S','a','l','u'
        dc.b    'h','a','l','l','e','n',0
        EVEN
str_530:
        dc.b    'L','u','r','a',' ','v','a','m','p','y','r','e','r','n','a',' '
        dc.b    'g','e','n','o','m',' ','a','t','t',' ','s','o','v','a',' ','i'
        dc.b    ' ','e','n',' ','p','o','s','t','b','o','x',' ','p',$E5,' ','d'
        dc.b    'a','g','e','n',0
        EVEN
str_531:
        dc.b    'F',$F6,'r','s',$F6,'k','a',' ','b','o','t','a',' ','m',$F6,'r'
        dc.b    'k','r',$E4,'d','s','l','a',' ','m','e','d',' ','a','t','t',' '
        dc.b    'l',$E5,'t','a',' ','e','n',' ','v','a','m','p','y','r',' ','v'
        dc.b    'a','k','a',' ',$F6,'v','e','r',' ','e','n',' ','p',$E5,' ','n'
        dc.b    'a','t','t','e','n',0
        EVEN
str_532:
        dc.b    'S','k','a','f','f','a',' ','h','o','r','o','s','k','o','p',' '
        dc.b    'i','s','t',$E4,'l','l','e','t',' ','f',$F6,'r',' ','s','t','r'
        dc.b    'o','b','o','s','k','o','p',' ','t','i','l','l',' ','e','t','t'
        dc.b    ' ','r','a','v','e','p','a','r','t','y',0
        EVEN
str_533:
        dc.b    'S','n','i','f','f','a',' ','r','a','d','i','o','v',$E5,'g','o'
        dc.b    'r',0
        EVEN
str_534:
        dc.b    'S','i','k','t','a',' ','p',$E5,' ',$F6,'v','e','r','k',$F6,'r'
        dc.b    'd','a',' ','d','j','u','r',' ','p',$E5,' ','a','u','t','o','b'
        dc.b    'a','h','n',0
        EVEN
str_535:
        dc.b    'G',$E5,' ','m','e','d',' ','i',' ','K','E','S','O',' ','f','r'
        dc.b    'i','v','i','l','l','i','g','t',0
        EVEN
str_536:
        dc.b    'V','a','r','a',' ','e','l','a','k',' ','m','o','t',' ','a','n'
        dc.b    'd','r','a','s',' ','l','i','l','l','a','s','y','s','t','r','a'
        dc.b    'r',0
        EVEN
str_537:
        dc.b    'T','a','t','u','e','r','a',' ',$22,'g','n','u','g','g','i','s'
        dc.b    'a','r',$22,' ','p',$E5,' ','b','r',$F6,'s','t','e','t',0
        EVEN
str_538:
        dc.b    'K','o','k','a',' ','C','o','l','a','n',' ','i','n','n','a','n'
        dc.b    ' ','m','a','n',' ','d','r','i','c','k','e','r',' ','d','e','n'
        dc.b    0
        EVEN
str_539:
        dc.b    $C5,'k','a',' ','V','a','s','a','l','o','p','p','e','t',' ','m'
        dc.b    'e','d',' ','t','a','n','d','p','e','t','a','r','e',' ','s','o'
        dc.b    'm',' ','s','t','a','v','a','r',' ','o','c','h',' ','s','u','g'
        dc.b    'r',$F6,'r',' ','s','o','m',' ','s','k','i','d','o','r',0
        EVEN
str_540:
        dc.b    'B','e','g',$E5,' ','h','a','r','a','k','i','r','i',' ','m','e'
        dc.b    'd',' ','e','n',' ','g','l','a','s','s','p','i','n','n','e',0
        EVEN
str_541:
        dc.b    'S','k','a','f','f','a',' ','W','i','n','d','o','w','s',' ','9'
        dc.b    '5',' ','o','c','h',' ','i','n','s','t','a','l','l','e','r','a'
        dc.b    ' ','d','e','t',' ','m','e','d',' ','v','i','l','j','e',' ','p'
        dc.b    $E5,' ','s','i','n',' ','P','C',0
        EVEN
str_542:
        dc.b    'T','r','o',' ','a','t','t',' ','C','6','4',':','a','n',' ',$E4
        dc.b    'r',' ','d',$F6,'d',0
        EVEN
str_543:
        dc.b    'S','n','i','c','k','r','a',' ','s','i','d','v','a','g','n',' '
        dc.b    't','i','l','l',' ','r','u','l','l','s','t','o','l',0
        EVEN
str_544:
        dc.b    'K',$F6,'r','a',' ','e','n',' ','I','n','t','e','r','n','e','t'
        dc.b    ' ','s','i','t','e',' ','p',$E5,' ','C','6','4',':','a','n',0
        EVEN
str_545:
        dc.b    'T','r','o',' ','a','t','t',' ','S','n','o','r','l','e','i','f'
        dc.b    's',' ','f',$E5,'r',' ','s','p','e','l','a',' ','p',$E5,' ','B'
        dc.b    'i','n','g','o','l','o','t','t','o',0
        EVEN
str_546:
        dc.b    'S','n','i','c','k','r','a',' ','e','n',' ','k','y','l','s','k'
        dc.b    $E5,'p','-','o','c','h','-','u','g','n','-','i','-','e','t','t'
        dc.b    0
        EVEN
str_547:
        dc.b    'V','i','k','a',' ','e','n',' ','d','a','t','o','r',' ','m','e'
        dc.b    'd',' ','o','r','i','g','a','m','i',0
        EVEN
str_548:
        dc.b    'A','n','v',$E4,'n','d','a',' ','s','m',$F6,'r',' ','s','o','m'
        dc.b    ' ','s','o','l','o','l','j','a',0
        EVEN
str_549:
        dc.b    'S','t','a','r','t','a',' ','e','n',' ','p','i','r','a','t','b'
        dc.b    'a','s',' ','o','c','h',' ','g',$F6,'r','a',' ','r','e','k','l'
        dc.b    'a','m',' ','f',$F6,'r',' ','d','e','n',' ','i',' ','t','e','x'
        dc.b    't','-','T','V',0
        EVEN
str_550:
        dc.b    'A','n','v',$E4,'n','d','a',' ','s','o','v','s',$E4,'c','k',' '
        dc.b    'o','c','h',' ','l','i','g','g','u','n','d','e','r','l','a','g'
        dc.b    ' ','i',' ','h','i','m','m','e','l','s','s',$E4,'n','g',0
        EVEN
str_551:
        dc.b    'S','k','y','l','l','a',' ','p',$E5,' ','k','a','l','l','a',' '
        dc.b    'c','y','k','e','l','s','t',$E4,'l','l',' ','n',$E4,'r',' ','m'
        dc.b    'a','n',' ','k','o','m','m','e','r',' ','f',$F6,'r','s','e','n'
        dc.b    't',' ','t','i','l','l',' ','l','e','k','t','i','o','n','e','r'
        dc.b    0
        EVEN
str_552:
        dc.b    'S','k','r','i','k','a',' ',$22,'s','t','o','r','m','v','a','r'
        dc.b    'n','i','n','g',$22,' ','v','a','r','j','e',' ','g',$E5,'n','g'
        dc.b    ' ','d','e','t',' ',$E4,'r',' ','v','i','n','d','s','t','i','l'
        dc.b    'l','a',0
        EVEN
str_553:
        dc.b    'K','o','n','k','u','r','r','e','r','a',' ','u','t',' ','e','-'
        dc.b    'm','a','i','l',' ','m','e','d',' ','k','-','m','a','i','l',0
        EVEN
str_554:
        dc.b    'A','n','v',$E4,'n','d','a',' ','s','i','n','a',' ','k','l',$E4
        dc.b    'd','e','r',' ','s','o','m',' ','k','u','d','d','e',' ','v','a'
        dc.b    'r','j','e',' ','g',$E5,'n','g',' ','m','a','n',' ','h',$E4,'l'
        dc.b    's','a','r',' ','p',$E5,' ','s','i','n',' ','m','o','r','b','r'
        dc.b    'o','r',0
        EVEN
str_555:
        dc.b    'S','i','l','a',' ','s','i','t','t',' ','b','l','o','d',' ','g'
        dc.b    'e','n','o','m',' ','k','a','f','f','e','f','i','l','t','e','r'
        dc.b    ' ','f',$F6,'r',' ','a','t','t',' ','f','i','l','t','r','e','r'
        dc.b    'a',' ','A','i','d','s','e','t',0
        EVEN
str_556:
        dc.b    'K','r',$E4,'v','a',' ','a','t','t',' ','s','i','n',' ','n','a'
        dc.b    'v','e','l','s','t','r',$E4,'n','g',' ','i','n','t','e',' ','s'
        dc.b    'k','a','l','l',' ','k','l','i','p','p','a','s',' ','a','v',' '
        dc.b    'f',$F6,'r',' ','a','t','t',' ','m','a','n',' ','s','k','a','l'
        dc.b    'l',' ','f',$E5,' ','u','t',' ','m','e','r',' ','a','v',' ','l'
        dc.b    'i','v','e','t',0
        EVEN
str_557:
        dc.b    'S','t',$E4,'l','l','a',' ','u','p','p',' ','s','o','m',' ','M'
        dc.b    'i','c','h','a','e','l',' ','J','a','c','k','s','o','n',' ','i'
        dc.b    ' ','S','m',$E5,'s','t','j',$E4,'r','n','o','r','n','a',0
        EVEN
str_558:
        dc.b    'S','t','a','r','t','a',' ','e','n',' ','s','k','y','t','t','e'
        dc.b    'k','l','u','b','b',' ','s','o','m',' ','h','e','t','e','r',' '
        dc.b    'S','i','k','t','a',' ','m','o','t',' ','S','t','j',$E4,'r','n'
        dc.b    'o','r','n','a',0
        EVEN
str_559:
        dc.b    'H','e','j','a',' ','p',$E5,' ','R','e','i','n','e',' ','i',' '
        dc.b    'T','r','e',' ','K','r','o','n','o','r',0
        EVEN
str_560:
        dc.b    'A','n','o','r','d','n','a',' ','l',$E5,'d','b','i','l','s','r'
        dc.b    'a','l','l','y',' ','f',$F6,'r',' ','e','j',' ','s','i','m','k'
        dc.b    'u','n','n','i','g','a',0
        EVEN
str_561:
        dc.b    'V','a','r','a',' ','l','a','m',' ','f','r',$E5,'n',' ','n','a'
        dc.b    'c','k','e','n',' ','o','c','h',' ','u','p','p',$E5,'t',0
        EVEN
str_562:
        dc.b    'A','n','s','t',$E4,'l','l','a',' ','f','r','i','l','a','n','s'
        dc.b    'j','o','u','r','n','a','l','i','s','t','e','r',' ','f',$F6,'r'
        dc.b    ' ','C','P','-','l','i','s','t','a','n',0
        EVEN
str_563:
        dc.b    'U','p','p','t',$E4,'c','k','a',' ','a','t','t',' ','e','n',' '
        dc.b    'l','j','u','s','m','i','l',' ',$E4,'r',' ','s',$E5,' ','l',$E5
        dc.b    'n','g','t',' ','s','o','m',' ','l','j','u','s','e','t',' ','g'
        dc.b    $E5,'r',' ','p',$E5,' ','e','n',' ','m','i','l',0
        EVEN
str_564:
        dc.b    'M','i','m','a',' ','t','i','l','l',' ','i','n','s','t','r','u'
        dc.b    'm','e','n','t','a','l',' ','m','u','s','i','k',0
        EVEN
str_565:
        dc.b    'S','p','e','l','a',' ','i','n',' ','b','o','o','t','l','e','g'
        dc.b    's',' ','i',' ','t','v',$E4,'t','t','s','t','u','g','o','r',0
        EVEN
str_566:
        dc.b    'S','a','m','p','l','a',' ','s','t','i','c','k','k','o','n','t'
        dc.b    'a','k','t','e','r',0
        EVEN
str_567:
        dc.b    'L','i','f','t','a',' ','m','e','d',' ','s','a','t','e','l','l'
        dc.b    'i','t','e','r',0
        EVEN
str_568:
        dc.b    'G','i','s','s','a',' ','s','i','n',' ','a','r','b','e','t','s'
        dc.b    't','i','d',' ','i','d','a','g',0
        EVEN
str_569:
        dc.b    'L',$E4,'r','a',' ','s','i','g',' ','C','P','-','l','i','s','t'
        dc.b    'a','n',' ','u','t','a','n','t','i','l','l',0
        EVEN
str_570:
        dc.b    'O','b','d','u','c','e','r','a',' ','s','i','g',' ','s','j',$E4
        dc.b    'l','v',0
        EVEN
str_571:
        dc.b    'V','a','r','a',' ','i','n','t','r','e','s','s','e','r','a','d'
        dc.b    ' ','a','v',' ','g','r',$F6,'n',0
        EVEN
str_572:
        dc.b    'F',$F6,'r','v','a','r','a',' ','s','i','n','a',' ','C','P','-'
        dc.b    'l','i','s','t','o','r',' ','i',' ','n','j','u','r','a','r','n'
        dc.b    'a',0
        EVEN
str_573:
        dc.b    'B','l','i',' ','s','k','e','d','s','l','u','k','a','r','e',' '
        dc.b    'i','s','t',$E4,'l','l','e','t',' ','f',$F6,'r',' ','s','v',$E4
        dc.b    'r','d','s','l','u','k','a','r','e',0
        EVEN
str_574:
        dc.b    'H','o','p','p','a',' ',$F6,'v','e','r',' ',$E5,'r','e','t','s'
        dc.b    ' ','T','e',' ','P','a','r','t','y',' ','f',$F6,'r',' ','k','r'
        dc.b    'e','t','s','m',$E4,'s','t','e','r','s','k','a','p',' ','i',' '
        dc.b    's','t','e','n',',',' ','s','a','x',',',' ','p',$E5,'s','e',0
        EVEN
str_575:
        dc.b    'N','u','k','a',' ','C','P','-','l','i','s','t','a','n',' ','p'
        dc.b    $E5,' ','I','n','s','t','a','n','t',' ','P','l','e','a','s','u'
        dc.b    'r','e',0
        EVEN
str_576:
        dc.b    'S','k',$F6,'l','j','a',' ','n','e','r',' ','A','n','t','a','b'
        dc.b    'u','s',' ','m','e','d',' ','b','r',$E4,'n','n','v','i','n',0
        EVEN
str_577:
        dc.b    'V','i','s','k','a',' ','n',$E4,'r',' ','m','a','n',' ','c','h'
        dc.b    'a','t','t','a','r',0
        EVEN
str_578:
        dc.b    'M','u','c','k','a',' ','m','e','d',' ','v','a','s','a','l','o'
        dc.b    'p','p','s',$E5,'k','a','r','e',0
        EVEN
str_579:
        dc.b    'S','k',$E4,'l','l','a',' ','u','t',' ','s','i','n','a',' ','m'
        dc.b    $F6,'b','l','e','r',0
        EVEN
str_580:
        dc.b    'G',$F6,'m','m','a',' ','e','n',' ','s','t','e','r','e','o',' '
        dc.b    'i',' ',$F6,'g','a','t',0
        EVEN
str_581:
        dc.b    $C5,'k','a',' ','p','u','l','k','a',' ','i',' ','u','p','p','f'
        dc.b    $F6,'r','s','b','a','c','k','a','r',0
        EVEN
str_582:
        dc.b    'F',$E5,' ','h','a','l','l','u','c','i','n','a','t','i','o','n'
        dc.b    'e','r',' ','a','v',' ','K','e','s','o',0
        EVEN
str_583:
        dc.b    'F',$F6,'r','v',$E4,'x','l','a',' ','b','l',$E5,'b',$E4,'r','s'
        dc.b    's','o','p','p','a',' ','m','e','d',' ','C','P','-','l','i','s'
        dc.b    't','a','n',0
        EVEN
str_584:
        dc.b    'P','l','a','n','k','a',' ','i','n',' ','p',$E5,' ','b','i','b'
        dc.b    'l','i','o','t','e','k','e','t',0
        EVEN
str_585:
        dc.b    'S','n','a','t','t','a',' ','l','a','r','m','a','n','o','r','d'
        dc.b    'n','i','n','g','a','r','n','a',' ','p',$E5,' ','K','a','p','p'
        dc.b    'a','h','l',0
        EVEN
str_586:
        dc.b    'S','l',$E4,'n','g','a',' ','n','y','a',' ','m',$F6,'b','l','e'
        dc.b    'r',0
        EVEN
str_587:
        dc.b    'L',$E5,'s','a',' ','i','n',' ','s','i','n','a',' ','k','o','m'
        dc.b    'p','i','s','a','r',' ','i',' ','g','a','r','d','e','r','o','b'
        dc.b    'e','n',0
        EVEN
str_588:
        dc.b    'K','a','s','t','a',' ','u','p','p',' ','g','r','a','n','n','e'
        dc.b    'n','s',' ','h','u','s','d','j','u','r',' ','i',' ','s','t','u'
        dc.b    'p','r',$E4,'n','n','a','n',0
        EVEN
str_589:
        dc.b    'K',$E4,'k','a',' ','u','p','p',' ','a','l','l','a',' ','s','p'
        dc.b    'e','l','k','o','r','t',' ','n',$E4,'r',' ','m','a','n',' ','s'
        dc.b    'p','e','l','a','r',' ','U','n','o',0
        EVEN
str_590:
        dc.b    'A','n','v',$E4,'n','d','a',' ','s','v','i','n','t','o',' ','s'
        dc.b    'o','m',' ','p','e','r','u','k',0
        EVEN
str_591:
        dc.b    'B','e','s','t',$E4,'l','l','a',' ','g','l','a','s','s',' ','m'
        dc.b    'e','d',' ','k','o','n','k','e','l','b',$E4,'r',' ','p',$E5,' '
        dc.b    'C','a','f',$E9,' ','O','p','e','r','a',0
        EVEN
str_592:
        dc.b    'S','p','e','l','a',' ','p','l','o','c','k','e','p','i','n','n'
        dc.b    ' ','n',$E4,'r',' ','d','e','t',' ',$E4,'r',' ','j','o','r','d'
        dc.b    'b',$E4,'v','n','i','n','g',0
        EVEN
str_593:
        dc.b    'B','l','i',' ','s',$E5,' ','l','e','d','s','e','n',' ','a','t'
        dc.b    't',' ','m','a','n',' ','g','r',$E5,'t','e','r',' ','r','a','b'
        dc.b    'a','t','t','k','u','p','o','n','g','e','r',' ','p',$E5,' ',$C5
        dc.b    'h','l','e','n','s',0
        EVEN
str_594:
        dc.b    'B','a','s','t','a',' ','m','e','d',' ','v',$E5,'t','d','r',$E4
        dc.b    'k','t',0
        EVEN
str_595:
        dc.b    'B','o','r','s','t','a',' ','t',$E4,'n','d','e','r','n','a',' '
        dc.b    'm','e','d',' ','v','a','s','e','l','i','n',0
        EVEN
str_596:
        dc.b    'K',$F6,'p','a',' ','s','i','n',' ','l','u','f','t','g','i','t'
        dc.b    'a','r','r',' ','p',$E5,' ','r','e','a',0
        EVEN
str_597:
        dc.b    'P','o','l','i','s','a','n','m',$E4,'l','a',' ','a','l','l','a'
        dc.b    ' ','f','u','l','a',' ','m','o','l','n',0
        EVEN
str_598:
        dc.b    'V','a','r','a',' ','a','l','l','e','r','g','i','s','k',' ','m'
        dc.b    'o','t',' ','a','l','l','t',' ','s','o','m',' ','r','i','m','m'
        dc.b    'a','r',' ','p',$E5,' ','k','o','r','v',0
        EVEN
str_599:
        dc.b    'A','n','v',$E4,'n','d','a',' ','b','r',$E4,'n','n','v','i','n'
        dc.b    ' ','s','o','m',' ','r','a','k','v','a','t','t','e','n',' ','n'
        dc.b    $E4,'r',' ','m','a','n',' ','g',$E5,'r',' ','p',$E5,' ','m',$F6
        dc.b    't','e',' ','m','e','d',' ','I','O','G','T','/','N','T','O',0
        EVEN
str_600:
        dc.b    'T','r','o',' ','a','t','t',' ','k','u','n','g','e','n',' ','k'
        dc.b    'a','n',' ','r',$E4,'k','n','a',' ','t','i','l','l',' ','2','8'
        dc.b    0
        EVEN
str_601:
        dc.b    'B','e','g',$E5,' ','s','j',$E4,'l','v','m','o','r','d',' ','g'
        dc.b    'e','n','o','m',' ','a','t','t',' ','d','r','i','c','k','a',' '
        dc.b    'i','h','j',$E4,'l',' ','s','i','g',' ','p',$E5,' ','l','a','x'
        dc.b    'e','r','m','e','d','e','l',0
        EVEN
str_602:
        dc.b    'R',$E5,'n','a',' ','s','y','s','t','e','m','b','o','l','a','g'
        dc.b    'e','t',' ','p',$E5,' ','k','a','s','s','a','n',' ','i','s','t'
        dc.b    $E4,'l','l','e','t',' ','f',$F6,'r',' ','s','p','r','i','t',0
        EVEN
str_603:
        dc.b    'H','o','p','p','a',' ','p',$E5,' ','d','a','t','a','s','p','e'
        dc.b    'l',' ','t','i','l','l',' ','f','i','l','m','t','r','e','n','d'
        dc.b    'e','n',' ','m','e','d',' ',$22,'P','a','t','i','e','n','s',' '
        dc.b    '-','t','h','e',' ','M','o','v','i','e',$22,0
        EVEN
str_604:
        dc.b    'S','k','y','l','l','a',' ','p',$E5,' ',$22,'g','u','b','b','s'
        dc.b    'j','u','k','a',$22,' ','n',$E4,'r',' ','m','a','n',' ','s','j'
        dc.b    'u','k','s','k','r','i','v','e','r',' ','s','i','g',0
        EVEN
str_605:
        dc.b    'S','p','e','l','a',' ','k','l',$E4,'d','p','o','k','e','r',' '
        dc.b    'm','e','d',' ','s','i','g',' ','s','j',$E4,'l','v',0
        EVEN
str_606:
        dc.b    $C4,'t','a',' ','k','v','i','s','t','a','r',' ','o','c','h',' '
        dc.b    'b','l','a','d',' ','p',$E5,' ','n','o','b','e','l','m','i','d'
        dc.b    'd','a','g','e','n',0
        EVEN
str_607:
        dc.b    'T','a','p','e','t','s','e','r','a',' ','p','e','p','p','a','r'
        dc.b    'k','a','k','s','h','u','s',0
        EVEN
str_608:
        dc.b    'I','n','f',$F6,'r','a',' ','h','j',$E4,'l','m','t','v',$E5,'n'
        dc.b    'g',' ','p',$E5,' ','m','e','l','o','d','i','f','e','s','t','i'
        dc.b    'v','a','l','e','n',0
        EVEN
str_609:
        dc.b    'O','m','y','n','d','i','g','f',$F6,'r','k','l','a','r','a',' '
        dc.b    'm','y','n','d','i','g','h','e','t','e','r',0
        EVEN
str_610:
        dc.b    'S',$F6,'k','a',' ','f','r','i','s','e','d','e','l',' ','i',' '
        dc.b    'l','u','m','p','e','n',' ','p','.','g','.','a','.',' ','h','e'
        dc.b    't','e','r','o','s','e','x','u','a','l','i','t','e','t',0
        EVEN
str_611:
        dc.b    'S','k','a','f','f','a',' ','b','a','c','k','s','t','a','g','e'
        dc.b    'p','a','s','s',' ','p',$E5,' ','B','o','r',$E5,'s',' ','d','j'
        dc.b    'u','r','p','a','r','k',0
        EVEN
str_612:
        dc.b    'K',$F6,'p','a',' ','s','i','n','a',' ','j','u','l','k','l','a'
        dc.b    'p','p','a','r',' ','p',$E5,' ','M','c','D','o','n','a','l','d'
        dc.b    's',0
        EVEN
str_613:
        dc.b    'L','u','k','t','a',' ','p',$E5,' ','B','j',$F6,'r','n',' ','B'
        dc.b    'o','r','g',' ','p','a','r','f','y','m',' ','i','n','n','a','n'
        dc.b    ' ','m','a','n',' ','s','p','e','l','a','r',' ','U','t',' ','R'
        dc.b    'u','n',' ','p',$E5,' ','c','6','4',0
        EVEN
str_614:
        dc.b    'S','p','e','l','a',' ',$F6,'l','s','p','e','l','e','t',' ','i'
        dc.b    ' ','f','y','l','l','e','c','e','l','l',0
        EVEN
str_615:
        dc.b    'T','i','l','l','v','e','r','k','a',' ','2','8','-','k','r','o'
        dc.b    'n','o','r','s',' ','s','e','d','l','a','r',' ','f',$F6,'r',' '
        dc.b    'a','t','t',' ','f',$F6,'r','e','n','k','l','a',' ','k',$F6,'n'
        dc.b    's','h','a','n','d','e','l','n',0
        EVEN
str_616:
        dc.b    'B',$F6,'g','a',' ','m','e','d',' ','t','j','e','j','e','r',0
        EVEN
str_617:
        dc.b    $C4,'t','a',' ','k','o','k','t',' ','s','u','s','h','i',0
        EVEN
str_618:
        dc.b    'F','a','x','a',' ','b','r','e','v','b','o','m','b','e','r',0
        EVEN
str_619:
        dc.b    'B','y','g','g','a',' ','e','n',' ','F','i','l','m','n','e','t'
        dc.b    ' ','d','e','k','o','d','e','r',' ','t','i','l','l',' ','s','i'
        dc.b    'n',' ','r','a','d','i','o',0
        EVEN
str_620:
        dc.b    'K',$F6,'p','a',' ','a','l','l','a',' ','s','i','n','a',' ','k'
        dc.b    'l',$E4,'d','e','r',' ','p',$E5,' ','G','i','n','z','a',' ','m'
        dc.b    'u','s','i','k',0
        EVEN
str_621:
        dc.b    $C5,'k','a',' ','s','k','r','i','d','s','k','o','r',' ','t','i'
        dc.b    'l','l',' ','j','o','b','b','e','t',0
        EVEN
str_622:
        dc.b    'K',$F6,'p','a',' ','s','i','n',' ','s','y','s','t','e','r','s'
        dc.b    ' ','k','l',$E4,'d','e','r',' ','p',$E5,' ','B','u','t','t','e'
        dc.b    'r','i','c','k',$27,'s',0
        EVEN
str_623:
        dc.b    'S','n','y','t','a',' ','s','i','g',' ','i',' ','p','u','n','g'
        dc.b    'e','n',0
        EVEN
str_624:
        dc.b    'V',$E5,'l','d','t','a',' ','s','i','g',' ','s','j',$E4,'l','v'
        dc.b    0
        EVEN
str_625:
        dc.b    'P','u','n','k','t','e','r','a',' ','c','y','k','e','l','k','e'
        dc.b    'd','j','o','r',0
        EVEN
str_626:
        dc.b    'U','t','m','a','n','a',' ','P',$E5,'v','e','n',' ','p',$E5,' '
        dc.b    'f','i','c','k','p','i','n','g','i','s',0
        EVEN
str_627:
        dc.b    'G',$F6,'r','a',' ','i','n','b','r','o','t','t',' ','h','o','s'
        dc.b    ' ','b','l','i','n','d','a',' ','f',$F6,'r',' ','a','t','t',' '
        dc.b    'm',$F6,'b','l','e','r','a',' ','o','m',' ','d','e','r','a','s'
        dc.b    ' ','h','u','s',0
        EVEN
str_628:
        dc.b    'K','i','d','n','a','p','p','a',' ','n',$E5,'g','o','n','s',' '
        dc.b    'p','e','n','g','a','r',' ','o','c','h',' ','k','r',$E4,'v','a'
        dc.b    ' ','l',$F6,'s','e','n','s','u','m','m','a',' ','f',$F6,'r',' '
        dc.b    'd','e','m',0
        EVEN
str_629:
        dc.b    'K','o','n','k','u','r','r','e','r','a',' ','m','e','d',' ','S'
        dc.b    'J',0
        EVEN
str_630:
        dc.b    'M','a','r','k','n','a','d','s','f',$F6,'r','a',' ','s','u','b'
        dc.b    'v','e','n','t','i','o','n','e','r','a','d','e',' ','f',$E5,'r'
        dc.b    's','k','i','n','n','s','f',$E4,'l','l',0
        EVEN
str_631:
        dc.b    'R','i','v','a','l','i','s','e','r','a',' ','m','e','d',' ','s'
        dc.b    'i','n',' ','f','a','r',' ','o','m',' ','s','i','n',' ','m','o'
        dc.b    'r',0
        EVEN
str_632:
        dc.b    'F','i','r','a',' ','n','y',$E5,'r',' ','i',' ','D','o','o','m'
        dc.b    0
        EVEN
str_633:
        dc.b    'K',$F6,'p','a',' ','p','e','n','g','a','r',' ','p',$E5,' ','F'
        dc.b    'o','r','e','x',0
        EVEN
str_634:
        dc.b    'S','p','r','i','n','g','a',' ','i',' ','p','r','o','m','e','n'
        dc.b    'a','d','s','t','a','k','t',0
        EVEN
str_635:
        dc.b    'F',$F6,'r','s',$F6,'r','j','a',' ','s','i','g',' ','p',$E5,' '
        dc.b    'a','t','t',' ','g',$F6,'r','a',' ','d','r','i','v','e','-','b'
        dc.b    'y',0
        EVEN
str_636:
        dc.b    'F','r',$E5,'g','a',' ','f','o','l','k',' ','v','a','d',' ','s'
        dc.b    'm',$F6,'r','e','t',' ','k','o','s','t','a','r',' ','v','a','r'
        dc.b    'j','e',' ','g',$E5,'n','g',' ','m','a','n',' ','m','i','s','s'
        dc.b    'a','r',' ','b','u','s','s','e','n',0
        EVEN
str_637:
        dc.b    $C4,'t','a',' ','f','o','l','k',' ','i','n','n','a','n',' ','m'
        dc.b    'a','n',' ','f','r',$E5,'g','a','r',0
        EVEN
str_638:
        dc.b    $C4,'t','a',' ','v','a','r','d','a','g','s','m','a','t',0
        EVEN
str_639:
        dc.b    'S','a','m','l','a',' ','p',$E5,' ','u','d','d','a',' ','h',$E4
        dc.b    's','t','a','r',0
        EVEN
str_640:
        dc.b    'T','y','c','k','a',' ','a','t','t',' ','d','e','t',' ',$E4,'r'
        dc.b    ' ','s','k','u','m','t',' ','a','t','t',' ','i','n','t','e',' '
        dc.b    'l','u','k','t','a',' ','f','i','s','k',0
        EVEN
str_641:
        dc.b    'S',$E4,'l','j','a',' ','L','S','D',' ','p',$E5,' ','m','o','g'
        dc.b    'e','n','d','a','n','s','e','r',0
        EVEN
str_642:
        dc.b    'M','u','c','k','a',' ','m','e','d',' ','s','n',$F6,0
        EVEN
str_643:
        dc.b    $C5,'k','a',' ','b','i','l',' ','f',$F6,'r',' ','a','t','t',' '
        dc.b    'l','y','s','s','n','a',' ','p',$E5,' ','r','a','d','i','o',0
        EVEN
str_644:
        dc.b    'B','o','m','b','h','o','t','a',' ','I','n','t','e','r','n','e'
        dc.b    't',0
        EVEN
str_645:
        dc.b    'A','n','v',$E4,'n','d','a',' ','b','a','m','b','a','m','a','t'
        dc.b    ' ','i',' ','k',$E4,'r','n','k','r','a','f','t','s','r','e','a'
        dc.b    'k','t','o','r','e','r',0
        EVEN
str_646:
        dc.b    'K',$F6,'p','a',' ','e','n',' ','O','S','/','2',' ','W','A','R'
        dc.b    'P',' ','t','r',$F6,'j','a',0
        EVEN
str_647:
        dc.b    'S','n','a','t','t','a',' ',$E4,'r','t','s','o','p','p','a',0
        EVEN
str_648:
        dc.b    'U','n','d','r','a',' ','v','e','m',' ','P','e','a','r','l',' '
        dc.b    'H','a','r','b','o','u','r',' ',$E4,'r',0
        EVEN
str_649:
        dc.b    'B','a','s','t','a',' ','m','e','d',' ','K','u','n','g','l','i'
        dc.b    'g','a',' ','K','a','m','m','a','r','o','r','k','e','s','t','e'
        dc.b    'r','n',0
        EVEN
str_650:
        dc.b    'S','l',$E4,'p','p','a',' ','a','s','c','i','i','-','c','o','l'
        dc.b    'l','e','c','t','i','o','n','s',' ','p',$E5,' ','p','a','p','p'
        dc.b    'e','r',0
        EVEN
str_651:
        dc.b    'A','n','o','r','d','n','a',' ','f','e','m','d','a','g','a','r'
        dc.b    's','k','r','y','s','s','n','i','n','g',' ','p',$E5,' ','t','i'
        dc.b    'p','s','e','x','t','r','a',0
        EVEN
str_652:
        dc.b    'F','e','j','k','a',' ','s','n','u','f','f','m','o','v','i','e'
        dc.b    's',0
        EVEN
str_653:
        dc.b    'B','y','g','g','a',' ','e','n',' ','j','o','n','i','s','e','r'
        dc.b    'i','n','g','s','k','a','n','o','n',' ','i',' ','t','r',$E4,'s'
        dc.b    'l',$F6,'j','d','e','n',0
        EVEN
str_654:
        dc.b    'T','r','o',' ','a','t','t',' ','d','e','t',' ',$E4,'r',' ','1'
        dc.b    '8','-',$E5,'r','s',' ','g','r',$E4,'n','s',' ','m','e','d',' '
        dc.b    'c','e','r','t','i','f','i','k','a','t','s','b','e','h',$F6,'r'
        dc.b    'i','g','h','e','t',' ','p',$E5,' ','f','r','i','t','i','d','s'
        dc.b    'g',$E5,'r','d','a','r',0
        EVEN
str_655:
        dc.b    'S','m','y','g','a',' ','i',' ','S','m',$F6,'g','e','n',0
        EVEN
str_656:
        dc.b    'H','o','p','p','a','s',' ','a','t','t',' ','f',$E5,' ','r','e'
        dc.b    'i','n','k','a','r','n','e','r','a',' ','i',' ','e','t','t',' '
        dc.b    'k','i','n','d','e','r',$E4,'g','g',0
        EVEN
str_657:
        dc.b    'F',$F6,'r','s',$F6,'k','a',' ','k','o','r','s','a',' ','s','i'
        dc.b    'n','a',' ','g','e','n','e','r',' ','m','e','d',' ','e','n',' '
        dc.b    'k','a','k','t','u','s',0
        EVEN
str_658:
        dc.b    'S','w','a','p','p','a',' ','a','s','c','i','i','-','c','o','l'
        dc.b    'l','e','c','t','i','o','n','s',' ','a','v',' ','s','n',$F6,0
        EVEN
str_659:
        dc.b    'F',$F6,'r','s',$F6,'k','a',' ','s',$E4,'l','j','a',' ','s','i'
        dc.b    't','t',' ','k',$F6,'n','s','o','r','g','a','n',' ','s','o','m'
        dc.b    ' ','k','y','l','s','k',$E5,'p','s','m','a','g','n','e','t',0
        EVEN
str_660:
        dc.b    'B','e','t','a','l','a',' ','f',$F6,'r',' ','a','t','t',' ','f'
        dc.b    $E5,' ','s','i','n',' ','p','u','n','g',' ','a','v','s','u','g'
        dc.b    'e','n',0
        EVEN
str_661:
        dc.b    'G',$F6,'r','a',' ','i','n','b','r','o','t','t',' ','i',' ','T'
        dc.b    'r','o','l','l','h',$E4,'t','t','a','n',0
        EVEN
str_662:
        dc.b    $C5,'k','a',' ','s','n','o','w','b','o','a','r','d',' ','p',$E5
        dc.b    ' ','I','n','t','e','r','n','e','t',0
        EVEN
str_663:
        dc.b    'A','n','o','r','d','n','a',' ','p','r','o','t','e','s','t','m'
        dc.b    'a','r','s','c','h','e','r',' ','m','o','t',' ','s','k','a','v'
        dc.b    's',$E5,'r',0
        EVEN
str_664:
        dc.b    'S',$E4,'l','j','a',' ','s','i','n',' ','s','t','j',$E4,'r','t'
        dc.b    ' ','t','i','l','l',' ','d','j',$E4,'v','u','l','e','n',0
        EVEN
str_665:
        dc.b    'A','n','v',$E4,'n','d','a',' ','C','P','-','l','i','s','t','a'
        dc.b    'n',' ','3','6','5',' ','s','o','m',' ','a','l','m','a','n','a'
        dc.b    'c','k','a',0
        EVEN
str_666:
        dc.b    'F',$F6,'d','a',' ','u','p','p',' ','d',$F6,'d','a',' ','f',$E5
        dc.b    'r',' ','a','v',' ','k','l',$E4,'d','e','r',0
        EVEN
str_667:
        dc.b    'F',$E4,'l','l','a',' ','u','p','p',' ','b','i','l','s','t','o'
        dc.b    'l','a','r',' ','m','e','d',' ','e','n',' ','g','a','m','m','a'
        dc.b    'l',' ','b','a','n','d','s','p','e','l','a','r','e',0
        EVEN
str_668:
        dc.b    'B','l','i',' ','e','n',' ','k','i','o','s','k','v',$E4,'l','t'
        dc.b    'a','r','e',0
        EVEN
str_669:
        dc.b    'S',$E4,'l','j','a',' ','s','i','n','a',' ','p','l',$E5,'s','t'
        dc.b    'e','r',' ','p',$E5,' ','s','t','a','n',' ','s','o','m',' ','p'
        dc.b    'o','s','t','e','r',0
        EVEN
str_670:
        dc.b    'S','t','a','r','t','a',' ','e','n',' ','T','V','-','s','e','r'
        dc.b    'i','e',' ','s','o','m',' ','h','e','t','e','r',' ','A','r','k'
        dc.b    'i','v','-','K',' ','s','o','m',' ','h','a','n','d','l','a','r'
        dc.b    ' ','o','m',' ','m','u','t','e','r','a','d','e',' ','p','e','n'
        dc.b    'i','s','a','r',0
        EVEN
str_671:
        dc.b    'B','e','s','t',$E4,'l','l','a',' ',$22,'d','e','t',' ','v','a'
        dc.b    'n','l','i','g','a',$22,' ','p',$E5,' ','I','C','A',0
        EVEN
str_672:
        dc.b    'F',$E5,' ','c','h','e','c','k','s','u','m',' ','e','r','r','o'
        dc.b    'r',' ','p',$E5,' ','R','A','M','-','d','i','s','k','e','n',0
        EVEN
str_673:
        dc.b    'L','e','t','a',' ','e','f','t','e','r',' ','s','i','n',' ','e'
        dc.b    'g','e','n',' ','K','-','p','u','n','k','t',0
        EVEN
str_674:
        dc.b    'B','e','s','t',$E4,'l','l','a',' ','e','n',' ','v','a','r','m'
        dc.b    ' ','i','s','v','a','t','t','e','n',' ','p',$E5,' ','K','r','i'
        dc.b    'c','k','e','l','i','n',' ','i',' ','L','i','d','k',$F6,'p','i'
        dc.b    'n','g',0
        EVEN
str_675:
        dc.b    'N','o','m','i','n','e','r','a',' ','T','h','e',' ','P','i','n'
        dc.b    'k','s',' ','s','o','m',' ','b',$E4,'s','t','a',' ','n','y','k'
        dc.b    'o','m','l','i','n','g','a','r',' ','i',' ','G','r','a','m','m'
        dc.b    'i','s','g','a','l','a','n',' ','1','9','9','6',0
        EVEN
str_676:
        dc.b    $C4,'t','a',' ','b','a','n','a','n',' ','o','f','f','e','n','t'
        dc.b    'l','i','g','t',0
        EVEN
str_677:
        dc.b    'B','j','u','d','a',' ','u','p','p',' ','p',$E5,' ','s','y','n'
        dc.b    't','h','d','i','s','c','o',0
        EVEN
str_678:
        dc.b    'B','y','g','g','a',' ','e','n',' ','k','l','a','v','i','a','t'
        dc.b    'u','r',' ','t','i','l','l',' ','e','n',' ','l','j','u','s','o'
        dc.b    'r','g','e','l',0
        EVEN
str_679:
        dc.b    'S','l',$E4,'p','p','a',' ','l','a','g','l','i','g','a',' ','b'
        dc.b    'o','o','t','l','e','g','s',0
        EVEN
str_680:
        dc.b    'T','r','o',' ','a','t','t',' ','h',$E4,'s','t','a','r',' ',$E4
        dc.b    'r',' ','m','i','n','e','r','a','l','e','r',0
        EVEN
str_681:
        dc.b    'K',$F6,'p','a',' ','s','v','a','r','t','/','v','i','t','a',' '
        dc.b    'v','i','d','e','o','b','a','n','d',' ','p',$E5,' ','H','o','b'
        dc.b    'b','e','x',0
        EVEN
str_682:
        dc.b    'T','r','o',' ','a','t','t',' ','G','u','d',' ',$E4,'r',' ','m'
        dc.b    'o','t','s','a','t','s','e','n',' ','t','i','l','l',' ','b','l'
        dc.b    $E5,0
        EVEN
str_683:
        dc.b    'V','a','r','a',' ','b','l','i','n','d',' ','o','c','h',' ','m'
        dc.b    $F6,'r','k','r',$E4,'d','d',0
        EVEN
str_684:
        dc.b    'R','a','s','t','a',' ','s','i','n',' ','k','a','n','a','r','i'
        dc.b    'e','f',$E5,'g','e','l',0
        EVEN
str_685:
        dc.b    'R',$E4,'k','n','a',' ','a','v','s','t',$E5,'n','d',' ','i',' '
        dc.b    's','k','o','s','n',$F6,'r','e','n',0
        EVEN
str_686:
        dc.b    'T','i','l','l','v','e','r','k','a',' ','t','o','r','r','v','a'
        dc.b    't','t','e','n',' ','s','o','m',' ','s','p',$E4,'d','s',' ','u'
        dc.b    't',' ','m','e','d',' ','m','j',$F6,'l','k',0
        EVEN
str_687:
        dc.b    'S',$E4,'l','j','a',' ','v','y','k','o','r','t',' ','m','e','d'
        dc.b    ' ','h',$E4,'g','r','i','n','g','a','r',0
        EVEN
str_688:
        dc.b    'B','y','g','g','a',' ','m','u','l','t','i','t','a','s','k','a'
        dc.b    'n','d','e',' ','l','j','u','d','k','o','r','t',0
        EVEN
str_689:
        dc.b    'S',$E4,'t','t','a',' ','s','t',$F6,'d','h','j','u','l',' ','p'
        dc.b    $E5,' ','s','i','n',' ','b','i','l',' ','n',$E4,'r',' ','m','a'
        dc.b    'n',' ',$F6,'v','n','i','n','g','s','k',$F6,'r',0
        EVEN
str_690:
        dc.b    'G',$E5,' ','o','b','e','v',$E4,'p','n','a','d',' ','t','i','l'
        dc.b    'l',' ','K','o','n','s','u','m',0
        EVEN
str_691:
        dc.b    'V','r','i','d','a',' ','s','i','g',' ','i',' ','p','l',$E5,'g'
        dc.b    'o','r',' ','n',$E4,'r',' ','m','a','n',' ','k','a','m','m','a'
        dc.b    'r',' ','s','i','g',0
        EVEN
str_692:
        dc.b    $D6,'p','p','n','a',' ','e','n',' ','s','e','c','o','n','d','h'
        dc.b    'a','n','d',' ','m','a','t','a','f','f',$E4,'r',0
        EVEN
str_693:
        dc.b    'K',$F6,'p','a',' ','s','i','n','a',' ','m','i','n','n','e','s'
        dc.b    'c','h','i','p','s',' ','h','o','s',' ','E','s','t','r','e','l'
        dc.b    'l','a',0
        EVEN
str_694:
        dc.b    'T','r','i','m','m','a',' ','A','h','l','g','r','e','n','s',' '
        dc.b    'b','i','l','a','r',0
        EVEN
str_695:
        dc.b    'K','o','n','k','u','r','r','e','r','a',' ','u','t',' ','G','a'
        dc.b    'y','g','a','m','e','s',' ','m','e','d',' ','s','i','t','t',' '
        dc.b    'e','g','e','t',' ','H','e','t','e','r','o','g','a','m','e','s'
        dc.b    0
        EVEN
str_696:
        dc.b    'T','y','c','k','a',' ','a','t','t',' ','d','e','t',' ',$E4,'r'
        dc.b    ' ','t','r',$E5,'k','i','g','t',' ','n',$E4,'r',' ','d','e','t'
        dc.b    ' ',$E4,'r',' ','r','o','l','i','g','t',' ','m','e','d',' ','i'
        dc.b    'n','t','e',' ','t','v',$E4,'r','t','o','m',0
        EVEN
str_697:
        dc.b    'O','n','a','n','e','r','a',' ','s','t',$E5,'e','n','d','e','s'
        dc.b    ' ','p',$E5,' ','h',$E4,'n','d','e','r',0
        EVEN
str_698:
        dc.b    'K',$F6,'p','a',' ','m','i','n','n','e','s','c','h','i','p','s'
        dc.b    ' ','f','r',$E5,'n',' ','E','s','t','r','e','l','l','a',0
        EVEN
str_699:
        dc.b    'S','t','j',$E4,'l','a',' ','e','n',' ','b','i','l',' ','o','c'
        dc.b    'h',' ','c','y','k','l','a',' ','t','i','l','l',' ','j','o','b'
        dc.b    'b','e','t',0
        EVEN
str_700:
        dc.b    'S','a','m','l','a',' ','p',$E5,' ','s','m',$E5,'l','a','n','d'
        dc.b    's','s','t','e','n','a','r',0
        EVEN
str_701:
        dc.b    'S',$E4,'t','t','a',' ','i','n',' ','k','o','n','t','a','k','t'
        dc.b    'a','n','n','o','n','s','e','r',' ','i',' ','g','u','l','a',' '
        dc.b    't','i','d','n','i','n','g','e','n',' ','u','n','d','e','r',' '
        dc.b    $22,'H','e','m','m','a','f','r','u','a','r',' ','k',$F6,'p','e'
        dc.b    's',$22,0
        EVEN
str_702:
        dc.b    'B','l',$E5,'s','a',' ','u','p','p',' ','d',$F6,'d','a',' ','f'
        dc.b    $E5,'g','l','a','r',' ','m','e','d',' ','h','e','l','i','u','m'
        dc.b    0
        EVEN
str_703:
        dc.b    'S','p','a','r','a',' ','s','i','n','a',' ','f','i','n','n','a'
        dc.b    'r',' ','t','i','l','l',' ','j','u','l','a','f','t','o','n',0
        EVEN
str_704:
        dc.b    $D6,'v','e','r','s',$E4,'t','t','a',' ','C','P','-','l','i','s'
        dc.b    't','a','n',' ','t','i','l','l',' ','b','l','i','n','d','s','k'
        dc.b    'r','i','f','t',0
        EVEN
str_705:
        dc.b    'S','t','o','r','m','t','r','i','v','a','s',' ','p',$E5,' ','h'
        dc.b    'e','r','r','t','o','a','l','e','t','t','e','n',0
        EVEN
str_706:
        dc.b    'F',$F6,'r','v',$E4,'x','l','a',' ','k','o','f','f','e','i','n'
        dc.b    't','a','b','l','e','t','t','e','r',' ','m','e','d',' ','v','a'
        dc.b    'l','i','u','m',0
        EVEN
str_707:
        dc.b    'G','i','f','t','a',' ','s','i','g',' ','f',$F6,'r',' ','s','t'
        dc.b    'u','n','d','e','n',0
        EVEN
str_708:
        dc.b    'K',$F6,'p','a',' ','e','t','t',' ','p','a','r','t','i',' ','d'
        dc.b    $F6,'r','r','a','r',' ','o','c','h',' ','b','l','i',' ','d',$F6
        dc.b    'r','r','k','n','a','c','k','a','r','e',0
        EVEN
str_709:
        dc.b    'B','e','t','a','l','a',' ','m','e','d',' ','m','o','r','o','t'
        dc.b    's','s','l','a','n','t','a','r',0
        EVEN
str_710:
        dc.b    'T','r','o',' ','a','t','t',' ','m','a','n',' ',$E4,'r',' ','g'
        dc.b    'y','n','e','k','o','l','o','g',0
        EVEN
str_711:
        dc.b    'F',$F6,'r','s',$F6,'k','a',' ','l','i','f','t','a',' ','m','e'
        dc.b    'd',' ','e','n',' ','t','a','x','i',0
        EVEN
str_712:
        dc.b    'S','j','u','k','s','k','r','i','v','a',' ','s','i','g',' ','p'
        dc.b    '.','g','.','a','.',' ','m','j',$E4,'l','l',0
        EVEN
str_713:
        dc.b    'V','a','r','a',' ','l','i','v','r',$E4,'d','d',' ','f',$F6,'r'
        dc.b    ' ','m',$F6,'r','d','a','r','s','n','i','g','l','a','r',0
        EVEN
str_714:
        dc.b    'T','r','o',' ','a','t','t',' ','h','a','s','a','r','d','s','p'
        dc.b    'e','l',' ',$E4,'r',' ','e','t','t',' ','m','u','s','i','k','i'
        dc.b    'n','s','t','r','u','m','e','n','t',0
        EVEN
str_715:
        dc.b    'H',$E4,'n','v','i','s','a',' ','t','i','l','l',' ','a','l','l'
        dc.b    'e','m','a','n','s','r',$E4,'t','t','e','n',' ','o','m',' ','m'
        dc.b    'a','n',' ',$E5,'k','e','r',' ','f','a','s','t',' ','f',$F6,'r'
        dc.b    ' ','s','n','a','t','t','e','r','i',0
        EVEN
str_716:
        dc.b    'F',$F6,'r','s',$E4,'k','r','a',' ','s','i','n','a',' ','s','t'
        dc.b    'r','u','m','p','o','r',0
        EVEN
str_717:
        dc.b    'G',$F6,'m','m','a',' ','p',$E5,'s','k',$E4,'g','g',' ','p',$E5
        dc.b    ' ','g','o','l','f','b','a','n','o','r',0
        EVEN
str_718:
        dc.b    'T','a',' ','m','e','d',' ','s','i','g',' ','e','n',' ','f','r'
        dc.b    'e','e','s','t','y','l','e',' ','m','e','d',' ','e','n',' ','M'
        dc.b    'i','c','h','a','e','l',' ','J','a','c','k','s','o','n',' ','k'
        dc.b    'a','s','s','e','t','t',' ','t','i','l','l',' ','e','n',' ',$F6
        dc.b    'd','e',' ',$F6,0
        EVEN
str_719:
        dc.b    'L','e','d','a',' ','c','y','k','l','a','r',' ','i',' ','n','e'
        dc.b    'd','f',$F6,'r','s','b','a','c','k','a','r',0
        EVEN
str_720:
        dc.b    'R','e','i','n','k','a','r','n','e','r','a',' ','s','o','m',' '
        dc.b    'k','l','o','c','k','a',0
        EVEN
str_721:
        dc.b    'B','e','t','a','l','a',' ','m','e','d',' ','r','i','k','s','k'
        dc.b    'u','p','o','n','g','e','r',' ','v','i','d',' ','p','u','n','g'
        dc.b    's','u','g','n','i','n','g',0
        EVEN
str_722:
        dc.b    'P','l','a','n','e','r','a',' ','s','i','n',' ','l','o','g','o'
        dc.b    'r','r','e',$27,0
        EVEN
str_723:
        dc.b    'S',$E4,'t','t','a',' ','e','n',' ','m','i','s','t','l','u','r'
        dc.b    ' ','p',$E5,' ','s','i','n',' ','b','i','l',0
        EVEN
str_724:
        dc.b    'U','p','p','g','r','a','d','e','r','a',' ','s','i','n',' ','i'
        dc.b    'n','t','e','r','n','a','l',' ','s','p','e','a','k','e','r',0
        EVEN
str_725:
        dc.b    'T','r','i','m','m','a',' ','s','i','n',' ','k','l','o','c','k'
        dc.b    'a',' ','s',$E5,' ','a','t','t',' ','m','a','n',' ','t','j',$E4
        dc.b    'n','a','r',' ','t','i','d',0
        EVEN
str_726:
        dc.b    'T','r','o',' ','a','t','t',' ','g','u','d',' ','u','p','p','f'
        dc.b    'a','n','n',' ','c','y','k','e','l','h','j',$E4,'l','m','e','n'
        dc.b    0
        EVEN
str_727:
        dc.b    'P','r','o','v','a',' ','e','l','e','k','t','r','i','s','k','a'
        dc.b    ' ','s','t','o','l','e','n',0
        EVEN
str_728:
        dc.b    'S',$E4,'t','t','a',' ','p',$E5,' ','T','V','-','n',' ','i','s'
        dc.b    't',$E4,'l','l','e','t',' ','f',$F6,'r',' ','f','r','u','g','a'
        dc.b    'n',0
        EVEN
str_729:
        dc.b    'K','r','o','c','k','a',' ','p',$E5,' ','s','k','o','j',0
        EVEN
str_730:
        dc.b    'R',$E4,'c','k','a',' ','u','p','p',' ','h','a','n','d','e','n'
        dc.b    ' ','p',$E5,' ','l','e','k','t','i','o','n','e','r',' ','f',$F6
        dc.b    'r',' ','a','t','t',' ','t','a','l','a',' ','o','m',' ','a','t'
        dc.b    't',' ','m','a','n',' ','i','n','t','e',' ','k','a','n',' ','s'
        dc.b    'v','a','r','a',0
        EVEN
str_731:
        dc.b    'S',$E4,'t','t','a',' ','i','n',' ','e','n',' ','g','i','g','a'
        dc.b    'n','t','i','s','k',' ','r',$F6,'k','m','a','s','k','i','n',' '
        dc.b    'i',' ','b','a','k','s',$E4,'t','e','t',' ','i',' ','s','i','n'
        dc.b    ' ','b','i','l',0
        EVEN
str_732:
        dc.b    'G',$F6,'r','a',' ','a','k','v','a','r','e','l','l','m',$E5,'l'
        dc.b    'n','i','n','g','a','r',' ','p',$E5,' ','b','o','t','t','e','n'
        dc.b    ' ','i',' ','s','i','t','t',' ','l','o','k','a','l','a',' ','b'
        dc.b    'a','d','h','u','s',0
        EVEN
str_733:
        dc.b    'B','o','t','a',' ','s','v','a','r','t','s','j','u','k','a',' '
        dc.b    'm','e','d',' ','p','e','n','i','c','i','l','l','i','n',0
        EVEN
str_734:
        dc.b    'K','o','p','i','e','r','a',' ','v','i','k','t','i','g','a',' '
        dc.b    'd','o','k','u','m','e','n','t',' ','m','e','d',' ','e','n',' '
        dc.b    'd','o','k','u','m','e','n','t','f',$F6,'r','s','t',$F6,'r','a'
        dc.b    'r','e',0
        EVEN
str_735:
        dc.b    'T','r','a','d','a',' ','v','o','i','c','e',0
        EVEN
str_736:
        dc.b    'S','k','r','u','v','a',' ','f','a','s','t',' ','b','r',$E4,'n'
        dc.b    'n','m','a','n','e','t','e','r',' ','p',$E5,' ','m','u','s','m'
        dc.b    'a','t','t','o','r',0
        EVEN
str_737:
        dc.b    'F',$E4,'r','g','a',' ','h',$E5,'r','e','t',' ','t','i','l','l'
        dc.b    ' ','s','a','m','m','a',' ','f',$E4,'r','g',' ','s','o','m',' '
        dc.b    'm','a','n',' ','r','e','d','a','n',' ','h','a','r',0
        EVEN
str_738:
        dc.b    'T','r','o','t','s','a',' ','t','y','n','g','d','l','a','g','e'
        dc.b    'n',0
        EVEN
str_739:
        dc.b    'P','i','x','l','a',' ','s','i','n','a',' ','u','p','p','s','a'
        dc.b    't','s','e','r',0
        EVEN
str_740:
        dc.b    'V','a','r','a',' ','n','y','k','t','e','r',' ','p',$E5,' ','a'
        dc.b    'n','s','t',$E4,'l','l','n','i','n','g','s','i','n','t','e','r'
        dc.b    'v','j','u','e','r',0
        EVEN
str_741:
        dc.b    'G','l',$F6,'m','m','a',' ','a','t','t',' ','b','y','t','a',' '
        dc.b    'b','a','t','t','e','r','i','e','r',' ','t','i','l','l',' ','s'
        dc.b    'i','n',' ','B','a','t','h','a','n','d','l','e',0
        EVEN
str_742:
        dc.b    'S','l','a','d','d','a',' ','m','e','d',' ','h',$E5,'r','d','d'
        dc.b    'i','s','k','e','n',0
        EVEN
str_743:
        dc.b    'H','i','t','t','a',' ','p',$E5,' ','l','j','u','d','e','f','f'
        dc.b    'e','k','t','e','r',' ','t','i','l','l',' ','a','l','l','t',' '
        dc.b    'm','a','n',' ','g',$F6,'r',0
        EVEN
str_744:
        dc.b    'S','p','e','l','a',' ','u','p','p',' ','s','i','n','a',' ','p'
        dc.b    'e','n','g','a','r',' ','p',$E5,' ','R','y','s','k',' ','R','o'
        dc.b    'u','l','e','t','t','e',' ','s',$E5,' ','f','o','r','t',' ','m'
        dc.b    'a','n',' ','r',$E5,'k','a','r',' ','b','l','i',' ','f','u','l'
        dc.b    'l',0
        EVEN
str_745:
        dc.b    'T','a',' ','a','v',' ','t','u','g','g','u','m','m','i','p','a'
        dc.b    'p','p','r','e','t',' ','e','f','t','e','r',' ','m','a','n',' '
        dc.b    'h','a','r',' ','t','u','g','g','a','t',' ','k','l','a','r','t'
        dc.b    ' ','t','u','g','g','u','m','m','i','t',0
        EVEN
str_746:
        dc.b    'T','y','c','k','a',' ','a','t','t',' ','d','e','t',' ',$E4,'r'
        dc.b    ' ','i','n','t','r','e','s','s','a','n','t',' ','m','e','d',' '
        dc.b    'v',$E4,'g','a','r','b','e','t','e','n',0
        EVEN
str_747:
        dc.b    'P','e','p','p','r','a',' ','s','i','n','a',' ','v','i','n','y'
        dc.b    'l','s','k','i','v','o','r',' ','f',$F6,'r',' ','a','t','t',' '
        dc.b    'f',$E5,' ','e','t','t',' ','s','t','a','r','k','a','r','e',' '
        dc.b    'l','j','u','d',0
        EVEN
str_748:
        dc.b    'S','l','i','p','a',' ','t','i','l','l',' ','b','i','l','d','r'
        dc.b    $F6,'r','e','n',' ','i',' ','s','i','n',' ','T','V',0
        EVEN
str_749:
        dc.b    'B','l','i','r',' ','o','r','n','i','t','o','l','o','g',',',' '
        dc.b    's','p','e','c','i','a','l','i','s','e','r','a','d',' ','p',$E5
        dc.b    ' ','j','u','m','b','o','j','e','t','t','a','r',0
        EVEN
str_750:
        dc.b    'T','r','o',' ','a','t','t',' ','f',$E5,'r',' ','d','a','n','s'
        dc.b    'a','r',' ','b','r',$E4,'k','d','a','n','c','e',0
        EVEN
str_751:
        dc.b    'K',$F6,'p','a',' ','f',$E4,'r','g','s','k','r','i','v','a','r'
        dc.b    'e',' ','t','i','l','l',' ','A','B','C','8','0',' ','(','m','o'
        dc.b    'n','o','k','r','o','m',' ','m','a','s','k','i','n',')',0
        EVEN
str_752:
        dc.b    'M','e','d','b','r','i','n','g','a',' ','s','k','r','i','d','s'
        dc.b    'k','o','r',' ','t','i','l','l',' ','I','c','i','n','g',0
        EVEN
str_753:
        dc.b    'P','i','m','p','l','a',' ','i',' ','i','s','h','a','l','l','a'
        dc.b    'r',0
        EVEN
str_754:
        dc.b    $C4,'t','a',' ','s','c','o','n','e','s',' ','m','e','d',' ','s'
        dc.b    'm',$F6,'r',0
        EVEN
str_755:
        dc.b    'F','r',$E5,'g','a',' ','D','j',' ','C','a','t',' ','i','f','a'
        dc.b    'l','l',' ','h','a','n',' ','h','a','r',' ','p','o','r','r',0
        EVEN
str_756:
        dc.b    'R','u','l','l','a',' ','n','e','r','f',$F6,'r',' ','t','r','a'
        dc.b    'p','p','o','r',' ','f',$F6,'r',' ','a','t','t',' ','s','p','a'
        dc.b    'r','a',' ','t','i','d',0
        EVEN
str_757:
        dc.b    'G',$F6,'r','a',' ','i','n','b','r','o','t','t',' ','i',' ','s'
        dc.b    'k','o','l','a','n',' ','o','m',' ','m','a','n',' ','g','l',$F6
        dc.b    'm','t',' ','b',$F6,'c','k','e','r','n','a',0
        EVEN
str_758:
        dc.b    'I','n','s','t','a','l','l','e','r','a',' ','s','n','a','t','t'
        dc.b    'e','r','i','l','a','r','m',' ','i',' ','s','i','t','t',' ','h'
        dc.b    'u','s',' ','o','c','h',' ','m',$E4,'r','k','a',' ','s','i','n'
        dc.b    'a',' ','m',$F6,'b','l','e','r',0
        EVEN
str_759:
        dc.b    'S','p','r','i','n','g','a',' ','p',$E5,' ','b','o','r','d','e'
        dc.b    'n',' ','o','c','h',' ','h','o','p','p','a',' ','h',$E4,'c','k'
        dc.b    ' ',$F6,'v','e','r',' ','d','a','t','o','r','e','r','n','a',' '
        dc.b    'p',$E5,' ','d','e','m','o','p','a','r','t','y',0
        EVEN
str_760:
        dc.b    'R','i','n','g','m',$E4,'r','k','a',' ','s','i','n','a',' ','b'
        dc.b    'a','r','n',',',' ','s',$E5,' ','m','a','n',' ','v','e','t',' '
        dc.b    'v','a','r',' ','d','o','m',' ',$E4,'r',0
        EVEN
str_761:
        dc.b    'R','i','n','g','m',$E4,'r','k','a',' ','s','i','g',' ','s','j'
        dc.b    $E4,'l','v',',',' ','s',$E5,' ','m','a','n',' ','i','n','t','e'
        dc.b    ' ','g',$E5,'r',' ','v','i','l','s','e',0
        EVEN
str_762:
        dc.b    'B','l','i',' ','b',$E4,'s','t','a',' ','v',$E4,'n',' ','m','e'
        dc.b    'd',' ','K','E','N','N','E','T','H',0
        EVEN
str_763:
        dc.b    'K','l',$E4,' ','u','t',' ','s','i','g',' ','t','i','l','l',' '
        dc.b    'f',$E5,'r',' ','f',$F6,'r',' ','a','t','t',' ','l','o','c','k'
        dc.b    'a',' ','t','i','l','l',' ','s','i','g',' ','s','i','n',' ','f'
        dc.b    'r','u',0
        EVEN
str_764:
        dc.b    'V','a','l','l','a',' ','s','i','n','a',' ','b','a','r','n',' '
        dc.b    'v','i','d',' ','h',$F6,'s','t',' ','o','c','h',' ','v',$E5,'r'
        dc.b    0
        EVEN
str_765:
        dc.b    'G',$F6,'m','m','a',' ','s','i','g',' ','f',$F6,'r',' ','k','y'
        dc.b    'p','a','r','e','n',0
        EVEN
str_766:
        dc.b    'G',$F6,'r','a',' ',$22,'p','l','o','p','p',$22,' ','p',$E5,' '
        dc.b    'a','n','d','r','a','s',' ','b','i','l','d','s','k',$E4,'r','m'
        dc.b    'a','r',0
        EVEN
str_767:
        dc.b    'T','r','o',' ','a','t','t',' ','h','u','n','d','a','r',' ',$E4
        dc.b    'r',' ','t','y','s','t','l',$E5,'t','n','a',' ','m',$E4,'n','n'
        dc.b    'i','s','k','o','r',0
        EVEN
str_768:
        dc.b    'L',$E5,'n','a',' ','u','t',' ','s','i','n',' ','b','i','l',' '
        dc.b    't','i','l','l',' ','U','l','f',0
        EVEN
str_769:
        dc.b    'S','k','a','f','f','a',' ','V','.','I','.','P',' ','k','o','r'
        dc.b    't',' ','p',$E5,' ','a','r','b','e','t','s','f',$F6,'r','m','e'
        dc.b    'd','l','i','n','g','e','n',0
        EVEN
str_770:
        dc.b    'G',$F6,'r','a',' ','e','n',' ','d','r','i','v','e','-','b','y'
        dc.b    ' ','m','e','d',' ','l','o','k','a','l','b','u','s','s','e','n'
        dc.b    0
        EVEN
str_771:
        dc.b    'F','i','s','k','a',' ','s',$E4,'l','a','r',0
        EVEN
str_772:
        dc.b    'K','a','p','a',' ','I','n','t','e','r','n','e','t',' ','m','e'
        dc.b    'd',' ','e','n',' ','A','B','C','8','0',0
        EVEN
str_773:
        dc.b    'B','i','t','a',' ','b','o','r','t',' ','s','i','n','a',' ','f'
        dc.b    $F6,'d','e','l','s','e','m',$E4,'r','k','e','n',' ','f','r',$E5
        dc.b    'n',' ','r','y','g','g','e','n',0
        EVEN
str_774:
        dc.b    'B','e','g',$E5,' ','s','j',$E4,'l','v','m','o','r','d',' ','g'
        dc.b    'e','n','o','m',' ','a','t','t',' ','h',$E4,'n','g','a',' ','s'
        dc.b    'i','g',' ','m','e','d',' ','e','t','t',' ','k','a','f','f','e'
        dc.b    'r','e','p',0
        EVEN
str_775:
        dc.b    'S','v',$E4,'l','j','a',' ','b','r','u','s','t','a','b','l','e'
        dc.b    't','t','e','r',0
        EVEN
str_776:
        dc.b    'S','k','i','c','k','a',' ','b','r','e','v',' ','t','i','l','l'
        dc.b    ' ','s','i','n',' ','g','r','a','n','n','e',0
        EVEN
str_777:
        dc.b    'V','e','v','a',' ','u','p','p',' ','f',$F6,'n','s','t','r','e'
        dc.b    'n',' ','i',' ','e','n',' ','c','a','b','r','i','o','l','e','t'
        dc.b    0
        EVEN
str_778:
        dc.b    'S','j',$F6,'s',$E4,'t','t','a',' ','s','i','n','a',' ','k','o'
        dc.b    'n','t','o','k','o','r','t',0
        EVEN
str_779:
        dc.b    'L','a','r','m','a',' ','b','r','a','n','d','k',$E5,'r','e','n'
        dc.b    ' ','v','i','a',' ','b','r','e','v',0
        EVEN
str_780:
        dc.b    'S','n','a','t','t','a',' ','a','r','b','e','t','e','n',' ','p'
        dc.b    $E5,' ','a','r','b','e','t','s','f',$F6,'r','m','e','d','l','i'
        dc.b    'n','g','e','n',0
        EVEN
str_781:
        dc.b    'A','n','v',$E4,'n','d','a',' ','k','o','f','o','t',' ','s','o'
        dc.b    'm',' ','b','e','s','t','i','c','k',0
        EVEN
str_782:
        dc.b    'S','t',$E4,'m','m','a',' ','b','r','o','t','t','s','l','i','n'
        dc.b    'g','a','r',' ','m','e','d',' ','s','t',$E4,'m','j',$E4,'r','n'
        dc.b    0
        EVEN
str_783:
        dc.b    'T','r','o',' ','a','t','t',' ','g','a','m','l','a',' ','d','j'
        dc.b    'u','r',' ','h','a','r',' ','g','l','a','s',$F6,'g','o','n',0
        EVEN
str_784:
        dc.b    'S','l','i','p','a',' ','b','e','s','t','i','c','k','e','n',' '
        dc.b    'i','s','t',$E4,'l','l','e','t',' ','f',$F6,'r',' ','a','t','t'
        dc.b    ' ','d','i','s','k','a',0
        EVEN
str_785:
        dc.b    'T','i','l','l','v','e','r','k','a',' ','s','v','a','r','t',' '
        dc.b    't','i','p','p','e','x',0
        EVEN
str_786:
        dc.b    'S','k','a','l','a',' ','s','i','l','l','a','r',0
        EVEN
str_787:
        dc.b    'T','r','o',' ','a','t','t',' ','d','e','t',' ','b','l',$E5,'s'
        dc.b    'e','r',' ','p',$E5,' ','v','i','n','d','e','n',0
        EVEN
str_788:
        dc.b    $D6,'p','p','n','a',' ','d',$F6,'r','r','a','r',' ','i','n','i'
        dc.b    'f','r',$E5,'n',0
        EVEN
str_789:
        dc.b    'F',$F6,'r','e','s','l',$E5,' ','e','n',' ',$E4,'n','d','r','i'
        dc.b    'n','g',' ','a','v',' ','t','y','n','g','d','l','a','g','e','n'
        dc.b    0
        EVEN
str_790:
        dc.b    'R','i','n','g','a',' ','t','i','l','l',' ','N','R','J',' ','o'
        dc.b    'c','h',' ','p',$E5,'p','e','k','a',' ','a','t','t',' ','d','e'
        dc.b    't',' ','f','a','k','t','i','s','k','t',' ','s','t','a','v','a'
        dc.b    's',' ','N','R','G',0
        EVEN
str_791:
        dc.b    $D6,'v','e','r','s',$E4,'t','t','a',' ','s','m',$F6,'g','e','n'
        dc.b    'l','i','s','t','a','n',' ','t','i','l','l',' ','i','s','l',$E4
        dc.b    'n','d','s','k','a',0
        EVEN
str_792:
        dc.b    'M','j',$F6,'l','k','a',' ','m','j',$F6,'l','k','p','a','k','e'
        dc.b    't',0
        EVEN
str_793:
        dc.b    'E','n','k','e','l','r','i','k','t','a',' ',$D6,'l','a','n','d'
        dc.b    's','b','r','o','n',0
        EVEN
str_794:
        dc.b    'B','o','t','a',' ','s','o','c','k','e','r','s','j','u','k','a'
        dc.b    ' ','m','e','d',' ','s','o','c','k','e','r','f','r','i',' ','t'
        dc.b    'v',$E5,'l',0
        EVEN
str_795:
        dc.b    'S','t','j',$E4,'l','a',' ','t','j','u','v','a','r',0
        EVEN
str_796:
        dc.b    'L','i','t','a',' ','p',$E5,' ','p','o','l','i','s','e','r',0
        EVEN
str_797:
        dc.b    'S',$F6,'k','a',' ','j','o','b','b',' ','s','o','m',' ','a','n'
        dc.b    'a','r','k','i','s','t',0
        EVEN
str_798:
        dc.b    'D','a','n','s','a',' ','t','i','l','l',' ','h',$F6,'r','s','e'
        dc.b    'l','t','e','s','t','e','t',' ','p',$E5,' ','m',$F6,'n','s','t'
        dc.b    'r','i','n','g','e','n',0
        EVEN
str_799:
        dc.b    'J','o','b','b','a',' ','p',$E5,' ','I','n','t','e','r','n','e'
        dc.b    't',0
        EVEN
str_800:
        dc.b    'K','o','l','l','a',' ','i',' ','d',$F6,'d','s','a','n','n','o'
        dc.b    'n','s','e','r','n','a',' ','e','f','t','e','r',' ','l','e','d'
        dc.b    'i','g','a',' ','j','o','b','b',0
        EVEN
str_801:
        dc.b    'M','a','t','a',' ','d','a','g','s','l',$E4,'n','d','o','r',0
        EVEN
str_802:
        dc.b    'V',$E4,'r','m','a',' ','u','p','p',' ','i','s','t','e',' ','i'
        dc.b    'n','n','a','n',' ','m','a','n',' ','d','r','i','c','k','e','r'
        dc.b    ' ','d','e','t',0
        EVEN
str_803:
        dc.b    'G','i','f','t','a',' ','s','i','g',' ','m','e','d',' ','C','h'
        dc.b    'r','i','s','t','e','r',' ','L','a','g',' ','f',$F6,'r',' ','a'
        dc.b    't','t',' ','f',$E5,' ','h','a','n','s',' ','e','f','t','e','r'
        dc.b    'n','a','m','n',0
        EVEN
str_804:
        dc.b    $D6,'p','p','n','a',' ','s','e','c','o','n','d','h','a','n','d'
        dc.b    ' ','a','f','f',$E4,'r',' ','f',$F6,'r',' ','g','r','a','v','s'
        dc.b    't','e','n','a','r',0
        EVEN
str_805:
        dc.b    'B','y','g','g','a',' ','e','n',' ','f','j',$E4,'r','r','k','o'
        dc.b    'n','t','r','o','l','l',' ','t','i','l','l',' ','s','i','n',' '
        dc.b    'h',$E5,'r','t','o','r','k',0
        EVEN
str_806:
        dc.b    'T','a',' ','p','a','t','e','n','t',' ','p',$E5,' ','d','u','b'
        dc.b    'b','e','l','h',$E4,'f','t','a','n','d','e',' ','l','i','m',0
        EVEN
str_807:
        dc.b    'A','n','v',$E4,'n','d','a',' ','f','l','y','t','v',$E4,'s','t'
        dc.b    ' ','p',$E5,' ','s','j',$F6,'m','a','n','s','k','r','o','g',0
        EVEN
str_808:
        dc.b    'L','e','v','a',' ','p',$E5,' ','b','r',$F6,'s','t','m','j',$F6
        dc.b    'l','k','s','e','r','s',$E4,'t','t','n','i','n','g',0
        EVEN
str_809:
        dc.b    'S','m','u','g','g','l','a',' ','s','a','n','d','a','l','e','r'
        dc.b    ' ','t','i','l','l',' ','G','r',$F6,'n','l','a','n','d',0
        EVEN
str_810:
        dc.b    'B','l','i',' ','s','j',$F6,'m','a','n',' ','o','c','h',' ','s'
        dc.b    'e','g','l','a',' ','j','o','r','d','e','n',' ','r','u','n','t'
        dc.b    ' ','f',$F6,'r',' ','a','t','t',' ','m','a','n',' ','g','i','l'
        dc.b    'l','a','r',' ','a','t','t',' ','l',$E4,'s','a',' ','s','e','r'
        dc.b    'i','e','t','i','d','n','i','n','g','a','r',0
        EVEN
str_811:
        dc.b    'K','a','m','m','a',' ','s','i','g',' ','u','n','d','e','r',' '
        dc.b    'a','r','m','a','r','n','a',0
        EVEN
str_812:
        dc.b    'S','u','g','a',' ','p',$E5,' ','a','n','d','r','a',' ','g','o'
        dc.b    'm','s','p','e','n','o','r',0
        EVEN
str_813:
        dc.b    'S','m','u','g','g','l','a',' ','m','o','r',$F6,'t','t','e','r'
        dc.b    ' ','i',' ','g','l','a','d','p','a','c','k',0
        EVEN
str_814:
        dc.b    'A','v','b','e','s','t',$E4,'l','l','a',' ','b','i','l','j','e'
        dc.b    't','t','e','r',' ','m','a','n',' ','a','l','d','r','i','g',' '
        dc.b    'h','a','r',' ','b','e','s','t',$E4,'l','l','t',0
        EVEN
str_815:
        dc.b    'F','r',$E5,'g','a',' ','e','f','t','e','r',' ','K','l','a','s'
        dc.b    's',' ','I',' ','i',' ','B','a','y','e','r','n',0
        EVEN
str_816:
        dc.b    'F',$F6,'r','s',$F6,'k','a',' ','b','y','g','g','a',' ','e','t'
        dc.b    't',' ','D','i','s','n','e','y','l','a','n','d',' ','p',$E5,' '
        dc.b    'K','u','b','a',0
        EVEN
str_817:
        dc.b    'T','r','o',' ','a','t','t',' ','i','g','e','l','k','o','t','t'
        dc.b    'a','r',' ','m','e','d','f',$F6,'r',' ','v',$E4,'r','l','d','e'
        dc.b    'n','s',' ','u','n','d','e','r','g',$E5,'n','g',0
        EVEN
str_818:
        dc.b    'S','k','i','c','k','a',' ','s','m','a','r','t','d','r','i','n'
        dc.b    'k','s',' ','t','i','l','l',' ','d','e',' ','s','v',$E4,'l','t'
        dc.b    'a','n','d','e',' ','b','a','r','n','e','n',' ','i',' ','B','e'
        dc.b    'v','e','r','l','y',' ','H','i','l','l','s',0
        EVEN
str_819:
        dc.b    'M','i','s','s','b','r','u','k','a',' ','s','y','r','e',0
        EVEN
str_820:
        dc.b    'S','l',$E5,' ','e','t','t',' ','s','l','a','g',' ','f',$F6,'r'
        dc.b    ' ','v',$E5,'l','d','e','t',0
        EVEN
str_821:
        dc.b    'T','r','o','l','l','a',' ','b','o','r','t',' ','e','n',' ','e'
        dc.b    'x','-','p','r','e','s','i','d','e','n','t',0
        EVEN
str_822:
        dc.b    'B','o',' ','p',$E5,' ','1','3','0','0','-','t','a','l','e','t'
        dc.b    0
        EVEN
str_823:
        dc.b    'G','e',' ','a','l','l','m','o','s','o','r',' ','t','i','l','l'
        dc.b    ' ','s','m',$E5,'r','i','k','a',' ','b',$F6,'n','d','e','r',0
        EVEN
str_824:
        dc.b    'L','e','k','a',' ','t','j','u','v',' ','o','c','h',' ','p','o'
        dc.b    'l','i','s',' ','m','e','d',' ','T','o','m','a','s',' ','Q','v'
        dc.b    'i','c','k',0
        EVEN
str_825:
        dc.b    'S','m','a','k','a',' ','p',$E5,' ','s','i','n',' ','e','g','e'
        dc.b    'n',' ','m','e','d','i','c','i','n',0
        EVEN
str_826:
        dc.b    'G','r',$E4,'v','a',' ','n','e','r',' ','s','i','n','a',' ','f'
        dc.b    $F6,'t','t','e','r',' ','i',' ','b','l','o','m','k','r','u','k'
        dc.b    'a',' ','o','c','h',' ','h','o','p','p','a','s',' ','p',$E5,' '
        dc.b    'd','e','t',' ','b',$E4,'s','t','a',0
        EVEN
str_827:
        dc.b    'K','a','s','t','a',' ','t','a','n','d','t','r',$E5,'d',' ','p'
        dc.b    $E5,' ','b','e','g','r','a','v','n','i','n','g','a','r',0
        EVEN
str_828:
        dc.b    'R','i','v','a',' ','k','l','a','g','o','m','u','r','e','n',0
        EVEN
str_829:
        dc.b    'S','e',' ','p',$E5,' ','f','o','t','b','o','l','l',' ','u','t'
        dc.b    'a','n',' ','a','t','t',' ','v','a','r','a',' ','s','l',$E4,'k'
        dc.b    't',' ','m','e','d',' ','n',$E5,'g','o','n',' ','a','v',' ','d'
        dc.b    'e',' ','s','p','e','l','a','n','d','e',0
        EVEN
str_830:
        dc.b    'B','a','t','i','k','f',$E4,'r','g','a',' ','t','v',$E5,'n','g'
        dc.b    's','t','r',$F6,'j','o','r',0
        EVEN
str_831:
        dc.b    'R','i','n','g','a',' ','o','c','h',' ','b','e','s','t',$E4,'l'
        dc.b    'l','a',' ','b','o','r','d',' ','p',$E5,' ','M','c','D','o','n'
        dc.b    'a','l','d','s',0
        EVEN
str_832:
        dc.b    'G','e',' ','b','o','r','t',' ','k','i','l','l','s','m','i','n'
        dc.b    'k',' ','t','i','l','l',' ','s','i','n','a',' ','s','y','s','t'
        dc.b    'r','a','r',0
        EVEN
str_833:
        dc.b    'A','n','v',$E4,'n','d','a',' ','e','k','o','l','o','d',' ','v'
        dc.b    'i','d',' ','U','F','O','-','s','p','a','n','i','n','g',0
        EVEN
str_834:
        dc.b    'T','y','c','k','a',' ','a','t','t',' ','C','P','-','l','i','s'
        dc.b    't','a','n',' ',$E4,'r',' ','s','o','r','g','l','i','g',' ','i'
        dc.b    ' ','s','l','u','t','e','t',0
        EVEN
str_835:
        dc.b    'S','t','i','f','t','a',' ','l','a','g','a','r',' ','b','a','s'
        dc.b    'e','r','a','d','e',' ','p',$E5,' ','a','n','a','r','k','i',0
        EVEN
str_836:
        dc.b    'G',$F6,'r','a',' ','L','S','D','-','l','a','p','p','a','r',' '
        dc.b    'b','e','p','r','y','d','d','a',' ','m','e','d',' ','K','e','n'
        dc.b    'n','e','t','h',0
        EVEN
str_837:
        dc.b    'T','a',' ','m','e','d',' ','s','i','g',' ','d','a','t','o','r'
        dc.b    ' ','o','c','h',' ','s','o','v','s',$E4,'c','k',' ','t','i','l'
        dc.b    'l',' ','N','o','b','e','l','f','e','s','t','e','n',0
        EVEN
str_838:
        dc.b    'I','n','j','i','c','e','r','a',' ','f','o','l','k',$F6,'l',' '
        dc.b    'i',' ','S','m',$F6,'g','e','n',0
        EVEN
str_839:
        dc.b    'A','n','o','r','d','n','a',' ','R','a','v','e','f','e','s','t'
        dc.b    'e','r',' ','i',' ','s','o','v','s','a','l','a','r',0
        EVEN
str_840:
        dc.b    'P','a','s','s','a',' ','p',$E5,' ','a','t','t',' ','l',$E4,'m'
        dc.b    'n','a',' ','i','n',' ','s','i','n','a',' ','v','i','d','e','o'
        dc.b    'b','a','n','d',' ','f',$F6,'r',' ','f','r','a','m','k','a','l'
        dc.b    'l','n','i','n','g',' ','v','i','d',' ','j','u','l','e','t','i'
        dc.b    'd',0
        EVEN
str_841:
        dc.b    'T','a',' ','m','e','d',' ','s','i','g',' ','e','n',' ','s','i'
        dc.b    'g','n','e','r','a','d',' ','B','e','e','t','h','o','v','e','n'
        dc.b    ' ','C','D',' ','t','i','l','l',' ','A','n','t','i','k','r','u'
        dc.b    'n','d','a','n',0
        EVEN
str_842:
        dc.b    'T','i','p','s','a',' ','p','o','l','i','s','e','n',' ','o','m'
        dc.b    ' ','v','i','l','k','a',' ','b','r','o','t','t',' ','m','a','n'
        dc.b    ' ','p','l','a','n','e','r','a','r',' ','a','t','t',' ','b','e'
        dc.b    'g',$E5,0
        EVEN
str_843:
        dc.b    'H','a',' ','p','r','o','p','e','l','l','e','r','k','e','p','s'
        dc.b    ' ','u','p','p','o','c','h','n','e','r',0
        EVEN
str_844:
        dc.b    $C4,'t','a',' ','s','t','o','l','s','p','i','l','l','e','r',0
        EVEN
str_845:
        dc.b    'R',$F6,'k','a',' ','t','o','r','k','a','t',' ','f','o','l','k'
        dc.b    $F6,'l',0
        EVEN
str_846:
        dc.b    'S','p','e','l','a',' ','b','o','r','t',' ','a','l','l','a',' '
        dc.b    's','i','n','a',' ','p','e','n','g','a','r',' ','p',$E5,' ','t'
        dc.b    'u','g','g','u','m','m','i','a','u','t','o','m','a','t','e','r'
        dc.b    0
        EVEN
str_847:
        dc.b    'B','y','t','a',' ','s','i','n',' ','A','m','i','g','a',' ','m'
        dc.b    'o','t',' ','e','n',' ','c','y','k','e','l','d','a','t','o','r'
        dc.b    0
        EVEN
str_848:
        dc.b    'S',$E4,'t','t','a',' ','k','r','o','k','b','e','n',' ','f',$F6
        dc.b    'r',' ','b','i','l','a','r',0
        EVEN
str_849:
        dc.b    'B','y','g','g','a',' ','o','m',' ','s','i','n',' ','n','a','v'
        dc.b    'e','l','s','t','r',$E4,'n','g',' ','t','i','l','l',' ','e','t'
        dc.b    't',' ','b','l',$E5,'s','i','n','s','t','r','u','m','e','n','t'
        dc.b    0
        EVEN
str_850:
        dc.b    'O','d','l','a',' ','m','u','s','t','a','s','c','h',' ','o','c'
        dc.b    'h',' ','h','o','c','k','e','y','f','r','i','l','l','a',0
        EVEN
str_851:
        dc.b    'K','l','a','r','a',' ','s','i','g',' ','i',' ','l','i','v','e'
        dc.b    't',' ','u','t','a','n',' ','a','l','l','a',' ','t','r','e','v'
        dc.b    'l','i','g','a',' ','l','i','s','t','o','r',0
        EVEN
str_852:
        dc.b    'S','l',$E4,'p','p','a',' ','C','P','-','l','i','s','t','a','n'
        dc.b    ' ','p',$E5,' ','b','r','u','n','n','s','l','o','c','k',0
        EVEN
str_853:
        dc.b    'S','k','r','i','v','a',' ','u','t',' ','j','o','b','b','a','n'
        dc.b    's',$F6,'k','n','i','n','g','a','r',' ','p',$E5,' ','t','u','n'
        dc.b    'n','b','r',$F6,'d',0
        EVEN
str_854:
        dc.b    'G','l',$F6,'m','m','a',' ','a','t','t',' ','m','a','n',' ','h'
        dc.b    'a','r',' ','v',$E5,'n','i','n','g','s','s',$E4,'n','g',0
        EVEN
str_855:
        dc.b    'H','a',' ','s','t',$F6,'d','h','j','u','l',' ','p',$E5,' ','s'
        dc.b    'i','t','t',' ','t','r',$E4,'b','e','n',0
        EVEN
str_856:
        dc.b    'T','a',' ','b','u','s','s',' ','n','r',' ','7',' ','t','v',$E5
        dc.b    ' ','g',$E5,'n','g','e','r',' ','i','s','t',$E4,'l','l','e','t'
        dc.b    ' ','f',$F6,'r',' ','a','t','t',' ','t','a',' ','b','u','s','s'
        dc.b    ' ','n','r',' ','1','4',0
        EVEN
str_857:
        dc.b    'T','a','p','p','a',' ','t','v',$E5,'l','e','n',' ','m','e','d'
        dc.b    ' ','f','l','i','t',' ','i',' ','f',$E4,'n','g','e','l','s','e'
        dc.b    'd','u','s','c','h','e','n',0
        EVEN
str_858:
        dc.b    'M','o','r','s','a',' ','p',$E5,' ','m','o','r','s','e',0
        EVEN
str_859:
        dc.b    'B',$F6,'r','j','a',' ','m','e','d',' ',$22,'s','k','r','a','p'
        dc.b    'a',' ','e','j',$22,' ','r','u','t','a','n',' ','p',$E5,' ','t'
        dc.b    'r','i','s','s','l','o','t','t','e','n',0
        EVEN
str_860:
        dc.b    'S','k',$E4,'m','m','a','s',' ','f',$F6,'r',' ','a','t','t',' '
        dc.b    'm','a','n',' ','f',$E5,'r',' ','g',$E5,'s','h','u','d',0
        EVEN
str_861:
        dc.b    'L','i','g','g','a',' ','p',$E5,' ','s','p','a','r','k','a','n'
        dc.b    'd','e',' ','h','u','n','d','a','r',0
        EVEN
str_862:
        dc.b    'P','l','a','n','e','r','a',' ','s','i','n','a',' ','b','l',$E5
        dc.b    'm',$E4,'r','k','e','n',0
        EVEN
str_863:
        dc.b    'S','l',$E5,' ','e','t','t',' ','s','l','a','g',' ','f',$F6,'r'
        dc.b    ' ','t','j','e','j','s','m','i','n','k',0
        EVEN
str_864:
        dc.b    $C5,'t','a',' ','c','e','l','l','g','i','f','t','e','r',' ','f'
        dc.b    $F6,'r',' ','a','t','t',' ','s','p','a','r','a',' ','i','n',' '
        dc.b    'p',$E5,' ','s','i','n','a',' ','f','r','i','s',$F6,'r','r',$E4
        dc.b    'k','n','i','n','g','a','r',0
        EVEN
str_865:
        dc.b    'B','e','g',$E4,'r','a',' ','s','u','g','r',$F6,'r',' ','t','i'
        dc.b    'l','l',' ','k','a','f','f','e','t',0
        EVEN
str_866:
        dc.b    'B','a','d','a',' ','i',' ','k','v','i','c','k','s','a','n','d'
        dc.b    0
        EVEN
str_867:
        dc.b    'P','l','o','c','k','a',' ','s','v','a','m','p',' ','p',$E5,' '
        dc.b    'm','o','t','o','r','v',$E4,'g','e','n',0
        EVEN
str_868:
        dc.b    'F',$F6,'r','s',$F6,'k','a',' ','h','y','r','a',' ','d','a','g'
        dc.b    's','t','i','d','n','i','n','g','e','n',0
        EVEN
str_869:
        dc.b    'S','k','r','i','v','a',' ','e','n',' ','c','y','k','e','l','t'
        dc.b    'i','d','t','a','b','e','l','l',0
        EVEN
str_870:
        dc.b    'G','e',' ','b','o','r','t',' ','s','i','t','t',' ','h','u','s'
        dc.b    ' ','i',' ','n','a','m','n','s','d','a','g','s','p','r','e','s'
        dc.b    'e','n','t',0
        EVEN
str_871:
        dc.b    'G',$F6,'r','a',' ','e','n',' ','p','j',$E4,'s',' ','a','v',' '
        dc.b    'I','n','d','e','p','e','n','d','e','n','c','e',' ','D','a','y'
        dc.b    0
        EVEN
str_872:
        dc.b    'A','n','o','r','d','n','a',' ','S','M',' ','i',' ','S','/','M'
        dc.b    0
        EVEN
str_873:
        dc.b    'F',$F6,'r','b','j','u','d','a',' ','p','r','o','p','e','l','l'
        dc.b    'e','r','k','e','p','s','a','r',' ','p',$E5,' ','f','l','y','g'
        dc.b    'p','l','a','n',0
        EVEN
str_874:
        dc.b    'T','i','l','l','v','e','r','k','a',' ','a','l','k','o','h','o'
        dc.b    'l','l',$E4,'s','k',' ','m','e','d',' ',$F6,'l','s','m','a','k'
        dc.b    0
        EVEN
str_875:
        dc.b    'A','n','v',$E4,'n','d','a',' ','m','e','r',' ','s','m','i','n'
        dc.b    'k',' ',$E4,'n',' ','H','u','l','k',' ','H','o','g','a','n',0
        EVEN
str_876:
        dc.b    'G','r',$E4,'v','a',' ','e','n',' ','t','u','n','n','e','l',' '
        dc.b    't','i','l','l',' ','m',$E5,'n','e','n',0
        EVEN
str_877:
        dc.b    'M','a','l','a',' ','n','e','r',' ','m','u','r','m','e','l','d'
        dc.b    'j','u','r',0
        EVEN
str_878:
        dc.b    'S','l','i','p','a',' ','s','i','n','a',' ','s','k','e','d','a'
        dc.b    'r',0
        EVEN
str_879:
        dc.b    'B','j','u','d','a',' ','p',$E5,' ','M','o','l','o','t','o','v'
        dc.b    ' ','C','o','c','k','t','a','i','l','s',' ','p',$E5,' ','r','e'
        dc.b    'l','e','a','s','e','p','a','r','t','y','t',' ','f',$F6,'r',' '
        dc.b    'C','P','-','l','i','s','t','a','n',' ','n','r',' ','1','0','0'
        dc.b    '0',0
        EVEN
str_880:
        dc.b    'O','f','r','e','d','a',' ','v',$E4,'r','n','p','l','i','k','t'
        dc.b    'i','g','a',' ','g','e','n','o','m',' ','a','t','t',' ','b','j'
        dc.b    'u','d','a',' ','p',$E5,' ',$22,'p','l','o','p','p',$22,0
        EVEN
str_881:
        dc.b    'T','r','o',' ','p',$E5,' ','e','t','t',' ','l','i','v',' ','e'
        dc.b    'f','t','e','r',' ','S','m',$F6,'g','e','n',0
        EVEN
str_882:
        dc.b    'D','r','i','c','k','a',' ','r','a','k','v','a','t','t','e','n'
        dc.b    ' ','f',$F6,'r',' ','a','t','t',' ','d',$F6,'l','j','a',' ','s'
        dc.b    'p','r','i','t','l','u','k','t','e','n',0
        EVEN
str_883:
        dc.b    'S','k','a','f','f','a',' ','p','r','a','k','t','i','k','p','l'
        dc.b    'a','t','s',' ','p',$E5,' ','b','o','r','d','e','l','l',0
        EVEN
str_884:
        dc.b    'F',$F6,'r','s',$F6,'k','a',' ','r','i','m','m','a',' ','p',$E5
        dc.b    ' ','g','r',$E5,'s','o','s','s','e',0
        EVEN
str_885:
        dc.b    'B','j','u','d','a',' ','i','n',' ','b','a','n','d','e','t',' '
        dc.b    'm','e','d',' ','h','i','t','e','n',' ',$22,'L','i','v','e','t'
        dc.b    ' ','h','a','r',' ','s','i','n','a',' ','g','o','d','a',' ','s'
        dc.b    't','u','n','d','e','r',$22,' ','t','i','l','l',' ','R','o','s'
        dc.b    'k','i','l','d','e',0
        EVEN
str_886:
        dc.b    'J','o','b','b','a',' ','i',' ','e','n',' ','l','e','k','s','a'
        dc.b    'k','s','a','f','f',$E4,'r',' ','u','t','a','n',' ','a','t','t'
        dc.b    ' ','b',$E4,'r','a',' ','c','y','k','l','o','p',0
        EVEN
str_887:
        dc.b    'S','y',' ','b','l',$E5,'s','t',$E4,'l','l',' ','f',$F6,'r',' '
        dc.b    'b','l',$F6,'d','a','r','s','j','u','k','a',0
        EVEN
str_888:
        dc.b    'U','t',$F6,'v','a',' ','l','a','k','r','i','t','s','k','o','n'
        dc.b    't','r','o','l','l',0
        EVEN
str_889:
        dc.b    'R','u','s','a',' ','t','i','l','l',' ','p','o','s','t','e','n'
        dc.b    ' ','f',$F6,'r',' ','a','t','t',' ','h','i','n','n','a',' ','l'
        dc.b    $E4,'g','g','a',' ','p',$E5,' ','e','t','t',' ','p','a','r',' '
        dc.b    'k','i','l','o',0
        EVEN
str_890:
        dc.b    'M','i','s','s','t',$E4,'n','k','a',' ','s','i','n',' ','f','r'
        dc.b    'u',' ','m','e','d',' ','a','t','t',' ','h','a',' ','v','a','r'
        dc.b    'i','t',' ','o','t','r','o','g','e','n',' ','m','e','d',' ','s'
        dc.b    'i','n',' ','s','i','a','m','e','s','i','s','k','a',' ','b','r'
        dc.b    'o','r','s','a',0
        EVEN
str_891:
        dc.b    'G','e',' ','b','o','r','t',' ','s','p','e','c','i','a','l','b'
        dc.b    'e','s','t',$E4,'l','l','d','a',' ','i','s','s','k','u','l','p'
        dc.b    't','u','r','e','r',' ','i',' ','j','u','l','k','l','a','p','p'
        dc.b    0
        EVEN
str_892:
        dc.b    'A','n','v',$E4,'n','d','a',' ','T','i','p','p','e','x',' ','s'
        dc.b    'o','m',' ','s','m','i','n','k',0
        EVEN
str_893:
        dc.b    'S',$E4,'l','j','a',' ','k','a','n','t','a','r','e','l','l','e'
        dc.b    'r',' ','t','i','l','l',' ','l',$E4,'g','s','t','b','j','u','d'
        dc.b    'a','n','d','e',0
        EVEN
str_894:
        dc.b    'S','t','a','r','t','a',' ','i','n','s','a','m','l','i','n','g'
        dc.b    'a','r',' ','t','i','l','l',' ','f',$F6,'r','m',$E5,'n',' ','f'
        dc.b    $F6,'r',' ','M',$E4,'l','a','r','l','e','d','e','n',0
        EVEN
str_895:
        dc.b    'T','r','y','c','k','a',' ','p',$E5,' ','v','a','r','j','e',' '
        dc.b    'n','u','m','m','e','r',' ','a','v',' ','C','P','-','l','i','s'
        dc.b    't','a','n',' ','s','o','m',' ','m','a','n',' ','v','i','l','l'
        dc.b    ' ','s','k','a',' ','g',$E5,' ','i',' ','u','p','p','f','y','l'
        dc.b    'l','e','l','s','e',0
        EVEN
str_896:
        dc.b    'L',$F6,'s','a',' ','v',$E4,'r','l','d','s','p','r','o','b','l'
        dc.b    'e','m','e','n',' ','m','e','d',' ','s','t',$F6,'r','r','e',' '
        dc.b    'm','o','t','o','r','v',$E4,'g','a','r',0
        EVEN
str_897:
        dc.b    'S','t','a','g','e','d','i','v','a',' ','i',' ','e','n',' ','o'
        dc.b    'p','e','r','a','t','i','o','n','s','s','a','l',0
        EVEN
str_898:
        dc.b    'S','o','m','m','a','r','j','o','b','b','a',' ','i',' ','P','o'
        dc.b    'l','e','n',0
        EVEN
str_899:
        dc.b    'K',$E4,'k','a',' ','t','e','g','e','l',0
        EVEN
str_900:
        dc.b    'B','o','t','a',' ','g','a','m','m','a','l',' ','m','j',$F6,'l'
        dc.b    'k',0
        EVEN
str_901:
        dc.b    'S','t',$E4,'l','l','a',' ','u','p','p',' ','m','e','d',' ','s'
        dc.b    'i','n','a',' ','r','a','d','i','o','s','t','y','r','d','a',' '
        dc.b    'm','a','n','e','t','e','r',' ','p',$E5,' ','L','i','s','e','b'
        dc.b    'e','r','g','s',' ','t','a','l','a','n','g','j','a','k','t',0
        EVEN
str_902:
        dc.b    'S','i','m','u','l','e','r','a',' ','e','n',' ','g','r',$F6,'n'
        dc.b    ' ','h',$E5,'l','s','l','a','g','a','r','e',0
        EVEN
str_903:
        dc.b    'G','r','i','l','l','a',' ','v','a','t','t','e','n',0
        EVEN
str_904:
        dc.b    'M','o','o','n','a',' ','p',$E5,' ','m',$E5,'n','e','n',0
        EVEN
str_905:
        dc.b    'T','i','l','l','v','e','r','k','a',' ','v',$E4,'r','l','d','e'
        dc.b    'n','s',' ','f',$F6,'r','s','t','a',' ','b',$E4,'r','b','a','r'
        dc.b    'a',' ','C','D','-','s','k','i','v','a',0
        EVEN
str_906:
        dc.b    'V','a','r','a',' ','f',$F6,'r','s','t',' ','m','e','d',' ','v'
        dc.b    $E4,'r','l','d','e','n','s',' ','a','n','d','r','a',' ','b',$E4
        dc.b    'r','b','a','r','a',' ','C','D','-','s','k','i','v','a',0
        EVEN
str_907:
        dc.b    'B','i','k','t','a',' ','s','i','g',' ','i',' ','B','i','n','g'
        dc.b    'o','l','o','t','t','o',0
        EVEN
str_908:
        dc.b    'L','e','t','a',' ','e','f','t','e','r',' ','v',$E5,'r','k','a'
        dc.b    'n','t','e','n',0
        EVEN
str_909:
        dc.b    'D','r','a',' ','a','l','l','a',' ','h',$E4,'s','t','a','r',' '
        dc.b    $F6,'v','e','r',' ','e','n',' ','k','a','m',0
        EVEN
str_910:
        dc.b    'B','e','s','t',$E4,'l','l','a',' ',$22,'e','x','t','r','a',' '
        dc.b    's','o','c','k','e','r',$22,' ','p',$E5,' ','P','r','e','s','s'
        dc.b    'b','y','r',$E5,'n',0
        EVEN
str_911:
        dc.b    'G',$E5,' ','j',$E4,'m','n','f','o','t','a',0
        EVEN
str_912:
        dc.b    'S','n','i','c','k','r','a',' ','s','t','e','g','a','r',' ','f'
        dc.b    $F6,'r',' ','b','l','i','n','d','a',0
        EVEN
str_913:
        dc.b    'B','j','u','d','a',' ','i','n',' ','m','a','s','s','m','e','d'
        dc.b    'i','a',' ','p',$E5,' ','s','i','n',' ',$E5,'r','l','i','g','a'
        dc.b    ' ','t','a','n','d','l',$E4,'k','a','r','k','o','n','t','r','o'
        dc.b    'l','l',0
        EVEN
str_914:
        dc.b    'A','n','s',$F6,'k','a',' ','o','m',' ','j','a','k','t','t','i'
        dc.b    'l','l','s','t',$E5,'n','d',' ','p',$E5,' ','h',$E4,'s','t','a'
        dc.b    'r',0
        EVEN
str_915:
        dc.b    'F',$F6,'r','a',' ','r','e','g','i','s','t','e','r',' ',$F6,'v'
        dc.b    'e','r',' ','a','l','l','a',' ','s','l','a','d','d','b','a','r'
        dc.b    'n',' ','p',$E5,' ','s','i','n',' ','G','a','m','e','b','o','y'
        dc.b    0
        EVEN
str_916:
        dc.b    $D6,'p','p','n','a',' ','e','n',' ','a','f','f',$E4,'r',' ','s'
        dc.b    'o','m',' ','s',$E4,'l','j','e','r',' ','b',$E4,'r','b','a','r'
        dc.b    'a',' ','h','u','s','d','j','u','r',0
        EVEN
str_917:
        dc.b    'P','o','p','p','a',' ','p','o','p','p','e','r','s',' ','p',$E5
        dc.b    ' ','h','e','m','k','u','n','s','k','a','p','s','t','i','m','m'
        dc.b    'e','n',0
        EVEN
str_918:
        dc.b    'B','y','g','g','a',' ','e','n',' ','U','S','S',' ','E','n','t'
        dc.b    'e','r','p','r','i','s','e',' ','i',' ','n','a','t','u','r','l'
        dc.b    'i','g',' ','s','t','o','r','l','e','k',' ','i',' ','s','i','t'
        dc.b    't',' ','b','a','d','r','u','m',0
        EVEN
str_919:
        dc.b    'T','a',' ','t',$E5,'g','e','t',' ','f',$F6,'r',' ','a','t','t'
        dc.b    ' ','i','n','t','e',' ','m','i','s','s','a',' ','j','o','r','d'
        dc.b    'e','n','s',' ','u','n','d','e','r','g',$E5,'n','g',0
        EVEN
str_920:
        dc.b    'H','a','l','k','a',' ','m','e','d',' ','p',$E5,' ','n','y','a'
        dc.b    ' ','i','n','n','e','s','p','o','r','t','e','n',' ','S','c','h'
        dc.b    'i','z','o','f','r','e','n','i',0
        EVEN
str_921:
        dc.b    'F',$F6,'r','s',$F6,'k','a',' ','b','l','i',' ','l',$E4,'n','g'
        dc.b    'r','e',' ','i',' ','v',$E4,'x','t','h','u','s',0
        EVEN
str_922:
        dc.b    'F',$F6,'l','j','a',' ','C','P','-','l','i','s','t','a','n',' '
        dc.b    'f','u','n','d','a','m','e','n','t','a','l','t',0
        EVEN
str_923:
        dc.b    'T','r','o',' ','a','t','t',' ','v',$E4,'r','l','d','s','o','m'
        dc.b    's','p',$E4,'n','n','a','n','d','e',' ','n','y','h','e','t','e'
        dc.b    'r',' ',$E4,'r',' ','s','a','m','m','a',' ','s','a','k',' ','s'
        dc.b    'o','m',' ','s','p',$E4,'n','n','a','n','d','e',' ','b','i','l'
        dc.b    'j','a','k','t','e','r',0
        EVEN
str_924:
        dc.b    'S','a','m','l','a',' ','p',$E5,' ','k','r','e','a','t','u','r'
        dc.b    0
        EVEN
str_925:
        dc.b    'T','r','o',' ','a','t','t',' ','f','o','s','t','e','r','l','a'
        dc.b    'n','d','e','t',' ',$E4,'r',' ','d',$E4,'r',' ','s','t','o','r'
        dc.b    'k','e','n',' ','k','o','m','m','e','r',' ','i','f','r',$E5,'n'
        dc.b    0
        EVEN
str_926:
        dc.b    'R','a','m','l','a',' ','i',' ','g','o','d',' ','t','r','o',0
        EVEN
str_927:
        dc.b    'F','i','l','m','a',' ','s','p',$E4,'n','n','a','n','d','e',' '
        dc.b    't','r','a','i','l','e','r','s',' ','p',$E5,' ','E','2','0',0
        EVEN
str_928:
        dc.b    'S','k','r','i','v','a',' ','o','s','y','n','l','i','g','a',' '
        dc.b    'f','a','n','z','i','n','e','s',0
        EVEN
str_929:
        dc.b    'T','r','o',' ','a','t','t',' ','T','v','-','l','i','c','e','n'
        dc.b    's','k','o','n','t','r','o','l','l','a','n','t','e','n',' ','k'
        dc.b    'o','m','m','e','r',' ','a','t','t',' ',$E4,'t','a',' ','u','p'
        dc.b    'p',' ','d','i','n',' ','T','V',' ','f','a','s','t',' ','d','e'
        dc.b    'n',' ',$E4,'r',' ','b','l',$E5,0
        EVEN
str_930:
        dc.b    'V','a','r','a',' ','s','k','u','r','k','e','n',' ','i',' ','e'
        dc.b    'n',' ','f','i','l','m',' ','d',$E4,'r',' ','h','j',$E4,'l','t'
        dc.b    'e','n',' ','r','i','d','e','r',' ','p',$E5,' ','e','n',' ','b'
        dc.b    'o','k','h','y','l','l','a',0
        EVEN
str_931:
        dc.b    'K','l','i','p','p','a',' ','u','t',' ','a','l','l','a',' ','n'
        dc.b    'u','m','m','e','r',' ','p',$E5,' ','C','P','-','l','i','s','t'
        dc.b    'a','n',' ','o','c','h',' ','l','i','m','m','a',' ','f','a','s'
        dc.b    't',' ','d','o','m',' ','p',$E5,' ','e','t','t',' ','s','k','o'
        dc.b    'h','o','r','n',0
        EVEN
str_932:
        dc.b    'S','a','m','l','a',' ','p',$E5,' ','l','i','k','v',$E4,'r','d'
        dc.b    'i','g','a',' ','s','a','k','e','r',0
        EVEN
str_933:
        dc.b    'S','t','a','v','a',' ','s','t','a','v','h','o','p','p',' ','u'
        dc.b    't','a','n',' ','a','v','h','o','p','p',0
        EVEN
str_934:
        dc.b    'M','o','n','t','e','r','a',' ','i','n',' ','p','i','t','c','h'
        dc.b    'k','o','n','t','r','o','l','l',' ','p',$E5,' ','s','i','n',' '
        dc.b    'h',$E5,'r','d','d','i','s','k',0
        EVEN
str_935:
        dc.b    'M','o','r','r','a',' ','s','o','m',' ','M','u','s','s','e',' '
        dc.b    'P','i','g','g',' ','v','i','d',' ','v',$E4,'l',' ','p','l','a'
        dc.b    'n','e','r','a','d','e',' ','t','i','l','l','f',$E4,'l','l','e'
        dc.b    'n',0
        EVEN
str_936:
        dc.b    'V','a','r','a',' ','s','t','u','n','t','m','a','n',' ',$E5,'t'
        dc.b    ' ','T','e','l','e','v','i','n','k','e','n',0
        EVEN
str_937:
        dc.b    'F','e','j','k','a',' ','j','o','r','d','b',$E4,'v','n','i','n'
        dc.b    'g','a','r',0
        EVEN
str_938:
        dc.b    'B','y','t','a',' ','u','t',' ','s','i','n','a',' ','t',$E4,'n'
        dc.b    'd','e','r',' ','m','o','t',' ','P','e','z',0
        EVEN
str_939:
        dc.b    'K','r','y','p','a',' ','u','n','d','e','r',' ','e','n',' ','k'
        dc.b    'u','n','d','v','a','g','n',' ','o','c','h',' ','h','o','p','p'
        dc.b    'a','s',' ','a','t','t',' ','n',$E5,'g','o','n',' ','h','a','r'
        dc.b    ' ','v',$E4,'g','a','r','n','a',' ','f',$F6,'r','b','i',0
        EVEN
str_940:
        dc.b    'S','m','y','g','a',' ','n','e','r',' ','C','P','-','l','i','s'
        dc.b    't','a','n',' ','i',' ','S','v','e','n','s','k','a',' ','A','k'
        dc.b    'a','d','e','m','i','n','s',' ','O','r','d','l','i','s','t','a'
        dc.b    0
        EVEN
str_941:
        dc.b    'K','o','s','t','a',' ','p',$E5,' ','s','i','g',' ','s','u','r'
        dc.b    'r','o','u','n','d','l','j','u','d',' ','t','i','l','l',' ','s'
        dc.b    'i','n',' ','m','o','b','i','l','t','e','l','e','f','o','n',0
        EVEN
str_942:
        dc.b    $C5,'k','a',' ','k','a','r','u','s','e','l','l',' ','p',$E5,' '
        dc.b    'i','n','t','e','r','n','e','t',0
        EVEN
str_943:
        dc.b    'P','o','l','i','s','a','n','m',$E4,'l','a',' ','a','l','l','a'
        dc.b    ' ','s','t','r',$F6,'m','a','v','b','r','o','t','t',0
        EVEN
str_944:
        dc.b    'U','t','f',$F6,'r','a',' ','h','j',$E4,'l','m','k','o','n','t'
        dc.b    'r','o','l','l',' ','p',$E5,' ','l','o','k','a','l','b','u','s'
        dc.b    's','e','n',0
        EVEN
str_945:
        dc.b    'R','u','l','l','a',' ','s','n','a','b','b','a','r','e',' ',$E4
        dc.b    'n',' ','S','i','x','t','e','n',0
        EVEN
str_946:
        dc.b    'M','a','s','k','e','r','a',' ','s','i','g',' ','t','i','l','l'
        dc.b    ' ','c','h','a','r','m','t','r','o','l','l',0
        EVEN
str_947:
        dc.b    'K','e','l','a',' ','m','e','d',' ','k','a','k','t','u','s','a'
        dc.b    'r',0
        EVEN
str_948:
        dc.b    'P','e','t','a',' ','b','o','r','t',' ','a','l','l','a',' ','l'
        dc.b    'i','n','g','o','n',' ','f','r',$E5,'n',' ','y','o','g','h','u'
        dc.b    'r','t','e','n',0
        EVEN
str_949:
        dc.b    'I','s','o','l','e','r','a',' ','v','i','n','d','e','n',' ','m'
        dc.b    'e','d',' ','v','i','n','d','t',$E4,'t','a',' ','j','a','c','k'
        dc.b    'o','r',0
        EVEN
str_950:
        dc.b    'J','o','b','b','a',' ','s','o','m',' ','s','o','t','a','r','e'
        dc.b    ' ','p',$E5,' ','n',$E5,'g','o','t',' ','t','r','e','v','l','i'
        dc.b    'g','t',' ','c','a','f',$E9,0
        EVEN
str_951:
        dc.b    'V','i','n','k','a',' ','t','i','l','l',' ','s','i','g',' ','e'
        dc.b    't','t',' ','k','n','i','p','p','e',' ','n','y','a',' ','n','i'
        dc.b    'n','t','e','n','d','o','s','p','e','l',0
        EVEN
str_952:
        dc.b    'S','j','u','k','a','n','m',$E4,'l','a',' ','I','n','g','v','a'
        dc.b    'r',' ','O','l','d','s','b','e','r','g',' ','m','i','t','t',' '
        dc.b    'i',' ','e','t','t',' ','k','e','d','j','e','b','y','t','e',0
        EVEN
str_953:
        dc.b    'A','n','o','r','d','n','a',' ','V','M',' ','i',' ','h','u','s'
        dc.b    'm','a','n','s','k','o','s','t',' ','f',$F6,'r',' ','t','r','e'
        dc.b    'd','j','e',' ',$E5,'r','e','t',' ','i',' ','r','a','d',0
        EVEN
str_954:
        dc.b    'N','y','k','t','r','a',' ','t','i','l','l',' ','h','o','s',' '
        dc.b    'g','u','l','d','s','m','e','d','e','n',0
        EVEN
str_955:
        dc.b    'K','l','i','p','p','a',' ','s','i','g',' ','p',$E5,' ',$F6,'p'
        dc.b    'p','e','t',' ','k',$F6,'p',0
        EVEN
str_956:
        dc.b    'L','e','g','i','t','i','m','e','r','a',' ','s','i','g',' ','s'
        dc.b    'o','m',' ','b','l','o','c','k','f','l',$F6,'j','t','s','i','n'
        dc.b    's','p','e','k','t',$F6,'r','e','n',' ','f','r',$E5,'n',' ','H'
        dc.b    $E4,'r','j','e','d','a','l','e','n',0
        EVEN
str_957:
        dc.b    'T','r','o',' ','a','t','t',' ','m','a','n',' ','b','l','i','r'
        dc.b    ' ','o','r','d','b','l','i','n','d',' ','a','v',' ','m','e','n'
        dc.b    't','h','o','l',0
        EVEN
str_958:
        dc.b    'S','k',$F6,'l','j','a',' ','n','e','r',' ','s','i','n','a',' '
        dc.b    'p','o','l','s','k','a',' ','p','o','m','m','e','s',' ','f','r'
        dc.b    'i','t','e','s',' ','m','e','d',' ','e','n',' ','l','a','g','o'
        dc.b    'm',' ','m',$E4,'n','g','d',' ','m','e','l','l','a','n','m','j'
        dc.b    $F6,'l','k',0
        EVEN
str_959:
        dc.b    'E','m','u','l','e','r','a',' ','b','e','s','t','i','c','k',0
        EVEN
str_960:
        dc.b    'L',$E5,'t','s','a','s',' ','t','a','p','p','a',' ','b','e','n'
        dc.b    'e','n',0
        EVEN
str_961:
        dc.b    'L',$E4,'n','s','a',' ','k','o','r','t','t','e','l','e','f','o'
        dc.b    'n','e','r',0
        EVEN
str_962:
        dc.b    'S','k','r','i','k','a',' ','n','a','z','z','e','s','v','i','n'
        dc.b    ' ',$E5,'t',' ','b','u','d','d','h','i','s','t','m','u','n','k'
        dc.b    'a','r',0
        EVEN
str_963:
        dc.b    'B','i','l','d','a',' ','e','n',' ','g','r','u','p','p',' ','s'
        dc.b    'o','m',' ','h','e','t','e','r',' ','R','u','l','l','i','n','g'
        dc.b    ' ','S','t','o','l','s',0
        EVEN
str_964:
        dc.b    'S','p','e','l','a',' ','l',$E5,'t','e','n',' ',$22,'1','5',' '
        dc.b    'g','a','s','t','a','r',' ','p',$E5,' ','d',$F6,'d',' ','m','a'
        dc.b    'n','s',' ','k','i','s','t','a',$22,' ','p',$E5,' ','b','e','g'
        dc.b    'r','a','v','n','i','n','g',0
        EVEN
str_965:
        dc.b    'T','r','o',' ','a','t','t',' ','R','o','b','e','r','t',' ','A'
        dc.b    's','h','b','e','r','g',' ','k','o','m','m','e','r',' ','a','t'
        dc.b    't',' ','g',$F6,'r','a',' ','r','e','k','l','a','m',' ','f',$F6
        dc.b    'r',' ','m','j',$E4,'l','l','s','h','a','m','p','o','o',0
        EVEN
str_966:
        dc.b    'V',$E4,'d','r','a',' ','b','a','l','k','o','n','g','e','n',' '
        dc.b    'v','i','d',' ','h',$F6,'s','t',' ','o','c','h',' ','v',$E5,'r'
        dc.b    0
        EVEN
str_967:
        dc.b    'F',$F6,'r','s','e',' ','s','i','n','a',' ','f','i','c','k','o'
        dc.b    'r',' ','m','e','d',' ','b','l',$E5,'b',$E4,'r',' ','v','i','d'
        dc.b    ' ','k','l',$E4,'d','s','i','m',0
        EVEN
str_968:
        dc.b    'L','a','n','g','a',' ','v',$E5,'r','r','u','l','l','a','r',' '
        dc.b    't','i','l','l',' ','h',$F6,'r','s','e','l','s','k','a','d','a'
        dc.b    'd','e',0
        EVEN
str_969:
        dc.b    'B','l','i',' ','p','o','r','t','a','d',' ','f','r',$E5,'n',' '
        dc.b    $22,'v','i',' ','i',' ','f','e','m','m','a','n',$22,0
        EVEN
str_970:
        dc.b    'I','n','f',$F6,'r','a',' ','k',$F6,'n','s','k','v','o','r','t'
        dc.b    'e','r','i','n','g',' ','i','n','o','m',' ','d','a','m','f','o'
        dc.b    't','b','o','l','l','e','n',0
        EVEN
str_971:
        dc.b    'M','o','n','t','e','r','a',' ','u','p','p',' ','e','n',' ','s'
        dc.b    'k','y','l','t',' ','d',$E4,'r',' ','d','e','t',' ','s','t',$E5
        dc.b    'r',' ',$22,'M','e','r',' ','r','e','k','l','a','m',',',' ','t'
        dc.b    'a','c','k',$22,' ','u','t','a','n','f',$F6,'r',' ','s','i','n'
        dc.b    ' ','d',$F6,'r','r',0
        EVEN
str_972:
        dc.b    'T','y','c','k','a',' ','a','t','t',' ','D','o','k','t','o','r'
        dc.b    ' ','K','o','s','m','o','s',' ','s','e','r',' ','u','t',' ','s'
        dc.b    'o','m',' ','o','s','t','b',$E5,'g','a','r',0
        EVEN
str_973:
        dc.b    'S','p','r','i','d','a',' ','C','P','-','l','i','s','t','a','n'
        dc.b    ' ','t','i','l','l',' ','k','i','c','k','e','r','s',0
        EVEN
str_974:
        dc.b    'T','y','c','k','a',' ','a','t','t',' ','d','e','t',' ',$E4,'r'
        dc.b    ' ','t','u','f','f','t',' ','m','e','d',' ','a','i','r','-','c'
        dc.b    'o','n','d','i','t','i','o','n',' ','i',' ','b','a','s','t','u'
        dc.b    'n',0
        EVEN
str_975:
        dc.b    'B','l','i',' ','p','a','s','t','o','r',' ','f',$F6,'r',' ','F'
        dc.b    'e','s','k','e','k','y','r','k','a','n',0
        EVEN
str_976:
        dc.b    'F','e','j','k','a',' ','n','y','s','n','i','n','g','a','r',' '
        dc.b    'v','i','d',' ','s','i','t','t',' ','b','r',$F6,'l','l','o','p'
        dc.b    0
        EVEN
str_977:
        dc.b    'S','e',' ','f','r','a','m',' ','e','m','o','t',' ','K','r','a'
        dc.b    'f','t','w','e','r','k','s',' ',$22,'u','n','p','l','u','g','g'
        dc.b    'e','d',$22,' ','s','p','e','l','n','i','n','g',' ','f',$F6,'r'
        dc.b    ' ','M','T','V',0
        EVEN
str_978:
        dc.b    'D','r','i','c','k','a',' ','c','o','c','a','-','c','o','l','a'
        dc.b    ' ','m','e','d',' ','b','l','o','c','k','f','l',$F6,'j','t',0
        EVEN
str_979:
        dc.b    'J','a','g','a',' ','p',$E5,' ','K','o','l','m',$E5,'r','d','e'
        dc.b    'n',0
        EVEN
str_980:
        dc.b    'H',$E5,'n','g','l','a',' ','m','e','d',' ','s','t','o','l','a'
        dc.b    'r',0
        EVEN
str_981:
        dc.b    'S','n','i','c','k','r','a',' ','e','n',' ','a','l','k','o','t'
        dc.b    'e','s','t','a','r','e',' ','m','e','d',' ','h','i','g','h','s'
        dc.b    'c','o','r','e','l','i','s','t','a',0
        EVEN
str_982:
        dc.b    'B','l','i',' ','k','i','c','k','e','r',' ','p',$E5,' ','I','R'
        dc.b    'C',0
        EVEN
str_983:
        dc.b    'D','r','i','c','k','a',' ','k','a','f','f','e',' ','u','r',' '
        dc.b    'v','a','t','t','e','n','k','r','a','n','e','n',0
        EVEN
str_984:
        dc.b    'T','r','o',' ','a','t','t',' ','m','y','r','o','r',' ',$E4,'r'
        dc.b    ' ','s','m',$E5,' ',$E4,'l','g','a','r',0
        EVEN
str_985:
        dc.b    'S','k','y','l','l','a',' ','v','a','r','t','a','n','n','a','t'
        dc.b    ' ','s','t','r',$F6,'m','a','v','b','r','o','t','t',' ','p',$E5
        dc.b    ' ','R','i','c','k','i',' ','L','a','k','e',0
        EVEN
str_986:
        dc.b    'S','a','t','s','a',' ','p',$E5,' ','e','n',' ','p','r','o','f'
        dc.b    'e','s','s','i','o','n','e','l','l',' ','k','a','r','r','i',$E4
        dc.b    'r',' ','s','o','m',' ','r','a','d','i','o','a','m','a','t',$F6
        dc.b    'r',0
        EVEN
str_987:
        dc.b    'T','a',' ','m','e','d',' ','s','i','g',' ','e','g','e','n',' '
        dc.b    'g','a','l','g','e',' ','t','i','l','l',' ','k','r','o','g','e'
        dc.b    'n',0
        EVEN
str_988:
        dc.b    'G',$E5,' ','i',' ','j','o','g','g','i','n','g','d','r','e','s'
        dc.b    's',' ','n',$E4,'r',' ','m','a','n',' ',$E4,'r',' ','a','r','b'
        dc.b    'e','t','s','l',$F6,'s',0
        EVEN
str_989:
        dc.b    'J','o','d','d','l','a',' ','k','o','r','v',0
        EVEN
str_990:
        dc.b    'A','n','s',$F6,'k','a',' ','o','m',' ','b','o','n','d','p','e'
        dc.b    'r','m','i','s',' ','i',' ','l','u','m','p','e','n',0
        EVEN
str_991:
        dc.b    'K','o','m','p','o','n','e','r','a',' ','e','t','t',' ','s','o'
        dc.b    'u','n','d','t','r','a','c','k',' ','t','i','l','l',' ','C','P'
        dc.b    '-','l','i','s','t','a','n',0
        EVEN
str_992:
        dc.b    'A','n','s','t',$E4,'l','l','a',' ','e','n',' ','e','l','a','k'
        dc.b    ' ','s','p','i','n','d','e','l',0
        EVEN
str_993:
        dc.b    'T','i','l','l','v','e','r','k','a',' ','x','y','l','i','t','o'
        dc.b    'l','f','r','i',' ','g','o','d','i','s',0
        EVEN
str_994:
        dc.b    'K','a','r','t','l',$E4,'g','g','a',' ','S','v','e','r','i','g'
        dc.b    'e','s',' ','b','r','u','n','n','s','l','o','c','k',0
        EVEN
str_995:
        dc.b    'G','i','f','t','a',' ','s','i','g',' ','i',' ','b',$F6,'n','e'
        dc.b    'k','y','r','k','a',0
        EVEN
str_996:
        dc.b    'K',$F6,'p','a',' ','s','k','o','r',' ','f',$F6,'r',' ','a','t'
        dc.b    't',' ','f',$E5,' ','e','n',' ','p','r','a','k','t','i','s','k'
        dc.b    ' ','l',$E5,'d','a',' ','a','t','t',' ','f',$F6,'r','v','a','r'
        dc.b    'a',' ','d','i','s','k','e','t','t','e','r',' ','i',0
        EVEN
str_997:
        dc.b    'G',$E5,' ','t','i','l','l',' ','I','K','E','A',' ','o','c','h'
        dc.b    ' ','v','i','s','a',' ','v','a','r','t',' ','s','k',$E5,'p','e'
        dc.b    't',' ','s','k','a',' ','s','t',$E5,0
        EVEN
str_998:
        dc.b    'B','y','g','g','a',' ','e','n',' ','b','a','t','t','e','r','i'
        dc.b    'd','r','i','v','e','n',' ','k','o','m','p','a','s','s',0
        EVEN
str_999:
        dc.b    'G',$E5,' ','i',' ','b','o','r','g','e','n',' ','f',$F6,'r',' '
        dc.b    'N','i','c','k',' ','B','o','r','g','e','n',0
        EVEN

        END
