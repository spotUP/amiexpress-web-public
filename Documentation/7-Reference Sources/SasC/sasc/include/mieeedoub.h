/* Copyright (c) 1992-1993 SAS Institute, Inc., Cary, NC USA */
/* All Rights Reserved */

#ifndef _MIEEEDOUB_H
#define _MIEEEDOUB_H

#ifdef _IEEE
#ifndef PROTO_MATHIEEEDOUBBAS_H
#include <proto/mathieeedoubbas.h>
#endif

#ifndef PROTO_MATHIEEEDOUBTRANS_H
#include <proto/mathieeedoubtrans.h>
#endif

#define acos(d)         IEEEDPAcos(d)
#define asin(d)         IEEEDPAsin(d)
#define atan(d)         IEEEDPAtan(d)
#define cos(d)          IEEEDPCos(d)
#define cosh(d)         IEEEDPCosh(d)
#define exp(d)          IEEEDPExp(d)
#define fabs(d)         IEEEDPAbs(d)
#define floor(d)        IEEEDPFloor(d)
#define log(d)          IEEEDPLog(d)
#define log10(d)        IEEEDPLog10(d)
#define sin(d)          IEEEDPSin(d)
#define sinh(d)         IEEEDPSinh(d)
#define sqrt(d)         IEEEDPSqrt(d)
#define tan(d)          IEEEDPTan(d)
#define tanh(d)         IEEEDPTanh(d)

#define ceil(d)         IEEEDPCeil(d)
#define sincos(d,dp)    IEEEDPSincos(d,dp)
#define pow(d1,d)       IEEEDPPow(d,d1)
#endif

#endif
