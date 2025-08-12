import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertResearchSessionSchema, insertResearchFindingSchema, insertAgentDialogueSchema } from "@shared/schema";
import { FlashLLMService, ProLLMService } from "./services/llm";
import { SearchService } from "./services/search";
import { AgentService } from "./services/agents";

const flashLLM = new FlashLLMService();
const proLLM = new ProLLMService();
const searchService = new SearchService();
const agentService = new AgentService();

export async function registerRoutes(app: Express): Promise<Server> {
  // Research Session routes
  app.post("/api/research-sessions", async (req, res) => {
    try {
      const sessionData = insertResearchSessionSchema.parse(req.body);
      const session = await storage.createResearchSession(sessionData);
      res.json(session);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/research-sessions/:id", async (req, res) => {
    try {
      const session = await storage.getResearchSession(req.params.id);
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
      const session = await storage.updateResearchSession(req.params.id, req.body);
      res.json(session);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Intent clarification
  app.post("/api/clarify-intent", async (req, res) => {
    try {
      const { query } = req.body;
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
      
      // Generate search terms
      const searchPlan = await flashLLM.generateSearchTerms(clarifiedIntent);
      
      // Execute parallel searches
      const [googleResults, arxivResults, redditResults, twitterResults] = await Promise.all([
        searchService.searchGoogle(searchPlan.surfaceTerms),
        searchService.searchArxiv(searchPlan.surfaceTerms),
        searchService.searchReddit(["MachineLearning", "artificial", "jobs"], searchPlan.socialTerms),
        searchService.searchTwitter(["@researcher123", "@ai_expert"], searchPlan.socialTerms)
      ]);

      // Store research findings
      const allResults = [
        ...googleResults.results.map(r => ({ ...r, source: "google", sourceType: "surface" })),
        ...arxivResults.results.map(r => ({ ...r, source: "arxiv", sourceType: "surface" })),
        ...redditResults.results.map(r => ({ ...r, source: "reddit", sourceType: "social" })),
        ...twitterResults.results.map(r => ({ ...r, source: "twitter", sourceType: "social" }))
      ];

      const findings = [];
      for (const result of allResults) {
        const finding = await storage.createResearchFinding({
          sessionId,
          source: result.source,
          sourceType: result.sourceType,
          title: result.title,
          url: result.url,
          content: result.content,
          snippet: result.snippet,
          relevanceScore: Math.floor(Math.random() * 40) + 60, // Mock scoring
          qualityScore: Math.floor(Math.random() * 30) + 70,
          isContradictory: Math.random() < 0.1,
          metadata: result.metadata
        });
        findings.push(finding);
      }

      // Extract facts
      const factExtraction = await flashLLM.extractFacts(allResults);
      
      // Analyze findings
      const analysis = await proLLM.analyzeResearchFindings(findings);
      
      res.json({
        searchResults: {
          google: googleResults,
          arxiv: arxivResults,
          reddit: redditResults,
          twitter: twitterResults
        },
        factExtraction,
        analysis,
        findings
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Deep research
  app.post("/api/deep-research", async (req, res) => {
    try {
      const { sessionId, analysis } = req.body;
      
      const deepQuery = await flashLLM.generateDeepResearchQuery(analysis);
      const deepResults = await searchService.callDeepSonar(deepQuery);
      
      // Store deep research findings
      for (const source of deepResults.sources) {
        await storage.createResearchFinding({
          sessionId,
          source: "deepSonar",
          sourceType: "deep",
          title: source.title,
          url: source.url,
          content: source.content,
          snippet: source.snippet,
          relevanceScore: 95,
          qualityScore: 90,
          isContradictory: false,
          metadata: source.metadata
        });
      }
      
      res.json({ query: deepQuery, results: deepResults });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Agent selection
  app.post("/api/select-agents", async (req, res) => {
    try {
      const { researchData, userContext } = req.body;
      const agentConfig = await proLLM.selectAgents(researchData, userContext);
      res.json(agentConfig);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Agent dialogue
  app.post("/api/agent-dialogue", async (req, res) => {
    try {
      const { sessionId, roundNumber, agentConfigs, context } = req.body;
      
      const [chatgptResponse, geminiResponse] = await Promise.all([
        agentService.callChatGPT("Analyze the research data", context, agentConfigs.chatgpt),
        agentService.callGemini("Analyze the research data", context, agentConfigs.gemini)
      ]);

      // Store dialogue responses
      const chatgptDialogue = await storage.createAgentDialogue({
        sessionId,
        roundNumber,
        agentType: "chatgpt",
        agentConfig: agentConfigs.chatgpt,
        message: chatgptResponse.response,
        reasoning: chatgptResponse.reasoning,
        confidenceScore: chatgptResponse.confidence,
        sources: chatgptResponse.sources
      });

      const geminiDialogue = await storage.createAgentDialogue({
        sessionId,
        roundNumber,
        agentType: "gemini", 
        agentConfig: agentConfigs.gemini,
        message: geminiResponse.response,
        reasoning: geminiResponse.reasoning,
        confidenceScore: geminiResponse.confidence,
        sources: geminiResponse.sources
      });

      res.json({
        chatgpt: chatgptDialogue,
        gemini: geminiDialogue
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Dialogue evaluation
  app.post("/api/evaluate-dialogue", async (req, res) => {
    try {
      const { context } = req.body;
      const evaluation = await proLLM.evaluateDialogueRound(context);
      res.json(evaluation);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Final synthesis
  app.post("/api/synthesize", async (req, res) => {
    try {
      const { researchData, dialogueHistory } = req.body;
      const synthesis = await proLLM.synthesizeResults(researchData, dialogueHistory);
      res.json(synthesis);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get research findings
  app.get("/api/research-sessions/:id/findings", async (req, res) => {
    try {
      const findings = await storage.getResearchFindings(req.params.id);
      res.json(findings);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get agent dialogues
  app.get("/api/research-sessions/:id/dialogues", async (req, res) => {
    try {
      const dialogues = await storage.getAgentDialogues(req.params.id);
      res.json(dialogues);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
