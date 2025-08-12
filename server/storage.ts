import { type User, type InsertUser, type ResearchSession, type InsertResearchSession, type ResearchFinding, type InsertResearchFinding, type AgentDialogue, type InsertAgentDialogue } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Research Session methods
  createResearchSession(session: InsertResearchSession): Promise<ResearchSession>;
  getResearchSession(id: string): Promise<ResearchSession | undefined>;
  updateResearchSession(id: string, updates: Partial<ResearchSession>): Promise<ResearchSession>;
  getUserResearchSessions(userId: string): Promise<ResearchSession[]>;

  // Research Findings methods
  createResearchFinding(finding: InsertResearchFinding): Promise<ResearchFinding>;
  getResearchFindings(sessionId: string): Promise<ResearchFinding[]>;
  getResearchFindingsBySource(sessionId: string, source: string): Promise<ResearchFinding[]>;

  // Agent Dialogue methods
  createAgentDialogue(dialogue: InsertAgentDialogue): Promise<AgentDialogue>;
  getAgentDialogues(sessionId: string): Promise<AgentDialogue[]>;
  getAgentDialoguesByRound(sessionId: string, roundNumber: number): Promise<AgentDialogue[]>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private researchSessions: Map<string, ResearchSession>;
  private researchFindings: Map<string, ResearchFinding>;
  private agentDialogues: Map<string, AgentDialogue>;

  constructor() {
    this.users = new Map();
    this.researchSessions = new Map();
    this.researchFindings = new Map();
    this.agentDialogues = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async createResearchSession(insertSession: InsertResearchSession): Promise<ResearchSession> {
    const id = randomUUID();
    const now = new Date();
    const session: ResearchSession = { 
      ...insertSession,
      id,
      status: insertSession.status || "active",
      userId: insertSession.userId || null,
      currentStage: insertSession.currentStage || "intentClarification",
      clarifiedIntent: insertSession.clarifiedIntent || null,
      researchData: insertSession.researchData || null,
      agentConfig: insertSession.agentConfig || null,
      dialogueHistory: insertSession.dialogueHistory || null,
      synthesisResult: insertSession.synthesisResult || null,
      createdAt: now, 
      updatedAt: now 
    };
    this.researchSessions.set(id, session);
    return session;
  }

  async getResearchSession(id: string): Promise<ResearchSession | undefined> {
    return this.researchSessions.get(id);
  }

  async updateResearchSession(id: string, updates: Partial<ResearchSession>): Promise<ResearchSession> {
    const existing = this.researchSessions.get(id);
    if (!existing) {
      throw new Error(`Research session ${id} not found`);
    }
    const updated: ResearchSession = { 
      ...existing, 
      ...updates, 
      updatedAt: new Date() 
    };
    this.researchSessions.set(id, updated);
    return updated;
  }

  async getUserResearchSessions(userId: string): Promise<ResearchSession[]> {
    return Array.from(this.researchSessions.values()).filter(
      (session) => session.userId === userId
    );
  }

  async createResearchFinding(insertFinding: InsertResearchFinding): Promise<ResearchFinding> {
    const id = randomUUID();
    const finding: ResearchFinding = { 
      ...insertFinding,
      id,
      title: insertFinding.title || null,
      content: insertFinding.content || null,
      snippet: insertFinding.snippet || null,
      url: insertFinding.url || null,
      relevanceScore: insertFinding.relevanceScore || null,
      qualityScore: insertFinding.qualityScore || null,
      isContradictory: insertFinding.isContradictory || null,
      metadata: insertFinding.metadata || null,
      createdAt: new Date() 
    };
    this.researchFindings.set(id, finding);
    return finding;
  }

  async getResearchFindings(sessionId: string): Promise<ResearchFinding[]> {
    return Array.from(this.researchFindings.values()).filter(
      (finding) => finding.sessionId === sessionId
    );
  }

  async getResearchFindingsBySource(sessionId: string, source: string): Promise<ResearchFinding[]> {
    return Array.from(this.researchFindings.values()).filter(
      (finding) => finding.sessionId === sessionId && finding.source === source
    );
  }

  async createAgentDialogue(insertDialogue: InsertAgentDialogue): Promise<AgentDialogue> {
    const id = randomUUID();
    const dialogue: AgentDialogue = { 
      ...insertDialogue,
      id,
      agentConfig: insertDialogue.agentConfig || null,
      reasoning: insertDialogue.reasoning || null,
      confidenceScore: insertDialogue.confidenceScore || null,
      sources: insertDialogue.sources || null,
      createdAt: new Date() 
    };
    this.agentDialogues.set(id, dialogue);
    return dialogue;
  }

  async getAgentDialogues(sessionId: string): Promise<AgentDialogue[]> {
    return Array.from(this.agentDialogues.values())
      .filter((dialogue) => dialogue.sessionId === sessionId)
      .sort((a, b) => a.roundNumber - b.roundNumber);
  }

  async getAgentDialoguesByRound(sessionId: string, roundNumber: number): Promise<AgentDialogue[]> {
    return Array.from(this.agentDialogues.values()).filter(
      (dialogue) => dialogue.sessionId === sessionId && dialogue.roundNumber === roundNumber
    );
  }
}

export const storage = new MemStorage();
