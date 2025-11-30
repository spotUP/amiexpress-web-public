/* Copyright (c) 1992-1993 SAS Institute, Inc., Cary, NC USA */
/* All Rights Reserved */

#ifndef _TIME_H
#define _TIME_H 1

#ifndef _COMMNULL_H
#include <sys/commnull.h>
#endif

#ifndef _COMMSIZE_H
#include <sys/commsize.h>
#endif

#ifndef _COMMTIME_H
#include <sys/commtime.h>
#endif

#define CLOCKS_PER_SEC  1000
#define CLK_TCK  CLOCKS_PER_SEC

typedef unsigned long clock_t;

/**
*
* This structure contains the unpacked time as returned by "gmtime".
*
*/

struct tm {
    int tm_sec;      /* seconds after the minute */
    int tm_min;          /* minutes after the hour */
    int tm_hour;         /* hours since midnight */
    int tm_mday;         /* day of the month */
    int tm_mon;          /* months since January */
    int tm_year;         /* years since 1900 */
    int tm_wday;         /* days since Sunday */
    int tm_yday;         /* days since January 1 */
    int tm_isdst;        /* Daylight Savings Time flag */
};


/***
*
*     ANSI time functions.
*
***/

extern clock_t clock(void);
extern double difftime(time_t, time_t);
extern time_t mktime(struct tm *);
extern time_t time(time_t *);

extern char *asctime(const struct tm *);
extern char *ctime(const time_t *);
extern struct tm *gmtime(const time_t *);
extern struct tm *localtime(const time_t *);
extern size_t strftime(char *, size_t, const char *, const struct tm *);


#ifndef _STRICT_ANSI

/***
*
*     SAS time functions
*
***/

void getclk(unsigned char *);
int  chgclk(const unsigned char *);

void utunpk(long, char *);
long utpack(const char *);
int timer(unsigned int *);
int datecmp(const struct DateStamp *, const struct DateStamp *);

time_t __datecvt(const struct DateStamp *);
struct DateStamp *__timecvt(time_t);

/* for UNIX compatibility */
extern void      __tzset(void);
#define timezone __timezone   
#define tzname   __tzname   
#define daylight __daylight   
#define tzset    __tzset


#define TZ  "CST6"      /* Used if TZ env. var. is not set */
#define DAY0  4         /* Jan 1, 1970 is a Thursday */

#endif /* _STRICT_ANSI */

/***
*     SAS external variables
***/

extern int  __daylight;
extern long __timezone;
extern char *__tzname[2];
extern char __tzstn[4];
extern char __tzdtn[4];
extern char *_TZ;


#endif
