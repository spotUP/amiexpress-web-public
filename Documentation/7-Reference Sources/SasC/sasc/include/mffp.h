/* Copyright (c) 1992-1993 SAS Institute, Inc., Cary, NC USA */
/* All Rights Reserved */

#ifndef _MFFP_H
#define _MFFP_H

#ifdef _FFP
#ifndef _PROTO_MATHFFP_H
#include <proto/mathffp.h>
#endif

#ifndef _PROTO_MATHTRANS_H
#include <proto/mathtrans.h>
#endif

#define acos(f)         SPAcos(f)
#define asin(f)         SPAsin(f)
#define atan(f)         SPAtan(f)
#define cos(f)          SPCos(f)
#define cosh(f)         SPCosh(f)
#define exp(f)          SPExp(f)
#define fabs(f)         SPAbs(f)
#define floor(f)        SPFloor(f)
#define log(f)          SPLog(f)
#define log10(f)        SPLog10(f)
#define sin(f)          SPSin(f)
#define sinh(f)         SPSinh(f)
#define sqrt(f)         SPSqrt(f)
#define tan(f)          SPTan(f)
#define tanh(f)         SPTanh(f)

#define ceil(f)         SPCeil(f)
#define sincos(f,fp)    SPSincos(f,fp)
#define pow(f1,f)       SPPow(f,f1)
#endif

#endif
