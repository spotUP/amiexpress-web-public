/* Copyright (c) 1993 SAS Institute, Inc., Cary, NC USA */
/* All Rights Reserved */

/* Compatibility macros for Aztec C screen control macros */

#ifndef _SCRCNTL_H
#define _SCRCNTL_H

#ifndef _STDIO_H
#include <stdio.h>
#endif

#define CSI "\x9b"

extern void scr_beep(void);
#define scr_beep()     (void)(printf("\7"),fflush(stdout))

extern void scr_bs(void);
#define scr_bs()        (void)(printf(CSI"D"),fflush(stdout))

extern void scr_delete(void);
#define scr_cdelete()   (void)(printf(CSI"P"),fflush(stdout))

extern void scr_cinsert(void);
#define scr_cinsert()   (void)(printf(CSI"@"),fflush(stdout))

extern void scr_clear(void);
#define scr_clear()     (void)(printf("\f"),fflush(stdout))

extern void scr_cr(void);
#define scr_cr()        (void)(printf("\xA"),fflush(stdout))

extern void scr_cursrt(void);
#define scr_cursrt()    (void)(printf(CSI"C"),fflush(stdout))

extern void scr_cursup(void);
#define scr_cursup()    (void)(printf(CSI"A"),fflush(stdout))

extern void scr_eol(void);
#define scr_eol()       (void)(printf(CSI"K"),fflush(stdout))

extern void scr_home(void);
#define scr_home()      (void)(printf(CSI"H"),fflush(stdout))

extern void scr_ldelete(void);
#define scr_ldelete()   (void)(printf(CSI"M"),fflush(stdout))

extern void scr_lf(void);
#define scr_lf()        (void)(printf(CSI"B"),fflush(stdout))

extern void scr_linsert(void);
#define scr_linsert()   (void)(printf(CSI"L"),fflush(stdout))

extern void scr_tab(void);
#define scr_tab()       (void)(printf("\t"),fflush(stdout))

extern void scr_curs(int line, int column);

#endif
