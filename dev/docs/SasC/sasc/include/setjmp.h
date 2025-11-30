/* Copyright (c) 1992-1993 SAS Institute, Inc., Cary, NC USA */
/* All Rights Reserved */


#ifndef _SETJMP_H
#define _SETJMP_H 1

/**
*
* This structure is used by the setjmp/longjmp functions to save the
* current environment on the 68000.
*
*/

struct _JMP_BUF {
    long jmpret,		/* return address */
    jmp_d1, jmp_d2, jmp_d3, jmp_d4, jmp_d5, jmp_d6, jmp_d7,
    jmp_a1, jmp_a2, jmp_a3, jmp_a4, jmp_a5, jmp_a6, jmp_a7;
    long jmp_fp0[3], jmp_fp1[3], jmp_fp2[3], jmp_fp3[3],
         jmp_fp4[3], jmp_fp5[3], jmp_fp6[3], jmp_fp7[3];
};

typedef struct _JMP_BUF jmp_buf[1];

extern int __setjmp(jmp_buf);
extern void longjmp(jmp_buf, int);
#define setjmp(x) __setjmp(x)

#endif
