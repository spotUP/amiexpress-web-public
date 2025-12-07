/* Copyright (c) 1992-1993 SAS Institute, Inc., Cary, NC USA */
/* All Rights Reserved */


#ifndef _LOCALE_H
#define _LOCALE_H 1

#ifndef _COMMNULL_H
#include <sys/commnull.h>
#endif

#ifndef _COMMSIZE_H
#include <sys/commsize.h>
#endif

#ifndef _COMMCHAR_H
#include <sys/commchar.h>
#endif

#define LC_COLLATE  0
#define LC_CTYPE    1
#define LC_NUMERIC  2
#define LC_TIME     3
#define LC_MONETARY 4
#define LC_ALL      5


struct lconv {
    char *decimal_point;
    char *thousands_sep;
    char *grouping;
#define LCONVM int_curr_symbol
    char *int_curr_symbol;
    char *currency_symbol;
    char *mon_decimal_point;
    char *mon_thousands_sep;
    char *mon_grouping;
    char *positive_sign;
    char *negative_sign;
    char int_frac_digits;
    char frac_digits;
    char p_cs_precedes;
    char p_sep_by_space;
    char n_cs_precedes;
    char n_sep_by_space;
    char p_sign_posn;
    char n_sign_posn;
};


struct __lconvn {			/* lconv from LC_NUMERIC */
    char *decimal_point;
    char *thousands_sep;
    char *grouping;
};

struct __lconvm {			/* lconv from LC_MONETARY */
    char *int_curr_symbol;
    char *currency_symbol;
    char *mon_decimal_point;
    char *mon_thousands_sep;
    char *mon_grouping;
    char *positive_sign;
    char *negative_sign;
    char int_frac_digits;
    char frac_digits;
    char p_cs_precedes;
    char p_sep_by_space;
    char n_cs_precedes;
    char n_sep_by_space;
    char p_sign_posn;
    char n_sign_posn;
};


struct __locale {
    struct __locale *nxtlc;	/* next locale pointer			*/
    char *lcname;		/* locale name 			LC_ALL 	*/
    char **abswday;		/* abbreviated weekday names 	LC_TIME	*/
    char **swday;		/* full weekday names		LC_TIME	*/
    char **absmon;		/* abbrev. month names		LC_TIME */
    char **smon;		/* full month names		LC_TIME	*/
    char **sampm;		/* names for am. and pm.	LC_TIME */
    char *stzone;		/* name for timezone		LC_TIME */
    int *lccomp;		/* collating sequence 		LC_COLLATE? */
    int *ixfrm;		        /* translate table		LC_COLLATE */
    char decpt;		        /* decimal point char		LC_NUMERIC */
    char mb_cur_max;	        /* maximum number of bytes in
    				   wide character		LC_CTYPE */
    char mb_state;		/* flag for state-dep mappings  LC_CTYPE */
    			        /* mblen function		LC_CTYPE */
    int  (*mblen)(const char *, size_t);
    int  mblen_state;	        /* mblen shift state 		LC_CTYPE */
    			        /* mbtowc function		LC_CTYPE */
    int  (*mbtowc)(wchar_t *,const char *, size_t);
    int  mbtowc_state;	        /* mbtowc shift state 		LC_CTYPE */
    			        /* wctomb function		LC_CTYPE */
    int  (*wctomb)(char *, wchar_t);
    int  wctomb_state;	        /* wctomb shift state 		LC_CTYPE */
    			        /* mbstowcs function		LC_CTYPE */
    size_t  (*mbstowcs)(wchar_t *,const char *, size_t);
    int  mbstowcs_state;	/* mbstowcs shift state 	LC_CTYPE */
    			        /* wcstombs function		LC_CTYPE */
    size_t  (*wcstombs)(char *, const wchar_t *,size_t);
    int  wcstombs_state;	/* wcstombs shift state		LC_CTYPE */
    struct __lconvn	*lconvn; /* structure for lconv		LC_NUMERIC */
    struct __lconvm	*lconvm; /* structure for lconv		LC_MONETARY */
};


extern struct __locale *__clocale[];	/* current locale for each category */
extern struct lconv  __clconv;	        /* current lconv array */
extern char __decpt;			/* current decimal point character */
#define DECPT __decpt
extern char __mb_cur_max;
extern struct __locale *__flocale;      /* first locale in linked list ("C") */
extern struct __locale *__llocale;      /* last locale in linked list */

extern char *setlocale(int, const char *);
extern struct lconv *localeconv(void);
extern struct __locale *readlocale(const char *);


/***
*     Error messages when reading a locale, stored in lclerror
***/

#define _LCLNAME		1	/* pathname for locale file too long */
#define _LCLOPEN		2	/* Unable to open locale file */
#define _LCLCOLL		3	/* multiple collate spec */
#define _LCLCTYPE	   4	/* multiple c types spec */
#define _LCLNUMERIC	5	/* multiple numeric spec */
#define _LCLTIME		6	/* multiple time spec */
#define _LCLMONETARY	7	/* multiple monetary spec */
#define _LCLREAD		8	/* Error reading locale file */
#define _LCLEND		9	/* Missing END record */

extern int	__lclerror;

#endif
