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

- **Frontend**: React-based UI with real-time research progress tracking
- **Backend**: Express.js server with modular service architecture
- **Database**: PostgreSQL with Drizzle ORM (configurable for Neon or local)
- **AI Services**: OpenAI, Google Gemini, Anthropic Claude integration
- **Search Services**: Google Search, arXiv, Reddit, Perplexity Deep Search

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

## 🚀 How to Switch Between Modes

### Method 1: UI Toggle (Recommended)
1. Start the application
2. Look for the **Dev Mode** toggle switch in the top-right corner
3. Click to switch between Dev (checked) and Prod (unchecked) modes
4. The system will automatically update the backend configuration

### Method 2: Environment Variable
Set the `NODE_ENV` environment variable:
```bash
# Development mode
export NODE_ENV=development

# Production mode  
export NODE_ENV=production
```

### Method 3: API Call
```bash
# Switch to production mode
curl -X PUT http://localhost:3000/api/config \
  -H "Content-Type: application/json" \
  -d '{"mode": "prod"}'

# Switch to development mode
curl -X PUT http://localhost:3000/api/config \
  -H "Content-Type: application/json" \
  -d '{"mode": "dev"}'
```

## 📋 What's Missing (Current Limitations)

### 1. **Authentication & User Management**
- User registration and login system is defined in schema but not implemented
- No session management or user isolation
- All research sessions are currently shared

### 2. **Database Persistence**
- System defaults to in-memory storage (`MemStorage`)
- PostgreSQL integration exists but requires manual configuration
- No data migration or backup capabilities

### 3. **Error Handling & Monitoring**
- Limited error recovery mechanisms
- No comprehensive logging or monitoring
- Missing rate limiting and API quota management

### 4. **Advanced Features**
- No real-time collaboration between users
- Limited export capabilities (PDF, Word, etc.)
- No version control for research sessions
- Missing advanced search filters and sorting

### 5. **Security & Compliance**
- No input sanitization or validation
- Missing audit trails for research sessions
- No GDPR/privacy compliance features

## 🛠️ How to Run QuestSage

### Prerequisites
- Node.js 18+ 
- npm or yarn
- PostgreSQL database (optional, for production)

### 1. **Clone and Install**
```bash
git clone <repository-url>
cd QuestSage
npm install
```

### 2. **Environment Configuration**
Create a `.env` file in the root directory:
```bash
# Database (optional for dev mode)
DATABASE_URL=postgresql://user:password@localhost:5432/questsage

# AI Service API Keys (required for production mode)
OPENAI_API_KEY=your_openai_key
GEMINI_API_KEY=your_gemini_key
ANTHROPIC_API_KEY=your_anthropic_key
PERPLEXITY_API_KEY=your_perplexity_key

# Search Service API Keys (required for production mode)
GOOGLE_SEARCH_API_KEY=your_google_key
REDDIT_API_KEY=your_reddit_key

# System Configuration
NODE_ENV=development
PORT=3000
MAX_DIALOGUE_ROUNDS=7
```

### 3. **Database Setup (Optional)**
If using PostgreSQL:
```bash
# Push schema to database
npm run db:push

# Or run migrations manually
npx drizzle-kit push
```

### 4. **Start the Application**

#### Development Mode
```bash
npm run dev
```
- Starts both frontend and backend
- Frontend: http://localhost:5173
- Backend: http://localhost:3000
- Hot reloading enabled

#### Production Mode
```bash
# Build the application
npm run build

# Start production server
npm start
```
- Serves built frontend from backend
- Single port (default: 5000)
- Optimized for production

### 5. **Access the Application**
Open your browser and navigate to:
- **Dev Mode**: http://localhost:5173
- **Prod Mode**: http://localhost:5000 (or your configured PORT)

## 🔧 Development Workflow

### 1. **Research Pipeline Stages**
1. **Intent Clarification**: AI analyzes user query and generates clarifying questions
2. **Surface Research**: Initial search across multiple sources (Google, arXiv, Reddit)
3. **Fact Extraction**: AI extracts key facts and identifies contradictions
4. **Deep Research**: Targeted investigation using Perplexity for complex queries
5. **Agent Selection**: AI orchestrator selects optimal agent configurations
6. **Multi-Agent Dialogue**: Structured conversation between AI agents
7. **Synthesis**: Final report generation combining all research findings

### 2. **Adding New Features**
- **New Search Sources**: Implement in `server/services/search/`
- **New AI Providers**: Add to `server/services/llm.ts`
- **UI Components**: Create in `client/src/components/`
- **Database Schema**: Update `shared/schema.ts`

### 3. **Testing**
```bash
# Type checking
npm run check

# Run tests (when implemented)
npm test
```

## 📊 System Capabilities

### Research Sources
- **Academic**: arXiv papers, peer-reviewed research
- **Industry**: Google Search, industry reports
- **Social**: Reddit discussions, community insights
- **Deep**: Perplexity AI for complex queries

### AI Agents
- **ChatGPT**: Inductive reasoning, pattern recognition
- **Gemini**: Strategic analysis, framework application
- **Claude**: High-quality synthesis and evaluation

### Output Formats
- **Research Reports**: Structured analysis with evidence
- **Agent Dialogues**: Multi-perspective discussions
- **Fact Sheets**: Key findings with source attribution
- **Follow-up Essays**: Detailed responses to specific questions

## 🚨 Troubleshooting

### Common Issues

1. **Port Conflicts**
   - Check if ports 3000 or 5173 are in use
   - Modify PORT environment variable

2. **API Key Errors**
   - Verify all required API keys are set
   - Check API key permissions and quotas

3. **Database Connection Issues**
   - Verify DATABASE_URL format
   - Ensure PostgreSQL is running
   - Check network connectivity

4. **Build Errors**
   - Clear node_modules and reinstall
   - Check Node.js version compatibility
   - Verify TypeScript configuration

### Debug Mode
Enable detailed logging by setting:
```bash
DEBUG=questsage:*
NODE_ENV=development
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Implement your changes
4. Add tests and documentation
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

For issues, questions, or contributions:
- Create an issue in the repository
- Check the documentation
- Review the code comments for implementation details

---

**QuestSage** - Transforming complex research into actionable insights through AI-powered multi-agent synthesis.
