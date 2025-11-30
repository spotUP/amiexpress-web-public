/*--- functions in V40 or higher (Release 3.1) ---*/
/**/
/* CONTROLLER HANDLING*/
/**/
#pragma libcall LowLevelBase ReadJoyPort 1e 001
/**/
/* LANGUAGE HANDLING*/
/**/
#pragma libcall LowLevelBase GetLanguageSelection 24 0
/*pragma libcall LowLevelBase lowlevelPrivate1 2a 0*/
/**/
/* KEYBOARD HANDLING*/
/**/
#pragma libcall LowLevelBase GetKey 30 0
#pragma libcall LowLevelBase QueryKeys 36 1802
#pragma libcall LowLevelBase AddKBInt 3c 9802
#pragma libcall LowLevelBase RemKBInt 42 901
/**/
/* SYSTEM HANDLING*/
/**/
#pragma libcall LowLevelBase SystemControlA 48 901
#pragma tagcall LowLevelBase SystemControl 48 901
/**/
/* TIMER HANDLING*/
/**/
#pragma libcall LowLevelBase AddTimerInt 4e 9802
#pragma libcall LowLevelBase RemTimerInt 54 901
#pragma libcall LowLevelBase StopTimerInt 5a 901
#pragma libcall LowLevelBase StartTimerInt 60 10903
#pragma libcall LowLevelBase ElapsedTime 66 801
/**/
/* VBLANK HANDLING*/
/**/
#pragma libcall LowLevelBase AddVBlankInt 6c 9802
#pragma libcall LowLevelBase RemVBlankInt 72 901
/*pragma libcall LowLevelBase lowlevelPrivate2 78 0*/
/*pragma libcall LowLevelBase lowlevelPrivate3 7e 0*/
/**/
/* MORE CONTROLLER HANDLING*/
/**/
#pragma libcall LowLevelBase SetJoyPortAttrsA 84 9002
#pragma tagcall LowLevelBase SetJoyPortAttrs 84 9002
/*pragma libcall LowLevelBase lowlevelPrivate4 8a 0*/
/*pragma libcall LowLevelBase lowlevelPrivate5 90 0*/
/*pragma libcall LowLevelBase lowlevelPrivate6 96 0*/
/*pragma libcall LowLevelBase lowlevelPrivate7 9c 0*/
/*pragma libcall LowLevelBase lowlevelPrivate8 a2 0*/
