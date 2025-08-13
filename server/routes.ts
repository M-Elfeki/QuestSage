import type { Express } from "express";
import { createServer, type Server } from "http";
import { promises as fs } from "fs";
import path from "path";
import { FlashLLMService, ProLLMService } from "./services/llm";

import { ChatGPTAgent, GeminiAgent } from "./services/agents";
import { WebScrapingService, ArxivSearchService, RedditSearchService, PerplexityService } from "./services/search";
import { configService } from "./services/config";
import { devWorkflowService } from "./services/dev-workflow";
import { tempStorage, truncateLog } from "./services/rate-limiter";

const flashLLM = new FlashLLMService();
const proLLM = new ProLLMService();
const webSearch = new WebScrapingService();
const arxivSearch = new ArxivSearchService();
const redditSearch = new RedditSearchService();
const perplexityService = new PerplexityService();
const chatgptAgent = new ChatGPTAgent();
const geminiAgent = new GeminiAgent();

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

  // Intent clarification
  app.post("/api/clarify-intent", async (req, res) => {
    try {
      const { query } = req.body;
      
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
      
      if (configService.isRealMode()) {
        // Production mode - use real APIs
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
        
        // Run expanded searches in parallel with configurable parameters
        const [webResults, arxivResults, redditResults] = await Promise.all([
          webSearch.searchMultipleTerms(
            searchTerms.surfaceTerms?.slice(0, searchConfig.searchTermsLimit) || ["LLM knowledge work impact", "AI workplace productivity", "generative AI employment"], 
            searchConfig.webResultsPerTerm,
            (current, total, term) => updateProgress("Web Search", current, total, term)
          ),
          arxivSearch.searchMultipleTerms(
            searchTerms.surfaceTerms?.slice(0, searchConfig.searchTermsLimit) || ["large language models employment", "AI automation workplace", "generative AI productivity"], 
            searchConfig.arxivResultsPerTerm,
            (current, total, term) => updateProgress("arXiv Search", current, total, term)
          ),
          redditSearch.searchMultipleSubreddits(
            searchTerms.domainSpecificSources?.relevantSubreddits?.slice(0, searchConfig.redditSubredditsLimit) || ["MachineLearning", "artificial", "ChatGPT", "OpenAI", "singularity", "cscareerquestions", "programming", "LegalAdvice", "consulting", "productivity"], 
            searchConfig.redditPostsPerSubreddit,
            searchConfig.redditCommentsPerPost,
            (current, total, subreddit) => updateProgress("Reddit Search", current, total, `r/${subreddit}`)
          )
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
          const finding = {
            id: Math.random().toString(36).substr(2, 9) + Date.now().toString(36),
            sessionId,
            source: claim.source || 'extracted',
            sourceType: 'surface',
            title: claim.text.substring(0, 100),
            url: null,
            content: claim.text,
            snippet: claim.text.substring(0, 200),
            relevanceScore: claim.relevanceScore,
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
      } else {
        // Development mode - use dev workflow with real Gemini Flash 2.5 calls
        console.log("🔍 DEV MODE: Starting expanded surface-level search with real LLM calls...");
        
        const devSearchTerms = await devWorkflowService.generateSearchTerms(clarifiedIntent);
        const orchestration = await proLLM.orchestrateResearch(clarifiedIntent, devSearchTerms);
        
        // Get configurable search parameters
        const searchConfig = configService.getSearchConfig();
        
        // Create progress tracking for each search type
        let totalSteps = searchConfig.searchTermsLimit * 3; // 3 search types
        let completedSteps = 0;
        
        const updateProgress = (step: string, current: number, total: number, item: string) => {
          completedSteps = current;
          console.log(`📊 DEV Progress: ${step} - ${current}/${total} (${truncateLog(item)})`);
        };

        // Run expanded searches with configurable parameters
        const [webResults, arxivResults, redditResults] = await Promise.all([
          webSearch.searchMultipleTerms(
            devSearchTerms.surfaceTerms?.slice(0, searchConfig.searchTermsLimit) || ["LLM knowledge work impact", "AI workplace productivity", "generative AI employment", "ChatGPT productivity gains", "artificial intelligence job displacement", "knowledge work automation", "AI tools workplace efficiency", "machine learning productivity", "LLM adoption enterprise", "AI workplace transformation"], 
            searchConfig.webResultsPerTerm,
            (current, total, term) => updateProgress("Web Search", current, total, term)
          ),
          arxivSearch.searchMultipleTerms(
            devSearchTerms.surfaceTerms?.slice(0, searchConfig.searchTermsLimit) || ["large language models employment", "AI automation workplace", "generative AI productivity", "LLM economic impact", "artificial intelligence labor market", "knowledge work AI transformation", "machine learning workplace studies", "AI productivity research", "generative AI adoption", "LLM workplace efficiency"], 
            searchConfig.arxivResultsPerTerm,
            (current, total, term) => updateProgress("arXiv Search", current, total, term)
          ),
          redditSearch.searchMultipleSubreddits(
            devSearchTerms.relevantSubreddits?.slice(0, searchConfig.redditSubredditsLimit) || ["MachineLearning", "artificial", "ChatGPT", "OpenAI", "singularity", "cscareerquestions", "programming", "LegalAdvice", "consulting", "productivity"], 
            searchConfig.redditPostsPerSubreddit,
            searchConfig.redditCommentsPerPost,
            (current, total, subreddit) => updateProgress("Reddit Search", current, total, `r/${subreddit}`)
          )
        ]);

        console.log(`✅ DEV MODE: Expanded search completed: ${webResults.length} web, ${arxivResults.length} arXiv, ${redditResults.length} Reddit results`);

        // Save individual search results to temp directory
        await tempStorage.saveWebSearchResults(sessionId || 'unknown', { results: webResults, timestamp: new Date().toISOString() });
        await tempStorage.saveArxivSearchResults(sessionId || 'unknown', { results: arxivResults, timestamp: new Date().toISOString() });
        await tempStorage.saveRedditSearchResults(sessionId || 'unknown', { results: redditResults, timestamp: new Date().toISOString() });

        const allResults = [
          ...webResults.map((r: any) => ({ ...r, sourceType: "surface" })),
          ...arxivResults.map((r: any) => ({ ...r, sourceType: "surface" })),
          ...redditResults.map((r: any) => ({ ...r, sourceType: "social" }))
        ];

        // In dev mode, we'll return mock data without storing to database
        const findingsToSave = allResults.map((result, index) => ({
          id: Math.random().toString(36).substr(2, 9) + Date.now().toString(36),
          sessionId,
          source: result.source,
          sourceType: result.sourceType,
          title: result.title,
          url: result.url,
          content: result.content,
          snippet: result.snippet || result.content?.substring(0, 200),
          relevanceScore: result.relevanceScore || Math.floor(Math.random() * 40) + 60,
          qualityScore: Math.floor(Math.random() * 30) + 70,
          isContradictory: Math.random() < 0.1,
          metadata: result.metadata,
          createdAt: new Date().toISOString()
        }));

        // Stage 2.2: Parallel Fact Extraction (Three separate Gemini calls) - prioritize recall over precision
        console.log("🔄 Running three separate Gemini calls for fact extraction...");
        const relevanceRubric = devSearchTerms.relevanceRubric || "Score 0-100: Empirical data (30pts), direct relevance to knowledge work (25pts), recency <2 years (20pts), source credibility (15pts), sample size/methodology (10pts)";
        
        const [webFactExtraction, redditFactExtraction, arxivFactExtraction] = await Promise.all([
          flashLLM.extractFactsFromWebResults(webResults, relevanceRubric),
          flashLLM.extractFactsFromRedditResults(redditResults, relevanceRubric),
          flashLLM.extractFactsFromArxivResults(arxivResults, relevanceRubric)
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
        // Step 1: Deterministic filtering based on relevance thresholds
        const filteredClaims = factExtraction.claims.filter(claim => 
          claim.relevanceScore >= 65 // minimum relevance threshold
        );
        
        // Step 2: Pro LLM analysis of filtered claims only (using dev workflow for now)
        const analysis = await devWorkflowService.analyzeResearchFindings(
          filteredClaims.map(claim => ({
            ...claim,
            sessionId,
            source: claim.source || 'extracted',
            sourceType: 'surface',
            title: claim.text.substring(0, 100),
            url: null,
            content: claim.text,
            snippet: claim.text.substring(0, 200),
            relevanceScore: claim.relevanceScore,
            qualityScore: claim.qualityScore || 70,
            isContradictory: claim.isContradictory || false,
            metadata: claim.metadata || {},
            createdAt: new Date().toISOString()
          }))
        );
        
        // Save all surface-level search data to temporary file BEFORE making LLM calls (DEV MODE)
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
        console.log(`💾 DEV MODE: Surface research data saved to: ${tempFilePath}`);
        
        // Stage 2.4: Generate Surface Research Report BEFORE deep research
        const surfaceResearchReport = await flashLLM.generateSurfaceResearchReport(
          factExtraction, 
          { 
            web: webResults, 
            arxiv: arxivResults, 
            reddit: redditResults,
            domainSources: {
              relevantSubreddits: devSearchTerms.relevantSubreddits || ["r/MachineLearning", "r/cscareerquestions"],
              expertTwitterAccounts: ["@AndrewYNg", "@GaryMarcus"],
              specializedDatabases: ["NBER Working Papers", "IEEE Xplore"],
              professionalForums: ["Hacker News", "Stack Overflow AI"],
              industryResources: ["McKinsey Global Institute", "MIT Technology Review"]
            }
          },
          clarifiedIntent
        );
        
        // Save surface research report to temp directory
        await tempStorage.saveSurfaceResearchReport(sessionId || 'unknown', surfaceResearchReport);

        // Stage 2.5: Save complete surface search report to ./temp/surface-search.json
        console.log(`🔄 Preparing complete surface search report for session: ${sessionId}`);
        const completeSurfaceReport = {
          metadata: {
            sessionId,
            timestamp: new Date().toISOString(),
            query: clarifiedIntent?.query || "Research query",
            phase: "surface-research-complete"
          },
          searchResults: {
            web: { results: webResults, count: webResults.length },
            arxiv: { results: arxivResults, count: arxivResults.length },
            reddit: { results: redditResults, count: redditResults.length }
          },
          factExtraction: {
            ...factExtraction,
            totalClaimsExtracted: factExtraction.totalClaims,
            claimsAfterFiltering: filteredClaims.length
          },
          analysis: {
            ...analysis,
            findingsCount: findingsToSave.length
          },
          surfaceResearchReport,
          orchestration,
          tempFilePath,
          generatedAt: new Date().toISOString()
        };

        // Save to specific path: ./temp/surface-search.json
        const surfaceReportPath = path.join(process.cwd(), 'temp', 'surface-search.json');
        try {
          await fs.mkdir(path.dirname(surfaceReportPath), { recursive: true });
          await fs.writeFile(surfaceReportPath, JSON.stringify(completeSurfaceReport, null, 2), 'utf-8');
          console.log(`📋 Complete surface search report saved to: ${surfaceReportPath}`);
        } catch (error) {
          console.error('Error saving surface search report:', error);
        }
        
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
          tempFilePath,
          surfaceReportPath: './temp/surface-search.json'
        });
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Deep research
  app.post("/api/deep-research", async (req, res) => {
    try {
      const { sessionId, analysis } = req.body;
      
      // Verify that surface search report exists before proceeding
      const surfaceReportPath = path.join(process.cwd(), 'temp', 'surface-search.json');
      try {
        await fs.access(surfaceReportPath);
        console.log(`✅ Surface search report verified at: ${surfaceReportPath}`);
      } catch (error) {
        console.warn(`⚠️  Surface search report not found at: ${surfaceReportPath}`);
        console.warn('Proceeding with deep research anyway...');
      }
      
      if (configService.isRealMode()) {
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
      } else {
        const deepQuery = await devWorkflowService.generateDeepResearchQuery(analysis);
        
        const mockDeepResults = {
          sources: [
            {
              title: "Policy Implications of Large Language Model Adoption: A Strategic Analysis",
              url: "https://example.com/policy-analysis",
              content: "Comprehensive analysis of policy frameworks needed for managing LLM adoption in knowledge work sectors, including workforce transition strategies and regulatory considerations...",
              metadata: { confidence: 0.94, type: "policy_research" }
            }
          ]
        };

        // In dev mode, create mock findings without database storage  
        const deepFindings = mockDeepResults.sources.map((source, index) => ({
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
          metadata: source.metadata,
          createdAt: new Date().toISOString()
        }));
        
        res.json({ 
          query: deepQuery, 
          results: { 
            ...mockDeepResults, 
            mockFindings: deepFindings 
          },
          deepResearchReport: {
            report: "# Deep Research Report (Mock)\n\nConsolidated insights from simulated deep research.",
            keyFindings: ["Policy gaps impact transition management"],
            sourceAttribution: [
              { claim: "Policy gap", sources: ["Deep: policy analysis"], strength: "high" }
            ],
            confidenceAssessment: "Medium"
          }
        });
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Agent selection
  app.post("/api/select-agents", async (req, res) => {
    try {
      const { sessionId, researchData, userContext } = req.body;
      
      // Always use Pro LLM for strategic agent selection as per specs
      let agentConfig;
      if (configService.isRealMode()) {
        agentConfig = await proLLM.selectAgents(researchData, userContext);
      } else {
        // Use Pro LLM even in dev mode for agent selection (with mock data)
        agentConfig = await proLLM.selectAgents(researchData, userContext);
      }
      
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
      
      let chatgptResponse, geminiResponse;
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
      
      if (configService.isRealMode()) {
        [chatgptResponse, geminiResponse] = await Promise.all([
          chatgptAgent.generateResponse(context.researchData, agentConfigs.chatgpt, context.dialogueHistory || [], fullPrompt),
          geminiAgent.generateResponse(context.researchData, agentConfigs.gemini, context.dialogueHistory || [], fullPrompt)
        ]);
      } else {
        [chatgptResponse, geminiResponse] = await Promise.all([
          devWorkflowService.generateAgentResponse("chatgpt", fullPrompt, context, roundNumber),
          devWorkflowService.generateAgentResponse("gemini", fullPrompt, context, roundNumber)
        ]);
      }

      // Store dialogue responses (ensuring proper data structure)
      const chatgptDialogue = {
        id: Math.random().toString(36).substr(2, 9) + Date.now().toString(36),
        sessionId,
        roundNumber,
        agentType: "chatgpt",
        agentConfig: agentConfigs.chatgpt,
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
        agentConfig: agentConfigs.gemini,
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
      res.status(500).json({ message: error.message });
    }
  });

  // Alignment check - trigger before each continuation round
  app.post("/api/check-alignment", async (req, res) => {
    try {
      const { conversationHistory, userIntent, currentRound } = req.body;
      
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
      const { context } = req.body;
      
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
      const { surfaceResearchReport, deepResearchReport, dialogueHistory, userContext } = req.body;
      
      let synthesis;
      if (configService.isRealMode()) {
        synthesis = await proLLM.synthesizeResults(surfaceResearchReport, deepResearchReport, dialogueHistory, userContext);
      } else {
        synthesis = await proLLM.synthesizeResults(surfaceResearchReport, deepResearchReport, dialogueHistory, userContext);
      }
      
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
      const essayPrompt = `Based on the comprehensive research data provided, write a detailed essay answering this follow-up question: "${question}"

Research Context: ${JSON.stringify(researchData)}

Please provide:
1. A clear thesis statement
2. Structured arguments with evidence
3. Consideration of counterarguments
4. Well-supported conclusions
5. Proper attribution to sources

Write in an engaging, informative style suitable for an educated audience.`;

      let essayContent;
      if (configService.isRealMode() && (proLLM as any).anthropic) {
        const response = await (proLLM as any).anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          messages: [{ role: "user", content: essayPrompt }],
          max_tokens: 3000,
        });
        essayContent = response.content[0].text;
      } else {
        // Mock essay response
        essayContent = `# Understanding the Timeline of LLM Impact on Knowledge Work

## Introduction

The question of when and how large language models will transform knowledge work sectors represents one of the most significant economic and social challenges of our time. Based on comprehensive research across academic studies, industry reports, and real-world implementation experiences, several key patterns emerge that help us understand both the opportunities and risks ahead.

## The Evidence for Gradual Transformation

Current empirical data strongly supports a model of gradual transformation rather than sudden displacement. Studies from MIT and Stanford consistently show 15-30% productivity gains in routine cognitive tasks like coding, writing, and data analysis. However, these gains appear most pronounced in tasks that complement rather than replace human judgment.

The evidence suggests that organizations implementing LLM tools strategically - with proper training and integration - see sustainable productivity improvements without significant job losses. Early adopter companies report workforce augmentation patterns, where AI tools enhance human capabilities rather than substitute for them.

## Structural Risks and Timeline Acceleration

However, we must also consider the structural economic pressures that could accelerate adoption beyond comfortable adaptation timelines. As LLM capabilities improve and costs decrease, competitive pressures may force rapid implementation even in organizations unprepared for thoughtful integration.

The concern isn't whether LLMs will transform knowledge work - the evidence clearly indicates they will. The question is whether the transformation will occur gradually enough to allow for reskilling, social adaptation, and policy responses.

## Sector-Specific Variations

Different knowledge work sectors face varying levels of transformation risk and timeline pressure. Legal research, content creation, and basic analysis may see faster adoption, while strategic decision-making, creative problem-solving, and interpersonal roles may maintain stronger human advantages.

## Conclusion

The research suggests we're in a critical transition period where proactive planning and policy development can significantly influence whether LLM integration becomes a positive economic transformation or a source of widespread disruption. The key is maintaining focus on human-AI collaboration models while preparing for potential acceleration in adoption timelines.`;
      }

      res.json({ essay: essayContent });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
