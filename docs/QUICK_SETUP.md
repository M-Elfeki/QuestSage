# Quick Setup Guide

## ✅ No Database Required!

The app now runs entirely in-memory without requiring any database setup. All data is stored temporarily in memory during the session.

## 🚀 Quick Start

1. **Install Dependencies**: `npm install`
2. **Start Development Server**: `npm run dev`
3. **Open Browser**: Navigate to `http://localhost:3000`

## 🔧 Configuration

- **Environment Variables**: Copy `config.template.env` to `.env` and configure your API keys
- **API Keys**: Set up OpenAI, Gemini, Anthropic, and Perplexity API keys for full functionality
- **In-Memory Storage**: All data is stored in memory and cleared when the server restarts

## 📁 Project Structure

- **Client**: React + TypeScript frontend with modern UI components
- **Server**: Express.js backend with in-memory data storage
- **Services**: LLM integration, search services, and workflow orchestration
- **No Database**: Runs entirely in-memory for simplicity

## 🎯 Features

- ✅ Intent clarification with AI-powered questions
- ✅ Multi-source research (web, arXiv, Reddit)
- ✅ AI agent dialogue and synthesis
- ✅ In-memory data storage (no setup required)
- ✅ Modern React UI with Tailwind CSS

## 🚨 Troubleshooting

- **Port Conflicts**: Change port in `server/index.ts` if 3000 is busy
- **API Key Issues**: Verify all API keys are set in `.env`
- **Memory Usage**: App uses in-memory storage - restart server to clear data
