import { sql } from "drizzle-orm";
import { pgTable, text, varchar, jsonb, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const researchSessions = pgTable("research_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  query: text("query").notNull(),
  currentStage: varchar("current_stage").notNull().default("intentClarification"),
  status: varchar("status").notNull().default("active"),
  clarifiedIntent: jsonb("clarified_intent"),
  researchData: jsonb("research_data"),
  agentConfig: jsonb("agent_config"),
  dialogueHistory: jsonb("dialogue_history"),
  synthesisResult: jsonb("synthesis_result"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const researchFindings = pgTable("research_findings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => researchSessions.id).notNull(),
  source: varchar("source").notNull(), // 'google', 'arxiv', 'reddit', 'twitter', 'deepSonar'
  sourceType: varchar("source_type").notNull(), // 'surface', 'social', 'deep'
  title: text("title"),
  url: text("url"),
  content: text("content"),
  snippet: text("snippet"),
  relevanceScore: integer("relevance_score"),
  qualityScore: integer("quality_score"),
  isContradictory: boolean("is_contradictory").default(false),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const agentDialogues = pgTable("agent_dialogues", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => researchSessions.id).notNull(),
  roundNumber: integer("round_number").notNull(),
  agentType: varchar("agent_type").notNull(), // 'chatgpt', 'gemini'
  agentConfig: jsonb("agent_config"),
  message: text("message").notNull(),
  reasoning: text("reasoning"),
  confidenceScore: integer("confidence_score"),
  sources: jsonb("sources"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertResearchSessionSchema = createInsertSchema(researchSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertResearchFindingSchema = createInsertSchema(researchFindings).omit({
  id: true,
  createdAt: true,
});

export const insertAgentDialogueSchema = createInsertSchema(agentDialogues).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type ResearchSession = typeof researchSessions.$inferSelect;
export type InsertResearchSession = z.infer<typeof insertResearchSessionSchema>;
export type ResearchFinding = typeof researchFindings.$inferSelect;
export type InsertResearchFinding = z.infer<typeof insertResearchFindingSchema>;
export type AgentDialogue = typeof agentDialogues.$inferSelect;
export type InsertAgentDialogue = z.infer<typeof insertAgentDialogueSchema>;
