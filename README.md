# QuestSage: Multi-Agent Research Synthesis System

QuestSage is a sophisticated multi-agent research synthesis system that combines AI agents with comprehensive research capabilities to provide high-quality, evidence-based analysis on complex topics. The system leverages **LiteLLM** for unified access to multiple AI models (OpenAI, Claude, Gemini) through a single API.

## 🎯 System Purpose

QuestSage is designed to generate high-quality, research-backed insights by orchestrating multiple AI agents through a structured research pipeline. It's particularly effective for complex research questions that require:

- **Multi-source evidence synthesis** (academic papers, web search, Reddit discussions)
- **Agent-based dialogue** for comprehensive analysis
- **Evidence quality assessment** and contradiction detection
- **Structured research workflows** with human-in-the-loop oversight

## 🏗️ Architecture Overview

The system uses a **unified LLM architecture** powered by LiteLLM:

- **LiteLLM Integration**: Single API for multiple AI providers (OpenAI, Claude, Gemini)
- **Task-Specific Model Selection**: Configurable models for different research tasks
- **TypeScript-Only Implementation**: Clean, modern codebase without Python dependencies

### Core Components

- **Frontend**: React-based UI with real-time research progress tracking
- **Backend**: Express.js server with modular TypeScript services
- **AI Services**: LiteLLM integration with configurable model selection
- **Search Services**: Pure TypeScript implementations for web, arXiv, and Reddit
- **Configuration**: Flexible JSON-based model configuration

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+** 
- **npm** or **yarn**
- **LiteLLM API Key** (contact your organization for access)

### 1. **Clone and Install**
```bash
git clone https://github.com/yourusername/QuestSage.git
cd QuestSage
npm install
```

### 2. **Environment Configuration**

QuestSage uses configuration files for sensitive credentials. These files are excluded from version control for security.

**Required Configuration Files:**

1. **LiteLLM Configuration** (`litellm_config.env`):
```bash
# Create litellm_config.env in the project root
export LITELLM_API_KEY="your_litellm_api_key_here"
export LITELLM_BASE_URL="https://litellm.ml-serving-internal.scale.com"
```

2. **Reddit API Configuration** (`reddit_config.env` - Optional but recommended):
```bash
# Copy the template and fill in your credentials
cp reddit_config.env.template reddit_config.env

# Edit reddit_config.env with your Reddit API credentials
export REDDIT_CLIENT_ID="your_client_id_here"
export REDDIT_CLIENT_SECRET="your_client_secret_here"
export REDDIT_USER_AGENT="QuestSage/1.0 by /u/YOUR_USERNAME"
```

**Getting Reddit API Credentials:**
1. Go to https://www.reddit.com/prefs/apps
2. Click "create another app" or "create app"
3. Fill in the form (app type: script)
4. Copy the Client ID and Secret to `reddit_config.env`

**Note:** Both `litellm_config.env` and `reddit_config.env` are automatically loaded by the application and are excluded from Git via `.gitignore`.

**Note:** Perplexity deep research is integrated via LiteLLM - no separate API key needed. The system uses `perplexity/sonar-deep-research` model through your LiteLLM proxy.

**Optional Environment Variables:**
```bash
# Application Settings
NODE_ENV=development
PORT=3000

# Search Configuration (optional - defaults provided)
SEARCH_TERMS_LIMIT=10
WEB_RESULTS_PER_TERM=10
ARXIV_RESULTS_PER_TERM=10
REDDIT_SUBREDDITS_LIMIT=10
REDDIT_POSTS_PER_SUBREDDIT=10
REDDIT_COMMENTS_PER_POST=10
```

### 3. **Start the Application**

```bash
npm run dev
```
- **Frontend**: http://localhost:5173 (Vite dev server with hot reload)
- **Backend**: http://localhost:3000 (Express API)

### Production Build

```bash
# Build the application
npm run build

# Start production server
npm start
```
- **Single port**: http://localhost:3000 (or your configured PORT)

## 🤖 Available AI Models

QuestSage uses LiteLLM to access multiple AI models. The available models are configured in `config.json`:

### Tested & Working Models:
- **OpenAI**: gpt-4o, gpt-4o-mini, gpt-5-nano
- **Claude**: claude-opus-4-20250514, claude-sonnet-4-20250514
- **Gemini**: gemini/gemini-2.5-flash, gemini/gemini-2.5-pro
- **Perplexity**: perplexity/sonar-deep-research

### Default Model Assignments:
All tasks default to `gpt-5-nano` unless overridden in the model selection UI or `config.json`:
- **Intent Clarification**: gpt-5-nano
- **Search Term Generation**: gpt-5-nano
- **Fact Extraction**: gpt-5-nano (parallel for web, arXiv, Reddit)
- **Research Analysis**: gpt-5-nano
- **Surface Research Report**: gpt-5-nano
- **Deep Research Query**: gpt-5-nano
- **Deep Research Report**: gpt-5-nano
- **Agent Selection**: gpt-5-nano
- **Dialogue Evaluation**: gpt-5-nano
- **Alignment Check**: gpt-5-nano
- **Final Synthesis**: gpt-5-nano
- **ChatGPT Debater**: gpt-5-nano (configurable)
- **Gemini Debater**: gpt-5-nano (configurable)

You can customize model assignments via the Model Selection UI or by editing `config.json`.

## 📁 Project Structure

```
QuestSage/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # UI components
│   │   ├── pages/         # Page components
│   │   └── hooks/         # Custom React hooks
│   └── index.html         # Entry point
├── server/                 # Express.js backend
│   ├── services/          # Core services
│   │   ├── llm-litellm.ts # LiteLLM integration
│   │   ├── search.ts      # Search services (web, arXiv, Reddit)
│   │   ├── agents.ts      # AI agent management
│   │   └── config.ts      # Configuration management
│   ├── routes.ts          # API endpoints
│   └── index.ts           # Server entry point
├── tests/                  # Test files
│   ├── test-all-models.ts # LLM model testing
│   ├── test-search-services.ts # Search services testing
│   └── test-reddit-auth.ts # Reddit authentication testing
├── config.json            # LLM model configuration
├── litellm_config.env     # LiteLLM credentials (not in git - create from template)
├── reddit_config.env      # Reddit API credentials (not in git - create from template)
├── reddit_config.env.template # Template for Reddit config
├── package.json           # Dependencies
├── tsconfig.json          # TypeScript configuration
├── vite.config.ts         # Vite build configuration
└── README.md             # This file
```

## 🔧 Configuration

### Model Configuration (`config.json`)
```json
{
  "llmModels": {
    "defaultModel": "gpt-4o-mini",
    "taskModels": {
      "clarifyIntent": {
        "model": "claude-sonnet-4-20250514",
        "reason": "Excellent at understanding nuanced queries"
      },
      // ... more task configurations
    }
  }
}
```

### Environment Variables

**Configuration Files (Recommended):**
- `litellm_config.env`: LiteLLM API credentials (auto-loaded)
- `reddit_config.env`: Reddit API credentials (auto-loaded)

**Environment Variables (Alternative):**
- `LITELLM_API_KEY`: LiteLLM API key (loaded from `litellm_config.env` or environment)
- `LITELLM_BASE_URL`: LiteLLM base URL (loaded from `litellm_config.env` or environment)
- `REDDIT_CLIENT_ID`: Reddit API client ID (loaded from `reddit_config.env` or environment)
- `REDDIT_CLIENT_SECRET`: Reddit API client secret (loaded from `reddit_config.env` or environment)
- `REDDIT_USER_AGENT`: Reddit User-Agent string (default: "QuestSage/1.0 by /u/questsage")
- `DEFAULT_MODEL`: Override default model
- `NODE_ENV`: development or production
- `PORT`: Server port (default: 3000)

## 🧪 Running Tests

Test files are located in the `tests/` directory:

```bash
# Test all LLM models
npx tsx tests/test-all-models.ts

# Test search services (Reddit, Web, arXiv)
npx tsx tests/test-search-services.ts

# Test Reddit authentication
npx tsx tests/test-reddit-auth.ts
```

## 🔒 Security Features

- **API Key Protection**: Credentials stored in config files (`litellm_config.env`, `reddit_config.env`), never committed to Git
- **Git Ignore**: Both `litellm_config.env` and `reddit_config.env` are excluded via `.gitignore`
- **Template Files**: `reddit_config.env.template` provides a safe template without credentials
- **Rate Limiting**: Intelligent quota management
- **Input Validation**: Request size limits and sanitization
- **TypeScript**: Type safety throughout the codebase

## 🚨 Troubleshooting

### Common Issues

1. **Missing API Key**
   ```bash
   # Check if litellm_config.env exists and contains your key
   cat litellm_config.env | grep LITELLM_API_KEY
   # Or check environment variables
   echo $LITELLM_API_KEY
   ```

2. **Reddit Search Not Working**
   ```bash
   # Check if reddit_config.env exists
   cat reddit_config.env | grep REDDIT_CLIENT_ID
   # Or copy the template
   cp reddit_config.env.template reddit_config.env
   # Then edit with your Reddit API credentials
   ```

3. **Port Conflicts**
   ```bash
   # Change port in .env or environment
   PORT=3001
   ```

4. **Build Errors**
   ```bash
   # Clean install
   rm -rf node_modules package-lock.json
   npm install
   ```

## 🔄 Complete Workflow

QuestSage follows a structured 8-stage research pipeline:

### Stage 1: Model Selection
- User selects LLM models for each research task
- Configurable models for: intent clarification, search term generation, fact extraction, analysis, synthesis, agent dialogue, etc.
- User can also configure:
  - Maximum dialogue rounds (default: 3, range: 1-15)
  - ChatGPT debater model
  - Gemini debater model
- Settings are saved to the research session

### Stage 2: Query Input & Intent Clarification
- User enters research query
- System clarifies user intent using selected model
- Returns structured clarification with requirements, constraints, and questions
- User confirms or refines intent

### Stage 3: Surface Research
- **Search Term Generation**: Generates optimized search terms using selected model
- **Parallel Multi-Source Search**:
  - **Web Search**: DuckDuckGo (10 results per term)
  - **arXiv**: Academic papers (10 results per term)
  - **Reddit**: Community discussions (10 posts per subreddit, 10 comments per post)
- **Fact Extraction**: Parallel extraction from each source type
- **Analysis**: Comprehensive analysis of findings with contradiction detection
- **Surface Research Report**: Structured report with key findings and evidence

### Stage 4: Deep Research
- **Query Generation**: Generates focused deep research query from surface analysis
- **Perplexity Deep Search**: Uses `perplexity/sonar-deep-research` via LiteLLM
  - Comprehensive research synthesis
  - Automatic citation extraction (50+ sources per query)
  - High-confidence evidence gathering
- **Deep Research Report**: Advanced analysis with predictive insights

### Stage 5: Agent Selection
- User selects agent configurations:
  - **ChatGPT Agent**: Approach, focus, evidence weighting, temporal perspective, risk assessment
  - **Gemini Agent**: Complementary configuration for diverse perspectives
- User defines success criteria for dialogue evaluation
- System validates configurations with defaults

### Stage 6: Agent Dialogue
- **Multi-Round Debate**: ChatGPT and Gemini agents engage in structured dialogue
- **Round-by-Round Process**:
  1. Both agents generate responses based on research data
  2. Dialogue evaluation assesses quality, convergence, and insights
  3. Alignment check ensures dialogue stays on track
  4. User can provide feedback if alignment issues detected
  5. Continues until max rounds reached or evaluation concludes
- **Context Management**: Compact research data and limited dialogue history to prevent context overflow
- **Steering**: Evaluation provides feedback and questions to guide next round

### Stage 7: Dialogue Evaluation & Alignment
- **Evaluation**: Assesses dialogue quality, convergence, and whether to continue
- **Alignment Check**: Verifies dialogue aligns with user intent
  - **Proceed**: Continue dialogue
  - **Clarify**: Request user input
  - **Realign**: Major drift detected, stop dialogue
- **Max Rounds Enforcement**: Automatically concludes when max rounds reached

### Stage 8: Final Synthesis
- **Comprehensive Synthesis**: Combines:
  - Surface research report
  - Deep research report
  - Complete dialogue history
  - User context
- **Structured Output**:
  - Executive summary
  - Key findings
  - Recommendations
  - Next steps
  - Risk assessment
  - Confidence level
  - Detailed appendix
- **Export**: Markdown export of complete synthesis report

## 📊 System Capabilities

### Research Sources
- **Web Search**: DuckDuckGo (10 results per query, 1000 chars per result)
- **Academic**: arXiv papers (10 results per query, 1000 chars per result)
- **Community**: Reddit discussions (10 posts/subreddit, 10 comments/post, 1000 chars per result)
- **Deep Search**: Perplexity Sonar Deep Research via LiteLLM (50+ sources per query)

### AI Agents
- **Multiple Models**: Access to GPT-4, Claude, Gemini, Perplexity via LiteLLM
- **Task Optimization**: Different models for different tasks
- **Configurable**: Per-task model selection via UI or config.json
- **Debater Models**: Separate model selection for ChatGPT and Gemini debaters

### Output Formats
- **Research Reports**: Structured analysis with citations
- **Agent Dialogues**: Multi-perspective discussions with confidence scores
- **Real-time Metrics**: Live research progress tracking
- **Synthesis Reports**: Comprehensive markdown exports

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

---

**QuestSage** - Transforming complex research into actionable insights through AI-powered synthesis.

## ✨ Key Features

- **Multi-Source Research**: Web, arXiv, Reddit, and Perplexity deep search
- **Configurable Model Selection**: Choose models for each task via UI
- **Agent-Based Dialogue**: Multi-round debate between ChatGPT and Gemini agents
- **Context Window Management**: Automatic data compaction to prevent overflow
- **Citation Extraction**: Automatic source citation from Perplexity deep research
- **Real-Time Progress**: Live tracking of research pipeline stages
- **Structured Output**: Comprehensive synthesis reports with markdown export
- **Alignment Checking**: Ensures dialogue stays aligned with user intent
- **Max Rounds Control**: Configurable dialogue round limits (1-15)

*Current Version: 2.1.0 - Complete Workflow Integration*