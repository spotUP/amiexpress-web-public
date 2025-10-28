# Project Reorganization Plan

## Objective
Reorganize the project structure to match the authentic AmiExpress BBS directory layout (based on reference-boardBBS) while properly organizing modern web components.

## Current Status
✅ Completed:
- Created `Screens/` directory with subdirectories (flt/, logoff/, custom/)
- Standardized all Conf1-Conf14 directories with proper structure
- Created analysis documentation

## Proposed Structure

### New Directory Organization
```
amiexpress-web/
├── [Traditional BBS Directories - No Changes]
│   ├── Access/
│   ├── AmiTCP/
│   ├── AmiXnet/
│   ├── Bulletins/
│   ├── Commands/
│   ├── Conf1/ through Conf14/ (standardized)
│   ├── Doors/
│   ├── FCheck/
│   ├── HELP/
│   ├── Languages/
│   ├── Libs/
│   ├── Node0/ through Node6/
│   ├── Protocols/
│   ├── Screens/ (NEW - created)
│   ├── Storage/
│   ├── SysopStats/
│   ├── Utils/
│   └── Zoom/
│
├── [Source Code & Archives - Keep at Root]
│   ├── AmiExpress-Sources/ (historical reference)
│   └── reference-boardBBS/ (real BBS reference)
│
├── [Modern Web Application - NEW CONTAINER]
│   └── web/
│       ├── backend/          (moved from ./backend)
│       ├── frontend/          (moved from ./frontend)
│       ├── client/            (moved from ./client)
│       └── server/            (moved from ./server)
│
├── [Development Resources - NEW CONTAINER]
│   └── dev/
│       ├── docs/              (moved from ./Docs)
│       ├── scripts/           (moved from ./Scripts)
│       ├── tools/
│       │   └── unlzx/        (moved from ./unlzx)
│       └── archive/
│           ├── old/          (moved from ./old)
│           └── BBS/          (empty dir, can remove)
│
└── [Root Level Files - Stay at Root]
    ├── .env, .env.example, .env.local
    ├── .gitignore, .vercelignore
    ├── CLAUDE.md
    ├── package.json, package-lock.json
    ├── vercel.json, render.yaml
    ├── start-*.sh, stop-*.sh scripts
    └── amiexpress.db, database.sqlite
```

## Migration Steps

### Phase 1: Preparation (SAFE - No Breaking Changes)
1. ✅ Create `Screens/` directory structure
2. ✅ Standardize conference directories
3. Create `web/` directory
4. Create `dev/` directory structure
5. Create `dev/tools/` and `dev/archive/`

### Phase 2: Documentation Migration (SAFE)
1. Copy `Docs/` → `dev/docs/`
2. Verify all documentation is copied
3. Update any documentation paths in scripts
4. Remove old `Docs/` after verification

### Phase 3: Scripts Migration (MEDIUM RISK)
1. Copy `Scripts/` → `dev/scripts/`
2. Update script paths in:
   - package.json
   - start-*.sh files
   - Any documentation
3. Test all scripts work from new location
4. Remove old `Scripts/` after verification

### Phase 4: Web Components Migration (HIGH RISK - Requires Testing)
1. Create backup of current working state
2. Move `backend/` → `web/backend/`
3. Move `frontend/` → `web/frontend/`
4. Move `client/` → `web/client/` (if still used)
5. Move `server/` → `web/server/` (if still used)

**Critical Path Updates Required:**
- package.json scripts
- start-backend.sh
- start-frontend.sh
- start-all.sh, stop-all.sh
- .vercelignore, vercel.json
- render.yaml
- Any imports/requires with relative paths
- Database connection paths
- Environment variable files

6. Test thoroughly:
   - Backend starts correctly
   - Frontend connects to backend
   - All API endpoints work
   - File uploads/downloads function
   - Database operations succeed

### Phase 5: Cleanup (SAFE)
1. Move `unlzx/` → `dev/tools/unlzx/`
2. Move `old/` → `dev/archive/old/`
3. Evaluate and remove `BBS/` if unused
4. Update .gitignore for new structure

## Risk Assessment

### LOW RISK ✅
- Screens/ creation (new directory, no dependencies)
- Conference standardization (additive only)
- Documentation migration (read-only resources)

### MEDIUM RISK ⚠️
- Scripts migration (may need path updates)
- Tools migration (utility programs)

### HIGH RISK ⛔
- Web components migration (active application code)
- Requires careful testing and path updates
- Potential for breaking changes

## Rollback Plan

If issues occur during migration:

1. **Documentation/Scripts Issues:**
   - Revert git changes
   - Restore from backup
   - Update paths in affected files

2. **Web Components Issues:**
   - Keep old structure until fully tested
   - Use git branches for migration
   - Test each component individually
   - Only commit when fully functional

## Alternative Approach: Gradual Migration

Instead of moving directories, use symbolic links initially:

```bash
# Create new structure
mkdir -p web dev/docs dev/scripts dev/tools dev/archive

# Create symlinks (doesn't break existing paths)
ln -s ../backend web/backend
ln -s ../frontend web/frontend
ln -s ../Docs dev/docs
ln -s ../Scripts dev/scripts

# Gradually update paths in code
# Once all paths updated, move actual directories
```

## Testing Checklist

Before finalizing reorganization:

- [ ] Backend starts without errors
- [ ] Frontend loads correctly
- [ ] User login/registration works
- [ ] File upload/download works
- [ ] Message system functions
- [ ] Conference access works
- [ ] Door execution succeeds
- [ ] Database migrations run
- [ ] All npm scripts execute
- [ ] Deployment configuration valid

## Documentation Updates Required

After reorganization, update:

1. README.md (if exists at root)
2. All paths in CLAUDE.md
3. Development guides
4. Deployment documentation
5. API documentation
6. This document's status section

## Benefits of Reorganization

### For BBS Authenticity:
- ✅ Matches real AmiExpress structure (reference-boardBBS)
- ✅ Easier to reference authentic BBS configurations
- ✅ Clear separation of BBS vs modern components
- ✅ Screens/ directory in proper location

### For Development:
- ✅ Clear organization of modern vs traditional
- ✅ Development resources consolidated
- ✅ Easier onboarding for new developers
- ✅ Better project documentation structure

### For Maintenance:
- ✅ Logical grouping of related components
- ✅ Clearer dependencies
- ✅ Easier to update modern components
- ✅ Preserves BBS authenticity

## Recommendations

### RECOMMENDED IMMEDIATELY:
1. ✅ Keep current Screens/ and conference standardization
2. Create `dev/docs/` and copy documentation there
3. Create symlinks for gradual migration

### RECOMMENDED BEFORE NEXT MAJOR RELEASE:
1. Complete web components migration using symlink approach
2. Update all documentation paths
3. Test deployment on staging environment
4. Update deployment configurations

### OPTIONAL (Low Priority):
1. Consolidate client/server if redundant
2. Archive unused directories
3. Clean up root-level temporary files

## Status Tracking

| Task | Status | Date | Notes |
|------|--------|------|-------|
| Create Screens/ | ✅ Done | 2025-10-28 | With flt/, logoff/, custom/ |
| Standardize Conferences | ✅ Done | 2025-10-28 | All Conf1-14 updated |
| Create analysis docs | ✅ Done | 2025-10-28 | DIRECTORY_STRUCTURE_ANALYSIS.md |
| Create reorganization plan | ✅ Done | 2025-10-28 | This document |
| Create web/ directory | ⏳ Pending | - | - |
| Create dev/ directory | ⏳ Pending | - | - |
| Migrate documentation | ⏳ Pending | - | - |
| Migrate scripts | ⏳ Pending | - | - |
| Migrate web components | ⏳ Pending | - | High risk - needs testing |
| Update all paths | ⏳ Pending | - | - |
| Full system testing | ⏳ Pending | - | - |

## Next Steps

1. Review this plan with project stakeholders
2. Create backup/branch for migration
3. Start with low-risk items (dev/docs)
4. Use symlink approach for web components
5. Test thoroughly at each stage
6. Document any issues encountered
7. Update this plan based on experience

---

**Note:** This reorganization should be done carefully and incrementally. The current system is functional, so changes should be tested thoroughly before being finalized.