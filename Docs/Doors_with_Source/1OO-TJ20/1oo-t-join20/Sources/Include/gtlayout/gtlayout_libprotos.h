/*
**	GadTools layout toolkit
**
**	Copyright © 1993-1996 by Olaf `Olsen' Barthel
**		Freely distributable.
**
**	:ts=8
*/

#ifndef _GTLAYOUT_LIBPROTOS_H
#define _GTLAYOUT_LIBPROTOS_H 1

	// LTP_AddGadgets.c

VOID			LTP_AddAndRefreshGadgets(struct Window *Window,struct Gadget *Gadgets);
VOID			LTP_AddGadgets(LayoutHandle *);
VOID			LTP_StripGadgets(LayoutHandle *Handle,struct Gadget *Gadgets);
VOID			LTP_AddGadgetsDontRefresh(LayoutHandle *handle);

	// LTP_AddHistory.c

VOID			LTP_AddHistory(struct SGWork *);

	// LTP_AdjustItemPosition.c

LONG			LTP_AdjustItemPosition(struct MenuItem *Item,LONG Left,LONG Top);

	// LTP_AdjustMenuPosition.c

VOID			LTP_AdjustMenuPosition(RootMenu *);

	// LTP_Atol.c

ULONG			LTP_Atol(STRPTR);

	// LTP_BackFillRoutine.c

VOID __saveds __asm	LTP_BackfillRoutine(REG(a0) struct Hook *,REG(a1) struct LayerMsg *,REG(a2) struct RastPort *);

	// LTP_BitMap.c

LONG			LTP_GetDepth(struct BitMap *BitMap);
VOID			LTP_DeleteBitMap(struct BitMap *,BOOL);
struct BitMap *		LTP_CreateBitMap(LONG,LONG,LONG,struct BitMap *,BOOL);

	// LTP_BlinkButton.c

VOID			LTP_BlinkButton(LayoutHandle *,struct Gadget *);

	// LTP_CheckGlyph.c

VOID			LTP_DrawCheckGlyph(struct RastPort *RPort,LONG Left,LONG Top,struct CheckGlyph *Glyph,BOOL Selected);
VOID			LTP_DeleteCheckGlyph(struct CheckGlyph *Glyph);
struct CheckGlyph *	LTP_CreateCheckGlyph(LONG Width,LONG Height,struct BitMap *Friend,LONG BackPen,LONG GlyphPen);

	// LTP_Clone.c

VOID			LTP_CloneScreen(struct LayoutHandle *,LONG,LONG);
BOOL			LTP_PrepareCloning(struct LayoutHandle *);

	// LTP_ConvertNum.c

BOOL			LTP_ConvertNum(BOOL,STRPTR,LONG *);

	// LTP_CorrectItemList.c

BOOL			LTP_CorrectItemList(RootMenu *,ItemNode *,ItemNode *);

	// LTP_CreateExtraObject.c

struct Gadget *		LTP_CreateExtraObject(LayoutHandle *handle,ObjectNode *parentNode,struct Gadget *parentGadget,struct NewGadget *ng,LONG imageType,LONG incAmount);

	// LTP_CreateGadgets.c

VOID			LTP_CreateGadgets(LayoutHandle *,struct IBox *,LONG,LONG,LONG,LONG);

	// LTP_CreateMenuTagList.c

BOOL			LTP_CreateMenuTagList(RootMenu *,LONG *,struct TagItem *);

	// LTP_CreateMenuTemplate.c

BOOL			LTP_CreateMenuTemplate(RootMenu *,LONG *,struct NewMenu *);

	// LTP_CreateObjectNode.c

ObjectNode *		LTP_CreateObjectNode(LayoutHandle *,LONG,ULONG,STRPTR);

	// LTP_DefaultEditRoutine.c

ULONG __saveds __asm	LTP_DefaultEditRoutine(REG(a0) struct Hook *,REG(a2) struct SGWork *,REG(a1) ULONG *);

	// LTP_DefaultHistoryHook.c

ULONG __saveds __asm	LTP_DefaultHistoryHook(REG(a0) struct Hook *,REG(a1) STRPTR,REG(a2) struct Gadget *);

	// LTP_Delay.c

VOID			LTP_Delay(ULONG,ULONG);

	// LTP_DeleteObjectNode.c

VOID			LTP_DeleteObjectNode(LayoutHandle *,ObjectNode *);

	// LTP_DetermineSize.c

LONG			LTP_GetPickerSize(LayoutHandle *Handle);
VOID			LTP_DetermineSize(LayoutHandle *,ObjectNode *);

	// LTP_Draw.c

VOID			LTP_EraseBox(struct RastPort *rp,LONG left,LONG top,LONG width,LONG height);
VOID			LTP_FillBox(struct RastPort *rp,LONG left,LONG top,LONG width,LONG height);
VOID			LTP_DrawLine(struct RastPort *rp,LONG x1,LONG y1,LONG x2,LONG y2);
VOID __stdargs		LTP_PolyDraw(struct RastPort *rp,LONG totalPairs,LONG left,LONG top,...);
VOID			LTP_RenderBevel(struct RastPort *rp,UWORD *pens,LONG left,LONG top,LONG width,LONG height,BOOL recessed,WORD thickness);
VOID			LTP_DrawBevel(LayoutHandle *handle,LONG left,LONG top,LONG width,LONG height);
VOID			LTP_DrawBevelBox(LayoutHandle *handle,ObjectNode *node);
VOID			LTP_PrintText(struct RastPort *rp,STRPTR text,LONG textLen,LONG x,LONG y);
VOID			LTP_DrawGroove(LayoutHandle *handle,LONG left,LONG top,LONG width,LONG height,LONG from,LONG to);
VOID			LTP_DrawGroupLabel(LayoutHandle *handle,ObjectNode *label);

	// LTP_DrawBackFore.c

VOID			LTP_DrawBackFore(struct RastPort *RPort,BOOL Back,LONG Left,LONG Top,LONG Width,LONG Height);

	// LTP_DrawBox.c

VOID			LTP_DrawMultiLineButton(struct RastPort *RPort,LONG Left,LONG Top,LONG Width,LONG Height,struct ImageInfo *ImageInfo,BOOL Bold);
VOID			LTP_DrawBox(struct RastPort *,struct DrawInfo *,LONG,LONG,LONG,LONG,BOOL,BOOL,ImageInfo *);

	// LTP_DrawGauge.c

VOID			LTP_GaugeFill(struct RastPort *rp,LONG pen,ObjectNode *node,LONG left,LONG right,LONG height);
VOID			LTP_DrawTick(LayoutHandle *Handle,ObjectNode *Node,LONG Left,LONG Top);
VOID			LTP_DrawGauge(LayoutHandle *,ObjectNode *,LONG,BOOL);

	// LTP_DrawGroup.c

VOID			LTP_DrawObjectLabel(LayoutHandle *,ObjectNode *);
VOID			LTP_DrawGroup(LayoutHandle *,ObjectNode *);

	// LTP_DrawIncrementer.c

VOID			LTP_DrawIncrementer(struct RastPort *rp,struct DrawInfo *drawInfo,BOOL leftDirection,LONG left,LONG top,LONG width,LONG height);

	// LTP_DrawPalette.c

VOID			LTP_DrawPalette(struct LayoutHandle *,struct ObjectNode *);

	// LTP_DrawPicker.c

VOID			LTP_DrawPicker(struct RastPort *RPort,BOOL UpDirection,LONG Left,LONG Top,LONG Width,LONG Height);

	// LTP_DrawPrevNext.c

VOID			LTP_DrawPrevNext(struct RastPort *RPort,BOOL Prev,LONG Left,LONG Top,LONG Width,LONG Height);

	// LTP_DrawTapeButton.c

VOID			LTP_DrawTapeButton(struct RastPort *RPort,ImageInfo *imageInfo,LONG Left,LONG Top,LONG Width,LONG Height,LONG AspectX,LONG AspectY,LONG Background);

	// LTP_FillMenu.c

VOID			LTP_FillSub(ULONG,ULONG,struct MenuItem *);
VOID			LTP_FillItem(ULONG,struct MenuItem *);
VOID			LTP_FillMenu(struct Menu *);

	// LTP_Find.c

LONG			LTP_Find_Clicked_Item(LayoutHandle *,ObjectNode *,LONG,LONG);
ObjectNode *		LTP_FindNode_Position(ObjectNode *,LONG,LONG);
ObjectNode *		LTP_FindNode(LayoutHandle *,LONG);
struct Gadget *		LTP_FindGadget(LayoutHandle *,LONG);

	// LTP_FixExtraLabel.c

VOID			LTP_FixExtraLabel(RootMenu *,LONG *);

	// LTP_FracEditRoutine.c

ULONG __saveds __asm	LTP_FracEditRoutine(REG(a0) struct Hook *,REG(a2) struct SGWork *,REG(a1) ULONG	*);

	// LTP_GetCommandWidth.c

LONG			LTP_GetCommandWidth(RootMenu *,ItemNode *);

	// LTP_GetDisplayClip.c

VOID			LTP_GetDisplayClip(struct Screen *,WORD *,WORD *,WORD *,WORD *);

	// LTP_GlyphSetup.c

VOID			LTP_GetDefaultFont(struct TTextAttr *);
struct TextFont *	LTP_OpenFont(struct TextAttr *);
BOOL			LTP_GlyphSetup(struct LayoutHandle *,struct TextAttr *);

	// LTP_HandleHistory.c

VOID			LTP_HandleHistory(struct SGWork *);

	// LTP_HexEditRoutine.c

ULONG __saveds __asm	LTP_HexEditRoutine(REG(a0) struct Hook *,REG(a2) struct SGWork *,REG(a1) ULONG *);

	// LTP_ImageClass.c

ULONG __saveds __asm	LTP_ImageDispatch(REG(a0) struct IClass *,REG(a2) Object *,REG(a1) Msg);

	// LTP_InitIText.c

VOID			LTP_InitIText(RootMenu *,struct IntuiText *);

	// LTP_LayoutGadgets.c

VOID			LTP_LayoutGadgets(LayoutHandle *,ObjectNode *,LONG,LONG,LONG,LONG);

	// LTP_LayoutGroup.c

VOID			LTP_ShuffleGroup(LayoutHandle *Handle,ObjectNode *Group);
VOID			LTP_LayoutGroup(LayoutHandle *,ObjectNode *);

	// LTP_LayoutMenu.c

BOOL			LTP_LayoutMenu(RootMenu *Root,LONG ExtraFront,LONG ExtraSpace);

	// LTP_LevelGadget.c

VOID			LTP_LevelGadgetDrawLabel(struct Gadget *,BOOL);
ULONG			LTP_LevelGadgetRender(struct Gadget *,struct gpRender *);
ULONG			LTP_LevelGadgetGoActive(struct Gadget *,struct gpInput *);
ULONG			LTP_LevelGadgetHandleInput(struct Gadget *,struct gpInput *);
ULONG __saveds __asm	LTP_LevelGadgetDispatcher(REG(a0) struct Hook *,REG(a2) struct Gadget *,REG(a1) Msg);

	// LTP_LevelImage.c

VOID			LTP_DrawLevelImageLeft(struct RastPort *,UWORD *,LevelImageInfo *,struct Image *,LONG,LONG,LONG,LONG,LONG,LONG);
VOID			LTP_DrawLevelImageRight(struct RastPort *,UWORD *,LevelImageInfo *,struct Image *,LONG,LONG,LONG,LONG,LONG,LONG);
VOID			LTP_DrawLevelImageComplete(struct Image *,struct RastPort *,UWORD *,LevelImageInfo *,LONG,LONG,BOOL);
ULONG			LTP_LevelClassDraw(struct Image *,struct impDraw *,LevelImageInfo *);
ULONG			LTP_LevelClassSet(Class *,struct Image *,struct opSet *);
ULONG			LTP_LevelClassGet(Class *,struct Image *,struct opGet *);
ULONG			LTP_LevelClassNew(Class *,Object *,struct opSet *);
ULONG			LTP_LevelClassDispose(Class *,Object *,Msg);
ULONG __saveds __asm	LTP_LevelClassDispatcher(REG(a0) Class *,REG(a2) Object *,REG(a1) Msg);

	// LTP_MakeItem.c

ItemNode *		LTP_MakeItem(RootMenu *,struct NewMenu *);

	// LTP_MakeMenu.c

MenuNode *		LTP_MakeMenu(RootMenu *,MenuNode *,struct NewMenu *);

	// LTP_Memory.c

APTR			LTP_Alloc(LayoutHandle *,ULONG);
VOID			LTP_Free(LayoutHandle *,APTR,ULONG);

	// LTP_MoveToWindow.c

VOID			LTP_MoveToWindow(LayoutHandle *);

	// LTP_NewMenu.c

RootMenu *		LTP_NewMenu(struct Screen *,struct TextAttr *,struct Image *,struct Image *,LONG *);

	// LTP_PasswordEditRoutine.c

ULONG __saveds __asm	LTP_PasswordEditRoutine(REG(a0) struct Hook *,REG(a2) struct SGWork *,REG(a1) ULONG *);

	// LTP_PlaceGroups.c

VOID			LTP_PlaceGroups(LayoutHandle *,ObjectNode *,LONG,LONG);

	// LTP_PopupClass.c

ULONG __saveds __asm	LTP_PopupClassDispatcher(REG(a0) struct IClass *,REG(a2) Object *,REG(a1) Msg);

	// LTP_PrintBoxLine.c

BOOL			LTP_PrintLinePadded(LayoutHandle *Handle,LONG Left,LONG Top,LONG Space,STRPTR Line,LONG Len);
VOID			LTP_PrintLine(LayoutHandle *,LONG,LONG,LONG,LONG,STRPTR,LONG);
VOID			LTP_PrintBoxLine(LayoutHandle *,ObjectNode *,LONG);

	// LTP_PrintLabel.c

VOID			LTP_PrintLabel(LayoutHandle *,ObjectNode *,LONG,LONG);

	// LTP_RenderArrow.c

VOID			LTP_RenderArrow(struct RastPort *RPort,BOOL LeftDirection,LONG Left,LONG Top,LONG Width,LONG Height);

	// LTP_RenderCircle.c

VOID			LTP_RenderCircle(struct RastPort *RPort,LONG Left,LONG Top,LONG Radius,LONG AspectX,LONG AspectY);

	// LTP_Rescale.c

VOID			LTP_ResetListViewTextAttrs(ObjectNode *);
VOID			LTP_Rescale(LayoutHandle *,BOOL,BOOL);

	// LTP_ResetGroups.c

VOID			LTP_ResetGroups(ObjectNode *);

	// LTP_RPortAttrs.c

VOID			LTP_SetPens(struct RastPort *,LONG,LONG,LONG);
VOID			LTP_SetAPen(struct RastPort *,LONG);
VOID			LTP_SetFont(LayoutHandle *,struct TextFont *);

	// LTP_SearchKeys.c

VOID			LTP_SearchKeys(LayoutHandle *,ObjectNode *);

	// LTP_SelectKeys.c

VOID			LTP_SelectKeys(LayoutHandle *,ObjectNode *);

	// LTP_ShrinkMenu.c

VOID			LTP_ShrinkMenu(RootMenu *,ItemNode *,ItemNode *,LONG);

	// LTP_SizeDimensions.c

ULONG			LTP_GetSizeWidth(struct LayoutHandle *);
ULONG			LTP_GetSizeHeight(struct LayoutHandle *);

	// LTP_Spread.c

VOID			LTP_Spread(LayoutHandle *,ObjectNode *,LONG,LONG);

	// LTP_SPrintf.c

VOID __stdargs		SPrintf(STRPTR,STRPTR,...);

	// LTP_Storage.c

VOID			LTP_GetStorage(ObjectNode *);
VOID			LTP_PutStorage(ObjectNode *);

	// LTP_TabClass.c

BOOL __stdargs		LTP_ObtainTabSize(struct IBox *,...);
ULONG __saveds __asm	LTP_TabClassDispatcher(REG(a0) struct IClass *,REG(a2) Object *,REG(a1) Msg);

	// LT_Build.c

VOID			LTP_SelectInitialActiveGadget(LayoutHandle *Handle);

	// LT_DeleteHandle.c

VOID			LTP_DisposeGadgets(LayoutHandle *);

	// LT_LevelWidth.c

VOID __stdargs		LTP_LevelWidth(LayoutHandle *,STRPTR,LONG (* __stdargs)(struct Gadget *,LONG),LONG,LONG,LONG *,LONG *,BOOL);

	// LT_LockWindow.c

VOID			LTP_DeleteWindowLock(LockNode *Node);

	// LT_Rebuild.c

VOID			LTP_Erase(LayoutHandle *Handle);

	// LT_SetAttributes.c

VOID			LTP_AddAllAndRefreshThisGadget(LayoutHandle *Handle,struct Gadget *Gadget);
VOID			LTP_FixState(LayoutHandle *Handle,BOOL State,struct Gadget *Gadget,UWORD Bit);
BOOL			LTP_NotifyPager(LayoutHandle *Handle,LONG ID,LONG Page);

#endif	/* _GTLAYOUT_LIBPROTOS_H */
