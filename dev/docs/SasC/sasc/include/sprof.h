/*************************************************************/
/*                                                           */
/* You don't need to include this file at all unless you     */
/* want to disable profiling for short portions of your      */
/* program.  A good example would be disabling the profiler  */
/* while you call Wait() to wait on user input.  To do this, */
/* surround your Wait() call with PROFILE_OFF and PROFILE_ON */
/* macros as shown:                                          */
/*                                                           */
/*    PROFILE_OFF();                                         */
/*    result = Wait(waitbits);                               */
/*    PROFILE_ON();                                          */
/*                                                           */
/* Special note:  ALWAYS USE THE CALLS AS SHOWN.  Surround   */
/*                a simple function call with them.  Do NOT  */
/*                return from the function in which you      */
/*                called PROFILE_OFF without calling         */
/*                PROFILE_ON first.  Do NOT call PROFILE_ON  */
/*                without having called PROFILE_OFF in the   */
/*                same function.  If you do, the profiler's  */
/*                results will be incorrect!                 */
/*                                                           */
/*************************************************************/

#if _PROFILE

void __asm _PROLOG(register __a0 char *);
void __asm _EPILOG(register __a0 char *);

#define PROFILE_OFF() _PROLOG(0L)
#define PROFILE_ON()  _EPILOG(0L)

/* Use these to "fool" the profiler into thinking you have */
/* entered and left a new "function".  Make sure you use   */
/* the STRMERGE option and pass a string constant, or pass */
/* the address of a variable that won't be changing.  You  */
/* must pass the exact same address and it must point to   */
/* the same string both times.                             */
#define PROFILE_PUSH(x) _PROLOG(x)
#define PROFILE_POP(x)  _EPILOG(x)

#else

#define PROFILE_OFF() {}
#define PROFILE_ON()  {}

#define PROFILE_PUSH(x) {}
#define PROFILE_POP(x) {}

#endif

