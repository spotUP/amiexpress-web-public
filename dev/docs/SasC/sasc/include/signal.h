/* Copyright (c) 1992-1993 SAS Institute, Inc., Cary, NC USA */
/* All Rights Reserved */


#ifndef _SIGNAL_H
#define _SIGNAL_H 1

/**
*
* This header file contains definitions needed by the signal function.
*
**/

/**
*
* NSIG supposedly defines the number of signals recognized.  However,
* since not all signals are actually implemented under AmigaDOS, it actually
* is the highest legal signal number plus one.
*
*/

#define _NSIG     9
#define _SIG_MAX  8

#ifndef _STRICT_ANSI
#define NSIG    _NSIG
#define SIG_MAX _SIG_MAX
#endif
			
/**
*
* The following symbols are the defined signals.
*
*/

#define SIGABRT  1      /*  Abnormal termination, abort()  */
#define SIGFPE   2      /*  Floating point exception  */
#define SIGILL   3      /*  Illegal instruction  */
#define SIGINT   4      /*  Interrupt from AmigaDOS, ^C or ^D  */
#define SIGSEGV  5      /*  Segmentation violation  */
#define SIGTERM  6      /*  Termination request  */

/***
*
* The following symbols are the special forms for the function pointer
* argument.  They specify certain standard actions that can be performed
* when the signal occurs.
*
***/

#define SIG_DFL (void (*)(int)) 0	/* default action */
#define SIG_IGN (void (*)(int)) 1	/* ignore the signal */
#define SIG_ERR (void (*)(int)) (-1)	/* error return */

/***
*
* Function declarations
*
***/

extern void (*signal(int,void (*)(int)))(int);
extern int raise(int);

extern void (*__sigfunc[_NSIG])(int);

typedef int sig_atomic_t;

#endif
