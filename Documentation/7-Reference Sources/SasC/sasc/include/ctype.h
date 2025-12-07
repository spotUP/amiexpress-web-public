/* Copyright (c) 1992-1993 SAS Institute, Inc., Cary, NC USA */
/* All Rights Reserved. */


/**
*
* This header file defines various ASCII character manipulation macros,
* as follows:
*
*       isalpha(c)    non-zero if c is alpha
*       isupper(c)    non-zero if c is upper case
*       islower(c)    non-zero if c is lower case
*       isdigit(c)    non-zero if c is a digit (0 to 9)
*       isxdigit(c)   non-zero if c is a hexadecimal digit (0 to 9, A to F,
*                   a to f)
*       isspace(c)    non-zero if c is white space
*       ispunct(c)    non-zero if c is punctuation
*       isalnum(c)    non-zero if c is alpha or digit
*       isprint(c)    non-zero if c is printable (including blank)
*       isgraph(c)    non-zero if c is graphic (excluding blank)
*       iscntrl(c)    non-zero if c is control character
*       isascii(c)    non-zero if c is ASCII
*       iscsym(c)     non-zero if valid character for C symbols
*       iscsymf(c)    non-zero if valid first character for C symbols
*
**/

#undef isalnum
#undef isalpha
#undef iscntrl
#undef isdigit
#undef isgraph
#undef islower
#undef isprint
#undef ispunct
#undef isspace
#undef isupper
#undef isxdigit
#undef tolower
#undef toupper

extern int isalnum(int);
extern int isalpha(int);
extern int iscntrl(int);
extern int isdigit(int);
extern int isgraph(int);
extern int islower(int);
extern int isprint(int);
extern int ispunct(int);
extern int isspace(int);
extern int isupper(int);
extern int isxdigit(int);

extern int tolower(int);
extern int toupper(int);

#define _U 1          /* upper case flag */
#define _L 2          /* lower case flag */
#define _N 4          /* number flag */
#define _S 8          /* space flag */
#define _P 16         /* punctuation flag */
#define _C 32         /* control character flag */
#define _B 64         /* blank flag */
#define _X 128        /* hexadecimal flag */

extern char __ctype[];   /* character type table */

#define isalnum(c)      (__ctype[(c)+1] & (_U|_L|_N))
#define isalpha(c)      (__ctype[(c)+1] & (_U|_L))
#define iscntrl(c)      (__ctype[(c)+1] & _C)
#define isdigit(c)      (__ctype[(c)+1] & _N)
#define isgraph(c)      (__ctype[(c)+1] & (_P|_U|_L|_N))
#define islower(c)      (__ctype[(c)+1] & _L)
#define isprint(c)      (__ctype[(c)+1] & (_P|_U|_L|_N|_B))
#define ispunct(c)      (__ctype[(c)+1] & _P)
#define isspace(c)      (__ctype[(c)+1] & _S)
#define isupper(c)      (__ctype[(c)+1] & _U)
#define isxdigit(c)     (__ctype[(c)+1] & _X)

#define tolower(c)     (isupper(c) ? ((c)+('a'-'A')) : (c))
#define toupper(c)     (islower(c) ? ((c)-('a'-'A')) : (c))

#ifndef _STRICT_ANSI

/****
*
*   Extensions to the ANSI standard.
*
*
****/

#undef isascii
#undef iscsym
#undef iscsymf
#undef toascii

extern int isascii(int);
extern int iscsym(int);
extern int iscsymf(int);

extern int toascii(int);


#define isascii(c)      ((unsigned)(c) <= 127)
#define iscsym(c)       (isalnum(c)||(((c) & 127) == 0x5f))
#define iscsymf(c)      (isalpha(c)||(((c) & 127) == 0x5f))

#define toascii(c)      ((c) & 127)

#endif /* _STRICT_ANSI */
