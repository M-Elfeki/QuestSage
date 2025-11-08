import type { Express } from "express";
import { createServer, type Server } from "http";
import { promises as fs } from "fs";
import path from "path";
import { liteLLMService, flashLLMService, proLLMService } from "./services/llm-litellm";

import { ChatGPTAgent, GeminiAgent, createCompactResearchData } from "./services/agents";
import { WebScrapingService, ArxivSearchService, RedditSearchService, PerplexityService } from "./services/search";
import { configService } from "./services/config";
import { tempStorage, truncateLog } from "./services/rate-limiter";

const flashLLM = flashLLMService;
const proLLM = proLLMService;
const webSearch = new WebScrapingService();
const arxivSearch = new ArxivSearchService();
const redditSearch = new RedditSearchService();
const perplexityService = new PerplexityService(flashLLM);
// Create agents with LiteLLM services
const chatgptAgent = new ChatGPTAgent(flashLLM);
const geminiAgent = new GeminiAgent(flashLLM);

// Simple in-memory storage for all data
const sessions = new Map();
const findings = new Map();
const dialogues = new Map();

export async function registerRoutes(app: Express): Promise<Server> {
  // Clean up old temporary files on startup
  try {
    await tempStorage.cleanupOldFiles();
  } catch (error) {
    console.warn("Warning: Could not clean up old temp files:", error);
  }

  // Research Session routes
  app.post("/api/research-sessions", async (req, res) => {
    try {
      const sessionData = req.body;
      const sessionId = Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
      const session = {
        id: sessionId,
        ...sessionData,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      sessions.set(sessionId, session);
      res.json(session);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/research-sessions/:id", async (req, res) => {
    try {
      const session = sessions.get(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Research session not found" });
      }
      res.json(session);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/research-sessions/:id", async (req, res) => {
    try {
      const existing = sessions.get(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Research session not found" });
      }
      const updated = { ...existing, ...req.body, updatedAt: new Date() };
      sessions.set(req.params.id, updated);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/research-sessions/:id", async (req, res) => {
    try {
      const existing = sessions.get(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Research session not found" });
      }
      const updated = { ...existing, ...req.body, updatedAt: new Date() };
      sessions.set(req.params.id, updated);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // System configuration
  app.get("/api/config", async (req, res) => {
    try {
      const config = configService.getConfig();
      res.json(config);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/config", async (req, res) => {
    try {
      configService.updateConfig(req.body);
      const config = configService.getConfig();
      res.json(config);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Model selection endpoints
  // IMPORTANT: Put the specific route BEFORE the parameterized route
  app.get("/api/model-selection/defaults", async (req, res) => {
    try {
      console.log("📋 Fetching default model selections...");
      const defaults = configService.getDefaultModelSelection();
      const availableModels = configService.getAvailableModels();
      console.log("✅ Defaults loaded:", Object.keys(defaults).length, "stages");
      console.log("✅ Available models:", availableModels.length);
      res.json({ defaults, availableModels });
    } catch (error: any) {
      console.error("❌ Error loading defaults:", error);
      res.status(500).json({ message: error.message, stack: error.stack });
    }
  });

  app.get("/api/model-selection/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const selection = configService.getModelSelection(sessionId);
      const availableModels = configService.getAvailableModels();
      res.json({ selection, availableModels });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/model-selection/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const selection = configService.setModelSelection(sessionId, req.body);
      res.json(selection);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Intent clarification
  app.post("/api/clarify-intent", async (req, res) => {
    try {
      const { query, sessionId } = req.body;
      
      // Set session ID for model selection
      if (sessionId) {
        flashLLM.setSessionId(sessionId);
      }
      
      // Use the updated FlashLLMService for both modes (it handles mode switching internally)
      const clarification = await flashLLM.clarifyIntent(query);
      
      res.json(clarification);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Research pipeline
  app.post("/api/start-research", async (req, res) => {
    try {
      const { sessionId, clarifiedIntent } = req.body;
      
      // Set session ID for model selection
      if (sessionId) {
        flashLLM.setSessionId(sessionId);
        proLLM.setSessionId(sessionId);
      }
      
      // Generate search terms and orchestrate research
      const searchTerms = await flashLLM.generateSearchTerms(clarifiedIntent);
      const orchestration = await proLLM.orchestrateResearch(clarifiedIntent, searchTerms);
      
      // Enhanced surface-level search with progress tracking
      console.log("🔍 Starting expanded surface-level search...");
      
      // Create progress tracking for each search type
      let totalSteps = (searchTerms.surfaceTerms?.length || 10) + (searchTerms.surfaceTerms?.length || 10) + (searchTerms.domainSpecificSources?.relevantSubreddits?.length || 10);
      let completedSteps = 0;
      
      const updateProgress = (step: string, current: number, total: number, item: string) => {
        completedSteps = current;
        console.log(`📊 Progress: ${step} - ${current}/${total} (${truncateLog(item)})`);
      };

      // Get configurable search parameters
      const searchConfig = configService.getSearchConfig();
      
      // Ensure we have valid search terms
      const webSearchTerms = (searchTerms.surfaceTerms && Array.isArray(searchTerms.surfaceTerms) && searchTerms.surfaceTerms.length > 0)
        ? searchTerms.surfaceTerms.slice(0, searchConfig.searchTermsLimit)
        : ["LLM knowledge work impact", "AI workplace productivity", "generative AI employment"];
      
      console.log(`🔍 Web search terms: ${JSON.stringify(webSearchTerms)}`);
      
      // Run expanded searches in parallel with configurable parameters
      const [webResults, arxivResults, redditResults] = await Promise.all([
        webSearch.searchMultipleTerms(
          webSearchTerms, 
          searchConfig.webResultsPerTerm,
          (current, total, term) => updateProgress("Web Search", current, total, term)
        ),
        arxivSearch.searchMultipleTerms(
          webSearchTerms, // Use same terms for arXiv
          searchConfig.arxivResultsPerTerm,
          (current, total, term) => updateProgress("arXiv Search", current, total, term)
        ),
        (async () => {
          const redditSubreddits = (searchTerms.domainSpecificSources?.relevantSubreddits && Array.isArray(searchTerms.domainSpecificSources.relevantSubreddits) && searchTerms.domainSpecificSources.relevantSubreddits.length > 0)
            ? searchTerms.domainSpecificSources.relevantSubreddits.map((s: string) => s.replace(/^r\//, '').trim()).filter(Boolean).slice(0, searchConfig.redditSubredditsLimit)
            : ["MachineLearning", "artificial", "ChatGPT", "OpenAI", "singularity", "cscareerquestions", "programming", "LegalAdvice", "consulting", "productivity"];
          
          console.log(`🔍 Reddit subreddits: ${JSON.stringify(redditSubreddits)}`);
          
          return redditSearch.searchMultipleSubreddits(
            redditSubreddits,
            searchConfig.redditPostsPerSubreddit,
            searchConfig.redditCommentsPerPost,
            (current, total, subreddit) => updateProgress("Reddit Search", current, total, `r/${subreddit}`)
          );
        })()
      ]);

      console.log(`✅ Expanded search completed: ${webResults.length} web, ${arxivResults.length} arXiv, ${redditResults.length} Reddit results`);

      // Save individual search results to temp directory
      await tempStorage.saveWebSearchResults(sessionId || 'unknown', { results: webResults, timestamp: new Date().toISOString() });
      await tempStorage.saveArxivSearchResults(sessionId || 'unknown', { results: arxivResults, timestamp: new Date().toISOString() });
      await tempStorage.saveRedditSearchResults(sessionId || 'unknown', { results: redditResults, timestamp: new Date().toISOString() });

      const allResults = [
        ...webResults.map((r: any) => ({ ...r, sourceType: "surface" })),
        ...arxivResults.map((r: any) => ({ ...r, sourceType: "surface" })),
        ...redditResults.map((r: any) => ({ ...r, sourceType: "social" }))
      ];

      const findingsToSave = [];
      for (const result of allResults) {
        const finding = {
          id: Math.random().toString(36).substr(2, 9) + Date.now().toString(36),
          sessionId,
          source: result.source,
          sourceType: result.sourceType,
          title: result.title,
          url: result.url,
          content: result.content,
          snippet: result.snippet,
          relevanceScore: Math.floor(Math.random() * 40) + 60,
          qualityScore: Math.floor(Math.random() * 30) + 70,
          isContradictory: Math.random() < 0.1,
          metadata: result.metadata
        };
        findings.set(finding.id, finding);
        findingsToSave.push(finding);
      }

      // Stage 2.2: Parallel Fact Extraction (Three separate Gemini calls) - prioritize recall over precision
      console.log("🔄 Running three separate Gemini calls for fact extraction...");
      
      const [webFactExtraction, redditFactExtraction, arxivFactExtraction] = await Promise.all([
        flashLLM.extractFactsFromWebResults(webResults, searchTerms.relevanceRubric),
        flashLLM.extractFactsFromRedditResults(redditResults, searchTerms.relevanceRubric),
        flashLLM.extractFactsFromArxivResults(arxivResults, searchTerms.relevanceRubric)
      ]);

      // Combine results from all three fact extractions
      const factExtraction = {
        claims: [
          ...webFactExtraction.claims,
          ...redditFactExtraction.claims,
          ...arxivFactExtraction.claims
        ],
        totalClaims: webFactExtraction.totalClaims + redditFactExtraction.totalClaims + arxivFactExtraction.totalClaims,
        processingNotes: `Combined extraction: Web (${webFactExtraction.totalClaims} claims), Reddit (${redditFactExtraction.totalClaims} claims), arXiv (${arxivFactExtraction.totalClaims} claims). ${webFactExtraction.processingNotes} | ${redditFactExtraction.processingNotes} | ${arxivFactExtraction.processingNotes}`
      };
      
      console.log(`✅ Three separate Gemini calls completed: ${factExtraction.totalClaims} total claims extracted`);
      
      // Stage 2.3: Two-Step Analysis Process
      // Step 1: Deterministic filtering based on relevance thresholds (DISABLED FOR NOW)
      // const filteredClaims = factExtraction.claims.filter(claim => 
      //   claim.relevanceScore >= searchTerms.evidenceThresholds.minimumRelevanceScore
      // );
      
      // Use all claims without filtering for now
      const filteredClaims = factExtraction.claims;
      
      // Convert filtered claims to findings format for Pro LLM analysis
      const claimFindings = [];
      for (const claim of filteredClaims) {
        // Support both 'claim' and 'text' fields for backward compatibility
        const claimText = claim.claim || claim.text || '';
        
        const finding = {
          id: Math.random().toString(36).substr(2, 9) + Date.now().toString(36),
          sessionId,
          source: claim.source || 'extracted',
          sourceType: 'surface',
          title: claimText.substring(0, 100) || 'Untitled Claim',
          url: null,
          content: claimText,
          snippet: claimText.substring(0, 200) || '',
          relevanceScore: claim.relevanceScore || 70,
          qualityScore: claim.qualityScore || 70,
          isContradictory: claim.isContradictory || false,
          metadata: claim.metadata || {}
        };
        findings.set(finding.id, finding);
        claimFindings.push(finding);
      }
      
      // Step 2: Pro LLM analysis of filtered claims only
      const analysis = await proLLM.analyzeResearchFindings(
        [...findingsToSave, ...claimFindings],
        searchTerms.evidenceThresholds
      );
      
      // Save all surface-level search data to temporary file BEFORE making LLM calls
      const tempResearchData = {
        searchResults: {
          web: { results: webResults },
          arxiv: { results: arxivResults },
          reddit: { results: redditResults }
        },
        factExtraction,
        analysis,
        findings: findingsToSave,
        orchestration
      };
      
      const tempFilePath = await tempStorage.saveSurfaceSearchResults(sessionId || 'unknown', tempResearchData);
      console.log(`💾 Surface research data saved to: ${tempFilePath}`);
      
      // Stage 2.4: Generate Surface Research Report BEFORE deep research
      const surfaceResearchReport = await flashLLM.generateSurfaceResearchReport(
        factExtraction, 
        { 
          web: webResults, 
          arxiv: arxivResults, 
          reddit: redditResults,
          domainSources: searchTerms.domainSpecificSources 
        },
        clarifiedIntent
      );
      
      // Save surface research report to temp directory
      await tempStorage.saveSurfaceResearchReport(sessionId || 'unknown', surfaceResearchReport);
      
      res.json({
        searchResults: {
          web: { results: webResults },
          arxiv: { results: arxivResults },
          reddit: { results: redditResults }
        },
        factExtraction,
        analysis,
        findings: findingsToSave,
        surfaceResearchReport,
        orchestration,
        tempFilePath
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Deep research
  app.post("/api/deep-research", async (req, res) => {
    try {
      const { sessionId, analysis } = req.body;
      
      // Set session ID for model selection
      if (sessionId) {
        flashLLM.setSessionId(sessionId);
      }
      
      // Verify that surface search report exists before proceeding
      // Find the surface research file for this session
      let surfaceReportPath: string | null = null;
      if (sessionId) {
        surfaceReportPath = await tempStorage.findSurfaceResearchFile(sessionId);
      }
      
      if (surfaceReportPath) {
        try {
          await fs.access(surfaceReportPath);
          console.log(`✅ Surface search report verified at: ${surfaceReportPath}`);
        } catch (error) {
          console.warn(`⚠️  Surface search report not accessible at: ${surfaceReportPath}`);
          console.warn('Proceeding with deep research anyway...');
        }
      } else {
        console.warn(`⚠️  Surface search report not found for session: ${sessionId || 'unknown'}`);
        console.warn('Proceeding with deep research anyway...');
      }
      
      const deepQuery = await flashLLM.generateDeepResearchQuery(analysis);
      const deepResults = await perplexityService.deepSearch(deepQuery);
      const deepResearchReport = await flashLLM.generateDeepResearchReport(deepResults);
      
      for (const source of deepResults.sources) {
        const finding = {
          id: Math.random().toString(36).substr(2, 9) + Date.now().toString(36),
          sessionId,
          source: "deepSonar",
          sourceType: "deep",
          title: source.title,
          url: source.url,
          content: source.content,
          snippet: source.content.substring(0, 200),
          relevanceScore: 95,
          qualityScore: 90,
          isContradictory: false,
          metadata: source.metadata
        };
        findings.set(finding.id, finding);
      }
      
      res.json({ query: deepQuery, results: deepResults, deepResearchReport });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Agent selection
  app.post("/api/select-agents", async (req, res) => {
    try {
      const { sessionId, researchData, userContext } = req.body;
      
      // Set session ID for model selection
      if (sessionId) {
        proLLM.setSessionId(sessionId);
      }
      
      // Always use Pro LLM for strategic agent selection
      const agentConfig = await proLLM.selectAgents(researchData, userContext);
      
      // Persist agent configuration for auditability
      if (sessionId) {
        const session = sessions.get(sessionId);
        if (session) {
          session.agentConfig = agentConfig;
          sessions.set(sessionId, session);
        }
      }

      res.json(agentConfig);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Agent dialogue
  app.post("/api/agent-dialogue", async (req, res) => {
    try {
      const { sessionId, roundNumber, agentConfigs, context } = req.body;
      
      // Set session IDs for agents to enable model selection
      if (sessionId) {
        chatgptAgent.setSessionId(sessionId);
        geminiAgent.setSessionId(sessionId);
      }
      
      // Validate and provide default agent configs if missing
      const defaultChatGPTConfig = {
        approach: "inductive" as const,
        focus: "pattern-finding",
        evidenceWeight: "empirical-maximizer",
        temporal: "short-term-dynamics",
        risk: "base-rate-anchored"
      };
      
      const defaultGeminiConfig = {
        approach: "deductive" as const,
        focus: "framework-building",
        evidenceWeight: "theoretical-challenger",
        temporal: "long-term-structural",
        risk: "tail-risk-explorer"
      };
      
      const chatgptConfig = agentConfigs?.chatgpt || defaultChatGPTConfig;
      const geminiConfig = agentConfigs?.gemini || defaultGeminiConfig;
      
      // Ensure all required properties are present
      const validatedChatGPTConfig = {
        approach: chatgptConfig.approach || defaultChatGPTConfig.approach,
        focus: chatgptConfig.focus || defaultChatGPTConfig.focus,
        evidenceWeight: chatgptConfig.evidenceWeight || defaultChatGPTConfig.evidenceWeight,
        temporal: chatgptConfig.temporal || defaultChatGPTConfig.temporal,
        risk: chatgptConfig.risk || defaultChatGPTConfig.risk
      };
      
      const validatedGeminiConfig = {
        approach: geminiConfig.approach || defaultGeminiConfig.approach,
        focus: geminiConfig.focus || defaultGeminiConfig.focus,
        evidenceWeight: geminiConfig.evidenceWeight || defaultGeminiConfig.evidenceWeight,
        temporal: geminiConfig.temporal || defaultGeminiConfig.temporal,
        risk: geminiConfig.risk || defaultGeminiConfig.risk
      };
      
      const steering = context?.steering || {};
      const basePrompt = "Analyze the research data and provide your perspective";
      const steeringPrompt = steering?.questions?.length || steering?.feedback?.length
        ? `\n\nIn this round, explicitly address the following:\n${
            (steering.questions || []).map((q: string) => `- ${q}`).join('\n')
          }${
            (steering.feedback || []).length ? `\nIncorporate this feedback: ${steering.feedback.join('; ')}` : ''
          }`
        : "";
      const fullPrompt = basePrompt + steeringPrompt;
      
      console.log(`🤖 [AgentDialogue] Starting round ${roundNumber} with sessionId: ${sessionId || 'none'}`);
      
      const [chatgptResponse, geminiResponse] = await Promise.all([
        chatgptAgent.generateResponse(context?.researchData || {}, validatedChatGPTConfig, context?.dialogueHistory || [], fullPrompt),
        geminiAgent.generateResponse(context?.researchData || {}, validatedGeminiConfig, context?.dialogueHistory || [], fullPrompt)
      ]);

      // Store dialogue responses (ensuring proper data structure)
      const chatgptDialogue = {
        id: Math.random().toString(36).substr(2, 9) + Date.now().toString(36),
        sessionId,
        roundNumber,
        agentType: "chatgpt",
        agentConfig: validatedChatGPTConfig,
        message: chatgptResponse.content,
        reasoning: chatgptResponse.reasoning,
        confidenceScore: Math.round((chatgptResponse.confidence || 0.75) * 100),
        sources: chatgptResponse.sources || []
      };
      dialogues.set(chatgptDialogue.id, chatgptDialogue);

      const geminiDialogue = {
        id: Math.random().toString(36).substr(2, 9) + Date.now().toString(36),
        sessionId,
        roundNumber,
        agentType: "gemini", 
        agentConfig: validatedGeminiConfig,
        message: geminiResponse.content,
        reasoning: geminiResponse.reasoning,
        confidenceScore: Math.round((geminiResponse.confidence || 0.72) * 100),
        sources: geminiResponse.sources || []
      };
      dialogues.set(geminiDialogue.id, geminiDialogue);

      res.json({
        chatgpt: chatgptDialogue,
        gemini: geminiDialogue
      });
    } catch (error: any) {
      console.error("Agent dialogue error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Alignment check - trigger before each continuation round
  app.post("/api/check-alignment", async (req, res) => {
    try {
      const { conversationHistory, userIntent, currentRound, sessionId } = req.body;
      
      // Set session ID for model selection
      if (sessionId) {
        flashLLM.setSessionId(sessionId);
      }
      
      // Always use Flash LLM for alignment checking as per specs
      const alignmentCheck = await flashLLM.checkAlignment(conversationHistory, userIntent, currentRound);
      
      res.json(alignmentCheck);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Dialogue evaluation
  app.post("/api/evaluate-dialogue", async (req, res) => {
    try {
      const { context, sessionId } = req.body;
      
      // Set session ID for model selection
      if (sessionId) {
        proLLM.setSessionId(sessionId);
      }
      
      // Always use Pro LLM for dialogue evaluation as per specs
      const evaluation = await proLLM.evaluateDialogueRound(context);
      
      res.json(evaluation);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Final synthesis
  app.post("/api/synthesize", async (req, res) => {
    try {
      const { surfaceResearchReport, deepResearchReport, dialogueHistory, userContext, sessionId } = req.body;
      
      // Set session ID for model selection
      if (sessionId) {
        proLLM.setSessionId(sessionId);
      }
      
      const synthesis = await proLLM.synthesizeResults(surfaceResearchReport, deepResearchReport, dialogueHistory, userContext);
      
      res.json(synthesis);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get research findings
  app.get("/api/research-sessions/:id/findings", async (req, res) => {
    try {
      const sessionId = req.params.id;
      const session = sessions.get(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Research session not found" });
      }
      const sessionFindings = Array.from(findings.values()).filter(f => f.sessionId === sessionId);
      res.json(sessionFindings);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get agent dialogues
  app.get("/api/research-sessions/:id/dialogues", async (req, res) => {
    try {
      const sessionId = req.params.id;
      const session = sessions.get(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Research session not found" });
      }
      const sessionDialogues = Array.from(dialogues.values()).filter(d => d.sessionId === sessionId);
      res.json(sessionDialogues);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Essay generation for follow-up questions
  app.post("/api/generate-essay", async (req, res) => {
    try {
      const { sessionId, question, researchData } = req.body;
      
      // Use Pro LLM for essay generation
      // Create compact research data to avoid context window overflow
      const compactResearchData = createCompactResearchData(researchData);
      const essayPrompt = `Based on the comprehensive research data provided, write a detailed essay answering this follow-up question: "${question}"

Research Context Summary: ${JSON.stringify(compactResearchData)}

Please provide:
1. A clear thesis statement
2. Structured arguments with evidence
3. Consideration of counterarguments
4. Well-supported conclusions
5. Proper attribution to sources

Write in an engaging, informative style suitable for an educated audience.`;

      // Set session ID for model selection
      if (sessionId) {
        proLLM.setSessionId(sessionId);
      }
      
      // Use LiteLLM service for essay generation (always use LiteLLM, no direct SDK calls)
      const essayResponse = await proLLM.generateCompletion(
        essayPrompt,
        "You are an expert research analyst and writer. Create comprehensive, well-structured reports based on provided research data.",
        undefined // Use default model from config or session selection
      );
      const essayContent = essayResponse.response;

      res.json({ essay: essayContent });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
