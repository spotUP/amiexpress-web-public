/* Copyright (c) 1992-1993 SAS Institute, Inc., Cary, NC USA */
/* All Rights Reserved */


#ifndef _FLOAT_H
#define _FLOAT_H 1

/**
*
* The following symbols are specified in the ANSI C standard for the
* floating point number system.
*
**/

#define FLT_RADIX 2		/* radix of exponent 			*/
#define FLT_ROUNDS 1		/* rounding mode during translation	*/
				/*   0 => chop				*/
				/*   1 => round				*/
				/*   2 => indeterminate			*/
#define FLT_GUARD 0		/* guard digits during multiplication 	*/
				/*   0 => No				*/
				/*   1 => Yes				*/
#define FLT_NORMALIZE 1		/* normalization required		*/
				/*   0 => No				*/
				/*   1 => Yes				*/

#ifndef _FFP
/* These are for IEEE Floating Point */
#define FLT_MANT_DIG     24     /* # radix digits in float mantissa     */
#define DBL_MANT_DIG     53     /* # radix digits in double mantissa    */
#define LDBL_MANT_DIG    53     /* # radix digits in long double mant.  */

#define FLT_DIG      6          /* max decimal digits for float         */
#define DBL_DIG      15         /* max decimal digits for double        */
#define LDBL_DIG     15         /* max decimal digits for long double   */

#define FLT_MIN_EXP   -125	/* min radix exponent for float	        */
#define DBL_MIN_EXP   -1021	/* min radix exponent for double	*/
#define LDBL_MIN_EXP  -1021      /* min radix exponent for long double   */

#define FLT_MIN_10_EXP   -37
#define DBL_MIN_10_EXP   -307
#define LDBL_MIN_10_EXP  -307

#define FLT_MAX_EXP  128 	/* max radix exponent for float 	*/
#define DBL_MAX_EXP  1024	/* max radix exponent for double	*/
#define LDBL_MAX_EXP 1024       /* max radix exponent for double long   */

#define FLT_MAX_10_EXP   38     /* max decimal exponent for float       */
#define DBL_MAX_10_EXP   308    /* max decimal exponent for double      */
#define LDBL_MAX_10_EXP  308    /* max decimal exponent for long double */

#define FLT_MAX  ((float)3.40282347E+38)
#define DBL_MAX       1.7976931348623157E+308
#define LDBL_MAX DBL_MAX

#define FLT_EPSILON   ((float)1.19209290E-07)
#define DBL_EPSILON   2.2204460492503131E-16
#define LDBL_EPSILON  DBL_EPSILON

#define FLT_MIN       ((float)1.17549435E-38)
#define DBL_MIN       2.2250738585072014E-308

#define LDBL_MIN      DBL_MIN

#else
/* These are for Fast Floating Point */
#define FLT_MANT_DIG     24     /* # radix digits in float mantissa     */
#define DBL_MANT_DIG     24     /* # radix digits in double mantissa    */
#define LDBL_MANT_DIG    24     /* # radix digits in long double mant.  */

#define FLT_DIG      7          /* max decimal digits for float         */
#define DBL_DIG      7          /* max decimal digits for double        */
#define LDBL_DIG     7          /* max decimal digits for long double   */

#define FLT_MIN_EXP   -63	/* min radix exponent for float	        */
#define DBL_MIN_EXP   -63	/* min radix exponent for double	*/
#define LDBL_MIN_EXP  -63  /* min radix exponent for long double   */

#define FLT_MIN_10_EXP   -20
#define DBL_MIN_10_EXP   -20
#define LDBL_MIN_10_EXP  -20

#define FLT_MAX_EXP  63 	/* max radix exponent for float 	*/
#define DBL_MAX_EXP  63  	/* max radix exponent for double	*/
#define LDBL_MAX_EXP 63    /* max radix exponent for double long   */

#define FLT_MAX_10_EXP   18     /* max decimal exponent for float       */
#define DBL_MAX_10_EXP   18     /* max decimal exponent for double      */
#define LDBL_MAX_10_EXP  18     /* max decimal exponent for long double */

#define FLT_MAX  9.22337176E+18
#define DBL_MAX  FLT_MAX
#define LDBL_MAX DBL_MAX

#define FLT_EPSILON   1.19209290E-07
#define DBL_EPSILON   FLT_EPSILON
#define LDBL_EPSILON  DBL_EPSILON

#define FLT_MIN       5.42101087E-20
#define DBL_MIN       FLT_MIN

#define LDBL_MIN      DBL_MIN
#endif

#ifndef _STRICT_ANSI

/* The proper place for the following definition     */
/* is in <math.h>, but put it here for compatibility */
#ifndef _COMMHUGE_H
#include <sys/commhuge.h>
#endif

#endif  /* _STRICT_ANSI */

#endif
