#!/bin/bash

# QuestSage Environment Setup Script
echo "Setting up QuestSage environment..."

# Check if .env already exists
if [ -f .env ]; then
    echo "⚠️  .env file already exists!"
    echo "To reset, delete it first: rm .env"
    exit 1
fi

# Create .env file with default values
cat > .env << EOF
# QuestSage Configuration
NODE_ENV=development
PORT=3000

# LiteLLM Configuration
LITE_LLM_PROXY_ARCHIE_BACKFILL=your_litellm_api_key_here
DEFAULT_MODEL=gpt-4o-mini
FLASH_MODEL=gemini/gemini-2.5-flash
PRO_MODEL=gemini/gemini-2.5-pro

# Search Configuration
SEARCH_TERMS_LIMIT=10
WEB_RESULTS_PER_TERM=10
ARXIV_RESULTS_PER_TERM=10
REDDIT_SUBREDDITS_LIMIT=5
REDDIT_POSTS_PER_SUBREDDIT=50
REDDIT_COMMENTS_PER_POST=100

# API Keys (Optional - for specific providers)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
PERPLEXITY_API_KEY=

# Reddit API (Optional - for enhanced Reddit search)
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_USER_AGENT=QuestSage/1.0

# Rate Limiting
MAX_REQUESTS_PER_MINUTE=60
EOF

echo "✅ Created .env file with default values"
echo ""
echo "⚠️  IMPORTANT: Edit .env and add your API keys:"
echo "   - LITE_LLM_PROXY_ARCHIE_BACKFILL (required for LiteLLM)"
echo "   - Other API keys are optional"
echo ""
echo "To edit: nano .env"