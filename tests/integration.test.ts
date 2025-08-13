import { describe, test, expect, beforeAll } from 'vitest';
import { WebScrapingService, ArxivSearchService, RedditSearchService } from '../server/services/search';
import { configService } from '../server/services/config';

describe('Search Services Integration', () => {
  let webService: WebScrapingService;
  let arxivService: ArxivSearchService;
  let redditService: RedditSearchService;

  beforeAll(() => {
    // Force real mode for testing actual APIs
    configService.setMode('prod');
    webService = new WebScrapingService();
    arxivService = new ArxivSearchService();
    redditService = new RedditSearchService();
  });

  test('should work together to provide comprehensive search results', async () => {
    const query = 'machine learning artificial intelligence';
    const count = 3;

    // Test all services in parallel
    const [webResults, arxivResults, redditResults] = await Promise.all([
      webService.search(query, count),
      arxivService.search(query, count),
      redditService.search(query, count)
    ]);

    // All services should return valid arrays
    expect(Array.isArray(webResults)).toBe(true);
    expect(Array.isArray(arxivResults)).toBe(true);
    expect(Array.isArray(redditResults)).toBe(true);

    // arXiv and web scraping should return results (no credentials needed)
    expect(arxivResults.length).toBeGreaterThan(0);
    expect(webResults.length).toBeGreaterThan(0);

    // Reddit may return empty arrays if API blocked
    // But should still return valid structure

    // Verify all results have consistent structure
    const allResults = [...webResults, ...arxivResults, ...redditResults];
    
    for (const result of allResults) {
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('source');
      expect(result).toHaveProperty('relevanceScore');
      expect(result).toHaveProperty('metadata');
      
      expect(typeof result.id).toBe('string');
      expect(typeof result.title).toBe('string');
      expect(typeof result.content).toBe('string');
      expect(typeof result.source).toBe('string');
      expect(typeof result.relevanceScore).toBe('number');
      expect(typeof result.metadata).toBe('object');
      
      // Source should be one of the expected values
      expect(['web', 'arxiv', 'reddit']).toContain(result.source);
    }
  }, 60000);

  test('should handle different query types appropriately', async () => {
    const academicQuery = 'neural networks deep learning';
    const practicalQuery = 'ChatGPT workplace productivity';
    
    // arXiv should work well with academic queries
    const arxivResults = await arxivService.search(academicQuery, 3);
    expect(arxivResults.length).toBeGreaterThan(0);
    
    // Check that arXiv results are academic in nature
    for (const result of arxivResults) {
      expect(result.source).toBe('arxiv');
      expect(result.url).toMatch(/arxiv\.org/);
      expect(result.metadata).toHaveProperty('authors');
      expect(result.metadata).toHaveProperty('categories');
    }
    
    // All services should handle practical queries
    const [webPractical, redditPractical] = await Promise.all([
      webService.search(practicalQuery, 2),
      redditService.search(practicalQuery, 2)
    ]);
    
    expect(Array.isArray(webPractical)).toBe(true);
    expect(Array.isArray(redditPractical)).toBe(true);
  }, 30000);

  test('should maintain service isolation and error handling', async () => {
    const query = 'test query';
    
    // Test that one service failing doesn't affect others
    const results = await Promise.allSettled([
      webService.search(query, 2),
      arxivService.search(query, 2),
      redditService.search(query, 2)
    ]);
    
    // All promises should fulfill (not reject)
    for (const result of results) {
      expect(result.status).toBe('fulfilled');
      if (result.status === 'fulfilled') {
        expect(Array.isArray(result.value)).toBe(true);
      }
    }
  }, 30000);

  test('should provide appropriate fallback behavior', async () => {
    // Test with Reddit credentials missing/invalid  
    const originalRedditId = process.env.REDDIT_CLIENT_ID;
    
    // Temporarily remove Reddit credentials
    delete process.env.REDDIT_CLIENT_ID;
    
    const tempReddit = new RedditSearchService();
    
    const [webResults, redditFallback] = await Promise.all([
      webService.search('test', 2), // Web scraping should work without credentials
      tempReddit.search('test', 2)
    ]);
    
    // Web scraping should work without any credentials
    expect(Array.isArray(webResults)).toBe(true);
    expect(webResults.length).toBeGreaterThan(0); // Real web scraping results
    
    // Reddit should fall back to mock data
    expect(Array.isArray(redditFallback)).toBe(true);
    expect(redditFallback.length).toBeGreaterThan(0); // Mock data
    
    // Restore credentials
    if (originalRedditId) process.env.REDDIT_CLIENT_ID = originalRedditId;
  }, 15000);
});
