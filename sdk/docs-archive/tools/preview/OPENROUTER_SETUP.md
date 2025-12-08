# OpenRouter Free Models Setup Guide

## What is OpenRouter?

OpenRouter provides unified API access to 400+ AI models from various providers. They offer many models completely **free** (no credit card required), making it perfect for game generation in the AI Game Wizard.

## Quick Setup (2 minutes)

### Step 1: Create Free Account
1. Go to https://openrouter.ai/
2. Click "Sign In" (top right)
3. Sign up with Google, GitHub, or email (no credit card needed)

### Step 2: Configure Privacy Settings (Important!)
1. Navigate to https://openrouter.ai/settings/privacy
2. Under "Data Policy", enable at least one of these:
   - **"Enable free endpoints that may train on inputs"** - For most free models
   - **"Enable paid endpoints that may train on inputs"** - For some free models with `:free` suffix

   **Recommendation:** Enable both checkboxes to access all available models

   Note: Your prompts will be used to improve AI models (standard for free tiers)

### Step 3: Get Your API Key
1. Navigate to https://openrouter.ai/keys
2. Click "Create Key"
3. Give it a name (e.g., "AmiExpress Game Wizard")
4. Copy your API key (starts with `sk-or-...`)

### Step 4: Use in AI Game Wizard
1. Open the AI Game Wizard in the preview server
2. Select "OpenRouter (Free Models)" as your AI provider
3. Paste your API key when prompted
4. Select from 14+ free models!

## Available Free Models

The wizard automatically fetches the latest free models via the OpenRouter API. As of now, this includes:

### Text Generation Models
- **Llama 4 Maverick** (400B total, 17B active) - Massive mixture-of-experts model
- **Mistral Small 3.1** (24B) - Excellent for coding tasks
- **DeepSeek Chat v3** - Specialized in code generation
- **Google Gemma 3** (4B, 12B, 27B variants) - Fast and efficient
- **Llama 3.2** (1B, 3B) - Lightweight but capable

### Vision-Capable Models
- **Llama 3.2 Vision** (11B) - Multimodal with vision
- **Qwen 2.5 VL** (32B, 72B) - Advanced vision understanding
- **Kimi VL** - Vision with reasoning capabilities

### Google Models via OpenRouter
- **Gemini Flash 1.5** - Ultra-fast responses
- **Gemini Pro 1.5** - High-quality generation

## Benefits vs Other Providers

| Feature | OpenRouter Free | Claude | OpenAI | Gemini Direct |
|---------|----------------|--------|--------|---------------|
| Cost | $0 | ~$0.015/1K | ~$0.03/1K | $0 |
| Credit Card | ❌ No | ✅ Required | ✅ Required | ❌ No |
| Model Variety | 14+ models | 3 models | 3 models | 3 models |
| Auto-Updates | ✅ Via API | ❌ Manual | ❌ Manual | ❌ Manual |
| Max Model Size | 400B (Llama 4) | N/A | N/A | N/A |

## How "Free" Works

OpenRouter's free models are:
- **Truly free**: $0 per token, no hidden costs
- **No trial period**: Free forever
- **Rate limited**: Fair usage limits to prevent abuse
- **Opt-in data training**: Free models require allowing your prompts to be used for training (standard for free tiers)

## Authentication

Free models still require an API key for:
- Rate limiting and fair usage
- Preventing abuse and spam
- Usage analytics
- Model routing

This is standard across all AI providers, even free ones.

## Environment Variable (Optional)

For server-side configuration, set:

```bash
export OPENROUTER_API_KEY="sk-or-v1-..."
```

Or in `.env`:
```
OPENROUTER_API_KEY=sk-or-v1-...
```

## Troubleshooting

### "No endpoints found matching your data policy"
**Most common issue!** This means you need to enable additional privacy settings.

**If error says "(Paid model training)":**
1. Go to https://openrouter.ai/settings/privacy
2. Check **"Enable paid endpoints that may train on inputs"**
3. Try your request again
   - Note: Some models with `:free` suffix still require this setting

**If error doesn't specify:**
1. Go to https://openrouter.ai/settings/privacy
2. Check **both** training checkboxes:
   - "Enable free endpoints that may train on inputs"
   - "Enable paid endpoints that may train on inputs"
3. Try your request again

**Alternative:** Try a different free model from the dropdown

### "No API key provided"
- Make sure you've copied the full key (starts with `sk-or-`)
- Check for extra spaces when pasting

### "Rate limit exceeded"
- OpenRouter free tier has fair usage limits
- Wait a few minutes and try again
- Consider spreading requests over time

### "Model not found"
- The wizard fetches current free models dynamically
- If a model is removed from the free tier, it won't appear
- Try selecting a different free model

## API Documentation

- OpenRouter Docs: https://openrouter.ai/docs
- Models API: https://openrouter.ai/docs/api-reference/models/get-models
- Rate Limits: https://openrouter.ai/docs/limits

## Support

- OpenRouter Discord: https://discord.gg/openrouter
- GitHub Issues: https://github.com/OpenRouterTeam/openrouter-docs/issues
- Email: support@openrouter.ai

---

**Pro Tip**: The AI Game Wizard automatically fetches the latest free models from OpenRouter's API, so you'll always have access to the newest free models without updating any code!
