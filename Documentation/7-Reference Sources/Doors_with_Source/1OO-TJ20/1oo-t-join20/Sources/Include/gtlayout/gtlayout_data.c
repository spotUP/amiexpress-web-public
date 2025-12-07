/*
**	GadTools layout toolkit
**
**	Copyright © 1993-1996 by Olaf `Olsen' Barthel
**		Freely distributable.
**
**	:ts=8
*/

#ifndef _GTLAYOUT_GLOBAL_H
#include "gtlayout_global.h"
#endif

#ifdef SHARED_LIB
	struct ExecBase	*SysBase;
#else
extern	struct ExecBase	*SysBase;
#endif	// SHARED_LIB

struct Library		*IntuitionBase;
struct GfxBase		*GfxBase;
struct Library		*UtilityBase;
struct Library		*GadToolsBase;
struct Library		*KeymapBase;
struct LocaleBase	*LocaleBase;
struct Locale		*LTP_Locale;
struct SignalSemaphore	 LTP_LockSemaphore;
struct MinList		 LTP_LockList;
struct IClass		*LTP_ImageClass,
			*LTP_LevelClass,
			*LTP_PopupClass,
			*LTP_TabClass;
struct MinList		 LTP_EmptyList;

#ifdef DO_PICKSHORTCUTS
UBYTE			*LTP_Keys[2];
struct SignalSemaphore	 LTP_KeySemaphore;
#endif

BOOLEAN			 V39,
			 V40;
