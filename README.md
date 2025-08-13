# QuestSage: Multi-Agent Research Synthesis System

QuestSage is a sophisticated multi-agent research synthesis system that combines AI agents with comprehensive research capabilities to provide high-quality, evidence-based analysis on complex topics. The system operates in two distinct modes: **Development** and **Production**, each optimized for different use cases.

## 🎯 System Purpose

QuestSage is designed to generate high-quality, research-backed insights by orchestrating multiple AI agents through a structured research pipeline. It's particularly effective for complex research questions that require:

- **Multi-source evidence synthesis** (academic papers, industry reports, social media, deep research)
- **Agent-based dialogue** for comprehensive analysis
- **Evidence quality assessment** and contradiction detection
- **Structured research workflows** with human-in-the-loop oversight

## 🏗️ Architecture Overview

The system follows a **two-tier LLM architecture**:

- **Flash LLM**: Fast, cost-effective processing for initial analysis, fact extraction, and surface research
- **Pro LLM**: High-quality, strategic analysis for complex reasoning, agent orchestration, and final synthesis

### Core Components

- **Frontend**: React-based UI with real-time research progress tracking and modern Tailwind CSS design
- **Backend**: Express.js server with modular service architecture and in-memory storage
- **AI Services**: OpenAI, Google Gemini, Anthropic Claude integration with rate limiting
- **Search Services**: Google Search, arXiv, Reddit, Perplexity Deep Search
- **Testing**: Comprehensive Vitest test suite with mock API responses

## 🔄 Development vs Production Modes

### Development Mode (`dev`)
- **Purpose**: Testing, development, and demonstration without external API costs
- **Features**:
  - Mock data generation for all research stages
  - Simulated AI responses with realistic delays
  - No external API calls or costs
  - Perfect for development, testing, and demos
- **Use Cases**: Development, testing, demonstrations, cost-free exploration

### Production Mode (`prod`)
- **Purpose**: Real research with live data and AI services
- **Features**:
  - Live API calls to search engines and AI services
  - Real-time data collection and analysis
  - Actual cost implications for API usage
  - Production-grade research capabilities
- **Use Cases**: Real research projects, client work, production deployments

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+** 
- **npm** or **yarn**
- **No database required** - runs entirely in-memory

### 1. **Clone and Install**
```bash
git clone https://github.com/M-Elfeki/QuestSage.git
cd QuestSage
npm install
```

### 2. **Environment Configuration**
Copy the template and configure your API keys:
```bash
cp config.template.env .env
```

**Required for Basic Functionality:**
```bash
# Gemini API Key (required for dev mode)
GEMINI_API_KEY=your_gemini_key_here

# Application Mode
NODE_ENV=development
PORT=3000
```

**Required for Production Mode:**
```bash
# OpenAI Configuration
OPENAI_API_KEY=your_openai_key_here
OPENAI_MODEL=gpt-4o-mini

# Google Gemini Configuration  
GEMINI_API_KEY=your_gemini_key_here
GEMINI_MODEL=gemini-flash-2.5

# Anthropic Configuration
ANTHROPIC_API_KEY=your_anthropic_key_here
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# Perplexity Configuration
PERPLEXITY_API_KEY=your_perplexity_key_here
```

### 3. **Start the Application**

#### Development Mode (Recommended for first run)
```bash
npm run dev
```
- **Frontend**: http://localhost:5173 (Vite dev server)
- **Backend**: http://localhost:3000 (Express API)
- **Hot reloading** enabled
- **Mock data** for testing without API costs

#### Production Mode
```bash
# Build the application
npm run build

# Start production server
npm start
```
- **Single port**: http://localhost:5000 (or your configured PORT)
- **Optimized** for production
- **Requires all API keys** to be configured

### 4. **Access the Application**
Open your browser and navigate to:
- **Dev Mode**: http://localhost:5173
- **Prod Mode**: http://localhost:5000 (or your configured PORT)

## 🔧 Current Features

### ✅ **Implemented & Working**
- **Intent Clarification**: AI-powered query analysis and clarifying questions
- **Multi-Source Research**: Web search, arXiv papers, Reddit discussions
- **Fact Extraction**: AI-powered claim extraction with confidence scoring
- **Agent Selection**: Dynamic AI agent configuration (ChatGPT & Gemini)
- **Multi-Agent Dialogue**: Structured conversations between AI agents
- **Research Synthesis**: Final report generation with evidence attribution
- **Dynamic UI Metrics**: Real-time updates of research findings and source quality
- **Markdown Rendering**: Beautiful formatting for agent dialogue responses
- **Rate Limiting**: Intelligent API quota management with retry logic
- **In-Memory Storage**: No database setup required

### 🔄 **UI/UX Features**
- **Continuous Flow**: Completed stages remain visible in "frozen" state
- **Smooth Transitions**: Progressive disclosure with aesthetic appeal
- **Real-time Updates**: Dynamic metrics that update based on research data
- **Responsive Design**: Modern Tailwind CSS with mobile-friendly layout
- **Progress Tracking**: Visual indicators for each research stage

### 🧪 **Testing Infrastructure**
- **Comprehensive Test Suite**: 10+ test files covering all major functionality
- **Mock API Responses**: No external API calls during testing
- **LLM Integration Tests**: Model-specific behavior validation
- **Workflow Tests**: End-to-end pipeline testing
- **Coverage Reporting**: Detailed test coverage analysis

## 📁 Project Structure

```
QuestSage/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # UI components
│   │   ├── pages/         # Page components
│   │   ├── hooks/         # Custom React hooks
│   │   └── lib/           # Frontend utilities
│   ├── index.html         # Entry point
│   └── vite.config.ts     # Vite configuration
├── server/                 # Express.js backend
│   ├── services/          # Core services
│   │   ├── llm.ts         # AI service integration
│   │   ├── search.ts      # Search engine services
│   │   ├── agents.ts      # AI agent management
│   │   ├── rate-limiter.ts # API rate limiting
│   │   └── config.ts      # Configuration management
│   ├── routes.ts          # API endpoints
│   └── index.ts           # Server entry point
├── tests/                  # Comprehensive test suite
│   ├── llm-integration.test.ts    # LLM service tests
│   ├── model-specific.test.ts     # Model behavior tests
│   ├── workflow-integration.test.ts # End-to-end tests
│   ├── search tests (arxiv, reddit, web)
│   └── README.md          # Test documentation
├── docs/                   # Documentation
│   ├── QUICK_SETUP.md     # Quick start guide
│   ├── SETUP.md           # Detailed setup instructions
│   ├── SPECS.md           # System specifications
│   └── replit.md          # Replit deployment guide
├── config.template.env     # Environment configuration template
├── package.json            # Dependencies and scripts
└── README.md               # This file
```

## 🧪 Running Tests

### All Tests
```bash
npm test
```

### Specific Test Categories
```bash
# LLM integration tests
npm run test:llm

# Search functionality tests
npm run test:search

# Integration tests
npm run test:integration

# Watch mode for development
npm run test:watch

# UI mode for visual testing
npm run test:ui
```

### Test Coverage
```bash
npm test -- --coverage
```

## 📚 Documentation

### **Quick Setup** (`docs/QUICK_SETUP.md`)
- No database required setup
- Fast development server startup
- Basic configuration overview

### **Detailed Setup** (`docs/SETUP.md`)
- Complete environment configuration
- API key setup instructions
- Troubleshooting guide

### **System Specifications** (`docs/SPECS.md`)
- Detailed system architecture
- API specifications
- Workflow documentation

### **Replit Deployment** (`docs/replit.md`)
- Cloud deployment instructions
- Replit-specific configuration

## 🔒 Security Features

### **Environment Protection**
- `.env` files excluded from Git
- API keys never committed
- Comprehensive `.gitignore` protection

### **Rate Limiting**
- Intelligent API quota management
- Automatic retry logic for quota exceeded errors
- Configurable rate limits per service

### **Input Validation**
- Request size limits (50MB)
- CORS protection for development
- Error handling and logging

## 🚨 Troubleshooting

### **Common Issues**

1. **Port Conflicts**
   ```bash
   # Change port in .env
   PORT=3001
   ```

2. **API Key Errors**
   ```bash
   # Verify .env file exists
   ls -la .env
   
   # Check API key format
   cat .env | grep API_KEY
   ```

3. **Build Errors**
   ```bash
   # Clear dependencies
   rm -rf node_modules package-lock.json
   npm install
   ```

4. **Test Failures**
   ```bash
   # Check test environment
   npm run test:llm
   
   # Run with verbose output
   npm test -- --reporter=verbose
   ```

### **Debug Mode**
Enable detailed logging:
```bash
DEBUG=questsage:*
NODE_ENV=development
npm run dev
```

## 🚀 Development Workflow

### **Adding New Features**
1. **New Search Sources**: Implement in `server/services/search/`
2. **New AI Providers**: Add to `server/services/llm.ts`
3. **UI Components**: Create in `client/src/components/`
4. **Tests**: Add corresponding test files in `tests/`

### **Code Quality**
```bash
# Type checking
npm run check

# Run tests
npm test

# Build verification
npm run build
```

## 📊 System Capabilities

### **Research Sources**
- **Academic**: arXiv papers, peer-reviewed research
- **Industry**: Google Search, industry reports  
- **Social**: Reddit discussions, community insights
- **Deep**: Perplexity AI for complex queries

### **AI Agents**
- **ChatGPT**: Inductive reasoning, pattern recognition
- **Gemini**: Strategic analysis, framework application
- **Claude**: High-quality synthesis and evaluation

### **Output Formats**
- **Research Reports**: Structured analysis with evidence
- **Agent Dialogues**: Multi-perspective discussions
- **Fact Sheets**: Key findings with source attribution
- **Dynamic Metrics**: Real-time research progress indicators

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch
3. **Implement** your changes
4. **Add tests** and documentation
5. **Submit** a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

For issues, questions, or contributions:
- **Create an issue** in the repository
- **Check the documentation** in the `docs/` folder
- **Review the test suite** for implementation examples
- **Check the code comments** for detailed explanations

---

**QuestSage** - Transforming complex research into actionable insights through AI-powered multi-agent synthesis.

*Last Updated: December 2024 - Current Version: 1.0.0*
