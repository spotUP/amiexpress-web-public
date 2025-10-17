# AmiExpress Web - Implementation Guide

This guide provides practical implementation instructions for porting AmiExpress features to the web version, using the official documentation as reference.

## 🎯 **Command Implementation Template**

### **Template for New Commands**

```typescript
case 'X': // Command Name (internalCommandX)
  // 1. Clear screen (authentic BBS behavior)
  socket.emit('ansi-output', '\x1b[2J\x1b[H');

  // 2. Show command header
  socket.emit('ansi-output', '\x1b[36m-= Command Title =-\x1b[0m\r\n');

  // 3. Implement command logic based on docs
  // ... command-specific logic ...

  // 4. Show results or prompt for input
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');

  // 5. Set appropriate state
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
  return; // Don't call displayMainMenu
```

## 📋 **Priority Implementation Order**

### **Phase 1: Core BBS Functionality (Essential)**
1. **R** - Read Messages *(COMPLETED)*
2. **A** - Post Message *(COMPLETED)*
3. **J** - Join Conference *(COMPLETED)*
4. **F** - File Areas *(COMPLETED)*
5. **G** - Goodbye *(COMPLETED)*
6. **?** - Help *(COMPLETED)*

### **Phase 2: Enhanced Features (High Value)**
7. **E** - Private Message *(COMPLETED)*
8. **O** - Online Users *(COMPLETED)*
9. **T** - System Time *(COMPLETED)*
10. **FS** - File Status *(COMPLETED)*
11. **N** - New Files *(COMPLETED)*
12. **FR** - File Areas Reverse *(COMPLETED)*

### **Phase 3: Advanced Features (Future)**
13. **JM** - Join Message Base
14. **FM** - File Maintenance *(COMPLETED - FM D/M/S fully implemented)*
15. **1-5** - Sysop Commands
16. **C** - Comment to Sysop
17. **Q** - Quick Logoff

## 🔧 **Implementation Patterns**

### **1. Parameter Parsing**
```typescript
// Use parseParams() for consistent parameter handling
const parsedParams = parseParams(params);
// parsedParams[0] = first parameter, etc.
```

### **2. State Management**
```typescript
// For commands that need user input:
session.subState = LoggedOnSubState.CONFERENCE_SELECT;
return; // Stay in input mode

// For commands that complete immediately:
session.menuPause = false;
session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
```

### **3. Error Handling**
```typescript
if (errorCondition) {
  socket.emit('ansi-output', '\r\n\x1b[31mError message from docs\x1b[0m\r\n');
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
  return;
}
```

### **4. File Area Operations**
```typescript
// Get current conference file areas
const currentFileAreas = fileAreas.filter(area => area.conferenceId === session.currentConf);

// Handle directory selection
const dirSpan = getDirSpan(params, currentFileAreas.length);
if (dirSpan.startDir === -1) {
  // Handle invalid selection
}
```

## 📚 **Key Documentation References**

### **For Each Command Implementation:**

1. **Check [Main Menu Commands](main_menu.md)** for exact behavior
2. **Verify parameter formats** (e.g., date formats, directory selections)
3. **Implement error messages** as specified
4. **Handle edge cases** mentioned in docs

### **State Management:**
- **Reference [Program Logic](program_logic.md)** for state flow
- **Maintain substate sequence** for user journey
- **Handle menuPause correctly**

### **File System:**
- **Study DIR structure** in documentation
- **Implement conference-specific** file areas
- **Support FILE_ID.DIZ** extraction

## 🧪 **Testing Checklist**

### **For Each New Command:**
- [ ] **Basic functionality** works as documented
- [ ] **Parameter parsing** handles all documented formats
- [ ] **Error conditions** show appropriate messages
- [ ] **State transitions** work correctly
- [ ] **Menu display** behaves properly (menuPause logic)
- [ ] **Edge cases** from documentation are handled

### **Integration Testing:**
- [ ] **Command sequence** works (e.g., J → F → R)
- [ ] **State persistence** across commands
- [ ] **Session management** works correctly
- [ ] **Real-time updates** function properly

## 🚀 **Quick Implementation Examples**

### **Simple Command (T - System Time):**
```typescript
case 'T':
  socket.emit('ansi-output', '\x1b[2J\x1b[H');
  socket.emit('ansi-output', '\x1b[36m-= System Time =-\x1b[0m\r\n');
  const now = new Date();
  socket.emit('ansi-output', `Current system time: ${now.toLocaleString()}\r\n`);
  socket.emit('ansi-output', `System uptime: ${Math.floor(process.uptime())} seconds\r\n`);
  socket.emit('ansi-output', `Your session time remaining: ${Math.floor(session.timeRemaining)} minutes\r\n`);
  break;
```

### **Interactive Command (J - Join Conference):**
```typescript
case 'J':
  socket.emit('ansi-output', '\x1b[2J\x1b[H');
  socket.emit('ansi-output', '\x1b[36m-= Join Conference =-\x1b[0m\r\n');
  socket.emit('ansi-output', 'Available conferences:\r\n');
  conferences.forEach(conf => {
    socket.emit('ansi-output', `${conf.id}. ${conf.name} - ${conf.description}\r\n`);
  });

  if (params.trim()) {
    // Direct parameter - process immediately
    const confId = parseInt(params.trim());
    // ... process conference join ...
  } else {
    // No params - prompt for input
    socket.emit('ansi-output', '\r\n\x1b[32mConference number: \x1b[0m');
    session.subState = LoggedOnSubState.CONFERENCE_SELECT;
    return;
  }
  break;
```

### **Complex Command (F - File Areas):**
```typescript
case 'F':
  displayFileList(socket, session, params, false);
  return;
```

## 📊 **Progress Tracking**

### **Current Status (Phase 1 Complete):**
- ✅ Core BBS state management
- ✅ Basic command structure
- ✅ Message system foundation
- ✅ File area framework
- ✅ User interface consistency

### **Next Steps (Phase 2):**
- [ ] Implement remaining interactive commands
- [ ] Add file upload/download functionality
- [ ] Enhance user account management
- [ ] Add door game integration

### **Future Goals (Phase 3):**
- [ ] Sysop administration tools
- [ ] Advanced file operations
- [ ] Network message support
- [ ] Protocol implementations

## 🔍 **Debugging Tips**

### **Common Issues:**
1. **State not updating**: Check subState assignments
2. **Menu not displaying**: Verify menuPause logic
3. **Commands not responding**: Check command parsing
4. **Real-time issues**: Verify socket event handling

### **Debug Commands:**
```typescript
// Add to any command for debugging
console.log('Command:', command, 'Params:', params);
console.log('Session state:', session.state, 'SubState:', session.subState);
console.log('Current conf:', session.currentConf, 'MsgBase:', session.currentMsgBase);
```

## 📖 **Additional Resources**

- **[Main Menu Commands](main_menu.md)** - Complete command reference
- **[Program Logic](program_logic.md)** - State management guide
- **[Notable Features](features.md)** - Advanced capabilities
- **Backend Implementation** - `backend/src/index.ts`
- **Frontend Interface** - `amiexpress-web/src/App.tsx`

---

*Use this guide alongside the official AmiExpress documentation to ensure faithful and complete feature implementation.*