// Test environment setup
// Set up API credentials for testing
export function setupTestEnv() {
  // Reddit API credentials from reddit_collector.py
  if (!process.env.REDDIT_CLIENT_ID) {
    process.env.REDDIT_CLIENT_ID = "YDjQXJJOMfXc5PHFPlVOaA";
  }
  
  if (!process.env.REDDIT_CLIENT_SECRET) {
    process.env.REDDIT_CLIENT_SECRET = "LyRlnZS-BsDiStdDzx-gPrL8SHJZjg";
  }
  
  if (!process.env.REDDIT_USER_AGENT) {
    process.env.REDDIT_USER_AGENT = "QuestSage/1.0 (Test)";
  }
  
  // LLM API credentials for testing (mock values)
  if (!process.env.GEMINI_API_KEY) {
    process.env.GEMINI_API_KEY = "test-gemini-api-key-for-testing";
  }
  
  if (!process.env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = "test-openai-api-key-for-testing";
  }
  
  if (!process.env.ANTHROPIC_API_KEY) {
    process.env.ANTHROPIC_API_KEY = "test-anthropic-api-key-for-testing";
  }
  
  if (!process.env.PERPLEXITY_API_KEY) {
    process.env.PERPLEXITY_API_KEY = "test-perplexity-api-key-for-testing";
  }
  
  // Search API credentials
  if (!process.env.GOOGLE_SEARCH_API_KEY) {
    process.env.GOOGLE_SEARCH_API_KEY = "test-google-search-api-key";
  }
  
  if (!process.env.GOOGLE_SEARCH_ENGINE_ID) {
    process.env.GOOGLE_SEARCH_ENGINE_ID = "test-google-search-engine-id";
  }
  
  // Test mode configuration
  if (!process.env.MAX_DIALOGUE_ROUNDS) {
    process.env.MAX_DIALOGUE_ROUNDS = "7";
  }
}
