# QuestSage Setup Guide

## Quick Setup

### 1. Set up Environment Variables

Copy the template file and configure your API keys:

```bash
cp config.template.env .env
```

Then edit the `.env` file with your actual API keys.

### 2. Required API Keys

#### **For Basic Functionality (Dev Mode):**
- `GEMINI_API_KEY` - Already set to: `AIzaSyAOyBAL8U5zeFPRKqvUJ4d9ZRbJz_zm8TI`

#### **For Production Mode:**
- `OPENAI_API_KEY` - Get from [OpenAI Platform](https://platform.openai.com/api-keys)
- `ANTHROPIC_API_KEY` - Get from [Anthropic Console](https://console.anthropic.com/settings/keys)
- `GEMINI_API_KEY` - Get from [Google AI Studio](https://aistudio.google.com/app/apikey)

#### **For Enhanced Search (Optional):**
- `GOOGLE_SEARCH_API_KEY` - Get from [Google Cloud Console](https://console.developers.google.com/)
- `PERPLEXITY_API_KEY` - Get from [Perplexity AI](https://www.perplexity.ai/settings/api)

#### **For Social Media Research (Optional):**
- `REDDIT_CLIENT_ID` & `REDDIT_CLIENT_SECRET` - Get from [Reddit Apps](https://www.reddit.com/prefs/apps)

### 3. Install Dependencies

```bash
npm install
```

### 4. Start the Application

```bash
npm run dev
```

## Environment Configuration

### Development Mode
- Uses Gemini Flash 2.5 for fast, cost-effective LLM calls
- Minimal API requirements
- Good for testing and development

### Production Mode
- Uses premium models (GPT-4o, Claude Sonnet, Gemini Pro)
- Requires all LLM API keys
- Optimized for research quality

## API Key Configuration

### Current Setup
The Gemini API key is already configured in the template:
```
GEMINI_API_KEY=AIzaSyAOyBAL8U5zeFPRKqvUJ4d9ZRbJz_zm8TI
```

### Adding Additional Keys
Edit your `.env` file and replace the placeholder values:

```bash
# Example configuration
OPENAI_API_KEY=sk-proj-your-key-here
ANTHROPIC_API_KEY=sk-ant-your-key-here
GOOGLE_SEARCH_API_KEY=your-google-key-here
```

## Troubleshooting

### "Gemini not configured" Error
- Make sure you've copied `config.template.env` to `.env`
- Verify the `GEMINI_API_KEY` is set correctly
- Restart the server after changing environment variables

### Missing API Keys
- The app will fall back to mock responses if API keys are missing
- Check the console for warnings about missing configurations
- Refer to the links above to get the required API keys

## Security Notes

- Never commit your `.env` file to version control
- The `.env` file is already in `.gitignore`
- Keep your API keys secure and rotate them regularly
- Use environment-specific keys for development vs production
