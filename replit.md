# Multi-Agent Research & Synthesis System

## Overview

Quest is a multi-agent research and synthesis system designed to generate high-quality answers to complex, ambiguous problems through orchestrated AI agents. The system processes research queries through structured phases including intent clarification, multi-tier research, agent dialogue, and final synthesis. It targets complex problems like market predictions, scientific questions, and strategic decisions requiring multiple perspectives and deep analysis.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Components**: Shadcn/ui component library with Radix UI primitives for consistent, accessible interface components
- **Styling**: Tailwind CSS with custom CSS variables for theming and responsive design
- **State Management**: TanStack Query (React Query) for server state management and API interactions
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod validation for type-safe form management

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **API Design**: RESTful API with structured route handlers
- **Processing Pipeline**: Multi-stage workflow orchestrating different LLM services and research APIs
- **Storage Interface**: Abstract storage layer with in-memory implementation for development

### Data Storage Solutions
- **Database**: PostgreSQL with Neon serverless database
- **ORM**: Drizzle ORM for type-safe database operations
- **Schema**: Structured tables for users, research sessions, findings, and agent dialogues
- **Sessions**: Research sessions track the complete workflow from query to synthesis
- **Findings**: Research data organized by source type (surface, social, deep) with quality scoring

### LLM Service Architecture
- **Flash LLM**: Fast processing service for intent clarification, research planning, and fact extraction
- **Pro LLM**: Advanced reasoning service for orchestration, agent dialogue management, and synthesis
- **Agent Providers**: External AI services (ChatGPT, Gemini) providing differentiated reasoning approaches
- **Service Pattern**: Abstract service interfaces allowing for easy provider switching and testing

### Research Pipeline
- **Multi-Tier Research**: Surface web, social media, and deep research phases
- **Source Integration**: Google, arXiv, Reddit, Twitter APIs for comprehensive data gathering
- **Quality Scoring**: Relevance and quality metrics for research findings
- **Evidence Synthesis**: Structured approach to combining contradictory and supporting evidence

### Agent Dialogue System
- **Differentiated Agents**: ChatGPT (inductive reasoning) and Gemini (deductive reasoning) with configurable approaches
- **Dialogue Management**: Round-based dialogue with evaluation criteria for continuation
- **Context Sharing**: Agents receive research data and build upon previous dialogue rounds
- **Synthesis Integration**: Dialogue outcomes feed into final synthesis generation

## External Dependencies

### Database Services
- **Neon Database**: Serverless PostgreSQL hosting with connection pooling
- **Drizzle Kit**: Database migrations and schema management

### AI/LLM Services
- **ChatGPT API**: Agent provider for inductive reasoning approaches
- **Gemini API**: Agent provider for deductive reasoning approaches
- **Deep Sonar API**: Perplexity's deep research agent for targeted investigation

### Search and Research APIs
- **Google Search API**: Surface web research and fact gathering
- **arXiv API**: Academic paper search and scientific literature access
- **Reddit API**: Social media insights and community perspectives
- **Twitter API**: Real-time social sentiment and expert opinions

### Development and Deployment
- **Replit Environment**: Development platform with live reload and collaborative features
- **Vite Development Server**: Fast development builds with HMR
- **TypeScript Compiler**: Static type checking and ES module compilation
- **PostCSS**: CSS processing with Tailwind CSS integration

### UI and Styling
- **Radix UI**: Accessible primitive components for complex UI patterns
- **Lucide React**: Icon library for consistent iconography
- **Tailwind CSS**: Utility-first CSS framework with custom design system
- **Class Variance Authority**: Type-safe CSS variant management

### Form and Data Handling
- **React Hook Form**: Performant form handling with minimal re-renders
- **Zod**: Runtime type validation and schema definition
- **Date-fns**: Date manipulation and formatting utilities