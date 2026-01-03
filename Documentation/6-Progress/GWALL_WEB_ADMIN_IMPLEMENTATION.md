# Global Wall Web Admin Panel Implementation

**Date:** 2026-01-02
**Status:** COMPLETE

## Summary

Implemented complete web admin panel for Global Wall management, providing sysop-level access to comment moderation and configuration management through the web-based configuration interface. This complements the terminal-based sysop mode implemented in the door itself.

## Features Implemented

### Backend API (`web/backend/src/api/globalwall-routes.ts`)

Created 5 REST API endpoints with sysop authentication:

#### Comment Management
- **GET /api/globalwall/comments** - Fetch wall comments with pagination
  - Query params: `page` (default: 1), `limit` (default: 20)
  - Proxies to scenewall.bbs.io:1541 Global Wall server

- **PUT /api/globalwall/comments/:id** - Update existing comment
  - Body: `{ userName, source, comment, bbsshortcode }`
  - Preserves ANSI color codes in comments

- **DELETE /api/globalwall/comments/:id** - Delete comment from wall
  - Returns success/error status

#### Configuration Management
- **GET /api/globalwall/config** - Get local configuration
  - Reads `doors/gwall/GWall.cfg`
  - Returns: `{ style, mybbsshortcode, coloursettings }`
  - Defaults: style=4, mybbsshortcode='AMI', coloursettings='42626717772363'

- **PUT /api/globalwall/config** - Update local configuration
  - Validates: style (1-4), mybbsshortcode (1-3 chars), coloursettings (14 chars)
  - Writes to `doors/gwall/GWall.cfg`

All endpoints require JWT authentication and sysop-level access via middleware.

### Frontend Components (`web/config-app/src/pages/GlobalWallPage.tsx`)

React component with 2 tabs: Comments & Settings

#### Comments Tab
- **Paginated table** showing all wall comments
  - Columns: ID, User, Source, BBS, Comment, Actions
  - Edit/Delete buttons per comment
  - Previous/Next pagination controls

- **Edit modal** with form fields:
  - User Name (text input)
  - Source (text input)
  - BBS Short Code (3-char input)
  - Comment (textarea with ANSI preservation note)

- **Delete confirmation** using notification context
  - Shows user name in confirmation dialog
  - "danger" type for visual warning

#### Settings Tab
- **Configuration form** with validation:
  - BBS Short Code (1-3 characters, required)
  - Wall Style (dropdown 1-4, required)
  - Color Settings (14-character string, required)

- **Save button** with loading state
  - Shows "Saving..." during mutation
  - Success/error notifications

### API Client Methods (`web/config-app/src/api/client.ts`)

Added 5 new methods to ApiClient class:

```typescript
async getGlobalWallComments(page: number = 1, limit: number = 20)
async updateGlobalWallComment(id: string, data: any)
async deleteGlobalWallComment(id: string)
async getGlobalWallConfig()
async updateGlobalWallConfig(config: any)
```

All methods use the standard `request<T>()` pattern with JWT authentication.

### Routing & Navigation

#### App.tsx
- Added route: `/admin/globalwall` → `<GlobalWallPage />`
- Positioned after `/admin/doors` (related features grouped)

#### Layout.tsx
- Added navigation link: "Global Wall" with Globe icon
- Positioned after "Doors" in sidebar
- Follows standard NavLink pattern with active state

## Architecture Decisions

### HTTP Proxy Pattern
Rather than implementing Global Wall server protocol in TypeScript, we proxy HTTP requests to the existing scenewall.bbs.io:1541 server. This:
- Reuses existing infrastructure
- Maintains compatibility with other BBSes using Global Wall
- Simplifies implementation
- Adds authentication layer (server has no auth, we protect with JWT)

### Local vs Remote Config
- **Comments**: Stored on remote Global Wall server (shared across all BBSes)
- **Config**: Stored locally in `GWall.cfg` (per-BBS customization)

This matches the original door behavior where comments are global but display settings are local.

### Tab-Based UI
Two-tab interface separates:
- **Comments tab**: High-frequency moderation tasks (edit/delete spam)
- **Settings tab**: Low-frequency configuration (set once, rarely change)

Better UX than a single scrolling page with mixed purposes.

## Technical Details

### HTTP Proxy Implementation
```typescript
function makeGlobalWallRequest(
  requestPath: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body?: string
): Promise<{ statusCode: number; data: string }> {
  // 10-second timeout
  // Proper error handling
  // Host header: scenewall.bbs.io
  // Port: 1541
}
```

### React Query Integration
- Uses `@tanstack/react-query` for server state
- Automatic refetching after mutations
- Loading states handled by `isLoading` flags
- Error handling via `onError` callbacks

### Form Validation
- HTML5 validation attributes (`required`, `maxLength`, `minLength`)
- Backend validation for extra security
- User-friendly error messages via notification context

## Files Created

1. `/web/backend/src/api/globalwall-routes.ts` (~240 lines)
   - Express router factory function
   - 5 API endpoints
   - HTTP proxy helper function

2. `/web/config-app/src/pages/GlobalWallPage.tsx` (~460 lines)
   - React component with hooks
   - 2 tabs (Comments, Settings)
   - Edit modal
   - Pagination

## Files Modified

1. `/web/backend/src/server/routes-setup.ts`
   - Added import: `createGlobalWallRouter`
   - Mounted router at `/api/globalwall` with auth middleware

2. `/web/config-app/src/api/client.ts`
   - Added 5 Global Wall API methods
   - Lines 653-680 (28 lines added)

3. `/web/config-app/src/App.tsx`
   - Added import: `GlobalWallPage`
   - Added route: `/admin/globalwall`

4. `/web/config-app/src/components/Layout.tsx`
   - Added import: `Globe` icon
   - Added nav link for Global Wall

## Compilation Status

- **Backend**: Compiles successfully (`npx tsc --noEmit`)
- **Frontend**: GlobalWallPage.tsx compiles without errors
  - Pre-existing TypeScript errors in unrelated files
  - None related to Global Wall implementation

## Testing Checklist

### Backend API Testing
- [ ] GET /api/globalwall/comments returns paginated data
- [ ] PUT /api/globalwall/comments/:id updates comment on server
- [ ] DELETE /api/globalwall/comments/:id removes comment
- [ ] GET /api/globalwall/config reads GWall.cfg correctly
- [ ] PUT /api/globalwall/config validates and writes GWall.cfg
- [ ] All endpoints require authentication (401 without JWT)
- [ ] All endpoints require sysop level (403 for non-sysops)

### Frontend Testing
- [ ] Comments tab displays paginated wall comments
- [ ] Pagination controls work (Previous/Next)
- [ ] Edit button opens modal with pre-filled data
- [ ] Edit modal saves changes and refreshes list
- [ ] Delete button shows confirmation dialog
- [ ] Delete confirmation removes comment and refreshes list
- [ ] Settings tab loads current configuration
- [ ] Settings form validates input (3-char code, 1-4 style, 14-char color)
- [ ] Settings save button updates GWall.cfg
- [ ] Success/error notifications display correctly
- [ ] Navigation link highlights when active
- [ ] Responsive layout works on different screen sizes

## Integration with Door

The web admin panel works alongside the terminal-based sysop mode in `/Doors/Gwall/index.ts`:

- **Terminal sysop mode** (Press 'S' in door):
  - For sysops logged into the BBS
  - Immediate access while viewing wall
  - Keyboard-driven interface
  - Same backend API endpoints

- **Web admin panel**:
  - For remote management
  - Modern GUI interface
  - Mouse-driven workflow
  - Accessible from anywhere with web access

Both interfaces use the same backend API, ensuring consistency.

## API Compatibility

Fully compatible with Global Wall REST API at scenewall.bbs.io:1541:

- **GET /GlobalWall/api/WallItems?itemCount=N&pagenum=P** - Fetch comments
- **PUT /GlobalWall/api/WallItems/{id}** - Update comment
- **DELETE /GlobalWall/api/WallItems/{id}** - Delete comment

Our endpoints proxy these requests with added authentication.

## Security Considerations

1. **Authentication**: JWT required for all endpoints
2. **Authorization**: Sysop level (255) required
3. **Validation**: Input validated on both client and server
4. **Sanitization**: HTML/script injection prevented
5. **CORS**: Configured for admin domain only
6. **Timeout**: 10-second timeout prevents hanging requests

## Future Enhancements

Possible improvements (not in scope for this implementation):

1. **Search/Filter**: Search comments by user/text/BBS
2. **Bulk Actions**: Select multiple comments for batch delete
3. **Comment History**: Track edits with timestamps
4. **User Banning**: Block specific users from posting
5. **Analytics**: Comment statistics and trends
6. **Color Picker**: Visual editor for color settings instead of numeric codes

## References

- Original door: `/Doors/Gwall/index.ts`
- Sysop mode: `GWALL_SYSOP_MODE_IMPLEMENTATION.md`
- Global Wall server: scenewall.bbs.io:1541
- React Query docs: https://tanstack.com/query/latest
- Lucide icons: https://lucide.dev/

---

**Implementation completed:** 2026-01-02
**Status:** READY FOR TESTING
**Next:** Implement Global Last Callers global server support (task #6)
