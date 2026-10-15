; CP Listan - AmiExpress 68020 Assembly Door
; Displays a random line from the classic CP list
; Uses dos.library DateStamp() for entropy
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
        movem.l d0-d7/a0-a6,-(sp)       ; Save all registers

        ; Get data base address into A4 (for variables)
        lea     data_start(pc),a4

        move.l  ABSEXECBASE,a6
        tst.l   a6
        beq     .exit

        ; Open dos.library for DateStamp
        lea     dos_name(pc),a1
        moveq   #0,d0
        jsr     LVO_OpenLibrary(a6)
        move.l  d0,dos_base-data_start(a4)
        beq     .no_dos

        ; Call DateStamp to get current time
        ; DateStamp(stamp) - D1 = pointer to DateStamp structure
        move.l  dos_base-data_start(a4),a6
        lea     datestamp-data_start(a4),a0
        move.l  a0,d1
        jsr     LVO_DateStamp(a6)

        ; Use ds_Tick (offset 8) XORed with ds_Minute (offset 4) for entropy
        ; DateStamp: ds_Days(0), ds_Minute(4), ds_Tick(8)
        move.l  datestamp+8-data_start(a4),d0   ; ds_Tick (changes 50x/sec)
        move.l  datestamp+4-data_start(a4),d1   ; ds_Minute
        eor.l   d1,d0                            ; Mix them
        move.l  datestamp-data_start(a4),d1     ; ds_Days
        eor.l   d1,d0                            ; Mix days too
        bra     .got_seed

.no_dos:
        ; Fallback: use stack pointer as entropy (not great but something)
        move.l  sp,d0

.got_seed:
        ; D0 = seed value, compute index 0 to TOTAL_STRINGS-1
        ; Use unsigned division: index = seed mod 999
        and.l   #$7FFFFFFF,d0           ; Make positive
        divu.w  #TOTAL_STRINGS,d0       ; D0.W = quotient, D0.HW = remainder
        swap    d0                       ; Get remainder in low word
        and.l   #$FFFF,d0               ; Clear high word

        ; Save random index BEFORE CloseLibrary clobbers D0
        move.l  d0,random_index-data_start(a4)

        ; Close dos.library
        move.l  dos_base-data_start(a4),d1
        beq     .open_aedoor
        move.l  ABSEXECBASE,a6
        move.l  d1,a1
        jsr     LVO_CloseLibrary(a6)

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

        ; Get string index
        move.l  random_index-data_start(a4),d0

        ; Get string offset from table
        lea     start(pc),a2            ; A2 = start of code
        add.l   #offset_table-start,a2  ; A2 = offset_table
        lsl.l   #2,d0                   ; D0 = index * 4
        move.l  (a2,d0.l),d1            ; D1 = offset from string_data

        ; Calculate actual string address
        lea     start(pc),a0
        add.l   #string_data-start,a0   ; A0 = string_data base
        add.l   d1,a0                   ; A0 = actual string address

        ; Output the string
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

; Data area (in same section, close to code for PC-relative)
data_start:
aedoor_base:    dc.l    0
dos_base:       dc.l    0
random_index:   dc.l    0
datestamp:      dc.l    0,0,0           ; DateStamp structure: ds_Days, ds_Minute, ds_Tick

dos_name:       dc.b    'dos.library',0
        EVEN
aedoor_name:    dc.b    'AEDoor.library',0
        EVEN
header_msg:
        dc.b    13,10,'HUR DU BLIR ETT ',$C4,'KTA CP DELUXE:',13,10,13,10,0
        EVEN
footer_msg:
        dc.b    13,10,0
        EVEN
crlf:
        dc.b    13,10,0
        EVEN

; Offset table - each entry is the offset from string_data to the string
; This allows us to handle >32KB of string data
offset_table:
        dc.l    str_0-string_data
        dc.l    str_1-string_data
        dc.l    str_2-string_data
        dc.l    str_3-string_data
        dc.l    str_4-string_data
        dc.l    str_5-string_data
        dc.l    str_6-string_data
        dc.l    str_7-string_data
        dc.l    str_8-string_data
        dc.l    str_9-string_data
        dc.l    str_10-string_data
        dc.l    str_11-string_data
        dc.l    str_12-string_data
        dc.l    str_13-string_data
        dc.l    str_14-string_data
        dc.l    str_15-string_data
        dc.l    str_16-string_data
        dc.l    str_17-string_data
        dc.l    str_18-string_data
        dc.l    str_19-string_data
        dc.l    str_20-string_data
        dc.l    str_21-string_data
        dc.l    str_22-string_data
        dc.l    str_23-string_data
        dc.l    str_24-string_data
        dc.l    str_25-string_data
        dc.l    str_26-string_data
        dc.l    str_27-string_data
        dc.l    str_28-string_data
        dc.l    str_29-string_data
        dc.l    str_30-string_data
        dc.l    str_31-string_data
        dc.l    str_32-string_data
        dc.l    str_33-string_data
        dc.l    str_34-string_data
        dc.l    str_35-string_data
        dc.l    str_36-string_data
        dc.l    str_37-string_data
        dc.l    str_38-string_data
        dc.l    str_39-string_data
        dc.l    str_40-string_data
        dc.l    str_41-string_data
        dc.l    str_42-string_data
        dc.l    str_43-string_data
        dc.l    str_44-string_data
        dc.l    str_45-string_data
        dc.l    str_46-string_data
        dc.l    str_47-string_data
        dc.l    str_48-string_data
        dc.l    str_49-string_data
        dc.l    str_50-string_data
        dc.l    str_51-string_data
        dc.l    str_52-string_data
        dc.l    str_53-string_data
        dc.l    str_54-string_data
        dc.l    str_55-string_data
        dc.l    str_56-string_data
        dc.l    str_57-string_data
        dc.l    str_58-string_data
        dc.l    str_59-string_data
        dc.l    str_60-string_data
        dc.l    str_61-string_data
        dc.l    str_62-string_data
        dc.l    str_63-string_data
        dc.l    str_64-string_data
        dc.l    str_65-string_data
        dc.l    str_66-string_data
        dc.l    str_67-string_data
        dc.l    str_68-string_data
        dc.l    str_69-string_data
        dc.l    str_70-string_data
        dc.l    str_71-string_data
        dc.l    str_72-string_data
        dc.l    str_73-string_data
        dc.l    str_74-string_data
        dc.l    str_75-string_data
        dc.l    str_76-string_data
        dc.l    str_77-string_data
        dc.l    str_78-string_data
        dc.l    str_79-string_data
        dc.l    str_80-string_data
        dc.l    str_81-string_data
        dc.l    str_82-string_data
        dc.l    str_83-string_data
        dc.l    str_84-string_data
        dc.l    str_85-string_data
        dc.l    str_86-string_data
        dc.l    str_87-string_data
        dc.l    str_88-string_data
        dc.l    str_89-string_data
        dc.l    str_90-string_data
        dc.l    str_91-string_data
        dc.l    str_92-string_data
        dc.l    str_93-string_data
        dc.l    str_94-string_data
        dc.l    str_95-string_data
        dc.l    str_96-string_data
        dc.l    str_97-string_data
        dc.l    str_98-string_data
        dc.l    str_99-string_data
        dc.l    str_100-string_data
        dc.l    str_101-string_data
        dc.l    str_102-string_data
        dc.l    str_103-string_data
        dc.l    str_104-string_data
        dc.l    str_105-string_data
        dc.l    str_106-string_data
        dc.l    str_107-string_data
        dc.l    str_108-string_data
        dc.l    str_109-string_data
        dc.l    str_110-string_data
        dc.l    str_111-string_data
        dc.l    str_112-string_data
        dc.l    str_113-string_data
        dc.l    str_114-string_data
        dc.l    str_115-string_data
        dc.l    str_116-string_data
        dc.l    str_117-string_data
        dc.l    str_118-string_data
        dc.l    str_119-string_data
        dc.l    str_120-string_data
        dc.l    str_121-string_data
        dc.l    str_122-string_data
        dc.l    str_123-string_data
        dc.l    str_124-string_data
        dc.l    str_125-string_data
        dc.l    str_126-string_data
        dc.l    str_127-string_data
        dc.l    str_128-string_data
        dc.l    str_129-string_data
        dc.l    str_130-string_data
        dc.l    str_131-string_data
        dc.l    str_132-string_data
        dc.l    str_133-string_data
        dc.l    str_134-string_data
        dc.l    str_135-string_data
        dc.l    str_136-string_data
        dc.l    str_137-string_data
        dc.l    str_138-string_data
        dc.l    str_139-string_data
        dc.l    str_140-string_data
        dc.l    str_141-string_data
        dc.l    str_142-string_data
        dc.l    str_143-string_data
        dc.l    str_144-string_data
        dc.l    str_145-string_data
        dc.l    str_146-string_data
        dc.l    str_147-string_data
        dc.l    str_148-string_data
        dc.l    str_149-string_data
        dc.l    str_150-string_data
        dc.l    str_151-string_data
        dc.l    str_152-string_data
        dc.l    str_153-string_data
        dc.l    str_154-string_data
        dc.l    str_155-string_data
        dc.l    str_156-string_data
        dc.l    str_157-string_data
        dc.l    str_158-string_data
        dc.l    str_159-string_data
        dc.l    str_160-string_data
        dc.l    str_161-string_data
        dc.l    str_162-string_data
        dc.l    str_163-string_data
        dc.l    str_164-string_data
        dc.l    str_165-string_data
        dc.l    str_166-string_data
        dc.l    str_167-string_data
        dc.l    str_168-string_data
        dc.l    str_169-string_data
        dc.l    str_170-string_data
        dc.l    str_171-string_data
        dc.l    str_172-string_data
        dc.l    str_173-string_data
        dc.l    str_174-string_data
        dc.l    str_175-string_data
        dc.l    str_176-string_data
        dc.l    str_177-string_data
        dc.l    str_178-string_data
        dc.l    str_179-string_data
        dc.l    str_180-string_data
        dc.l    str_181-string_data
        dc.l    str_182-string_data
        dc.l    str_183-string_data
        dc.l    str_184-string_data
        dc.l    str_185-string_data
        dc.l    str_186-string_data
        dc.l    str_187-string_data
        dc.l    str_188-string_data
        dc.l    str_189-string_data
        dc.l    str_190-string_data
        dc.l    str_191-string_data
        dc.l    str_192-string_data
        dc.l    str_193-string_data
        dc.l    str_194-string_data
        dc.l    str_195-string_data
        dc.l    str_196-string_data
        dc.l    str_197-string_data
        dc.l    str_198-string_data
        dc.l    str_199-string_data
        dc.l    str_200-string_data
        dc.l    str_201-string_data
        dc.l    str_202-string_data
        dc.l    str_203-string_data
        dc.l    str_204-string_data
        dc.l    str_205-string_data
        dc.l    str_206-string_data
        dc.l    str_207-string_data
        dc.l    str_208-string_data
        dc.l    str_209-string_data
        dc.l    str_210-string_data
        dc.l    str_211-string_data
        dc.l    str_212-string_data
        dc.l    str_213-string_data
        dc.l    str_214-string_data
        dc.l    str_215-string_data
        dc.l    str_216-string_data
        dc.l    str_217-string_data
        dc.l    str_218-string_data
        dc.l    str_219-string_data
        dc.l    str_220-string_data
        dc.l    str_221-string_data
        dc.l    str_222-string_data
        dc.l    str_223-string_data
        dc.l    str_224-string_data
        dc.l    str_225-string_data
        dc.l    str_226-string_data
        dc.l    str_227-string_data
        dc.l    str_228-string_data
        dc.l    str_229-string_data
        dc.l    str_230-string_data
        dc.l    str_231-string_data
        dc.l    str_232-string_data
        dc.l    str_233-string_data
        dc.l    str_234-string_data
        dc.l    str_235-string_data
        dc.l    str_236-string_data
        dc.l    str_237-string_data
        dc.l    str_238-string_data
        dc.l    str_239-string_data
        dc.l    str_240-string_data
        dc.l    str_241-string_data
        dc.l    str_242-string_data
        dc.l    str_243-string_data
        dc.l    str_244-string_data
        dc.l    str_245-string_data
        dc.l    str_246-string_data
        dc.l    str_247-string_data
        dc.l    str_248-string_data
        dc.l    str_249-string_data
        dc.l    str_250-string_data
        dc.l    str_251-string_data
        dc.l    str_252-string_data
        dc.l    str_253-string_data
        dc.l    str_254-string_data
        dc.l    str_255-string_data
        dc.l    str_256-string_data
        dc.l    str_257-string_data
        dc.l    str_258-string_data
        dc.l    str_259-string_data
        dc.l    str_260-string_data
        dc.l    str_261-string_data
        dc.l    str_262-string_data
        dc.l    str_263-string_data
        dc.l    str_264-string_data
        dc.l    str_265-string_data
        dc.l    str_266-string_data
        dc.l    str_267-string_data
        dc.l    str_268-string_data
        dc.l    str_269-string_data
        dc.l    str_270-string_data
        dc.l    str_271-string_data
        dc.l    str_272-string_data
        dc.l    str_273-string_data
        dc.l    str_274-string_data
        dc.l    str_275-string_data
        dc.l    str_276-string_data
        dc.l    str_277-string_data
        dc.l    str_278-string_data
        dc.l    str_279-string_data
        dc.l    str_280-string_data
        dc.l    str_281-string_data
        dc.l    str_282-string_data
        dc.l    str_283-string_data
        dc.l    str_284-string_data
        dc.l    str_285-string_data
        dc.l    str_286-string_data
        dc.l    str_287-string_data
        dc.l    str_288-string_data
        dc.l    str_289-string_data
        dc.l    str_290-string_data
        dc.l    str_291-string_data
        dc.l    str_292-string_data
        dc.l    str_293-string_data
        dc.l    str_294-string_data
        dc.l    str_295-string_data
        dc.l    str_296-string_data
        dc.l    str_297-string_data
        dc.l    str_298-string_data
        dc.l    str_299-string_data
        dc.l    str_300-string_data
        dc.l    str_301-string_data
        dc.l    str_302-string_data
        dc.l    str_303-string_data
        dc.l    str_304-string_data
        dc.l    str_305-string_data
        dc.l    str_306-string_data
        dc.l    str_307-string_data
        dc.l    str_308-string_data
        dc.l    str_309-string_data
        dc.l    str_310-string_data
        dc.l    str_311-string_data
        dc.l    str_312-string_data
        dc.l    str_313-string_data
        dc.l    str_314-string_data
        dc.l    str_315-string_data
        dc.l    str_316-string_data
        dc.l    str_317-string_data
        dc.l    str_318-string_data
        dc.l    str_319-string_data
        dc.l    str_320-string_data
        dc.l    str_321-string_data
        dc.l    str_322-string_data
        dc.l    str_323-string_data
        dc.l    str_324-string_data
        dc.l    str_325-string_data
        dc.l    str_326-string_data
        dc.l    str_327-string_data
        dc.l    str_328-string_data
        dc.l    str_329-string_data
        dc.l    str_330-string_data
        dc.l    str_331-string_data
        dc.l    str_332-string_data
        dc.l    str_333-string_data
        dc.l    str_334-string_data
        dc.l    str_335-string_data
        dc.l    str_336-string_data
        dc.l    str_337-string_data
        dc.l    str_338-string_data
        dc.l    str_339-string_data
        dc.l    str_340-string_data
        dc.l    str_341-string_data
        dc.l    str_342-string_data
        dc.l    str_343-string_data
        dc.l    str_344-string_data
        dc.l    str_345-string_data
        dc.l    str_346-string_data
        dc.l    str_347-string_data
        dc.l    str_348-string_data
        dc.l    str_349-string_data
        dc.l    str_350-string_data
        dc.l    str_351-string_data
        dc.l    str_352-string_data
        dc.l    str_353-string_data
        dc.l    str_354-string_data
        dc.l    str_355-string_data
        dc.l    str_356-string_data
        dc.l    str_357-string_data
        dc.l    str_358-string_data
        dc.l    str_359-string_data
        dc.l    str_360-string_data
        dc.l    str_361-string_data
        dc.l    str_362-string_data
        dc.l    str_363-string_data
        dc.l    str_364-string_data
        dc.l    str_365-string_data
        dc.l    str_366-string_data
        dc.l    str_367-string_data
        dc.l    str_368-string_data
        dc.l    str_369-string_data
        dc.l    str_370-string_data
        dc.l    str_371-string_data
        dc.l    str_372-string_data
        dc.l    str_373-string_data
        dc.l    str_374-string_data
        dc.l    str_375-string_data
        dc.l    str_376-string_data
        dc.l    str_377-string_data
        dc.l    str_378-string_data
        dc.l    str_379-string_data
        dc.l    str_380-string_data
        dc.l    str_381-string_data
        dc.l    str_382-string_data
        dc.l    str_383-string_data
        dc.l    str_384-string_data
        dc.l    str_385-string_data
        dc.l    str_386-string_data
        dc.l    str_387-string_data
        dc.l    str_388-string_data
        dc.l    str_389-string_data
        dc.l    str_390-string_data
        dc.l    str_391-string_data
        dc.l    str_392-string_data
        dc.l    str_393-string_data
        dc.l    str_394-string_data
        dc.l    str_395-string_data
        dc.l    str_396-string_data
        dc.l    str_397-string_data
        dc.l    str_398-string_data
        dc.l    str_399-string_data
        dc.l    str_400-string_data
        dc.l    str_401-string_data
        dc.l    str_402-string_data
        dc.l    str_403-string_data
        dc.l    str_404-string_data
        dc.l    str_405-string_data
        dc.l    str_406-string_data
        dc.l    str_407-string_data
        dc.l    str_408-string_data
        dc.l    str_409-string_data
        dc.l    str_410-string_data
        dc.l    str_411-string_data
        dc.l    str_412-string_data
        dc.l    str_413-string_data
        dc.l    str_414-string_data
        dc.l    str_415-string_data
        dc.l    str_416-string_data
        dc.l    str_417-string_data
        dc.l    str_418-string_data
        dc.l    str_419-string_data
        dc.l    str_420-string_data
        dc.l    str_421-string_data
        dc.l    str_422-string_data
        dc.l    str_423-string_data
        dc.l    str_424-string_data
        dc.l    str_425-string_data
        dc.l    str_426-string_data
        dc.l    str_427-string_data
        dc.l    str_428-string_data
        dc.l    str_429-string_data
        dc.l    str_430-string_data
        dc.l    str_431-string_data
        dc.l    str_432-string_data
        dc.l    str_433-string_data
        dc.l    str_434-string_data
        dc.l    str_435-string_data
        dc.l    str_436-string_data
        dc.l    str_437-string_data
        dc.l    str_438-string_data
        dc.l    str_439-string_data
        dc.l    str_440-string_data
        dc.l    str_441-string_data
        dc.l    str_442-string_data
        dc.l    str_443-string_data
        dc.l    str_444-string_data
        dc.l    str_445-string_data
        dc.l    str_446-string_data
        dc.l    str_447-string_data
        dc.l    str_448-string_data
        dc.l    str_449-string_data
        dc.l    str_450-string_data
        dc.l    str_451-string_data
        dc.l    str_452-string_data
        dc.l    str_453-string_data
        dc.l    str_454-string_data
        dc.l    str_455-string_data
        dc.l    str_456-string_data
        dc.l    str_457-string_data
        dc.l    str_458-string_data
        dc.l    str_459-string_data
        dc.l    str_460-string_data
        dc.l    str_461-string_data
        dc.l    str_462-string_data
        dc.l    str_463-string_data
        dc.l    str_464-string_data
        dc.l    str_465-string_data
        dc.l    str_466-string_data
        dc.l    str_467-string_data
        dc.l    str_468-string_data
        dc.l    str_469-string_data
        dc.l    str_470-string_data
        dc.l    str_471-string_data
        dc.l    str_472-string_data
        dc.l    str_473-string_data
        dc.l    str_474-string_data
        dc.l    str_475-string_data
        dc.l    str_476-string_data
        dc.l    str_477-string_data
        dc.l    str_478-string_data
        dc.l    str_479-string_data
        dc.l    str_480-string_data
        dc.l    str_481-string_data
        dc.l    str_482-string_data
        dc.l    str_483-string_data
        dc.l    str_484-string_data
        dc.l    str_485-string_data
        dc.l    str_486-string_data
        dc.l    str_487-string_data
        dc.l    str_488-string_data
        dc.l    str_489-string_data
        dc.l    str_490-string_data
        dc.l    str_491-string_data
        dc.l    str_492-string_data
        dc.l    str_493-string_data
        dc.l    str_494-string_data
        dc.l    str_495-string_data
        dc.l    str_496-string_data
        dc.l    str_497-string_data
        dc.l    str_498-string_data
        dc.l    str_499-string_data
        dc.l    str_500-string_data
        dc.l    str_501-string_data
        dc.l    str_502-string_data
        dc.l    str_503-string_data
        dc.l    str_504-string_data
        dc.l    str_505-string_data
        dc.l    str_506-string_data
        dc.l    str_507-string_data
        dc.l    str_508-string_data
        dc.l    str_509-string_data
        dc.l    str_510-string_data
        dc.l    str_511-string_data
        dc.l    str_512-string_data
        dc.l    str_513-string_data
        dc.l    str_514-string_data
        dc.l    str_515-string_data
        dc.l    str_516-string_data
        dc.l    str_517-string_data
        dc.l    str_518-string_data
        dc.l    str_519-string_data
        dc.l    str_520-string_data
        dc.l    str_521-string_data
        dc.l    str_522-string_data
        dc.l    str_523-string_data
        dc.l    str_524-string_data
        dc.l    str_525-string_data
        dc.l    str_526-string_data
        dc.l    str_527-string_data
        dc.l    str_528-string_data
        dc.l    str_529-string_data
        dc.l    str_530-string_data
        dc.l    str_531-string_data
        dc.l    str_532-string_data
        dc.l    str_533-string_data
        dc.l    str_534-string_data
        dc.l    str_535-string_data
        dc.l    str_536-string_data
        dc.l    str_537-string_data
        dc.l    str_538-string_data
        dc.l    str_539-string_data
        dc.l    str_540-string_data
        dc.l    str_541-string_data
        dc.l    str_542-string_data
        dc.l    str_543-string_data
        dc.l    str_544-string_data
        dc.l    str_545-string_data
        dc.l    str_546-string_data
        dc.l    str_547-string_data
        dc.l    str_548-string_data
        dc.l    str_549-string_data
        dc.l    str_550-string_data
        dc.l    str_551-string_data
        dc.l    str_552-string_data
        dc.l    str_553-string_data
        dc.l    str_554-string_data
        dc.l    str_555-string_data
        dc.l    str_556-string_data
        dc.l    str_557-string_data
        dc.l    str_558-string_data
        dc.l    str_559-string_data
        dc.l    str_560-string_data
        dc.l    str_561-string_data
        dc.l    str_562-string_data
        dc.l    str_563-string_data
        dc.l    str_564-string_data
        dc.l    str_565-string_data
        dc.l    str_566-string_data
        dc.l    str_567-string_data
        dc.l    str_568-string_data
        dc.l    str_569-string_data
        dc.l    str_570-string_data
        dc.l    str_571-string_data
        dc.l    str_572-string_data
        dc.l    str_573-string_data
        dc.l    str_574-string_data
        dc.l    str_575-string_data
        dc.l    str_576-string_data
        dc.l    str_577-string_data
        dc.l    str_578-string_data
        dc.l    str_579-string_data
        dc.l    str_580-string_data
        dc.l    str_581-string_data
        dc.l    str_582-string_data
        dc.l    str_583-string_data
        dc.l    str_584-string_data
        dc.l    str_585-string_data
        dc.l    str_586-string_data
        dc.l    str_587-string_data
        dc.l    str_588-string_data
        dc.l    str_589-string_data
        dc.l    str_590-string_data
        dc.l    str_591-string_data
        dc.l    str_592-string_data
        dc.l    str_593-string_data
        dc.l    str_594-string_data
        dc.l    str_595-string_data
        dc.l    str_596-string_data
        dc.l    str_597-string_data
        dc.l    str_598-string_data
        dc.l    str_599-string_data
        dc.l    str_600-string_data
        dc.l    str_601-string_data
        dc.l    str_602-string_data
        dc.l    str_603-string_data
        dc.l    str_604-string_data
        dc.l    str_605-string_data
        dc.l    str_606-string_data
        dc.l    str_607-string_data
        dc.l    str_608-string_data
        dc.l    str_609-string_data
        dc.l    str_610-string_data
        dc.l    str_611-string_data
        dc.l    str_612-string_data
        dc.l    str_613-string_data
        dc.l    str_614-string_data
        dc.l    str_615-string_data
        dc.l    str_616-string_data
        dc.l    str_617-string_data
        dc.l    str_618-string_data
        dc.l    str_619-string_data
        dc.l    str_620-string_data
        dc.l    str_621-string_data
        dc.l    str_622-string_data
        dc.l    str_623-string_data
        dc.l    str_624-string_data
        dc.l    str_625-string_data
        dc.l    str_626-string_data
        dc.l    str_627-string_data
        dc.l    str_628-string_data
        dc.l    str_629-string_data
        dc.l    str_630-string_data
        dc.l    str_631-string_data
        dc.l    str_632-string_data
        dc.l    str_633-string_data
        dc.l    str_634-string_data
        dc.l    str_635-string_data
        dc.l    str_636-string_data
        dc.l    str_637-string_data
        dc.l    str_638-string_data
        dc.l    str_639-string_data
        dc.l    str_640-string_data
        dc.l    str_641-string_data
        dc.l    str_642-string_data
        dc.l    str_643-string_data
        dc.l    str_644-string_data
        dc.l    str_645-string_data
        dc.l    str_646-string_data
        dc.l    str_647-string_data
        dc.l    str_648-string_data
        dc.l    str_649-string_data
        dc.l    str_650-string_data
        dc.l    str_651-string_data
        dc.l    str_652-string_data
        dc.l    str_653-string_data
        dc.l    str_654-string_data
        dc.l    str_655-string_data
        dc.l    str_656-string_data
        dc.l    str_657-string_data
        dc.l    str_658-string_data
        dc.l    str_659-string_data
        dc.l    str_660-string_data
        dc.l    str_661-string_data
        dc.l    str_662-string_data
        dc.l    str_663-string_data
        dc.l    str_664-string_data
        dc.l    str_665-string_data
        dc.l    str_666-string_data
        dc.l    str_667-string_data
        dc.l    str_668-string_data
        dc.l    str_669-string_data
        dc.l    str_670-string_data
        dc.l    str_671-string_data
        dc.l    str_672-string_data
        dc.l    str_673-string_data
        dc.l    str_674-string_data
        dc.l    str_675-string_data
        dc.l    str_676-string_data
        dc.l    str_677-string_data
        dc.l    str_678-string_data
        dc.l    str_679-string_data
        dc.l    str_680-string_data
        dc.l    str_681-string_data
        dc.l    str_682-string_data
        dc.l    str_683-string_data
        dc.l    str_684-string_data
        dc.l    str_685-string_data
        dc.l    str_686-string_data
        dc.l    str_687-string_data
        dc.l    str_688-string_data
        dc.l    str_689-string_data
        dc.l    str_690-string_data
        dc.l    str_691-string_data
        dc.l    str_692-string_data
        dc.l    str_693-string_data
        dc.l    str_694-string_data
        dc.l    str_695-string_data
        dc.l    str_696-string_data
        dc.l    str_697-string_data
        dc.l    str_698-string_data
        dc.l    str_699-string_data
        dc.l    str_700-string_data
        dc.l    str_701-string_data
        dc.l    str_702-string_data
        dc.l    str_703-string_data
        dc.l    str_704-string_data
        dc.l    str_705-string_data
        dc.l    str_706-string_data
        dc.l    str_707-string_data
        dc.l    str_708-string_data
        dc.l    str_709-string_data
        dc.l    str_710-string_data
        dc.l    str_711-string_data
        dc.l    str_712-string_data
        dc.l    str_713-string_data
        dc.l    str_714-string_data
        dc.l    str_715-string_data
        dc.l    str_716-string_data
        dc.l    str_717-string_data
        dc.l    str_718-string_data
        dc.l    str_719-string_data
        dc.l    str_720-string_data
        dc.l    str_721-string_data
        dc.l    str_722-string_data
        dc.l    str_723-string_data
        dc.l    str_724-string_data
        dc.l    str_725-string_data
        dc.l    str_726-string_data
        dc.l    str_727-string_data
        dc.l    str_728-string_data
        dc.l    str_729-string_data
        dc.l    str_730-string_data
        dc.l    str_731-string_data
        dc.l    str_732-string_data
        dc.l    str_733-string_data
        dc.l    str_734-string_data
        dc.l    str_735-string_data
        dc.l    str_736-string_data
        dc.l    str_737-string_data
        dc.l    str_738-string_data
        dc.l    str_739-string_data
        dc.l    str_740-string_data
        dc.l    str_741-string_data
        dc.l    str_742-string_data
        dc.l    str_743-string_data
        dc.l    str_744-string_data
        dc.l    str_745-string_data
        dc.l    str_746-string_data
        dc.l    str_747-string_data
        dc.l    str_748-string_data
        dc.l    str_749-string_data
        dc.l    str_750-string_data
        dc.l    str_751-string_data
        dc.l    str_752-string_data
        dc.l    str_753-string_data
        dc.l    str_754-string_data
        dc.l    str_755-string_data
        dc.l    str_756-string_data
        dc.l    str_757-string_data
        dc.l    str_758-string_data
        dc.l    str_759-string_data
        dc.l    str_760-string_data
        dc.l    str_761-string_data
        dc.l    str_762-string_data
        dc.l    str_763-string_data
        dc.l    str_764-string_data
        dc.l    str_765-string_data
        dc.l    str_766-string_data
        dc.l    str_767-string_data
        dc.l    str_768-string_data
        dc.l    str_769-string_data
        dc.l    str_770-string_data
        dc.l    str_771-string_data
        dc.l    str_772-string_data
        dc.l    str_773-string_data
        dc.l    str_774-string_data
        dc.l    str_775-string_data
        dc.l    str_776-string_data
        dc.l    str_777-string_data
        dc.l    str_778-string_data
        dc.l    str_779-string_data
        dc.l    str_780-string_data
        dc.l    str_781-string_data
        dc.l    str_782-string_data
        dc.l    str_783-string_data
        dc.l    str_784-string_data
        dc.l    str_785-string_data
        dc.l    str_786-string_data
        dc.l    str_787-string_data
        dc.l    str_788-string_data
        dc.l    str_789-string_data
        dc.l    str_790-string_data
        dc.l    str_791-string_data
        dc.l    str_792-string_data
        dc.l    str_793-string_data
        dc.l    str_794-string_data
        dc.l    str_795-string_data
        dc.l    str_796-string_data
        dc.l    str_797-string_data
        dc.l    str_798-string_data
        dc.l    str_799-string_data
        dc.l    str_800-string_data
        dc.l    str_801-string_data
        dc.l    str_802-string_data
        dc.l    str_803-string_data
        dc.l    str_804-string_data
        dc.l    str_805-string_data
        dc.l    str_806-string_data
        dc.l    str_807-string_data
        dc.l    str_808-string_data
        dc.l    str_809-string_data
        dc.l    str_810-string_data
        dc.l    str_811-string_data
        dc.l    str_812-string_data
        dc.l    str_813-string_data
        dc.l    str_814-string_data
        dc.l    str_815-string_data
        dc.l    str_816-string_data
        dc.l    str_817-string_data
        dc.l    str_818-string_data
        dc.l    str_819-string_data
        dc.l    str_820-string_data
        dc.l    str_821-string_data
        dc.l    str_822-string_data
        dc.l    str_823-string_data
        dc.l    str_824-string_data
        dc.l    str_825-string_data
        dc.l    str_826-string_data
        dc.l    str_827-string_data
        dc.l    str_828-string_data
        dc.l    str_829-string_data
        dc.l    str_830-string_data
        dc.l    str_831-string_data
        dc.l    str_832-string_data
        dc.l    str_833-string_data
        dc.l    str_834-string_data
        dc.l    str_835-string_data
        dc.l    str_836-string_data
        dc.l    str_837-string_data
        dc.l    str_838-string_data
        dc.l    str_839-string_data
        dc.l    str_840-string_data
        dc.l    str_841-string_data
        dc.l    str_842-string_data
        dc.l    str_843-string_data
        dc.l    str_844-string_data
        dc.l    str_845-string_data
        dc.l    str_846-string_data
        dc.l    str_847-string_data
        dc.l    str_848-string_data
        dc.l    str_849-string_data
        dc.l    str_850-string_data
        dc.l    str_851-string_data
        dc.l    str_852-string_data
        dc.l    str_853-string_data
        dc.l    str_854-string_data
        dc.l    str_855-string_data
        dc.l    str_856-string_data
        dc.l    str_857-string_data
        dc.l    str_858-string_data
        dc.l    str_859-string_data
        dc.l    str_860-string_data
        dc.l    str_861-string_data
        dc.l    str_862-string_data
        dc.l    str_863-string_data
        dc.l    str_864-string_data
        dc.l    str_865-string_data
        dc.l    str_866-string_data
        dc.l    str_867-string_data
        dc.l    str_868-string_data
        dc.l    str_869-string_data
        dc.l    str_870-string_data
        dc.l    str_871-string_data
        dc.l    str_872-string_data
        dc.l    str_873-string_data
        dc.l    str_874-string_data
        dc.l    str_875-string_data
        dc.l    str_876-string_data
        dc.l    str_877-string_data
        dc.l    str_878-string_data
        dc.l    str_879-string_data
        dc.l    str_880-string_data
        dc.l    str_881-string_data
        dc.l    str_882-string_data
        dc.l    str_883-string_data
        dc.l    str_884-string_data
        dc.l    str_885-string_data
        dc.l    str_886-string_data
        dc.l    str_887-string_data
        dc.l    str_888-string_data
        dc.l    str_889-string_data
        dc.l    str_890-string_data
        dc.l    str_891-string_data
        dc.l    str_892-string_data
        dc.l    str_893-string_data
        dc.l    str_894-string_data
        dc.l    str_895-string_data
        dc.l    str_896-string_data
        dc.l    str_897-string_data
        dc.l    str_898-string_data
        dc.l    str_899-string_data
        dc.l    str_900-string_data
        dc.l    str_901-string_data
        dc.l    str_902-string_data
        dc.l    str_903-string_data
        dc.l    str_904-string_data
        dc.l    str_905-string_data
        dc.l    str_906-string_data
        dc.l    str_907-string_data
        dc.l    str_908-string_data
        dc.l    str_909-string_data
        dc.l    str_910-string_data
        dc.l    str_911-string_data
        dc.l    str_912-string_data
        dc.l    str_913-string_data
        dc.l    str_914-string_data
        dc.l    str_915-string_data
        dc.l    str_916-string_data
        dc.l    str_917-string_data
        dc.l    str_918-string_data
        dc.l    str_919-string_data
        dc.l    str_920-string_data
        dc.l    str_921-string_data
        dc.l    str_922-string_data
        dc.l    str_923-string_data
        dc.l    str_924-string_data
        dc.l    str_925-string_data
        dc.l    str_926-string_data
        dc.l    str_927-string_data
        dc.l    str_928-string_data
        dc.l    str_929-string_data
        dc.l    str_930-string_data
        dc.l    str_931-string_data
        dc.l    str_932-string_data
        dc.l    str_933-string_data
        dc.l    str_934-string_data
        dc.l    str_935-string_data
        dc.l    str_936-string_data
        dc.l    str_937-string_data
        dc.l    str_938-string_data
        dc.l    str_939-string_data
        dc.l    str_940-string_data
        dc.l    str_941-string_data
        dc.l    str_942-string_data
        dc.l    str_943-string_data
        dc.l    str_944-string_data
        dc.l    str_945-string_data
        dc.l    str_946-string_data
        dc.l    str_947-string_data
        dc.l    str_948-string_data
        dc.l    str_949-string_data
        dc.l    str_950-string_data
        dc.l    str_951-string_data
        dc.l    str_952-string_data
        dc.l    str_953-string_data
        dc.l    str_954-string_data
        dc.l    str_955-string_data
        dc.l    str_956-string_data
        dc.l    str_957-string_data
        dc.l    str_958-string_data
        dc.l    str_959-string_data
        dc.l    str_960-string_data
        dc.l    str_961-string_data
        dc.l    str_962-string_data
        dc.l    str_963-string_data
        dc.l    str_964-string_data
        dc.l    str_965-string_data
        dc.l    str_966-string_data
        dc.l    str_967-string_data
        dc.l    str_968-string_data
        dc.l    str_969-string_data
        dc.l    str_970-string_data
        dc.l    str_971-string_data
        dc.l    str_972-string_data
        dc.l    str_973-string_data
        dc.l    str_974-string_data
        dc.l    str_975-string_data
        dc.l    str_976-string_data
        dc.l    str_977-string_data
        dc.l    str_978-string_data
        dc.l    str_979-string_data
        dc.l    str_980-string_data
        dc.l    str_981-string_data
        dc.l    str_982-string_data
        dc.l    str_983-string_data
        dc.l    str_984-string_data
        dc.l    str_985-string_data
        dc.l    str_986-string_data
        dc.l    str_987-string_data
        dc.l    str_988-string_data
        dc.l    str_989-string_data
        dc.l    str_990-string_data
        dc.l    str_991-string_data
        dc.l    str_992-string_data
        dc.l    str_993-string_data
        dc.l    str_994-string_data
        dc.l    str_995-string_data
        dc.l    str_996-string_data
        dc.l    str_997-string_data
        dc.l    str_998-string_data

; String data - all 999 CP strings
string_data:

str_0:
        dc.b    '1. Tanka alltid dubbelt s',$E5,' mycket som ryms i tanken p',$E5,' din bil',0
        EVEN
str_1:
        dc.b    '2. S',$E4,'tt upp handikappskyltar ist',$E4,'llet f',$F6,'r tavlor i ditt hus',0
        EVEN
str_2:
        dc.b    '3. Anv',$E4,'nd alltid handikapptoaletter',0
        EVEN
str_3:
        dc.b    '4. Tapetsera med kvitton fr',$E5,'n F',$E4,'rdtj',$E4,'nst',0
        EVEN
str_4:
        dc.b    '5. Kalla alla familjemedlemmar f',$F6,'r "CP"',0
        EVEN
str_5:
        dc.b    '6. B',$F6,'rja morgonen med att spela "CP-',$C5,'KE" med Onkel K',$E5,'nkel',0
        EVEN
str_6:
        dc.b    '7. Skotta sn',$F6,' p',$E5,' sommaren',0
        EVEN
str_7:
        dc.b    '8. Klippa gr',$E4,'smattan p',$E5,' vintern',0
        EVEN
str_8:
        dc.b    '9. G',$E5,' med i Anonyma Alkoholister f',$F6,'r att l',$E4,'ra sig supa ordentligt',0
        EVEN
str_9:
        dc.b    '10. Sov aldrig, ',$E4,'t koffeintabletter ist',$E4,'llet',0
        EVEN
str_10:
        dc.b    '11. Duscha aldrig, ',$E4,'t tv',$E5,'l ist',$E4,'llet',0
        EVEN
str_11:
        dc.b    '12. S',$F6,'k socialbidrag, f',$F6,'r att sedan elda upp pengarna',0
        EVEN
str_12:
        dc.b    '13. K',$F6,'r med vinterd',$E4,'ck p',$E5,' sommaren',0
        EVEN
str_13:
        dc.b    '14. Anordna CP-VM i sin egen tr',$E4,'dg',$E5,'rd',0
        EVEN
str_14:
        dc.b    '15. Lyssna p',$E5,' Jockmocks-Jocke',0
        EVEN
str_15:
        dc.b    '16. G',$E5,' till tandl',$E4,'karen p',$E5,' skoj',0
        EVEN
str_16:
        dc.b    '17. Samla p',$E5,' br',$F6,'drostar',0
        EVEN
str_17:
        dc.b    '18. Bygga ett garage av marshmallows',0
        EVEN
str_18:
        dc.b    '19. Bada i spaghetti',0
        EVEN
str_19:
        dc.b    '20. ',$C5,'ka snowboard p',$E5,' sommaren',0
        EVEN
str_20:
        dc.b    '21. Utbilda sig till medeltida r',$F6,'rmokare',0
        EVEN
str_21:
        dc.b    '22. Gr',$E4,'va en tunnel till Kina',0
        EVEN
str_22:
        dc.b    '23. G',$F6,'r en rymdraket av mj',$F6,'lkpaket',0
        EVEN
str_23:
        dc.b    '24. Kl',$E4,' ut sig till Mumintrollet f',$F6,'rsta dagen p',$E5,' jobbet',0
        EVEN
str_24:
        dc.b    '25. Stoppa sin hj',$E4,'rna i en mixer',0
        EVEN
str_25:
        dc.b    '26. Fejka legitimationen s',$E5,' att man blir yngre och f',$E5,'r leva l',$E4,'ngre',0
        EVEN
str_26:
        dc.b    '27. Kolla p',$E5,' "Joel-Bitar"',0
        EVEN
str_27:
        dc.b    '28. K',$F6,'pa alla skivor med "Syskon-Ringen"',0
        EVEN
str_28:
        dc.b    '29. Bygga en moske i Trollh',$E4,'ttan',0
        EVEN
str_29:
        dc.b    '30. F',$F6,'rs',$F6,'ka g',$E5,' med i V.A.M n',$E4,'r man ',$E4,'r neger',0
        EVEN
str_30:
        dc.b    '31. G',$E5,' tomtelinjen med hockeyspelstillverkning som tillval',0
        EVEN
str_31:
        dc.b    '32. Tro att detta ',$E4,'r sista numret',0
        EVEN
str_32:
        dc.b    '33. Kontrollr',$E4,'kna sina ',$F6,'ron varje dag och anteckna resultatet i en svart bok',0
        EVEN
str_33:
        dc.b    '34. Bli anarkist och g',$E5,' p',$E5,' nazistm',$F6,'ten',0
        EVEN
str_34:
        dc.b    '35. F',$F6,'rs',$F6,'ka smuggla in tomtebloss till Sverige fr',$E5,'n Island',0
        EVEN
str_35:
        dc.b    '36. Skriva brev till sig sj',$E4,'lv f',$F6,'r att kolla vem som f',$E5,'r brevet',0
        EVEN
str_36:
        dc.b    '37. Skriva av bibeln och byta ut ordet "Jesus" mot "CP"',0
        EVEN
str_37:
        dc.b    '38. Smuggla sand till Skagen',0
        EVEN
str_38:
        dc.b    '39. Prata teckenspr',$E5,'k med blinda',0
        EVEN
str_39:
        dc.b    '40. Bygga en "CP-box" s',$E5,' att alla v',$E4,'rldens samtalskostnader hamnar p',$E5,' sin egen teler',$E4,'kning',0
        EVEN
str_40:
        dc.b    '41. Prata in ett tv',$E5,' timmar l',$E5,'ngt meddelande p',$E5,' sin telefonsvarare',0
        EVEN
str_41:
        dc.b    '42. Hitta p',$E5,' en egen valuta',0
        EVEN
str_42:
        dc.b    '43. ',$C5,'ka rullstol p',$E5,' fritiden',0
        EVEN
str_43:
        dc.b    '44. S',$E4,'lja sin tomt till F',$E4,'r',$F6,'arna',0
        EVEN
str_44:
        dc.b    '45. Hitta p',$E5,' en egen CP-religion',0
        EVEN
str_45:
        dc.b    '46. Hitta p',$E5,' ett eget spr',$E5,'k s',$E5,' att man kan prata med sig sj',$E4,'lv',0
        EVEN
str_46:
        dc.b    '47. S',$E4,'lja bilen och sedan anm',$E4,'la den som stulen',0
        EVEN
str_47:
        dc.b    '48. Parkera bilen i V',$E4,'nern, ',$E5,'ret om',0
        EVEN
str_48:
        dc.b    '49. Byta ut namnen p',$E5,' alla sjukdomar i en l',$E4,'karbok mot "CP"',0
        EVEN
str_49:
        dc.b    '50. Swappa med sig sj',$E4,'lv',0
        EVEN
str_50:
        dc.b    '51. S',$E4,'lja sin enda bil f',$F6,'r att ha r',$E5,'d att k',$F6,'pa en husvagn',0
        EVEN
str_51:
        dc.b    '52. Ta med sig sovs',$E4,'ck till ett raveparty',0
        EVEN
str_52:
        dc.b    '53. St',$E4,'lla v',$E4,'ckarklockan uppochner f',$F6,'r att f',$E5,' sova l',$E4,'ngre',0
        EVEN
str_53:
        dc.b    '54. R',$F6,'ka snus',0
        EVEN
str_54:
        dc.b    '55. Dricka n',$E4,'sspray',0
        EVEN
str_55:
        dc.b    '56. Ringa till sitt eget nummer hemifr',$E5,'n',0
        EVEN
str_56:
        dc.b    '57. ',$C4,'ta soppa med h',$E4,'nderna',0
        EVEN
str_57:
        dc.b    '58. St',$E5,' p',$E5,' s',$E4,'tena i en buss',0
        EVEN
str_58:
        dc.b    '59. Tr',$E4,'na p',$E5,' att bli d',$F6,'v',0
        EVEN
str_59:
        dc.b    '60. Dra pungen ',$F6,'ver huvudet',0
        EVEN
str_60:
        dc.b    '61. Ringa fel med vilje',0
        EVEN
str_61:
        dc.b    '62. L',$E4,'mna tillbaka mer b',$F6,'cker ',$E4,'n man har l',$E5,'nat p',$E5,' biblioteket',0
        EVEN
str_62:
        dc.b    '63. G',$E5,' p',$E5,' disco med freestyle',0
        EVEN
str_63:
        dc.b    '64. ',$C4,'ta gul sn',$F6,0
        EVEN
str_64:
        dc.b    '65. G',$F6,'ra sit-ups samtidigt som man k',$F6,'r bil',0
        EVEN
str_65:
        dc.b    '66. H',$E4,'rma sig sj',$E4,'lv',0
        EVEN
str_66:
        dc.b    '67. Skriva en egen almanacka d',$E4,'r CP-mannen har namnsdag varje dag',0
        EVEN
str_67:
        dc.b    '68. T',$E4,'nda eld p',$E5,' tapeterna f',$F6,'r att v',$E4,'rma sig',0
        EVEN
str_68:
        dc.b    '69. F',$F6,'rs',$F6,'ka att ha alla existerande sjukdomar samtidigt',0
        EVEN
str_69:
        dc.b    '70. Sl',$E5,' alla rekord i Guinness Rekordbok p',$E5,' samma dag',0
        EVEN
str_70:
        dc.b    '71. Ta fel buss varje dag',0
        EVEN
str_71:
        dc.b    '72. Ge bort presenter p',$E5,' sin f',$F6,'delsedag',0
        EVEN
str_72:
        dc.b    '73. Prenumerera p',$E5,' tidningar som inte finns',0
        EVEN
str_73:
        dc.b    '74. Panta o',$F6,'ppnade ',$F6,'lburkar',0
        EVEN
str_74:
        dc.b    '75. St',$E4,'lla upp i kvitt eller dubbelt i ',$E4,'mnet "Rullstolar"',0
        EVEN
str_75:
        dc.b    '76. Fylla munnen med gula gem',0
        EVEN
str_76:
        dc.b    '77. P',$E5,'st',$E5,' att man ',$E4,'r god v',$E4,'n med jultomten',0
        EVEN
str_77:
        dc.b    '78. Fylla sitt badkar med sn',$F6,' n',$E4,'r man ska bada',0
        EVEN
str_78:
        dc.b    '79. G',$F6,'ra en k',$F6,'nsoperation s',$E5,' att man blir man n',$E4,'r man redan ',$E4,'r man',0
        EVEN
str_79:
        dc.b    '80. Byta nummerpl',$E5,'tar med sina CP-kompisar',0
        EVEN
str_80:
        dc.b    '81. G',$F6,'ra lumpen f',$F6,'r att man gillar n',$E4,'r det regnar',0
        EVEN
str_81:
        dc.b    '82. Anv',$E4,'nda "Blaskan" i undervisningssyfte',0
        EVEN
str_82:
        dc.b    '83. H',$E4,'lsa med v',$E4,'nsterhanden n',$E4,'r man ska ta emot nobelpriset',0
        EVEN
str_83:
        dc.b    '84. Anv',$E4,'nda h',$E4,'nderna ist',$E4,'llet f',$F6,'r pensel n',$E4,'r man m',$E5,'lar om huset',0
        EVEN
str_84:
        dc.b    '85. Anv',$E4,'nda lim ist',$E4,'llet f',$F6,'r tandkr',$E4,'m',0
        EVEN
str_85:
        dc.b    '86. Sniffa sn',$F6,0
        EVEN
str_86:
        dc.b    '87. G',$F6,'ra en film med sp',$E4,'nnande rullstolsjakter',0
        EVEN
str_87:
        dc.b    '88. ',$C5,'ka rullstol i "Flum-Ride"',0
        EVEN
str_88:
        dc.b    '89. Vinna tre miljoner kr p',$E5,' Bingolotto och sedan k',$F6,'pa bingolotter f',$F6,'r allt',0
        EVEN
str_89:
        dc.b    '90. Strunta i s',$E4,'kerhetsb',$E4,'ltet p',$E5,' "Loopen"',0
        EVEN
str_90:
        dc.b    '91. L',$E4,'sa upp hela CP-listan och sampla den och l',$E4,'gga den p',$E5,' sin h',$E5,'rddisk',0
        EVEN
str_91:
        dc.b    '92. Spela "Rappakalja" p',$E5,' tv',$E5,' personer',0
        EVEN
str_92:
        dc.b    '93. Avlyssna sin egen telefon',0
        EVEN
str_93:
        dc.b    '94. Dricka vatten n',$E4,'r man ',$E4,'r p',$E5,' krogen',0
        EVEN
str_94:
        dc.b    '95. G',$F6,'ra semlor med modellera ist',$E4,'llet f',$F6,'r mandelmassa',0
        EVEN
str_95:
        dc.b    '96. Tro att "2-Unlimited" kommer ge ut en live-CD',0
        EVEN
str_96:
        dc.b    '97. G',$F6,'ra vilda omk',$F6,'rningar och ta genv',$E4,'gar ',$F6,'ver gr',$E4,'smattor p',$E5,' sin uppk',$F6,'rning',0
        EVEN
str_97:
        dc.b    '98. Kl',$E4,' ut sig till ett videoband p',$E5,' m',$F6,'nstringen',0
        EVEN
str_98:
        dc.b    '99. ',$C4,'ta Clearasil',0
        EVEN
str_99:
        dc.b    '100. Plugga alfabetet inf',$F6,'r tentamen i svenska',0
        EVEN
str_100:
        dc.b    '101. Ringa p',$E5,' b',$E5,'da numren p',$E5,' "Pernilla & Co." (Ja eller Nej)',0
        EVEN
str_101:
        dc.b    '102. "Carda" p',$E5,' sitt eget Visa-nummer',0
        EVEN
str_102:
        dc.b    '103. Skriva i sitt testamente att sin sedan l',$E4,'nge avlidna farfar f',$E5,'r ',$E4,'rva allt',0
        EVEN
str_103:
        dc.b    '104. Starta ett lokalradioprogram d',$E4,'r man ringer brandk',$E5,'ren och s',$E4,'ger att det brinner p',$E5,' Nisse varje dag som programmet s',$E4,'nds, programmet ska heta Tarzan',0
        EVEN
str_104:
        dc.b    '105. Svara i telefon n',$E4,'r det inte ringer',0
        EVEN
str_105:
        dc.b    '106. Bita sig i ',$F6,'gat',0
        EVEN
str_106:
        dc.b    '107. Lyssna p',$E5,' tomma band',0
        EVEN
str_107:
        dc.b    '108. Bli kaktuskramare',0
        EVEN
str_108:
        dc.b    '109. Tapetsera p',$E5,' utsidan av huset',0
        EVEN
str_109:
        dc.b    '110. S',$E4,'tta falluckor i taket',0
        EVEN
str_110:
        dc.b    '111. L',$E4,'gga ut laxn',$E4,'t i slump',$E5,'n',0
        EVEN
str_111:
        dc.b    '112. Ta in en julkaktus p',$E5,' jul',0
        EVEN
str_112:
        dc.b    '113. ',$C5,'ka skateboard i Sahara',0
        EVEN
str_113:
        dc.b    '114. Ringa bbser "Voice"',0
        EVEN
str_114:
        dc.b    '115. Ringa till Bingolotto n',$E4,'r man inte har bingo',0
        EVEN
str_115:
        dc.b    '116. Steka fisk och sedan l',$E4,'gga den i sitt akvarium',0
        EVEN
str_116:
        dc.b    '117. Gr',$E4,'va efter guld i garderoben',0
        EVEN
str_117:
        dc.b    '118. B',$F6,'rja plugga p',$E5,' ett prov dagen efter man har haft provet',0
        EVEN
str_118:
        dc.b    '119. Fylla en hel sj',$F6,' med brustabletter',0
        EVEN
str_119:
        dc.b    '120. Fylla naveln med saftsoppa',0
        EVEN
str_120:
        dc.b    '121. Tvinga fingrarna bak',$E5,'t tills dom g',$E5,'r av',0
        EVEN
str_121:
        dc.b    '122. Bita av armar och ben',0
        EVEN
str_122:
        dc.b    '123. Sk',$E4,'ra av halspuls',$E5,'dern f',$F6,'r att se hur mycket blod man har och hur l',$E5,'ng tid det tar att t',$F6,'mma ut allt',0
        EVEN
str_123:
        dc.b    '124. K',$F6,'ra med sn',$F6,'kanon p',$E5,' sommaren',0
        EVEN
str_124:
        dc.b    '125. Basta med kl',$E4,'derna p',$E5,0
        EVEN
str_125:
        dc.b    '126. Sniffa cornflakes',0
        EVEN
str_126:
        dc.b    '127. Best',$E4,'lla saker mot portf',$F6,'rskott och sedan f',$F6,'rs',$F6,'ka pruta p',$E5,' posten',0
        EVEN
str_127:
        dc.b    '128. Kopiera tomband',0
        EVEN
str_128:
        dc.b    '129. Bygga ett LP-ROM med vinylskivor till sin dator',0
        EVEN
str_129:
        dc.b    '130. V',$E4,'lja "Jeopardy" som tillval i skolan',0
        EVEN
str_130:
        dc.b    '131. ',$C4,'ta eld',0
        EVEN
str_131:
        dc.b    '132. Spara bensinpengar genom att blanda ut bensinen med saftsoppa',0
        EVEN
str_132:
        dc.b    '133. G',$F6,'ra bokrecensioner p',$E5,' Alfons ',$C5,'berg b',$F6,'ckerna i svenskan',0
        EVEN
str_133:
        dc.b    '134. Plantera batterier och vattna med bensin',0
        EVEN
str_134:
        dc.b    '135. Borra h',$E5,'l i golvet f',$F6,'r julgranen',0
        EVEN
str_135:
        dc.b    '136. Spela 2-Unlimited p',$E5,' ett raveparty',0
        EVEN
str_136:
        dc.b    '137. G',$F6,'ra inbrott p',$E5,' ett dagis f',$F6,'r att f',$E5,' bygga med lego ',$E4,'nda tills polisen kommer och h',$E4,'mtar dig',0
        EVEN
str_137:
        dc.b    '138. Bygga en friggebod av lego',0
        EVEN
str_138:
        dc.b    '139. D',$F6,'pa sina ungar till konstiga namn typ "Hagbard" "Anders Hitler" "Magnus P',$E5,'f',$E5,'gel" "Johan Sch',$E4,'fer"',0
        EVEN
str_139:
        dc.b    '140. K',$F6,'pa en pittbull-terrier och reta den i ett halv',$E5,'r och sedan sl',$E4,'ppa in den p',$E5,' ett dagis',0
        EVEN
str_140:
        dc.b    '141. K',$F6,'pa studentm',$F6,'ssor f',$F6,'r hela studiebidraget ',$E5,'ret om',0
        EVEN
str_141:
        dc.b    '142. Ta med sig en hungrig myrslok p',$E5,' en utst',$E4,'llning om s',$E4,'llsynta insekter',0
        EVEN
str_142:
        dc.b    '143. Dr',$F6,'mma mardr',$F6,'mmar om elaka kalaspuffspaket som t',$E4,'nker ta ',$F6,'ver jorden',0
        EVEN
str_143:
        dc.b    '144. Hyra en videofilm och sedan spela ',$F6,'ver den med en porrfilm d',$E4,'r man s',$E4,'tter p',$E5,' en utvecklingsst',$F6,'rd eskim',$E5,0
        EVEN
str_144:
        dc.b    '145. K',$E4,'ka upp sin keps f',$F6,'r att v',$E5,'ga ta ett l',$E5,'n p',$E5,' banken',0
        EVEN
str_145:
        dc.b    '146. Stoppa in pommes frites i ',$F6,'ronen n',$E4,'r man g',$E5,'r p',$E5,' bio',0
        EVEN
str_146:
        dc.b    '147. Stj',$E4,'la en cykel f',$F6,'r att f',$E5,' h',$F6,'gre studiebidrag',0
        EVEN
str_147:
        dc.b    '148. Springa mot isl',$E4,'ndska kurder',0
        EVEN
str_148:
        dc.b    '149. S',$E4,'lja kokain till Colombia',0
        EVEN
str_149:
        dc.b    '150. Extrakn',$E4,'cka som ',$E4,'lg p',$E5,' Skansen',0
        EVEN
str_150:
        dc.b    '151. Ta patent p',$E5,' att vara latent',0
        EVEN
str_151:
        dc.b    '152. L',$E5,'sa ute sig fr',$E5,'n sitt hus f',$F6,'r att slippa svara i telefonen',0
        EVEN
str_152:
        dc.b    '153. M',$E5,'la sin gr',$E4,'smatta bl',$E5,' f',$F6,'r att ingen ska sno den',0
        EVEN
str_153:
        dc.b    '154. Vara redl',$F6,'st berusad p',$E5,' sin uppk',$F6,'rning',0
        EVEN
str_154:
        dc.b    '155. Impa p',$E5,' brudar genom att strunta i s',$E4,'kerhetsb',$E4,'ltet p',$E5,' aerovarvet',0
        EVEN
str_155:
        dc.b    '156. Starta en rullstolsfabrik som heter "Golvo" som betyder "Jag ',$E4,'r CP" p',$E5,' latin',0
        EVEN
str_156:
        dc.b    '157. S',$E5,'ga s',$F6,'nder en tandemcykel s',$E5,' att man f',$E5,'r tv',$E5,' cyklar',0
        EVEN
str_157:
        dc.b    '158. K',$F6,'pa t',$E5,'gbiljett n',$E4,'r man har inter-rail kort',0
        EVEN
str_158:
        dc.b    '159. Klippa grannens gr',$E4,'smatta ist',$E4,'llet f',$F6,'r sin egen',0
        EVEN
str_159:
        dc.b    '160. Hugga av sig h',$E4,'nderna s',$E5,' man slipper diska',0
        EVEN
str_160:
        dc.b    '161. Kopiera videoreng',$F6,'rings kassetter',0
        EVEN
str_161:
        dc.b    '162. G',$F6,'ra splatterfilmer f',$F6,'r barn',0
        EVEN
str_162:
        dc.b    '163. Tro att "Ariel Ultra" ',$E4,'r ett preventivmedel',0
        EVEN
str_163:
        dc.b    '164. Vara h',$F6,'g p',$E5,' h',$F6,'gm',$E4,'ssan',0
        EVEN
str_164:
        dc.b    '165. Fira ',$E5,'rsdagen av Titanics underg',$E5,'ng varje ',$E5,'r',0
        EVEN
str_165:
        dc.b    '166. Formatera disketter i diskmaskinen',0
        EVEN
str_166:
        dc.b    '167. B',$F6,'rja bita folk i slipsen p',$E5,' viktiga m',$F6,'ten',0
        EVEN
str_167:
        dc.b    '168. Inf',$F6,'ra CP-nationaldagen den 34:e Oktober',0
        EVEN
str_168:
        dc.b    '169. ',$C4,'ta upp momsen',0
        EVEN
str_169:
        dc.b    '170. Binda fast ett CP bakom bilen n',$E4,'r man gifter sig',0
        EVEN
str_170:
        dc.b    '171. Kopiera CD-skivor med en mangel',0
        EVEN
str_171:
        dc.b    '172. Anv',$E4,'nda mikrov',$E5,'gsugn som ett akvarium',0
        EVEN
str_172:
        dc.b    '173. Beg',$E4,'ra skilsm',$E4,'ssa n',$E4,'r man inte ',$E4,'r gift',0
        EVEN
str_173:
        dc.b    '174. Hoppa bungyjump fr',$E5,'n Stallbackabron med ett rep runt halsen',0
        EVEN
str_174:
        dc.b    '175. Dricka en stark',$F6,'l f',$F6,'r varje passning Sverige g',$F6,'r i Fotbolls-VM',0
        EVEN
str_175:
        dc.b    '176. Ta k',$F6,'rlektioner n',$E4,'r man redan har k',$F6,'rkort',0
        EVEN
str_176:
        dc.b    '177. G',$E5,' i rulltrappa ',$E5,'t fel h',$E5,'ll',0
        EVEN
str_177:
        dc.b    '178. Kr',$E4,'va att aidsforskningen upph',$F6,'r och ist',$E4,'llet satsa p',$E5,' spridning av aids',0
        EVEN
str_178:
        dc.b    '179. Leka enmans kurrag',$F6,'mma',0
        EVEN
str_179:
        dc.b    '180. Anordna VM i Aids',0
        EVEN
str_180:
        dc.b    '181. Brevv',$E4,'xla med sig sj',$E4,'lv',0
        EVEN
str_181:
        dc.b    '182. Tro att man f',$E5,'r nobelpriset i litteratur om man skriver en bok om den utvecklingsst',$F6,'rda igelkotten Samuel som inte har betalat TV-licensen',0
        EVEN
str_182:
        dc.b    '183. Hungerstrejka f',$F6,'r att det inte ',$E4,'r n',$E5,'got bra p',$E5,' TV',0
        EVEN
str_183:
        dc.b    '184. Sova sig igenom en film p',$E5,' bio s',$E5,' att man kan ',$E4,'ta upp allt popcorn som ligger p',$E5,' golvet n',$E4,'r alla har g',$E5,'tt',0
        EVEN
str_184:
        dc.b    '185. Skaffa sig Aids med vilje',0
        EVEN
str_185:
        dc.b    '186. Skriva en s',$E5,'n h',$E4,'r CP-lista',0
        EVEN
str_186:
        dc.b    '187. Skolka p',$E5,' h',$E5,'ltimmar',0
        EVEN
str_187:
        dc.b    '188. Sniffa snus',0
        EVEN
str_188:
        dc.b    '189. Stagediva inne i en skivaff',$E4,'r',0
        EVEN
str_189:
        dc.b    '190. Klippa h',$E5,'l i sin tr',$F6,'ja n',$E4,'r det ',$E4,'r f',$F6,'r varmt',0
        EVEN
str_190:
        dc.b    '191. Skicka brevbomber till sig sj',$E4,'lv, f',$F6,'r att kolla vem som f',$E5,'r brevet',0
        EVEN
str_191:
        dc.b    '192. Bygga en hembr',$E4,'nningsapparat av lego',0
        EVEN
str_192:
        dc.b    '193. Starta en egen TV-kanal som s',$E4,'nder rullstolsreklam dygnet runt',0
        EVEN
str_193:
        dc.b    '194. Anv',$E4,'nda en mikrov',$E5,'gsugn som ',$E4,'ggkl',$E4,'ckningsmaskin',0
        EVEN
str_194:
        dc.b    '195. Starta en aff',$E4,'rskedja som s',$E4,'ljer kroppsdelar, den ska heta "Body Shop"',0
        EVEN
str_195:
        dc.b    '196. Freebasa jordn',$F6,'tssm',$F6,'r',0
        EVEN
str_196:
        dc.b    '197. F',$F6,'rs',$F6,'ka stj',$E4,'la Rainbow p',$E5,' Liseberg',0
        EVEN
str_197:
        dc.b    '198. Bygga en TV-s',$E4,'ndare och s',$E4,'nda myrornas krig',0
        EVEN
str_198:
        dc.b    '199. Skriva upp sin bankomatkod p',$E5,' sitt bankomatkort',0
        EVEN
str_199:
        dc.b    '200. Skjuta l',$E5,'tsas',$E4,'lgarna p',$E5,' halkk',$F6,'rningen',0
        EVEN
str_200:
        dc.b    '201. G',$F6,'ra l',$E4,'xorna i duschen',0
        EVEN
str_201:
        dc.b    '202. Spela in CD-skivor p',$E5,' videoband',0
        EVEN
str_202:
        dc.b    '203. Prata med sina d',$F6,'da blommor',0
        EVEN
str_203:
        dc.b    '204. Anv',$E4,'nda sin fritid till att forska om fraggel-Aids',0
        EVEN
str_204:
        dc.b    '205. Limma fast frim',$E4,'rkena bak och fram p',$E5,' sina brev',0
        EVEN
str_205:
        dc.b    '206. Anv',$E4,'nda en video som br',$F6,'drost',0
        EVEN
str_206:
        dc.b    '207. G',$F6,'ra CD-skivor f',$F6,'r d',$F6,'va',0
        EVEN
str_207:
        dc.b    '208. G',$E5,' p',$E5,' r',$F6,'tt i tullen f',$F6,'r att det ',$E4,'r mindre k',$F6,' d',$E4,'r',0
        EVEN
str_208:
        dc.b    '209. G',$F6,'mma sig f',$F6,'r mopeder',0
        EVEN
str_209:
        dc.b    '210. Klippa gr',$E4,'smattan med en rubank',0
        EVEN
str_210:
        dc.b    '211. Ta med sig s',$F6,'mntabletter till ett raveparty',0
        EVEN
str_211:
        dc.b    '212. Anv',$E4,'nda sn',$F6,'slunga n',$E4,'r man g',$F6,'r potatismos',0
        EVEN
str_212:
        dc.b    '213. Samla p',$E5,' gamla CP-listor',0
        EVEN
str_213:
        dc.b    '214. Anv',$E4,'nda kardborreband till sina frim',$E4,'rken',0
        EVEN
str_214:
        dc.b    '215. Spela det vanliga spelet "Insert Coin" p',$E5,' arkad',0
        EVEN
str_215:
        dc.b    '216. Fuska p',$E5,' halkk',$F6,'rningen',0
        EVEN
str_216:
        dc.b    '217. Kl',$E4,' ut sig till Darkwing Duck p',$E5,' ett m',$F6,'te med Hem och Skola',0
        EVEN
str_217:
        dc.b    '218. Vidarekoppla sin telefon till BRIS',0
        EVEN
str_218:
        dc.b    '219. Ge Hans Sheike dagens ris i Dagens Nyheter',0
        EVEN
str_219:
        dc.b    '220. Fr',$E5,'ga folk varf',$F6,'r dom inte vill ',$E4,'ta stolar',0
        EVEN
str_220:
        dc.b    '221. Anv',$E4,'nda flugpapper som musmatta',0
        EVEN
str_221:
        dc.b    '222. G',$F6,'ra inbrott p',$E5,' en bank och stj',$E4,'la bankvalvet men inte pengarna',0
        EVEN
str_222:
        dc.b    '223. S',$E4,'lja sitt hus och k',$F6,'pa Estline-Aktier f',$F6,'r pengarna',0
        EVEN
str_223:
        dc.b    '224. Hugga ner ett tr',$E4,'d f',$F6,'r att kunna dra i r',$F6,'tterna',0
        EVEN
str_224:
        dc.b    '225. S',$E4,'lja sin fru och flytta till Venedig och bli jordbrukare',0
        EVEN
str_225:
        dc.b    '226. S',$E4,'tta upp sina tapeter med kardborreband',0
        EVEN
str_226:
        dc.b    '227. Vidarekoppla sin telefon till sig sj',$E4,'lv',0
        EVEN
str_227:
        dc.b    '228. S',$E4,'lja sina syskon till en bagare och emigrera till ',$D6,'rebro',0
        EVEN
str_228:
        dc.b    '229. Swappa husdjur',0
        EVEN
str_229:
        dc.b    '230. Samla p',$E5,' bomull, det ',$E4,'r bra f',$F6,'r hj',$E4,'rnan',0
        EVEN
str_230:
        dc.b    '231. Tapetsera med CP-listor',0
        EVEN
str_231:
        dc.b    '232. Fira Aidsdagen varje ',$E5,'r',0
        EVEN
str_232:
        dc.b    '233. L',$E5,'na b',$F6,'cker p',$E5,' biblioteket och sedan l',$E4,'mna in dom p',$E5,' bokhandeln',0
        EVEN
str_233:
        dc.b    '234. K',$F6,'pa skivor p',$E5,' ',$C5,'hl',$E9,'ns',0
        EVEN
str_234:
        dc.b    '235. Sampla moduler',0
        EVEN
str_235:
        dc.b    '236. Sova p',$E5,' ',$F6,'verg',$E5,'ngsst',$E4,'llen',0
        EVEN
str_236:
        dc.b    '237. F',$F6,'rs',$F6,'ka v',$E4,'lta Eiffeltornet',0
        EVEN
str_237:
        dc.b    '238. Spela rugby med landminor',0
        EVEN
str_238:
        dc.b    '239. R',$F6,'sta p',$E5,' folkpartiet i Sikta Mot Stj',$E4,'rnorna',0
        EVEN
str_239:
        dc.b    '240. Stoppa in CD-skivor med texten upp',$E5,'t, d',$E5,' kan man h',$F6,'ra musik',0
        EVEN
str_240:
        dc.b    '241. Tilta arkadspel',0
        EVEN
str_241:
        dc.b    '242. Fylla sin frys med hockeybilder',0
        EVEN
str_242:
        dc.b    '243. Fejka klisterm',$E4,'rken',0
        EVEN
str_243:
        dc.b    '244. Plugga p',$E5,' fel prov',0
        EVEN
str_244:
        dc.b    '245. ',$C4,'ta s',$E5,' l',$E5,'ngsamt s',$E5,' att man aldrig hinner bli m',$E4,'tt',0
        EVEN
str_245:
        dc.b    '246. Bryta sig in hos n',$E5,'gon bara f',$F6,'r att f',$E5,' svara i deras telefon',0
        EVEN
str_246:
        dc.b    '247. G',$F6,'ra graffitim',$E5,'lningar med paintballpistol',0
        EVEN
str_247:
        dc.b    '248. Ha fler hormoner ',$E4,'n IQ',0
        EVEN
str_248:
        dc.b    '249. ',$C4,'ta upp nobelpriset',0
        EVEN
str_249:
        dc.b    '250. Ringa och prata med faxar',0
        EVEN
str_250:
        dc.b    '251. Visa upp den h',$E4,'r CP-listan f',$F6,'r psykologen p',$E5,' m',$F6,'nstringen',0
        EVEN
str_251:
        dc.b    '252. Ta ut sin l',$F6,'n i presentkort p',$E5,' resor med rederiet Estline',0
        EVEN
str_252:
        dc.b    '253. Str',$F6,' saffran p',$E5,' v',$E4,'gar n',$E4,'r det ',$E4,'r halt',0
        EVEN
str_253:
        dc.b    '254. K',$F6,'ra i vattenfall med mopeder',0
        EVEN
str_254:
        dc.b    '255. ',$C4,'ta upp sina matteprov',0
        EVEN
str_255:
        dc.b    '256. Putsa sina glas',$F6,'gon med lim',0
        EVEN
str_256:
        dc.b    '257. ',$C4,'ta maneter',0
        EVEN
str_257:
        dc.b    '258. Vara r',$E4,'dd f',$F6,'r kundvagnar',0
        EVEN
str_258:
        dc.b    '259. Spr',$E4,'nga h',$E4,'lsokostbutiker i protest mot Sveriges intr',$E4,'de i EU',0
        EVEN
str_259:
        dc.b    '260. ',$C5,'ka vattenskidor i skogen',0
        EVEN
str_260:
        dc.b    '261. Satsa allt man ',$E4,'ger p',$E5,' en fabrik som tillverkar alkoholfri mj',$F6,'lk',0
        EVEN
str_261:
        dc.b    '262. Meta r',$E4,'kor',0
        EVEN
str_262:
        dc.b    '263. Kamma sig med en osthyvel',0
        EVEN
str_263:
        dc.b    '264. Fr',$E5,'ga n',$E4,'r man f',$E5,'r b',$F6,'rja anv',$E4,'nda lasersv',$E4,'rd i lumpen',0
        EVEN
str_264:
        dc.b    '265. ',$D6,'nska att man vore en dv',$E4,'rg s',$E5,' man kan bada i bensintanken p',$E5,' sin bil',0
        EVEN
str_265:
        dc.b    '266. Spela piano p',$E5,' ',$F6,'verg',$E5,'ngsst',$E4,'llen',0
        EVEN
str_266:
        dc.b    '267. Tr',$E4,'nga in sin bil i tv',$E4,'ttmaskinen',0
        EVEN
str_267:
        dc.b    '268. Kedja fast sin fru vid spisen',0
        EVEN
str_268:
        dc.b    '269. Stoppa in en Thunderking i sin CD-spelare',0
        EVEN
str_269:
        dc.b    '270. L',$E5,'sa in barn i f',$F6,'rvaringssk',$E5,'pen p',$E5,' ',$C5,'hlens n',$E4,'r man ',$E4,'r barnvakt',0
        EVEN
str_270:
        dc.b    '271. ',$C4,'ta en spargris p',$E5,' julafton',0
        EVEN
str_271:
        dc.b    '272. Hoppa p',$E5,' semlor',0
        EVEN
str_272:
        dc.b    '273. Tillverka alkoholfritt hembr',$E4,'nt',0
        EVEN
str_273:
        dc.b    '274. B',$E4,'dda sin s',$E4,'ng med ',$F6,'ronen',0
        EVEN
str_274:
        dc.b    '275. H',$E5,'ngla med sig sj',$E4,'lv',0
        EVEN
str_275:
        dc.b    '276. B',$E4,'ra reflex inomhus',0
        EVEN
str_276:
        dc.b    '277. Tro p',$E5,' Turtles',0
        EVEN
str_277:
        dc.b    '278. S',$E4,'tta segel p',$E5,' rullstol',0
        EVEN
str_278:
        dc.b    '279. G',$E5,' med i Nintendoklubben med flit',0
        EVEN
str_279:
        dc.b    '280. Spela in bootlegs med Syskonringen',0
        EVEN
str_280:
        dc.b    '281. K',$F6,'ra rullstol i en puckelpist',0
        EVEN
str_281:
        dc.b    '282. Tycka att Game & Watch ',$E4,'r Cyber!',0
        EVEN
str_282:
        dc.b    '283. S',$E4,'ga upp sig fr',$E5,'n jobbet f',$F6,'r att kolla p',$E5,' serierna p',$E5,' TV4',0
        EVEN
str_283:
        dc.b    '284. Anv',$E4,'nda Nintendokortet som legitimation',0
        EVEN
str_284:
        dc.b    '285. Backa med en bil jorden runt',0
        EVEN
str_285:
        dc.b    '286. Tr',$E4,'na p',$E5,' att bli homosexuell',0
        EVEN
str_286:
        dc.b    '287. G',$E5,' om en ',$E5,'rskurs p',$E5,' skoj',0
        EVEN
str_287:
        dc.b    '288. Anv',$E4,'nda CP-listan som h',$E5,'rdvaluta',0
        EVEN
str_288:
        dc.b    '289. Beg',$E5,' sj',$E4,'lvmord p',$E5,' skoj',0
        EVEN
str_289:
        dc.b    '290. Leka mamma-pappa-barn med sina f',$F6,'r',$E4,'ldrar',0
        EVEN
str_290:
        dc.b    '291. F',$F6,'rbjuda brottning i TV',0
        EVEN
str_291:
        dc.b    '292. Lita p',$E5,' "En Ding Ding V',$E4,'rld"',0
        EVEN
str_292:
        dc.b    '293. Gr',$E4,'va ned CD-skivor ifall det blir krig',0
        EVEN
str_293:
        dc.b    '294. Praktisera som pension',$E4,'r',0
        EVEN
str_294:
        dc.b    '295. Leka l',$F6,'k',0
        EVEN
str_295:
        dc.b    '296. Tro att man blir full i fyllecellen',0
        EVEN
str_296:
        dc.b    '297. Sampla r',$F6,'k',0
        EVEN
str_297:
        dc.b    '298. Tjuvkoppla rullstolar',0
        EVEN
str_298:
        dc.b    '299. Ragga p',$E5,' kyrkans barntimmar',0
        EVEN
str_299:
        dc.b    '300. Anordna nattorientering f',$F6,'r m',$F6,'rkr',$E4,'dda mongos',0
        EVEN
str_300:
        dc.b    '301. Raka igelkottar',0
        EVEN
str_301:
        dc.b    '302. Tro att S',$E4,'po ',$E4,'r ett finskt CP',0
        EVEN
str_302:
        dc.b    '303. Smutsa ner "tv',$E4,'ttade" pengar',0
        EVEN
str_303:
        dc.b    '304. Spinna med rullstol',0
        EVEN
str_304:
        dc.b    '305. S',$F6,'ka upp och m',$F6,'rda folk som ringer fel',0
        EVEN
str_305:
        dc.b    '306. Fylla sin sovs',$E4,'ck med skottar',0
        EVEN
str_306:
        dc.b    '307. Anordna st',$F6,'ldgodsm',$E4,'ssa',0
        EVEN
str_307:
        dc.b    '308. Utrusta sin rullstol med katapultfunktion',0
        EVEN
str_308:
        dc.b    '309. Dra t',$E4,'lt efter bilen',0
        EVEN
str_309:
        dc.b    '310. Tro att Ghandi gjorde aff',$E4,'rer med Bofors',0
        EVEN
str_310:
        dc.b    '311. Ringa 020-nummer med CC',0
        EVEN
str_311:
        dc.b    '312. Ha surfingbr',$E4,'dan i beredskap n',$E4,'r man ringer Internet',0
        EVEN
str_312:
        dc.b    '313. Tj',$E4,'na storkovan p',$E5,' falska CP-listor',0
        EVEN
str_313:
        dc.b    '314. H',$E4,'rma Hans Sheike i Sikta mot Stj',$E4,'rnorna',0
        EVEN
str_314:
        dc.b    '315. Sy toaletter i sysl',$F6,'jden',0
        EVEN
str_315:
        dc.b    '316. Injicera Oboy!',0
        EVEN
str_316:
        dc.b    '317. Leta efter Fanta-skatten',0
        EVEN
str_317:
        dc.b    '318. Anordna VM i s',$E4,'ngv',$E4,'tning',0
        EVEN
str_318:
        dc.b    '319. Spola tillbaka sina CD-skivor efter avlyssning',0
        EVEN
str_319:
        dc.b    '320. Jobba svart som polis',0
        EVEN
str_320:
        dc.b    '321. ',$C4,'rva kroppsdelar',0
        EVEN
str_321:
        dc.b    '322. Anordna VM i deklaration',0
        EVEN
str_322:
        dc.b    '323. ',$C4,'ta sig m',$E4,'tt p',$E5,' alvedon',0
        EVEN
str_323:
        dc.b    '324. S',$E4,'ga det man just sa',0
        EVEN
str_324:
        dc.b    '325. Leka soffa',0
        EVEN
str_325:
        dc.b    '326. B',$F6,'rja spela golf f',$F6,'r att f',$E5,' ett handikapp',0
        EVEN
str_326:
        dc.b    '327. Bos',$E4,'tta sig hos Gerhard',0
        EVEN
str_327:
        dc.b    '328. Placera sina barn i mikrov',$E5,'gsugnen',0
        EVEN
str_328:
        dc.b    '329. Fylla sin s',$E4,'ng med popcorn p',$E5,' m',$F6,'nstringen',0
        EVEN
str_329:
        dc.b    '330. D',$F6,'mas till livstids avr',$E4,'ttning f',$F6,'r diverse pianost',$F6,'lder',0
        EVEN
str_330:
        dc.b    '331. B',$E4,'ra turkosa snowjoggings p',$E5,' br',$F6,'llop',0
        EVEN
str_331:
        dc.b    '332. S',$E4,'lja trimdelar till snow-racers',0
        EVEN
str_332:
        dc.b    '333. Cykla upp f',$F6,'r Holmenkollen',0
        EVEN
str_333:
        dc.b    '334. F',$F6,'rs',$F6,'ka m',$F6,'rda s',$E5,' m',$E5,'nga som m',$F6,'jligt p',$E5,' sin student',0
        EVEN
str_334:
        dc.b    '335. ',$C4,'ta upp Syskonringen',0
        EVEN
str_335:
        dc.b    '336. Anv',$E4,'nda cornflakes som frim',$E4,'rken',0
        EVEN
str_336:
        dc.b    '337. Fejka kuvert',0
        EVEN
str_337:
        dc.b    '338. Byta namn till Glenn',0
        EVEN
str_338:
        dc.b    '339. Lurpassa p',$E5,' orienterare',0
        EVEN
str_339:
        dc.b    '340. Sprida CP-listan',0
        EVEN
str_340:
        dc.b    '341. Deklarera f',$F6,'r mer ',$E4,'n vad man tj',$E4,'nar',0
        EVEN
str_341:
        dc.b    '342. Inf',$F6,'ra svartvita radios',$E4,'ndningar',0
        EVEN
str_342:
        dc.b    '343. Missbruka runskrift',0
        EVEN
str_343:
        dc.b    '344. 01000111.01101100.01100101. 01101110.01101110',0
        EVEN
str_344:
        dc.b    '345. Tror att piratkopierare ',$E4,'r en',$F6,'gda och har tr',$E4,'ben',0
        EVEN
str_345:
        dc.b    '346. Arrestera alla som ',$E5,'ker b',$E5,'t till copy-partys',0
        EVEN
str_346:
        dc.b    '347. ',$C4,'ta med lasersv',$E4,'rd',0
        EVEN
str_347:
        dc.b    '348. S',$E4,'tta in pengar p',$E5,' "Minuten"',0
        EVEN
str_348:
        dc.b    '349. Skratta ',$E5,'t sk',$E4,'ggiga h',$E4,'star',0
        EVEN
str_349:
        dc.b    '350. V',$E4,'lta kor i Indien',0
        EVEN
str_350:
        dc.b    '351. Vinna Fredrik Johannessens Fiat-74 i Bingolotto',0
        EVEN
str_351:
        dc.b    '352. Betala f',$F6,'r fri download p',$E5,' Rosenbads BBS',0
        EVEN
str_352:
        dc.b    '353. K',$F6,'pa en truck s',$E5,' att man kan placera om bilar p',$E5,' en parkering',0
        EVEN
str_353:
        dc.b    '354. Palla ris i Kina',0
        EVEN
str_354:
        dc.b    '355. Byta sina f',$F6,'r',$E4,'ldrar mot en P',$E4,'ronsplit',0
        EVEN
str_355:
        dc.b    '356. Rymma hem n',$E4,'r man ',$E4,'r p',$E5,' semester',0
        EVEN
str_356:
        dc.b    '357, Tro att Sk',$E5,'ne ',$E4,'r ett st',$E4,'lle d',$E4,'r alla g',$E5,'r p',$E5,' h',$E4,'nder',0
        EVEN
str_357:
        dc.b    '358. Tillverka fyrverkerier baserade p',$E5,' grund',$E4,'mnet apelsinmarmelad',0
        EVEN
str_358:
        dc.b    '359. Tvivla p',$E5,' allt John Pohlman s',$E4,'ger och st',$E5,'r f',$F6,'r',0
        EVEN
str_359:
        dc.b    '360. Anv',$E4,'nda s',$E4,'kerhetsb',$E4,'lte i bastu',0
        EVEN
str_360:
        dc.b    '361. Lukta p',$E5,' lampsk',$E4,'rmar',0
        EVEN
str_361:
        dc.b    '362. L',$E4,'mna in CP-listan som specialarbete i religion',0
        EVEN
str_362:
        dc.b    '363. Tro att en PC ',$E4,'r b',$E4,'ttre ',$E4,'n en C64',0
        EVEN
str_363:
        dc.b    '364. Anv',$E4,'nda keps som preventivmedel',0
        EVEN
str_364:
        dc.b    '365. Kalla sin syster f',$F6,'r sin sv',$E5,'gers fru',0
        EVEN
str_365:
        dc.b    '366. Postr',$F6,'sta p',$E5,' Te Partys demot',$E4,'vling',0
        EVEN
str_366:
        dc.b    '367. Kl',$E4,' ut sig till sp',$E5,'rvagnskontrollant f',$F6,'r att f',$E5,' ',$E5,'ka gratis',0
        EVEN
str_367:
        dc.b    '368. Anv',$E4,'nda CP-listan som tandborste',0
        EVEN
str_368:
        dc.b    '369. Skryta om att man har f',$E4,'rg-TV',0
        EVEN
str_369:
        dc.b    '370. Drunkna n',$E4,'r man f',$F6,'rs',$F6,'ker ta baddaren i simskolan',0
        EVEN
str_370:
        dc.b    '371. F',$F6,'rklara krig mot Fr',$E4,'lsningsarm',$E9,'n',0
        EVEN
str_371:
        dc.b    '372. Stj',$E4,'la fr',$E5,'n dom rika i Rinkeby och ge till dom fattiga p',$E5,' ',$D6,'stermalm',0
        EVEN
str_372:
        dc.b    '373. Tro att "Tre Kronor" kommer som flipperspel',0
        EVEN
str_373:
        dc.b    '374. Beg',$E4,'ra bl',$E5,' lingon',0
        EVEN
str_374:
        dc.b    '375. Odla opiumkantareller',0
        EVEN
str_375:
        dc.b    '376. Gl',$F6,'mma bort att sova under en trem',$E5,'naders period',0
        EVEN
str_376:
        dc.b    '377. F',$F6,'rs',$F6,'rja sig som illegal graffitim',$E5,'lare',0
        EVEN
str_377:
        dc.b    '378. K',$F6,'pa en Amiga 4000 Tower f',$F6,'r att f',$E5,' snabbare c64 emulering',0
        EVEN
str_378:
        dc.b    '379. H',$E4,'lsa p',$E5,' lyktstolpar',0
        EVEN
str_379:
        dc.b    '380. H',$E4,'vda att AIDS inte sprids genom kranvatten',0
        EVEN
str_380:
        dc.b    '381. Ha sex med pl',$E5,'t',0
        EVEN
str_381:
        dc.b    '382. R',$E5,'na Internationella V',$E4,'rldsbanken',0
        EVEN
str_382:
        dc.b    '383. Tortera folk genom att l',$E4,'sa upp CP-listan',0
        EVEN
str_383:
        dc.b    '384. Snickra en m',$F6,'ssa s',$E5,' att man blir homosexuell om man tar p',$E5,' sig den',0
        EVEN
str_384:
        dc.b    '385. Swappa mat med Ska-ni-ha-n',$E5,'got-att- ',$E4,'ta-mannen',0
        EVEN
str_385:
        dc.b    '386. Bygga om CP-listan till en atombomb',0
        EVEN
str_386:
        dc.b    '387. Tro att skinnbanjo ',$E4,'r ett djur',0
        EVEN
str_387:
        dc.b    '389. G',$F6,'ra upp med John Pohlman',0
        EVEN
str_388:
        dc.b    '390. V',$E4,'ssa armb',$E5,'garna med pennv',$E4,'ssare',0
        EVEN
str_389:
        dc.b    '391. Skylta utefter hela E20 med skyltar d',$E4,'r det st',$E5,'r "Frigolit"',0
        EVEN
str_390:
        dc.b    '392. Driva in slipade strumpstickor i Druttens mellang',$E4,'rde',0
        EVEN
str_391:
        dc.b    '393. Stycka alla barn som rycker tomten i sk',$E4,'gget',0
        EVEN
str_392:
        dc.b    '394. Slicka frim',$E4,'rken p',$E5,' b',$E5,'da sidorna s',$E5,' att man kan anv',$E4,'nda samma frim',$E4,'rke till tv',$E5,' brev',0
        EVEN
str_393:
        dc.b    '395. Utn',$E4,'mna sig sj',$E4,'lv till m',$E4,'sterspion d',$E5,' man hittat en l',$F6,'s-n',$E4,'sa i en tidningsautomat',0
        EVEN
str_394:
        dc.b    '396. Tycka synd om Bingo-Berra f',$F6,'r han trillar och sl',$E5,'r sig i Bingolotto',0
        EVEN
str_395:
        dc.b    '397. Ta patent p',$E5,' kakor av tandkr',$E4,'m',0
        EVEN
str_396:
        dc.b    '398. Samla p',$E5,' navelstr',$E4,'ngar',0
        EVEN
str_397:
        dc.b    '399. Gillra f',$E4,'llor f',$F6,'r Delerium-Dagobert d',$E5,' han smyger i vassen',0
        EVEN
str_398:
        dc.b    '400. Spela schack med d',$F6,'den, och fuska',0
        EVEN
str_399:
        dc.b    '401. Svetsa disken, ist',$E4,'llet f',$F6,'r att diska den',0
        EVEN
str_400:
        dc.b    '402. St',$E4,'mma synthar med st',$E4,'mmgaffel',0
        EVEN
str_401:
        dc.b    '403. "Dunka" med huvudet ist',$E4,'llet f',$F6,'r bollen i basket',0
        EVEN
str_402:
        dc.b    '404. Demonstrera mot porren genom att limma fast sig p',$E5,' motorv',$E4,'gen',0
        EVEN
str_403:
        dc.b    '405. Huka sig under bordet n',$E4,'r n',$E5,'gon r',$E5,'kar n',$E4,'mna ordet "wok"',0
        EVEN
str_404:
        dc.b    '406. Spritsa sitt specialarbete',0
        EVEN
str_405:
        dc.b    '407. Snickra en b',$E4,'ver som anfaller barnvagnar',0
        EVEN
str_406:
        dc.b    '408. Anv',$E4,'nd cornflakes-paket som towerl',$E5,'da',0
        EVEN
str_407:
        dc.b    '409. Tveka om man tvingas v',$E4,'lja mellan familjen och porr',0
        EVEN
str_408:
        dc.b    '410. Swappa med televerket',0
        EVEN
str_409:
        dc.b    '411. Ropa "Felringning" fyra g',$E5,'nger under centralprovet i svenska',0
        EVEN
str_410:
        dc.b    '412. Tro att allt som flyter g',$E5,'r att ',$E4,'ta',0
        EVEN
str_411:
        dc.b    '413. Cracka moduler',0
        EVEN
str_412:
        dc.b    '414. S',$E4,'nda text-TV med blindskrift',0
        EVEN
str_413:
        dc.b    '415. Anordna VM i k',$F6,'ttbullar',0
        EVEN
str_414:
        dc.b    '416. S',$E4,'nda radioprogram f',$F6,'r v',$E4,'nsterh',$E4,'nta',0
        EVEN
str_415:
        dc.b    '417. Motionsr',$F6,'ka',0
        EVEN
str_416:
        dc.b    '418. Anordna VM i felringning',0
        EVEN
str_417:
        dc.b    '419. Tro att Karl Marx ',$E4,'r Honey Monster',0
        EVEN
str_418:
        dc.b    '420. Anv',$E4,'nda CP-listan som matsedel i skolan',0
        EVEN
str_419:
        dc.b    '421. Ers',$E4,'tta alla f',$F6,'rskolefr',$F6,'knar med CP-listan',0
        EVEN
str_420:
        dc.b    '422. Tro att filmen "Salo" ',$E4,'r en dokument',$E4,'rfilm',0
        EVEN
str_421:
        dc.b    '423. Kl',$E4,'ttra i livsfarlig ledning',0
        EVEN
str_422:
        dc.b    '424. Tro att Doom ',$E4,'r b',$E4,'ttre ',$E4,'n Bratwurst',0
        EVEN
str_423:
        dc.b    '425. ',$C4,'gna sin fritid ',$E5,'t att v',$E4,'lta t',$E5,'g',0
        EVEN
str_424:
        dc.b    '426. Skriva barnporr som sitt st',$F6,'rsta intresse vid anst',$E4,'llningsintervjuer',0
        EVEN
str_425:
        dc.b    '427. F',$F6,'rs',$F6,'ka bli s',$E5,' lik en cementklump som m',$F6,'jligt',0
        EVEN
str_426:
        dc.b    '428. Tillverka en Virtual Reality hj',$E4,'lm f',$F6,'r blinda',0
        EVEN
str_427:
        dc.b    '429. R',$F6,'ka disketter ist',$E4,'llet f',$F6,'r fisk',0
        EVEN
str_428:
        dc.b    '430. Sl',$E5,' ihj',$E4,'l och rensa Fish-disketter innan man anv',$E4,'nder dom',0
        EVEN
str_429:
        dc.b    '431. Tro att Grodan Boll ',$E4,'r rund och gjord av svart/vitt l',$E4,'der',0
        EVEN
str_430:
        dc.b    '432. Kalla alla som bor i Tanums-Hede f',$F6,'r Kapten Krok',0
        EVEN
str_431:
        dc.b    '433. L',$E5,'ta Blomster-Leif g',$F6,'ra ditt specialarbete',0
        EVEN
str_432:
        dc.b    '434. F',$F6,'rebygga ungdomsv',$E5,'ld genom att spr',$E4,'nga dagis',0
        EVEN
str_433:
        dc.b    '435. Skriva sina prov med osynlighetsbl',$E4,'ck',0
        EVEN
str_434:
        dc.b    '436. Tro att skolan ',$E4,'r en demokratisk organisation',0
        EVEN
str_435:
        dc.b    '437. Krossa kn',$E4,'sk',$E5,'larna med vilje f',$F6,'r att se om CP-',$E4,'ngeln kommer och helar dem',0
        EVEN
str_436:
        dc.b    '438. Fixa spritr',$E4,'ttigheter till ett knattedisco',0
        EVEN
str_437:
        dc.b    '439. Tro att man f',$E5,'r Nobels fredspris om man kastar 1000 utvecklingsst',$F6,'rda lemmlar p',$E5,' JAS',0
        EVEN
str_438:
        dc.b    '440. Anv',$E4,'nda Gangbang-medlemskortet som legitimation',0
        EVEN
str_439:
        dc.b    '441. Citera "Satansverserna" i en mosk',$E9,' i Mekka',0
        EVEN
str_440:
        dc.b    '442. Tro att man kan bota personlighetsklyvning med lim',0
        EVEN
str_441:
        dc.b    '443. Tro att man f',$E5,'r h',$F6,'gre studiebidrag om man gangbangar finansministern',0
        EVEN
str_442:
        dc.b    '444. Protestera mot Sveriges ekonomiska politik genom att br',$E4,'nna upp sina pengar utanf',$F6,'r riksbanken',0
        EVEN
str_443:
        dc.b    '445. Leka Doom med sin lillebror och pappas motors',$E5,'g',0
        EVEN
str_444:
        dc.b    '446. ',$C4,'gna sitt liv ',$E5,'t att leta efter v',$E4,'rldskanten',0
        EVEN
str_445:
        dc.b    '447. Samla molekyler',0
        EVEN
str_446:
        dc.b    '448. St',$E4,'lla upp med en k',$F6,'nsrockl',$E5,'t i Melodifestivalen',0
        EVEN
str_447:
        dc.b    '449. G',$E5,' in och skrika "Trendbrott" p',$E5,' JC',0
        EVEN
str_448:
        dc.b    '450. Uppfinna en CP-pacemaker som byter takt var 3:e minut och drivs med uran',0
        EVEN
str_449:
        dc.b    '451. Tillverka glass med alvedonsmak',0
        EVEN
str_450:
        dc.b    '452. Kapa TV 4:s text-TV f',$F6,'r att kunna s',$E4,'nda CP-listan',0
        EVEN
str_451:
        dc.b    '453. Ta sitt liv varje g',$E5,'ng man inte vinner p',$E5,' Bingolotto',0
        EVEN
str_452:
        dc.b    '454. Skolka f',$F6,'r att kunna kolla p',$E5,' Dj Kat Show',0
        EVEN
str_453:
        dc.b    '455. Greeta alla som b',$E4,'r tr',$E4,'skor i Kesos 28 k intro',0
        EVEN
str_454:
        dc.b    '456. Fr',$E5,'ga Slash/Citron. om han har n',$E5,'gra moduler',0
        EVEN
str_455:
        dc.b    '457. G',$E5,' in p',$E5,' McDonalds och best',$E4,'lla en halv special',0
        EVEN
str_456:
        dc.b    '458. B',$F6,'rja som Ascii grafiker vid hovet i Somalia',0
        EVEN
str_457:
        dc.b    '459. Smuggla r',$E4,'kor jorden runt',0
        EVEN
str_458:
        dc.b    '460. G',$F6,'ra honn',$F6,'r f',$F6,'r en finsk v',$E4,'rnpliktig',0
        EVEN
str_459:
        dc.b    '461. ',$D6,'ppna en djurpark f',$F6,'r utvecklingsst',$F6,'rda djur',0
        EVEN
str_460:
        dc.b    '462. L',$E5,'na ut sina rollspel till Ulf',0
        EVEN
str_461:
        dc.b    '463. Operera bort ryggraden f',$F6,'r att v',$E4,'ga mindre',0
        EVEN
str_462:
        dc.b    '464. Stifta lagar',0
        EVEN
str_463:
        dc.b    '465. Ta med badbyxor till ett copyparty',0
        EVEN
str_464:
        dc.b    '466. Sl',$E5,' ihj',$E4,'l flugor med karatepinnar',0
        EVEN
str_465:
        dc.b    '467. Koppla in sig p',$E5,' grannens TV-antenn f',$F6,'r att f',$E5,' f',$E4,'rre TV-kanaler',0
        EVEN
str_466:
        dc.b    '468. Ordna en l',$F6,'pt',$E4,'vling f',$F6,'r folk som ',$E4,'r lama',0
        EVEN
str_467:
        dc.b    '469. Tro att Dj Cat ska f',$E5,' Nobelpriset i litteratur f',$F6,'r denna lista',0
        EVEN
str_468:
        dc.b    '470. F',$F6,'rs',$F6,'ka sno s',$E5,' mycket lego som m',$F6,'jligt p',$E5,' Legoland',0
        EVEN
str_469:
        dc.b    '471. Trimma Kinder',$E4,'ggsleksaker',0
        EVEN
str_470:
        dc.b    '472. Dammsuga bananerna p',$E5,' Obs! innan man k',$F6,'per dem',0
        EVEN
str_471:
        dc.b    '473. K',$F6,'pa biljetter till vanf',$F6,'rest',$E4,'llningar',0
        EVEN
str_472:
        dc.b    '474. Anv',$E4,'nda cykelhj',$E4,'lm som preventivmedel',0
        EVEN
str_473:
        dc.b    '475. Tro att AFA ',$E4,'r en syf',$F6,'rening f',$F6,'r folkskygga AMOS-codare',0
        EVEN
str_474:
        dc.b    '476. Poppa majskolvar',0
        EVEN
str_475:
        dc.b    '477. Sova p',$E5,' kyrkog',$E5,'rden den 10:e oktober',0
        EVEN
str_476:
        dc.b    '478. Fira F',$E4,'boj',$E4,'ntans dag genom att ',$E4,'ta falukorv',0
        EVEN
str_477:
        dc.b    '479. K',$E4,'mpa sig in i Jeopardy f',$F6,'r att se om det ',$E4,'r n',$E5,'gon man k',$E4,'nner i publiken',0
        EVEN
str_478:
        dc.b    '480. Blanda ut Oboy med hembr',$E4,'nt',0
        EVEN
str_479:
        dc.b    '481. Fridlysa handikapprutor',0
        EVEN
str_480:
        dc.b    '482. ',$C5,'ka fast f',$F6,'r l',$F6,'sdriveri',0
        EVEN
str_481:
        dc.b    '483. G',$E5,' mot gr',$F6,'n gubbe och vara stolt ',$F6,'ver det',0
        EVEN
str_482:
        dc.b    '484. Tycka att Eddie Meduza ',$E4,'r Cyber!',0
        EVEN
str_483:
        dc.b    '485. H',$E4,'vda att Jonas Gardell ',$E4,'r b',$F6,'g',0
        EVEN
str_484:
        dc.b    '486. Tycka att det l',$E5,'ter som musik n',$E4,'r man ritar penisar',0
        EVEN
str_485:
        dc.b    '487. Prenumerera p',$E5,' kn',$E4,'ckebr',$F6,'d',0
        EVEN
str_486:
        dc.b    '488. Betygs',$E4,'tta offentliga toaletter',0
        EVEN
str_487:
        dc.b    '489. Parkera p',$E5,' upptagna P-rutor',0
        EVEN
str_488:
        dc.b    '490. Abonnera p',$E5,' B',$F6,'g',0
        EVEN
str_489:
        dc.b    '491. F',$F6,'rs',$F6,'ka konkurrera med CP-listan',0
        EVEN
str_490:
        dc.b    '492. Tro att bensin ',$E4,'r brandfarligt',0
        EVEN
str_491:
        dc.b    '493. G',$F6,'ra lagen till en sport',0
        EVEN
str_492:
        dc.b    '494. Vara full p',$E5,' ',$E4,'lgjakten',0
        EVEN
str_493:
        dc.b    '495. Bli vegetarisk kannibal',0
        EVEN
str_494:
        dc.b    '496. S',$E4,'lja sk',$F6,'rdetr',$F6,'skor i paket om 6 slumpm',$E4,'ssiga i varje',0
        EVEN
str_495:
        dc.b    '497. Vara vegetarian och ',$E4,'lg',$E4,'tare',0
        EVEN
str_496:
        dc.b    '498. Prova om det g',$F6,'r ont att skjuta sig i huvudet',0
        EVEN
str_497:
        dc.b    '499. R',$F6,'ka askfat',0
        EVEN
str_498:
        dc.b    '500. Sola utan kl',$E4,'der',0
        EVEN
str_499:
        dc.b    '501. Sv',$E4,'lja sin egen gom',0
        EVEN
str_500:
        dc.b    '502. Best',$E4,'lla blyfri 95 p',$E5,' krogen',0
        EVEN
str_501:
        dc.b    '503. Rosta folie',0
        EVEN
str_502:
        dc.b    '504. Tro att Pripps tillverkar ',$F6,'l',0
        EVEN
str_503:
        dc.b    '505. ',$C5,'ka V',$E4,'ttern Runt med rullstol',0
        EVEN
str_504:
        dc.b    '506. Konvertera till heterosexuell',0
        EVEN
str_505:
        dc.b    '507. K',$F6,'pa synvillor p',$E5,' Konsum',0
        EVEN
str_506:
        dc.b    '508. Supa sig full p',$E5,' mellancola',0
        EVEN
str_507:
        dc.b    '509. Bli stammis p',$E5,' motorb',$F6,'rsen',0
        EVEN
str_508:
        dc.b    '510. Anordna rave f',$F6,'r PRO',0
        EVEN
str_509:
        dc.b    '511. Beg',$E4,'ra predikatsfyllnad hos tandl',$E4,'karen',0
        EVEN
str_510:
        dc.b    '512. F',$F6,'rs',$F6,'ka bli anst',$E4,'lld som officiell Bamse-l',$E4,'sare f',$F6,'r Hells Angels',0
        EVEN
str_511:
        dc.b    '513. Snickra ett drogfritt alternativ till Hultsfreds festivalen',0
        EVEN
str_512:
        dc.b    '514. St',$E4,'lla upp i v',$E4,'rldscupen i B',$F6,'g',0
        EVEN
str_513:
        dc.b    '515. Svarva ljusstakar av bomull',0
        EVEN
str_514:
        dc.b    '516. Specialbest',$E4,'lla vegetarisk brysselk',$E5,'l',0
        EVEN
str_515:
        dc.b    '517. G',$F6,'ra sin PRAO som fotbollsm',$E5,'lvakt',0
        EVEN
str_516:
        dc.b    '518. Samla p',$E5,' flytande tv',$E5,'l',0
        EVEN
str_517:
        dc.b    '519. Tillverka 2-D glas',$F6,'gon',0
        EVEN
str_518:
        dc.b    '520. Placera konfirmationsl',$E4,'gret p',$E5,' ett koncentrationsl',$E4,'ger',0
        EVEN
str_519:
        dc.b    '521. Virka en g',$E5,'stol',0
        EVEN
str_520:
        dc.b    '522. F',$F6,'rs',$F6,'ka g',$F6,'ra fyrkantiga r',$F6,'kringar',0
        EVEN
str_521:
        dc.b    '523. S',$E4,'lja ',$F6,'vningsminkar till f',$F6,'rsvaret',0
        EVEN
str_522:
        dc.b    '524. Prenumerera p',$E5,' hemglass',0
        EVEN
str_523:
        dc.b    '525. K',$E4,'nna sig lite generad n',$E4,'r man blir v',$E5,'ldtagen',0
        EVEN
str_524:
        dc.b    '526. ',$C5,'ka till en nudiststrand och vara b',$F6,'g',0
        EVEN
str_525:
        dc.b    '527. ',$C4,'ta chokladpudding i tron att det ',$E4,'r avf',$F6,'ring',0
        EVEN
str_526:
        dc.b    '528. K',$F6,'pa alla skivor med gruppen Various Artists',0
        EVEN
str_527:
        dc.b    '529. G',$F6,'ra ett dataspel som heter MansLemmings och g',$E5,'r ut p',$E5,' att styra sm',$E5,' penisar',0
        EVEN
str_528:
        dc.b    '530. Leta febrilt efter f',$E5,'gelv',$E4,'gen',0
        EVEN
str_529:
        dc.b    '531. Leka Salo i Saluhallen',0
        EVEN
str_530:
        dc.b    '532. Lura vampyrerna genom att sova i en postbox p',$E5,' dagen',0
        EVEN
str_531:
        dc.b    '533. F',$F6,'rs',$F6,'ka bota m',$F6,'rkr',$E4,'dsla med att l',$E5,'ta en vampyr vaka ',$F6,'ver en p',$E5,' natten',0
        EVEN
str_532:
        dc.b    '534. Skaffa horoskop ist',$E4,'llet f',$F6,'r stroboskop till ett raveparty',0
        EVEN
str_533:
        dc.b    '535. Sniffa radiov',$E5,'gor',0
        EVEN
str_534:
        dc.b    '536. Sikta p',$E5,' ',$F6,'verk',$F6,'rda djur p',$E5,' autobahn',0
        EVEN
str_535:
        dc.b    '537. G',$E5,' med i KESO frivilligt',0
        EVEN
str_536:
        dc.b    '538. Vara elak mot andras lillasystrar',0
        EVEN
str_537:
        dc.b    '539. Tatuera "gnuggisar" p',$E5,' br',$F6,'stet',0
        EVEN
str_538:
        dc.b    '540. Koka Colan innan man dricker den',0
        EVEN
str_539:
        dc.b    '541. ',$C5,'ka Vasaloppet med tandpetare som stavar och sugr',$F6,'r som skidor',0
        EVEN
str_540:
        dc.b    '542. Beg',$E5,' harakiri med en glasspinne',0
        EVEN
str_541:
        dc.b    '543. Skaffa Windows 95 och installera det med vilje p',$E5,' sin PC',0
        EVEN
str_542:
        dc.b    '544. Tro att C64:an ',$E4,'r d',$F6,'d',0
        EVEN
str_543:
        dc.b    '545. Snickra sidvagn till rullstol',0
        EVEN
str_544:
        dc.b    '546. K',$F6,'ra en Internet site p',$E5,' C64:an',0
        EVEN
str_545:
        dc.b    '547. Tro att Snorleifs f',$E5,'r spela p',$E5,' Bingolotto',0
        EVEN
str_546:
        dc.b    '548. Snickra en kylsk',$E5,'p-och-ugn-i-ett',0
        EVEN
str_547:
        dc.b    '549. Vika en dator med origami',0
        EVEN
str_548:
        dc.b    '550. Anv',$E4,'nda sm',$F6,'r som sololja',0
        EVEN
str_549:
        dc.b    '551. Starta en piratbas och g',$F6,'ra reklam f',$F6,'r den i text-TV',0
        EVEN
str_550:
        dc.b    '552. Anv',$E4,'nda sovs',$E4,'ck och liggunderlag i himmelss',$E4,'ng',0
        EVEN
str_551:
        dc.b    '553. Skylla p',$E5,' kalla cykelst',$E4,'ll n',$E4,'r man kommer f',$F6,'rsent till lektioner',0
        EVEN
str_552:
        dc.b    '554. Skrika "stormvarning" varje g',$E5,'ng det ',$E4,'r vindstilla',0
        EVEN
str_553:
        dc.b    '555. Konkurrera ut e-mail med k-mail',0
        EVEN
str_554:
        dc.b    '556. Anv',$E4,'nda sina kl',$E4,'der som kudde varje g',$E5,'ng man h',$E4,'lsar p',$E5,' sin morbror',0
        EVEN
str_555:
        dc.b    '557. Sila sitt blod genom kaffefilter f',$F6,'r att filtrera Aidset',0
        EVEN
str_556:
        dc.b    '558. Kr',$E4,'va att sin navelstr',$E4,'ng inte skall klippas av f',$F6,'r att man skall f',$E5,' ut mer av livet',0
        EVEN
str_557:
        dc.b    '559. St',$E4,'lla upp som Michael Jackson i Sm',$E5,'stj',$E4,'rnorna',0
        EVEN
str_558:
        dc.b    '560. Starta en skytteklubb som heter Sikta mot Stj',$E4,'rnorna',0
        EVEN
str_559:
        dc.b    '561. Heja p',$E5,' Reine i Tre Kronor',0
        EVEN
str_560:
        dc.b    '562. Anordna l',$E5,'dbilsrally f',$F6,'r ej simkunniga',0
        EVEN
str_561:
        dc.b    '563. Vara lam fr',$E5,'n nacken och upp',$E5,'t',0
        EVEN
str_562:
        dc.b    '564. Anst',$E4,'lla frilansjournalister f',$F6,'r CP-listan',0
        EVEN
str_563:
        dc.b    '565. Uppt',$E4,'cka att en ljusmil ',$E4,'r s',$E5,' l',$E5,'ngt som ljuset g',$E5,'r p',$E5,' en mil',0
        EVEN
str_564:
        dc.b    '566. Mima till instrumental musik',0
        EVEN
str_565:
        dc.b    '567. Spela in bootlegs i tv',$E4,'ttstugor',0
        EVEN
str_566:
        dc.b    '568. Sampla stickkontakter',0
        EVEN
str_567:
        dc.b    '569. Lifta med satelliter',0
        EVEN
str_568:
        dc.b    '570. Gissa sin arbetstid idag',0
        EVEN
str_569:
        dc.b    '571. L',$E4,'ra sig CP-listan utantill',0
        EVEN
str_570:
        dc.b    '572. Obducera sig sj',$E4,'lv',0
        EVEN
str_571:
        dc.b    '573. Vara intresserad av gr',$F6,'n',0
        EVEN
str_572:
        dc.b    '574. F',$F6,'rvara sina CP-listor i njurarna',0
        EVEN
str_573:
        dc.b    '575. Bli skedslukare ist',$E4,'llet f',$F6,'r sv',$E4,'rdslukare',0
        EVEN
str_574:
        dc.b    '576. Hoppa ',$F6,'ver ',$E5,'rets Te Party f',$F6,'r kretsm',$E4,'sterskap i sten, sax, p',$E5,'se',0
        EVEN
str_575:
        dc.b    '577. Nuka CP-listan p',$E5,' Instant Pleasure',0
        EVEN
str_576:
        dc.b    '578. Sk',$F6,'lja ner Antabus med br',$E4,'nnvin',0
        EVEN
str_577:
        dc.b    '579. Viska n',$E4,'r man chattar',0
        EVEN
str_578:
        dc.b    '580. Mucka med vasalopps',$E5,'kare',0
        EVEN
str_579:
        dc.b    '581. Sk',$E4,'lla ut sina m',$F6,'bler',0
        EVEN
str_580:
        dc.b    '582. G',$F6,'mma en stereo i ',$F6,'gat',0
        EVEN
str_581:
        dc.b    '583. ',$C5,'ka pulka i uppf',$F6,'rsbackar',0
        EVEN
str_582:
        dc.b    '584. F',$E5,' hallucinationer av Keso',0
        EVEN
str_583:
        dc.b    '585. F',$F6,'rv',$E4,'xla bl',$E5,'b',$E4,'rssoppa med CP-listan',0
        EVEN
str_584:
        dc.b    '586. Planka in p',$E5,' biblioteket',0
        EVEN
str_585:
        dc.b    '587. Snatta larmanordningarna p',$E5,' Kappahl',0
        EVEN
str_586:
        dc.b    '588. Sl',$E4,'nga nya m',$F6,'bler',0
        EVEN
str_587:
        dc.b    '589. L',$E5,'sa in sina kompisar i garderoben',0
        EVEN
str_588:
        dc.b    '590. Kasta upp grannens husdjur i stupr',$E4,'nnan',0
        EVEN
str_589:
        dc.b    '591. K',$E4,'ka upp alla spelkort n',$E4,'r man spelar Uno',0
        EVEN
str_590:
        dc.b    '592. Anv',$E4,'nda svinto som peruk',0
        EVEN
str_591:
        dc.b    '593. Best',$E4,'lla glass med konkelb',$E4,'r p',$E5,' Caf',$E9,' Opera',0
        EVEN
str_592:
        dc.b    '594. Spela plockepinn n',$E4,'r det ',$E4,'r jordb',$E4,'vning',0
        EVEN
str_593:
        dc.b    '595. Bli s',$E5,' ledsen att man gr',$E5,'ter rabattkuponger p',$E5,' ',$C5,'hlens',0
        EVEN
str_594:
        dc.b    '596. Basta med v',$E5,'tdr',$E4,'kt',0
        EVEN
str_595:
        dc.b    '597. Borsta t',$E4,'nderna med vaselin',0
        EVEN
str_596:
        dc.b    '598. K',$F6,'pa sin luftgitarr p',$E5,' rea',0
        EVEN
str_597:
        dc.b    '599. Polisanm',$E4,'la alla fula moln',0
        EVEN
str_598:
        dc.b    '600. Vara allergisk mot allt som rimmar p',$E5,' korv',0
        EVEN
str_599:
        dc.b    '601. Anv',$E4,'nda br',$E4,'nnvin som rakvatten n',$E4,'r man g',$E5,'r p',$E5,' m',$F6,'te med IOGT/NTO',0
        EVEN
str_600:
        dc.b    '602. Tro att kungen kan r',$E4,'kna till 28',0
        EVEN
str_601:
        dc.b    '603. Beg',$E5,' sj',$E4,'lvmord genom att dricka ihj',$E4,'l sig p',$E5,' laxermedel',0
        EVEN
str_602:
        dc.b    '604. R',$E5,'na systembolaget p',$E5,' kassan ist',$E4,'llet f',$F6,'r sprit',0
        EVEN
str_603:
        dc.b    '605. Hoppa p',$E5,' dataspel till filmtrenden med "Patiens -the Movie"',0
        EVEN
str_604:
        dc.b    '606. Skylla p',$E5,' "gubbsjuka" n',$E4,'r man sjukskriver sig',0
        EVEN
str_605:
        dc.b    '607. Spela kl',$E4,'dpoker med sig sj',$E4,'lv',0
        EVEN
str_606:
        dc.b    '608. ',$C4,'ta kvistar och blad p',$E5,' nobelmiddagen',0
        EVEN
str_607:
        dc.b    '609. Tapetsera pepparkakshus',0
        EVEN
str_608:
        dc.b    '610. Inf',$F6,'ra hj',$E4,'lmtv',$E5,'ng p',$E5,' melodifestivalen',0
        EVEN
str_609:
        dc.b    '611. Omyndigf',$F6,'rklara myndigheter',0
        EVEN
str_610:
        dc.b    '612. S',$F6,'ka frisedel i lumpen p.g.a. heterosexualitet',0
        EVEN
str_611:
        dc.b    '613. Skaffa backstagepass p',$E5,' Bor',$E5,'s djurpark',0
        EVEN
str_612:
        dc.b    '614. K',$F6,'pa sina julklappar p',$E5,' McDonalds',0
        EVEN
str_613:
        dc.b    '615. Lukta p',$E5,' Bj',$F6,'rn Borg parfym innan man spelar Ut Run p',$E5,' c64',0
        EVEN
str_614:
        dc.b    '616. Spela ',$F6,'lspelet i fyllecell',0
        EVEN
str_615:
        dc.b    '617. Tillverka 28-kronors sedlar f',$F6,'r att f',$F6,'renkla k',$F6,'nshandeln',0
        EVEN
str_616:
        dc.b    '618. B',$F6,'ga med tjejer',0
        EVEN
str_617:
        dc.b    '619. ',$C4,'ta kokt sushi',0
        EVEN
str_618:
        dc.b    '620. Faxa brevbomber',0
        EVEN
str_619:
        dc.b    '621. Bygga en Filmnet dekoder till sin radio',0
        EVEN
str_620:
        dc.b    '622. K',$F6,'pa alla sina kl',$E4,'der p',$E5,' Ginza musik',0
        EVEN
str_621:
        dc.b    '623. ',$C5,'ka skridskor till jobbet',0
        EVEN
str_622:
        dc.b    '624. K',$F6,'pa sin systers kl',$E4,'der p',$E5,' Butterick''s',0
        EVEN
str_623:
        dc.b    '625. Snyta sig i pungen',0
        EVEN
str_624:
        dc.b    '626. V',$E5,'ldta sig sj',$E4,'lv',0
        EVEN
str_625:
        dc.b    '627. Punktera cykelkedjor',0
        EVEN
str_626:
        dc.b    '628. Utmana P',$E5,'ven p',$E5,' fickpingis',0
        EVEN
str_627:
        dc.b    '629. G',$F6,'ra inbrott hos blinda f',$F6,'r att m',$F6,'blera om deras hus',0
        EVEN
str_628:
        dc.b    '630. Kidnappa n',$E5,'gons pengar och kr',$E4,'va l',$F6,'sensumma f',$F6,'r dem',0
        EVEN
str_629:
        dc.b    '631. Konkurrera med SJ',0
        EVEN
str_630:
        dc.b    '632. Marknadsf',$F6,'ra subventionerade f',$E5,'rskinnsf',$E4,'ll',0
        EVEN
str_631:
        dc.b    '633. Rivalisera med sin far om sin mor',0
        EVEN
str_632:
        dc.b    '634. Fira ny',$E5,'r i Doom',0
        EVEN
str_633:
        dc.b    '635. K',$F6,'pa pengar p',$E5,' Forex',0
        EVEN
str_634:
        dc.b    '636. Springa i promenadstakt',0
        EVEN
str_635:
        dc.b    '637. F',$F6,'rs',$F6,'rja sig p',$E5,' att g',$F6,'ra drive-by',0
        EVEN
str_636:
        dc.b    '638. Fr',$E5,'ga folk vad sm',$F6,'ret kostar varje g',$E5,'ng man missar bussen',0
        EVEN
str_637:
        dc.b    '639. ',$C4,'ta folk innan man fr',$E5,'gar',0
        EVEN
str_638:
        dc.b    '640. ',$C4,'ta vardagsmat',0
        EVEN
str_639:
        dc.b    '641. Samla p',$E5,' udda h',$E4,'star',0
        EVEN
str_640:
        dc.b    '642. Tycka att det ',$E4,'r skumt att inte lukta fisk',0
        EVEN
str_641:
        dc.b    '643. S',$E4,'lja LSD p',$E5,' mogendanser',0
        EVEN
str_642:
        dc.b    '644. Mucka med sn',$F6,0
        EVEN
str_643:
        dc.b    '645. ',$C5,'ka bil f',$F6,'r att lyssna p',$E5,' radio',0
        EVEN
str_644:
        dc.b    '646. Bombhota Internet',0
        EVEN
str_645:
        dc.b    '647. Anv',$E4,'nda bambamat i k',$E4,'rnkraftsreaktorer',0
        EVEN
str_646:
        dc.b    '648. K',$F6,'pa en OS/2 WARP tr',$F6,'ja',0
        EVEN
str_647:
        dc.b    '649. Snatta ',$E4,'rtsoppa',0
        EVEN
str_648:
        dc.b    '650. Undra vem Pearl Harbour ',$E4,'r',0
        EVEN
str_649:
        dc.b    '651. Basta med Kungliga Kammarorkestern',0
        EVEN
str_650:
        dc.b    '652. Sl',$E4,'ppa ascii-collections p',$E5,' papper',0
        EVEN
str_651:
        dc.b    '653. Anordna femdagarskryssning p',$E5,' tipsextra',0
        EVEN
str_652:
        dc.b    '654. Fejka snuffmovies',0
        EVEN
str_653:
        dc.b    '655. Bygga en joniseringskanon i tr',$E4,'sl',$F6,'jden',0
        EVEN
str_654:
        dc.b    '656. Tro att det ',$E4,'r 18-',$E5,'rs gr',$E4,'ns med certifikatsbeh',$F6,'righet p',$E5,' fritidsg',$E5,'rdar',0
        EVEN
str_655:
        dc.b    '657. Smyga i Sm',$F6,'gen',0
        EVEN
str_656:
        dc.b    '658. Hoppas att f',$E5,' reinkarnera i ett kinder',$E4,'gg',0
        EVEN
str_657:
        dc.b    '659. F',$F6,'rs',$F6,'ka korsa sina gener med en kaktus',0
        EVEN
str_658:
        dc.b    '660. Swappa ascii-collections av sn',$F6,0
        EVEN
str_659:
        dc.b    '661. F',$F6,'rs',$F6,'ka s',$E4,'lja sitt k',$F6,'nsorgan som kylsk',$E5,'psmagnet',0
        EVEN
str_660:
        dc.b    '662. Betala f',$F6,'r att f',$E5,' sin pung avsugen',0
        EVEN
str_661:
        dc.b    '663. G',$F6,'ra inbrott i Trollh',$E4,'ttan',0
        EVEN
str_662:
        dc.b    '664. ',$C5,'ka snowboard p',$E5,' Internet',0
        EVEN
str_663:
        dc.b    '665. Anordna protestmarscher mot skavs',$E5,'r',0
        EVEN
str_664:
        dc.b    '666. S',$E4,'lja sin stj',$E4,'rt till dj',$E4,'vulen',0
        EVEN
str_665:
        dc.b    '667. Anv',$E4,'nda CP-listan 365 som almanacka',0
        EVEN
str_666:
        dc.b    '668. F',$F6,'da upp d',$F6,'da f',$E5,'r av kl',$E4,'der',0
        EVEN
str_667:
        dc.b    '669. F',$E4,'lla upp bilstolar med en gammal bandspelare',0
        EVEN
str_668:
        dc.b    '670. Bli en kioskv',$E4,'ltare',0
        EVEN
str_669:
        dc.b    '671. S',$E4,'lja sina pl',$E5,'ster p',$E5,' stan som poster',0
        EVEN
str_670:
        dc.b    '672. Starta en TV-serie som heter Arkiv-K som handlar om muterade penisar',0
        EVEN
str_671:
        dc.b    '673. Best',$E4,'lla "det vanliga" p',$E5,' ICA',0
        EVEN
str_672:
        dc.b    '674. F',$E5,' checksum error p',$E5,' RAM-disken',0
        EVEN
str_673:
        dc.b    '675. Leta efter sin egen K-punkt',0
        EVEN
str_674:
        dc.b    '676. Best',$E4,'lla en varm isvatten p',$E5,' Krickelin i Lidk',$F6,'ping',0
        EVEN
str_675:
        dc.b    '677. Nominera The Pinks som b',$E4,'sta nykomlingar i Grammisgalan 1996',0
        EVEN
str_676:
        dc.b    '678. ',$C4,'ta banan offentligt',0
        EVEN
str_677:
        dc.b    '679. Bjuda upp p',$E5,' synthdisco',0
        EVEN
str_678:
        dc.b    '680. Bygga en klaviatur till en ljusorgel',0
        EVEN
str_679:
        dc.b    '681. Sl',$E4,'ppa lagliga bootlegs',0
        EVEN
str_680:
        dc.b    '682. Tro att h',$E4,'star ',$E4,'r mineraler',0
        EVEN
str_681:
        dc.b    '683. K',$F6,'pa svart/vita videoband p',$E5,' Hobbex',0
        EVEN
str_682:
        dc.b    '684. Tro att Gud ',$E4,'r motsatsen till bl',$E5,0
        EVEN
str_683:
        dc.b    '685. Vara blind och m',$F6,'rkr',$E4,'dd',0
        EVEN
str_684:
        dc.b    '686. Rasta sin kanarief',$E5,'gel',0
        EVEN
str_685:
        dc.b    '687. R',$E4,'kna avst',$E5,'nd i skosn',$F6,'ren',0
        EVEN
str_686:
        dc.b    '688. Tillverka torrvatten som sp',$E4,'ds ut med mj',$F6,'lk',0
        EVEN
str_687:
        dc.b    '689. S',$E4,'lja vykort med h',$E4,'gringar',0
        EVEN
str_688:
        dc.b    '690. Bygga multitaskande ljudkort',0
        EVEN
str_689:
        dc.b    '691. S',$E4,'tta st',$F6,'dhjul p',$E5,' sin bil n',$E4,'r man ',$F6,'vningsk',$F6,'r',0
        EVEN
str_690:
        dc.b    '692. G',$E5,' obev',$E4,'pnad till Konsum',0
        EVEN
str_691:
        dc.b    '693. Vrida sig i pl',$E5,'gor n',$E4,'r man kammar sig',0
        EVEN
str_692:
        dc.b    '694. ',$D6,'ppna en secondhand mataff',$E4,'r',0
        EVEN
str_693:
        dc.b    '695. K',$F6,'pa sina minneschips hos Estrella',0
        EVEN
str_694:
        dc.b    '696. Trimma Ahlgrens bilar',0
        EVEN
str_695:
        dc.b    '697. Konkurrera ut Gaygames med sitt eget Heterogames',0
        EVEN
str_696:
        dc.b    '698. Tycka att det ',$E4,'r tr',$E5,'kigt n',$E4,'r det ',$E4,'r roligt med inte tv',$E4,'rtom',0
        EVEN
str_697:
        dc.b    '699. Onanera st',$E5,'endes p',$E5,' h',$E4,'nder',0
        EVEN
str_698:
        dc.b    '700. K',$F6,'pa minneschips fr',$E5,'n Estrella',0
        EVEN
str_699:
        dc.b    '701. Stj',$E4,'la en bil och cykla till jobbet',0
        EVEN
str_700:
        dc.b    '702. Samla p',$E5,' sm',$E5,'landsstenar',0
        EVEN
str_701:
        dc.b    '703. S',$E4,'tta in kontaktannonser i gula tidningen under "Hemmafruar k',$F6,'pes"',0
        EVEN
str_702:
        dc.b    '704. Bl',$E5,'sa upp d',$F6,'da f',$E5,'glar med helium',0
        EVEN
str_703:
        dc.b    '705. Spara sina finnar till julafton',0
        EVEN
str_704:
        dc.b    '706. ',$D6,'vers',$E4,'tta CP-listan till blindskrift',0
        EVEN
str_705:
        dc.b    '707. Stormtrivas p',$E5,' herrtoaletten',0
        EVEN
str_706:
        dc.b    '708. F',$F6,'rv',$E4,'xla koffeintabletter med valium',0
        EVEN
str_707:
        dc.b    '709. Gifta sig f',$F6,'r stunden',0
        EVEN
str_708:
        dc.b    '710. K',$F6,'pa ett parti d',$F6,'rrar och bli d',$F6,'rrknackare',0
        EVEN
str_709:
        dc.b    '711. Betala med morotsslantar',0
        EVEN
str_710:
        dc.b    '712. Tro att man ',$E4,'r gynekolog',0
        EVEN
str_711:
        dc.b    '713. F',$F6,'rs',$F6,'ka lifta med en taxi',0
        EVEN
str_712:
        dc.b    '714. Sjukskriva sig p.g.a. mj',$E4,'ll',0
        EVEN
str_713:
        dc.b    '715. Vara livr',$E4,'dd f',$F6,'r m',$F6,'rdarsniglar',0
        EVEN
str_714:
        dc.b    '716. Tro att hasardspel ',$E4,'r ett musikinstrument',0
        EVEN
str_715:
        dc.b    '717. H',$E4,'nvisa till allemansr',$E4,'tten om man ',$E5,'ker fast f',$F6,'r snatteri',0
        EVEN
str_716:
        dc.b    '718. F',$F6,'rs',$E4,'kra sina strumpor',0
        EVEN
str_717:
        dc.b    '719. G',$F6,'mma p',$E5,'sk',$E4,'gg p',$E5,' golfbanor',0
        EVEN
str_718:
        dc.b    '720. Ta med sig en freestyle med en Michael Jackson kassett till en ',$F6,'de ',$F6,0
        EVEN
str_719:
        dc.b    '721. Leda cyklar i nedf',$F6,'rsbackar',0
        EVEN
str_720:
        dc.b    '722. Reinkarnera som klocka',0
        EVEN
str_721:
        dc.b    '723. Betala med rikskuponger vid pungsugning',0
        EVEN
str_722:
        dc.b    '724. Planera sin logorre''',0
        EVEN
str_723:
        dc.b    '725. S',$E4,'tta en mistlur p',$E5,' sin bil',0
        EVEN
str_724:
        dc.b    '726. Uppgradera sin internal speaker',0
        EVEN
str_725:
        dc.b    '727. Trimma sin klocka s',$E5,' att man tj',$E4,'nar tid',0
        EVEN
str_726:
        dc.b    '728. Tro att gud uppfann cykelhj',$E4,'lmen',0
        EVEN
str_727:
        dc.b    '729. Prova elektriska stolen',0
        EVEN
str_728:
        dc.b    '730. S',$E4,'tta p',$E5,' TV-n ist',$E4,'llet f',$F6,'r frugan',0
        EVEN
str_729:
        dc.b    '731. Krocka p',$E5,' skoj',0
        EVEN
str_730:
        dc.b    '732. R',$E4,'cka upp handen p',$E5,' lektioner f',$F6,'r att tala om att man inte kan svara',0
        EVEN
str_731:
        dc.b    '733. S',$E4,'tta in en gigantisk r',$F6,'kmaskin i baks',$E4,'tet i sin bil',0
        EVEN
str_732:
        dc.b    '734. G',$F6,'ra akvarellm',$E5,'lningar p',$E5,' botten i sitt lokala badhus',0
        EVEN
str_733:
        dc.b    '735. Bota svartsjuka med penicillin',0
        EVEN
str_734:
        dc.b    '736. Kopiera viktiga dokument med en dokumentf',$F6,'rst',$F6,'rare',0
        EVEN
str_735:
        dc.b    '737. Trada voice',0
        EVEN
str_736:
        dc.b    '738. Skruva fast br',$E4,'nnmaneter p',$E5,' musmattor',0
        EVEN
str_737:
        dc.b    '739. F',$E4,'rga h',$E5,'ret till samma f',$E4,'rg som man redan har',0
        EVEN
str_738:
        dc.b    '740. Trotsa tyngdlagen',0
        EVEN
str_739:
        dc.b    '741. Pixla sina uppsatser',0
        EVEN
str_740:
        dc.b    '742. Vara nykter p',$E5,' anst',$E4,'llningsintervjuer',0
        EVEN
str_741:
        dc.b    '743. Gl',$F6,'mma att byta batterier till sin Bathandle',0
        EVEN
str_742:
        dc.b    '744. Sladda med h',$E5,'rddisken',0
        EVEN
str_743:
        dc.b    '745. Hitta p',$E5,' ljudeffekter till allt man g',$F6,'r',0
        EVEN
str_744:
        dc.b    '746. Spela upp sina pengar p',$E5,' Rysk Roulette s',$E5,' fort man r',$E5,'kar bli full',0
        EVEN
str_745:
        dc.b    '747. Ta av tuggummipappret efter man har tuggat klart tuggummit',0
        EVEN
str_746:
        dc.b    '748. Tycka att det ',$E4,'r intressant med v',$E4,'garbeten',0
        EVEN
str_747:
        dc.b    '749. Peppra sina vinylskivor f',$F6,'r att f',$E5,' ett starkare ljud',0
        EVEN
str_748:
        dc.b    '750. Slipa till bildr',$F6,'ren i sin TV',0
        EVEN
str_749:
        dc.b    '751. Blir ornitolog, specialiserad p',$E5,' jumbojettar',0
        EVEN
str_750:
        dc.b    '752. Tro att f',$E5,'r dansar br',$E4,'kdance',0
        EVEN
str_751:
        dc.b    '753. K',$F6,'pa f',$E4,'rgskrivare till ABC80 (monokrom maskin)',0
        EVEN
str_752:
        dc.b    '754. Medbringa skridskor till Icing',0
        EVEN
str_753:
        dc.b    '755. Pimpla i ishallar',0
        EVEN
str_754:
        dc.b    '756. ',$C4,'ta scones med sm',$F6,'r',0
        EVEN
str_755:
        dc.b    '757. Fr',$E5,'ga Dj Cat ifall han har porr',0
        EVEN
str_756:
        dc.b    '758. Rulla nerf',$F6,'r trappor f',$F6,'r att spara tid',0
        EVEN
str_757:
        dc.b    '759. G',$F6,'ra inbrott i skolan om man gl',$F6,'mt b',$F6,'ckerna',0
        EVEN
str_758:
        dc.b    '760. Installera snatterilarm i sitt hus och m',$E4,'rka sina m',$F6,'bler',0
        EVEN
str_759:
        dc.b    '761. Springa p',$E5,' borden och hoppa h',$E4,'ck ',$F6,'ver datorerna p',$E5,' demoparty',0
        EVEN
str_760:
        dc.b    '762. Ringm',$E4,'rka sina barn, s',$E5,' man vet var dom ',$E4,'r',0
        EVEN
str_761:
        dc.b    '763. Ringm',$E4,'rka sig sj',$E4,'lv, s',$E5,' man inte g',$E5,'r vilse',0
        EVEN
str_762:
        dc.b    '764. Bli b',$E4,'sta v',$E4,'n med KENNETH',0
        EVEN
str_763:
        dc.b    '765. Kl',$E4,' ut sig till f',$E5,'r f',$F6,'r att locka till sig sin fru',0
        EVEN
str_764:
        dc.b    '766. Valla sina barn vid h',$F6,'st och v',$E5,'r',0
        EVEN
str_765:
        dc.b    '767. G',$F6,'mma sig f',$F6,'r kyparen',0
        EVEN
str_766:
        dc.b    '768. G',$F6,'ra "plopp" p',$E5,' andras bildsk',$E4,'rmar',0
        EVEN
str_767:
        dc.b    '769. Tro att hundar ',$E4,'r tystl',$E5,'tna m',$E4,'nniskor',0
        EVEN
str_768:
        dc.b    '770. L',$E5,'na ut sin bil till Ulf',0
        EVEN
str_769:
        dc.b    '771. Skaffa V.I.P kort p',$E5,' arbetsf',$F6,'rmedlingen',0
        EVEN
str_770:
        dc.b    '772. G',$F6,'ra en drive-by med lokalbussen',0
        EVEN
str_771:
        dc.b    '773. Fiska s',$E4,'lar',0
        EVEN
str_772:
        dc.b    '774. Kapa Internet med en ABC80',0
        EVEN
str_773:
        dc.b    '775. Bita bort sina f',$F6,'delsem',$E4,'rken fr',$E5,'n ryggen',0
        EVEN
str_774:
        dc.b    '776. Beg',$E5,' sj',$E4,'lvmord genom att h',$E4,'nga sig med ett kafferep',0
        EVEN
str_775:
        dc.b    '777. Sv',$E4,'lja brustabletter',0
        EVEN
str_776:
        dc.b    '778. Skicka brev till sin granne',0
        EVEN
str_777:
        dc.b    '779. Veva upp f',$F6,'nstren i en cabriolet',0
        EVEN
str_778:
        dc.b    '780. Sj',$F6,'s',$E4,'tta sina kontokort',0
        EVEN
str_779:
        dc.b    '781. Larma brandk',$E5,'ren via brev',0
        EVEN
str_780:
        dc.b    '782. Snatta arbeten p',$E5,' arbetsf',$F6,'rmedlingen',0
        EVEN
str_781:
        dc.b    '783. Anv',$E4,'nda kofot som bestick',0
        EVEN
str_782:
        dc.b    '784. St',$E4,'mma brottslingar med st',$E4,'mj',$E4,'rn',0
        EVEN
str_783:
        dc.b    '785. Tro att gamla djur har glas',$F6,'gon',0
        EVEN
str_784:
        dc.b    '786. Slipa besticken ist',$E4,'llet f',$F6,'r att diska',0
        EVEN
str_785:
        dc.b    '787. Tillverka svart tippex',0
        EVEN
str_786:
        dc.b    '788. Skala sillar',0
        EVEN
str_787:
        dc.b    '789. Tro att det bl',$E5,'ser p',$E5,' vinden',0
        EVEN
str_788:
        dc.b    '790. ',$D6,'ppna d',$F6,'rrar inifr',$E5,'n',0
        EVEN
str_789:
        dc.b    '791. F',$F6,'resl',$E5,' en ',$E4,'ndring av tyngdlagen',0
        EVEN
str_790:
        dc.b    '792. Ringa till NRJ och p',$E5,'peka att det faktiskt stavas NRG',0
        EVEN
str_791:
        dc.b    '793. ',$D6,'vers',$E4,'tta sm',$F6,'genlistan till isl',$E4,'ndska',0
        EVEN
str_792:
        dc.b    '794. Mj',$F6,'lka mj',$F6,'lkpaket',0
        EVEN
str_793:
        dc.b    '795. Enkelrikta ',$D6,'landsbron',0
        EVEN
str_794:
        dc.b    '796. Bota sockersjuka med sockerfri tv',$E5,'l',0
        EVEN
str_795:
        dc.b    '797. Stj',$E4,'la tjuvar',0
        EVEN
str_796:
        dc.b    '798. Lita p',$E5,' poliser',0
        EVEN
str_797:
        dc.b    '799. S',$F6,'ka jobb som anarkist',0
        EVEN
str_798:
        dc.b    '800. Dansa till h',$F6,'rseltestet p',$E5,' m',$F6,'nstringen',0
        EVEN
str_799:
        dc.b    '801. Jobba p',$E5,' Internet',0
        EVEN
str_800:
        dc.b    '802. Kolla i d',$F6,'dsannonserna efter lediga jobb',0
        EVEN
str_801:
        dc.b    '803. Mata dagsl',$E4,'ndor',0
        EVEN
str_802:
        dc.b    '804. V',$E4,'rma upp iste innan man dricker det',0
        EVEN
str_803:
        dc.b    '805. Gifta sig med Christer Lag f',$F6,'r att f',$E5,' hans efternamn',0
        EVEN
str_804:
        dc.b    '806. ',$D6,'ppna secondhand aff',$E4,'r f',$F6,'r gravstenar',0
        EVEN
str_805:
        dc.b    '807. Bygga en fj',$E4,'rrkontroll till sin h',$E5,'rtork',0
        EVEN
str_806:
        dc.b    '808. Ta patent p',$E5,' dubbelh',$E4,'ftande lim',0
        EVEN
str_807:
        dc.b    '809. Anv',$E4,'nda flytv',$E4,'st p',$E5,' sj',$F6,'manskrog',0
        EVEN
str_808:
        dc.b    '810. Leva p',$E5,' br',$F6,'stmj',$F6,'lksers',$E4,'ttning',0
        EVEN
str_809:
        dc.b    '811. Smuggla sandaler till Gr',$F6,'nland',0
        EVEN
str_810:
        dc.b    '812. Bli sj',$F6,'man och segla jorden runt f',$F6,'r att man gillar att l',$E4,'sa serietidningar',0
        EVEN
str_811:
        dc.b    '813. Kamma sig under armarna',0
        EVEN
str_812:
        dc.b    '814. Suga p',$E5,' andra gomspenor',0
        EVEN
str_813:
        dc.b    '815. Smuggla mor',$F6,'tter i gladpack',0
        EVEN
str_814:
        dc.b    '816. Avbest',$E4,'lla biljetter man aldrig har best',$E4,'llt',0
        EVEN
str_815:
        dc.b    '817. Fr',$E5,'ga efter Klass I i Bayern',0
        EVEN
str_816:
        dc.b    '818. F',$F6,'rs',$F6,'ka bygga ett Disneyland p',$E5,' Kuba',0
        EVEN
str_817:
        dc.b    '819. Tro att igelkottar medf',$F6,'r v',$E4,'rldens underg',$E5,'ng',0
        EVEN
str_818:
        dc.b    '820. Skicka smartdrinks till de sv',$E4,'ltande barnen i Beverly Hills',0
        EVEN
str_819:
        dc.b    '821. Missbruka syre',0
        EVEN
str_820:
        dc.b    '822. Sl',$E5,' ett slag f',$F6,'r v',$E5,'ldet',0
        EVEN
str_821:
        dc.b    '823. Trolla bort en ex-president',0
        EVEN
str_822:
        dc.b    '824. Bo p',$E5,' 1300-talet',0
        EVEN
str_823:
        dc.b    '825. Ge allmosor till sm',$E5,'rika b',$F6,'nder',0
        EVEN
str_824:
        dc.b    '826. Leka tjuv och polis med Tomas Qvick',0
        EVEN
str_825:
        dc.b    '827. Smaka p',$E5,' sin egen medicin',0
        EVEN
str_826:
        dc.b    '828. Gr',$E4,'va ner sina f',$F6,'tter i blomkruka och hoppas p',$E5,' det b',$E4,'sta',0
        EVEN
str_827:
        dc.b    '829. Kasta tandtr',$E5,'d p',$E5,' begravningar',0
        EVEN
str_828:
        dc.b    '830. Riva klagomuren',0
        EVEN
str_829:
        dc.b    '831. Se p',$E5,' fotboll utan att vara sl',$E4,'kt med n',$E5,'gon av de spelande',0
        EVEN
str_830:
        dc.b    '832. Batikf',$E4,'rga tv',$E5,'ngstr',$F6,'jor',0
        EVEN
str_831:
        dc.b    '833. Ringa och best',$E4,'lla bord p',$E5,' McDonalds',0
        EVEN
str_832:
        dc.b    '834. Ge bort killsmink till sina systrar',0
        EVEN
str_833:
        dc.b    '835. Anv',$E4,'nda ekolod vid UFO-spaning',0
        EVEN
str_834:
        dc.b    '836. Tycka att CP-listan ',$E4,'r sorglig i slutet',0
        EVEN
str_835:
        dc.b    '837. Stifta lagar baserade p',$E5,' anarki',0
        EVEN
str_836:
        dc.b    '838. G',$F6,'ra LSD-lappar beprydda med Kenneth',0
        EVEN
str_837:
        dc.b    '839. Ta med sig dator och sovs',$E4,'ck till Nobelfesten',0
        EVEN
str_838:
        dc.b    '840. Injicera folk',$F6,'l i Sm',$F6,'gen',0
        EVEN
str_839:
        dc.b    '841. Anordna Ravefester i sovsalar',0
        EVEN
str_840:
        dc.b    '842. Passa p',$E5,' att l',$E4,'mna in sina videoband f',$F6,'r framkallning vid juletid',0
        EVEN
str_841:
        dc.b    '843. Ta med sig en signerad Beethoven CD till Antikrundan',0
        EVEN
str_842:
        dc.b    '844. Tipsa polisen om vilka brott man planerar att beg',$E5,0
        EVEN
str_843:
        dc.b    '845. Ha propellerkeps uppochner',0
        EVEN
str_844:
        dc.b    '846. ',$C4,'ta stolspiller',0
        EVEN
str_845:
        dc.b    '847. R',$F6,'ka torkat folk',$F6,'l',0
        EVEN
str_846:
        dc.b    '848. Spela bort alla sina pengar p',$E5,' tuggummiautomater',0
        EVEN
str_847:
        dc.b    '849. Byta sin Amiga mot en cykeldator',0
        EVEN
str_848:
        dc.b    '850. S',$E4,'tta krokben f',$F6,'r bilar',0
        EVEN
str_849:
        dc.b    '851. Bygga om sin navelstr',$E4,'ng till ett bl',$E5,'sinstrument',0
        EVEN
str_850:
        dc.b    '852. Odla mustasch och hockeyfrilla',0
        EVEN
str_851:
        dc.b    '853. Klara sig i livet utan alla trevliga listor',0
        EVEN
str_852:
        dc.b    '854. Sl',$E4,'ppa CP-listan p',$E5,' brunnslock',0
        EVEN
str_853:
        dc.b    '855. Skriva ut jobbans',$F6,'kningar p',$E5,' tunnbr',$F6,'d',0
        EVEN
str_854:
        dc.b    '856. Gl',$F6,'mma att man har v',$E5,'ningss',$E4,'ng',0
        EVEN
str_855:
        dc.b    '857. Ha st',$F6,'dhjul p',$E5,' sitt tr',$E4,'ben',0
        EVEN
str_856:
        dc.b    '858. Ta buss nr 7 tv',$E5,' g',$E5,'nger ist',$E4,'llet f',$F6,'r att ta buss nr 14',0
        EVEN
str_857:
        dc.b    '859. Tappa tv',$E5,'len med flit i f',$E4,'ngelseduschen',0
        EVEN
str_858:
        dc.b    '860. Morsa p',$E5,' morse',0
        EVEN
str_859:
        dc.b    '861. B',$F6,'rja med "skrapa ej" rutan p',$E5,' trisslotten',0
        EVEN
str_860:
        dc.b    '862. Sk',$E4,'mmas f',$F6,'r att man f',$E5,'r g',$E5,'shud',0
        EVEN
str_861:
        dc.b    '863. Ligga p',$E5,' sparkande hundar',0
        EVEN
str_862:
        dc.b    '864. Planera sina bl',$E5,'m',$E4,'rken',0
        EVEN
str_863:
        dc.b    '865. Sl',$E5,' ett slag f',$F6,'r tjejsmink',0
        EVEN
str_864:
        dc.b    '866. ',$C5,'ta cellgifter f',$F6,'r att spara in p',$E5,' sina fris',$F6,'rr',$E4,'kningar',0
        EVEN
str_865:
        dc.b    '867. Beg',$E4,'ra sugr',$F6,'r till kaffet',0
        EVEN
str_866:
        dc.b    '868. Bada i kvicksand',0
        EVEN
str_867:
        dc.b    '869. Plocka svamp p',$E5,' motorv',$E4,'gen',0
        EVEN
str_868:
        dc.b    '870. F',$F6,'rs',$F6,'ka hyra dagstidningen',0
        EVEN
str_869:
        dc.b    '871. Skriva en cykeltidtabell',0
        EVEN
str_870:
        dc.b    '872. Ge bort sitt hus i namnsdagspresent',0
        EVEN
str_871:
        dc.b    '873. G',$F6,'ra en pj',$E4,'s av Independence Day',0
        EVEN
str_872:
        dc.b    '874. Anordna SM i S/M',0
        EVEN
str_873:
        dc.b    '875. F',$F6,'rbjuda propellerkepsar p',$E5,' flygplan',0
        EVEN
str_874:
        dc.b    '876. Tillverka alkoholl',$E4,'sk med ',$F6,'lsmak',0
        EVEN
str_875:
        dc.b    '877. Anv',$E4,'nda mer smink ',$E4,'n Hulk Hogan',0
        EVEN
str_876:
        dc.b    '878. Gr',$E4,'va en tunnel till m',$E5,'nen',0
        EVEN
str_877:
        dc.b    '879. Mala ner murmeldjur',0
        EVEN
str_878:
        dc.b    '880. Slipa sina skedar',0
        EVEN
str_879:
        dc.b    '881. Bjuda p',$E5,' Molotov Cocktails p',$E5,' releasepartyt f',$F6,'r CP-listan nr 1000',0
        EVEN
str_880:
        dc.b    '882. Ofreda v',$E4,'rnpliktiga genom att bjuda p',$E5,' "plopp"',0
        EVEN
str_881:
        dc.b    '883. Tro p',$E5,' ett liv efter Sm',$F6,'gen',0
        EVEN
str_882:
        dc.b    '884. Dricka rakvatten f',$F6,'r att d',$F6,'lja spritlukten',0
        EVEN
str_883:
        dc.b    '885. Skaffa praktikplats p',$E5,' bordell',0
        EVEN
str_884:
        dc.b    '886. F',$F6,'rs',$F6,'ka rimma p',$E5,' gr',$E5,'sosse',0
        EVEN
str_885:
        dc.b    '887. Bjuda in bandet med hiten "Livet har sina goda stunder" till Roskilde',0
        EVEN
str_886:
        dc.b    '888. Jobba i en leksaksaff',$E4,'r utan att b',$E4,'ra cyklop',0
        EVEN
str_887:
        dc.b    '889. Sy bl',$E5,'st',$E4,'ll f',$F6,'r bl',$F6,'darsjuka',0
        EVEN
str_888:
        dc.b    '890. Ut',$F6,'va lakritskontroll',0
        EVEN
str_889:
        dc.b    '891. Rusa till posten f',$F6,'r att hinna l',$E4,'gga p',$E5,' ett par kilo',0
        EVEN
str_890:
        dc.b    '892. Misst',$E4,'nka sin fru med att ha varit otrogen med sin siamesiska brorsa',0
        EVEN
str_891:
        dc.b    '893. Ge bort specialbest',$E4,'llda isskulpturer i julklapp',0
        EVEN
str_892:
        dc.b    '894. Anv',$E4,'nda Tippex som smink',0
        EVEN
str_893:
        dc.b    '895. S',$E4,'lja kantareller till l',$E4,'gstbjudande',0
        EVEN
str_894:
        dc.b    '896. Starta insamlingar till f',$F6,'rm',$E5,'n f',$F6,'r M',$E4,'larleden',0
        EVEN
str_895:
        dc.b    '897. Trycka p',$E5,' varje nummer av CP-listan som man vill ska g',$E5,' i uppfyllelse',0
        EVEN
str_896:
        dc.b    '898. L',$F6,'sa v',$E4,'rldsproblemen med st',$F6,'rre motorv',$E4,'gar',0
        EVEN
str_897:
        dc.b    '899. Stagediva i en operationssal',0
        EVEN
str_898:
        dc.b    '900. Sommarjobba i Polen',0
        EVEN
str_899:
        dc.b    '901. K',$E4,'ka tegel',0
        EVEN
str_900:
        dc.b    '902. Bota gammal mj',$F6,'lk',0
        EVEN
str_901:
        dc.b    '903. St',$E4,'lla upp med sina radiostyrda maneter p',$E5,' Lisebergs talangjakt',0
        EVEN
str_902:
        dc.b    '904. Simulera en gr',$F6,'n h',$E5,'lslagare',0
        EVEN
str_903:
        dc.b    '905. Grilla vatten',0
        EVEN
str_904:
        dc.b    '906. Moona p',$E5,' m',$E5,'nen',0
        EVEN
str_905:
        dc.b    '907. Tillverka v',$E4,'rldens f',$F6,'rsta b',$E4,'rbara CD-skiva',0
        EVEN
str_906:
        dc.b    '907. Vara f',$F6,'rst med v',$E4,'rldens andra b',$E4,'rbara CD-skiva',0
        EVEN
str_907:
        dc.b    '908. Bikta sig i Bingolotto',0
        EVEN
str_908:
        dc.b    '909. Leta efter v',$E5,'rkanten',0
        EVEN
str_909:
        dc.b    '910. Dra alla h',$E4,'star ',$F6,'ver en kam',0
        EVEN
str_910:
        dc.b    '911. Best',$E4,'lla "extra socker" p',$E5,' Pressbyr',$E5,'n',0
        EVEN
str_911:
        dc.b    '912. G',$E5,' j',$E4,'mnfota',0
        EVEN
str_912:
        dc.b    '913. Snickra stegar f',$F6,'r blinda',0
        EVEN
str_913:
        dc.b    '914. Bjuda in massmedia p',$E5,' sin ',$E5,'rliga tandl',$E4,'karkontroll',0
        EVEN
str_914:
        dc.b    '915. Ans',$F6,'ka om jakttillst',$E5,'nd p',$E5,' h',$E4,'star',0
        EVEN
str_915:
        dc.b    '916. F',$F6,'ra register ',$F6,'ver alla sladdbarn p',$E5,' sin Gameboy',0
        EVEN
str_916:
        dc.b    '917. ',$D6,'ppna en aff',$E4,'r som s',$E4,'ljer b',$E4,'rbara husdjur',0
        EVEN
str_917:
        dc.b    '918. Poppa poppers p',$E5,' hemkunskapstimmen',0
        EVEN
str_918:
        dc.b    '919. Bygga en USS Enterprise i naturlig storlek i sitt badrum',0
        EVEN
str_919:
        dc.b    '920. Ta t',$E5,'get f',$F6,'r att inte missa jordens underg',$E5,'ng',0
        EVEN
str_920:
        dc.b    '921. Halka med p',$E5,' nya innesporten Schizofreni',0
        EVEN
str_921:
        dc.b    '922. F',$F6,'rs',$F6,'ka bli l',$E4,'ngre i v',$E4,'xthus',0
        EVEN
str_922:
        dc.b    '923. F',$F6,'lja CP-listan fundamentalt',0
        EVEN
str_923:
        dc.b    '924. Tro att v',$E4,'rldsomsp',$E4,'nnande nyheter ',$E4,'r samma sak som sp',$E4,'nnande biljakter',0
        EVEN
str_924:
        dc.b    '925. Samla p',$E5,' kreatur',0
        EVEN
str_925:
        dc.b    '926. Tro att fosterlandet ',$E4,'r d',$E4,'r storken kommer ifr',$E5,'n',0
        EVEN
str_926:
        dc.b    '927. Ramla i god tro',0
        EVEN
str_927:
        dc.b    '928. Filma sp',$E4,'nnande trailers p',$E5,' E20',0
        EVEN
str_928:
        dc.b    '929. Skriva osynliga fanzines',0
        EVEN
str_929:
        dc.b    '930. Tro att Tv-licenskontrollanten kommer att ',$E4,'ta upp din TV fast den ',$E4,'r bl',$E5,0
        EVEN
str_930:
        dc.b    '931. Vara skurken i en film d',$E4,'r hj',$E4,'lten rider p',$E5,' en bokhylla',0
        EVEN
str_931:
        dc.b    '932. Klippa ut alla nummer p',$E5,' CP-listan och limma fast dom p',$E5,' ett skohorn',0
        EVEN
str_932:
        dc.b    '933. Samla p',$E5,' likv',$E4,'rdiga saker',0
        EVEN
str_933:
        dc.b    '934. Stava stavhopp utan avhopp',0
        EVEN
str_934:
        dc.b    '935. Montera in pitchkontroll p',$E5,' sin h',$E5,'rddisk',0
        EVEN
str_935:
        dc.b    '936. Morra som Musse Pigg vid v',$E4,'l planerade tillf',$E4,'llen',0
        EVEN
str_936:
        dc.b    '937. Vara stuntman ',$E5,'t Televinken',0
        EVEN
str_937:
        dc.b    '938. Fejka jordb',$E4,'vningar',0
        EVEN
str_938:
        dc.b    '939. Byta ut sina t',$E4,'nder mot Pez',0
        EVEN
str_939:
        dc.b    '940. Krypa under en kundvagn och hoppas att n',$E5,'gon har v',$E4,'garna f',$F6,'rbi',0
        EVEN
str_940:
        dc.b    '941. Smyga ner CP-listan i Svenska Akademins Ordlista',0
        EVEN
str_941:
        dc.b    '942. Kosta p',$E5,' sig surroundljud till sin mobiltelefon',0
        EVEN
str_942:
        dc.b    '943. ',$C5,'ka karusell p',$E5,' internet',0
        EVEN
str_943:
        dc.b    '944. Polisanm',$E4,'la alla str',$F6,'mavbrott',0
        EVEN
str_944:
        dc.b    '945. Utf',$F6,'ra hj',$E4,'lmkontroll p',$E5,' lokalbussen',0
        EVEN
str_945:
        dc.b    '946. Rulla snabbare ',$E4,'n Sixten',0
        EVEN
str_946:
        dc.b    '947. Maskera sig till charmtroll',0
        EVEN
str_947:
        dc.b    '948. Kela med kaktusar',0
        EVEN
str_948:
        dc.b    '949. Peta bort alla lingon fr',$E5,'n yoghurten',0
        EVEN
str_949:
        dc.b    '950. Isolera vinden med vindt',$E4,'ta jackor',0
        EVEN
str_950:
        dc.b    '951. Jobba som sotare p',$E5,' n',$E5,'got trevligt caf',$E9,0
        EVEN
str_951:
        dc.b    '952. Vinka till sig ett knippe nya nintendospel',0
        EVEN
str_952:
        dc.b    '953. Sjukanm',$E4,'la Ingvar Oldsberg mitt i ett kedjebyte',0
        EVEN
str_953:
        dc.b    '954. Anordna VM i husmanskost f',$F6,'r tredje ',$E5,'ret i rad',0
        EVEN
str_954:
        dc.b    '955. Nyktra till hos guldsmeden',0
        EVEN
str_955:
        dc.b    '956. Klippa sig p',$E5,' ',$F6,'ppet k',$F6,'p',0
        EVEN
str_956:
        dc.b    '957. Legitimera sig som blockfl',$F6,'jtsinspekt',$F6,'ren fr',$E5,'n H',$E4,'rjedalen',0
        EVEN
str_957:
        dc.b    '958. Tro att man blir ordblind av menthol',0
        EVEN
str_958:
        dc.b    '959. Sk',$F6,'lja ner sina polska pommes frites med en lagom m',$E4,'ngd mellanmj',$F6,'lk',0
        EVEN
str_959:
        dc.b    '960. Emulera bestick',0
        EVEN
str_960:
        dc.b    '961. L',$E5,'tsas tappa benen',0
        EVEN
str_961:
        dc.b    '962. L',$E4,'nsa korttelefoner',0
        EVEN
str_962:
        dc.b    '963. Skrika nazzesvin ',$E5,'t buddhistmunkar',0
        EVEN
str_963:
        dc.b    '964. Bilda en grupp som heter Rulling Stols',0
        EVEN
str_964:
        dc.b    '965. Spela l',$E5,'ten "15 gastar p',$E5,' d',$F6,'d mans kista" p',$E5,' begravning',0
        EVEN
str_965:
        dc.b    '966. Tro att Robert Ashberg kommer att g',$F6,'ra reklam f',$F6,'r mj',$E4,'llshampoo',0
        EVEN
str_966:
        dc.b    '967. V',$E4,'dra balkongen vid h',$F6,'st och v',$E5,'r',0
        EVEN
str_967:
        dc.b    '968. F',$F6,'rse sina fickor med bl',$E5,'b',$E4,'r vid kl',$E4,'dsim',0
        EVEN
str_968:
        dc.b    '969. Langa v',$E5,'rrullar till h',$F6,'rselskadade',0
        EVEN
str_969:
        dc.b    '970. Bli portad fr',$E5,'n "vi i femman"',0
        EVEN
str_970:
        dc.b    '971. Inf',$F6,'ra k',$F6,'nskvortering inom damfotbollen',0
        EVEN
str_971:
        dc.b    '972. Montera upp en skylt d',$E4,'r det st',$E5,'r "Mer reklam, tack" utanf',$F6,'r sin d',$F6,'rr',0
        EVEN
str_972:
        dc.b    '973. Tycka att Doktor Kosmos ser ut som ostb',$E5,'gar',0
        EVEN
str_973:
        dc.b    '974. Sprida CP-listan till kickers',0
        EVEN
str_974:
        dc.b    '975. Tycka att det ',$E4,'r tufft med air-condition i bastun',0
        EVEN
str_975:
        dc.b    '976. Bli pastor f',$F6,'r Feskekyrkan',0
        EVEN
str_976:
        dc.b    '977. Fejka nysningar vid sitt br',$F6,'llop',0
        EVEN
str_977:
        dc.b    '978. Se fram emot Kraftwerks "unplugged" spelning f',$F6,'r MTV',0
        EVEN
str_978:
        dc.b    '979. Dricka coca-cola med blockfl',$F6,'jt',0
        EVEN
str_979:
        dc.b    '980. Jaga p',$E5,' Kolm',$E5,'rden',0
        EVEN
str_980:
        dc.b    '981. H',$E5,'ngla med stolar',0
        EVEN
str_981:
        dc.b    '982. Snickra en alkotestare med highscorelista',0
        EVEN
str_982:
        dc.b    '983. Bli kicker p',$E5,' IRC',0
        EVEN
str_983:
        dc.b    '984. Dricka kaffe ur vattenkranen',0
        EVEN
str_984:
        dc.b    '985. Tro att myror ',$E4,'r sm',$E5,' ',$E4,'lgar',0
        EVEN
str_985:
        dc.b    '986. Skylla vartannat str',$F6,'mavbrott p',$E5,' Ricki Lake',0
        EVEN
str_986:
        dc.b    '987. Satsa p',$E5,' en professionell karri',$E4,'r som radioamat',$F6,'r',0
        EVEN
str_987:
        dc.b    '988. Ta med sig egen galge till krogen',0
        EVEN
str_988:
        dc.b    '989. G',$E5,' i joggingdress n',$E4,'r man ',$E4,'r arbetsl',$F6,'s',0
        EVEN
str_989:
        dc.b    '990. Joddla korv',0
        EVEN
str_990:
        dc.b    '991. Ans',$F6,'ka om bondpermis i lumpen',0
        EVEN
str_991:
        dc.b    '992. Komponera ett soundtrack till CP-listan',0
        EVEN
str_992:
        dc.b    '993. Anst',$E4,'lla en elak spindel',0
        EVEN
str_993:
        dc.b    '994. Tillverka xylitolfri godis',0
        EVEN
str_994:
        dc.b    '995. Kartl',$E4,'gga Sveriges brunnslock',0
        EVEN
str_995:
        dc.b    '996. Gifta sig i b',$F6,'nekyrka',0
        EVEN
str_996:
        dc.b    '997. K',$F6,'pa skor f',$F6,'r att f',$E5,' en praktisk l',$E5,'da att f',$F6,'rvara disketter i',0
        EVEN
str_997:
        dc.b    '998. G',$E5,' till IKEA och visa vart sk',$E5,'pet ska st',$E5,0
        EVEN
str_998:
        dc.b    '999. Bygga en batteridriven kompass',0
        EVEN
