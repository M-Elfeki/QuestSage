# QuestSage LLM Integration Tests

This directory contains comprehensive unit tests for the LLM integrations in the QuestSage Multi-Agent Research & Synthesis System.

## Test Files Overview

### 1. `llm-integration.test.ts`
**Purpose**: Core LLM service functionality testing

**Coverage**:
- ✅ **FlashLLMService**: Intent clarification, search terms generation, fact extraction
- ✅ **ProLLMService**: Research orchestration, agent selection, dialogue evaluation, synthesis
- ✅ **ChatGPTAgent**: Agent response generation with inductive reasoning
- ✅ **GeminiAgent**: Agent response generation with deductive reasoning
- ✅ **Mode Switching**: Development vs Production model routing
- ✅ **Error Handling**: API timeouts, malformed responses, rate limiting
- ✅ **Response Format**: Consistent structure across all agents and services

**Key Test Scenarios**:
- Development mode uses Gemini Flash 2.5 for all services
- Production mode uses correct model assignments per specification
- Source attribution and speculation flag extraction
- Graceful handling of missing API keys

### 2. `model-specific.test.ts`
**Purpose**: Model-specific behavior and parameter validation

**Coverage**:
- ✅ **Gemini Flash 2.5**: Parameter handling, response parsing, edge cases
- ✅ **Gemini Pro 2.5**: Production configuration, error responses
- ✅ **Claude Sonnet**: Flash LLM production usage, content type validation
- ✅ **Claude Opus**: Pro LLM production usage, thinking mode capabilities, token limits
- ✅ **OpenAI o3**: ChatGPT agent production usage, system prompts, usage tracking
- ✅ **Agent Differentiation**: Distinct prompting strategies in development mode

**Key Test Scenarios**:
- JSON response parsing with markdown code blocks and whitespace
- Model-specific error handling and rate limiting
- Token limit configuration for different operations
- Differentiated agent personalities in development mode

### 3. `workflow-integration.test.ts`
**Purpose**: End-to-end workflow testing and cross-model integration

**Coverage**:
- ✅ **Complete Dev Workflow**: Full pipeline using Gemini Flash 2.5
- ✅ **Complete Production Workflow**: Full pipeline with correct model routing
- ✅ **Cross-Model Integration**: Data consistency across different models
- ✅ **Mode Switching**: Mid-workflow mode changes
- ✅ **Concurrent Operations**: Multiple models running simultaneously
- ✅ **Performance Testing**: Response times and reliability
- ✅ **Configuration Validation**: API key management and model assignments

**Key Test Scenarios**:
- Data flow from Flash LLM → Pro LLM → Agents
- Agent differentiation maintained throughout multi-round dialogues
- Error consistency across all models
- Configuration validation per specification requirements

## Model Assignments Tested

### Development Mode
| Service | Model | Purpose |
|---------|-------|---------|
| Flash LLM | Gemini Flash 2.5 | Intent clarification, search terms, fact extraction |
| Pro LLM | Gemini Flash 2.5 | Research orchestration, agent selection, synthesis |
| ChatGPT Agent | Gemini Flash 2.5 | Inductive reasoning with empirical focus |
| Gemini Agent | Gemini Flash 2.5 | Deductive reasoning with theoretical focus |

### Production Mode
| Service | Model | Purpose |
|---------|-------|---------|
| Flash LLM | Claude Sonnet | Fast processing for intent clarification |
| Pro LLM | Claude Opus | Advanced reasoning with thinking mode |
| ChatGPT Agent | OpenAI o3 | Maximum quality inductive reasoning |
| Gemini Agent | Gemini Pro 2.5 | Maximum quality deductive reasoning |

## Running the Tests

### All LLM Tests
```bash
npm run test:llm
```

### Watch Mode (for development)
```bash
npm run test:llm:watch
```

### Individual Test Files
```bash
# Core LLM integration
npx vitest run tests/llm-integration.test.ts

# Model-specific behavior
npx vitest run tests/model-specific.test.ts

# Workflow integration
npx vitest run tests/workflow-integration.test.ts
```

### All Tests with Coverage
```bash
npm run test -- --coverage
```

## Test Environment Setup

The tests use mock API responses to avoid making real API calls. Environment variables are automatically set up in `tests/test-env.ts`:

- `GEMINI_API_KEY`: Mock key for Gemini Flash 2.5 and Pro 2.5
- `OPENAI_API_KEY`: Mock key for OpenAI o3
- `ANTHROPIC_API_KEY`: Mock key for Claude Sonnet and Opus
- `PERPLEXITY_API_KEY`: Mock key for Deep Sonar API
- `MAX_DIALOGUE_ROUNDS`: Set to 7 per specification

## Key Features Validated

### ✅ **Model Routing Compliance**
- Development mode correctly uses Gemini Flash 2.5 throughout
- Production mode uses specification-compliant model assignments
- Proper fallback to mock data when API keys are missing

### ✅ **Agent Differentiation**
- ChatGPT Agent: Inductive pattern analysis, empirical data focus
- Gemini Agent: Deductive framework analysis, theoretical challenger
- Distinct prompting strategies while using the same underlying model in dev mode

### ✅ **Response Quality**
- Consistent response structure across all agents
- Proper source attribution parsing (`[Surface: Source]`, `[Deep: Source]`)
- Speculation flag detection (`[SPECULATION]`)
- Confidence scoring and metadata tracking

### ✅ **Error Handling**
- Graceful API timeout handling
- Malformed JSON response recovery
- Rate limiting error management
- Network failure resilience

### ✅ **Integration Reliability**
- Data consistency across multi-stage workflows
- Concurrent operation support
- Mode switching without state corruption
- Configuration validation and enforcement

## Test Configuration

Tests are configured in `vitest.config.ts` with:
- 30-second timeout for API operations
- Node.js environment simulation
- Automatic setup file loading
- Coverage reporting with v8 provider
- Path aliases for clean imports

## Debugging Tests

To debug failing tests:

1. **Enable verbose output**:
   ```bash
   npx vitest run --reporter=verbose tests/llm-integration.test.ts
   ```

2. **Run specific test**:
   ```bash
   npx vitest run -t "should use Claude Opus for production"
   ```

3. **Watch mode for development**:
   ```bash
   npx vitest tests/model-specific.test.ts
   ```

## Adding New Tests

When adding new LLM functionality:

1. **Add service tests** to `llm-integration.test.ts`
2. **Add model-specific tests** to `model-specific.test.ts`
3. **Add workflow tests** to `workflow-integration.test.ts`
4. **Update this README** with new coverage information

### Test Template
```typescript
test('should [describe expected behavior]', async () => {
  // Setup
  configService.setMode('dev'); // or 'prod'
  const service = new YourService();
  
  // Mock API response
  const mockResponse = { /* your mock data */ };
  const mockFunction = vi.fn().mockResolvedValue(mockResponse);
  (service as any).apiClient = { method: mockFunction };
  
  // Execute
  const result = await service.yourMethod(testData);
  
  // Verify
  expect(mockFunction).toHaveBeenCalledWith(
    expect.objectContaining({ model: 'expected-model-name' })
  );
  expect(result).toHaveProperty('expectedProperty');
});
```

## Specification Compliance

These tests ensure the QuestSage application complies with the Multi-Agent Research & Synthesis System specifications:

- ✅ **Stage 1**: Intent Clarification & Research Setup
- ✅ **Stage 2**: Three-Tier Research & Fact Compilation  
- ✅ **Stage 3**: Agent Selection & Dialogue Initialization
- ✅ **Stage 4**: Iterative Dialogue & Refinement
- ✅ **Stage 5**: Final Synthesis

The test suite validates that all LLM integrations work correctly according to the specified model assignments and ensure the system maintains high reliability and performance standards.
