# Grumpy Bot Enhancements - Implementation Summary

## Overview

Implemented two major enhancements to the grumpy sysop chatbot:

1. **Multi-tier AI fallback system** (Groq → Gemini → OpenRouter)
2. **BBS help knowledge base** with grumpy but helpful responses

---

## 1. Multi-Tier AI Fallback System

### Architecture

The bot now tries multiple free AI providers in cascading order:

```
Tier 1: Groq (fastest)
   ↓ fail
Tier 2: Google Gemini (best quality)
   ↓ fail
Tier 3: OpenRouter (auto-discovered free models)
   ↓ fail
Tier 4: Rule-based responses (200+ grumpy responses)
```

### Provider Details

**Tier 1 - Groq**
- Model: `llama-3.1-8b-instant`
- Speed: Fastest (100+ tokens/sec)
- Free tier: 14,400 requests/day
- Timeout: 8 seconds
- API key: `GROQ_API_KEY` (optional)
- Get key: https://console.groq.com/keys

**Tier 2 - Google Gemini**
- Model: `gemini-1.5-flash`
- Speed: Fast
- Free tier: 60 requests/minute, no credit card required
- Timeout: 10 seconds
- API key: `GEMINI_API_KEY` (optional)
- Get key: https://aistudio.google.com/app/apikey

**Tier 3 - OpenRouter**
- Models: Auto-discovered free models (refreshed hourly)
- Speed: Varies by model
- Free tier: Depends on discovered model
- Timeout: 10 seconds
- API key: None required (uses public model discovery)

**Tier 4 - Rule-based**
- No API calls
- 200+ responses across 14 categories
- Always available as ultimate fallback

### Environment Variables

All API keys are **OPTIONAL**. Add to `.env.local`:

```bash
# Groq API Key (OPTIONAL - Free tier, fastest responses)
GROQ_API_KEY=your_groq_api_key_here

# Google Gemini API Key (OPTIONAL - Free tier, best quality)
GEMINI_API_KEY=your_gemini_api_key_here
```

### Implementation Files

- **Modified**: `web/backend/src/handlers/grumpy-sysop-bot.handler.ts`
  - Added `getGroqResponse()` - Groq API integration
  - Added `getGeminiResponse()` - Gemini API integration
  - Modified `getAIResponse()` - Cascading fallback logic
  - All AI providers receive `BBS_HELP_KNOWLEDGE` in system prompt

- **Modified**: `.env.example`
  - Added `GROQ_API_KEY` documentation
  - Added `GEMINI_API_KEY` documentation
  - Updated operator chat section with multi-tier explanation

---

## 2. BBS Help Knowledge Base

### Knowledge Source

Extracted command reference from AmiExpress wiki:
https://github.com/dmcoles/AmiExpress/wiki/Main-Menu-Commands

### BBS Help Categories

Added 7 new help categories with 5 grumpy but helpful responses each:

1. **messages** - Reading, posting, scanning messages
   - Commands: R, E, MS, << >>, ZOOM
   - Example: "How do I read messages?"

2. **files** - File browsing, downloading, uploading
   - Commands: F, FR, N, D, U, RZ, A, Z, FS
   - Example: "How do I download files?"

3. **doors** - Door games and how to access them
   - Commands: Type "DOORS" to see list of installed games/tools
   - Example: "How do I play door games?"

4. **navigation** - Conference and message base navigation
   - Commands: J, JM, < >, CF
   - Example: "How do I switch conferences?"

5. **general** - Basic BBS commands
   - Commands: ?, H, B, S, T, WHO, M, G
   - Example: "What are the commands?"

6. **expert** - Expert mode toggle
   - Commands: X
   - Example: "What is expert mode?"

7. **ratios** - Upload/download ratios
   - Commands: FS
   - Example: "What's a ratio?"

### Pattern Matching

Added intelligent regex patterns to detect BBS help questions:

```typescript
// Detects: "how do i read messages", "where are messages", "message command"
/how (do|can) i (read|view|see|check) message|where (are|is) message|message command|read mail|read msg/i

// Detects: "how do i download files", "file command", "ratio", "new files"
/how (do|can) i (download|upload|get|send) file|file command|dl|ul|transfer|ratio|new files/i

// ... and 5 more categories
```

### Response Style

All BBS help responses follow the grumpy but helpful pattern:

**Format**: Complain → Give answer → Reference classic BBS era

**Examples**:

```
"*rolls eyes* Press R to read messages. E to enter a message.
MS to scan ALL conferences for new messages. It's not rocket science."

"Files. Right. F lists 'em, N shows new files, D downloads, U uploads.
Try to keep your ratio above 1:10 or I'll notice."

"Expert mode? Press X to toggle it. It hides the menus and just shows
prompts. For 1337 users only. You're probably not ready."
```

### AI Integration

All AI providers (Groq, Gemini, OpenRouter) receive the BBS help knowledge:

```typescript
const messages = [
  { role: 'system', content: GRUMPY_SYSOP_PERSONALITY },
  { role: 'system', content: BBS_HELP_KNOWLEDGE },  // <-- BBS commands reference
  { role: 'system', content: `User context: ...` },
  // ... conversation history
];
```

This allows AI to:
- Answer specific BBS command questions accurately
- Reference actual command syntax
- Maintain grumpy personality while being helpful
- Fall back to specific commands when unsure

---

## Testing

### Verify Multi-Tier Fallback

Test each tier individually:

```bash
# Test with no API keys (should use rule-based)
# Remove GROQ_API_KEY and GEMINI_API_KEY from .env.local
# Trigger operator chat timeout
# Bot should respond with rule-based responses

# Test with Groq only
export GROQ_API_KEY=your_key_here
# Bot should log: "[Grumpy Bot] SUCCESS - Using Groq response"

# Test with Gemini only
export GEMINI_API_KEY=your_key_here
# Bot should log: "[Grumpy Bot] SUCCESS - Using Gemini response"

# Test cascade (Groq fails → tries Gemini)
export GROQ_API_KEY=invalid_key
export GEMINI_API_KEY=valid_key
# Bot should log: "[Grumpy Bot] Groq failed: ..." then
#                  "[Grumpy Bot] SUCCESS - Using Gemini response"
```

### Verify BBS Help Responses

Test help questions via operator chat:

```
User: "how do i read messages"
Bot: "*rolls eyes* Press R to read messages. E to enter a message. MS to scan ALL conferences for new messages. It's not rocket science."

User: "what are the commands"
Bot: "? shows the menu in expert mode. H is help. B reads bulletins (which you SHOULD read). S shows your account status."

User: "how do i download files"
Bot: "Files. Right. F lists 'em, N shows new files, D downloads, U uploads. Try to keep your ratio above 1:10 or I'll notice."

User: "how do i play door games"
Bot: "Door games? Type DOORS to see the list. We got TradeWars, LoRD, all the classics. Try not to break 'em."
```

### Check Logs

Monitor backend logs for fallback behavior:

```bash
tail -f logs/backend.log | grep "Grumpy Bot"
```

Expected log output:
```
[Grumpy Bot] Trying Groq (llama-3.1-8b-instant)...
[Grumpy Bot] SUCCESS - Using Groq response
```

Or if Groq fails:
```
[Grumpy Bot] Trying Groq (llama-3.1-8b-instant)...
[Grumpy Bot] Groq failed: Request failed with status code 401
[Grumpy Bot] Trying Gemini (gemini-1.5-flash)...
[Grumpy Bot] SUCCESS - Using Gemini response
```

Or if all AI fails:
```
[Grumpy Bot] Trying Groq (llama-3.1-8b-instant)...
[Grumpy Bot] Groq failed: ...
[Grumpy Bot] Trying Gemini (gemini-1.5-flash)...
[Grumpy Bot] Gemini failed: ...
[Grumpy Bot] Trying OpenRouter (meta-llama/llama-3-8b-instruct:free)...
[Grumpy Bot] OpenRouter failed: ...
[Grumpy Bot] All AI providers failed, falling back to rule-based
[Grumpy Bot] Using rule-based response
```

---

## Performance Characteristics

### Response Times

| Tier | Provider | Typical Response Time | Free Tier Limit |
|------|----------|----------------------|-----------------|
| 1 | Groq | 200-500ms | 14,400 req/day |
| 2 | Gemini | 1-2 seconds | 60 req/min |
| 3 | OpenRouter | 2-5 seconds | Varies by model |
| 4 | Rule-based | <1ms | Unlimited |

### Reliability

- **Groq**: Very high uptime, fast, generous free tier
- **Gemini**: High uptime, good quality, no credit card required
- **OpenRouter**: Variable (depends on which free model is available)
- **Rule-based**: 100% reliable, instant, covers all scenarios

### Cost

All tiers are **completely free**:
- Groq: Free tier with 14,400 requests/day
- Gemini: Free tier with 60 requests/minute
- OpenRouter: Auto-discovers free models (no paid requests)
- Rule-based: No API calls, zero cost

---

## Response Quality

### With AI (Groq/Gemini)

**Pros**:
- Natural, varied conversation
- Handles complex questions
- Maintains personality across long conversations
- Can answer obscure BBS questions using knowledge base

**Cons**:
- Requires API key (optional)
- Slight latency (200ms-2s)
- May occasionally go off-script

### With Rule-Based

**Pros**:
- Instant responses (<1ms)
- Guaranteed grumpy personality
- No API keys needed
- 200+ unique responses prevent repetition
- Context-aware (time of day, user experience)
- Handles all common BBS questions

**Cons**:
- Pattern matching can miss nuanced questions
- Less flexible than AI for edge cases

---

## Migration Notes

### No Breaking Changes

This update is **100% backward compatible**:

- Existing bot continues to work without any API keys
- OpenRouter auto-discovery still works as before
- Rule-based responses enhanced but still functional
- All existing operator chat features unchanged

### Optional API Keys

The new API keys are **completely optional**:

- Bot works perfectly fine without them
- Each tier gracefully skips if no key provided
- Ultimate fallback to rule-based always succeeds
- No errors or warnings if keys are missing

### Recommended Setup

For best results, configure at least one API key:

```bash
# Fastest responses - use Groq
GROQ_API_KEY=your_groq_key

# Best quality - use Gemini
GEMINI_API_KEY=your_gemini_key

# Both for redundancy
GROQ_API_KEY=your_groq_key
GEMINI_API_KEY=your_gemini_key
```

But the bot works great even with **zero** API keys!

---

## Future Enhancements

Potential improvements:

1. **Expand BBS knowledge**:
   - Add MCI codes reference
   - Include troubleshooting tips
   - Door-specific help (TradeWars, LoRD)

2. **More AI providers**:
   - Cohere (1000 free requests/month)
   - Together AI (free tier available)
   - Mistral (free tier)

3. **Context enhancement**:
   - Remember user's past questions in session
   - Personalize responses based on user level
   - Detect frustration and adjust tone

4. **Analytics**:
   - Track which tier responds most often
   - Monitor fallback cascade patterns
   - Log common user questions for response improvement

---

## Summary

### What Changed

1. **Files Modified**:
   - `web/backend/src/handlers/grumpy-sysop-bot.handler.ts` (major refactor)
   - `.env.example` (added GROQ_API_KEY, GEMINI_API_KEY)

2. **New Features**:
   - Multi-tier AI fallback (Groq → Gemini → OpenRouter)
   - BBS help knowledge base (7 categories, 35+ responses)
   - Intelligent pattern matching for help questions
   - All AI providers receive BBS command reference

3. **Improvements**:
   - Faster responses (Groq averages 200-500ms)
   - Better quality (Gemini for complex questions)
   - More reliable (3 AI tiers + rule-based fallback)
   - More helpful (can answer specific BBS command questions)
   - Still 100% free (all APIs have generous free tiers)

### What Didn't Change

- Existing operator chat flow (timeout → bot takes over)
- Natural typing simulation (still works the same)
- Grumpy personality (maintained across all tiers)
- Rule-based fallback (enhanced with BBS help, still reliable)
- Zero configuration required (works without any API keys)

---

## Credits

- **BBS Commands Reference**: AmiExpress wiki by Darren Coles
  https://github.com/dmcoles/AmiExpress/wiki/Main-Menu-Commands

- **AI Providers**:
  - Groq: https://groq.com
  - Google Gemini: https://ai.google.dev
  - OpenRouter: https://openrouter.ai

- **Implementation**: Claude Code (Sonnet 4.5)
  Session: 2025-12-16
