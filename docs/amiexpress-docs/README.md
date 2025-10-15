# AmiExpress v5.6.0 Documentation Archive

This directory contains the complete official AmiExpress v5.6.0 documentation fetched from the GitHub wiki. These documents serve as the authoritative reference for implementing features in the AmiExpress Web port.

## 🚀 **Deployment Information**

**Current Deployment**: Render.com (WebSocket-enabled)
- **Frontend**: https://amiexpress-frontend.onrender.com
- **Backend**: https://amiexpress-backend.onrender.com
- **WebSocket Endpoint**: wss://amiexpress-backend.onrender.com

**Why Render.com**: Full WebSocket support for real-time BBS functionality, unlike Vercel's serverless limitations.

## 📚 **Available Documentation**

### **Core Documentation**
- **[Introduction](introduction.md)** - Overview of AmiExpress BBS software
- **[Requirements](requirements.md)** - System requirements and dependencies
- **[Installation](installation.md)** - Complete installation guide
- **[Configuration](configuration.md)** - Setup and configuration instructions

### **Technical Reference**
- **[Program Logic](program_logic.md)** - Internal program flow and architecture
- **[Main Menu Commands](main_menu.md)** - Complete command reference
- **[Notable Features](features.md)** - Special features and capabilities

## 🎯 **How to Use These Docs for Porting**

### **1. Feature Implementation**
- **Read the relevant section** before implementing any feature
- **Compare with current implementation** in `backend/src/index.ts`
- **Ensure 1:1 compatibility** where possible
- **Document enhancements** that improve UX without breaking authenticity

### **2. Command Implementation**
- **Check Main Menu Commands** for exact behavior expected
- **Verify parameter handling** (e.g., `F 1`, `J 2`, `N 01-15-24`)
- **Implement error handling** as described
- **Test edge cases** mentioned in documentation

### **3. State Management**
- **Reference Program Logic** for state transitions
- **Maintain substate flow** (`DISPLAY_BULL` → `DISPLAY_CONF_BULL` → `DISPLAY_MENU`)
- **Handle menuPause logic** correctly
- **Implement proper command buffering**

### **4. File System**
- **Study DIR structure** and conference organization
- **Implement file area commands** (`F`, `FR`, `FS`, `N`)
- **Handle FILE_ID.DIZ** extraction and display
- **Support directory parameters** (A, U, H, numeric)

### **5. Message System**
- **Implement private messaging** (`E` command)
- **Support message threading** and replies
- **Handle message filtering** for private messages
- **Maintain message format** standards

## 🔧 **Implementation Checklist**

Use this checklist when implementing new features:

### **For Each Command:**
- [ ] Read relevant documentation section
- [ ] Check current implementation in backend
- [ ] Verify parameter parsing matches docs
- [ ] Test error conditions
- [ ] Update help system if needed
- [ ] Test with real data

### **For Each Feature:**
- [ ] Understand original behavior from docs
- [ ] Plan web-specific enhancements
- [ ] Implement core functionality
- [ ] Add modern improvements
- [ ] Update documentation
- [ ] Test thoroughly

## 📋 **Key Implementation Notes**

### **Command Structure**
- All commands are single letters (A, R, J, F, etc.)
- Parameters follow commands separated by spaces
- Commands are case-insensitive
- Invalid commands should show error messages

### **State Management**
- BBS has three main states: AWAIT, LOGON, LOGGEDON
- LOGGEDON has 11 substates for different operations
- State transitions must follow documented flow
- menuPause controls when menus are displayed

### **File Areas**
- Organized by conference (DIR1, DIR2, etc.)
- Support for upload/download directories
- FILE_ID.DIZ integration for descriptions
- New files scanning with date parameters

### **Message System**
- Public messages in conferences/message bases
- Private messages between users
- Reply threading support
- Rich display with indicators

### **User Interface**
- ANSI color codes for formatting
- Screen clearing before command output
- Consistent prompt formatting
- Real-time updates where beneficial

## 🚀 **Quick Reference**

### **Most Important Commands to Implement**
1. **R** - Read Messages (core functionality)
2. **A** - Post Message (public posting)
3. **E** - Private Message (enhanced messaging)
4. **J** - Join Conference (navigation)
5. **F** - File Areas (file management)
6. **O** - Online Users (social feature)

### **Critical State Management**
- `DISPLAY_BULL` → `DISPLAY_CONF_BULL` → `DISPLAY_MENU` → `READ_COMMAND`
- Proper menuPause handling
- Command buffer management
- Session state persistence

### **File System Structure**
```
BBS:CONF1/DIR1/     # Conference 1, File Area 1
BBS:CONF1/DIR2/     # Conference 1, File Area 2
BBS:CONF2/DIR1/     # Conference 2, File Area 1
```

## 📖 **Additional Resources**

- **AmiExpress Source Code**: Available in `AmiExpress/` directory
- **Web Port Implementation**: See `backend/src/index.ts`
- **Frontend Interface**: See `amiexpress-web/src/App.tsx`
- **Project Status**: See root `PROJECT_STATUS.md`

## 🤝 **Contributing**

When implementing new features:
1. **Reference these docs first**
2. **Maintain backward compatibility**
3. **Add modern enhancements thoughtfully**
4. **Update this documentation**
5. **Test thoroughly**

---

*These documents are the foundation for creating an authentic AmiExpress Web experience. Use them wisely to preserve the classic BBS feel while embracing modern web capabilities.*