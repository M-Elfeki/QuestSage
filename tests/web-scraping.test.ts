import { describe, test, expect, beforeAll } from 'vitest';
import { WebScrapingService } from '../server/services/search';
import { configService } from '../server/services/config';

describe('WebScrapingService', () => {
  let webService: WebScrapingService;

  beforeAll(() => {
    // Force real mode for testing actual web scraping
    configService.setMode('prod');
    webService = new WebScrapingService();
  });

  test('should scrape web and return real results (not mock data)', async () => {
    const query = 'machine learning artificial intelligence';
    const count = 5;
    
    const results = await webService.search(query, count);
    
    // Basic structure validation
    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(count);
    
    // Validate each result structure
    for (const result of results) {
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('source', 'web');
      expect(result).toHaveProperty('relevanceScore');
      expect(result).toHaveProperty('metadata');
      
      // Validate types
      expect(typeof result.id).toBe('string');
      expect(typeof result.title).toBe('string');
      expect(typeof result.content).toBe('string');
      expect(typeof result.url).toBe('string');
      expect(typeof result.relevanceScore).toBe('number');
      expect(typeof result.metadata).toBe('object');
      
      // Validate content is not empty and meaningful
      expect(result.title.trim()).not.toBe('');
      expect(result.content.trim()).not.toBe('');
      expect(result.url.trim()).not.toBe('');
      expect(result.title.length).toBeGreaterThan(5);
      expect(result.content.length).toBeGreaterThan(20);
      
      // Validate URL format (real URLs, not example.com)
      expect(result.url).toMatch(/^https?:\/\//);
      expect(result.url).not.toMatch(/example\.com/);
      
      // Validate relevance score range
      expect(result.relevanceScore).toBeGreaterThanOrEqual(60);
      expect(result.relevanceScore).toBeLessThanOrEqual(100);
      
      // Validate metadata structure specific to web scraping
      expect(result.metadata).toHaveProperty('domain');
      expect(result.metadata).toHaveProperty('contentLength');
      expect(result.metadata).toHaveProperty('scrapedAt');
      
      // Validate metadata types and values
      expect(typeof result.metadata.domain).toBe('string');
      expect(typeof result.metadata.contentLength).toBe('number');
      expect(typeof result.metadata.scrapedAt).toBe('string');
      
      // Validate domain is a real domain (not example.com)
      expect(result.metadata.domain).not.toBe('example.com');
      expect(result.metadata.domain).toMatch(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/);
      
      // Validate content length makes sense
      expect(result.metadata.contentLength).toBeGreaterThan(20);
      expect(result.metadata.contentLength).toBeLessThan(10000);
      
      // Validate scraped timestamp is recent (within last hour)
      const scrapedTime = new Date(result.metadata.scrapedAt);
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      expect(scrapedTime.getTime()).toBeGreaterThan(oneHourAgo.getTime());
      expect(scrapedTime.getTime()).toBeLessThanOrEqual(now.getTime());
      
      // Validate content is not from mock data patterns
      expect(result.title).not.toMatch(/MIT Study.*LLM Impact/);
      expect(result.title).not.toMatch(/McKinsey Report.*AI Employment/);
      expect(result.content).not.toMatch(/Recent studies show that artificial intelligence is transforming/);
      expect(result.content).not.toMatch(/Organizations worldwide are implementing machine learning/);
    }
  }, 60000); // Longer timeout for web scraping

  test('should return results from web scraping (not mock data)', async () => {
    const query = 'large language models ChatGPT productivity';
    const count = 3;
    
    const results = await webService.search(query, count);
    
    expect(results).toBeDefined();
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(count);
    
    // Verify results are not mock data
    for (const result of results) {
      expect(result.url).not.toMatch(/example\.com/);
      expect(result.metadata.domain).not.toBe('example.com');
      
      // Should have real web domains
      expect(result.metadata.domain).toMatch(/\./); // Contains dot like real domains
      expect(result.url).toMatch(/^https?:\/\//); // Real URLs
      
      // Should have scraped content
      expect(result.content.length).toBeGreaterThan(10);
      expect(result.title.length).toBeGreaterThan(3);
    }
    
    console.log(`Web scraping returned ${results.length} results from: ${[...new Set(results.map(r => r.metadata.domain))].join(', ')}`);
  }, 60000);

  test('should return results from web scraping sources', async () => {
    const query = 'artificial intelligence research';
    const count = 5;
    
    const results = await webService.search(query, count);
    
    expect(results).toBeDefined();
    expect(results.length).toBeGreaterThan(0);
    
    // Check for web scraping functionality
    const domains = results.map(r => r.metadata.domain);
    const uniqueDomains = new Set(domains);
    
    console.log(`Found domains: ${Array.from(uniqueDomains).join(', ')}`);
    
    // Should have at least one real domain
    expect(uniqueDomains.size).toBeGreaterThan(0);
    
    // All domains should be real (not example.com)
    for (const domain of uniqueDomains) {
      expect(domain).not.toBe('example.com');
      expect(domain).toMatch(/\./); // Should contain a dot
    }
  }, 60000);

  test('should handle empty or invalid queries gracefully', async () => {
    const emptyResults = await webService.search('', 5);
    expect(emptyResults).toBeDefined();
    expect(Array.isArray(emptyResults)).toBe(true);
    expect(emptyResults.length).toBe(0);
    
    const whitespaceResults = await webService.search('   ', 5);
    expect(whitespaceResults).toBeDefined();
    expect(Array.isArray(whitespaceResults)).toBe(true);
    expect(whitespaceResults.length).toBe(0);
  }, 30000);

  test('should respect count parameter', async () => {
    const query = 'deep learning neural networks';
    const count = 2;
    
    const results = await webService.search(query, count);
    
    expect(results).toBeDefined();
    expect(results.length).toBeLessThanOrEqual(count);
  }, 60000);

  test('should handle special characters in query', async () => {
    const query = 'AI & ML "machine learning" (research)';
    const count = 3;
    
    const results = await webService.search(query, count);
    
    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    // Should handle special characters without errors
  }, 60000);

  test('should validate content quality', async () => {
    const query = 'computer vision applications';
    const count = 4;
    
    const results = await webService.search(query, count);
    
    for (const result of results) {
      // Content should be substantial and meaningful
      expect(result.content.length).toBeGreaterThan(20);
      
      // Should not contain common error patterns
      expect(result.content.toLowerCase()).not.toMatch(/404|not found|error|loading/);
      
      // Should have actual words, not just special characters
      const wordCount = result.content.split(/\s+/).filter(word => /\w/.test(word)).length;
      expect(wordCount).toBeGreaterThan(5);
      
      // Title and content should not be identical
      expect(result.title).not.toBe(result.content);
    }
  }, 60000);

  test('should return results sorted by relevance', async () => {
    const query = 'machine learning algorithms';
    const count = 4;
    
    const results = await webService.search(query, count);
    
    if (results.length > 1) {
      // Check that relevance scores are in descending order
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].relevanceScore).toBeGreaterThanOrEqual(results[i + 1].relevanceScore);
      }
    }
  }, 60000);

  test('should handle network timeouts and errors gracefully', async () => {
    // Test with a very long query that might cause issues
    const longQuery = 'a'.repeat(500);
    const count = 3;
    
    const results = await webService.search(longQuery, count);
    
    // Should not throw error and return array (possibly empty)
    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
  }, 60000);

  test('should not use mock data in production mode', async () => {
    // Ensure we're in production mode
    configService.setMode('prod');
    
    const query = 'artificial intelligence trends';
    const count = 3;
    
    const results = await webService.search(query, count);
    
    // Verify results are NOT mock data
    for (const result of results) {
      // Mock data patterns to avoid
      expect(result.url).not.toMatch(/example\.com/);
      expect(result.title).not.toMatch(/AI in the Workplace: Latest Research Findings/);
      expect(result.title).not.toMatch(/Machine Learning Applications in Knowledge Work/);
      expect(result.title).not.toMatch(/Future of Work: Human-AI Collaboration/);
      expect(result.metadata.domain).not.toBe('example.com');
      
      // Real scraped data should have proper timestamps
      const scrapedTime = new Date(result.metadata.scrapedAt);
      expect(scrapedTime.getTime()).toBeGreaterThan(Date.now() - 60 * 60 * 1000); // Within last hour
    }
  }, 60000);

  test('should work with fallback mode when services fail', async () => {
    // This test verifies the system handles failures gracefully
    const query = 'quantum computing applications';
    const count = 3;
    
    const results = await webService.search(query, count);
    
    // Should always return valid array structure, even if some sources fail
    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    
    // If results are returned, they should be valid
    for (const result of results) {
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('source', 'web');
      expect(result).toHaveProperty('relevanceScore');
      expect(result).toHaveProperty('metadata');
    }
  }, 60000);
});
