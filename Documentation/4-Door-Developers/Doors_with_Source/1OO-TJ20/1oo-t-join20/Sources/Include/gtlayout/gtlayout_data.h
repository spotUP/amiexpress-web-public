/*
**	GadTools layout toolkit
**
**	Copyright © 1993-1996 by Olaf `Olsen' Barthel
**		Freely distributable.
*/

#ifndef _GTLAYOUT_DATA_H
#define _GTLAYOUT_DATA_H 1

extern struct ExecBase		*SysBase;
extern struct Library		*IntuitionBase;
extern struct GfxBase		*GfxBase;
extern struct Library		*UtilityBase;
extern struct Library		*GadToolsBase;
extern struct Library		*KeymapBase;
extern struct LocaleBase	*LocaleBase;
extern struct Locale		*LTP_Locale;
extern struct SignalSemaphore	 LTP_LockSemaphore;
extern struct MinList		 LTP_LockList;
extern struct IClass		*LTP_ImageClass,
				*LTP_LevelClass,
				*LTP_PopupClass,
				*LTP_TabClass;
extern struct MinList		 LTP_EmptyList;

#ifdef DO_PICKSHORTCUTS
extern UBYTE			*LTP_Keys[2];
extern struct SignalSemaphore	 LTP_KeySemaphore;
#endif

extern BOOLEAN			 V39,
				 V40;

#endif
