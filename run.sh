#!/bin/bash

# QuestSage Quick Run Script
echo "🚀 Starting QuestSage..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚠️  No .env file found!"
    echo "Creating default .env file..."
    ./setup-env.sh
    echo ""
    echo "❗ IMPORTANT: Please edit .env and add your LITE_LLM_PROXY_ARCHIE_BACKFILL API key"
    echo "Then run this script again."
    exit 1
fi

# Check if API key is set
if grep -q "your_litellm_api_key_here" .env; then
    echo "❌ ERROR: LiteLLM API key not configured!"
    echo "Please edit .env and replace 'your_litellm_api_key_here' with your actual API key"
    exit 1
fi

# Start the application
echo "✅ Starting QuestSage..."
echo ""
npm run dev
